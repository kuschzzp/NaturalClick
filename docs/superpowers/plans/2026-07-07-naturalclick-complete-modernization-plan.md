# NaturalClick Complete Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn NaturalClick into a universal browser-operation Agent with a Pie-inspired workbench, reliable model configuration, fast page recognition and action execution, durable session lifecycle, and observable performance.

**Architecture:** Preserve the current TypeScript Chrome MV3 extension and its hexagonal shape: core modules own domain decisions, adapters own Chrome/content/DOM/storage/model/CDP details, and the side panel renders from view models. Apply bounded contexts, ports and adapters, command pattern, strategy pattern, repository pattern, explicit state machines, presenter/view-model separation, and an anti-corruption layer for Pie-inspired ideas.

**Tech Stack:** TypeScript, Chrome Manifest V3, Vite, Vitest + jsdom, DOM-rendered side panel, Chrome storage, OpenAI-compatible model APIs, existing NaturalClick core/adapters, optional Chrome DevTools Protocol input adapter.

## Global Constraints

- NaturalClick must remain a general browser Agent; do not add CRM-specific selectors, menu names, routes, screenshots, or one-off recovery rules.
- Do not migrate to React only to mimic Pie. Keep the current DOM renderer unless a separate migration plan is approved.
- Keep execution independent from visible debug markers. Hidden handles and page atlas data are execution inputs; overlays are debug visualization only.
- Vision screenshots must be captured after visible overlays are cleared.
- Simple URL navigation, exact visible target activation, and clearly bound form actions must bypass planner model calls when unambiguous and low risk.
- Stop must abort model streaming, runtime loops, action settling, tool execution, CDP sessions, and queued continuation work.
- Side panel refresh, side panel close/open, browser focus switches, and service worker restart must not silently lose configuration or active session state.
- API keys must not appear in logs, traces, downloaded artifacts, prompts, DOM snapshots, screenshots, or unit fixtures.
- Every meaningful task transition must be representable as an `AgentEvent`.
- Every new UI control must have an accessible label, keyboard reachability, visible focus state, and must fit at 360px side-panel width.
- Any implementation that changes extension behavior must bump `package.json`, `package-lock.json`, `public/manifest.json`, and generated `naturalclick-extension/manifest.json`.
- Existing uncommitted user changes must not be reverted.

---

## Source References

- NaturalClick current branch: `codex/agent-core-redesign`.
- NaturalClick version at plan time: `0.1.77`.
- NaturalClick docs already present:
  - `docs/superpowers/specs/2026-07-07-universal-agent-browser-upgrade.md`
  - `docs/superpowers/plans/2026-07-07-naturalclick-universal-agent-browser-upgrade.md`
  - `docs/superpowers/plans/2026-07-07-naturalclick-pie-workbench-engine-refactor.md`
- Pie reference repository: `WiseriaAI/pie-ai-agent` at `ff10ac7`.
- Pie ideas to adapt:
  - Compact side-panel workbench with top actions, drawer, bottom composer, model picker, settings center.
  - Provider/model configuration as a first-class center instead of loose inputs.
  - Page Atlas and target tools for progressive page reading.
  - Tool grouping and progressive disclosure.
  - CDP mouse/keyboard support for difficult editors and trusted input paths.
  - Abort/resume, session recovery, and cross-layer tests as core engineering practices.
- Pie ideas not to copy directly:
  - React component structure.
  - Local daemon/native host as a required runtime dependency.
  - Pie-specific naming such as `data-pie-idx`.
  - Provider-specific UX that would weaken NaturalClick's OpenAI-compatible default path.

## Design Pattern Commitments

### Hexagonal Architecture

Core files under `src/core/**` must not call Chrome APIs, touch DOM, or know side-panel CSS. They consume ports and return serializable domain results.

Adapters under `src/adapters/**`, `src/background/**`, and `src/content/**` implement those ports. If a new feature needs Chrome storage, DOM probing, CDP, or runtime messaging, define the core interface first and bind it in the adapter.

### Bounded Contexts

The system is split into these contexts:

- `Model Config`: providers, instances, active model roles, validation, detection, persistence.
- `Observation`: page identity, page atlas, interactive index, hidden handles, evidence.
- `Execution`: semantic commands, binding, fast paths, tool loop, primitive execution.
- `Session Lifecycle`: active session, new session, stop, resume, recovery, event reduction.
- `Sidepanel Workbench`: renderable UI state, composer, transcript, settings, drawer, schedules.
- `Overlay And Vision Hygiene`: debug overlays, highlight, screenshot cleanliness.
- `Runtime Health`: metrics, performance guardrails, user-readable diagnostics.

### Command Pattern

User intent becomes a `SemanticCommand`. Binding maps it to a `BrowserPrimitive`. Adapters execute primitives. This keeps model output, DOM lookup, and browser execution separated.

### Strategy Pattern

Observation mode, fast path selection, target binding, action executor, model role routing, recovery policy, and tool disclosure are strategies. A strategy must be replaceable without rewriting the runtime loop.

### Repository Pattern

Model configs, sessions, events, settings, atlas cache, and detected models are read/written through narrow stores. Side panel and runtime code do not call `chrome.storage` directly except inside adapter files.

### State Machine

Session and task states are explicit. Allowed states include `idle`, `running`, `stopping`, `stopped`, `paused`, `awaiting_confirmation`, `completed`, `failed`, and `blocked`. Stop and recovery behavior must be derived from transitions, not scattered boolean checks.

### Presenter / ViewModel

`src/sidepanel/view-model.ts` converts raw state and events into render props. `src/sidepanel/render.ts` composes components. Component helpers render DOM only and should not inspect raw `AgentEvent` arrays.

### Anti-Corruption Layer

Pie concepts are translated into NaturalClick names and interfaces. We can borrow the workbench layout, Page Atlas ideas, and tool patterns, but no Pie file shape should leak into core names or storage keys.

---

## Target File Ownership Map

### Sidepanel Workbench

- Modify: `src/sidepanel/render.ts`
  - Responsibility: page-level composition only.
  - Target: call topbar, transcript, composer, drawer, settings, and schedule render helpers.
