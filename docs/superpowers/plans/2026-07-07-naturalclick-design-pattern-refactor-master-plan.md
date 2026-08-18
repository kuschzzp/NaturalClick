# NaturalClick Design Pattern Refactor Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor NaturalClick into a general-purpose browser-operation Agent with clear architectural boundaries, fast deterministic execution, reliable page recognition, durable sessions, polished Pie-inspired side-panel UX, and testable runtime behavior.

**Architecture:** Keep the existing TypeScript Chrome MV3 extension, but tighten it into a hexagonal architecture: `src/core/**` owns domain rules and use cases, `src/adapters/**` owns Chrome/DOM/CDP/model/storage integration, and `src/sidepanel/**` owns presentation through pure view models. Apply bounded contexts, ports and adapters, command pattern, strategy pattern, state machines, repository pattern, presenter/view-model separation, and anti-corruption layers for any Pie-inspired ideas.

**Tech Stack:** TypeScript, Chrome Manifest V3, Vite, Vitest + jsdom, DOM-rendered side panel, Chrome storage, OpenAI-compatible model APIs, optional Chrome DevTools Protocol input adapter, existing NaturalClick core/adapters/sidepanel modules.

## Global Constraints

- NaturalClick must remain a general browser-operation Agent; do not add CRM-specific selectors, labels, routes, screenshots, or recovery rules.
- Do not migrate to React only to copy Pie's interface; keep the current DOM renderer unless a separate migration plan is approved.
- Use Pie concepts as inspiration through an anti-corruption layer; do not import Pie naming, storage keys, or component assumptions into NaturalClick core code.
- Visible overlay markers are debug output only; execution and vision must use hidden handles, page atlas data, and semantic records.
- Vision screenshots must be captured only after visible debug overlays are cleared.
- Simple URL navigation, exact visible target activation, and clearly bound low-risk form actions must bypass planner model calls.
- Stop must cancel model streaming, runtime loops, action settling, tool execution, CDP sessions, queued continuations, and pending resume work.
- Side panel refresh, panel close/open, browser focus switching, and service worker restart must not silently lose model configuration, general settings, active session metadata, or unsent composer text.
- API keys must not appear in logs, traces, downloaded artifacts, prompts, DOM snapshots, screenshots, or test fixtures.
- Every meaningful runtime transition must be represented by or reducible from an `AgentEvent`.
- Every new UI control must have an accessible label, keyboard reachability, visible focus state, and must fit at 360px side-panel width.
- Avoid `alert()`, `confirm()`, `prompt()`, `<select>`-only custom controls, `outline: none`, and `transition: all` in side-panel UI.
- Any implementation that changes extension behavior must bump `package.json`, `package-lock.json`, `public/manifest.json`, and generated `naturalclick-extension/manifest.json`.
- Existing uncommitted user changes must not be reverted.

---

## Current Baseline

The project already has the right raw material, but the boundaries need to be made harder:

- Runtime orchestration lives in `src/core/runtime/agent-runtime.ts`, `src/core/runtime/execution-controller.ts`, `src/core/runtime/fast-paths.ts`, `src/core/runtime/tool-loop.ts`, and `src/core/runtime/execution-budget.ts`.
- Domain commands live in `src/core/commands/commands.ts` and are bound by `src/core/commands/binder.ts`.
- Observation types live in `src/core/observation/page-model.ts`, `src/core/observation/page-atlas.ts`, `src/core/observation/interactive-index.ts`, and content adapters under `src/adapters/content/**`.
- Side-panel state and rendering live in `src/sidepanel/state.ts`, `src/sidepanel/view-model.ts`, `src/sidepanel/render.ts`, `src/sidepanel/settings.ts`, `src/sidepanel/main.ts`, and `public/sidepanel.css`.
- Model configuration has a service/store shape in `src/core/model/model-config-service.ts`, `src/core/model/model-instance.ts`, `src/core/model/model-registry.ts`, and `src/adapters/chrome/model-config-store.ts`.
- Session and event persistence are split across `src/core/session/**`, `src/core/events/**`, `src/adapters/chrome/chrome-session-memory.ts`, and `src/adapters/chrome/chrome-storage-event-store.ts`.
- Existing tests under `tests/unit/**` should be extended before implementation, not replaced.

## Design Pattern Commitments

### Bounded Contexts

NaturalClick should be organized around these contexts, each with its own terms and tests:

- `Workbench UI`: topbar, session drawer, chat transcript, composer, model picker, settings center, schedules.
- `Model Config`: provider instances, model capabilities, active selection, validation, persistence, runtime config resolution.
- `Session Lifecycle`: active session, new session, stop, pause, resume, recovery, panel rehydrate.
- `Observation`: page identity, viewport, regions, page atlas, interactive index, hidden handles, evidence slices.
- `Target Binding`: mapping semantic commands to stable handles, fallback candidates, ambiguity reporting.
- `Execution`: fast paths, command planning, browser primitives, action adapters, settle policy.
- `Tool Loop`: read/find/click/type/select/wait tools, bounded iteration, abort-aware execution.
- `Overlay And Vision Hygiene`: debug overlays, screenshot cleanliness, visual evidence.
- `Runtime Health`: metrics, performance budgets, diagnostics, downloadable traces.

### Dependency Rules

Dependencies must point inward:

```text
sidepanel/main.ts, background/index.ts, content/index.ts
  -> adapters/*
  -> core/use-case services and ports
  -> core/value objects and domain types
```

Forbidden dependencies:

```text
src/core/** -> chrome.*
src/core/** -> document/window/HTMLElement
src/core/** -> src/sidepanel/**
src/core/** -> public/**
src/core/** -> naturalclick-extension/**
src/sidepanel/view-model.ts -> DOM APIs
src/sidepanel/state.ts -> DOM APIs or Chrome APIs
```

### Port And Adapter Shape

Every adapter-facing capability should follow this pattern:

```ts
export interface PageObservationPort {
  observePage(request?: NeedMoreObservationRequest, options?: ObservePageOptions): Promise<PageModel>;
}

export interface BrowserActionPort {
  execute(primitive: BrowserPrimitive, signal?: AbortSignal): Promise<PrimitiveResult>;
}

export interface SessionRepository {
  loadActive(): Promise<SessionSnapshot | undefined>;
  saveActive(snapshot: SessionSnapshot): Promise<void>;
  clearActive(reason: RuntimeAbortReason): Promise<void>;
}
```

Core code consumes the interfaces. Chrome, DOM, CDP, and storage implementations live in adapters.

### State Machine Rules

Session and task status must be legal transitions, not scattered booleans:

```ts
export type TaskStatus =
  | "idle"
  | "running"
  | "stopping"
  | "paused"
  | "awaiting_confirmation"
  | "awaiting_user_input"
  | "completed"
  | "failed"
  | "stopped";
```

The `stopping` state is important because the user has reported that stop does not fully stop. A stop request should be observable immediately, then complete only after active model/tool/action work has acknowledged abort.

### Anti-Corruption Layer For Pie Ideas

Use Pie as a reference for interaction quality, not as a source of internal names:

- Pie `ModelPicker` becomes NaturalClick `ModelSelectionButton` and `ModelConfigCenter`.
- Pie pending queue UI becomes NaturalClick `PendingInstructionList`.
- Pie page atlas ideas become NaturalClick `PageAtlas` and `InteractiveIndex`.
- Pie tool disclosure becomes NaturalClick `CapabilityMenu`.
- Pie local daemon assumptions are not adopted.

---

## Target File Ownership Map

### Core Architecture

- Modify: `src/core/architecture/boundaries.ts`
  - Owns opaque IDs, abort reasons, dependency guard types, and cross-context vocabulary.
- Create: `tests/unit/core/architecture-boundaries.test.ts`
  - Guards dependency direction and forbidden imports.

### Workbench UI

- Modify: `src/sidepanel/render.ts`
  - Composition root only; no raw event reduction and no settings validation.
- Modify: `src/sidepanel/view-model.ts`
  - Pure projection from state/events/settings to render props.
- Modify: `src/sidepanel/state.ts`
  - Typed state, state decoding, side-panel view transitions, persistence serialization.
- Create: `src/sidepanel/components/topbar.ts`
  - Topbar title, status, history, new session, schedule, theme, settings.
- Create: `src/sidepanel/components/composer.ts`
  - Composer textarea, pending instruction list, tools menu trigger, model button, context indicator, send/stop/queue controls.
- Create: `src/sidepanel/components/model-picker.ts`
  - Provider/model selection popover rendered from model config view model.
- Create: `src/sidepanel/components/settings-center.ts`
  - Settings shell, tabs, config form, skills, search, general settings.
