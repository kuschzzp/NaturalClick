# NaturalClick First Version Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first clean-rewrite Chrome MV3 version of NaturalClick: an event-driven browser Agent with a conversational side panel, page overlay, model configuration, DOM-first observation, first-stage vision grounding, scoped safety, and traceable execution.

**Architecture:** Use a TypeScript hexagonal core with Chrome MV3 adapters around it. The Core owns task state, events, evidence, semantic commands, policy, context assembly, and role contracts; background/content/sidepanel code only adapts Chrome runtime, DOM, overlay, storage, model calls, and UI.

**Tech Stack:** Chrome Manifest V3, TypeScript, Vite, Vitest, jsdom, Playwright for final extension smoke tests, native DOM/CSS for the side panel, no React in the first version.

## Global Constraints

- Pure Chrome MV3 extension; no backend Agent service, native messaging host, or local daemon.
- One global OpenAI-compatible provider configuration in the first version.
- Planner uses a model by default; Vision uses a model only when triggered; Verifier and Summarizer are deterministic/template-first.
- Event log is the source of truth; snapshots are rebuildable derived state.
- Planner outputs semantic commands, not DOM indexes or direct coordinates.
- Every semantic command declares an expected outcome and success criteria.
- Every execution is followed by observation and verification.
- Vision enhances observation, binding, and verification; it does not plan.
- Overlay is visualization only; turning it off must not disable observation, binding, or execution.
- Safety confirmation grants scoped consent; do not ask about every submit button when task-scoped consent exists.
- Default safety mode is `balanced`.
- Raw model payloads, screenshot images, and sensitive values are not stored by default.
- First version supports current-session history only, not cross-session long-term memory.

---

## Scope Check

The two specs cover Core architecture and Sidepanel experience. This plan implements the first vertical product slice only:

- General browser operation.
- Lightweight form task.
- Vision-assisted grounding.
- Current-session trace and history.
- Model configuration and context compression.

This plan does not implement the later BackofficeProfile, ResearchProfile, TableCapability, full-page screenshot stitching, local visual models, or cross-session task history.

## File Structure

Create this structure:

```text
package.json
tsconfig.json
vite.config.ts
vitest.config.ts
public/
  manifest.json
  sidepanel.html
  sidepanel.css
src/
  shared/
    ids.ts
    protocol.ts
    result.ts
  core/
    capabilities/
      registry.ts
    commands/
      commands.ts
      binder.ts
    context/
      assembler.ts
      budget.ts
    evidence/
      evidence.ts
      manager.ts
    events/
      events.ts
      memory-event-store.ts
      reducer.ts
      snapshot.ts
    memory/
      session-memory.ts
    model/
      config.ts
      contracts.ts
      role-router.ts
    observation/
      page-model.ts
      focus.ts
    policy/
      policy.ts
      consent.ts
    runtime/
      agent-runtime.ts
      task-interpreter.ts
    verification/
      verifier.ts
    vision/
      vision.ts
  adapters/
    chrome/
      chrome-storage-event-store.ts
      chrome-session-memory.ts
      messaging.ts
      tabs.ts
    model/
      openai-compatible-client.ts
      model-config-store.ts
    content/
      dom-observer.ts
      primitive-executor.ts
      overlay-controller.ts
  background/
    index.ts
  content/
    index.ts
  sidepanel/
    main.ts
    state.ts
    render.ts
    components.ts
    settings.ts
tests/
  unit/
    core/
    adapters/
    sidepanel/
  fixtures/
    pages/
      general.html
      form.html
      visual-target.html
  e2e/
    extension-smoke.spec.ts
```

Responsibility map:

- `src/core/**`: framework-free Agent domain logic.
- `src/adapters/chrome/**`: Chrome storage, messaging, tab and screenshot adapters.
- `src/adapters/content/**`: DOM observation, primitive execution, overlay rendering.
- `src/adapters/model/**`: OpenAI-compatible model calls and persisted model configuration.
- `src/background/index.ts`: MV3 service worker entry and runtime orchestration.
- `src/content/index.ts`: content-script entry, DOM observation, primitive execution, overlay messages.
- `src/sidepanel/**`: adaptive conversational workbench UI.
- `tests/unit/**`: fast deterministic tests for core and UI state.
- `tests/e2e/**`: final extension smoke tests.

---

### Task 1: Project Scaffold And MV3 Shell

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `public/manifest.json`
- Create: `public/sidepanel.html`
- Create: `public/sidepanel.css`
- Create: `src/background/index.ts`
- Create: `src/content/index.ts`
- Create: `src/sidepanel/main.ts`
- Create: `tests/unit/build/manifest.test.ts`

**Interfaces:**
- Produces: build output in `naturalclick-extension/` with `manifest.json`, `background.js`, `content.js`, `sidepanel.html`, `sidepanel.js`, and `sidepanel.css`.
- Produces: npm scripts `build`, `test`, `test:unit`, `test:e2e`, `typecheck`.

- [ ] **Step 1: Write the failing manifest smoke test**

Create `tests/unit/build/manifest.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import manifest from "../../../public/manifest.json";

describe("MV3 manifest", () => {
  it("declares the side panel, service worker, and content script", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.side_panel.default_path).toBe("sidepanel.html");
    expect(manifest.background.service_worker).toBe("background.js");
    expect(manifest.content_scripts[0].js).toEqual(["content.js"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/unit/build/manifest.test.ts`

Expected: FAIL because `package.json`, Vitest config, and manifest do not exist yet.

- [ ] **Step 3: Create package and TypeScript tooling**

Create `package.json`:

```json
{
  "name": "naturalclick-agent",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "vite build",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:unit": "vitest run tests/unit",
    "test:e2e": "playwright test tests/e2e",
    "lint": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/chrome": "^0.0.268",
    "@types/node": "^20.14.10",
    "@vitest/coverage-v8": "^2.1.1",
    "jsdom": "^25.0.1",
    "@playwright/test": "^1.46.1",
    "typescript": "^5.5.4",
    "vite": "^5.4.3",
    "vitest": "^2.1.1"
  }
}
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["chrome", "vitest/globals"]
  },
  "include": ["src", "tests", "public/manifest.json"]
}
```

Create `vite.config.ts`:

```ts
import { defineConfig } from "vite";

export default defineConfig({
  publicDir: "public",
  build: {
    emptyOutDir: true,
    outDir: "naturalclick-extension",
    rollupOptions: {
      input: {
        background: "src/background/index.ts",
        content: "src/content/index.ts",
        sidepanel: "src/sidepanel/main.ts"
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name].js",
        assetFileNames: "[name][extname]"
      }
    }
  }
});
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["tests/unit/**/*.test.ts"]
  }
});
```

- [ ] **Step 4: Create MV3 static files and entry points**

Create `public/manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "NaturalClick Agent",
  "version": "0.1.0",
  "description": "A DOM-first, vision-assisted browser operation Agent.",
  "action": {
    "default_title": "NaturalClick Agent"
  },
  "permissions": ["activeTab", "scripting", "sidePanel", "storage", "tabs"],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "side_panel": {
    "default_path": "sidepanel.html"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ]
}
```

Create `public/sidepanel.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>NaturalClick Agent</title>
    <link rel="stylesheet" href="sidepanel.css" />
  </head>
  <body>
    <main id="app" aria-label="NaturalClick Agent side panel"></main>
    <script type="module" src="sidepanel.js"></script>
  </body>
</html>
```

Create `public/sidepanel.css`:

```css
:root {
  color-scheme: light;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #f7f8fb;
  color: #172033;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
  background: #f7f8fb;
}

button,
input,
textarea,
select {
  font: inherit;
}

#app {
  min-height: 100vh;
}
```

Create `src/background/index.ts`:

```ts
chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "NATURALCLICK_PING") {
    sendResponse({ ok: true, source: "background" });
    return true;
  }
  return false;
});
```

Create `src/content/index.ts`:

```ts
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "NATURALCLICK_PING") {
    sendResponse({ ok: true, source: "content" });
    return true;
  }
  return false;
});
```

Create `src/sidepanel/main.ts`:

```ts
const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("Missing #app root");
}

root.innerHTML = `
  <section class="nc-shell">
    <header class="nc-topbar">
      <strong>NaturalClick</strong>
      <span>Idle · balanced</span>
    </header>
    <section class="nc-timeline" aria-live="polite">
      <article class="nc-card">
        <h1>Need model configuration before starting</h1>
        <p>Planner model is required for task understanding and next-action decisions.</p>
        <button type="button">Open model settings</button>
      </article>
    </section>
    <form class="nc-composer">
      <label>
        <span>Task</span>
        <textarea placeholder="Ask the Agent to operate the current page..."></textarea>
      </label>
      <button type="submit">Send</button>
    </form>
  </section>
`;
```

- [ ] **Step 5: Install dependencies and run tests**

Run: `npm install`

Run: `npm test -- tests/unit/build/manifest.test.ts`

Expected: PASS.

- [ ] **Step 6: Run typecheck and build**

Run: `npm run typecheck`

Expected: PASS.

Run: `npm run build`

Expected: `naturalclick-extension/manifest.json`, `naturalclick-extension/background.js`, `naturalclick-extension/content.js`, and `naturalclick-extension/sidepanel.html` exist.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts vitest.config.ts public src tests
git commit -m "feat: scaffold mv3 extension"
```

---

### Task 2: Core Event Log, Snapshot, And Reducer

**Files:**
- Create: `src/shared/ids.ts`
- Create: `src/shared/result.ts`
- Create: `src/core/events/events.ts`
- Create: `src/core/events/snapshot.ts`
- Create: `src/core/events/memory-event-store.ts`
- Create: `src/core/events/reducer.ts`
- Test: `tests/unit/core/events.test.ts`

**Interfaces:**
- Produces: `AgentEvent`, `TaskSnapshot`, `TaskRuntimeState`, `StateReducer.reduce(snapshot, events)`.
- Produces: `MemoryEventStore.append(event)` and `MemoryEventStore.loadAfter(sessionId, taskId, eventId?)`.
- Consumed by: Agent runtime, sidepanel timeline, trace inspector, storage adapter.

- [ ] **Step 1: Write failing reducer tests**

Create `tests/unit/core/events.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createEventId, createStepId } from "../../../src/shared/ids";
import { MemoryEventStore } from "../../../src/core/events/memory-event-store";
import { StateReducer } from "../../../src/core/events/reducer";
import type { AgentEvent } from "../../../src/core/events/events";

