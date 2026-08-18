# NaturalClick Architecture Refactor Blueprint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give NaturalClick a complete, design-pattern-driven refactor blueprint for becoming a fast, reliable, general-purpose browser operation Agent.

**Architecture:** Keep a hexagonal TypeScript Chrome MV3 extension. Core modules own domain decisions, state machines, model/tool contracts, observation summaries, command binding, runtime events, and policies; adapters own Chrome APIs, content scripts, DOM execution, storage, CDP, model HTTP clients, and side-panel rendering. The plan applies bounded contexts, ports and adapters, command pattern, strategy pattern, repository pattern, event-sourced state reduction, explicit lifecycle state machines, presenter/view-model separation, and an anti-corruption layer for Pie-inspired UI and engine ideas.

**Tech Stack:** TypeScript, Chrome Manifest V3, Vite, Vitest + jsdom, DOM-rendered side panel, Chrome storage, OpenAI-compatible model APIs, optional Chrome DevTools Protocol input adapter, existing NaturalClick core/adapters/tests.

## Global Constraints

- NaturalClick is a universal browser-operation Agent; no CRM-specific selectors, menu names, routes, screenshots, or hard-coded workflows are allowed.
- Execution must work when visible overlay markers are off. Hidden handles, Page Atlas records, and interactive indexes are execution inputs.
- Visible overlays are debug visualization only and must be cleared before any vision screenshot capture.
- Simple deterministic tasks must bypass planner model calls when target, intent, risk, and page state are unambiguous.
- Stop must abort model streaming, runtime loops, tool loops, action settling, CDP sessions, and queued continuation work.
- Side panel refresh, panel close/open, browser focus switches, and service worker restarts must not silently lose active session state or saved model configuration.
- API keys must not appear in logs, traces, downloaded diagnostics, prompt snapshots, DOM snapshots, screenshots, fixtures, or test output.
- Every meaningful runtime transition must be represented by an `AgentEvent` or derived from persisted events.
- Every new UI control must have an accessible label, keyboard reachability, visible focus state, and layout that fits at 360px side-panel width.
- Do not migrate to React only to imitate Pie. Keep the current DOM renderer unless a separate migration plan is approved.
- Any implementation that changes extension behavior must bump `package.json`, `package-lock.json`, `public/manifest.json`, and generated `naturalclick-extension/manifest.json`.
- Existing uncommitted user changes must not be reverted.

---

## 1. Architecture Rulebook

### 1.1 Dependency Direction

**Problem:** Browser-Agent projects tend to become tangled: model prompts know DOM details, content scripts know task state, UI reads raw events, and stop behavior is scattered across booleans.

**Rule:** Dependencies point inward.

```text
sidepanel/rendering  -> sidepanel/view-model -> core/events/state
background/adapters  -> core/runtime ports    -> core/domain contracts
content/dom adapters -> core/observation      -> shared serializable types
model/http adapters  -> core/model contracts  -> shared result types
```

Core code under `src/core/**` must not call `chrome.*`, mutate real DOM, import side-panel render helpers, or know CSS class names. Adapter code under `src/adapters/**`, `src/background/**`, `src/content/**`, and `src/sidepanel/**` may depend on core contracts but must not push adapter-specific types back into core.

**Boundary tests:** `tests/unit/core/architecture-boundaries.test.ts` should protect forbidden imports and serializable contracts.

### 1.2 Bounded Contexts

The project should be understood as nine bounded contexts:

1. `Sidepanel Workbench`: visible user experience, settings center, composer, session drawer, runtime issue display.
2. `Model Configuration`: provider instances, model roles, capability flags, persistence, validation.
3. `Observation`: Page Atlas, interactive index, stable hidden handles, compact context.
4. `Overlay And Vision Hygiene`: debug overlay projection, marker rendering, clean screenshot preparation.
5. `Execution`: task interpretation, fast paths, tool loop, command binding, verification.
6. `Action Adapters`: DOM primitives, settle waits, CDP trusted input, browser tab operations.
7. `Session Lifecycle`: active session, new session, stop, resume, recovery, tombstones.
8. `Runtime Health And Evaluation`: timings, warnings, performance guardrails, fixtures.
9. `Protocol And Serialization`: extension messages, shared IDs, redaction, version compatibility.

Each context owns its vocabulary. Cross-context communication uses small value objects and ports, not shared mutable state.

### 1.3 Design Patterns To Apply

- **Hexagonal Architecture:** Core owns ports; Chrome, DOM, model, storage, CDP, and side panel are adapters.
- **Command Pattern:** User intent becomes `SemanticCommand`; binding turns it into a `BrowserPrimitive`; adapters execute primitives.
- **Strategy Pattern:** Observation mode, fast-path eligibility, model role routing, target binding, tool disclosure, recovery, and action executor are replaceable strategies.
- **Repository Pattern:** Sessions, events, model configs, detected models, settings, and atlas cache use stores. Core and UI do not call `chrome.storage` directly.
- **State Machine:** Session/task lifecycle is encoded as legal transitions, including `idle`, `running`, `stopping`, `stopped`, `awaiting_confirmation`, `completed`, `failed`, and `blocked`.
- **Presenter/ViewModel:** `src/sidepanel/view-model.ts` converts raw state/events to render props. `src/sidepanel/render.ts` composes DOM only.
- **Event Sourcing Lite:** Runtime events are the durable explanation and recovery source. Snapshots are optimization, not truth.
- **Anti-Corruption Layer:** Pie-inspired concepts are translated into NaturalClick names and interfaces. Do not import Pie naming such as `data-pie-idx` or Pie React file structure.