- Create: `src/sidepanel/components/session-drawer.ts`
  - Session history drawer, active session details, run/delete/download actions.
- Modify: `public/sidepanel.css`
  - Tokens, layout, component styling, responsive behavior, focus states.
- Test: `tests/unit/sidepanel/render.test.ts`
- Test: `tests/unit/sidepanel/view-model.test.ts`
- Test: `tests/unit/sidepanel/state.test.ts`
- Test: `tests/unit/sidepanel/settings.test.ts`

### Model Config

- Modify: `src/core/model/model-instance.ts`
  - Value objects for providers, instances, model capabilities, active selection.
- Modify: `src/core/model/model-registry.ts`
  - Built-in provider metadata and capability hints.
- Modify: `src/core/model/model-config-service.ts`
  - Use cases for create/update/delete/select/test/resolve runtime config.
- Modify: `src/adapters/chrome/model-config-store.ts`
  - Chrome storage adapter, migrations, API-key reference persistence, masked export.
- Modify: `src/adapters/model/openai-compatible-client.ts`
  - Runtime client that consumes resolved config and abort signal.
- Test: `tests/unit/core/model-config-service.test.ts`
- Test: `tests/unit/adapters/model-config-store.test.ts`
- Test: `tests/unit/core/openai-compatible.test.ts`

### Session Lifecycle

- Modify: `src/core/session/session-state-machine.ts`
  - Legal transitions, including `stopping` and worker restart recovery.
- Modify: `src/core/session/session-store.ts`
  - Repository interface for active session, history, tombstones, and fresh session marker.
- Modify: `src/adapters/chrome/chrome-session-memory.ts`
  - Persist session memory, task tombstones, fresh-session flags.
- Modify: `src/sidepanel/runtime-subscription.ts`
  - Rehydrate side panel after panel visibility changes or service worker restart.
- Modify: `src/background/index.ts`
  - Own active controllers, stop routing, stale continuation rejection.
- Test: `tests/unit/core/session-state-machine.test.ts`
- Test: `tests/unit/adapters/chrome-session-memory.test.ts`
- Test: `tests/unit/sidepanel/state.test.ts`

### Observation And Target Binding

- Modify: `src/core/observation/page-model.ts`
  - Stable page model types and confidence semantics.
- Modify: `src/core/observation/page-atlas.ts`
  - Structural atlas summaries and region hierarchy.
- Modify: `src/core/observation/interactive-index.ts`
  - Ranked interactives independent from debug marker labels.
- Modify: `src/adapters/content/dom-observer.ts`
  - DOM scan, labels, visibility, regions, forms, hidden handles, atlas output.
- Modify: `src/adapters/content/page-node-index.ts`
  - Stable page-node handles and mutation-aware lookup.
- Modify: `src/core/context/page-context-assembler.ts`
  - Compact planner context using atlas and requested target slices.
- Modify: `src/core/commands/binder.ts`
  - Exact handle binding before fuzzy labels and ambiguity diagnostics.
- Test: `tests/unit/core/page-atlas.test.ts`
- Test: `tests/unit/core/interactive-index.test.ts`
- Test: `tests/unit/adapters/dom-observer.test.ts`
- Test: `tests/unit/adapters/page-node-index.test.ts`
- Test: `tests/unit/core/commands-binder.test.ts`

### Execution And Tooling

- Modify: `src/core/runtime/fast-paths.ts`
  - No-model deterministic routes and confidence policy.
- Modify: `src/core/runtime/agent-runtime.ts`
  - Runtime orchestration, model-call gating, event emission.
- Modify: `src/core/runtime/execution-controller.ts`
  - Budget checks, stop state, abort reason propagation.
- Modify: `src/core/runtime/tool-loop.ts`
  - Bounded tool-call loop with abort checks after every await.
- Modify: `src/core/tools/tool-registry.ts`
  - Capability groups, tool disclosure, role gating.
- Modify: `src/core/tools/page-tools.ts`
  - Read page, find target, read target, read structure.
- Modify: `src/core/tools/browser-tools.ts`
  - Click, type, select, scroll, wait, done, fail.
- Modify: `src/adapters/content/primitive-executor.ts`
  - DOM primitive executor, menu expansion, input dispatch, select, contenteditable.
- Modify: `src/adapters/content/action-settle.ts`
  - Abort-aware settle policy for navigation, mutation, paint, and idle.
- Modify: `src/adapters/chrome/cdp-session.ts`
  - Lazy CDP attach/detach with owner token and abort cleanup.
- Modify: `src/adapters/chrome/cdp-input.ts`
  - Trusted mouse/keyboard input fallback.
- Test: `tests/unit/core/agent-speed-paths.test.ts`
- Test: `tests/unit/core/agent-runtime.test.ts`
- Test: `tests/unit/core/execution-controller.test.ts`
- Test: `tests/unit/core/tool-loop.test.ts`
- Test: `tests/unit/core/tool-registry.test.ts`
- Test: `tests/unit/adapters/primitive-executor.test.ts`
- Test: `tests/unit/adapters/action-settle.test.ts`
- Test: `tests/unit/adapters/cdp-session.test.ts`
- Test: `tests/unit/adapters/cdp-input.test.ts`

### Runtime Health, Privacy, Release

- Modify: `src/core/events/events.ts`
  - Event vocabulary and visibility level.
- Modify: `src/core/events/reducer.ts`
  - State derivation from event log.
- Modify: `src/core/events/runtime-health.ts`
  - Metrics for model calls, observation rounds, action duration, stop latency, fast-path hit rate.
- Modify: `src/sidepanel/runtime-issue.ts`
  - User-readable diagnostics without leaking secrets.
- Modify: `tests/unit/core/performance-guardrails.test.ts`
  - Speed and model-call regression tests.
- Modify: `tests/unit/build/manifest.test.ts`
  - Version consistency tests.

---

## Task 1: Add Architecture Boundary Guardrails

**Files:**
- Modify: `src/core/architecture/boundaries.ts`
- Create: `tests/unit/core/architecture-boundaries.test.ts`

**Interfaces:**
- Produces:

```ts
export type CoreContext =
  | "model_config"
  | "session_lifecycle"
  | "observation"
  | "target_binding"
  | "execution"
  | "tool_loop"
  | "runtime_health";

export interface BoundaryRule {
  from: string;
  forbiddenImports: RegExp[];
  reason: string;
}
```

- [ ] **Step 1: Write the failing dependency test**

Create `tests/unit/core/architecture-boundaries.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

describe("architecture boundaries", () => {
  it("keeps core modules independent from Chrome, DOM, sidepanel, and build output", () => {
    const coreFiles = filesUnder("src/core").filter((path) => path.endsWith(".ts"));
    const violations = coreFiles.flatMap((path) => {
      const source = readFileSync(path, "utf8");
      return [
        /from\s+["'][^"']*sidepanel[^"']*["']/,
        /from\s+["'][^"']*adapters\/chrome[^"']*["']/,
        /\bchrome\./,
        /\bdocument\./,
        /\bwindow\./,
        /from\s+["'][^"']*public[^"']*["']/,
        /from\s+["'][^"']*naturalclick-extension[^"']*["']/
      ].filter((pattern) => pattern.test(source)).map((pattern) => `${path}: ${pattern}`);
    });

    expect(violations).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the guardrail test**

Run: `npx vitest run tests/unit/core/architecture-boundaries.test.ts`

Expected: PASS if current imports are clean, or FAIL with exact offending file paths.

- [ ] **Step 3: Add explicit context vocabulary**

Update `src/core/architecture/boundaries.ts`:

```ts
export type CoreContext =
  | "model_config"
  | "session_lifecycle"
  | "observation"
  | "target_binding"
  | "execution"
  | "tool_loop"
  | "runtime_health";

export interface BoundaryRule {
  from: string;
  forbiddenImports: RegExp[];
  reason: string;
}
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/core/architecture/boundaries.ts tests/unit/core/architecture-boundaries.test.ts
git commit -m "test: guard architecture boundaries"
```

## Task 2: Split Sidepanel Rendering Into Focused Components

**Files:**
- Create: `src/sidepanel/components/topbar.ts`
- Create: `src/sidepanel/components/composer.ts`
- Create: `src/sidepanel/components/model-picker.ts`
- Create: `src/sidepanel/components/settings-center.ts`
- Create: `src/sidepanel/components/session-drawer.ts`
- Modify: `src/sidepanel/render.ts`
- Modify: `src/sidepanel/view-model.ts`
- Test: `tests/unit/sidepanel/render.test.ts`
- Test: `tests/unit/sidepanel/view-model.test.ts`

**Interfaces:**
- Produces:

```ts
export interface ComposerProps {
  value: string;
  placeholder: string;
  pending: Array<{ id: string; text: string }>;
  disabled: boolean;
  primaryAction: "send" | "queue" | "resume" | "stop" | "disabled";
  modelLabel: string;
  contextLabel: string;
  toolMenuOpen: boolean;
}