- Modify: `src/sidepanel/view-model.ts`
  - Responsibility: pure projections from `SidepanelState` + events to render props.
- Modify: `src/sidepanel/state.ts`
  - Responsibility: typed side-panel state, persistence decoding, local view-state transitions.
- Create: `src/sidepanel/components/topbar.ts`
  - Responsibility: title, status, history, new session, schedule, theme, settings.
- Create: `src/sidepanel/components/composer.ts`
  - Responsibility: input, tools button, model picker button, context indicator, send/stop.
- Create: `src/sidepanel/components/transcript.ts`
  - Responsibility: chat messages, run report, timeline, model stream, pending confirmations.
- Create: `src/sidepanel/components/settings-center.ts`
  - Responsibility: settings tabs, model config center, skills, search, general settings.
- Create: `src/sidepanel/components/session-drawer.ts`
  - Responsibility: history drawer, active session card, session actions.
- Modify: `public/sidepanel.css`
  - Responsibility: design tokens, workbench layout, responsive constraints, focus states.
- Test: `tests/unit/sidepanel/render.test.ts`
- Test: `tests/unit/sidepanel/state.test.ts`
- Test: `tests/unit/sidepanel/view-model.test.ts`

### Model Config

- Modify: `src/core/model/model-instance.ts`
  - Responsibility: value objects for providers, instances, selections, model capability flags.
- Modify: `src/core/model/model-registry.ts`
  - Responsibility: built-in provider defaults and capability hints.
- Modify: `src/core/model/model-config-service.ts`
  - Responsibility: create/update/delete/test/select model instances, sanitize runtime config.
- Modify: `src/adapters/chrome/model-config-store.ts`
  - Responsibility: storage adapter, migration, masked export, detected model cache.
- Modify: `src/adapters/model/openai-compatible-client.ts`
  - Responsibility: request/stream client that consumes resolved runtime config.
- Modify: `src/sidepanel/settings.ts`
  - Responsibility: form-state conversion and validation messages.
- Test: `tests/unit/core/model-config-service.test.ts`
- Test: `tests/unit/adapters/model-config-store.test.ts`
- Test: `tests/unit/sidepanel/settings.test.ts`

### Observation And Recognition

- Modify: `src/core/observation/page-atlas.ts`
  - Responsibility: compact structural page model and atlas rendering.
- Modify: `src/core/observation/interactive-index.ts`
  - Responsibility: prioritized interactives independent from debug labels.
- Modify: `src/adapters/content/dom-observer.ts`
  - Responsibility: DOM scan, roles, labels, visibility, forms, atlas, hidden handles.
- Modify: `src/adapters/content/page-node-index.ts`
  - Responsibility: stable handle assignment and record retrieval.
- Modify: `src/core/context/page-context-assembler.ts`
  - Responsibility: assemble compact planner context and elide stale observations.
- Test: `tests/unit/core/page-atlas.test.ts`
- Test: `tests/unit/core/interactive-index.test.ts`
- Test: `tests/unit/adapters/dom-observer.test.ts`
- Test: `tests/unit/adapters/page-node-index.test.ts`
- Test: `tests/unit/core/page-atlas-fixtures.test.ts`

### Execution And Tools

- Modify: `src/core/runtime/fast-paths.ts`
  - Responsibility: deterministic no-model routes.
- Modify: `src/core/runtime/agent-runtime.ts`
  - Responsibility: high-level step orchestration and event emission.
- Modify: `src/core/runtime/tool-loop.ts`
  - Responsibility: bounded tool-call runtime and abort checks.
- Modify: `src/core/commands/binder.ts`
  - Responsibility: bind semantic commands to stable handles or primitive targets.
- Modify: `src/core/tools/tool-registry.ts`
  - Responsibility: tool group disclosure and capability gates.
- Modify: `src/core/tools/page-tools.ts`
  - Responsibility: read page, find target, read target, read structure.
- Modify: `src/core/tools/browser-tools.ts`
  - Responsibility: click, hover, type, select, scroll, wait, done, fail.
- Test: `tests/unit/core/agent-speed-paths.test.ts`
- Test: `tests/unit/core/agent-runtime.test.ts`
- Test: `tests/unit/core/tool-loop.test.ts`
- Test: `tests/unit/core/commands-binder.test.ts`
- Test: `tests/unit/core/tool-registry.test.ts`

### Action Adapters

- Modify: `src/adapters/content/primitive-executor.ts`
  - Responsibility: DOM primitive execution, type/select/click/scroll, editor hints.
- Modify: `src/adapters/content/action-settle.ts`
  - Responsibility: navigation/mutation/paint quiet waits with abort support.
- Modify: `src/adapters/chrome/cdp-session.ts`
  - Responsibility: lazy attach/detach, owner token, failure cleanup.
- Modify: `src/adapters/chrome/cdp-input.ts`
  - Responsibility: trusted mouse/keyboard event dispatch.
- Modify: `src/background/index.ts`
  - Responsibility: bind adapters and own per-run abort controllers.
- Test: `tests/unit/adapters/primitive-executor.test.ts`
- Test: `tests/unit/adapters/action-settle.test.ts`
- Test: `tests/unit/adapters/cdp-session.test.ts`
- Test: `tests/unit/adapters/cdp-input.test.ts`

### Session Lifecycle

- Modify: `src/core/session/session-state-machine.ts`
  - Responsibility: legal transitions and terminal-state rules.
- Modify: `src/core/session/session-store.ts`
  - Responsibility: store interface and serialization.
- Modify: `src/adapters/chrome/chrome-session-memory.ts`
  - Responsibility: active session persistence, fresh session marker, rehydrate behavior.
- Modify: `src/core/runtime/execution-controller.ts`
  - Responsibility: stop propagation, tombstone, resume gate.
- Modify: `src/sidepanel/runtime-subscription.ts`
  - Responsibility: side-panel rehydrate and real-time event subscription.
- Modify: `src/background/index.ts`
  - Responsibility: reject stale continuations after stop or new session.