---

## 2. Sidepanel Workbench Refactor

### Current Problems

- `src/sidepanel/render.ts` is still too close to being a page-level renderer plus component library plus behavior map.
- Settings, drawer, composer, transcript, model picker, and runtime diagnostics are not clearly separated as independent UI surfaces.
- New-session and model-configuration affordances need to be obvious to first-time users without explanatory text blocks.
- Side panel state rehydration and local view state are easy to conflate.

### Target Design

Use **Presenter/ViewModel + Component Composition**.

`render.ts` becomes the composition root. It receives a view model and handlers, then delegates to focused render helpers. `state.ts` owns UI state transitions. `view-model.ts` owns projections from runtime/session/config state into stable props. Component modules render DOM and attach handlers only from their handler interfaces.

### Files

- Modify: `src/sidepanel/render.ts`
- Modify: `src/sidepanel/main.ts`
- Modify: `src/sidepanel/state.ts`
- Modify: `src/sidepanel/view-model.ts`
- Modify: `src/sidepanel/settings.ts`
- Modify: `src/sidepanel/components/workbench.ts`
- Create: `src/sidepanel/components/topbar.ts`
- Create: `src/sidepanel/components/composer.ts`
- Create: `src/sidepanel/components/transcript.ts`
- Create: `src/sidepanel/components/settings-center.ts`
- Create: `src/sidepanel/components/session-drawer.ts`
- Modify: `src/sidepanel/i18n.ts`
- Modify: `public/sidepanel.css`
- Test: `tests/unit/sidepanel/render.test.ts`
- Test: `tests/unit/sidepanel/state.test.ts`
- Test: `tests/unit/sidepanel/view-model.test.ts`
- Test: `tests/unit/sidepanel/settings.test.ts`

### Interfaces

```ts
export type WorkbenchSurface =
  | "chat"
  | "settings"
  | "history"
  | "trace"
  | "runtime_issues";

export interface WorkbenchViewModel {
  surface: WorkbenchSurface;
  topbar: TopbarProps;
  transcript: TranscriptProps;
  composer: ComposerProps;
  settings: SettingsCenterProps;
  drawer: SessionDrawerProps;
  runtimeIssues: RuntimeIssueProps[];
}

export interface ComposerProps {
  value: string;
  disabled: boolean;
  running: boolean;
  placeholder: string;
  activeModelLabel: string;
  contextLabel: string;
  toolMenuOpen: boolean;
}

export interface WorkbenchHandlers {
  onSubmitTask(value: string): void;
  onStopTask(): void;
  onNewSession(): void;
  onOpenSettings(): void;
  onOpenHistory(): void;
  onSelectModel(instanceId: string, modelId: string): void;
  onToggleToolMenu(): void;
  onSetSurface(surface: WorkbenchSurface): void;
}
```

### Implementation Plan

- [ ] Move top-bar rendering into `src/sidepanel/components/topbar.ts` with explicit `TopbarProps` and `TopbarHandlers`.
- [ ] Move composer rendering into `src/sidepanel/components/composer.ts`; keep send/stop as one stable control whose state changes with runtime status.
- [ ] Move transcript rendering into `src/sidepanel/components/transcript.ts`; transcript receives renderable rows, not raw `AgentEvent[]`.
- [ ] Move model/provider/settings UI into `src/sidepanel/components/settings-center.ts`; keep model config as a first-class tab.
- [ ] Move history and active-session UI into `src/sidepanel/components/session-drawer.ts`.
- [ ] Reduce `src/sidepanel/render.ts` to shell composition, empty/loading/error states, and component wiring.
- [ ] Update `src/sidepanel/view-model.ts` so all status labels, issue hints, and model labels are computed in one pure place.
- [ ] Update `src/sidepanel/state.ts` with typed UI actions for drawer open, settings tab, model picker, composer value, and trace expansion.
- [ ] Update `public/sidepanel.css` with Pie-inspired dark workbench tokens, compact top actions, bottom composer, drawer, modal, tabs, focus states, and 360px constraints.
- [ ] Add tests that render every workbench surface without relying on browser APIs.

### Acceptance Criteria

- `render.ts` no longer contains settings form internals, drawer internals, or model-config field logic.
- Tests can instantiate a `WorkbenchViewModel` and verify the topbar, composer, settings center, drawer, transcript, and runtime issues independently.
- New-session action is text-and-icon clear at normal panel width and icon-only acceptable at very narrow widths.
- Composer does not show keyboard shortcut instructions as visible product copy.
- No `alert`, `confirm`, `prompt`, `<select>`, invisible focus rings, or `transition: all` in side-panel code/CSS.

