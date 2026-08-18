# 智能页面观察检索 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `NeedMoreObservation` 真正驱动 Chrome content script 在本地按 `query/scope/expand/preferredRoles` 检索、排序和裁剪页面节点，使 Agent 在节点很多的页面上仍能逐轮拿到更相关的候选。

**Architecture:** 保持 Agent Core 不依赖 DOM 和 Chrome API，Core 只表达“还需要观察什么”。Background 负责把 Core 的观察请求和候选预算透传给 active tab；content script 建立页面节点索引，在本地完成 scope 过滤、扩展召回、排序和裁剪，再返回可绑定的 `PageModel`。大模型不参与原始 DOM 过滤，只在窄化后的候选上继续规划。

**Tech Stack:** TypeScript, Chrome MV3 message passing, DOM APIs, existing `PageModel`, Vitest + jsdom, Vite build.

## Global Constraints

- Do not depend on a local daemon, backend service, or native messaging host.
- Do not send raw full DOM to the model.
- Planner emits semantic commands only, not DOM indexes or raw coordinates.
- Every meaningful runtime transition writes an `AgentEvent`.
- Side panel receives runtime events in real time when possible, with polling fallback.
- Full auto never means infinite execution; hard budgets still apply.
- Vision is a fallback for insufficient DOM evidence, not a separate planning brain.
- Existing user changes in the working tree must not be reverted.
- Content script must not click, open, expand, or mutate the page during observation retrieval.
- Observation retrieval must keep stable semantic ids for returned controls within one observed DOM snapshot.

---

## File Map

- Modify: `src/shared/protocol.ts`
  - Add observation request fields to `ObservePageRequest`.
- Modify: `src/core/runtime/agent-runtime.ts`
  - Pass `observationRound` and `candidateLimit` to the `observePage` port.
  - Include retrieval metadata in `ObservationReceived` events.
- Modify: `src/background/index.ts`
  - Accept the richer observe port call and forward it to the active tab.
  - Keep fallback page behavior for restricted Chrome pages.
- Modify: `src/content/index.ts`
  - Read `OBSERVE_PAGE` payload and call `observePage(document, options)`.
- Modify: `src/core/observation/page-model.ts`
  - Add optional observation retrieval metadata to `PageModel`.
- Create: `src/adapters/content/page-node-index.ts`
  - Build local observation records and retrieve the best candidates for a request.
- Modify: `src/adapters/content/dom-observer.ts`
  - Keep element records while observing controls/text/forms.
  - Apply smart retrieval before returning `PageModel`.
- Modify: `src/sidepanel/state.ts`
  - Show richer observation details in timeline and downloaded logs.
- Create: `tests/unit/adapters/page-node-index.test.ts`
  - Unit tests for query/scope/expand scoring.
- Modify: `tests/unit/core/agent-runtime.test.ts`
  - Assert runtime forwards observation request and budget metadata.
- Modify: `tests/unit/core/observation-evidence.test.ts`
  - Assert `observePage(document, options)` returns narrowed but bindable page models.

---

### Task 1: Protocol and Runtime Observation Metadata

**Files:**
- Modify: `src/shared/protocol.ts`
- Modify: `src/core/observation/page-model.ts`
- Modify: `src/core/runtime/agent-runtime.ts`
- Modify: `src/background/index.ts`
- Modify: `src/content/index.ts`
- Test: `tests/unit/core/agent-runtime.test.ts`

**Interfaces:**
- Produces: `ObservePageOptions`
- Produces: `PageModel.observation`
- Produces: `AgentRuntimePorts.observePage(request, options)`
- Consumes: existing `NeedMoreObservationRequest`

- [ ] **Step 1: Add a failing runtime test for request forwarding**

Add this test to `tests/unit/core/agent-runtime.test.ts`:

```ts
it("passes smart observation request and candidate budget to the observe port", async () => {
  const store = new MemoryEventStore();
  const observeCalls: Array<{ request?: unknown; options?: unknown }> = [];
  let plans = 0;
  const runtime = new AgentRuntime({
    sessionId: "session-smart-observe",
    taskId: "task-smart-observe",
    observationBudget: {
      initialCandidateLimit: 120,
      expandedCandidateLimit: 320,
      hardCandidateLimit: 600,
      maxObservationRoundsPerStep: 3
    },
    appendEvent: (event) => store.append(event),
    observePage: async (request, options) => {
      observeCalls.push({ request, options });
      return page;
    },
    plan: async () => {
      plans += 1;
      if (plans === 1) {
        return {
          type: "NeedMoreObservation",
          reason: "Need sidebar order entry",
          query: "订单 管理",
          scope: "sidebar",
          expand: ["hidden_menus", "nearby_text"],
          preferredRoles: ["link", "menuitem"]
        };
      }
      return { type: "FinishTask", summary: "Found enough candidates.", evidenceRefs: [] };
    },
    execute: async () => ({ status: "success", details: {} })
  });

  await runtime.startTask("打开订单管理");
  await runtime.runNextStep();

  expect(observeCalls).toHaveLength(2);
  expect(observeCalls[0].options).toMatchObject({ observationRound: 1, candidateLimit: 120 });
  expect(observeCalls[1].request).toMatchObject({ query: "订单 管理", scope: "sidebar" });
  expect(observeCalls[1].options).toMatchObject({ observationRound: 2, candidateLimit: 320 });
});
```