- Test: `tests/unit/core/session-state-machine.test.ts`
- Test: `tests/unit/core/execution-controller.test.ts`
- Test: `tests/unit/adapters/chrome-session-memory.test.ts`
- Test: `tests/unit/sidepanel/state.test.ts`

### Overlay And Vision Hygiene

- Modify: `src/core/observation/debug-overlay-model.ts`
  - Responsibility: project debug-only overlay targets from page/evidence state.
- Modify: `src/adapters/content/overlay-controller.ts`
  - Responsibility: draw/remove debug overlays and highlight current target.
- Modify: `src/shared/overlay-targets.ts`
  - Responsibility: map page records to overlay payloads without execution labels.
- Modify: `src/core/vision/vision.ts`
  - Responsibility: require clean screenshot capture.
- Test: `tests/unit/adapters/overlay-controller.test.ts`
- Test: `tests/unit/shared/overlay-targets.test.ts`
- Test: `tests/unit/core/vision.test.ts`

### Runtime Health And Evaluation

- Modify: `src/core/events/runtime-health.ts`
  - Responsibility: derive slow observation/model/action/stop/recovery warnings.
- Modify: `src/sidepanel/runtime-issue.ts`
  - Responsibility: user-readable issue formatting.
- Modify: `tests/unit/core/performance-guardrails.test.ts`
  - Responsibility: fast-path and observation-budget regressions.
- Create: `tests/fixtures/pages/sidebar-menu.html`
  - Responsibility: generic menu expansion fixture.
- Create: `tests/fixtures/pages/settings-form.html`
  - Responsibility: generic config form and persistence fixture.
- Create: `tests/fixtures/pages/rich-editor.html`
  - Responsibility: editor typing behavior.
- Test: `tests/unit/core/performance-guardrails.test.ts`
- Test: `tests/unit/sidepanel/runtime-issue.test.ts`

---

## Implementation Tasks

### Task 1: Lock Architecture Boundaries And Import Direction

**Files:**
- Modify: `src/core/architecture/boundaries.ts`
- Modify: `src/core/architecture/serialization.ts`
- Modify: `src/shared/protocol.ts`
- Test: `tests/unit/core/architecture-boundaries.test.ts`

**Interfaces:**
- Consumes: existing request/response unions from `src/shared/protocol.ts`.
- Produces: a documented boundary rule set for core-to-adapter communication.
- Produces: `RuntimeAbortReason`, `SerializableRecord`, `isSerializableRecord()`, `assertNever()`.

- [ ] **Step 1: Write boundary tests**

Add expectations that `src/core/**` does not import `chrome`, `document`, `window`, `src/sidepanel`, or `src/adapters`.

Command:

```bash
npx vitest run tests/unit/core/architecture-boundaries.test.ts
```

Expected result before implementation: fail if a forbidden import is present or if the helper does not export required names.

- [ ] **Step 2: Normalize boundary helper exports**

Ensure `src/core/architecture/serialization.ts` exports:

```ts
export type SerializablePrimitive = string | number | boolean | null;
export type SerializableValue = SerializablePrimitive | SerializableValue[] | { [key: string]: SerializableValue };
export type SerializableRecord = { [key: string]: SerializableValue };
export function isSerializableRecord(value: unknown): value is SerializableRecord;
export function assertNever(value: never): never;
```

Ensure `src/core/architecture/boundaries.ts` exports:

```ts
export type RuntimeAbortReason =
  | "user_requested"
  | "new_session_requested"
  | "session_detached"
  | "background_recovered_without_controller"
  | "execution_budget_exceeded"
  | "tool_aborted"
  | "model_stream_aborted";
```

- [ ] **Step 3: Align protocol request unions**

Keep `src/shared/protocol.ts` as the only cross-context request/response boundary. Add comments that say protocol values must be serializable and must not carry closures, DOM nodes, `AbortSignal`, or raw API keys in diagnostic payloads.

- [ ] **Step 4: Verify**

Run:

```bash
npm run typecheck
npx vitest run tests/unit/core/architecture-boundaries.test.ts
```

Expected result: both pass.

### Task 2: Split Sidepanel Rendering Into ViewModel And Components

**Files:**
- Modify: `src/sidepanel/render.ts`
- Modify: `src/sidepanel/view-model.ts`
- Modify: `src/sidepanel/components/workbench.ts`
- Create: `src/sidepanel/components/topbar.ts`
- Create: `src/sidepanel/components/composer.ts`
- Create: `src/sidepanel/components/transcript.ts`
- Create: `src/sidepanel/components/settings-center.ts`
- Create: `src/sidepanel/components/session-drawer.ts`
- Modify: `tests/unit/sidepanel/render.test.ts`
- Modify: `tests/unit/sidepanel/view-model.test.ts`

**Interfaces:**
- Consumes: `SidepanelState`, `SidepanelHandlers`, translator from `src/sidepanel/i18n.ts`.
- Produces:

```ts
export interface WorkbenchShellView {
  title: string;
  statusLabel: string;
  statusTone: "idle" | "running" | "completed" | "warning" | "error" | "stopped";
  activeView: "chat" | "history" | "history-detail" | "settings" | "schedules";
  canSubmit: boolean;
  canStop: boolean;
  modelLabel: string;
  contextLabel: string;
}
```

- [ ] **Step 1: Add failing tests for component boundaries**

In `tests/unit/sidepanel/render.test.ts`, assert that the rendered DOM contains:

- `.nc-app-header`
- `.nc-transcript`
- `.nc-composer`
- `.nc-settings-center` when `view === "settings"`
- `.nc-session-drawer` when `view === "history"`

Expected failure: at least one selector is absent or still only embedded in `render.ts`.

- [ ] **Step 2: Move pure presentation decisions to `view-model.ts`**

Move status labels, title selection, model label, context label, empty-state visibility, and run-report tone into pure selectors. `render.ts` should call selectors and pass results to components.

- [ ] **Step 3: Extract topbar**

`topbar.ts` renders history, new session, title, status, theme, schedule, and settings controls. It receives labels and handler callbacks only. It must not import `AgentEvent`.