---

## 3. Model Configuration Refactor

### Current Problems

- Model configuration has historically behaved like a loose provider tuple, which makes persistence, refresh recovery, capability routing, and model-specific behavior brittle.
- Settings persistence bugs are hard to isolate because UI state, storage schema, runtime config, and HTTP client config can drift.
- Planner, vision, verifier, and summarizer roles need explicit mapping instead of one global model assumption.

### Target Design

Use **Repository Pattern + Value Objects + Role Router Strategy**.

The core model context owns provider instances, model instances, role selections, capability flags, and sanitized runtime config. Chrome storage is an adapter. The model HTTP client consumes a resolved `ModelRuntimeConfig`, not side-panel settings.

### Files

- Modify: `src/core/model/model-instance.ts`
- Modify: `src/core/model/model-registry.ts`
- Modify: `src/core/model/model-config-service.ts`
- Modify: `src/core/model/role-router.ts`
- Modify: `src/core/model/openai-compatible.ts`
- Modify: `src/core/model/streaming-client.ts`
- Modify: `src/adapters/chrome/model-config-store.ts`
- Modify: `src/adapters/model/openai-compatible-client.ts`
- Modify: `src/sidepanel/settings.ts`
- Test: `tests/unit/core/model-config-service.test.ts`
- Test: `tests/unit/core/model-contracts.test.ts`
- Test: `tests/unit/core/openai-compatible.test.ts`
- Test: `tests/unit/core/streaming-client.test.ts`
- Test: `tests/unit/adapters/model-config-store.test.ts`
- Test: `tests/unit/sidepanel/settings.test.ts`

### Interfaces

```ts
export type ModelRole = "planner" | "vision" | "verifier" | "summarizer" | "fast_classifier";

export interface ModelProviderInstance {
  id: string;
  provider: "openai-compatible";
  label: string;
  baseUrl: string;
  apiKeyRef: string;
  createdAt: number;
  updatedAt: number;
}

export interface ModelSelection {
  role: ModelRole;
  providerInstanceId: string;
  modelId: string;
}

export interface ModelRuntimeConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  capabilities: {
    streaming: boolean;
    vision: boolean;
    toolCalls: boolean;
    jsonMode: boolean;
  };
}
```

### Implementation Plan

- [ ] Keep model value objects pure under `src/core/model/**`; no Chrome storage or DOM types.
- [ ] Make `model-config-service.ts` the only place that validates provider instances, selections, default roles, and detected-model cache updates.
- [ ] Make `model-config-store.ts` responsible for storage schema migration, masking, and redaction.
- [ ] Add `role-router.ts` logic for selecting planner, verifier, vision, summarizer, and fast-classifier models by role and capability.
- [ ] Update `openai-compatible-client.ts` to receive `ModelRuntimeConfig` from the service or router, not raw side-panel state.
- [ ] Update settings UI to edit provider instances and role selections separately.
- [ ] Add tests proving saved config survives reload, invalid config gives a typed validation issue, and API keys never appear in serialized logs.

### Acceptance Criteria

- Refreshing or reopening the side panel does not reset page-marker or model settings.
- Adding a provider instance, selecting a model, saving, and rehydrating produces the same `ModelSelection[]`.
- A model without vision capability cannot be selected for `vision` without a clear validation issue.
- Runtime logs and downloaded logs contain masked API key references only.

---

## 4. Observation And Element Recognition Refactor

### Current Problems

- Visible labels and debug markers have been confused with execution evidence, polluting visual-model input and user pages.
- Multiple similar controls can produce ambiguous matching because text labels, roles, proximity, and menu semantics are not ranked consistently.
- Repeated model calls happen when a deterministic interactive index could already answer the next action.
- Page dumps can be too large, stale, or noisy for fast operation.

### Target Design

Use **Page Atlas + Interactive Index + Stable Hidden Handle Repository**.

Content scripts collect visible semantics and stable handles. Core receives compact, serializable page records. Debug overlays are derived from those records only when requested; they are not the source of truth.

### Files

- Modify: `src/core/observation/page-atlas.ts`
- Modify: `src/core/observation/interactive-index.ts`
- Modify: `src/core/observation/atlas-store.ts`
- Modify: `src/core/observation/progressive-observer.ts`
- Modify: `src/core/observation/debug-overlay-model.ts`
- Modify: `src/core/context/page-context-assembler.ts`
- Modify: `src/core/context/stale-observation-elision.ts`
- Modify: `src/adapters/content/dom-observer.ts`
- Modify: `src/adapters/content/page-node-index.ts`
- Modify: `src/shared/overlay-targets.ts`
- Test: `tests/unit/core/page-atlas.test.ts`
- Test: `tests/unit/core/page-atlas-fixtures.test.ts`
- Test: `tests/unit/core/interactive-index.test.ts`
- Test: `tests/unit/core/progressive-observer.test.ts`
- Test: `tests/unit/core/observation-evidence.test.ts`
- Test: `tests/unit/adapters/dom-observer.test.ts`
- Test: `tests/unit/adapters/page-node-index.test.ts`
- Test: `tests/unit/shared/overlay-targets.test.ts`