function event(type: AgentEvent["type"], payload: Record<string, unknown> = {}): AgentEvent {
  return {
    id: createEventId(),
    sessionId: "session-1",
    taskId: "task-1",
    stepId: createStepId(),
    type,
    timestamp: 1,
    payload,
    visibility: "debug",
    correlationId: "corr-1"
  };
}

describe("event store and reducer", () => {
  it("stores events and reduces task status", async () => {
    const store = new MemoryEventStore();
    await store.append(event("TaskStarted", { taskText: "open settings" }));
    await store.append(event("PlanProduced", { activeSubgoal: "open settings" }));
    await store.append(event("TaskCompleted", { summary: "done" }));

    const events = await store.loadAfter("session-1", "task-1");
    const state = StateReducer.reduce(undefined, events);

    expect(state.runtimeStatus).toBe("completed");
    expect(state.activeSubgoal).toBe("open settings");
    expect(state.lastEventId).toBe(events.at(-1)?.id);
  });

  it("keeps pending consent from policy events", () => {
    const state = StateReducer.reduce(undefined, [
      event("TaskStarted"),
      event("PolicyEvaluated", {
        decision: { status: "ask_user", riskLevel: "medium", reasons: ["submit requires consent"] }
      })
    ]);

    expect(state.runtimeStatus).toBe("waiting");
    expect(state.pendingConsent?.riskLevel).toBe("medium");
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/unit/core/events.test.ts`

Expected: FAIL because event modules do not exist.

- [ ] **Step 3: Implement IDs and result helpers**

Create `src/shared/ids.ts`:

```ts
let counter = 0;

function next(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`;
}

export function createEventId(): string {
  return next("evt");
}

export function createStepId(): string {
  return next("step");
}

export function createTaskId(): string {
  return next("task");
}

export function createSessionId(): string {
  return next("session");
}
```

Create `src/shared/result.ts`:

```ts
export type Ok<T> = { ok: true; value: T };
export type Err<E extends string = string> = { ok: false; error: E; message: string };
export type Result<T, E extends string = string> = Ok<T> | Err<E>;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E extends string>(error: E, message: string): Err<E> {
  return { ok: false, error, message };
}
```

- [ ] **Step 4: Implement event types and snapshot types**

Create `src/core/events/events.ts`:

```ts
export type EventVisibility = "user" | "debug" | "internal";

export type AgentEventType =
  | "TaskStarted"
  | "TaskInterpreted"
  | "ObservationRequested"
  | "ObservationReceived"
  | "EvidenceAdded"
  | "PlanRequested"
  | "PlanProduced"
  | "CommandBound"
  | "PolicyEvaluated"
  | "UserConsentRequested"
  | "UserConsentResolved"
  | "CommandIssued"
  | "CommandResultReceived"
  | "VerificationProduced"
  | "MemoryUpdated"
  | "RecoverySuggested"
  | "TaskCompleted"
  | "TaskFailed"
  | "TaskStopped"
  | "ModelCallStarted"
  | "ModelCallProgress"
  | "ModelCallCompleted"
  | "ModelCallFailed"
  | "RuntimeSuspended"
  | "RuntimeResumed"
  | "ModelContractViolation"
  | "ScreenshotCaptured"
  | "VisionRequested"
  | "VisionCompleted"
  | "VisualEvidenceAdded";

export interface AgentEvent<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  sessionId: string;
  taskId: string;
  stepId: string;
  type: AgentEventType;
  timestamp: number;
  payload: TPayload;
  visibility: EventVisibility;
  correlationId: string;
}
```

Create `src/core/events/snapshot.ts`:

```ts
export type RuntimeStatus =
  | "idle"
  | "running"
  | "paused"
  | "waiting"
  | "completed"
  | "failed"
  | "stopped";

export interface PendingConsent {
  riskLevel: "low" | "medium" | "high" | "hard_block";
  reasons: string[];
}

export interface TaskSnapshot {
  sessionId: string;
  taskId: string;
  lastEventId?: string;
  runtimeStatus: RuntimeStatus;
  activeGoal?: string;
  activeSubgoal?: string;
  shortPlan: string[];
  knownEvidenceRefs: string[];
  memoryRefs: string[];
  failedAttempts: string[];
  pendingConsent?: PendingConsent;
}

export type TaskRuntimeState = TaskSnapshot;
```

- [ ] **Step 5: Implement memory store and reducer**

Create `src/core/events/memory-event-store.ts`:

```ts
import type { AgentEvent } from "./events";

export class MemoryEventStore {
  private readonly events: AgentEvent[] = [];

  async append(event: AgentEvent): Promise<void> {
    this.events.push(event);
  }

  async appendMany(events: AgentEvent[]): Promise<void> {
    this.events.push(...events);
  }

  async loadAfter(sessionId: string, taskId: string, eventId?: string): Promise<AgentEvent[]> {
    const taskEvents = this.events.filter((event) => event.sessionId === sessionId && event.taskId === taskId);
    if (!eventId) {
      return [...taskEvents];
    }
    const index = taskEvents.findIndex((event) => event.id === eventId);
    return index === -1 ? [...taskEvents] : taskEvents.slice(index + 1);
  }
}
```

Create `src/core/events/reducer.ts`:

```ts
import type { AgentEvent } from "./events";
import type { TaskRuntimeState, TaskSnapshot } from "./snapshot";

function initialFrom(event: AgentEvent): TaskRuntimeState {
  return {
    sessionId: event.sessionId,
    taskId: event.taskId,
    runtimeStatus: "idle",
    shortPlan: [],
    knownEvidenceRefs: [],
    memoryRefs: [],
    failedAttempts: []
  };
}

export class StateReducer {
  static reduce(snapshot: TaskSnapshot | undefined, events: AgentEvent[]): TaskRuntimeState {
    let state: TaskRuntimeState | undefined = snapshot ? { ...snapshot, shortPlan: [...snapshot.shortPlan] } : undefined;

    for (const event of events) {
      state ??= initialFrom(event);
      state.lastEventId = event.id;

      if (event.type === "TaskStarted") {
        state.runtimeStatus = "running";
      }
      if (event.type === "PlanProduced") {
        const shortPlan = event.payload.shortPlan;
        state.shortPlan = Array.isArray(shortPlan) ? shortPlan.map(String) : state.shortPlan;
        state.activeSubgoal = typeof event.payload.activeSubgoal === "string" ? event.payload.activeSubgoal : state.activeSubgoal;
      }
      if (event.type === "EvidenceAdded" && typeof event.payload.evidenceId === "string") {
        state.knownEvidenceRefs = Array.from(new Set([...state.knownEvidenceRefs, event.payload.evidenceId]));
      }
      if (event.type === "PolicyEvaluated") {
        const decision = event.payload.decision as { status?: string; riskLevel?: string; reasons?: string[] } | undefined;
        if (decision?.status === "ask_user") {
          state.runtimeStatus = "waiting";
          state.pendingConsent = {
            riskLevel: decision.riskLevel === "high" ? "high" : decision.riskLevel === "hard_block" ? "hard_block" : "medium",
            reasons: Array.isArray(decision.reasons) ? decision.reasons : []
          };
        }
      }
      if (event.type === "UserConsentResolved") {
        state.pendingConsent = undefined;
        state.runtimeStatus = "running";
      }
      if (event.type === "VerificationProduced" && event.payload.status === "failed") {
        state.failedAttempts = [...state.failedAttempts, event.id];
      }
      if (event.type === "TaskCompleted") {
        state.runtimeStatus = "completed";
      }
      if (event.type === "TaskFailed") {
        state.runtimeStatus = "failed";
      }
      if (event.type === "TaskStopped") {
        state.runtimeStatus = "stopped";
      }
    }

    return state ?? {
      sessionId: "unknown",
      taskId: "unknown",
      runtimeStatus: "idle",
      shortPlan: [],
      knownEvidenceRefs: [],
      memoryRefs: [],
      failedAttempts: []
    };
  }
}
```

- [ ] **Step 6: Run tests**

Run: `npm test -- tests/unit/core/events.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/shared src/core/events tests/unit/core/events.test.ts
git commit -m "feat: add event log reducer"
```

---

### Task 3: Model Configuration, Contracts, And Context Budgeting

**Files:**
- Create: `src/core/model/config.ts`
- Create: `src/core/model/contracts.ts`
- Create: `src/core/model/role-router.ts`
- Create: `src/core/context/budget.ts`
- Create: `src/core/context/assembler.ts`
- Test: `tests/unit/core/model-context.test.ts`

**Interfaces:**
- Produces: `GlobalModelConfig`, `resolveRoleModel(config, role)`, `validatePlannerDecision(value)`.
- Produces: `ContextAssembler.assemblePlannerContext(input)`.
- Consumed by: LLM adapter, AgentRuntime, Settings UI.

- [ ] **Step 1: Write failing model/context tests**

Create `tests/unit/core/model-context.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { assemblePlannerContext } from "../../../src/core/context/assembler";
import { resolveRoleModel } from "../../../src/core/model/role-router";
import { validatePlannerDecision } from "../../../src/core/model/contracts";
import type { GlobalModelConfig } from "../../../src/core/model/config";

const config: GlobalModelConfig = {
  provider: { baseUrl: "https://api.example.com/v1", apiKeyRef: "key-1", compatibilityMode: "openai", defaultHeaders: {} },
  roleModels: { plannerModel: "planner-a", visionModel: "vision-a" },
  capabilities: {
    supportsStreaming: true,
    supportsJsonMode: true,
    supportsToolUse: false,
    supportsVisionInput: true,
    supportsReasoningSummary: false,
    maxContextTokens: 1200,
    maxOutputTokens: 200
  },
  runtime: {
    planner: { requestTimeoutMs: 60000, firstTokenTimeoutMs: 15000, maxRetries: 1, contractRepairAttempts: 1 },
    vision: { requestTimeoutMs: 45000, firstTokenTimeoutMs: 15000, maxRetries: 0, minIntervalMs: 750, maxCallsPerStep: 1 },
    verifier: { requestTimeoutMs: 15000, firstTokenTimeoutMs: 5000, maxRetries: 0 },
    summarizer: { requestTimeoutMs: 20000, firstTokenTimeoutMs: 8000, maxRetries: 0 }
  },
  contextBudget: {
    plannerMaxInputTokens: 400,
    visionMaxInputTokens: 300,
    verifierMaxInputTokens: 200,
    summarizerMaxInputTokens: 300,
    reservedOutputTokens: 120,
    evidenceLimit: 3,
    recentEventLimit: 2,
    observationCandidateLimit: 2,
    rawExcerptLimit: 120,
    compressionStrategy: "evidence_first"
  },
  logging: { level: "summary", storeRawModelRequests: false, storeRawModelResponses: false, storeScreenshotImages: false },
  privacy: { redactSensitiveValues: true, sendScreenshotsToRemoteVision: true }
};

describe("model role routing and context assembly", () => {
  it("uses planner model as optional verifier fallback", () => {
    expect(resolveRoleModel(config, "planner")?.model).toBe("planner-a");
    expect(resolveRoleModel(config, "verifier")?.model).toBe("planner-a");
    expect(resolveRoleModel(config, "vision")?.model).toBe("vision-a");
  });

  it("validates planner decisions and rejects primitive-only actions", () => {
    const result = validatePlannerDecision({
      taskUnderstanding: "open settings",
      activeSubgoal: "open panel",
      shortPlan: ["find settings", "open panel"],
      nextCommand: { type: "ActivateTarget", targetGoal: "settings icon", inputs: {} },
      expectedOutcome: "settings panel opens",
      successCriteria: ["panel_visible"],
      riskHint: "low",
      missingInfo: [],
      assumptions: [],
      reasoningSummary: "settings is visible"
    });
    expect(result.ok).toBe(true);

    const bad = validatePlannerDecision({
      nextCommand: { type: "coordinate_click", x: 10, y: 20 }
    });
    expect(bad.ok).toBe(false);
  });

  it("compresses planner context by preserving schema and limiting candidates", () => {
    const context = assemblePlannerContext({
      config,
      taskText: "Open settings",
      activeSubgoal: "Find settings icon",
      focusedObservation: {
        pageIdentity: "Fixture page",
        candidates: [
          { id: "c1", label: "Settings", role: "button", confidence: 0.9 },
          { id: "c2", label: "Help", role: "button", confidence: 0.8 },
          { id: "c3", label: "Footer", role: "button", confidence: 0.2 }
        ]
      },
      evidence: [
        { id: "e1", claim: "Settings button exists", confidence: 0.9 },
        { id: "e2", claim: "Help button exists", confidence: 0.7 },
        { id: "e3", claim: "Footer is unrelated", confidence: 0.2 },
        { id: "e4", claim: "Old expired item", confidence: 0.1 }
      ],
      recentEvents: ["observed page", "planned action", "old event"],
      schema: { type: "PlannerDecision" }
    });

    expect(context.candidates).toHaveLength(2);
    expect(context.evidence).toHaveLength(3);
    expect(context.schema.type).toBe("PlannerDecision");
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/unit/core/model-context.test.ts`

Expected: FAIL because model and context modules do not exist.

- [ ] **Step 3: Implement model config and role routing**

Create `src/core/model/config.ts`:

```ts
export type ModelRole = "planner" | "vision" | "verifier" | "summarizer";
export type CompatibilityMode = "openai" | "openai_compatible";

export interface ProviderConfig {
  baseUrl: string;
  apiKeyRef: string;
  compatibilityMode: CompatibilityMode;
  defaultHeaders: Record<string, string>;
}

export interface RoleModelConfig {
  plannerModel: string;
  visionModel?: string;
  verifierModel?: string;
  summarizerModel?: string;
}

export interface ModelCapabilities {
  supportsStreaming: boolean;
  supportsJsonMode: boolean;
  supportsToolUse: boolean;
  supportsVisionInput: boolean;
  supportsReasoningSummary: boolean;
  maxContextTokens: number;
  maxOutputTokens: number;
}

export interface RoleRuntimeConfig {
  requestTimeoutMs: number;
  firstTokenTimeoutMs: number;
  maxRetries: number;
  contractRepairAttempts?: number;
  minIntervalMs?: number;
  maxCallsPerStep?: number;
}

export interface ContextBudgetConfig {
  plannerMaxInputTokens: number;
  visionMaxInputTokens: number;
  verifierMaxInputTokens: number;
  summarizerMaxInputTokens: number;
  reservedOutputTokens: number;
  evidenceLimit: number;
  recentEventLimit: number;
  observationCandidateLimit: number;
  rawExcerptLimit: number;
  compressionStrategy: "evidence_first";
}

export interface ModelLoggingConfig {
  level: "summary" | "debug" | "raw" | "sensitive";
  storeRawModelRequests: boolean;
  storeRawModelResponses: boolean;
  storeScreenshotImages: boolean;
}

export interface ModelPrivacyConfig {
  redactSensitiveValues: boolean;
  sendScreenshotsToRemoteVision: boolean;
}

export interface GlobalModelConfig {
  provider: ProviderConfig;
  roleModels: RoleModelConfig;
  capabilities: ModelCapabilities;
  runtime: {
    planner: RoleRuntimeConfig;
    vision: RoleRuntimeConfig;
    verifier: RoleRuntimeConfig;
    summarizer: RoleRuntimeConfig;
  };
  contextBudget: ContextBudgetConfig;
  logging: ModelLoggingConfig;
  privacy: ModelPrivacyConfig;
}
```

Create `src/core/model/role-router.ts`:

```ts
import type { GlobalModelConfig, ModelRole } from "./config";

export interface ResolvedRoleModel {
  role: ModelRole;
  model: string;
  useModel: "always" | "when_triggered" | "only_when_inconclusive" | "only_when_requested_or_complex";
}

export function resolveRoleModel(config: GlobalModelConfig, role: ModelRole): ResolvedRoleModel | undefined {
  if (role === "planner") {
    return { role, model: config.roleModels.plannerModel, useModel: "always" };
  }
  if (role === "vision") {
    return config.roleModels.visionModel
      ? { role, model: config.roleModels.visionModel, useModel: "when_triggered" }
      : undefined;
  }
  if (role === "verifier") {
    return {
      role,
      model: config.roleModels.verifierModel ?? config.roleModels.plannerModel,
      useModel: "only_when_inconclusive"
    };
  }
  return {
    role,
    model: config.roleModels.summarizerModel ?? config.roleModels.plannerModel,
    useModel: "only_when_requested_or_complex"
  };
}
```

- [ ] **Step 4: Implement contract validation**

Create `src/core/model/contracts.ts`:

```ts
import { err, ok, type Result } from "../../shared/result";

const semanticCommands = new Set([
  "NavigateTo",
  "ActivateTarget",
  "FillField",
  "ScrollRegion",
  "ReadContent",
  "OpenTab",
  "SwitchTab",
  "WaitForChange",
  "AskUser",
  "FinishTask",
  "SelectOption",
  "SubmitCurrentForm"
]);

export interface PlannerDecision {
  taskUnderstanding: string;
  activeSubgoal: string;
  shortPlan: string[];
  nextCommand: {
    type: string;
    targetGoal?: string;
    inputs?: Record<string, unknown>;
  };
  expectedOutcome: string;
  successCriteria: string[];
  riskHint: "low" | "medium" | "high";
  missingInfo: string[];
  assumptions: string[];
  reasoningSummary: string;
}

export function validatePlannerDecision(value: unknown): Result<PlannerDecision, "invalid_contract"> {
  if (!value || typeof value !== "object") {
    return err("invalid_contract", "Planner decision must be an object");
  }
  const candidate = value as Partial<PlannerDecision>;
  if (!candidate.nextCommand || typeof candidate.nextCommand.type !== "string") {
    return err("invalid_contract", "Planner decision requires nextCommand.type");
  }
  if (candidate.nextCommand.type.includes("coordinate") || candidate.nextCommand.type.startsWith("dom_")) {
    return err("invalid_contract", "Planner must output semantic commands, not primitive actions");
  }
  if (!semanticCommands.has(candidate.nextCommand.type)) {
    return err("invalid_contract", `Unsupported semantic command: ${candidate.nextCommand.type}`);
  }
  if (typeof candidate.expectedOutcome !== "string" || candidate.expectedOutcome.length === 0) {
    return err("invalid_contract", "Planner decision requires expectedOutcome");
  }
  if (!Array.isArray(candidate.successCriteria) || candidate.successCriteria.length === 0) {
    return err("invalid_contract", "Planner decision requires successCriteria");
  }
  return ok({
    taskUnderstanding: String(candidate.taskUnderstanding ?? ""),
    activeSubgoal: String(candidate.activeSubgoal ?? ""),
    shortPlan: Array.isArray(candidate.shortPlan) ? candidate.shortPlan.map(String) : [],
    nextCommand: candidate.nextCommand,
    expectedOutcome: candidate.expectedOutcome,
    successCriteria: candidate.successCriteria.map(String),
    riskHint: candidate.riskHint === "high" || candidate.riskHint === "medium" ? candidate.riskHint : "low",
    missingInfo: Array.isArray(candidate.missingInfo) ? candidate.missingInfo.map(String) : [],
    assumptions: Array.isArray(candidate.assumptions) ? candidate.assumptions.map(String) : [],
    reasoningSummary: String(candidate.reasoningSummary ?? "")
  });
}
```

- [ ] **Step 5: Implement context budgeting and assembler**

Create `src/core/context/budget.ts`:

```ts
export function roughTokenCount(value: unknown): number {
  return Math.ceil(JSON.stringify(value).length / 4);
}

export function takeTopByConfidence<T extends { confidence?: number }>(items: T[], limit: number): T[] {
  return [...items].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)).slice(0, limit);
}
```

Create `src/core/context/assembler.ts`:

```ts
import type { GlobalModelConfig } from "../model/config";
import { takeTopByConfidence } from "./budget";

interface ContextCandidate {
  id: string;
  label: string;
  role: string;
  confidence: number;
}

interface ContextEvidence {
  id: string;
  claim: string;
  confidence: number;
}

export interface PlannerContextInput {
  config: GlobalModelConfig;
  taskText: string;
  activeSubgoal: string;
  focusedObservation: {
    pageIdentity: string;
    candidates: ContextCandidate[];
  };
  evidence: ContextEvidence[];
  recentEvents: string[];
  schema: Record<string, unknown>;
}

export interface PlannerContext {
  taskText: string;
  activeSubgoal: string;
  pageIdentity: string;
  candidates: ContextCandidate[];
  evidence: ContextEvidence[];
  recentEvents: string[];
  schema: Record<string, unknown>;
}

export function assemblePlannerContext(input: PlannerContextInput): PlannerContext {
  const budget = input.config.contextBudget;
  return {
    taskText: input.taskText,
    activeSubgoal: input.activeSubgoal,
    pageIdentity: input.focusedObservation.pageIdentity,
    candidates: takeTopByConfidence(input.focusedObservation.candidates, budget.observationCandidateLimit),
    evidence: takeTopByConfidence(input.evidence, budget.evidenceLimit),
    recentEvents: input.recentEvents.slice(-budget.recentEventLimit),
    schema: input.schema
  };
}
```

- [ ] **Step 6: Run tests**

Run: `npm test -- tests/unit/core/model-context.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/model src/core/context tests/unit/core/model-context.test.ts
git commit -m "feat: add model config and context assembly"
```

---

### Task 4: Observation, PageModel, And Evidence

**Files:**
- Create: `src/core/observation/page-model.ts`
- Create: `src/core/observation/focus.ts`
- Create: `src/core/evidence/evidence.ts`
- Create: `src/core/evidence/manager.ts`
- Create: `src/adapters/content/dom-observer.ts`
- Test: `tests/unit/core/observation-evidence.test.ts`

**Interfaces:**
- Produces: `PageModel`, `ControlCandidate`, `FocusedObservation`, `Evidence`.
- Produces: `observePage(document): PageModel`.
- Consumed by: Binder, Planner context assembler, Evidence tab, Overlay.

- [ ] **Step 1: Write failing observation/evidence tests**

Create `tests/unit/core/observation-evidence.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { observePage } from "../../../src/adapters/content/dom-observer";
import { EvidenceManager } from "../../../src/core/evidence/manager";
import { focusObservation } from "../../../src/core/observation/focus";

describe("page observation and evidence", () => {
  it("extracts semantic controls from DOM", () => {
    document.body.innerHTML = `
      <main>
        <button id="settings" aria-label="Settings">⚙</button>
        <label for="email">Email</label>
        <input id="email" type="email" required />
        <div role="alert">Email is required</div>
      </main>
    `;
    document.title = "Fixture";

    const page = observePage(document);

    expect(page.controls.some((control) => control.label === "Settings")).toBe(true);
    expect(page.controls.some((control) => control.label === "Email" && control.required)).toBe(true);
    expect(page.feedback).toContain("Email is required");
  });

  it("focuses candidates and emits control evidence", () => {
    document.body.innerHTML = `<button id="settings" aria-label="Settings">⚙</button>`;
    const page = observePage(document);
    const focused = focusObservation(page, "settings");
    const evidence = new EvidenceManager().fromPageModel(page, "evt_observed");

    expect(focused.candidates).toHaveLength(1);
    expect(evidence.some((item) => item.kind === "control_presence" && item.claim.includes("Settings"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify failure**

Run: `npm test -- tests/unit/core/observation-evidence.test.ts`

Expected: FAIL because observation/evidence modules do not exist.

- [ ] **Step 3: Implement PageModel and FocusedObservation types**

Create `src/core/observation/page-model.ts` with:

```ts
export interface LocatorHint {
  kind: "css" | "text" | "role";
  value: string;
}

export interface ControlCandidate {
  semanticId: string;
  role: string;
  label: string;
  accessibleName: string;
  valueState?: string;
  required: boolean;
  validation?: string;
  regionRef?: string;
  visibility: "visible" | "hidden";
  interactionHints: string[];
  locatorHints: LocatorHint[];
  confidence: number;
}

export interface PageModel {
  pageIdentity: {
    url: string;
    title: string;
  };
  controls: ControlCandidate[];
  feedback: string[];
  readableContent: string[];
}
```

Create `src/core/observation/focus.ts` with a function:

```ts
import type { ControlCandidate, PageModel } from "./page-model";

export interface FocusedObservation {
  pageIdentity: string;
  candidates: ControlCandidate[];
  feedback: string[];
}

export function focusObservation(page: PageModel, query: string): FocusedObservation {
  const lowered = query.toLowerCase();
  const candidates = page.controls.filter((control) => {
    const text = `${control.label} ${control.accessibleName} ${control.role}`.toLowerCase();
    return text.includes(lowered) || lowered.includes(control.label.toLowerCase());
  });
  return {
    pageIdentity: `${page.pageIdentity.title} ${page.pageIdentity.url}`,
    candidates: candidates.length > 0 ? candidates : page.controls.slice(0, 20),
    feedback: page.feedback
  };
}
```

- [ ] **Step 4: Implement Evidence types and manager**

Create `src/core/evidence/evidence.ts`:

```ts
export type EvidenceKind =
  | "page_identity"
  | "control_presence"
  | "control_value"
  | "validation_feedback"
  | "navigation_state"
  | "content_fact"
  | "action_effect"
  | "user_provided_value"
  | "permission_state"
  | "risk_signal"
  | "failure_reason"
  | "visual_target";

export interface Evidence {
  id: string;
  kind: EvidenceKind;
  claim: string;
  source: string;
  confidence: number;
  observedAt: number;
  relatedGoalId?: string;
  relatedCommandId?: string;
  expiresAt?: number;
  visibility: "user" | "debug" | "internal";
}
```

Create `src/core/evidence/manager.ts`:

```ts
import { createEventId } from "../../shared/ids";
import type { PageModel } from "../observation/page-model";
import type { Evidence } from "./evidence";

export class EvidenceManager {
  fromPageModel(page: PageModel, sourceEventId: string): Evidence[] {
    const now = Date.now();
    const pageEvidence: Evidence = {
      id: createEventId(),
      kind: "page_identity",
      claim: `Current page is ${page.pageIdentity.title}`,
      source: sourceEventId,
      confidence: 0.8,
      observedAt: now,
      visibility: "debug"
    };

    const controls = page.controls.map((control) => ({
      id: createEventId(),
      kind: "control_presence" as const,
      claim: `Visible ${control.role} "${control.label || control.accessibleName}" exists`,
      source: sourceEventId,
      confidence: control.confidence,
      observedAt: now,
      visibility: "debug" as const
    }));

    return [pageEvidence, ...controls];
  }
}
```

- [ ] **Step 5: Implement DOM observer adapter**

Create `src/adapters/content/dom-observer.ts` with deterministic DOM extraction:

```ts
import type { ControlCandidate, PageModel } from "../../core/observation/page-model";

function textOf(element: Element): string {
  return (element.textContent ?? "").replace(/\s+/g, " ").trim();
}

function labelFor(element: HTMLElement): string {
  const aria = element.getAttribute("aria-label");
  if (aria) return aria.trim();
  if (element.id) {
    const label = element.ownerDocument.querySelector(`label[for="${CSS.escape(element.id)}"]`);
    if (label) return textOf(label);
  }
  const wrappingLabel = element.closest("label");
  if (wrappingLabel) return textOf(wrappingLabel);
  return textOf(element) || element.getAttribute("placeholder") || element.getAttribute("title") || "";
}

function roleFor(element: HTMLElement): string {
  return element.getAttribute("role") || element.tagName.toLowerCase();
}

export function observePage(document: Document): PageModel {
  const selector = "button, a[href], input, textarea, select, [role='button'], [tabindex]";
  const controls: ControlCandidate[] = Array.from(document.querySelectorAll<HTMLElement>(selector)).map((element, index) => {
    const label = labelFor(element);
    const role = roleFor(element);
    return {
      semanticId: `control_${index}_${role}_${label.toLowerCase().replace(/[^a-z0-9]+/gi, "_").slice(0, 24)}`,
      role,
      label,
      accessibleName: element.getAttribute("aria-label") || label,
      valueState: "value" in element ? String((element as HTMLInputElement).value ?? "") : undefined,
      required: element.hasAttribute("required") || element.getAttribute("aria-required") === "true",
      validation: "validationMessage" in element ? (element as HTMLInputElement).validationMessage : undefined,
      visibility: element.offsetParent === null && element.getClientRects().length === 0 ? "hidden" : "visible",
      interactionHints: [element.tagName.toLowerCase()],
      locatorHints: [{ kind: "css", value: element.id ? `#${element.id}` : `${element.tagName.toLowerCase()}:nth-of-type(${index + 1})` }],
      confidence: label ? 0.85 : 0.45
    };
  });

  return {
    pageIdentity: { url: document.location.href, title: document.title },
    controls,
    feedback: Array.from(document.querySelectorAll("[role='alert'], [aria-live], .error, .toast")).map(textOf).filter(Boolean),
    readableContent: Array.from(document.querySelectorAll("h1,h2,h3,p,li")).map(textOf).filter(Boolean).slice(0, 50)
  };
}
```

- [ ] **Step 6: Run tests and typecheck**

Run: `npm test -- tests/unit/core/observation-evidence.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/observation src/core/evidence src/adapters/content/dom-observer.ts tests/unit/core/observation-evidence.test.ts
git commit -m "feat: add page observation and evidence"
```

---

### Task 5: Semantic Commands, Binder, And Primitive Executor Contracts

**Files:**
- Create: `src/core/commands/commands.ts`
- Create: `src/core/commands/binder.ts`
- Create: `src/adapters/content/primitive-executor.ts`
- Test: `tests/unit/core/commands-binder.test.ts`

**Interfaces:**
- Produces: `SemanticCommand`, `BoundCommand`, `BrowserPrimitive`.
- Produces: `bindCommand(command, pageModel, visualCandidates?): Result<BoundCommand, BindingError>`.
- Consumed by: Runtime, PolicyEngine, Content primitive executor, Current Action Bar.

- [ ] **Step 1: Write failing binder tests**

Create `tests/unit/core/commands-binder.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createEventId } from "../../../src/shared/ids";
import { bindCommand } from "../../../src/core/commands/binder";
import type { SemanticCommand } from "../../../src/core/commands/commands";
import type { PageModel } from "../../../src/core/observation/page-model";

function command(targetGoal: string, type: SemanticCommand["type"] = "ActivateTarget"): SemanticCommand {
  return {
    id: createEventId(),
    type,
    targetGoal,
    inputs: {},
    expectedOutcome: "target activates",
    successCriteria: ["target_activated"],
    riskHint: "low",
    fallbackHints: []
  };
}

const page: PageModel = {
  pageIdentity: { url: "https://example.test", title: "Fixture" },
  feedback: [],
  readableContent: [],
  controls: [
    {
      semanticId: "settings_button",
      role: "button",
      label: "Settings",
      accessibleName: "Settings",
      required: false,
      visibility: "visible",
      interactionHints: ["button"],
      locatorHints: [{ kind: "css", value: "#settings" }],
      confidence: 0.9
    }
  ]
};

describe("command binder", () => {
  it("binds a semantic target to a DOM click primitive", () => {
    const result = bindCommand(command("Settings icon"), page);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.primitive).toEqual({ type: "dom_click", semanticId: "settings_button" });
      expect(result.value.confidence).toBeGreaterThan(0.7);
    }
  });

  it("rejects ambiguous targets", () => {
    const ambiguous: PageModel = {
      ...page,
      controls: [
        { ...page.controls[0], semanticId: "save_top", label: "Save", accessibleName: "Save" },
        { ...page.controls[0], semanticId: "save_bottom", label: "Save", accessibleName: "Save" }
      ]
    };

    const result = bindCommand(command("Save button", "SubmitCurrentForm"), ambiguous);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("ambiguous_target");
    }
  });
});
```

- [ ] **Step 2: Implement command types**

Create `src/core/commands/commands.ts`:

```ts
export type SemanticCommandType =
  | "NavigateTo"
  | "ActivateTarget"
  | "FillField"
  | "ScrollRegion"
  | "ReadContent"
  | "OpenTab"
  | "SwitchTab"
  | "WaitForChange"
  | "AskUser"
  | "FinishTask"
  | "SelectOption"
  | "SubmitCurrentForm";

export interface SemanticCommand {
  id: string;
  type: SemanticCommandType;
  targetGoal: string;
  inputs: Record<string, unknown>;
  expectedOutcome: string;
  successCriteria: string[];
  riskHint: "low" | "medium" | "high";
  fallbackHints: string[];
}

export type BrowserPrimitive =
  | { type: "dom_click"; semanticId: string }
  | { type: "dom_input"; semanticId: string; value: string }
  | { type: "scroll"; direction: "up" | "down"; amount: number }
  | { type: "wait"; milliseconds: number }
  | { type: "capture_screenshot" }
  | { type: "coordinate_click"; x: number; y: number };

export interface BoundCommand {
  semanticCommandId: string;
  targetRef?: string;
  primitive: BrowserPrimitive;
  confidence: number;
  alternatives: string[];
  bindingEvidenceRefs: string[];
  expiresOn: "navigation" | "reload" | "step_end";
}
```

- [ ] **Step 3: Implement binder**

Create `src/core/commands/binder.ts` with exact failure reasons `target_not_found`, `ambiguous_target`, `target_not_interactable`, `needs_more_observation`, `requires_user_choice`.

Implement scoring by comparing command `targetGoal` to candidate label, accessible name, role, and visual candidate label. Prefer DOM primitive `dom_click` or `dom_input`; only return `coordinate_click` if no DOM candidate exists and a visual candidate exceeds confidence `0.85`.

- [ ] **Step 4: Implement primitive executor adapter**

Create `src/adapters/content/primitive-executor.ts` with `executePrimitive(primitive, pageModel)` for `dom_click`, `dom_input`, `scroll`, and `wait`. It must return:

```ts
export interface PrimitiveResult {
  status: "success" | "failed";
  reason?: string;
  details: Record<string, unknown>;
}
```

- [ ] **Step 5: Run tests**

Run: `npm test -- tests/unit/core/commands-binder.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/commands src/adapters/content/primitive-executor.ts tests/unit/core/commands-binder.test.ts
git commit -m "feat: add semantic command binding"
```

---

### Task 6: Policy Engine, Consent Scope, And Safety Modes

**Files:**
- Create: `src/core/policy/consent.ts`
- Create: `src/core/policy/policy.ts`
- Test: `tests/unit/core/policy.test.ts`

**Interfaces:**
- Produces: `PolicyDecision`.
- Produces: `evaluatePolicy(command, context): PolicyDecision`.
- Consumed by: AgentRuntime, Sidepanel safety confirmation card.

- [ ] **Step 1: Write failing policy tests**

Create `tests/unit/core/policy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { evaluatePolicy } from "../../../src/core/policy/policy";
import type { SemanticCommand } from "../../../src/core/commands/commands";
import type { ConsentScope } from "../../../src/core/policy/consent";

function command(type: SemanticCommand["type"], targetGoal = "submit form"): SemanticCommand {
  return {
    id: "cmd_1",
    type,
    targetGoal,
    inputs: {},
    expectedOutcome: "done",
    successCriteria: ["done"],
    riskHint: type === "SubmitCurrentForm" ? "medium" : "low",
    fallbackHints: []
  };
}

const consent: ConsentScope = {
  taskId: "task-1",
  origin: "https://example.test",
  pageIdentity: "Fixture",
  commandTypes: ["SubmitCurrentForm"],
  dataCategories: ["test_data"],
  expiresAt: Date.now() + 60_000
};

describe("policy engine", () => {
  it("allows task-scoped submit consent in balanced mode", () => {
    const decision = evaluatePolicy(command("SubmitCurrentForm"), {
      safetyMode: "balanced",
      consentScope: consent,
      origin: "https://example.test",
      pageIdentity: "Fixture"
    });

    expect(decision.status).toBe("allow");
  });

  it("asks for ambiguous submit without consent", () => {
    const decision = evaluatePolicy(command("SubmitCurrentForm"), {
      safetyMode: "balanced",
      origin: "https://example.test",
      pageIdentity: "Fixture"
    });

    expect(decision.status).toBe("ask_user");
    expect(decision.requiredUserPrompt).toContain("submit");
  });

  it("hard-blocks payment even in experimental full auto", () => {
    const decision = evaluatePolicy(command("ActivateTarget", "Pay now"), {
      safetyMode: "experimental_full_auto",
      origin: "https://example.test",
      pageIdentity: "Checkout"
    });

    expect(decision.status).toBe("hard_block");
  });
});
```

- [ ] **Step 2: Implement consent types**

Create `src/core/policy/consent.ts` with:

```ts
export interface ConsentScope {
  taskId: string;
  origin: string;
  pageIdentity: string;
  commandTypes: string[];
  dataCategories: string[];
  expiresAt: number;
}

export function scopeAllows(scope: ConsentScope | undefined, commandType: string, now = Date.now()): boolean {
  return Boolean(scope && scope.expiresAt > now && scope.commandTypes.includes(commandType));
}
```

- [ ] **Step 3: Implement policy engine**

Create `src/core/policy/policy.ts` with safety modes, risk levels, hard blocks, and `evaluatePolicy`.

Required output:

```ts
export interface PolicyDecision {
  status: "allow" | "ask_user" | "block" | "hard_block";
  riskLevel: "low" | "medium" | "high" | "hard_block";
  reasons: string[];
  consentScopeRef?: string;
  redactions: string[];
  requiredUserPrompt?: string;
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test -- tests/unit/core/policy.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/policy tests/unit/core/policy.test.ts
git commit -m "feat: add scoped safety policy"
```

---

### Task 7: Verifier, Session Memory, And Task Interpreter

**Files:**
- Create: `src/core/verification/verifier.ts`
- Create: `src/core/memory/session-memory.ts`
- Create: `src/core/runtime/task-interpreter.ts`
- Test: `tests/unit/core/verifier-memory.test.ts`

**Interfaces:**
- Produces: `verifyOutcome(input): VerificationResult`.
- Produces: `SessionMemoryStore`.
- Produces: `interpretTask(taskText): TaskFrame`.
- Consumed by: AgentRuntime and Sidepanel Evidence tab.

- [ ] **Step 1: Write failing verifier and memory tests**

Create `tests/unit/core/verifier-memory.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { interpretTask } from "../../../src/core/runtime/task-interpreter";
import { SessionMemoryStore } from "../../../src/core/memory/session-memory";
import { verifyOutcome } from "../../../src/core/verification/verifier";
import type { SemanticCommand } from "../../../src/core/commands/commands";
import type { PageModel } from "../../../src/core/observation/page-model";

function fillCommand(): SemanticCommand {
  return {
    id: "cmd_fill",
    type: "FillField",
    targetGoal: "Email",
    inputs: { value: "alice@example.com" },
    expectedOutcome: "Email field contains alice@example.com",
    successCriteria: ["control_value_matches"],
    riskHint: "low",
    fallbackHints: []
  };
}

function pageWithEmail(value: string, feedback: string[] = []): PageModel {
  return {
    pageIdentity: { url: "https://example.test/form", title: "Form" },
    readableContent: [],
    feedback,
    controls: [
      {
        semanticId: "email",
        role: "input",
        label: "Email",
        accessibleName: "Email",
        valueState: value,
        required: true,
        visibility: "visible",
        interactionHints: ["input"],
        locatorHints: [{ kind: "css", value: "#email" }],
        confidence: 0.9
      }
    ]
  };
}

describe("verifier, memory, and task interpretation", () => {
  it("verifies field fill by matching control value", () => {
    const result = verifyOutcome({
      command: fillCommand(),
      before: pageWithEmail(""),
      after: pageWithEmail("alice@example.com"),
      primitiveResult: { status: "success", details: {} }
    });

    expect(result.status).toBe("success");
    expect(result.satisfiedCriteria).toContain("control_value_matches");
  });

  it("treats validation feedback after submit as partial progress", () => {
    const submit: SemanticCommand = {
      ...fillCommand(),
      id: "cmd_submit",
      type: "SubmitCurrentForm",
      targetGoal: "current form submit",
      expectedOutcome: "form submitted or validation shown",
      successCriteria: ["submission_feedback_or_validation"],
      riskHint: "medium"
    };

    const result = verifyOutcome({
      command: submit,
      before: pageWithEmail("alice@example.com"),
      after: pageWithEmail("alice@example.com", ["Name is required"]),
      primitiveResult: { status: "success", details: {} }
    });

    expect(result.status).toBe("partial");
    expect(result.failureReason).toBe("validation_error");
  });

  it("records submit prohibition from task text", () => {
    const frame = interpretTask("Fill this form but do not submit");

    expect(frame.deniedCommandTypes).toContain("SubmitCurrentForm");
  });

  it("stores verified facts and ignores missing kinds", () => {
    const memory = new SessionMemoryStore();
    memory.addFact({
      id: "mem_1",
      kind: "created_record",
      value: { label: "Alice" },
      sourceEvidenceRefs: ["ev_success"],
      confidence: 0.9,
      sensitivity: "public",
      scope: "current_session",
      expiresAt: Date.now() + 60_000
    });

    expect(memory.findByKind("created_record")).toHaveLength(1);
    expect(memory.findByKind("failed_record")).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Implement deterministic verifier**

Create `src/core/verification/verifier.ts` with:

```ts
export interface VerificationResult {
  status: "success" | "partial" | "failed" | "inconclusive";
  confidence: number;
  satisfiedCriteria: string[];
  failedCriteria: string[];
  newEvidence: string[];
  failureReason?: string;
  recoveryHints: string[];
}
```

Implement deterministic checks for:

- `control_value_matches`
- `submission_feedback_or_validation`
- `page_changed`
- `target_visible`

- [ ] **Step 3: Implement session memory**

Create `src/core/memory/session-memory.ts` with `MemoryFact` and `SessionMemoryStore.addFact`, `findByKind`, `clear`.

- [ ] **Step 4: Implement task interpreter**

Create `src/core/runtime/task-interpreter.ts` with `TaskFrame`:

```ts
export interface TaskFrame {
  taskText: string;
  allowedCommandTypes: string[];
  deniedCommandTypes: string[];
  providedValues: Record<string, string>;
  initialProfile: "GeneralBrowsingProfile" | "LightFormProfile";
}
```

Use simple keyword rules for first version: "do not submit" denies `SubmitCurrentForm`; "submit", "save", or "create" allows it.

- [ ] **Step 5: Run tests**

Run: `npm test -- tests/unit/core/verifier-memory.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/verification src/core/memory src/core/runtime/task-interpreter.ts tests/unit/core/verifier-memory.test.ts
git commit -m "feat: add verification and session memory"
```

---

### Task 8: Agent Runtime Vertical Loop With Stub Planner

**Files:**
- Create: `src/core/runtime/agent-runtime.ts`
- Create: `src/core/capabilities/registry.ts`
- Test: `tests/unit/core/agent-runtime.test.ts`

**Interfaces:**
- Produces: `AgentRuntime.startTask(taskText)` and `AgentRuntime.runNextStep()`.
- Consumes: event store, observer port, planner port, binder, policy, executor port, verifier.
- Produces: event sequence from `TaskStarted` through `VerificationProduced`.

- [ ] **Step 1: Write failing runtime tests**

Create `tests/unit/core/agent-runtime.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MemoryEventStore } from "../../../src/core/events/memory-event-store";
import { AgentRuntime } from "../../../src/core/runtime/agent-runtime";
import type { PageModel } from "../../../src/core/observation/page-model";

const page: PageModel = {
  pageIdentity: { url: "https://example.test", title: "Fixture" },
  feedback: [],
  readableContent: [],
  controls: [
    {
      semanticId: "settings_button",
      role: "button",
      label: "Settings",
      accessibleName: "Settings",
      required: false,
      visibility: "visible",
      interactionHints: ["button"],
      locatorHints: [{ kind: "css", value: "#settings" }],
      confidence: 0.9
    }
  ]
};

describe("AgentRuntime", () => {
  it("runs one observe-plan-bind-policy-execute-verify step", async () => {
    const store = new MemoryEventStore();
    const runtime = new AgentRuntime({
      sessionId: "session-1",
      taskId: "task-1",
      appendEvent: (event) => store.append(event),
      observePage: async () => page,
      plan: async () => ({
        taskUnderstanding: "open settings",
        activeSubgoal: "open settings panel",
        shortPlan: ["find settings", "open settings"],
        nextCommand: {
          id: "cmd_1",
          type: "ActivateTarget",
          targetGoal: "Settings",
          inputs: {},
          expectedOutcome: "settings panel opens",
          successCriteria: ["target_activated"],
          riskHint: "low",
          fallbackHints: []
        },
        expectedOutcome: "settings panel opens",
        successCriteria: ["target_activated"],
        riskHint: "low",
        missingInfo: [],
        assumptions: [],
        reasoningSummary: "Settings button is visible"
      }),
      execute: async () => ({ status: "success", details: { clicked: true } })
    });

    await runtime.startTask("Open settings");
    await runtime.runNextStep();

    const events = await store.loadAfter("session-1", "task-1");
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "TaskStarted",
        "ObservationReceived",
        "EvidenceAdded",
        "PlanProduced",
        "CommandBound",
        "PolicyEvaluated",
        "CommandIssued",
        "CommandResultReceived",
        "VerificationProduced"
      ])
    );
  });
});
```

- [ ] **Step 2: Implement capability registry**

Create `src/core/capabilities/registry.ts` with initial capability IDs:

```ts
export const initialCapabilities = [
  "BrowserBasicCapability",
  "PageReadingCapability",
  "FormBasicCapability",
  "FeedbackCapability",
  "RecoveryBasicCapability",
  "VisionCapability"
] as const;
```

- [ ] **Step 3: Implement AgentRuntime**

Create `src/core/runtime/agent-runtime.ts` with constructor-injected ports:

```ts
export interface AgentRuntimePorts {
  observePage(): Promise<PageModel>;
  plan(input: unknown): Promise<PlannerDecision>;
  execute(primitive: BrowserPrimitive): Promise<PrimitiveResult>;
  appendEvent(event: AgentEvent): Promise<void>;
}
```

Implement `startTask` and `runNextStep` using the Core modules from earlier tasks.

- [ ] **Step 4: Run tests**

Run: `npm test -- tests/unit/core/agent-runtime.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/runtime/agent-runtime.ts src/core/capabilities tests/unit/core/agent-runtime.test.ts
git commit -m "feat: add agent runtime loop"
```

---

### Task 9: Chrome Storage, Messaging, And Background Runtime Adapter

**Files:**
- Create: `src/shared/protocol.ts`
- Create: `src/adapters/chrome/messaging.ts`
- Create: `src/adapters/chrome/chrome-storage-event-store.ts`
- Create: `src/adapters/chrome/chrome-session-memory.ts`
- Create: `src/adapters/chrome/tabs.ts`
- Modify: `src/background/index.ts`
- Modify: `src/content/index.ts`
- Test: `tests/unit/adapters/chrome-storage-event-store.test.ts`

**Interfaces:**
- Produces: message types `START_TASK`, `STOP_TASK`, `GET_SESSION_STATE`, `OBSERVE_PAGE`, `EXECUTE_PRIMITIVE`, `SET_OVERLAY_MODE`.
- Produces: Chrome storage-backed event store.
- Consumed by: Sidepanel and content scripts.

- [ ] **Step 1: Write failing storage adapter tests**

Create `tests/unit/adapters/chrome-storage-event-store.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { ChromeStorageEventStore } from "../../../src/adapters/chrome/chrome-storage-event-store";
import type { AgentEvent } from "../../../src/core/events/events";

const backing = new Map<string, unknown>();

vi.stubGlobal("chrome", {
  storage: {
    local: {
      async get(key: string) {
        return { [key]: backing.get(key) };
      },
      async set(value: Record<string, unknown>) {
        Object.entries(value).forEach(([key, stored]) => backing.set(key, stored));
      }
    }
  }
});

function event(id: string): AgentEvent {
  return {
    id,
    sessionId: "session-1",
    taskId: "task-1",
    stepId: "step-1",
    type: "TaskStarted",
    timestamp: 1,
    payload: {},
    visibility: "debug",
    correlationId: "corr-1"
  };
}

describe("ChromeStorageEventStore", () => {
  it("appends and loads task events", async () => {
    const store = new ChromeStorageEventStore();
    await store.append(event("evt_1"));
    await store.append(event("evt_2"));

    const events = await store.loadAfter("session-1", "task-1");

    expect(events.map((item) => item.id)).toEqual(["evt_1", "evt_2"]);
  });
});
```

- [ ] **Step 2: Implement shared protocol**

Create `src/shared/protocol.ts` with discriminated unions for sidepanel/background/content messages. Include request/response types for:

```text
START_TASK
STOP_TASK
APPEND_INSTRUCTION
GET_SESSION_STATE
OBSERVE_PAGE
EXECUTE_PRIMITIVE
SET_OVERLAY_MODE
HIGHLIGHT_TARGET
OPEN_SETTINGS
```

- [ ] **Step 3: Implement Chrome storage event store**

Create `src/adapters/chrome/chrome-storage-event-store.ts` using `chrome.storage.local.get/set` with key `naturalclick:eventLog:${sessionId}:${taskId}`.

- [ ] **Step 4: Implement messaging and tab helpers**

Create `messaging.ts` wrappers for `chrome.runtime.sendMessage`, `chrome.tabs.sendMessage`, and typed responses. Create `tabs.ts` helpers for active tab lookup and `chrome.tabs.captureVisibleTab`.

- [ ] **Step 5: Wire background and content entry points**

Modify `src/background/index.ts` to handle `START_TASK`, `STOP_TASK`, `GET_SESSION_STATE`, and content relay messages.

Modify `src/content/index.ts` to call `observePage`, `executePrimitive`, and the overlay messages introduced in Task 12.

- [ ] **Step 6: Run tests and build**

Run: `npm test -- tests/unit/adapters/chrome-storage-event-store.test.ts`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/shared/protocol.ts src/adapters/chrome src/background/index.ts src/content/index.ts tests/unit/adapters/chrome-storage-event-store.test.ts
git commit -m "feat: connect chrome runtime adapters"
```

---

### Task 10: Vision Capability First Stage

**Files:**
- Create: `src/core/vision/vision.ts`
- Modify: `src/adapters/chrome/tabs.ts`
- Modify: `src/adapters/model/openai-compatible-client.ts`
- Test: `tests/unit/core/vision.test.ts`

**Interfaces:**
- Produces: `VisualObservationRequest`, `GroundVisualTargetRequest`, `VisualEvidence`, `VisualTargetCandidate`.
- Produces: policy-gated screenshot and visual target grounding flow.
- Consumed by: Binder, Verifier, Evidence tab, Vision overlay mode.

- [ ] **Step 1: Write failing vision tests**

Create `tests/unit/core/vision.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isVisionAvailable, visualCandidateToEvidence } from "../../../src/core/vision/vision";
import type { GlobalModelConfig } from "../../../src/core/model/config";

const baseConfig: GlobalModelConfig = {
  provider: { baseUrl: "https://api.example.com/v1", apiKeyRef: "key", compatibilityMode: "openai", defaultHeaders: {} },
  roleModels: { plannerModel: "planner" },
  capabilities: {
    supportsStreaming: true,
    supportsJsonMode: true,
    supportsToolUse: false,
    supportsVisionInput: true,
    supportsReasoningSummary: false,
    maxContextTokens: 4000,
    maxOutputTokens: 800
  },
  runtime: {
    planner: { requestTimeoutMs: 60000, firstTokenTimeoutMs: 15000, maxRetries: 1, contractRepairAttempts: 1 },
    vision: { requestTimeoutMs: 45000, firstTokenTimeoutMs: 15000, maxRetries: 0, minIntervalMs: 750, maxCallsPerStep: 1 },
    verifier: { requestTimeoutMs: 15000, firstTokenTimeoutMs: 5000, maxRetries: 0 },
    summarizer: { requestTimeoutMs: 20000, firstTokenTimeoutMs: 8000, maxRetries: 0 }
  },
  contextBudget: {
    plannerMaxInputTokens: 3000,
    visionMaxInputTokens: 1000,
    verifierMaxInputTokens: 800,
    summarizerMaxInputTokens: 1000,
    reservedOutputTokens: 400,
    evidenceLimit: 10,
    recentEventLimit: 8,
    observationCandidateLimit: 20,
    rawExcerptLimit: 1000,
    compressionStrategy: "evidence_first"
  },
  logging: { level: "summary", storeRawModelRequests: false, storeRawModelResponses: false, storeScreenshotImages: false },
  privacy: { redactSensitiveValues: true, sendScreenshotsToRemoteVision: true }
};

describe("VisionCapability", () => {
  it("is disabled when no vision model is configured", () => {
    expect(isVisionAvailable(baseConfig)).toBe(false);
  });

  it("converts visual candidates to evidence", () => {
    const evidence = visualCandidateToEvidence(
      {
        label: "Settings",
        roleGuess: "button",
        boundingBox: { x: 10, y: 20, width: 80, height: 32 },
        nearbyText: ["Profile"],
        confidence: 0.91,
        screenshotRef: "shot_1",
        reasoningSummary: "icon button near profile"
      },
      "vision_req_1"
    );

    expect(evidence.kind).toBe("visual_target");
    expect(evidence.claim).toContain("Settings");
    expect(evidence.confidence).toBe(0.91);
  });
});
```

- [ ] **Step 2: Implement vision types and evidence conversion**

Create `src/core/vision/vision.ts` with request/output interfaces from the spec and function `visualCandidateToEvidence(candidate, sourceRequestId)`.

- [ ] **Step 3: Implement screenshot helper**

In `src/adapters/chrome/tabs.ts`, add `captureVisibleTabScreenshot(windowId?: number): Promise<{ dataUrl: string; capturedAt: number }>` using `chrome.tabs.captureVisibleTab`.

- [ ] **Step 4: Implement model client vision request method**

Create or extend `src/adapters/model/openai-compatible-client.ts` with:

```ts
groundVisualTarget(request: GroundVisualTargetRequest, screenshotDataUrl: string): Promise<VisualTargetCandidate[]>
```

The method must return parsed candidates only after JSON contract validation.

- [ ] **Step 5: Run tests**

Run: `npm test -- tests/unit/core/vision.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/vision src/adapters/chrome/tabs.ts src/adapters/model/openai-compatible-client.ts tests/unit/core/vision.test.ts
git commit -m "feat: add first-stage vision grounding"
```

---

### Task 11: Sidepanel Adaptive Conversational Workbench

**Files:**
- Create: `src/sidepanel/state.ts`
- Create: `src/sidepanel/render.ts`
- Create: `src/sidepanel/components.ts`
- Create: `src/sidepanel/settings.ts`
- Modify: `src/sidepanel/main.ts`
- Modify: `public/sidepanel.css`
- Test: `tests/unit/sidepanel/state.test.ts`
- Test: `tests/unit/sidepanel/render.test.ts`

**Interfaces:**
- Produces: sidepanel state machine with modes `conversation` and `workbench`.
- Produces: render functions for top bar, timeline, current action bar, inspector, settings drawer, and composer.
- Consumed by: browser sidepanel UI.

- [ ] **Step 1: Write failing sidepanel state tests**

Create `tests/unit/sidepanel/state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { deriveSidepanelMode, needsModelGuidance, type SidepanelState } from "../../../src/sidepanel/state";

const base: SidepanelState = {
  mode: "conversation",
  overlayMode: "Off",
  safetyMode: "balanced",
  modelConfigured: true,
  traceOpen: false
};

describe("sidepanel state", () => {
  it("uses conversation mode when no task is active", () => {
    expect(deriveSidepanelMode(base)).toBe("conversation");
  });

  it("uses workbench mode when a task is running", () => {
    expect(deriveSidepanelMode({ ...base, activeTask: { taskId: "task-1", status: "running" } })).toBe("workbench");
  });

  it("returns to conversation mode after completion when trace is closed", () => {
    expect(deriveSidepanelMode({ ...base, activeTask: { taskId: "task-1", status: "completed" } })).toBe("conversation");
  });

  it("keeps workbench mode while trace is open", () => {
    expect(deriveSidepanelMode({ ...base, traceOpen: true })).toBe("workbench");
  });

  it("shows model guidance when planner model is missing", () => {
    expect(needsModelGuidance({ ...base, modelConfigured: false })).toBe(true);
  });
});
```

Create `tests/unit/sidepanel/render.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { renderSidepanel } from "../../../src/sidepanel/render";
import type { SidepanelState } from "../../../src/sidepanel/state";

describe("sidepanel render", () => {
  it("renders configuration guidance in conversation mode", () => {
    const root = document.createElement("main");
    const state: SidepanelState = {
      mode: "conversation",
      overlayMode: "Off",
      safetyMode: "balanced",
      modelConfigured: false,
      traceOpen: false
    };

    renderSidepanel(root, state);

    expect(root.textContent).toContain("Need model configuration before starting");
    expect(root.querySelector("textarea")?.getAttribute("placeholder")).toContain("Ask the Agent");
  });

  it("renders current action in workbench mode", () => {
    const root = document.createElement("main");
    const state: SidepanelState = {
      mode: "workbench",
      overlayMode: "Focus",
      safetyMode: "balanced",
      modelConfigured: true,
      traceOpen: false,
      activeTask: { taskId: "task-1", status: "running", currentAction: "Click Settings" }
    };

    renderSidepanel(root, state);

    expect(root.textContent).toContain("Click Settings");
    expect(root.textContent).toContain("Decision");
    expect(root.textContent).toContain("Evidence");
    expect(root.textContent).toContain("Trace");
  });
});
```

- [ ] **Step 2: Implement sidepanel state**

Create `src/sidepanel/state.ts` with:

```ts
export type SidepanelMode = "conversation" | "workbench";
export type OverlayMode = "Off" | "Focus" | "All Targets" | "Evidence" | "Vision";

export interface SidepanelState {
  mode: SidepanelMode;
  overlayMode: OverlayMode;
  safetyMode: "conservative" | "balanced" | "autonomous" | "experimental_full_auto";
  modelConfigured: boolean;
  activeTask?: { taskId: string; status: string; currentAction?: string };
  traceOpen: boolean;
}

export function deriveSidepanelMode(state: SidepanelState): SidepanelMode {
  if (state.traceOpen) return "workbench";
  if (state.activeTask && !["completed", "failed", "stopped"].includes(state.activeTask.status)) return "workbench";
  return "conversation";
}

export function needsModelGuidance(state: SidepanelState): boolean {
  return !state.modelConfigured;
}
```

- [ ] **Step 3: Implement render components**

Create `components.ts` with pure DOM functions:

```ts
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
```

Create renderers for:

- Top Status Bar.
- Configuration Guidance Card.
- Pinned Current Action Bar.
- Timeline.
- Inspector tabs.
- Settings drawer.
- Bottom Composer.

- [ ] **Step 4: Implement settings state**

Create `settings.ts` with model settings form state and validation. Planner model is required before tasks can run.

- [ ] **Step 5: Wire main.ts**

Modify `src/sidepanel/main.ts` to render the adaptive workbench, handle submit, send `START_TASK`, send `APPEND_INSTRUCTION`, open settings drawer, and request session state.

- [ ] **Step 6: Style the operational UI**

Modify `public/sidepanel.css` to implement compact operational layout:

- Sticky top bar.
- Scrollable timeline.
- Pinned current action bar.
- Bottom composer.
- Collapsible inspector.
- Settings drawer.
- Focus-visible states.
- Distinct safety and stopped states.

- [ ] **Step 7: Run tests and build**

Run: `npm test -- tests/unit/sidepanel`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/sidepanel public/sidepanel.css tests/unit/sidepanel
git commit -m "feat: add adaptive sidepanel workbench"
```

---

### Task 12: Page Overlay Modes And Sidepanel Linking

**Files:**
- Create: `src/adapters/content/overlay-controller.ts`
- Modify: `src/content/index.ts`
- Modify: `src/shared/protocol.ts`
- Test: `tests/unit/adapters/overlay-controller.test.ts`

**Interfaces:**
- Produces: `OverlayMode = Off | Focus | All Targets | Evidence | Vision`.
- Produces: `setOverlayMode(mode, payload)` and `highlightTarget(targetRef)`.
- Consumed by: Sidepanel Current Action, Evidence tab, Trace tab, Safety confirmation.

- [ ] **Step 1: Write failing overlay tests**

Create `tests/unit/adapters/overlay-controller.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { clearOverlay, setOverlayMode } from "../../../src/adapters/content/overlay-controller";

const targets = [
  {
    id: "settings",
    label: "#12 button · Settings · 0.91",
    kind: "dom" as const,
    rect: { x: 10, y: 20, width: 80, height: 32 },
    confidence: 0.91,
    state: "current" as const
  },
  {
    id: "vision-settings",
    label: "Vision · Settings · 0.88",
    kind: "vision" as const,
    rect: { x: 12, y: 22, width: 76, height: 30 },
    confidence: 0.88,
    state: "candidate" as const
  }
];

describe("overlay controller", () => {
  it("clears visual overlay in Off mode", () => {
    setOverlayMode("All Targets", targets);
    setOverlayMode("Off", targets);

    expect(document.querySelector("[data-naturalclick-overlay-root]")?.textContent).toBe("");
  });

  it("renders only current target in Focus mode", () => {
    setOverlayMode("Focus", targets);

    expect(document.body.textContent).toContain("Settings");
    expect(document.querySelectorAll("[data-overlay-target]")).toHaveLength(1);
  });

  it("renders all target labels in All Targets mode", () => {
    setOverlayMode("All Targets", targets);

    expect(document.querySelectorAll("[data-overlay-target]")).toHaveLength(2);
  });

  it("renders visual candidates in Vision mode", () => {
    setOverlayMode("Vision", targets);

    expect(document.querySelector("[data-overlay-kind='vision']")).not.toBeNull();
  });

  it("clearOverlay removes rendered targets", () => {
    setOverlayMode("All Targets", targets);
    clearOverlay();

    expect(document.querySelectorAll("[data-overlay-target]")).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Implement overlay controller**

Create overlay root with fixed-position shadow DOM or isolated container:

```ts
const rootId = "naturalclick-overlay-root";
```

Implement:

```ts
setOverlayMode(mode: OverlayMode, targets: OverlayTarget[]): void
highlightTarget(targetRef: string): void
clearOverlay(): void
```

Overlay target shape:

```ts
export interface OverlayTarget {
  id: string;
  label: string;
  kind: "dom" | "evidence" | "vision";
  rect: { x: number; y: number; width: number; height: number };
  confidence?: number;
  state?: "candidate" | "current" | "failed" | "expired";
}
```

- [ ] **Step 3: Wire content message handling**

Modify `src/content/index.ts` to handle:

```text
SET_OVERLAY_MODE
HIGHLIGHT_TARGET
```

Do not disable `observePage` when mode is `Off`.

- [ ] **Step 4: Run tests**

Run: `npm test -- tests/unit/adapters/overlay-controller.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/adapters/content/overlay-controller.ts src/content/index.ts src/shared/protocol.ts tests/unit/adapters/overlay-controller.test.ts
git commit -m "feat: add page overlay modes"
```

---

### Task 13: Acceptance Fixtures, E2E Smoke, And Project Docs

**Files:**
- Create: `tests/fixtures/pages/general.html`
- Create: `tests/fixtures/pages/form.html`
- Create: `tests/fixtures/pages/visual-target.html`
- Create: `tests/e2e/extension-smoke.spec.ts`
- Create: `README.md`
- Modify: `package.json`

**Interfaces:**
- Produces: manual and automated acceptance fixtures.
- Produces: README with build, test, load-unpacked, and first-version scope.

- [ ] **Step 1: Create fixture pages**

Create `tests/fixtures/pages/general.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>General Fixture</title>
  </head>
  <body>
    <main>
      <h1>Account dashboard</h1>
      <button id="settings" aria-label="Settings">⚙</button>
      <section id="settings-panel" hidden>
        <h2>Settings</h2>
        <p>Settings panel opened.</p>
      </section>
    </main>
    <script>
      document.querySelector("#settings").addEventListener("click", () => {
        document.querySelector("#settings-panel").hidden = false;
      });
    </script>
  </body>
</html>
```

Create `tests/fixtures/pages/form.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Form Fixture</title>
  </head>
  <body>
    <main>
      <h1>Test contact form</h1>
      <form id="contact-form">
        <label for="name">Name</label>
        <input id="name" name="name" required />
        <label for="email">Email</label>
        <input id="email" name="email" type="email" required />
        <button type="submit">Submit</button>
      </form>
      <div id="feedback" role="alert" aria-live="polite"></div>
    </main>
    <script>
      document.querySelector("#contact-form").addEventListener("submit", (event) => {
        event.preventDefault();
        const name = document.querySelector("#name").value.trim();
        const email = document.querySelector("#email").value.trim();
        document.querySelector("#feedback").textContent =
          name && email ? `Saved ${name} <${email}>` : "Name and email are required";
      });
    </script>
  </body>
</html>
```

Create `tests/fixtures/pages/visual-target.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Visual Target Fixture</title>
    <style>
      #gear {
        width: 44px;
        height: 44px;
        border: 1px solid #8a94a6;
        background: #ffffff;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Icon-only toolbar</h1>
      <button id="gear" title="Settings">⚙</button>
      <p id="state">Panel closed</p>
    </main>
    <script>
      document.querySelector("#gear").addEventListener("click", () => {
        document.querySelector("#state").textContent = "Settings panel opened";
      });
    </script>
  </body>
</html>
```

- [ ] **Step 2: Write e2e smoke test**

Create `tests/e2e/extension-smoke.spec.ts`:

```ts
import { chromium, expect, test } from "@playwright/test";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

test("built extension content script and sidepanel smoke", async () => {
  execSync("npm run build", { stdio: "inherit" });

  const extensionPath = path.resolve("naturalclick-extension");
  const fixtureUrl = `file://${path.resolve("tests/fixtures/pages/general.html")}`;
  const userDataDir = mkdtempSync(path.join(tmpdir(), "naturalclick-profile-"));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
  });

  try {
    const page = await context.newPage();
    await page.goto(fixtureUrl);
    await expect(page.locator("h1")).toHaveText("Account dashboard");

    const sidepanel = await context.newPage();
    await sidepanel.goto(`file://${path.resolve("naturalclick-extension/sidepanel.html")}`);
    await expect(sidepanel.locator("text=NaturalClick")).toBeVisible();
  } finally {
    await context.close();
    rmSync(userDataDir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 3: Update package scripts**

Add:

```json
"test:all": "npm run typecheck && npm run test:unit && npm run build && npm run test:e2e"
```

- [ ] **Step 4: Create README**

Create `README.md`:

```markdown
# NaturalClick Agent

NaturalClick Agent is a clean-rewrite Chrome MV3 browser operation Agent.

## Status

This branch contains the first-version implementation line. It focuses on a
DOM-first, vision-assisted Agent Core, adaptive side panel, page overlay,
scoped safety, current-session memory, and traceable execution.

## Install

\`\`\`bash
npm install
\`\`\`

## Test

\`\`\`bash
npm run typecheck
npm run test:unit
npm run build
npm run test:e2e
\`\`\`

## Build

\`\`\`bash
npm run build
\`\`\`

Load the generated \`naturalclick-extension\` folder in \`chrome://extensions\` using "Load unpacked".

## First-version scope

- General browser operation.
- Lightweight form fill and submit with scoped consent.
- DOM-first observation and semantic command binding.
- First-stage vision grounding and visual verification.
- Adaptive conversational side panel.
- Overlay modes: Off, Focus, All Targets, Evidence, Vision.
- Current-session history and trace export.

## Safety and privacy defaults

- Safety mode defaults to \`balanced\`.
- Raw model requests and responses are not stored by default.
- Screenshot images are not stored by default.
- Sensitive values are redacted by default.
- Overlay Off does not disable Agent observation.
```

- [ ] **Step 5: Run full validation**

Run: `npm run test:all`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/fixtures tests/e2e README.md package.json
git commit -m "test: add first-version acceptance smoke"
```

---

## Implementation Order

Execute tasks in order. Do not start Sidepanel UI before the protocol and runtime events exist. Do not wire Vision into execution before Binder and Policy exist. Do not add future Backoffice or Research profile code during this plan.

Recommended review gates:

1. After Task 3: Core foundations compile and model context is constrained.
2. After Task 8: AgentRuntime can complete a stub vertical step.
3. After Task 10: Vision is present but cannot bypass semantic binding.
4. After Task 12: UI and overlay work together.
5. After Task 13: extension builds and smoke test passes.

## Self-Review Notes

Spec coverage:

- MV3 shell: Task 1 and Task 9.
- Event log and snapshots: Task 2.
- Model configuration and context compression: Task 3.
- Observation, PageModel, Evidence: Task 4.
- Semantic commands and Binder: Task 5.
- Safety and consent: Task 6.
- Verifier and session memory: Task 7.
- AgentRuntime loop: Task 8.
- Chrome adapters: Task 9.
- First-stage Vision: Task 10.
- Adaptive Sidepanel: Task 11.
- Overlay modes and element labels: Task 12.
- Acceptance fixtures and smoke: Task 13.

Type consistency:

- `OverlayMode` appears in Sidepanel and Overlay tasks with the same values.
- `SemanticCommand`, `BoundCommand`, and `BrowserPrimitive` are defined before runtime use.
- `GlobalModelConfig` and `ContextBudgetConfig` are defined before settings and model client use.
- `PolicyDecision` is defined before Sidepanel confirmation cards consume it.

Risk controls:

- Planner never emits primitive-only coordinate commands.
- Vision writes evidence and target candidates; Binder performs fusion.
- Overlay Off does not disable observation.
- Developer mode does not loosen hard blocks.