- [ ] **Step 4: Extract composer**

`composer.ts` renders input, tools menu button, model picker button, context indicator, and send/stop control. It must use fixed control sizes so text and icons do not resize the layout.

- [ ] **Step 5: Extract transcript**

`transcript.ts` renders empty state, timeline items, run report, model stream, pending confirmation, and runtime issue cards. It receives already-classified timeline props.

- [ ] **Step 6: Extract settings and drawer**

`settings-center.ts` renders tabs and panels. `session-drawer.ts` renders history and detail actions. `render.ts` chooses which surface to mount.

- [ ] **Step 7: Verify**

Run:

```bash
npm run typecheck
npx vitest run tests/unit/sidepanel/render.test.ts tests/unit/sidepanel/view-model.test.ts
```

Expected result: pass, and `render.ts` is a composition root rather than the owner of every UI branch.

### Task 3: Rebuild The Workbench UI Around Pie-Like Information Architecture

**Files:**
- Modify: `src/sidepanel/render.ts`
- Modify: `src/sidepanel/components/topbar.ts`
- Modify: `src/sidepanel/components/composer.ts`
- Modify: `src/sidepanel/components/transcript.ts`
- Modify: `src/sidepanel/components/settings-center.ts`
- Modify: `src/sidepanel/components/session-drawer.ts`
- Modify: `public/sidepanel.css`
- Modify: `src/sidepanel/i18n.ts`
- Test: `tests/unit/sidepanel/render.test.ts`

**Interfaces:**
- Produces UI regions:
  - `header[role="banner"]` or equivalent `.nc-app-header`.
  - `main.nc-workbench-main`.
  - `section.nc-transcript`.
  - `form.nc-composer`.
  - `aside.nc-session-drawer` when history is open.

- [ ] **Step 1: Write UI structure assertions**

Add tests that the chat view renders topbar, scrollable transcript, bottom composer, and no nested cards inside repeated cards.

- [ ] **Step 2: Apply design tokens**

Define tokens in `public/sidepanel.css` for:

- background canvas
- surface
- elevated surface
- line
- foreground primary/secondary/muted
- accent
- success/warning/error/stopped tones
- focus ring

Avoid a one-note palette. The side panel should read as a restrained workbench, not a purple/blue gradient dashboard.

- [ ] **Step 3: Build compact header**

Topbar must fit at 360px width and keep actions visible. Icons use existing SVG helpers unless a later icon-library migration is approved.

- [ ] **Step 4: Build bottom composer**

Composer must support:

- text input
- tools popover
- model picker popover
- context indicator
- send button
- stop button while running

No explanatory in-app copy about shortcuts or feature descriptions should be added.

- [ ] **Step 5: Build transcript states**

Transcript must render:

- idle empty state
- running model stream
- successful completion
- failed/blocked warning
- stopped state
- pending confirmation

- [ ] **Step 6: Verify responsive layout**

Run:

```bash
npm run build
npx vitest run tests/unit/sidepanel/render.test.ts
```

Then inspect generated `naturalclick-extension/sidepanel.html` at 360px and 420px side-panel widths with the built-in browser verification workflow used for UI tasks.

Expected result: no clipped icon buttons, no button text overflow, no overlapping settings/composer content.

### Task 4: Convert Model Settings Into A Real Config Center

**Files:**
- Modify: `src/core/model/model-instance.ts`
- Modify: `src/core/model/model-registry.ts`
- Modify: `src/core/model/model-config-service.ts`
- Modify: `src/adapters/chrome/model-config-store.ts`
- Modify: `src/sidepanel/settings.ts`
- Modify: `src/sidepanel/components/settings-center.ts`
- Modify: `src/sidepanel/i18n.ts`
- Test: `tests/unit/core/model-config-service.test.ts`
- Test: `tests/unit/adapters/model-config-store.test.ts`
- Test: `tests/unit/sidepanel/settings.test.ts`

**Interfaces:**
- Produces:

```ts
export interface ProviderRef {
  id: string;
  label: string;
  kind: "openai-compatible" | "managed" | "custom";
  defaultBaseUrl?: string;
}

export interface ModelInstance {
  id: string;
  provider: ProviderRef;
  name: string;
  baseUrl: string;
  apiKeyRef?: string;
  detectedModels: string[];
  createdAt: number;
  updatedAt: number;
}

export interface ModelSelection {
  plannerInstanceId: string;
  plannerModel: string;
  visionInstanceId?: string;
  visionModel?: string;
}
```

- [ ] **Step 1: Add tests for create/update/select/delete**

Tests must cover:

- one OpenAI-compatible instance
- missing API key validation
- detected model cache
- active planner selection
- active vision selection
- deletion cannot leave active selection pointing at a missing instance

- [ ] **Step 2: Harden storage adapter**

`model-config-store.ts` owns persistence and migration. Stored records include version, instances, active selection, and detected-model cache. Exported diagnostic state must mask API key values.

- [ ] **Step 3: Make service pure**

`model-config-service.ts` receives the store and exposes use cases. It should not import side-panel files or Chrome APIs.

- [ ] **Step 4: Render config center**

Settings `configs` tab must show:

- list of saved configs
- active/incomplete status
- base URL
- masked key status
- planner/vision chips
- new config wizard
- test connection action
- model detection action

- [ ] **Step 5: Verify persistence**

Run:

```bash
npm run typecheck
npx vitest run tests/unit/core/model-config-service.test.ts tests/unit/adapters/model-config-store.test.ts tests/unit/sidepanel/settings.test.ts
```

Expected result: settings survive reload through the store tests, and API keys remain masked in visible diagnostics.

### Task 5: Fix Settings Persistence For General And Marker Options

**Files:**
- Modify: `src/sidepanel/state.ts`
- Modify: `src/sidepanel/main.ts`
- Modify: `src/adapters/chrome/chrome-session-memory.ts`
- Modify: `src/shared/protocol.ts`
- Test: `tests/unit/sidepanel/state.test.ts`
- Test: `tests/unit/adapters/chrome-session-memory.test.ts`