- [ ] **Step 2: Run the failing test**

Run: `npx vitest run tests/unit/core/agent-runtime.test.ts`

Expected: fail because `observePage` receives only the request today, not options.

- [ ] **Step 3: Add protocol and model types**

Modify `src/shared/protocol.ts`:

```ts
import type { NeedMoreObservationRequest } from "../core/model/contracts";

export interface ObservePageOptions {
  observationRequest?: NeedMoreObservationRequest;
  observationRound?: number;
  candidateLimit?: number;
}

export type ObservePageRequest = {
  type: "OBSERVE_PAGE";
} & ObservePageOptions;
```

Modify `src/core/observation/page-model.ts`:

```ts
import type { NeedMoreObservationRequest, ObservationExpansion, ObservationScope } from "../model/contracts";

export interface ObservationRetrievalMetadata {
  request?: NeedMoreObservationRequest;
  query?: string;
  scope?: ObservationScope;
  expand?: ObservationExpansion[];
  candidateLimit: number;
  totalControls: number;
  returnedControls: number;
  omittedControls: number;
  totalTextBlocks: number;
  returnedTextBlocks: number;
  omittedTextBlocks: number;
  strategy: "default_ranked" | "request_ranked" | "fallback_full_snapshot";
}

export interface PageModel {
  pageIdentity: PageIdentity;
  viewport: ViewportSnapshot;
  controls: ControlCandidate[];
  textBlocks: TextBlock[];
  forms: FormSnapshot[];
  feedback: string[];
  readableContent: string[];
  riskSignals: RiskSignal[];
  capturedAt: number;
  observation?: ObservationRetrievalMetadata;
}
```

- [ ] **Step 4: Pass observation options through runtime**

Modify `src/core/runtime/agent-runtime.ts`:

```ts
export interface ObservePageRuntimeOptions {
  observationRound: number;
  candidateLimit: number;
}

export interface AgentRuntimePorts {
  sessionId: string;
  taskId: string;
  safetyMode?: SafetyMode;
  observationBudget?: Partial<ObservationBudget>;
  observePage(request?: NeedMoreObservationRequest, options?: ObservePageRuntimeOptions): Promise<PageModel>;
  plan(input: PlannerInput): Promise<unknown>;
  execute(primitive: BrowserPrimitive): Promise<PrimitiveResult>;
  appendEvent(event: AgentEvent): Promise<void>;
}
```

Inside the observation loop:

```ts
const candidateLimit = this.candidateLimitForRound(observationRound);
before = await this.ports.observePage(observationRequest, {
  observationRound: observationRound + 1,
  candidateLimit
});
await this.append(stepId, "ObservationReceived", {
  pageIdentity: before.pageIdentity,
  controls: before.controls.length,
  observationRound: observationRound + 1,
  candidateLimit,
  request: observationRequest,
  retrieval: before.observation
});
```

After command execution:

```ts
const after = await this.ports.observePage(undefined, {
  observationRound: 1,
  candidateLimit: this.observationBudget.initialCandidateLimit
});
await this.append(stepId, "ObservationReceived", {
  pageIdentity: after.pageIdentity,
  controls: after.controls.length,
  candidateLimit: this.observationBudget.initialCandidateLimit,
  retrieval: after.observation
});
```

- [ ] **Step 5: Forward observe options in background and content**

Modify `src/background/index.ts`:

```ts
async function observeActivePage(
  observationRequest?: NeedMoreObservationRequest,
  options?: ObservePageRuntimeOptions
): Promise<PageModel> {
  const response = await sendActiveTabMessage<PageModel>({
    type: "OBSERVE_PAGE",
    observationRequest,
    observationRound: options?.observationRound,
    candidateLimit: options?.candidateLimit
  });
  if (response.ok) return response.data;
  return fallbackPageModel(await getActiveTab(), response.error);
}
```

Modify `src/content/index.ts`:

```ts
if (request.type === "OBSERVE_PAGE") {
  const observeRequest = request as Extract<NaturalClickRequest, { type: "OBSERVE_PAGE" }>;
  sendResponse(
    okResponse(
      observePage(document, {
        request: observeRequest.observationRequest,
        observationRound: observeRequest.observationRound,
        candidateLimit: observeRequest.candidateLimit
      })
    )
  );
  return true;
}
```

- [ ] **Step 6: Verify task 1**

Run: `npx vitest run tests/unit/core/agent-runtime.test.ts`

Expected: the new request-forwarding test passes and existing runtime tests still pass.

---

### Task 2: Local Page Node Index and Retrieval Scoring

**Files:**
- Create: `src/adapters/content/page-node-index.ts`
- Test: `tests/unit/adapters/page-node-index.test.ts`

**Interfaces:**
- Produces: `PageNodeRecord`
- Produces: `retrieveObservationRecords(records, options)`
- Consumes: `NeedMoreObservationRequest`, `ControlCandidate`, `TextBlock`, `FormSnapshot`

- [ ] **Step 1: Write failing query and sidebar retrieval tests**