### Interfaces

```ts
export interface PageAtlas {
  pageId: string;
  urlFingerprint: string;
  title: string;
  landmarks: AtlasLandmark[];
  controls: AtlasControl[];
  forms: AtlasForm[];
  frames: AtlasFrame[];
  capturedAt: number;
}

export interface AtlasControl {
  handle: string;
  role: "button" | "link" | "menuitem" | "textbox" | "combobox" | "checkbox" | "tab" | "generic";
  label: string;
  visibleText: string;
  accessibleName: string;
  bounds: Rect;
  enabled: boolean;
  visible: boolean;
  menuState?: "collapsed" | "expanded" | "leaf";
  confidence: number;
  evidence: string[];
}

export interface TargetCandidate {
  handle: string;
  score: number;
  reasonCodes: string[];
  ambiguity: "none" | "low" | "medium" | "high";
}
```

### Implementation Plan

- [ ] Make `dom-observer.ts` collect role, accessible name, visible text, enabled state, bounds, menu state, frame path, and semantic hints without drawing anything.
- [ ] Make `page-node-index.ts` assign hidden `data-naturalclick-handle` attributes and maintain handle lookup with mutation-aware refresh.
- [ ] Make `interactive-index.ts` rank candidates with label match, role match, visibility, enabled state, hierarchy, menu state, and proximity to active region.
- [ ] Make `page-atlas.ts` produce compact summaries grouped by landmarks, menus, forms, and focused area.
- [ ] Make `progressive-observer.ts` return small observation slices first and request deeper slices only when binding fails or the model asks for more detail.
- [ ] Make `page-context-assembler.ts` prefer atlas slices over raw DOM and remove stale observations via `stale-observation-elision.ts`.
- [ ] Make `debug-overlay-model.ts` project short debug labels only, separate from execution target records.
- [ ] Add fixtures for sidebar menus, iframe forms, rich editors, and repeated similar labels.

### Acceptance Criteria

- A collapsed sidebar menu is represented as a `menuitem` or button-like control with `menuState: "collapsed"` and a stable handle.
- Exact visible target activation can bind by handle without requiring overlay labels.
- Similar controls return an ambiguity result with competing candidates instead of choosing arbitrarily.
- Observation context size remains bounded by test guardrails.
- Turning overlay off removes visible marker roots and does not reduce execution capability.

---

## 5. Overlay And Vision Hygiene Refactor

### Current Problems

- Debug overlays can cover target text and influence screenshots used by visual models.
- Verbose marker text such as role, label, and confidence is visually intrusive.
- Overlay settings must persist without resetting on extension refresh.

### Target Design

Use **Debug Projection Adapter**.

Core creates `DebugOverlayTarget[]` from page records. The content adapter decides how to render short, non-interfering visualization. Vision capture requests must clear overlays first.

### Files

- Modify: `src/core/observation/debug-overlay-model.ts`
- Modify: `src/adapters/content/overlay-controller.ts`
- Modify: `src/shared/overlay-targets.ts`
- Modify: `src/core/vision/vision.ts`
- Modify: `src/sidepanel/main.ts`
- Modify: `src/sidepanel/settings.ts`
- Test: `tests/unit/adapters/overlay-controller.test.ts`
- Test: `tests/unit/shared/overlay-targets.test.ts`
- Test: `tests/unit/core/vision.test.ts`
- Test: `tests/unit/sidepanel/settings.test.ts`

### Interfaces

```ts
export type OverlayMode = "off" | "minimal" | "debug";

export interface DebugOverlayTarget {
  handle: string;
  marker: number;
  bounds: Rect;
  role: string;
  shortLabel: string;
  confidence?: number;
}

export interface VisionCaptureRequest {
  tabId: number;
  clearDebugOverlays: true;
  reason: "target_grounding" | "state_verification" | "user_requested_debug";
}
```

### Implementation Plan

- [ ] Keep overlay payloads free of execution-only labels and long descriptions.
- [ ] Render `off` by removing the overlay root, not by hiding a still-present layer.
- [ ] Render `minimal` with small numbered pins and no text badges over controls.
- [ ] Render `debug` with short labels only when explicitly enabled.
- [ ] Add a `clearDebugOverlays` handshake before screenshot capture.
- [ ] Persist overlay mode through the same settings store used by side-panel settings.

### Acceptance Criteria

- Vision tests prove capture requests require `clearDebugOverlays: true`.
- Overlay tests prove `off` removes roots and `minimal` avoids verbose labels.
- The UI never draws large role/confidence badges over active page content by default.

---

## 6. Execution Engine And Fast Paths Refactor

### Current Problems

- Simple operations can still go through planner-model turns, making clicks and recognition feel slow.
- Model output, tool calls, command binding, and execution are not visible as separate layers to test.
- Fast paths need strict risk rules to avoid making unsafe assumptions.

### Target Design

Use **Command Pattern + Strategy Pattern + Tool Loop**.