**Interfaces:**
- Consumes: `GENERAL_SETTINGS_STORAGE_VERSION`.
- Produces: a single persisted general settings record for overlay mode, safety mode, theme mode, and future UI-only preferences.

- [ ] **Step 1: Add regression test for marker config persistence**

Test sequence:

1. Save overlay mode `Off`.
2. Serialize settings.
3. Rehydrate settings.
4. Assert overlay mode remains `Off`.

- [ ] **Step 2: Centralize general settings writes**

`main.ts` should write general settings through one function. Do not scatter `localStorage` and `chrome.storage` writes for the same preference.

- [ ] **Step 3: Version migration**

If stored version is older than `GENERAL_SETTINGS_STORAGE_VERSION`, keep safe values and default any previously invasive marker mode to `Off`.

- [ ] **Step 4: Verify**

Run:

```bash
npx vitest run tests/unit/sidepanel/state.test.ts tests/unit/adapters/chrome-session-memory.test.ts
```

Expected result: marker configuration no longer resets on side-panel refresh.

### Task 6: Rework Observation Around Hidden Handles And Stable Semantics

**Files:**
- Modify: `src/adapters/content/dom-observer.ts`
- Modify: `src/adapters/content/page-node-index.ts`
- Modify: `src/core/observation/page-model.ts`
- Modify: `src/core/observation/interactive-index.ts`
- Modify: `src/core/observation/page-atlas.ts`
- Test: `tests/unit/adapters/dom-observer.test.ts`
- Test: `tests/unit/adapters/page-node-index.test.ts`
- Test: `tests/unit/core/interactive-index.test.ts`
- Test: `tests/unit/core/page-atlas.test.ts`

**Interfaces:**
- Produces:

```ts
export interface ControlCandidate {
  semanticId: string;
  handle?: string;
  role: string;
  label: string;
  accessibleName: string;
  visibility: "visible" | "hidden" | "offscreen";
  confidence: number;
  expandedState?: "expanded" | "collapsed" | "unknown";
}
```

- [ ] **Step 1: Add generic fixtures**

Use generic fixture pages, not CRM labels:

- sidebar menu with collapsed/expanded sections
- nested navigation
- duplicated text buttons
- icon-only button with `aria-label`
- iframe form
- shadow-root button

- [ ] **Step 2: Improve role detection**

`roleFor()` must prefer explicit ARIA roles, native element roles, then safe framework heuristics. Framework heuristics can mention generic class patterns such as `menu-item`, `submenu`, `tabs`, and `option`; they cannot mention a user's business domain.

- [ ] **Step 3: Improve label extraction**

Use this order:

1. `aria-label`
2. `aria-labelledby`
3. associated `<label>`
4. wrapping `<label>`
5. `alt`
6. `placeholder`
7. `title`
8. visible text
9. `name`

- [ ] **Step 4: Separate execution handle from visible marker**

`page-node-index.ts` owns hidden handles such as `data-naturalclick-handle`. Overlay numbers and labels must not be required for `EXECUTE_PRIMITIVE`.

- [ ] **Step 5: Render compact interactive index**

`interactive-index.ts` sorts by typeable controls, buttons/menuitems/tabs, links, then other controls. Include handle and role in context; do not include verbose debug marker labels.

- [ ] **Step 6: Verify**

Run:

```bash
npx vitest run tests/unit/adapters/dom-observer.test.ts tests/unit/adapters/page-node-index.test.ts tests/unit/core/interactive-index.test.ts tests/unit/core/page-atlas.test.ts
```

Expected result: menus are recognized as `menuitem`, icon-only controls have labels, and hidden handles survive observation without visible overlays.

### Task 7: Expand Fast Paths Without Sacrificing Safety

**Files:**
- Modify: `src/core/runtime/fast-paths.ts`
- Modify: `src/core/runtime/agent-runtime.ts`
- Modify: `src/core/commands/binder.ts`
- Test: `tests/unit/core/agent-speed-paths.test.ts`
- Test: `tests/unit/core/agent-runtime.test.ts`
- Test: `tests/unit/core/commands-binder.test.ts`
- Test: `tests/unit/core/performance-guardrails.test.ts`

**Interfaces:**
- Produces:

```ts
export type FastPathSource =
  | "explicit_url"
  | "exact_visible_control"
  | "exact_visible_field_fill"
  | "exact_visible_select_option"
  | "single_form_submit";
```

- [ ] **Step 1: Add speed regression tests**

Test that these tasks produce zero planner calls:

- open an explicit URL when current origin differs
- click one exact visible button/menuitem
- fill one exact visible textbox when the user gives a value
- select one exact combobox option when both field and option are unambiguous

- [ ] **Step 2: Preserve ambiguity gates**

Fast path must not trigger when:

- multiple controls have the same normalized label
- target is hidden or disabled
- confidence is below threshold
- task text contains a negative intent such as "不要点击"
- action risk is medium or high

- [ ] **Step 3: Emit explanatory events**

When fast path runs, append `PlanProduced` with `plannerSource: "deterministic_fast_path"` and `fastPathSource`.

- [ ] **Step 4: Verify**

Run:

```bash
npx vitest run tests/unit/core/agent-speed-paths.test.ts tests/unit/core/agent-runtime.test.ts tests/unit/core/performance-guardrails.test.ts
```

Expected result: simple tasks avoid model calls and still produce inspectable runtime events.

### Task 8: Introduce Progressive Tool Disclosure As The Planner Path

**Files:**
- Modify: `src/core/tools/tool.ts`
- Modify: `src/core/tools/tool-registry.ts`
- Modify: `src/core/tools/page-tools.ts`
- Modify: `src/core/tools/browser-tools.ts`
- Modify: `src/core/runtime/tool-loop.ts`
- Modify: `src/core/model/contracts.ts`
- Test: `tests/unit/core/tool-registry.test.ts`
- Test: `tests/unit/core/tool-loop.test.ts`
- Test: `tests/unit/core/model-contracts.test.ts`

**Interfaces:**
- Produces tool groups:

```ts
export type ToolGroup = "core" | "page" | "browser" | "vision" | "files" | "skills" | "schedule";
```