Create `tests/unit/adapters/page-node-index.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { NeedMoreObservationRequest } from "../../../src/core/model/contracts";
import type { ControlCandidate } from "../../../src/core/observation/page-model";
import { retrieveObservationRecords, type PageNodeRecord } from "../../../src/adapters/content/page-node-index";

function control(id: string, label: string, role = "link", region = "main_content"): PageNodeRecord {
  return {
    id,
    kind: "control",
    text: label,
    role,
    region,
    visibility: "visible",
    bounds: { x: region === "sidebar" ? 10 : 500, y: 20, width: 120, height: 32 },
    confidence: 0.84,
    control: {
      semanticId: id,
      role,
      label,
      accessibleName: label,
      elementTag: "a",
      disabled: false,
      required: false,
      visibility: "visible",
      interactionHints: [role],
      locatorHints: [{ kind: "text", value: label }],
      confidence: 0.84
    } satisfies ControlCandidate
  };
}

describe("page node index retrieval", () => {
  it("ranks sidebar query matches before unrelated visible controls", () => {
    const records = [
      control("main_help", "帮助中心", "link", "main_content"),
      control("side_order", "订单管理", "menuitem", "sidebar"),
      control("side_customer", "客户管理", "menuitem", "sidebar")
    ];
    const request: NeedMoreObservationRequest = {
      reason: "Need order menu",
      query: "订单 管理",
      scope: "sidebar",
      preferredRoles: ["menuitem", "link"]
    };

    const selected = retrieveObservationRecords(records, {
      request,
      candidateLimit: 2,
      viewport: { width: 1280, height: 720, scrollX: 0, scrollY: 0, deviceScaleFactor: 1 }
    });

    expect(selected.records.map((item) => item.id)).toEqual(["side_order", "side_customer"]);
    expect(selected.metadata.strategy).toBe("request_ranked");
    expect(selected.metadata.omittedControls).toBe(1);
  });

  it("can include hidden menu entries only when hidden_menus expansion is requested", () => {
    const hidden = {
      ...control("hidden_invoice", "发票管理", "menuitem", "sidebar"),
      visibility: "hidden" as const,
      control: { ...control("hidden_invoice", "发票管理", "menuitem", "sidebar").control!, visibility: "hidden" as const }
    };
    const visible = control("visible_home", "首页", "link", "sidebar");

    const withoutHidden = retrieveObservationRecords([visible, hidden], {
      request: { reason: "Need invoice", query: "发票", scope: "sidebar" },
      candidateLimit: 5,
      viewport: { width: 1280, height: 720, scrollX: 0, scrollY: 0, deviceScaleFactor: 1 }
    });
    const withHidden = retrieveObservationRecords([visible, hidden], {
      request: { reason: "Need invoice", query: "发票", scope: "sidebar", expand: ["hidden_menus"] },
      candidateLimit: 5,
      viewport: { width: 1280, height: 720, scrollX: 0, scrollY: 0, deviceScaleFactor: 1 }
    });

    expect(withoutHidden.records.map((item) => item.id)).not.toContain("hidden_invoice");
    expect(withHidden.records.map((item) => item.id)).toContain("hidden_invoice");
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run: `npx vitest run tests/unit/adapters/page-node-index.test.ts`

Expected: fail because `page-node-index.ts` does not exist.

- [ ] **Step 3: Implement index types**

Create `src/adapters/content/page-node-index.ts` with these exported types:

```ts
import type { NeedMoreObservationRequest } from "../../core/model/contracts";
import type {
  ControlCandidate,
  ElementBounds,
  FormSnapshot,
  ObservationRetrievalMetadata,
  TextBlock,
  ViewportSnapshot,
  VisibilityState
} from "../../core/observation/page-model";

export type PageRegion =
  | "navigation"
  | "sidebar"
  | "main_content"
  | "form"
  | "dialog"
  | "scroll_container"
  | "other";

export interface PageNodeRecord {
  id: string;
  kind: "control" | "text" | "form";
  text: string;
  role?: string;
  region: PageRegion;
  visibility: VisibilityState;
  bounds?: ElementBounds;
  confidence: number;
  control?: ControlCandidate;
  textBlock?: TextBlock;
  form?: FormSnapshot;
  expansionSource?: "nearby_text" | "hidden_menus" | "offscreen_links" | "form_fields" | "tables" | "validation_feedback";
}

export interface RetrieveObservationOptions {
  request?: NeedMoreObservationRequest;
  candidateLimit: number;
  viewport: ViewportSnapshot;
}