export interface ComposerHandlers {
  onInput(value: string): void;
  onSubmit(value: string): void;
  onStop(): void;
  onToggleTools(): void;
  onToggleModelPicker(): void;
}
```

- [ ] **Step 1: Write failing render tests**

Add to `tests/unit/sidepanel/render.test.ts`:

```ts
it("renders workbench controls through focused component roots", () => {
  const root = renderSidepanel({
    mode: "conversation",
    view: "chat",
    overlayMode: "Off",
    safetyMode: "experimental_full_auto",
    modelConfigured: true,
    traceOpen: false,
    composerInput: "Open settings",
    pendingInstructions: [{ id: "pending-1", text: "Click Save after the model responds" }]
  });

  expect(root.querySelector(".nc-topbar")).toBeTruthy();
  expect(root.querySelector(".nc-composer")).toBeTruthy();
  expect(root.querySelector(".nc-pending-list")).toHaveTextContent("Click Save after the model responds");
  expect(root.querySelector(".nc-model-picker-button")).toBeTruthy();
  expect(root.querySelector(".nc-session-drawer")).toBeFalsy();
});
```

- [ ] **Step 2: Verify failure**

Run: `npx vitest run tests/unit/sidepanel/render.test.ts -t "focused component roots"`

Expected: FAIL because the component roots are not split consistently.

- [ ] **Step 3: Move topbar DOM into `topbar.ts`**

Create a pure render function:

```ts
export interface TopbarProps {
  title: string;
  statusLabel: string;
  statusTone: "idle" | "running" | "warning" | "error" | "completed" | "stopped";
  newSessionLabel: string;
  historyLabel: string;
  settingsLabel: string;
}

export interface TopbarHandlers {
  onNewSession(): void;
  onOpenHistory(): void;
  onOpenSettings(): void;
}

export function renderTopbar(props: TopbarProps, handlers: TopbarHandlers): HTMLElement {
  const root = el("header", "nc-topbar");
  const history = button("nc-topbar__icon", "", props.historyLabel);
  const fresh = button("nc-topbar__new-session", props.newSessionLabel, props.newSessionLabel);
  const title = el("div", "nc-topbar__title", props.title);
  const status = el("span", `nc-status-pill nc-status-pill--${props.statusTone}`, props.statusLabel);
  const settings = button("nc-topbar__icon", "", props.settingsLabel);
  history.addEventListener("click", handlers.onOpenHistory);
  fresh.addEventListener("click", handlers.onNewSession);
  settings.addEventListener("click", handlers.onOpenSettings);
  root.append(history, fresh, title, status, settings);
  return root;
}
```

- [ ] **Step 4: Move composer DOM into `composer.ts`**

Create `renderComposer()` with a pending list above the input:

```ts
function renderPendingList(pending: ComposerProps["pending"]): HTMLElement | undefined {
  if (pending.length === 0) return undefined;
  const root = el("section", "nc-pending-list");
  root.append(el("div", "nc-pending-list__caption", `PENDING · ${pending.length} IN QUEUE`));
  for (const item of pending) {
    const row = el("article", "nc-pending-item");
    row.append(el("span", "nc-pending-item__dot"));
    row.append(el("span", "nc-pending-item__text", item.text));
    root.append(row);
  }
  return root;
}

export function renderComposer(props: ComposerProps, handlers: ComposerHandlers): HTMLElement {
  const root = el("form", "nc-composer");
  const pending = renderPendingList(props.pending);
  if (pending) root.append(pending);
  const field = el("label", "nc-composer__field");
  const textarea = el("textarea", "nc-textarea") as HTMLTextAreaElement;
  textarea.value = props.value;
  textarea.placeholder = props.placeholder;
  textarea.disabled = props.disabled;
  textarea.addEventListener("input", () => handlers.onInput(textarea.value));
  field.append(textarea);
  root.append(field);
  return root;
}
```

- [ ] **Step 5: Keep `render.ts` as composition root**

Update `src/sidepanel/render.ts` so it imports component renderers and wires handlers, but does not build topbar/composer internals inline.

- [ ] **Step 6: Verify**

Run:

```bash
npm run typecheck
npx vitest run tests/unit/sidepanel/render.test.ts tests/unit/sidepanel/view-model.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/sidepanel/render.ts src/sidepanel/view-model.ts src/sidepanel/components tests/unit/sidepanel/render.test.ts tests/unit/sidepanel/view-model.test.ts
git commit -m "refactor: split sidepanel workbench components"
```

## Task 3: Build A Pie-Inspired But NaturalClick-Native Composer And Model Picker

**Files:**
- Modify: `src/sidepanel/components/composer.ts`
- Modify: `src/sidepanel/components/model-picker.ts`
- Modify: `src/sidepanel/i18n.ts`
- Modify: `public/sidepanel.css`
- Test: `tests/unit/sidepanel/render.test.ts`

**Interfaces:**
- Produces:

```ts
export interface ModelPickerProps {
  open: boolean;
  disabled: boolean;
  activeLabel: string;
  providers: Array<{
    id: string;
    label: string;
    models: Array<{ id: string; label: string; vision: boolean; tools: boolean }>;
  }>;
}
```

- [ ] **Step 1: Write failing tests for the composer contract**

Add to `tests/unit/sidepanel/render.test.ts`:

```ts
it("uses a task-oriented composer placeholder and keeps model selection visible", () => {
  const root = renderSidepanel({
    mode: "conversation",
    view: "chat",
    overlayMode: "Off",
    safetyMode: "balanced",
    modelConfigured: true,
    traceOpen: false,
    composerInput: "",
    timeline: []
  });

  expect(root.querySelector<HTMLTextAreaElement>(".nc-textarea")?.placeholder)
    .toBe("告诉 NaturalClick 要做什么，或输入 / 选择技能...");
  expect(root.querySelector(".nc-model-picker-button")).toBeTruthy();
  expect(root.querySelector(".nc-composer-tools")).toBeTruthy();
});
```

- [ ] **Step 2: Verify failure**

Run: `npx vitest run tests/unit/sidepanel/render.test.ts -t "task-oriented composer"`

Expected: FAIL until the placeholder and controls match the new contract.

- [ ] **Step 3: Add i18n keys**

Update `src/sidepanel/i18n.ts` with these exact keys:

```ts
"composer.placeholder": {
  "zh-CN": "告诉 NaturalClick 要做什么，或输入 / 选择技能...",
  en: "Tell NaturalClick what to do, or type / for skills..."
},
"composer.pendingPrefix": {
  "zh-CN": "待处理",
  en: "PENDING"
},
"composer.pendingSuffix": {
  "zh-CN": "排队中",
  en: "IN QUEUE"
},
"composer.pendingHint": {
  "zh-CN": "下一轮发送",
  en: "SENT NEXT TURN"
}
```

- [ ] **Step 4: Implement the model picker as a compact button plus popover**

Use this DOM shape:

```ts
export function renderModelPicker(props: ModelPickerProps, handlers: ModelPickerHandlers): HTMLElement {
  const root = el("div", "nc-model-picker");
  const trigger = button("nc-model-picker-button", props.activeLabel, props.activeLabel);
  trigger.disabled = props.disabled;
  trigger.setAttribute("aria-expanded", String(props.open));
  trigger.addEventListener("click", handlers.onToggle);
  root.append(trigger);
  if (props.open) {
    const popover = el("section", "nc-model-picker-popover");
    popover.append(el("h3", "nc-model-picker-popover__title", "SELECT MODEL"));
    for (const provider of props.providers) {
      popover.append(el("button", "nc-provider-row", provider.label));
    }
    root.append(popover);
  }
  return root;
}
```

- [ ] **Step 5: Add CSS without blocking vision**

Add styles to `public/sidepanel.css` using compact surfaces and no overlay labels in the page viewport:

```css
.nc-composer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
}

.nc-pending-list {
  display: grid;
  gap: 6px;
}

.nc-pending-item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;
  border: 1px solid var(--nc-border);
  border-radius: 8px;
  padding: 6px 8px;
}