- [ ] **Step 1: Add registry tests**

Tests must assert:

- `core` group is always available
- `vision` tools require a model with vision capability
- `files`, `skills`, and `schedule` are hidden until enabled
- duplicate tool names fail at registry creation

- [ ] **Step 2: Define page tools**

Page tools:

- `read_page`
- `find_target`
- `read_target`
- `read_struct`

Each tool returns a serializable observation and must not expose API keys or raw full DOM by default.

- [ ] **Step 3: Define browser tools**

Browser tools:

- `click`
- `hover`
- `type`
- `select`
- `scroll`
- `wait`
- `done`
- `fail`

Tool descriptions must be short and operational. They should guide the model to read page structure before acting when target confidence is low.

- [ ] **Step 4: Make tool loop bounded**

`tool-loop.ts` must enforce:

- max tool calls per task
- max tool calls per step
- abort checks before and after every tool
- stop on `done` or `fail`
- recovery event on repeated locator failures

- [ ] **Step 5: Verify**

Run:

```bash
npx vitest run tests/unit/core/tool-registry.test.ts tests/unit/core/tool-loop.test.ts tests/unit/core/model-contracts.test.ts
```

Expected result: planner path can use tools progressively while deterministic path remains faster for simple tasks.

### Task 9: Harden Binding Before Action Execution

**Files:**
- Modify: `src/core/commands/binder.ts`
- Modify: `src/core/commands/commands.ts`
- Modify: `src/adapters/content/primitive-executor.ts`
- Test: `tests/unit/core/commands-binder.test.ts`
- Test: `tests/unit/adapters/primitive-executor.test.ts`

**Interfaces:**
- Produces binding result shape:

```ts
export type BindingSource = "explicit_handle" | "semantic_id" | "exact_label" | "accessible_name" | "fallback_fuzzy";
export interface BoundCommand {
  primitive: BrowserPrimitive;
  source: BindingSource;
  confidence: number;
}
```

- [ ] **Step 1: Test binding priority**

Assert priority order:

1. explicit handle
2. semantic ID
3. exact label
4. accessible name
5. fallback fuzzy

- [ ] **Step 2: Test ambiguity reporting**

When two controls match with similar confidence, return `ambiguous_target` and include candidate labels, roles, semantic IDs, and regions.

- [ ] **Step 3: Execute by handle**

`primitive-executor.ts` should execute `targetRef` / handle directly when present. It should not rediscover the page through visible marker text.

- [ ] **Step 4: Verify**

Run:

```bash
npx vitest run tests/unit/core/commands-binder.test.ts tests/unit/adapters/primitive-executor.test.ts
```

Expected result: menu-like controls bind deterministically and ambiguous pages surface a useful recovery request.

### Task 10: Make Action Execution Fast, Abortable, And Observable

**Files:**
- Modify: `src/adapters/content/primitive-executor.ts`
- Modify: `src/adapters/content/action-settle.ts`
- Modify: `src/adapters/chrome/cdp-session.ts`
- Modify: `src/adapters/chrome/cdp-input.ts`
- Modify: `src/background/index.ts`
- Test: `tests/unit/adapters/primitive-executor.test.ts`
- Test: `tests/unit/adapters/action-settle.test.ts`
- Test: `tests/unit/adapters/cdp-session.test.ts`
- Test: `tests/unit/adapters/cdp-input.test.ts`

**Interfaces:**
- Produces:

```ts
export interface ActionSettleResult {
  settled: boolean;
  durationMs: number;
  reason: "mutation_quiet" | "navigation" | "timeout" | "aborted";
}
```

- [ ] **Step 1: Add abort tests**

Abort during:

- DOM click
- typing
- select
- action settle
- CDP attach
- CDP keyboard input

Expected result: no later success event is emitted after abort.

- [ ] **Step 2: Optimize settle waits**

Short actions should use a small quiet-window. Navigation and large DOM mutations may wait longer, but every wait must accept an abort signal.

- [ ] **Step 3: Add timing events**

Emit action timing data into runtime events or health metrics:

- primitive type
- settle reason
- duration
- aborted flag

- [ ] **Step 4: Verify**

Run:

```bash
npx vitest run tests/unit/adapters/primitive-executor.test.ts tests/unit/adapters/action-settle.test.ts tests/unit/adapters/cdp-session.test.ts tests/unit/adapters/cdp-input.test.ts
```

Expected result: action execution is measurable and abort-safe.

### Task 11: Make Stop Complete And Durable

**Files:**
- Modify: `src/core/runtime/execution-controller.ts`
- Modify: `src/core/runtime/agent-runtime.ts`
- Modify: `src/core/runtime/tool-loop.ts`
- Modify: `src/core/session/session-state-machine.ts`
- Modify: `src/background/index.ts`
- Modify: `src/sidepanel/main.ts`
- Test: `tests/unit/core/execution-controller.test.ts`
- Test: `tests/unit/core/session-state-machine.test.ts`
- Test: `tests/unit/core/tool-loop.test.ts`
- Test: `tests/unit/core/agent-runtime.test.ts`

**Interfaces:**
- Consumes: `RuntimeAbortReason`.
- Produces terminal `TaskStopped` event with reason and timestamp.

- [ ] **Step 1: Add stop invariants**

Tests must assert:

- stop writes `TaskStopped`
- later model chunks are ignored
- later tool results are ignored
- later observations are ignored
- resume does not continue a stopped task unless the user explicitly starts a new task

- [ ] **Step 2: Centralize abort controller ownership**

`background/index.ts` owns the active run abort controller. Runtime, model stream, tool loop, action settle, and CDP adapter receive the same abort signal or derived scoped signals.

- [ ] **Step 3: Guard appendEvent**

After stop, only stop-related diagnostics may append. Ordinary `PlanProduced`, `ActionSucceeded`, and model stream events for that task must be dropped.

- [ ] **Step 4: Verify**

Run:

```bash
npx vitest run tests/unit/core/execution-controller.test.ts tests/unit/core/session-state-machine.test.ts tests/unit/core/tool-loop.test.ts tests/unit/core/agent-runtime.test.ts
```