export interface RetrievalResult {
  records: PageNodeRecord[];
  metadata: ObservationRetrievalMetadata;
}
```

- [ ] **Step 4: Implement tokenization and matching**

Use deterministic local matching:

```ts
function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function tokenize(value: string): string[] {
  const normalized = normalizeText(value);
  const splitTerms = normalized.split(/[\s,，。:：/|()[\]{}"'`]+/).filter(Boolean);
  return Array.from(new Set(splitTerms.flatMap((term) => (term.length > 12 ? [term, term.slice(0, 12)] : [term]))));
}

function textScore(text: string, terms: string[]): number {
  if (terms.length === 0) return 0;
  const normalized = normalizeText(text);
  const hits = terms.filter((term) => normalized.includes(term)).length;
  if (hits === terms.length) return 0.46;
  if (hits > 0) return 0.22 + Math.min(0.18, hits * 0.06);
  return 0;
}
```

This keeps Chinese phrases such as `订单管理` searchable by substring and also handles separated terms such as `订单 管理`.

- [ ] **Step 5: Implement scope, expansion, and score**

Implement these rules in `retrieveObservationRecords()`:

```ts
function scopeMatches(record: PageNodeRecord, request?: NeedMoreObservationRequest): boolean {
  if (!request || request.scope === "full_page" || request.scope === "visual") return true;
  if (request.scope === "current_viewport") return record.visibility === "visible";
  return record.region === request.scope;
}

function hiddenAllowed(record: PageNodeRecord, request?: NeedMoreObservationRequest): boolean {
  if (record.visibility === "visible") return true;
  return Boolean(request?.expand?.includes("hidden_menus") && record.region === "sidebar");
}

function preferredRoleScore(record: PageNodeRecord, request?: NeedMoreObservationRequest): number {
  if (!request?.preferredRoles?.length || !record.role) return 0;
  return request.preferredRoles.some((role) => record.role?.toLowerCase().includes(role)) ? 0.18 : 0;
}

function scoreRecord(record: PageNodeRecord, request?: NeedMoreObservationRequest): number {
  const terms = tokenize(`${request?.query ?? ""} ${(request?.targetTextHints ?? []).join(" ")}`);
  const base = record.confidence * 0.12;
  const query = textScore(`${record.text} ${record.role ?? ""}`, terms);
  const role = preferredRoleScore(record, request);
  const scope = scopeMatches(record, request) ? 0.14 : 0;
  const visible = record.visibility === "visible" ? 0.1 : -0.08;
  const expansion = record.expansionSource ? 0.08 : 0;
  return base + query + role + scope + visible + expansion;
}
```

Then filter and rank:

```ts
export function retrieveObservationRecords(records: PageNodeRecord[], options: RetrieveObservationOptions): RetrievalResult {
  const candidateLimit = Math.max(1, Math.floor(options.candidateLimit));
  const filtered = records.filter((record) => scopeMatches(record, options.request) && hiddenAllowed(record, options.request));
  const ranked = filtered
    .map((record, index) => ({ record, score: scoreRecord(record, options.request), index }))
    .sort((left, right) => right.score - left.score || right.record.confidence - left.record.confidence || left.index - right.index)
    .slice(0, candidateLimit)
    .map((item) => item.record);
  const returnedControls = ranked.filter((record) => record.kind === "control").length;
  const totalControls = records.filter((record) => record.kind === "control").length;
  const returnedTextBlocks = ranked.filter((record) => record.kind === "text").length;
  const totalTextBlocks = records.filter((record) => record.kind === "text").length;
  return {
    records: ranked,
    metadata: {
      request: options.request,
      query: options.request?.query,
      scope: options.request?.scope,
      expand: options.request?.expand,
      candidateLimit,
      totalControls,
      returnedControls,
      omittedControls: Math.max(0, totalControls - returnedControls),
      totalTextBlocks,
      returnedTextBlocks,
      omittedTextBlocks: Math.max(0, totalTextBlocks - returnedTextBlocks),
      strategy: options.request ? "request_ranked" : "default_ranked"
    }
  };
}
```

- [ ] **Step 6: Verify task 2**

Run: `npx vitest run tests/unit/adapters/page-node-index.test.ts`

Expected: all page-node-index tests pass.

---

### Task 3: Apply Retrieval Inside DOM Observer

**Files:**
- Modify: `src/adapters/content/dom-observer.ts`
- Test: `tests/unit/core/observation-evidence.test.ts`

**Interfaces:**
- Produces: `observePage(document, options?)`
- Consumes: `retrieveObservationRecords()`
- Keeps: existing `PageModel` consumers and `executePrimitive()` behavior

- [ ] **Step 1: Add failing DOM observer tests for smart observation**

Add this test to `tests/unit/core/observation-evidence.test.ts`:

```ts
it("narrows observation results by query and sidebar scope while preserving bindable controls", () => {
  document.body.innerHTML = `
    <aside class="app-sidebar">
      <nav aria-label="主导航">
        <a href="/home">首页</a>
        <a href="/orders">订单管理</a>
        <a href="/customers">客户管理</a>
      </nav>
    </aside>
    <main>
      ${Array.from({ length: 40 }, (_, index) => `<button>无关按钮 ${index}</button>`).join("")}
    </main>
  `;

  const page = observePage(document, {
    request: {
      reason: "Need order menu",
      query: "订单 管理",
      scope: "sidebar",
      preferredRoles: ["link", "menuitem"]
    },
    candidateLimit: 2,
    observationRound: 2
  });

  expect(page.controls.map((control) => control.label)).toEqual(["订单管理", "首页"]);
  expect(page.observation).toMatchObject({
    query: "订单 管理",
    scope: "sidebar",
    candidateLimit: 2,
    returnedControls: 2
  });
});
```

Add this test for form expansion:

```ts
it("includes form fields when form_fields expansion is requested", () => {
  document.body.innerHTML = `
    <main>
      <form aria-label="客户资料">
        <label for="name">客户名称</label>
        <input id="name" />
        <label for="phone">手机号</label>
        <input id="phone" />
        <button type="submit">保存客户</button>
      </form>
      <button>返回</button>
    </main>
  `;

  const page = observePage(document, {
    request: {
      reason: "Need customer form",
      query: "客户",
      scope: "form",
      expand: ["form_fields"],
      preferredRoles: ["textbox", "button"]
    },
    candidateLimit: 5,
    observationRound: 2
  });

  expect(page.controls.map((control) => control.label)).toEqual(["客户名称", "手机号", "保存客户"]);
  expect(page.forms[0]?.label).toBe("客户资料");
});
```

- [ ] **Step 2: Run failing DOM tests**

Run: `npx vitest run tests/unit/core/observation-evidence.test.ts`

Expected: fail because `observePage` does not accept smart observation options and does not filter by request.

- [ ] **Step 3: Add content observation options**

Modify `src/adapters/content/dom-observer.ts`:

```ts
import type { NeedMoreObservationRequest } from "../../core/model/contracts";
import { retrieveObservationRecords, type PageNodeRecord, type PageRegion } from "./page-node-index";

export interface ContentObservationOptions {
  request?: NeedMoreObservationRequest;
  observationRound?: number;
  candidateLimit?: number;
}
```

- [ ] **Step 4: Keep element records for controls, text, and forms**

Change text observation from returning only `TextBlock[]` to returning records:

```ts
interface TextRecord {
  element: HTMLElement;
  block: TextBlock;
}

interface FormRecord {
  element: HTMLFormElement;
  form: FormSnapshot;
}

function observeTextBlocks(document: Document): TextRecord[] {
  const selector = "h1,h2,h3,h4,h5,h6,p,li,label,[role='alert'],[role='status'],[aria-live]";
  return Array.from(document.querySelectorAll<HTMLElement>(selector)).flatMap((element, index): TextRecord[] => {
    const text = textOf(element);
    if (!text) return [];
    const kind = textKindFor(element);
    return [
      {
        element,
        block: {
          semanticId: semanticIdFor("text", index, kind, text),
          kind,
          text,
          role: attr(element, "role"),
          headingLevel: headingLevelFor(element),
          visibility: visibilityFor(element),
          locatorHints: locatorHintsFor(element, text, attr(element, "role") ?? kind, index),
          confidence: kind === "heading" ? 0.88 : 0.76
        }
      }
    ];
  });
}
```

Change forms similarly:

```ts
function observeForms(document: Document, controls: ControlRecord[]): FormRecord[] {
  return Array.from(document.querySelectorAll<HTMLFormElement>("form")).map((form, index) => {
    const formControls = controls.filter((record) => form.contains(record.element));
    const requiredControls = formControls.filter((record) => record.control.required);
    const submitControls = formControls.filter((record) => isSubmitControl(record.element, record.control));
    const label = formLabel(form);
    return {
      element: form,
      form: {
        semanticId: semanticIdFor("form", index, "form", label),
        label,
        controlRefs: formControls.map((record) => record.control.semanticId),
        controlLabels: formControls.map((record) => record.control.label).filter(Boolean),
        requiredControlRefs: requiredControls.map((record) => record.control.semanticId),
        requiredControlLabels: requiredControls.map((record) => record.control.label).filter(Boolean),
        submitControlRefs: submitControls.map((record) => record.control.semanticId),
        submitControlLabels: submitControls.map((record) => record.control.label).filter(Boolean),
        locatorHints: locatorHintsFor(form, label, "form", index),
        confidence: 0.84
      }
    };
  });
}
```

- [ ] **Step 5: Build regions and node records from DOM elements**

Add deterministic region detection:

```ts
function regionFor(element: HTMLElement): PageRegion {
  if (element.closest("dialog,[role='dialog'],[aria-modal='true']")) return "dialog";
  if (element.closest("form")) return "form";
  if (element.closest("aside,[class*='side' i],[class*='menu' i],[class*='sidebar' i]")) return "sidebar";
  if (element.closest("nav,[role='navigation']")) return "navigation";
  if (element.closest("main,[role='main']")) return "main_content";
  if (scrollContainerFor(element)) return "scroll_container";
  return "other";
}

function scrollContainerFor(element: HTMLElement): HTMLElement | undefined {
  let current = element.parentElement;
  while (current) {
    const style = current.ownerDocument.defaultView?.getComputedStyle(current);
    const overflow = `${style?.overflow ?? ""} ${style?.overflowY ?? ""} ${style?.overflowX ?? ""}`;
    if (/(auto|scroll)/.test(overflow)) return current;
    current = current.parentElement;
  }
  return undefined;
}
```

Build records:

```ts
function nodeRecordsFor(controls: ControlRecord[], texts: TextRecord[], forms: FormRecord[]): PageNodeRecord[] {
  return [
    ...controls.map((record) => ({
      id: record.control.semanticId,
      kind: "control" as const,
      text: `${record.control.label} ${record.control.accessibleName} ${record.control.description ?? ""}`,
      role: record.control.role,
      region: regionFor(record.element),
      visibility: record.control.visibility,
      bounds: record.control.bounds,
      confidence: record.control.confidence,
      control: record.control
    })),
    ...texts.map((record) => ({
      id: record.block.semanticId,
      kind: "text" as const,
      text: record.block.text,
      role: record.block.role ?? record.block.kind,
      region: regionFor(record.element),
      visibility: record.block.visibility,
      bounds: boundsFor(record.element),
      confidence: record.block.confidence,
      textBlock: record.block
    })),
    ...forms.map((record) => ({
      id: record.form.semanticId,
      kind: "form" as const,
      text: `${record.form.label} ${record.form.controlLabels.join(" ")}`,
      role: "form",
      region: "form" as const,
      visibility: visibilityFor(record.element),
      bounds: boundsFor(record.element),
      confidence: record.form.confidence,
      form: record.form
    }))
  ];
}
```

- [ ] **Step 6: Apply retrieval and preserve related forms/text**

Replace the final `observePage(document)` body with this shape:

```ts
export function observePage(document: Document, options: ContentObservationOptions = {}): PageModel {
  const controlRecords = observeControls(document);
  const textRecords = observeTextBlocks(document);
  const formRecords = observeForms(document, controlRecords);
  const textBlocks = textRecords.map((record) => record.block);
  const forms = formRecords.map((record) => record.form);
  const feedback = feedbackFromTextBlocks(textBlocks);
  const identity = identityFor(document);
  const viewport = viewportFor(document);
  const allRecords = nodeRecordsFor(controlRecords, textRecords, formRecords);
  const retrieval = retrieveObservationRecords(allRecords, {
    request: options.request,
    candidateLimit: options.candidateLimit ?? 120,
    viewport
  });
  const selectedIds = new Set(retrieval.records.map((record) => record.id));
  const selectedControlIds = new Set(retrieval.records.filter((record) => record.control).map((record) => record.id));
  const selectedFormIds = new Set<string>();
  for (const form of forms) {
    if (form.controlRefs.some((ref) => selectedControlIds.has(ref)) || selectedIds.has(form.semanticId)) {
      selectedFormIds.add(form.semanticId);
    }
  }

  const controls = controlRecords.map((record) => record.control).filter((control) => selectedIds.has(control.semanticId));
  const returnedTextBlocks = textBlocks.filter((block) => selectedIds.has(block.semanticId));
  const returnedForms = forms.filter((form) => selectedFormIds.has(form.semanticId));

  return {
    pageIdentity: identity,
    viewport,
    controls,
    textBlocks: returnedTextBlocks,
    forms: returnedForms,
    feedback,
    readableContent: returnedTextBlocks.map((block) => block.text).slice(0, 80),
    riskSignals: riskSignalsFor(identity.url, controlRecords, forms, feedback).filter((signal) => {
      return !signal.controlRef || selectedControlIds.has(signal.controlRef);
    }),
    capturedAt: Date.now(),
    observation: retrieval.metadata
  };
}
```

- [ ] **Step 7: Verify task 3**

Run: `npx vitest run tests/unit/core/observation-evidence.test.ts tests/unit/adapters/page-node-index.test.ts`

Expected: smart observation tests pass and existing evidence extraction still passes.

---

### Task 4: Expansion Recall for Nearby Text, Forms, Tables, and Validation

**Files:**
- Modify: `src/adapters/content/dom-observer.ts`
- Modify: `src/adapters/content/page-node-index.ts`
- Test: `tests/unit/adapters/page-node-index.test.ts`
- Test: `tests/unit/core/observation-evidence.test.ts`

**Interfaces:**
- Produces: expansion sources on `PageNodeRecord`
- Consumes: `NeedMoreObservationRequest.expand`

- [ ] **Step 1: Add failing tests for table and validation expansion**

Add to `tests/unit/core/observation-evidence.test.ts`:

```ts
it("returns table row actions when tables expansion matches table text", () => {
  document.body.innerHTML = `
    <main>
      <table>
        <thead><tr><th>订单号</th><th>操作</th></tr></thead>
        <tbody>
          <tr><td>ORD-1001</td><td><button>查看</button></td></tr>
          <tr><td>ORD-1002</td><td><button>取消</button></td></tr>
        </tbody>
      </table>
      <button>刷新</button>
    </main>
  `;

  const page = observePage(document, {
    request: {
      reason: "Need order row action",
      query: "ORD-1002",
      scope: "main_content",
      expand: ["tables"],
      preferredRoles: ["button"]
    },
    candidateLimit: 4,
    observationRound: 2
  });

  expect(page.controls.map((control) => control.label)).toContain("取消");
});

it("returns validation feedback and invalid fields when validation expansion is requested", () => {
  document.body.innerHTML = `
    <main>
      <form aria-label="登录">
        <label for="email">邮箱</label>
        <input id="email" aria-invalid="true" />
        <div role="alert">邮箱不能为空</div>
        <button>登录</button>
      </form>
    </main>
  `;

  const page = observePage(document, {
    request: {
      reason: "Need validation detail",
      query: "邮箱",
      scope: "form",
      expand: ["validation_feedback", "form_fields"],
      preferredRoles: ["textbox", "button"]
    },
    candidateLimit: 5,
    observationRound: 2
  });

  expect(page.feedback).toContain("邮箱不能为空");
  expect(page.textBlocks.map((block) => block.text)).toContain("邮箱不能为空");
  expect(page.controls.map((control) => control.label)).toContain("邮箱");
});
```

- [ ] **Step 2: Run failing tests**

Run: `npx vitest run tests/unit/core/observation-evidence.test.ts`

Expected: table row and validation expansion tests fail until expansion records are added.

- [ ] **Step 3: Add expansion records in DOM observer**

Add a helper that appends related records when an expansion is requested:

```ts
function expansionRecordsFor(
  baseRecords: PageNodeRecord[],
  controls: ControlRecord[],
  texts: TextRecord[],
  request?: NeedMoreObservationRequest
): PageNodeRecord[] {
  if (!request?.expand?.length) return baseRecords;
  const expanded = [...baseRecords];

  if (request.expand.includes("form_fields")) {
    for (const record of controls.filter((item) => item.element.closest("form"))) {
      expanded.push({
        id: record.control.semanticId,
        kind: "control",
        text: `${record.control.label} ${record.control.accessibleName}`,
        role: record.control.role,
        region: "form",
        visibility: record.control.visibility,
        bounds: record.control.bounds,
        confidence: record.control.confidence,
        control: record.control,
        expansionSource: "form_fields"
      });
    }
  }

  if (request.expand.includes("tables")) {
    for (const record of controls.filter((item) => item.element.closest("table,[role='table'],[role='grid']"))) {
      const rowText = textOf(record.element.closest("tr,[role='row']") ?? record.element);
      expanded.push({
        id: record.control.semanticId,
        kind: "control",
        text: `${rowText} ${record.control.label}`,
        role: record.control.role,
        region: regionFor(record.element),
        visibility: record.control.visibility,
        bounds: record.control.bounds,
        confidence: record.control.confidence,
        control: record.control,
        expansionSource: "tables"
      });
    }
  }

  if (request.expand.includes("validation_feedback")) {
    for (const record of texts.filter((item) => item.block.kind === "alert" || item.block.kind === "status")) {
      expanded.push({
        id: record.block.semanticId,
        kind: "text",
        text: record.block.text,
        role: record.block.role ?? record.block.kind,
        region: regionFor(record.element),
        visibility: record.block.visibility,
        bounds: boundsFor(record.element),
        confidence: record.block.confidence,
        textBlock: record.block,
        expansionSource: "validation_feedback"
      });
    }
  }

  return expanded;
}
```

Call it before retrieval:

```ts
const allRecords = expansionRecordsFor(nodeRecordsFor(controlRecords, textRecords, formRecords), controlRecords, textRecords, options.request);
```

- [ ] **Step 4: De-duplicate records inside retrieval**

Modify `retrieveObservationRecords()` to keep the highest score for each id:

```ts
function uniqueBest(scored: Array<{ record: PageNodeRecord; score: number; index: number }>): Array<{ record: PageNodeRecord; score: number; index: number }> {
  const byId = new Map<string, { record: PageNodeRecord; score: number; index: number }>();
  for (const item of scored) {
    const existing = byId.get(item.record.id);
    if (!existing || item.score > existing.score) byId.set(item.record.id, item);
  }
  return Array.from(byId.values());
}
```

Use it before sorting:

```ts
const scored = filtered.map((record, index) => ({ record, score: scoreRecord(record, options.request), index }));
const ranked = uniqueBest(scored)
  .sort((left, right) => right.score - left.score || right.record.confidence - left.record.confidence || left.index - right.index)
  .slice(0, candidateLimit)
  .map((item) => item.record);
```

- [ ] **Step 5: Verify task 4**

Run: `npx vitest run tests/unit/adapters/page-node-index.test.ts tests/unit/core/observation-evidence.test.ts`

Expected: expansion tests pass and retrieval remains deterministic.

---

### Task 5: Diagnostic Observation Logs

**Files:**
- Modify: `src/core/runtime/agent-runtime.ts`
- Modify: `src/sidepanel/state.ts`
- Test: `tests/unit/sidepanel/state.test.ts`

**Interfaces:**
- Produces: richer `ObservationReceived.payload.retrieval`
- Produces: readable timeline detail for observation events

- [ ] **Step 1: Add failing sidepanel timeline tests**

Add to `tests/unit/sidepanel/state.test.ts`:

```ts
it("summarizes smart observation retrieval details in Chinese", () => {
  const item = mapEventToTimelineItem(
    makeEvent("ObservationReceived", {
      controls: 12,
      candidateLimit: 320,
      retrieval: {
        query: "订单 管理",
        scope: "sidebar",
        candidateLimit: 320,
        totalControls: 900,
        returnedControls: 12,
        omittedControls: 888,
        totalTextBlocks: 80,
        returnedTextBlocks: 6,
        omittedTextBlocks: 74,
        strategy: "request_ranked"
      }
    }),
    "zh-CN"
  );

  expect(item.detail).toContain("订单 管理");
  expect(item.detail).toContain("sidebar");
  expect(item.detail).toContain("12/900");
});

it("summarizes smart observation retrieval details in English", () => {
  const item = mapEventToTimelineItem(
    makeEvent("ObservationReceived", {
      controls: 12,
      candidateLimit: 320,
      retrieval: {
        query: "orders",
        scope: "sidebar",
        candidateLimit: 320,
        totalControls: 900,
        returnedControls: 12,
        omittedControls: 888,
        totalTextBlocks: 80,
        returnedTextBlocks: 6,
        omittedTextBlocks: 74,
        strategy: "request_ranked"
      }
    }),
    "en"
  );

  expect(item.detail).toContain("orders");
  expect(item.detail).toContain("sidebar");
  expect(item.detail).toContain("12/900");
});
```

- [ ] **Step 2: Run failing timeline tests**

Run: `npx vitest run tests/unit/sidepanel/state.test.ts`

Expected: fail because `mapEventToTimelineItem()` does not format retrieval metadata.

- [ ] **Step 3: Add observation detail formatter**

Modify `src/sidepanel/state.ts`:

```ts
function observationDetail(payload: Record<string, unknown>, locale?: SidepanelLocale): string | undefined {
  if (!payload.retrieval || typeof payload.retrieval !== "object") return undefined;
  const retrieval = payload.retrieval as Record<string, unknown>;
  const query = typeof retrieval.query === "string" && retrieval.query.trim() ? retrieval.query : undefined;
  const scope = typeof retrieval.scope === "string" ? retrieval.scope : undefined;
  const returned = typeof retrieval.returnedControls === "number" ? retrieval.returnedControls : payload.controls;
  const total = typeof retrieval.totalControls === "number" ? retrieval.totalControls : undefined;
  const limit = typeof retrieval.candidateLimit === "number" ? retrieval.candidateLimit : payload.candidateLimit;
  const count = total ? `${returned}/${total}` : String(returned ?? "");
  const language = locale === "zh-CN" ? "zh" : "en";
  if (language === "zh") {
    return [`候选 ${count}`, scope ? `范围 ${scope}` : undefined, query ? `检索 ${query}` : undefined, limit ? `上限 ${limit}` : undefined]
      .filter(Boolean)
      .join(" · ");
  }
  return [`Candidates ${count}`, scope ? `scope ${scope}` : undefined, query ? `query ${query}` : undefined, limit ? `limit ${limit}` : undefined]
    .filter(Boolean)
    .join(" · ");
}
```

Use it in `mapEventToTimelineItem()`:

```ts
const detail =
  event.type === "ObservationReceived"
    ? observationDetail(event.payload, locale)
    : stringPayload(event.payload, ["taskText", "instruction", "summary", "detail", "command", "commandName", "targetLabel", "expectedOutcome", "reason", "error"], locale);

return {
  id: event.id,
  title: eventTitle(event.type, locale),
  detail,
  tone: eventTone(event.type)
};
```

- [ ] **Step 4: Verify task 5**

Run: `npx vitest run tests/unit/sidepanel/state.test.ts`

Expected: observation timeline details include query, scope, candidate counts, and limit.

---

### Task 6: End-to-End Verification and Build Output

**Files:**
- Modify: `naturalclick-extension/*` through `npm run build`

**Interfaces:**
- Produces: loadable `naturalclick-extension` folder with smart observation retrieval bundled

- [ ] **Step 1: Run focused tests**

Run:

```bash
npx vitest run tests/unit/adapters/page-node-index.test.ts tests/unit/core/observation-evidence.test.ts tests/unit/core/agent-runtime.test.ts tests/unit/sidepanel/state.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 2: Run full validation**

Run:

```bash
npm run test:all
```

Expected: `typecheck`, `test:unit`, and `build` pass. The build writes the final plugin artifacts into `naturalclick-extension`.

- [ ] **Step 3: Manual Chrome smoke check**

Load `naturalclick-extension` in Chrome and verify:

1. Start a task on a page with many sidebar/menu controls.
2. The first observation appears in the sidepanel timeline.
3. When planner returns `NeedMoreObservation` with `scope: "sidebar"`, the next `ObservationReceived` log shows the request, `candidateLimit`, returned count, omitted count, and query.
4. Downloaded log includes raw `ObservationReceived.payload.retrieval`.
5. No observation step clicks, opens menus, fills forms, or mutates the page.

---

## Acceptance Criteria

- `OBSERVE_PAGE` accepts and forwards `observationRequest`, `observationRound`, and `candidateLimit`.
- `AgentRuntime` forwards each `NeedMoreObservationRequest` to the observe port with the correct round budget: first round `120`, second round `320`, later rounds `600`.
- Content script returns narrowed `PageModel.controls` for query/scope requests, while preserving enough locator hints for `bindCommand()`.
- Sidebar/menu requests rank matching navigation candidates ahead of unrelated visible controls.
- Hidden menu entries are included only when `expand` contains `hidden_menus`.
- Form, table, nearby text, and validation expansions produce useful related candidates without mutating the page.
- `PageModel.observation` records `query`, `scope`, `expand`, candidate limit, total/returned/omitted counts, and strategy.
- Sidepanel timeline and downloaded logs expose observation diagnostics clearly in Chinese and English.
- `npm run test:all` passes and `naturalclick-extension` is rebuilt.

## Non-Goals

- This plan does not add a second model reranker for raw DOM candidates.
- This plan does not use screenshots or vision to choose DOM candidates.
- This plan does not automatically open collapsed menus during observation.
- This plan does not change safety policy or confirmation behavior.

## Self-Review

- Spec coverage: multi-round observation request routing, local node retrieval, query/scope/expand behavior, context pressure reduction, and diagnostic logs are covered by Tasks 1-6.
- Placeholder scan: no unresolved placeholders are present.
- Type consistency: `NeedMoreObservationRequest`, `ObservePageOptions`, `PageModel.observation`, and `AgentRuntimePorts.observePage(request, options)` are defined before use.