.nc-model-picker-popover {
  position: absolute;
  inset-inline-end: 0;
  bottom: calc(100% + 8px);
  min-width: 260px;
}
```

- [ ] **Step 6: Verify**

Run:

```bash
npm run typecheck
npx vitest run tests/unit/sidepanel/render.test.ts
rg -n "transition\\s*:\\s*all|outline\\s*:\\s*none|alert\\(|confirm\\(|prompt\\(" src/sidepanel public/sidepanel.css
```

Expected: typecheck PASS, render tests PASS, `rg` returns no matches.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/sidepanel/components/composer.ts src/sidepanel/components/model-picker.ts src/sidepanel/i18n.ts public/sidepanel.css tests/unit/sidepanel/render.test.ts
git commit -m "feat: add native composer and model picker"
```

## Task 4: Make Model Configuration A Durable Bounded Context

**Files:**
- Modify: `src/core/model/model-instance.ts`
- Modify: `src/core/model/model-config-service.ts`
- Modify: `src/adapters/chrome/model-config-store.ts`
- Modify: `src/sidepanel/settings.ts`
- Test: `tests/unit/core/model-config-service.test.ts`
- Test: `tests/unit/adapters/model-config-store.test.ts`
- Test: `tests/unit/sidepanel/settings.test.ts`

**Interfaces:**
- Produces:

```ts
export interface ModelConfigUseCases {
  listInstances(): Promise<ModelInstance[]>;
  upsertInstance(input: UpsertModelInstanceInput): Promise<ModelInstance>;
  deleteInstance(id: string): Promise<void>;
  selectModel(selection: ModelSelection): Promise<void>;
  resolveRuntimeConfig(role: "planner" | "vision" | "verifier"): Promise<ModelRuntimeConfig | undefined>;
  testConnection(instanceId: string, modelId: string): Promise<ModelConnectionTestResult>;
}
```

- [ ] **Step 1: Write failing service tests**

Add to `tests/unit/core/model-config-service.test.ts`:

```ts
it("persists active selection and resolves runtime config after settings save", async () => {
  const store = new InMemoryModelConfigStore();
  const service = createModelConfigService(store);

  await service.saveInstance({
    id: "openai-compatible",
    provider: "custom",
    label: "OpenAI Compatible",
    baseUrl: "https://api.example.com/v1",
    apiKeyRef: "naturalclick:model-api-key",
    endpointVariant: "openai_compatible",
    models: [{ id: "qwen3.7-max", vision: false, tools: true, maxContextTokens: 128000 }]
  });
  await service.setActiveSelection({ instanceId: "openai-compatible", model: "qwen3.7-max" });

  await expect(service.resolveActiveRuntimeConfig()).resolves.toMatchObject({
    providerLabel: "OpenAI Compatible",
    model: "qwen3.7-max",
    baseUrl: "https://api.example.com/v1"
  });
});
```

- [ ] **Step 2: Verify failure if the in-memory store or use-case shape is missing**

Run: `npx vitest run tests/unit/core/model-config-service.test.ts`

Expected: FAIL only for missing helper/use-case behavior.

- [ ] **Step 3: Implement an in-memory test store**

Add inside the test file:

```ts
class InMemoryModelConfigStore implements ModelConfigStore {
  private instances: ModelInstance[] = [];
  private selection: ModelSelection | undefined;

  async listInstances(): Promise<ModelInstance[]> {
    return this.instances;
  }

  async saveInstance(instance: ModelInstance): Promise<void> {
    this.instances = [...this.instances.filter((item) => item.id !== instance.id), instance];
  }

  async deleteInstance(id: string): Promise<void> {
    this.instances = this.instances.filter((item) => item.id !== id);
    if (this.selection?.instanceId === id) this.selection = undefined;
  }

  async getActiveSelection(): Promise<ModelSelection | undefined> {
    return this.selection;
  }

  async setActiveSelection(selection: ModelSelection): Promise<void> {
    this.selection = selection;
  }
}
```

- [ ] **Step 4: Add storage migration tests**

Add to `tests/unit/adapters/model-config-store.test.ts`:

```ts
it("survives store re-creation after sidepanel refresh", async () => {
  const chromeStorage = createChromeStorageMock();
  const first = new ChromeModelConfigStore(chromeStorage);
  await first.saveInstance(makeInstance("custom", "qwen3.7-max"));
  await first.setActiveSelection({ instanceId: "custom", model: "qwen3.7-max" });

  const second = new ChromeModelConfigStore(chromeStorage);

  await expect(second.getActiveSelection()).resolves.toEqual({ instanceId: "custom", model: "qwen3.7-max" });
  await expect(second.listInstances()).resolves.toHaveLength(1);
});
```

- [ ] **Step 5: Verify**

Run:

```bash
npm run typecheck
npx vitest run tests/unit/core/model-config-service.test.ts tests/unit/adapters/model-config-store.test.ts tests/unit/sidepanel/settings.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/core/model src/adapters/chrome/model-config-store.ts src/sidepanel/settings.ts tests/unit/core/model-config-service.test.ts tests/unit/adapters/model-config-store.test.ts tests/unit/sidepanel/settings.test.ts
git commit -m "feat: persist model configuration context"
```

## Task 5: Fix Session Rehydrate, New Session, And Panel Focus Switching

**Files:**
- Modify: `src/core/session/session-state-machine.ts`
- Modify: `src/core/session/session-store.ts`
- Modify: `src/adapters/chrome/chrome-session-memory.ts`
- Modify: `src/sidepanel/runtime-subscription.ts`
- Modify: `src/sidepanel/main.ts`
- Test: `tests/unit/core/session-state-machine.test.ts`
- Test: `tests/unit/adapters/chrome-session-memory.test.ts`
- Test: `tests/unit/sidepanel/state.test.ts`

**Interfaces:**
- Produces:

```ts
export interface ActiveSessionSnapshot {
  sessionId: string;
  taskId?: string;
  status: SessionStatus;
  taskStatus: TaskStatus;
  freshSessionRequestedAt?: number;
  composerInput?: string;
  updatedAt: number;
}
```

- [ ] **Step 1: Write failing transition tests**

Add to `tests/unit/core/session-state-machine.test.ts`:

```ts
it("keeps a fresh session fresh across panel close and reopen", () => {
  const state = transitionSession({ status: "active", taskStatus: "idle" }, { type: "new_session_requested", at: 1000 });

  expect(state).toMatchObject({
    status: "active",
    taskStatus: "idle",
    freshSessionRequestedAt: 1000
  });
});

it("rehydrates a running task as paused after worker restart", () => {
  const state = transitionSession({ status: "active", taskStatus: "running" }, { type: "worker_restarted" });

  expect(state).toEqual({ status: "paused", taskStatus: "paused" });
});
```

- [ ] **Step 2: Verify failure**

Run: `npx vitest run tests/unit/core/session-state-machine.test.ts`

Expected: FAIL until `new_session_requested` is added.

- [ ] **Step 3: Extend transition types**

Update `src/core/session/session-state-machine.ts`:

```ts
export type SessionTransition =
  | { type: "task_started" }
  | { type: "task_done" }
  | { type: "task_failed"; reason: string }
  | { type: "task_stopping"; reason: RuntimeAbortReason }
  | { type: "task_stopped"; reason: RuntimeAbortReason }
  | { type: "worker_restarted" }
  | { type: "resume_requested" }
  | { type: "new_session_requested"; at: number }
  | { type: "archive" };
```

Handle `new_session_requested` by clearing active task details and preserving the fresh-session timestamp.

- [ ] **Step 4: Add Chrome storage rehydrate test**

Add to `tests/unit/adapters/chrome-session-memory.test.ts`:

```ts
it("does not restore the previous historical session after a fresh session marker", async () => {
  const memory = new ChromeSessionMemory();
  await memory.saveActiveSession({
    sessionId: "fresh-session",
    taskStatus: "idle",
    status: "active",
    freshSessionRequestedAt: 2000,
    updatedAt: 2000
  });

  await expect(memory.loadActiveSession()).resolves.toMatchObject({
    sessionId: "fresh-session",
    freshSessionRequestedAt: 2000
  });
});
```

- [ ] **Step 5: Update sidepanel rehydrate logic**

In `src/sidepanel/runtime-subscription.ts`, make the first render read active session snapshot before falling back to historical sessions:

```ts
const active = await sessionStore.loadActiveSession();
if (active?.freshSessionRequestedAt) {
  updateState({ view: "chat", activeSessionId: active.sessionId, selectedSessionId: undefined });
  return;
}
```

- [ ] **Step 6: Verify**

Run:

```bash
npm run typecheck
npx vitest run tests/unit/core/session-state-machine.test.ts tests/unit/adapters/chrome-session-memory.test.ts tests/unit/sidepanel/state.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/core/session src/adapters/chrome/chrome-session-memory.ts src/sidepanel/runtime-subscription.ts src/sidepanel/main.ts tests/unit/core/session-state-machine.test.ts tests/unit/adapters/chrome-session-memory.test.ts tests/unit/sidepanel/state.test.ts
git commit -m "fix: rehydrate fresh sidepanel sessions"
```