Expected result: clicking stop leaves no active controller and no subsequent execution continues.

### Task 12: Correct New Session, Reopen, And Focus Rehydrate Behavior

**Files:**
- Modify: `src/core/session/session-state-machine.ts`
- Modify: `src/adapters/chrome/chrome-session-memory.ts`
- Modify: `src/sidepanel/runtime-subscription.ts`
- Modify: `src/sidepanel/main.ts`
- Modify: `src/background/index.ts`
- Test: `tests/unit/core/session-state-machine.test.ts`
- Test: `tests/unit/adapters/chrome-session-memory.test.ts`
- Test: `tests/unit/sidepanel/state.test.ts`

**Interfaces:**
- Produces explicit markers:

```ts
export interface ActiveSessionPointer {
  sessionId: string;
  taskId: string;
  mode: "active" | "fresh_empty" | "detached";
  updatedAt: number;
}
```

- [ ] **Step 1: Add regression tests**

Cover:

- new session then close/open side panel shows fresh empty session
- side panel refresh does not restore previous historical session over fresh empty session
- switching to another desktop app and back does not clear conversation state
- service worker restart rehydrates only non-detached active session

- [ ] **Step 2: Store active pointer separately from history**

History is immutable record storage. Active pointer decides what the side panel opens. A fresh session pointer must not be overwritten by the last historical task.

- [ ] **Step 3: Rehydrate from events plus pointer**

`runtime-subscription.ts` loads pointer, then events, then applies reducer. If pointer says `fresh_empty`, render empty chat with same session ID.

- [ ] **Step 4: Verify**

Run:

```bash
npx vitest run tests/unit/adapters/chrome-session-memory.test.ts tests/unit/sidepanel/state.test.ts tests/unit/core/session-state-machine.test.ts
```

Expected result: side panel focus changes and extension panel reopen do not lose the current conversation or resurrect an old one.

### Task 13: Make Overlay Truly Debug-Only

**Files:**
- Modify: `src/core/observation/debug-overlay-model.ts`
- Modify: `src/adapters/content/overlay-controller.ts`
- Modify: `src/shared/overlay-targets.ts`
- Modify: `src/core/vision/vision.ts`
- Modify: `src/sidepanel/main.ts`
- Test: `tests/unit/adapters/overlay-controller.test.ts`
- Test: `tests/unit/shared/overlay-targets.test.ts`
- Test: `tests/unit/core/vision.test.ts`

**Interfaces:**
- Produces overlay modes:

```ts
export type OverlayMode = "Off" | "Focus" | "All Targets" | "Evidence" | "Vision";
```

- [ ] **Step 1: Add no-marker execution test**

Observation and execution must pass when overlay mode is `Off`.

- [ ] **Step 2: Remove verbose labels**

Do not render labels like `button - 客户管理 - 0.88`. Debug labels should be short numeric or state markers. Full semantics remain in logs and atlas, not painted on the page.

- [ ] **Step 3: Clear overlay before vision**

`vision.ts` must request overlay removal or hidden mode before screenshot capture, then restore the user-selected debug overlay if needed.

- [ ] **Step 4: Verify**

Run:

```bash
npx vitest run tests/unit/adapters/overlay-controller.test.ts tests/unit/shared/overlay-targets.test.ts tests/unit/core/vision.test.ts
```

Expected result: markers cannot pollute visual-model recognition, and execution does not depend on them.

### Task 14: Improve Planner Context Assembly And Stale Observation Elision

**Files:**
- Modify: `src/core/context/page-context-assembler.ts`
- Modify: `src/core/context/stale-observation-elision.ts`
- Modify: `src/core/context/budget.ts`
- Modify: `src/core/runtime/agent-runtime.ts`
- Test: `tests/unit/core/model-context.test.ts`
- Test: `tests/unit/core/agent-runtime.test.ts`

**Interfaces:**
- Produces compact planner context:

```ts
export interface PlannerPageContext {
  pageIdentity: { url: string; title: string; origin: string; path: string };
  atlasSummary?: string;
  interactiveSummary?: string;
  focusedTarget?: string;
  recentObservationRequests: string[];
}
```

- [ ] **Step 1: Test context budget**

Given a page with many controls, assembler must include top ranked controls and omit stale full observations. It should preserve active target, nearby labels, validation feedback, and form fields when requested.

- [ ] **Step 2: Prefer atlas and interactive summaries**

Avoid raw DOM or long readable content by default. Use targeted detail only after a `NeedMoreObservation` request.

- [ ] **Step 3: Emit metrics**

Include context size, selected mode, candidate count, and elided stale count in debug events.

- [ ] **Step 4: Verify**

Run:

```bash
npx vitest run tests/unit/core/model-context.test.ts tests/unit/core/agent-runtime.test.ts
```

Expected result: planner calls receive compact, fresh, relevant page context.

### Task 15: Add Runtime Health And Performance Guardrails

**Files:**
- Modify: `src/core/events/runtime-health.ts`
- Modify: `src/sidepanel/runtime-issue.ts`
- Modify: `src/sidepanel/view-model.ts`
- Modify: `tests/unit/core/performance-guardrails.test.ts`
- Test: `tests/unit/core/runtime-health.test.ts`
- Test: `tests/unit/sidepanel/runtime-issue.test.ts`

**Interfaces:**
- Produces health signals:

```ts
export type RuntimeHealthCode =
  | "slow_observation"
  | "slow_model_call"
  | "slow_action"
  | "simple_task_used_model"
  | "overlay_interference"
  | "stop_not_terminal"
  | "repeated_ambiguous_target";
```

- [ ] **Step 1: Add health derivation tests**

From event streams, derive warnings for:

- simple task used planner model
- observation exceeded budget
- action settle exceeded budget
- stopped task continued emitting action/model events
- repeated ambiguous target

- [ ] **Step 2: Surface concise warnings**

`runtime-issue.ts` converts codes to user-readable Chinese and English messages. Messages should name the issue and one next diagnostic action.

- [ ] **Step 3: Add guardrail budgets**

Recommended starting thresholds:

- exact visible click fast path: zero model calls
- exact visible click observation rounds: one
- overlay mode `Off`: no overlay DOM root after sync
- stopped task: no non-stop events after terminal stop

- [ ] **Step 4: Verify**

Run:

```bash
npx vitest run tests/unit/core/runtime-health.test.ts tests/unit/core/performance-guardrails.test.ts tests/unit/sidepanel/runtime-issue.test.ts
```

Expected result: slow or regressed execution produces deterministic warnings in tests.

### Task 16: Build A Generic Browser-Agent Fixture Suite

**Files:**
- Create: `tests/fixtures/pages/sidebar-menu.html`
- Create: `tests/fixtures/pages/settings-form.html`
- Modify: `tests/fixtures/pages/rich-editor.html`
- Modify: `tests/fixtures/pages/iframe-form.html`
- Modify: `tests/fixtures/pages/visual-target.html`
- Create: `tests/unit/core/page-atlas-fixtures.test.ts`
- Modify: `tests/unit/adapters/dom-observer.test.ts`

**Interfaces:**
- Produces reusable fixtures for:
  - menu expansion
  - duplicated visible labels
  - icon-only controls
  - iframes
  - rich editor typing
  - form validation
  - scroll/offscreen controls

- [ ] **Step 1: Keep fixtures generic**

Use neutral labels such as `Customers`, `Reports`, `Settings`, `Create`, `Search`, `Submit`, and `Save`. Do not use the user's CRM-specific page names.

- [ ] **Step 2: Add observation tests per fixture**

For each fixture, assert page atlas targets, interactive records, roles, labels, visibility, and confidence.

- [ ] **Step 3: Add action tests per fixture**

For each fixture, assert the primitive executor can click/type/select/scroll when a stable handle is supplied.

- [ ] **Step 4: Verify**

Run:

```bash
npx vitest run tests/unit/core/page-atlas-fixtures.test.ts tests/unit/adapters/dom-observer.test.ts tests/unit/adapters/primitive-executor.test.ts
```

Expected result: recognition and execution are validated against general web UI patterns.

### Task 17: Refine Logs, Trace Export, And Privacy

**Files:**
- Modify: `src/core/events/events.ts`
- Modify: `src/core/events/reducer.ts`
- Modify: `src/core/events/snapshot.ts`
- Modify: `src/adapters/chrome/chrome-storage-event-store.ts`
- Modify: `src/sidepanel/render.ts`
- Modify: `src/sidepanel/view-model.ts`
- Test: `tests/unit/core/events.test.ts`
- Test: `tests/unit/adapters/chrome-storage-event-store.test.ts`
- Test: `tests/unit/sidepanel/render.test.ts`

**Interfaces:**
- Produces:

```ts
export interface DiagnosticTraceExport {
  version: number;
  sessionId: string;
  taskId: string;
  events: AgentEvent[];
  redactions: Array<{ field: string; reason: "secret" | "large_payload" | "screenshot" }>;
}
```

- [ ] **Step 1: Add redaction tests**

Trace export must redact:

- API key
- authorization headers
- screenshot bytes
- long raw model chunks
- password field values

- [ ] **Step 2: Split user and debug visibility**

User-visible timeline stays concise. Debug trace keeps structured details with redaction.

- [ ] **Step 3: Add trace summary**

Side panel should show:

- model calls
- observation rounds
- tool calls
- fast path source
- stop reason
- slow-step warning

- [ ] **Step 4: Verify**

Run:

```bash
npx vitest run tests/unit/core/events.test.ts tests/unit/adapters/chrome-storage-event-store.test.ts tests/unit/sidepanel/render.test.ts
```

Expected result: downloaded logs are useful and safe to share.

### Task 18: Final Versioning, Build, And Release Validation

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `public/manifest.json`
- Modify: `naturalclick-extension/manifest.json`
- Modify generated assets under `naturalclick-extension/**` through `npm run build`
- Test: `tests/unit/build/manifest.test.ts`

**Interfaces:**
- Produces a version-consistent build artifact.

- [ ] **Step 1: Bump version**

Increment the patch version once for the completed implementation batch. Keep all four version files in sync.

- [ ] **Step 2: Run full validation**

Run:

```bash
npm run typecheck
npm run test:unit
npm run build
```

Expected result: all pass.

- [ ] **Step 3: Scan for UI anti-patterns**

Run:

```bash
rg -n "alert\\(|confirm\\(|prompt\\(|window\\.alert|window\\.confirm|window\\.prompt|<select\\b|outline\\s*:\\s*none|outline-none|transition\\s*:\\s*all" src/sidepanel public/sidepanel.css tests/unit/sidepanel
```

Expected result: no matches unless a deliberate exception is documented in the task that introduced it.

- [ ] **Step 4: Verify version consistency**

Run:

```bash
rg -n '"version": "' package.json package-lock.json public/manifest.json naturalclick-extension/manifest.json
```

Expected result: all visible version values match.

---

## Acceptance Criteria

- Simple exact actions do not call the planner model.
- Element recognition works with overlay mode `Off`.
- Visible debug overlays never render verbose semantic labels on top of the page.
- Model configuration survives side-panel refresh and extension close/open.
- New session stays new after close/open and does not reopen historical chat by accident.
- Browser focus switches do not clear the visible conversation.
- Stop is terminal and no later model/action events continue the stopped task.
- Side panel resembles a compact Pie-style workbench while preserving NaturalClick's DOM renderer and architecture.
- Settings center has clear tabs for configs, skills, search, and general settings.
- Logs are structured, useful, and redacted.
- Full validation passes: `npm run typecheck`, `npm run test:unit`, `npm run build`.

## Self-Review

- 占位检查: this plan contains no incomplete sections or undecided requirements.
- Scope check: the plan is large but intentionally complete; tasks are independent enough for subagent execution and review.
- Architecture check: every major area maps to a bounded context and specific file ownership.
- Generality check: no task relies on CRM-specific labels, selectors, or workflows.
- Safety check: stop, privacy, overlay hygiene, and model-call avoidance are explicit acceptance criteria.