The runtime should first attempt deterministic fast paths. If no fast path applies, it calls the planner/tool loop with compact page context. Binding prefers stable handles. Execution emits structured events and is bounded by budgets.

### Files

- Modify: `src/core/runtime/agent-runtime.ts`
- Modify: `src/core/runtime/fast-paths.ts`
- Modify: `src/core/runtime/tool-loop.ts`
- Modify: `src/core/runtime/execution-budget.ts`
- Modify: `src/core/runtime/execution-recovery.ts`
- Modify: `src/core/runtime/action-key.ts`
- Modify: `src/core/commands/commands.ts`
- Modify: `src/core/commands/binder.ts`
- Modify: `src/core/tools/tool.ts`
- Modify: `src/core/tools/tool-registry.ts`
- Modify: `src/core/tools/page-tools.ts`
- Modify: `src/core/tools/browser-tools.ts`
- Modify: `src/core/verification/verifier.ts`
- Test: `tests/unit/core/agent-runtime.test.ts`
- Test: `tests/unit/core/agent-speed-paths.test.ts`
- Test: `tests/unit/core/tool-loop.test.ts`
- Test: `tests/unit/core/execution-budget.test.ts`
- Test: `tests/unit/core/execution-recovery.test.ts`
- Test: `tests/unit/core/commands-binder.test.ts`
- Test: `tests/unit/core/tool-registry.test.ts`
- Test: `tests/unit/core/verifier-memory.test.ts`

### Interfaces

```ts
export type FastPathKind =
  | "explicit_url_navigation"
  | "exact_visible_control"
  | "focused_text_entry"
  | "single_field_submit";

export interface FastPathDecision {
  kind: FastPathKind;
  allowed: boolean;
  command?: SemanticCommand;
  risk: "low" | "medium" | "high";
  reasonCodes: string[];
}

export interface SemanticCommand {
  type: "navigate" | "click" | "type" | "select" | "scroll" | "wait" | "done" | "fail";
  target?: TargetDescriptor;
  value?: string;
  rationale: string;
}

export interface BoundCommand {
  command: SemanticCommand;
  primitive: BrowserPrimitive;
  binding: {
    handle?: string;
    confidence: number;
    alternatives: TargetCandidate[];
  };
}
```

### Implementation Plan

- [ ] Make `fast-paths.ts` evaluate URL navigation, one exact visible low-risk control, focused text entry, and single-field submit before planner calls.
- [ ] Make `agent-runtime.ts` record whether execution used a fast path, model planner, tool loop, or recovery.
- [ ] Make `tool-loop.ts` bounded by step count, time, token budget, and abort signal.
- [ ] Make `binder.ts` bind exact handles first, then exact role+label, then ranked fuzzy candidates, then return ambiguity.
- [ ] Make `browser-tools.ts` expose small tools such as `read_page`, `find_target`, `click`, `type`, `scroll`, `wait`, `done`, and `fail`.
- [ ] Make `tool-registry.ts` disclose only the tools needed for the current role/context.
- [ ] Make `verifier.ts` prefer deterministic page-state evidence and use model verification only when deterministic verification is insufficient.

### Acceptance Criteria

- A task like "点击客户管理" on a fixture with one exact sidebar control executes without planner model call.
- Ambiguous targets produce an `awaiting_confirmation` or clarification path, not a random click.
- Every executed primitive has a preceding `BoundCommand` event and a following execution result event.
- Performance guardrails catch regressions where simple exact clicks start calling the planner model again.

---

## 7. Action Adapter Refactor

### Current Problems

- DOM clicks, text input, editor input, settle waits, and CDP input have different failure modes and need one consistent adapter contract.
- Stop can be delayed when action settling or CDP operations do not check abort state.
- Browser pages need trusted input fallback for complex editors, but CDP must remain optional and safe.

### Target Design

Use **Adapter Strategy + Abortable Execution Contract**.

Core emits `BrowserPrimitive`. The adapter selects DOM execution or CDP execution based on primitive type, target state, permissions, and configured risk. All action paths receive an abort signal and return timing/evidence.

### Files

- Modify: `src/adapters/content/primitive-executor.ts`
- Modify: `src/adapters/content/action-settle.ts`
- Modify: `src/adapters/chrome/cdp-session.ts`
- Modify: `src/adapters/chrome/cdp-input.ts`
- Modify: `src/adapters/chrome/tabs.ts`
- Modify: `src/background/index.ts`
- Modify: `src/shared/protocol.ts`
- Test: `tests/unit/adapters/primitive-executor.test.ts`
- Test: `tests/unit/adapters/action-settle.test.ts`
- Test: `tests/unit/adapters/cdp-session.test.ts`
- Test: `tests/unit/adapters/cdp-input.test.ts`
- Test: `tests/unit/adapters/chrome-tabs.test.ts`

### Interfaces