## Task 6: Make Stop A Full Cross-Layer Cancellation Contract

**Files:**
- Modify: `src/core/runtime/execution-controller.ts`
- Modify: `src/core/runtime/agent-runtime.ts`
- Modify: `src/core/runtime/tool-loop.ts`
- Modify: `src/adapters/model/openai-compatible-client.ts`
- Modify: `src/adapters/content/action-settle.ts`
- Modify: `src/adapters/chrome/cdp-session.ts`
- Modify: `src/background/index.ts`
- Test: `tests/unit/core/execution-controller.test.ts`
- Test: `tests/unit/core/agent-runtime.test.ts`
- Test: `tests/unit/core/tool-loop.test.ts`
- Test: `tests/unit/adapters/action-settle.test.ts`
- Test: `tests/unit/adapters/cdp-session.test.ts`

**Interfaces:**
- Produces:

```ts
export interface RuntimeCancellation {
  readonly signal: AbortSignal;
  stop(reason: RuntimeAbortReason): void;
  throwIfAborted(): void;
}
```

- [ ] **Step 1: Write failing stop latency test**

Add to `tests/unit/core/execution-controller.test.ts`:

```ts
it("emits stopping then stopped when user stop interrupts an awaited step", async () => {
  const events: AgentEvent[] = [];
  let releaseStep: (() => void) | undefined;
  const runtime: ExecutionRuntime = {
    async startTask() {},
    async runNextStep() {
      await new Promise<void>((resolve) => {
        releaseStep = resolve;
      });
      return { status: "continue", stepId: "step-1", metrics: { modelCalls: 0, observationRounds: 0 } };
    }
  };
  const controller = new ExecutionController({
    sessionId: "session",
    taskId: "task",
    runtime,
    appendEvent: async (event) => events.push(event)
  });

  const running = controller.startTask("click save");
  controller.stopTask({ reason: "user_stop" });
  releaseStep?.();

  await expect(running).resolves.toMatchObject({ status: "stopped", reason: "user_stop" });
  expect(events.map((event) => event.type)).toContain("TaskStopped");
});
```

- [ ] **Step 2: Verify failure**

Run: `npx vitest run tests/unit/core/execution-controller.test.ts -t "interrupts an awaited step"`

Expected: FAIL if stop reason or abort propagation is incomplete.

- [ ] **Step 3: Thread abort signals through runtime ports**

Update runtime port signatures:

```ts
export interface AgentRuntimePorts {
  abortSignal?: AbortSignal;
  observePage(request?: NeedMoreObservationRequest, options?: ObservePageRuntimeOptions): Promise<PageModel>;
  plan(input: PlannerInput, signal?: AbortSignal): Promise<unknown>;
  execute(primitive: BrowserPrimitive, signal?: AbortSignal): Promise<PrimitiveResult>;
  appendEvent(event: AgentEvent): Promise<void>;
}
```

- [ ] **Step 4: Add abort checks after every awaited boundary**

In `agent-runtime.ts` and `tool-loop.ts`, call:

```ts
function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Runtime aborted", "AbortError");
}
```

Call `throwIfAborted()` after model calls, observation, command binding, primitive execution, settle waits, and tool-loop iterations.

- [ ] **Step 5: Make adapters abort-aware**

Update adapter signatures:

```ts
export async function executePrimitive(
  primitive: BrowserPrimitive,
  pageModel: PageModel,
  options: { signal?: AbortSignal } = {}
): Promise<PrimitiveResult> {
  if (options.signal?.aborted) {
    return { status: "failed", reason: "aborted", details: { primitive: primitive.type } };
  }
  if (primitive.type === "dom_click") return executeDomClick(primitive, pageModel);
  if (primitive.type === "dom_input") return executeDomInput(primitive, pageModel);
  if (primitive.type === "coordinate_click") return executeCoordinateClick(primitive);
  if (primitive.type === "scroll") return executeScroll(primitive);
  if (primitive.type === "wait") return wait(primitive.milliseconds, options.signal);
  return { status: "failed", reason: "unsupported_primitive", details: { primitive: primitive.type } };
}
```

- [ ] **Step 6: Verify**

Run:

```bash
npm run typecheck
npx vitest run tests/unit/core/execution-controller.test.ts tests/unit/core/agent-runtime.test.ts tests/unit/core/tool-loop.test.ts tests/unit/adapters/action-settle.test.ts tests/unit/adapters/cdp-session.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/core/runtime src/adapters/model/openai-compatible-client.ts src/adapters/content/action-settle.ts src/adapters/chrome/cdp-session.ts src/background/index.ts tests/unit/core/execution-controller.test.ts tests/unit/core/agent-runtime.test.ts tests/unit/core/tool-loop.test.ts tests/unit/adapters/action-settle.test.ts tests/unit/adapters/cdp-session.test.ts
git commit -m "fix: propagate stop cancellation across runtime"
```

## Task 7: Make Page Recognition Independent From Visible Markers

**Files:**
- Modify: `src/core/observation/page-model.ts`
- Modify: `src/core/observation/page-atlas.ts`
- Modify: `src/core/observation/interactive-index.ts`
- Modify: `src/adapters/content/dom-observer.ts`
- Modify: `src/adapters/content/page-node-index.ts`
- Modify: `src/adapters/content/overlay-controller.ts`
- Modify: `src/shared/overlay-targets.ts`
- Test: `tests/unit/core/page-atlas.test.ts`
- Test: `tests/unit/core/interactive-index.test.ts`
- Test: `tests/unit/adapters/dom-observer.test.ts`
- Test: `tests/unit/adapters/overlay-controller.test.ts`
- Test: `tests/unit/shared/overlay-targets.test.ts`

**Interfaces:**
- Produces:

```ts
export interface HiddenPageHandle {
  handle: string;
  semanticId: string;
  expiresOn: "navigation" | "reload" | "mutation";
}

export interface DebugOverlayTarget {
  markerId: string;
  semanticId: string;
  label: string;
  bounds: ElementBounds;
}
```

- [ ] **Step 1: Write failing marker-hygiene test**

Add to `tests/unit/adapters/overlay-controller.test.ts`:

```ts
it("does not render role/confidence text inside debug markers", () => {
  const root = renderOverlayTargets([
    {
      semanticId: "control-1",
      label: "客户管理",
      role: "button",
      confidence: 0.88,
      bounds: { x: 10, y: 10, width: 100, height: 30 }
    }
  ]);

  expect(root.textContent).not.toContain("button");
  expect(root.textContent).not.toContain("0.88");
});
```

- [ ] **Step 2: Verify failure**

Run: `npx vitest run tests/unit/adapters/overlay-controller.test.ts -t "role/confidence"`

Expected: FAIL if visible marker labels still contain role/confidence.

- [ ] **Step 3: Move execution identifiers to hidden handles**

In `src/adapters/content/page-node-index.ts`, expose:

```ts
export const PAGE_NODE_HANDLE_ATTRIBUTE = "data-naturalclick-handle";

export function assignPageNodeHandle(element: Element, semanticId: string): HiddenPageHandle {
  const existing = element.getAttribute(PAGE_NODE_HANDLE_ATTRIBUTE);
  const handle = existing || `nc-${semanticId}`;
  element.setAttribute(PAGE_NODE_HANDLE_ATTRIBUTE, handle);
  return { handle, semanticId, expiresOn: "mutation" };
}
```

- [ ] **Step 4: Keep overlay labels short**

In `src/shared/overlay-targets.ts`, build overlay targets with numeric marker text only:

```ts
export function markerText(index: number): string {
  return String(index + 1);
}
```

- [ ] **Step 5: Clear overlays before vision**

Add a vision hygiene test in `tests/unit/core/vision.test.ts`:

```ts
it("requires overlay clear before screenshot capture", async () => {
  const calls: string[] = [];
  await captureVisionInput({
    clearOverlay: async () => calls.push("clear"),
    captureScreenshot: async () => {
      calls.push("capture");
      return { mimeType: "image/png", data: "base64" };
    }
  });

  expect(calls).toEqual(["clear", "capture"]);
});
```

- [ ] **Step 6: Verify**

Run:

```bash
npm run typecheck
npx vitest run tests/unit/core/page-atlas.test.ts tests/unit/core/interactive-index.test.ts tests/unit/adapters/dom-observer.test.ts tests/unit/adapters/overlay-controller.test.ts tests/unit/shared/overlay-targets.test.ts tests/unit/core/vision.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/core/observation src/adapters/content/dom-observer.ts src/adapters/content/page-node-index.ts src/adapters/content/overlay-controller.ts src/shared/overlay-targets.ts tests/unit/core/page-atlas.test.ts tests/unit/core/interactive-index.test.ts tests/unit/adapters/dom-observer.test.ts tests/unit/adapters/overlay-controller.test.ts tests/unit/shared/overlay-targets.test.ts tests/unit/core/vision.test.ts
git commit -m "fix: separate debug overlays from recognition"
```