```ts
export interface BrowserPrimitive {
  type: "click" | "type" | "select" | "scroll" | "navigate" | "wait";
  handle?: string;
  coordinates?: { x: number; y: number };
  text?: string;
  value?: string;
  settle?: ActionSettlePolicy;
}

export interface PrimitiveExecutionResult {
  ok: boolean;
  changed: boolean;
  durationMs: number;
  evidence: string[];
  errorCode?: "target_missing" | "target_disabled" | "navigation_failed" | "aborted" | "permission_denied";
}

export interface ActionSettlePolicy {
  waitFor: Array<"mutation" | "navigation" | "paint" | "network_idle" | "focus_change">;
  timeoutMs: number;
}
```

### Implementation Plan

- [ ] Make `primitive-executor.ts` resolve handles at execution time and fail with typed errors when stale.
- [ ] Make typing support native inputs, textareas, contenteditable, and simple rich-editor fallbacks.
- [ ] Make `action-settle.ts` watch mutation, navigation, focus, and paint quiet signals with an abortable timeout.
- [ ] Make `cdp-session.ts` attach lazily, use an owner token, detach on abort, and surface typed detach reasons.
- [ ] Make `cdp-input.ts` expose mouse and keyboard primitives with coordinate validation.
- [ ] Make `background/index.ts` own per-run abort controllers and pass abort signals through every adapter call.

### Acceptance Criteria

- Stale handle execution returns `target_missing` and triggers re-observation rather than silent failure.
- Stop during settle returns `aborted` quickly.
- CDP attach failure does not break DOM execution fallback.
- Rich-editor fixture receives typed text through the best available path.

---

## 8. Session Lifecycle And Stop Refactor

### Current Problems

- Closing/reopening the plugin, switching apps, refreshing side panel, or service-worker restart can make UI state appear lost or stale.
- New session and active history behavior need a stronger state model.
- Stop has to terminate all work, not only update UI status.

### Target Design

Use **Explicit State Machine + Event Store + Tombstone**.

Every task/session transition is legal only through the state machine. Stop creates a durable tombstone. Rehydration derives visible state from persisted events plus latest snapshot. New session writes an explicit current-session pointer.

### Files

- Modify: `src/core/session/session-state-machine.ts`
- Modify: `src/core/session/session-store.ts`
- Modify: `src/core/events/events.ts`
- Modify: `src/core/events/reducer.ts`
- Modify: `src/core/events/snapshot.ts`
- Modify: `src/core/events/runtime-health.ts`
- Modify: `src/core/runtime/execution-controller.ts`
- Modify: `src/adapters/chrome/chrome-session-memory.ts`
- Modify: `src/adapters/chrome/chrome-storage-event-store.ts`
- Modify: `src/adapters/chrome/runtime-event-bus.ts`
- Modify: `src/sidepanel/runtime-subscription.ts`
- Modify: `src/sidepanel/state.ts`
- Modify: `src/background/index.ts`
- Test: `tests/unit/core/session-state-machine.test.ts`
- Test: `tests/unit/core/events.test.ts`
- Test: `tests/unit/core/execution-controller.test.ts`
- Test: `tests/unit/core/runtime-health.test.ts`
- Test: `tests/unit/adapters/chrome-session-memory.test.ts`
- Test: `tests/unit/adapters/chrome-storage-event-store.test.ts`
- Test: `tests/unit/adapters/runtime-event-bus.test.ts`
- Test: `tests/unit/sidepanel/state.test.ts`

### Interfaces

```ts
export type TaskStatus =
  | "idle"
  | "running"
  | "stopping"
  | "stopped"
  | "awaiting_confirmation"
  | "completed"
  | "failed"
  | "blocked";

export interface StopTombstone {
  taskId: string;
  sessionId: string;
  reason: "user_stop" | "new_task_replaced_previous" | "panel_disconnect" | "budget_exceeded";
  createdAt: number;
}

export interface SessionRecoverySnapshot {
  sessionId: string;
  activeTaskId?: string;
  status: TaskStatus;
  lastEventId: string;
  currentSessionPointer: boolean;
}
```

### Implementation Plan

- [ ] Encode legal session/task transitions in `session-state-machine.ts` and test illegal transitions.
- [ ] Add stop tombstone events and reducer handling.
- [ ] Make `execution-controller.ts` own abort controller registration and stop propagation.
- [ ] Make `background/index.ts` reject continuations when a tombstone exists for the task.
- [ ] Make `chrome-session-memory.ts` persist current session pointer, fresh session marker, and recovery snapshot.
- [ ] Make `runtime-subscription.ts` rehydrate on panel load, panel visibility change, runtime reconnect, and focus return.
- [ ] Make side-panel new-session action create a new current session and prevent immediate fallback to old history.

### Acceptance Criteria

- Clicking stop aborts model streaming, tool loop, settle waits, CDP, and queued follow-up work.
- Reopening the side panel after app focus change restores the active conversation or a fresh session intentionally.
- Creating a new session, closing the panel, and reopening shows the new session as current.
- A stopped task never resumes unless the user starts a new task.

---

## 9. Runtime Health And Evaluation Refactor

### Current Problems

- Slow recognition and click execution are hard to diagnose without structured timings.
- Regression coverage must protect the exact user complaints: wrong element recognition, model-heavy simple clicks, incomplete stop, lost settings, and overlay interference.
- The plugin needs fixture-based evaluation that is generic, not tied to one CRM.