## Task 8: Improve Generic Target Binding And Menu Expansion

**Files:**
- Modify: `src/core/commands/binder.ts`
- Modify: `src/adapters/content/primitive-executor.ts`
- Create: `tests/fixtures/pages/sidebar-menu.html`
- Test: `tests/unit/core/commands-binder.test.ts`
- Test: `tests/unit/adapters/primitive-executor.test.ts`

**Interfaces:**
- Produces:

```ts
export interface BindingFailureDetails {
  reason: "not_found" | "ambiguous" | "expired_handle" | "not_interactable";
  candidates: ControlCandidate[];
  recoveryHints: string[];
}
```

- [ ] **Step 1: Add a generic menu fixture**

Create `tests/fixtures/pages/sidebar-menu.html`:

```html
<!doctype html>
<html>
  <body>
    <aside>
      <button aria-expanded="false" data-menu="customers">Customers</button>
      <ul hidden data-children="customers">
        <li><a href="/customers/list">Customer List</a></li>
      </ul>
    </aside>
    <script>
      document.querySelector("[data-menu='customers']").addEventListener("click", (event) => {
        const button = event.currentTarget;
        const children = document.querySelector("[data-children='customers']");
        const expanded = button.getAttribute("aria-expanded") === "true";
        button.setAttribute("aria-expanded", String(!expanded));
        children.hidden = expanded;
      });
    </script>
  </body>
</html>
```

- [ ] **Step 2: Write failing primitive executor test**

Add to `tests/unit/adapters/primitive-executor.test.ts`:

```ts
it("expands a generic collapsed menu before reporting click success", async () => {
  document.body.innerHTML = menuFixtureHtml();
  const pageModel = makePageModelWithCollapsedMenu();

  const result = await executePrimitive({ type: "dom_click", semanticId: "menu-customers" }, pageModel);

  expect(result.status).toBe("success");
  expect(document.querySelector("[data-menu='customers']")?.getAttribute("aria-expanded")).toBe("true");
  expect(result.details.expandedRetry).toBe(true);
});
```

- [ ] **Step 3: Verify failure**

Run: `npx vitest run tests/unit/adapters/primitive-executor.test.ts -t "collapsed menu"`

Expected: FAIL if generic menu expansion does not update expanded state.

- [ ] **Step 4: Prefer exact stable handles in binder**

In `src/core/commands/binder.ts`, bind in this order:

```ts
const bindingStrategies = [
  bindBySemanticId,
  bindByTargetRef,
  bindByExactAccessibleName,
  bindByExactLabel,
  bindByFormRelation,
  bindByFuzzyCandidate
] as const;
```

If the top two fuzzy candidates have similar confidence, return `BindingFailureDetails` with `reason: "ambiguous"` and candidate IDs.

- [ ] **Step 5: Keep menu expansion generic**

In `primitive-executor.ts`, menu expansion should use ARIA, roles, and structural hints:

```ts
function shouldTryExpansionRecovery(control: ControlCandidate, element: HTMLElement): boolean {
  if (control.expandedState === "expanded") return false;
  if (element.closest("a[href]") && control.role.toLowerCase() === "link") return false;
  return Boolean(
    element.closest("[aria-expanded],[aria-haspopup],nav,aside,[role='navigation'],[role='menu']") ||
    control.childRefs?.length ||
    control.interactionHints.some((hint) => /menu|submenu|dropdown|expand/i.test(hint))
  );
}
```

- [ ] **Step 6: Verify**

Run:

```bash
npm run typecheck
npx vitest run tests/unit/core/commands-binder.test.ts tests/unit/adapters/primitive-executor.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/core/commands/binder.ts src/adapters/content/primitive-executor.ts tests/fixtures/pages/sidebar-menu.html tests/unit/core/commands-binder.test.ts tests/unit/adapters/primitive-executor.test.ts
git commit -m "fix: improve generic target binding and menu expansion"
```

## Task 9: Add Fast-Path Routing Before Planner Model Calls

**Files:**
- Modify: `src/core/runtime/fast-paths.ts`
- Modify: `src/core/runtime/agent-runtime.ts`
- Modify: `src/core/context/page-context-assembler.ts`
- Test: `tests/unit/core/agent-speed-paths.test.ts`
- Test: `tests/unit/core/agent-runtime.test.ts`
- Test: `tests/unit/core/performance-guardrails.test.ts`

**Interfaces:**
- Produces:

```ts
export interface FastPathDecision {
  source:
    | "explicit_url"
    | "exact_visible_control"
    | "single_form_fill"
    | "single_select_option"
    | "read_visible_content";
  command: SemanticCommand;
  reasoningSummary: string;
  confidence: number;
}
```

- [ ] **Step 1: Write no-model exact click test**

Add to `tests/unit/core/agent-speed-paths.test.ts`:

```ts
it("activates one exact visible low-risk control without planner model call", async () => {
  const calls = { plan: 0, execute: 0 };
  const runtime = makeRuntime({
    taskText: "点击 Settings",
    page: makePageWithControls([{ semanticId: "button-settings", role: "button", label: "Settings", confidence: 0.96 }]),
    plan: async () => {
      calls.plan += 1;
      throw new Error("planner should not be called");
    },
    execute: async () => {
      calls.execute += 1;
      return { status: "success", details: {} };
    }
  });

  await expect(runtime.runNextStep()).resolves.toMatchObject({ status: "completed" });
  expect(calls.plan).toBe(0);
  expect(calls.execute).toBe(1);
});
```

- [ ] **Step 2: Verify failure**

Run: `npx vitest run tests/unit/core/agent-speed-paths.test.ts -t "without planner"`

Expected: FAIL if the runtime calls planner first.

- [ ] **Step 3: Expand deterministic fast paths**

Update `fast-paths.ts`:

```ts
const fastPathStrategies = [
  detectExplicitUrlNavigation,
  detectExactVisibleControlActivation,
  detectSingleFieldFill,
  detectSingleSelectOption,
  detectReadVisibleContent
] as const;
```

Each strategy must return `undefined` when risk is medium/high, candidate count is ambiguous, or required input cannot be parsed confidently.

- [ ] **Step 4: Record why the model was bypassed**

In `agent-runtime.ts`, append:

```ts
await ports.appendEvent(event(ports, stepId, "PlanProduced", {
  source: "fast_path",
  fastPathSource: decision.source,
  reasoningSummary: decision.reasoningSummary
}, "debug"));
```

- [ ] **Step 5: Add performance guardrail**

Add to `tests/unit/core/performance-guardrails.test.ts`:

```ts
it("keeps exact visible click under one observation and zero planner calls", async () => {
  const metrics = await runExactClickScenario();

  expect(metrics.modelCalls).toBe(0);
  expect(metrics.observationRounds).toBeLessThanOrEqual(1);
  expect(metrics.executedPrimitives).toBe(1);
});
```

- [ ] **Step 6: Verify**

Run:

```bash
npm run typecheck
npx vitest run tests/unit/core/agent-speed-paths.test.ts tests/unit/core/agent-runtime.test.ts tests/unit/core/performance-guardrails.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/core/runtime/fast-paths.ts src/core/runtime/agent-runtime.ts src/core/context/page-context-assembler.ts tests/unit/core/agent-speed-paths.test.ts tests/unit/core/agent-runtime.test.ts tests/unit/core/performance-guardrails.test.ts
git commit -m "perf: route deterministic actions before planner"
```

## Task 10: Make Tool Loop Bounded, Observable, And Abort-Aware

**Files:**
- Modify: `src/core/runtime/tool-loop.ts`
- Modify: `src/core/tools/tool-registry.ts`
- Modify: `src/core/tools/page-tools.ts`
- Modify: `src/core/tools/browser-tools.ts`
- Modify: `src/core/events/events.ts`
- Test: `tests/unit/core/tool-loop.test.ts`
- Test: `tests/unit/core/tool-registry.test.ts`

**Interfaces:**
- Produces:

```ts
export interface ToolExecutionBudget {
  maxToolCalls: number;
  maxReadCalls: number;
  maxActionCalls: number;
  maxElapsedMs: number;
}

export interface ToolExecutionTrace {
  toolName: string;
  startedAt: number;
  finishedAt?: number;
  status: "success" | "failed" | "aborted";
}
```

- [ ] **Step 1: Write failing bounded-loop test**

Add to `tests/unit/core/tool-loop.test.ts`:

```ts
it("stops tool execution when the max call budget is reached", async () => {
  const loop = createToolLoop({
    tools: {
      read_page: async () => ({ ok: true, data: "same result" })
    },
    budget: { maxToolCalls: 2, maxReadCalls: 2, maxActionCalls: 1, maxElapsedMs: 3000 }
  });

  await expect(loop.run([{ name: "read_page", input: {} }, { name: "read_page", input: {} }, { name: "read_page", input: {} }]))
    .resolves.toMatchObject({ status: "budget_exceeded", callsExecuted: 2 });
});
```

- [ ] **Step 2: Verify failure**

Run: `npx vitest run tests/unit/core/tool-loop.test.ts -t "max call budget"`

Expected: FAIL until loop budgets are enforced.

- [ ] **Step 3: Register tools by capability group**

Update `src/core/tools/tool-registry.ts`:

```ts
export type ToolGroup = "page_read" | "target_find" | "browser_action" | "task_control";

export interface RegisteredTool {
  name: string;
  group: ToolGroup;
  risk: "low" | "medium" | "high";
  run(input: unknown, context: ToolExecutionContext): Promise<ToolResult>;
}
```

- [ ] **Step 4: Add abort checks in the loop**

In `tool-loop.ts`:

```ts
function assertToolLoopActive(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Tool loop aborted", "AbortError");
}
```

Call this before and after every tool invocation.

- [ ] **Step 5: Emit tool events**

Append `ToolCallStarted`, `ToolCallCompleted`, and `ToolCallFailed` with `toolName`, `group`, `durationMs`, and `risk`.

- [ ] **Step 6: Verify**

Run:

```bash
npm run typecheck
npx vitest run tests/unit/core/tool-loop.test.ts tests/unit/core/tool-registry.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/core/runtime/tool-loop.ts src/core/tools src/core/events/events.ts tests/unit/core/tool-loop.test.ts tests/unit/core/tool-registry.test.ts
git commit -m "feat: bound and trace tool execution"
```

## Task 11: Add Abort-Aware Action Settle And CDP Fallback

**Files:**
- Modify: `src/adapters/content/action-settle.ts`
- Modify: `src/adapters/content/primitive-executor.ts`
- Modify: `src/adapters/chrome/cdp-session.ts`
- Modify: `src/adapters/chrome/cdp-input.ts`
- Modify: `src/background/index.ts`
- Test: `tests/unit/adapters/action-settle.test.ts`
- Test: `tests/unit/adapters/primitive-executor.test.ts`
- Test: `tests/unit/adapters/cdp-session.test.ts`
- Test: `tests/unit/adapters/cdp-input.test.ts`

**Interfaces:**
- Produces:

```ts
export interface ActionSettleResult {
  status: "settled" | "navigation" | "mutation" | "timeout" | "aborted";
  durationMs: number;
  mutationCount: number;
}

export interface TrustedInputAdapter {
  click(point: ElementPoint, signal?: AbortSignal): Promise<PrimitiveResult>;
  type(text: string, signal?: AbortSignal): Promise<PrimitiveResult>;
}
```

- [ ] **Step 1: Write settle abort test**

Add to `tests/unit/adapters/action-settle.test.ts`:

```ts
it("returns aborted when the settle wait is cancelled", async () => {
  const controller = new AbortController();
  const promise = waitForActionSettle({ timeoutMs: 5000, signal: controller.signal });
  controller.abort("user_stop");

  await expect(promise).resolves.toMatchObject({ status: "aborted" });
});
```

- [ ] **Step 2: Verify failure**

Run: `npx vitest run tests/unit/adapters/action-settle.test.ts -t "settle wait is cancelled"`

Expected: FAIL until settle accepts `AbortSignal`.

- [ ] **Step 3: Add settle result metrics**

Implement:

```ts
export async function waitForActionSettle(options: ActionSettleOptions): Promise<ActionSettleResult> {
  const startedAt = Date.now();
  if (options.signal?.aborted) return { status: "aborted", durationMs: 0, mutationCount: 0 };
  const mutationCount = await waitForMutationOrQuietWindow(options);
  if (options.signal?.aborted) return { status: "aborted", durationMs: Date.now() - startedAt, mutationCount };
  return { status: "settled", durationMs: Date.now() - startedAt, mutationCount };
}
```

- [ ] **Step 4: Add CDP fallback only when DOM execution is insufficient**

Use CDP for trusted input when:

```ts
const requiresTrustedInput =
  primitive.type === "dom_input" &&
  (target.isContentEditable || target.requiresTrustedKeyboard || result.reason === "element_not_input_capable");
```

Do not attach CDP for ordinary button clicks that succeed via DOM.

- [ ] **Step 5: Verify**

Run:

```bash
npm run typecheck
npx vitest run tests/unit/adapters/action-settle.test.ts tests/unit/adapters/primitive-executor.test.ts tests/unit/adapters/cdp-session.test.ts tests/unit/adapters/cdp-input.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/adapters/content/action-settle.ts src/adapters/content/primitive-executor.ts src/adapters/chrome/cdp-session.ts src/adapters/chrome/cdp-input.ts src/background/index.ts tests/unit/adapters/action-settle.test.ts tests/unit/adapters/primitive-executor.test.ts tests/unit/adapters/cdp-session.test.ts tests/unit/adapters/cdp-input.test.ts
git commit -m "feat: add abortable settle and trusted input fallback"
```

## Task 12: Add Runtime Health And Performance Diagnostics

**Files:**
- Modify: `src/core/events/runtime-health.ts`
- Modify: `src/core/events/reducer.ts`
- Modify: `src/sidepanel/runtime-issue.ts`
- Modify: `src/sidepanel/view-model.ts`
- Test: `tests/unit/core/runtime-health.test.ts`
- Test: `tests/unit/sidepanel/runtime-issue.test.ts`
- Test: `tests/unit/sidepanel/view-model.test.ts`

**Interfaces:**
- Produces:

```ts
export interface RuntimeHealthSummary {
  modelCalls: number;
  observationRounds: number;
  fastPathHits: number;
  averageActionMs: number;
  stopLatencyMs?: number;
  warnings: Array<{
    code: "slow_observation" | "slow_action" | "too_many_model_calls" | "stop_latency_high" | "settings_not_persisted";
    message: string;
  }>;
}
```

- [ ] **Step 1: Write failing health summary test**

Add to `tests/unit/core/runtime-health.test.ts`:

```ts
it("flags too many model calls for a simple exact click", () => {
  const summary = summarizeRuntimeHealth([
    makeEvent("TaskStarted", {}),
    makeEvent("ObservationReceived", { durationMs: 80 }),
    makeEvent("ModelCallStarted", { role: "planner" }),
    makeEvent("CommandIssued", { primitive: "dom_click" }),
    makeEvent("CommandResultReceived", { durationMs: 30 })
  ]);

  expect(summary.warnings).toContainEqual(expect.objectContaining({ code: "too_many_model_calls" }));
});
```

- [ ] **Step 2: Verify failure**

Run: `npx vitest run tests/unit/core/runtime-health.test.ts -t "too many model calls"`

Expected: FAIL until health warnings are implemented.

- [ ] **Step 3: Implement deterministic warning thresholds**

Use these initial thresholds:

```ts
export const runtimeHealthThresholds = {
  simpleActionMaxModelCalls: 0,
  observationSlowMs: 800,
  actionSlowMs: 600,
  stopLatencyHighMs: 500
} as const;
```

- [ ] **Step 4: Surface warnings in sidepanel**

In `view-model.ts`, map `RuntimeHealthSummary.warnings` to compact diagnostics:

```ts
export interface WorkbenchDiagnostic {
  code: RuntimeHealthSummary["warnings"][number]["code"];
  title: string;
  detail: string;
  tone: "info" | "warning" | "error";
}
```

- [ ] **Step 5: Verify**

Run:

```bash
npm run typecheck
npx vitest run tests/unit/core/runtime-health.test.ts tests/unit/sidepanel/runtime-issue.test.ts tests/unit/sidepanel/view-model.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/core/events/runtime-health.ts src/core/events/reducer.ts src/sidepanel/runtime-issue.ts src/sidepanel/view-model.ts tests/unit/core/runtime-health.test.ts tests/unit/sidepanel/runtime-issue.test.ts tests/unit/sidepanel/view-model.test.ts
git commit -m "feat: surface runtime health diagnostics"
```

## Task 13: Add Privacy And Artifact Hygiene