### Target Design

Use **Observability Events + Fixture Guardrails**.

The runtime records observation, model, binding, action, settle, verification, stop, and rehydrate timings. Unit and fixture tests enforce speed and correctness invariants.

### Files

- Modify: `src/core/events/runtime-health.ts`
- Modify: `src/sidepanel/runtime-issue.ts`
- Modify: `tests/unit/core/performance-guardrails.test.ts`
- Create or modify: `tests/fixtures/pages/crm-sidebar.html`
- Create or modify: `tests/fixtures/pages/iframe-form.html`
- Create or modify: `tests/fixtures/pages/rich-editor.html`
- Create: `tests/fixtures/pages/repeated-labels.html`
- Create: `tests/fixtures/pages/settings-form.html`
- Test: `tests/unit/core/performance-guardrails.test.ts`
- Test: `tests/unit/sidepanel/runtime-issue.test.ts`

### Interfaces

```ts
export interface RuntimeTimingMetric {
  name:
    | "observation"
    | "binding"
    | "planner_model"
    | "tool_loop"
    | "primitive_execution"
    | "action_settle"
    | "verification"
    | "stop_to_idle"
    | "rehydrate";
  durationMs: number;
  taskId?: string;
  sessionId?: string;
  metadata: Record<string, string | number | boolean>;
}

export interface RuntimeHealthIssue {
  severity: "info" | "warning" | "error";
  code: string;
  title: string;
  detail: string;
  evidenceEventIds: string[];
}
```

### Implementation Plan

- [ ] Emit timing metrics for observation, binding, model call, tool loop, primitive execution, settle, verification, stop, and rehydrate.
- [ ] Derive health issues for slow observation, unnecessary planner call on exact simple action, slow settle, repeated ambiguity, incomplete stop, and config rehydrate failure.
- [ ] Add fixture tests for generic sidebar menu expansion, repeated labels, iframe form, rich editor, and settings persistence.
- [ ] Add performance guardrails with stable fake timers or injected clocks so tests are deterministic.
- [ ] Render runtime issues in the side panel as actionable diagnostic hints, not raw stack traces.

### Acceptance Criteria

- Tests fail if exact low-risk click calls planner model.
- Tests fail if stop does not reach an idle/stopped terminal state within the expected controller loop.
- Tests fail if overlay markers are required for element recognition.
- Runtime issue messages point to the likely cause and the affected stage.

---

## 10. Protocol, Serialization, And Redaction Refactor

### Current Problems

- Extension messages cross service worker, side panel, and content scripts; untyped drift can create hard-to-debug runtime failures.
- Logs and downloaded diagnostics need strict redaction.
- Versioned storage migrations need compatibility tests.

### Target Design

Use **Typed Protocol Contracts + Serialization Boundary**.

Every cross-boundary message is serializable, versioned when needed, and redacted before logging. Core identifiers use opaque branded types where helpful.

### Files

- Modify: `src/shared/protocol.ts`
- Modify: `src/shared/result.ts`
- Modify: `src/shared/ids.ts`
- Modify: `src/core/architecture/serialization.ts`
- Modify: `src/core/architecture/boundaries.ts`
- Modify: `src/core/events/events.ts`
- Modify: `src/core/model/contracts.ts`
- Test: `tests/unit/core/architecture-boundaries.test.ts`
- Test: `tests/unit/core/model-contracts.test.ts`
- Test: `tests/unit/shared/overlay-targets.test.ts`

### Interfaces

```ts
export type ProtocolMessage =
  | { type: "naturalclick.observe"; requestId: string; payload: ObserveRequest }
  | { type: "naturalclick.executePrimitive"; requestId: string; payload: BrowserPrimitive }
  | { type: "naturalclick.runtimeEvent"; requestId: string; payload: AgentEvent }
  | { type: "naturalclick.stopTask"; requestId: string; payload: { taskId: string; reason: string } };

export interface RedactionPolicy {
  redactApiKeys: true;
  redactUserSecrets: true;
  maxTextLength: number;
}
```

### Implementation Plan

- [ ] Centralize protocol message types in `src/shared/protocol.ts`.
- [ ] Add serialization tests for events, protocol messages, model runtime configs, atlas records, and overlay targets.
- [ ] Add redaction helpers for API keys, Authorization headers, provider configs, and user-marked secret fields.
- [ ] Ensure downloaded logs call redaction before serialization.
- [ ] Ensure storage migration output never writes raw provider secrets into runtime traces.

### Acceptance Criteria

- Cross-boundary messages serialize and deserialize without functions, DOM nodes, AbortSignals, or non-cloneable objects.
- Redaction tests prove API keys and Authorization headers are masked.
- Architecture tests prevent core modules from importing adapter implementation files.

---

## 11. Capability System Refactor

### Current Problems

- Capabilities such as scratchpad, files, PDF, skills, and schedules should be discoverable without being enabled by default.
- Tool disclosure should be progressive so model calls are not bloated by unused tools.
- The UI needs capability surfaces without turning the plugin into a custom app for one workflow.

### Target Design

Use **Capability Registry + Progressive Disclosure Strategy**.