**Files:**
- Modify: `src/core/context/assembler.ts`
- Modify: `src/core/context/page-context-assembler.ts`
- Modify: `src/core/evidence/manager.ts`
- Modify: `src/core/events/snapshot.ts`
- Modify: `src/adapters/model/openai-compatible-client.ts`
- Test: `tests/unit/core/model-context.test.ts`
- Test: `tests/unit/core/observation-evidence.test.ts`
- Test: `tests/unit/core/events.test.ts`

**Interfaces:**
- Produces:

```ts
export interface RedactionPolicy {
  redactApiKeys: true;
  redactPasswordFields: true;
  redactBearerTokens: true;
  maxTextValueLength: number;
}
```

- [ ] **Step 1: Write failing secret redaction test**

Add to `tests/unit/core/model-context.test.ts`:

```ts
it("redacts API keys and password field values from model context", () => {
  const context = assemblePlannerContext({
    settings: { apiKey: "sk-secret-value" },
    page: makePageWithPasswordValue("hunter2"),
    events: []
  });

  expect(JSON.stringify(context)).not.toContain("sk-secret-value");
  expect(JSON.stringify(context)).not.toContain("hunter2");
});
```

- [ ] **Step 2: Verify failure**

Run: `npx vitest run tests/unit/core/model-context.test.ts -t "redacts API keys"`

Expected: FAIL until context assembly redacts secrets.

- [ ] **Step 3: Implement a shared redaction function**

Add:

```ts
export function redactSensitiveValue(key: string, value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (/api[-_]?key|authorization|token|password|secret/i.test(key)) return "[REDACTED]";
  if (/sk-[A-Za-z0-9_-]{12,}/.test(value)) return value.replace(/sk-[A-Za-z0-9_-]{12,}/g, "[REDACTED_API_KEY]");
  return value;
}
```

- [ ] **Step 4: Apply redaction at boundaries**

Apply redaction before:

- Model request construction.
- Event snapshot export.
- Downloaded logs.
- Evidence serialization.
- Runtime diagnostics.

- [ ] **Step 5: Verify**

Run:

```bash
npm run typecheck
npx vitest run tests/unit/core/model-context.test.ts tests/unit/core/observation-evidence.test.ts tests/unit/core/events.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/core/context src/core/evidence src/core/events/snapshot.ts src/adapters/model/openai-compatible-client.ts tests/unit/core/model-context.test.ts tests/unit/core/observation-evidence.test.ts tests/unit/core/events.test.ts
git commit -m "fix: redact sensitive runtime artifacts"
```

## Task 14: Compare Main-Branch Speed Without Copying Legacy Design

**Files:**
- Modify: `tests/unit/core/performance-guardrails.test.ts`
- Create: `docs/superpowers/plans/2026-07-07-naturalclick-main-speed-baseline.md`

**Interfaces:**
- Produces:

```ts
export interface SpeedBaseline {
  scenario: string;
  mainBranchBehavior: string;
  currentTargetBehavior: string;
  acceptedDifference: string;
}
```

- [ ] **Step 1: Create a temporary main worktree**

Run:

```bash
git worktree add /private/tmp/naturalclick-main-baseline main
```

Expected: `/private/tmp/naturalclick-main-baseline` exists and contains the main branch.

- [ ] **Step 2: Inspect main branch runtime entry points**

Run:

```bash
rg -n "model|plan|click|observe|execute|chrome\\.tabs|sidePanel" /private/tmp/naturalclick-main-baseline/src /private/tmp/naturalclick-main-baseline/public
```

Expected: Output identifies the old fast click/recognition path.

- [ ] **Step 3: Write baseline notes**

Create `docs/superpowers/plans/2026-07-07-naturalclick-main-speed-baseline.md` with this structure:

```markdown
# NaturalClick Main Speed Baseline

## Scenarios

| Scenario | Main behavior | Target behavior |
| --- | --- | --- |
| Exact visible click | No planner model call when target is unambiguous | No planner model call, one observation max |
| Explicit URL open | Direct navigation | Direct navigation |
| Ambiguous label | Ask for more observation or user clarification | Ask for more observation or user clarification |

## Decisions

- Preserve main's directness for low-risk exact actions.
- Do not copy any CRM-specific selector or UI assumption.
- Keep all new behavior behind generic semantic commands and fast-path strategies.
```

- [ ] **Step 4: Turn the baseline into tests**

Add to `tests/unit/core/performance-guardrails.test.ts`:

```ts
it("documents accepted fast-path budgets", () => {
  const baselines: SpeedBaseline[] = [
    {
      scenario: "exact visible click",
      mainBranchBehavior: "direct click",
      currentTargetBehavior: "fast_path exact_visible_control",
      acceptedDifference: "zero planner calls and one observation max"
    }
  ];

  expect(baselines[0].acceptedDifference).toContain("zero planner calls");
});
```

- [ ] **Step 5: Remove the temporary worktree**

Run:

```bash
git worktree remove /private/tmp/naturalclick-main-baseline
```

Expected: `/private/tmp/naturalclick-main-baseline` no longer exists.

- [ ] **Step 6: Verify**

Run:

```bash
npm run typecheck
npx vitest run tests/unit/core/performance-guardrails.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add docs/superpowers/plans/2026-07-07-naturalclick-main-speed-baseline.md tests/unit/core/performance-guardrails.test.ts
git commit -m "docs: capture main branch speed baseline"
```

## Task 15: Add Full Release Verification And Version Discipline

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `public/manifest.json`
- Modify: `naturalclick-extension/manifest.json`
- Modify: `tests/unit/build/manifest.test.ts`

**Interfaces:**
- Produces:

```ts
export interface ReleaseVerification {
  version: string;
  typecheck: "passed";
  unit: "passed";
  build: "passed";
  uiScan: "passed";
}
```

- [ ] **Step 1: Write version consistency test**

Add to `tests/unit/build/manifest.test.ts`:

```ts
it("keeps package and extension manifest versions in sync", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  const publicManifest = JSON.parse(readFileSync("public/manifest.json", "utf8"));
  const builtManifest = JSON.parse(readFileSync("naturalclick-extension/manifest.json", "utf8"));

  expect(publicManifest.version).toBe(packageJson.version);
  expect(builtManifest.version).toBe(packageJson.version);
});
```

- [ ] **Step 2: Verify the test**

Run: `npx vitest run tests/unit/build/manifest.test.ts`

Expected: PASS before release, FAIL if a future change forgets one version file.

- [ ] **Step 3: Bump version after behavior changes**

For a behavior-changing implementation, update these four files to the same version:

```json
{
  "version": "0.1.81"
}
```

Use the next patch version available at implementation time. If current version is already higher, increment from that current version.

- [ ] **Step 4: Run the release checks**

Run:

```bash
npm run typecheck
npm run test:unit
npm run build
rg -n "alert\\(|confirm\\(|prompt\\(|window\\.alert|window\\.confirm|window\\.prompt|<select\\b|outline\\s*:\\s*none|outline-none|transition\\s*:\\s*all" src/sidepanel public/sidepanel.css naturalclick-extension/sidepanel.css tests/unit/sidepanel
```

Expected:

- Typecheck PASS.
- Unit tests PASS.
- Build PASS.
- `rg` returns no matches.

- [ ] **Step 5: Commit**

Run:

```bash
git add package.json package-lock.json public/manifest.json naturalclick-extension/manifest.json tests/unit/build/manifest.test.ts
git commit -m "chore: verify extension release version"
```

---

## Cross-Task Acceptance Checklist

- [ ] A simple exact visible click runs with zero planner model calls.
- [ ] A simple explicit URL task navigates directly.
- [ ] Ambiguous labels produce structured ambiguity details, not random clicks.
- [ ] Visible debug markers no longer include role/confidence/text blobs that pollute vision.
- [ ] Vision capture clears visible overlays first.
- [ ] Stop produces a visible stopping state and then terminates active model/tool/action work.
- [ ] Closing/opening the side panel after creating a new session does not restore the old historical conversation.
- [ ] Switching away from Chrome and back does not lose active side-panel conversation state.
- [ ] Model configuration and overlay settings survive side-panel refresh.
- [ ] API keys and password values are absent from logs, prompts, traces, fixtures, and downloads.
- [ ] Every behavior-changing implementation bumps all version files together.
- [ ] `npm run typecheck`, `npm run test:unit`, and `npm run build` pass.

## Execution Notes

- Implement tasks in order unless a task only touches docs or tests and has no dependency on prior code.
- Use a fresh subagent per task when possible because each task has a clear file boundary and test command.
- Keep commits small and named after the task.
- Do not keep temporary worktrees or cloned references after implementation; remove them before handing work back.
- Do not copy Pie code. Translate useful ideas into NaturalClick interfaces and tests.