Capability contracts live in core. Adapters or future modules implement them. Tool registry discloses groups based on task need, model capability, user setting, and risk.

### Files

- Modify: `src/core/capabilities/registry.ts`
- Modify: `src/core/capabilities/skills.ts`
- Modify: `src/core/capabilities/scratchpad.ts`
- Modify: `src/core/capabilities/file-artifacts.ts`
- Modify: `src/core/capabilities/pdf.ts`
- Modify: `src/core/tools/tool-registry.ts`
- Modify: `src/sidepanel/components/settings-center.ts`
- Test: `tests/unit/core/capabilities.test.ts`
- Test: `tests/unit/core/tool-registry.test.ts`

### Interfaces

```ts
export type CapabilityGroup =
  | "page"
  | "browser"
  | "files"
  | "pdf"
  | "scratchpad"
  | "skills"
  | "schedules";

export interface CapabilityDescriptor {
  group: CapabilityGroup;
  enabled: boolean;
  defaultDisclosure: "always" | "on_demand" | "disabled";
  risk: "low" | "medium" | "high";
  tools: string[];
}
```

### Implementation Plan

- [ ] Keep optional capability contracts pure and disabled by default where implementation is incomplete.
- [ ] Add capability settings UI that toggles feature groups without exposing unfinished actions as active tools.
- [ ] Update tool disclosure to include page/browser tools by default and disclose heavier groups only on demand.
- [ ] Add tests that verify disabled capability groups do not enter model tool schemas.

### Acceptance Criteria

- Core can describe available capabilities without loading UI or Chrome adapters.
- Model tool schemas stay compact for simple browser actions.
- Enabling a future capability has one registry path and one UI settings path.

---

## 12. Release, Build, And Verification Discipline

### Current Problems

- Extension projects can pass unit tests while generated extension output or manifest versions drift.
- UI regressions need both code tests and CSS anti-pattern scans.
- Version bumps must be consistent across source and generated artifacts when behavior changes.

### Target Design

Use **Release Checklist + Build Artifact Consistency Tests**.

Every code task ends with targeted tests, typecheck, build, anti-pattern scan, version consistency, and a short human-readable summary.

### Files

- Modify: `tests/unit/build/manifest.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `public/manifest.json`
- Generated by build: `naturalclick-extension/manifest.json`
- Generated by build: `naturalclick-extension/sidepanel.js`
- Generated by build: `naturalclick-extension/sidepanel.css`

### Verification Commands

```bash
npm run typecheck
npx vitest run tests/unit/sidepanel/render.test.ts tests/unit/sidepanel/state.test.ts tests/unit/build/manifest.test.ts
npm run test:unit
npm run build
rg -n "alert\\(|confirm\\(|prompt\\(|window\\.alert|window\\.confirm|window\\.prompt|<select\\b|outline\\s*:\\s*none|outline-none|transition\\s*:\\s*all" src/sidepanel public/sidepanel.css naturalclick-extension/sidepanel.css tests/unit/sidepanel
rg -n '"version": "0\\.1\\.[0-9]+"' package.json package-lock.json public/manifest.json naturalclick-extension/manifest.json
```

### Implementation Plan

- [ ] Keep manifest tests strict about version consistency.
- [ ] Run targeted tests near the changed context before broad tests.
- [ ] Run full unit tests and build before handing off code changes.
- [ ] Run UI anti-pattern scans after side-panel CSS or rendering changes.
- [ ] Bump package and manifest versions for behavior-changing code changes.
- [ ] Do not bump version for documentation-only planning changes unless explicitly requested for docs.

### Acceptance Criteria

- Source version and generated extension manifest version match after builds.
- Side-panel CSS and tests pass anti-pattern scan.
- Final implementation summaries list what was changed, what was verified, and any verification that could not run.

---

## 13. Recommended Execution Order

The contexts are coupled, but the safest order is:

1. Protocol, serialization, and architecture boundary tests.
2. Model configuration persistence and redaction.
3. Session lifecycle, rehydrate, new session, and stop tombstones.
4. Observation and interactive index.
5. Overlay and vision hygiene.
6. Fast paths, command binding, and tool loop.
7. Action adapters and settle behavior.
8. Sidepanel workbench refactor.
9. Runtime health and fixture guardrails.
10. Capability registry polishing.
11. Release/build/version hardening.

This order fixes data loss and cancellation before making the UI more ambitious, then fixes recognition and speed before expanding capabilities.

## 14. Self-Review

- Spec coverage: This document covers UI, model config, observation, overlay, execution, actions, session lifecycle, health/evaluation, protocol, capability registry, and release discipline.
- Placeholder scan: No unfinished-work markers are present.
- Type consistency: Shared names such as `WorkbenchViewModel`, `ModelRuntimeConfig`, `PageAtlas`, `SemanticCommand`, `BrowserPrimitive`, `StopTombstone`, and `RuntimeHealthIssue` are defined before being referenced by acceptance criteria.
- Scope check: This is intentionally a full blueprint. Individual code implementation should be split by the recommended execution order so each context remains reviewable.
