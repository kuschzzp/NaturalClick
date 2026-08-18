# NaturalClick Pie Workbench And Engine Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework NaturalClick into a polished Pie-inspired browser Agent workbench while strengthening the general-purpose observation, action, session, configuration, and cancellation engine underneath.

**Architecture:** Keep NaturalClick's hexagonal TypeScript architecture: core owns Agent policy, observation, execution, model routing, events, and session state; Chrome APIs, content scripts, side panel DOM rendering, storage, model clients, and CDP remain adapters. Apply bounded contexts, command pattern, strategy pattern, repository pattern, state machines, and anti-corruption layers so Pie-inspired UI and engine ideas are adapted into NaturalClick without copying Pie's React structure.

**Tech Stack:** TypeScript, Chrome MV3, Vite, Vitest + jsdom, DOM-rendered side panel, Chrome storage/local side panel storage, OpenAI-compatible model APIs, optional CDP input adapter, existing NaturalClick core modules.

## Global Constraints

- This is a general browser-operation Agent plan; do not add CRM-specific text, selectors, menu names, or workflows.
- Do not migrate the extension to React just to mimic Pie; preserve current TypeScript DOM renderer unless a separate migration is explicitly approved.
- Do not make visible overlay markers part of Agent sensing or execution.
- Vision screenshots must be captured with visible debug overlays cleared.
- Simple deterministic actions must bypass the planner model when target, intent, and risk are unambiguous.
- Stop must cancel model streaming, pending tool execution, settle waits, runtime loops, and any queued follow-up work.
- Settings persistence must survive side panel refresh, side panel close/open, browser focus switches, and service worker restart.
- API keys must not appear in runtime logs, downloaded traces, DOM snapshots, screenshots, or test fixtures.
- Every meaningful runtime transition writes or derives from `AgentEvent`.
- All UI controls must be keyboard reachable, have accessible labels, and avoid text/icon clipping at 360px side panel width.
- Every code task must finish with `npm run typecheck`, targeted unit tests, and either `npm run test:unit` or a documented narrower reason.
- Any code release must bump `package.json`, `package-lock.json`, `public/manifest.json`, and generated `naturalclick-extension/manifest.json`.

---

## Baseline

NaturalClick already has useful pieces that should be preserved and tightened instead of rewritten blindly:

- Runtime: `src/core/runtime/agent-runtime.ts`, `src/core/runtime/fast-paths.ts`, `src/core/runtime/execution-controller.ts`, `src/core/runtime/tool-loop.ts`.
- Observation: `src/core/observation/page-atlas.ts`, `src/core/observation/interactive-index.ts`, `src/adapters/content/dom-observer.ts`, `src/adapters/content/page-node-index.ts`.
- Tools: `src/core/tools/tool.ts`, `src/core/tools/tool-registry.ts`, `src/core/tools/page-tools.ts`, `src/core/tools/browser-tools.ts`.
- Side panel: `src/sidepanel/render.ts`, `src/sidepanel/main.ts`, `src/sidepanel/state.ts`, `src/sidepanel/view-model.ts`, `src/sidepanel/settings.ts`, `src/sidepanel/components/workbench.ts`, `public/sidepanel.css`.
- Storage/session: `src/adapters/chrome/chrome-session-memory.ts`, `src/adapters/chrome/model-config-store.ts`, `src/core/session/session-state-machine.ts`, `src/core/session/session-store.ts`.
- Tests: existing coverage under `tests/unit/core`, `tests/unit/adapters`, `tests/unit/sidepanel`, `tests/unit/shared`, and `tests/unit/build`.

Pie-inspired ideas to adapt:

- Compact top bar with session drawer, new session, status, theme/schedule/settings actions.
- Bottom composer with tools menu, model picker, context indicator, send/stop control.
- Settings center with clear tabs for model configs, skills, search, and general settings.
- Drawer-based session history instead of a full-page context switch.
- Tool-call loop and action engine that can do simple operations quickly without full planner turns.
- Dense execution transcript that makes decisions, tool calls, and errors inspectable without overwhelming the main chat.

## Design Pattern Map

- **Bounded Context:** UI Workbench, Model Config, Observation, Execution, Session Lifecycle, Overlay Debugging, Capabilities, Evaluation.
- **Hexagonal Architecture:** Core modules export ports and pure logic; adapters implement Chrome, storage, DOM, CDP, model, and side panel details.
- **Command Pattern:** User intent becomes `SemanticCommand`; execution adapters translate commands into browser primitives.
- **Strategy Pattern:** Fast paths, observation modes, model roles, target binding, action executors, and recovery policies are swappable strategies.
- **Repository Pattern:** Settings, sessions, events, detected models, and page atlas caches are persisted through narrow stores.
- **State Machine:** Session/task lifecycle is explicit and durable, including `stopping`, `stopped`, `failed`, `completed`, and `awaiting_confirmation`.
- **Anti-Corruption Layer:** Pie concepts become NaturalClick interfaces and CSS primitives; do not import Pie naming or React component assumptions into the core.
- **Presenter/ViewModel:** `src/sidepanel/view-model.ts` converts runtime state into render props so `render.ts` stays dumb and testable.

## File Ownership Map

### Sidepanel Workbench

- Modify: `src/sidepanel/render.ts` only as a composition root for workbench, settings, drawer, composer, and transcript sections.
- Modify: `src/sidepanel/components/workbench.ts` for reusable DOM render helpers.
- Create: `src/sidepanel/components/composer.ts` for composer, tools menu, context ring, model picker button, and send/stop control.
- Create: `src/sidepanel/components/settings-center.ts` for Pie-like settings tabs and panels.
- Create: `src/sidepanel/components/session-drawer.ts` for drawer, session cards, delete confirmation, and active session controls.
- Modify: `src/sidepanel/view-model.ts` for pure renderable projections.
- Modify: `src/sidepanel/state.ts` for view state types, settings tab, tool menu, model picker, theme mode, and drawer state.
- Modify: `src/sidepanel/main.ts` for event handlers and persistence wiring.
- Modify: `public/sidepanel.css` for tokens, layout, responsive rules, focus states, popovers, and drawer styling.
- Test: `tests/unit/sidepanel/render.test.ts`, `tests/unit/sidepanel/state.test.ts`, `tests/unit/sidepanel/view-model.test.ts`.

### Model Configuration

- Modify: `src/sidepanel/settings.ts` to model provider instances and validation.
- Modify: `src/core/model/model-config-service.ts` to own create/update/delete/select/test use cases.
- Modify: `src/core/model/model-instance.ts` for value objects and capability metadata.
- Modify: `src/adapters/chrome/model-config-store.ts` to persist structured config and detected model cache.
- Modify: `src/adapters/model/openai-compatible-client.ts` to consume resolved runtime config.
- Test: `tests/unit/core/model-config-service.test.ts`, `tests/unit/adapters/model-config-store.test.ts`, `tests/unit/sidepanel/settings.test.ts`.

### Observation And Element Recognition

- Modify: `src/core/observation/page-atlas.ts` to make atlas summaries compact and stable.
- Modify: `src/core/observation/interactive-index.ts` to score action candidates independently from debug marker labels.
- Modify: `src/adapters/content/dom-observer.ts` to collect handles and semantics without visible overlay dependency.
- Modify: `src/adapters/content/page-node-index.ts` to keep hidden handles stable through mutations where possible.
- Modify: `src/core/context/page-context-assembler.ts` to prefer atlas and target slices over raw page dumps.
- Test: `tests/unit/core/page-atlas.test.ts`, `tests/unit/core/interactive-index.test.ts`, `tests/unit/adapters/dom-observer.test.ts`, `tests/unit/adapters/page-node-index.test.ts`, `tests/unit/core/page-atlas-fixtures.test.ts`.

### Execution And Fast Paths

- Modify: `src/core/runtime/fast-paths.ts` to expand deterministic no-model actions safely.
- Modify: `src/core/runtime/agent-runtime.ts` to route fast paths before planner calls and record why.
- Modify: `src/core/runtime/tool-loop.ts` to support bounded multi-call execution with abort checks.
- Modify: `src/core/commands/binder.ts` to bind exact handles before fuzzy labels.
- Modify: `src/adapters/content/primitive-executor.ts` to execute handle-based clicks/type/select/scroll and settle.
- Modify: `src/adapters/content/action-settle.ts` to return timing and mutation signals.
- Test: `tests/unit/core/agent-speed-paths.test.ts`, `tests/unit/core/agent-runtime.test.ts`, `tests/unit/core/tool-loop.test.ts`, `tests/unit/core/commands-binder.test.ts`, `tests/unit/adapters/primitive-executor.test.ts`, `tests/unit/adapters/action-settle.test.ts`.

### Session, Stop, Rehydrate

- Modify: `src/core/session/session-state-machine.ts` to add durable stopping transitions.
- Modify: `src/core/runtime/execution-controller.ts` to propagate abort reasons and stop tombstones.
- Modify: `src/adapters/chrome/chrome-session-memory.ts` to recover active, stopped, and fresh sessions correctly.
- Modify: `src/sidepanel/runtime-subscription.ts` to rehydrate after panel visibility/focus changes.
- Modify: `src/background/index.ts` to cancel active work and avoid continuing after user stop.
- Test: `tests/unit/core/session-state-machine.test.ts`, `tests/unit/core/execution-controller.test.ts`, `tests/unit/adapters/chrome-session-memory.test.ts`, `tests/unit/sidepanel/state.test.ts`.

### Overlay And Vision Hygiene

- Modify: `src/core/observation/debug-overlay-model.ts` to project debug-only targets.
- Modify: `src/adapters/content/overlay-controller.ts` to remove overlay root in `Off` mode and avoid verbose labels.
- Modify: `src/shared/overlay-targets.ts` to keep execution identifiers separate from visual marker copy.
- Modify: `src/core/vision/vision.ts` to require overlay-clear hooks before screenshot capture.
- Test: `tests/unit/adapters/overlay-controller.test.ts`, `tests/unit/shared/overlay-targets.test.ts`, `tests/unit/core/vision.test.ts`.

### Evaluation And Release

- Modify: `src/core/events/runtime-health.ts` for duration, model-call, observation, action, and cancellation metrics.
- Modify: `src/sidepanel/runtime-issue.ts` for actionable warnings.
- Create: `tests/fixtures/pages/sidebar-menu.html` for generic menu expansion and exact-click speed checks.
- Create: `tests/fixtures/pages/settings-form.html` for form filling and persistence checks.
- Modify: `tests/unit/core/performance-guardrails.test.ts` to guard fast exact clicks and observation budgets.
- Modify: `tests/unit/build/manifest.test.ts` for version consistency.

---

## Task 1: Establish Workbench UI Boundaries

**Files:**
- Create: `src/sidepanel/components/composer.ts`
- Create: `src/sidepanel/components/settings-center.ts`
- Create: `src/sidepanel/components/session-drawer.ts`
- Modify: `src/sidepanel/components/workbench.ts`
- Modify: `src/sidepanel/render.ts`
- Test: `tests/unit/sidepanel/render.test.ts`

**Interfaces:**
- Consumes: `SidepanelState`, `SidepanelHandlers`, `createTranslator()`.
- Produces:

```ts
export interface ComposerProps {
  value: string;
  disabled: boolean;
  running: boolean;
  modelLabel: string;
  contextLabel: string;
  toolMenuOpen: boolean;
}

export interface ComposerHandlers {
  onInput(value: string): void;
  onSubmit(value: string): void;
  onStop(): void;
  onToggleTools(): void;
  onOpenModelPicker(): void;
}

export interface SettingsCenterProps {
  activeTab: SettingsTabId;
  dirty: boolean;
  saveStatus: "idle" | "saved" | "error";
}

export type SettingsTabId = "configs" | "skills" | "search" | "general";
```

- [ ] **Step 1: Write failing render tests**

Add assertions to `tests/unit/sidepanel/render.test.ts`:

```ts
it("renders a Pie-style workbench shell with separated composer controls", () => {
  const root = renderSidepanel({
    mode: "conversation",
    view: "chat",
    overlayMode: "Off",
    safetyMode: "experimental_full_auto",
    modelConfigured: true,
    traceOpen: false,
    composerInput: "打开客户管理",
    timeline: []
  });

  expect(root.querySelector(".nc-app-header")).toBeTruthy();
  expect(root.querySelector(".nc-session-title")).toBeTruthy();
  expect(root.querySelector<HTMLButtonElement>('[aria-label="New session"]')).toBeTruthy();
  expect(root.querySelector(".nc-composer")).toBeTruthy();
  expect(root.querySelector(".nc-composer-tools")).toBeTruthy();
  expect(root.querySelector(".nc-model-picker-button")).toBeTruthy();
  expect(root.querySelector(".nc-context-ring")).toBeTruthy();
});
```

- [ ] **Step 2: Verify the new test fails**

Run: `npx vitest run tests/unit/sidepanel/render.test.ts -t "Pie-style workbench shell"`

Expected: FAIL because `.nc-composer-tools` or `.nc-model-picker-button` is not rendered by a dedicated component.

- [ ] **Step 3: Move composer rendering into `components/composer.ts`**

Create the component with a pure DOM API:

```ts
import { button, el } from "../components";

export interface ComposerProps {
  value: string;
  disabled: boolean;
  running: boolean;
  modelLabel: string;
  contextLabel: string;
  toolMenuOpen: boolean;
}

export interface ComposerHandlers {
  onInput(value: string): void;
  onSubmit(value: string): void;
  onStop(): void;
  onToggleTools(): void;
  onOpenModelPicker(): void;
}

export function renderComposerSurface(props: ComposerProps, handlers: ComposerHandlers): HTMLElement {
  const form = el("form", "nc-composer");
  const field = el("div", "nc-composer__field");
  const textarea = el("textarea", "nc-composer__input") as HTMLTextAreaElement;
  textarea.value = props.value;
  textarea.disabled = props.disabled;
  textarea.placeholder = "Describe the browser task...";
  textarea.addEventListener("input", () => handlers.onInput(textarea.value));
  field.append(textarea);

  const actions = el("div", "nc-composer__actions");
  const tools = button(`nc-composer-tools${props.toolMenuOpen ? " nc-composer-tools--open" : ""}`, "Tools", "Tools");
  tools.type = "button";
  tools.addEventListener("click", () => handlers.onToggleTools());

  const model = button("nc-model-picker-button", props.modelLabel, "Choose model");
  model.type = "button";
  model.addEventListener("click", () => handlers.onOpenModelPicker());

  const context = el("span", "nc-context-ring", props.contextLabel);
  const submit = button(`nc-send-button${props.running ? " nc-send-button--stop" : ""}`, props.running ? "Stop" : "Send");
  submit.type = props.running ? "button" : "submit";
  submit.addEventListener("click", (event) => {
    if (!props.running) return;
    event.preventDefault();
    handlers.onStop();
  });

  actions.append(tools, el("span", "nc-composer__spacer"), model, context, submit);
  field.append(actions);
  form.append(field);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!props.running && textarea.value.trim()) handlers.onSubmit(textarea.value);
  });
  return form;
}
```

- [ ] **Step 4: Compose from `render.ts`**

Replace inline composer markup in `src/sidepanel/render.ts` with `renderComposerSurface()`, preserving existing handler names. Keep `render.ts` responsible only for choosing state and passing handlers.

- [ ] **Step 5: Add CSS primitives**

Add to `public/sidepanel.css`:

```css
.nc-composer {
  width: 100%;
  align-items: stretch;
}

.nc-composer__field {
  width: 100%;
  display: grid;
  gap: 10px;
}

.nc-composer__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
}

.nc-composer__spacer {
  flex: 1 1 auto;
}

.nc-model-picker-button,
.nc-composer-tools,
.nc-send-button {
  min-height: 34px;
  border-radius: 8px;
}
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run tests/unit/sidepanel/render.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/sidepanel/components/composer.ts src/sidepanel/components/workbench.ts src/sidepanel/render.ts public/sidepanel.css tests/unit/sidepanel/render.test.ts
git commit -m "refactor(sidepanel): split workbench composer"
```

## Task 2: Add ViewModel-Owned UI State

**Files:**
- Modify: `src/sidepanel/state.ts`
- Modify: `src/sidepanel/view-model.ts`
- Modify: `src/sidepanel/main.ts`
- Test: `tests/unit/sidepanel/state.test.ts`
- Test: `tests/unit/sidepanel/view-model.test.ts`

**Interfaces:**

```ts
export type SettingsTabId = "configs" | "skills" | "search" | "general";
export type ThemeMode = "system" | "light" | "dark";

export interface SidepanelUiState {
  settingsTab: SettingsTabId;
  toolMenuOpen: boolean;
  modelPickerOpen: boolean;
  sessionDrawerOpen: boolean;
  themeMode: ThemeMode;
}

export interface WorkbenchViewModel {
  title: string;
  statusLabel: string;
  statusTone: "idle" | "running" | "warning" | "error" | "completed" | "stopped";
  composer: ComposerProps;
  showSessionDrawer: boolean;
}
```

- [ ] **Step 1: Add failing state tests**

```ts
it("defaults transient UI state to Pie-like workbench defaults", () => {
  const state = withDerivedMode({
    mode: "conversation",
    view: "chat",
    overlayMode: "Off",
    safetyMode: "experimental_full_auto",
    modelConfigured: true,
    traceOpen: false
  });

  expect(state.ui?.settingsTab).toBe("configs");
  expect(state.ui?.toolMenuOpen).toBe(false);
  expect(state.ui?.modelPickerOpen).toBe(false);
  expect(state.ui?.sessionDrawerOpen).toBe(false);
  expect(state.ui?.themeMode).toBe("system");
});
```

- [ ] **Step 2: Verify failure**

Run: `npx vitest run tests/unit/sidepanel/state.test.ts -t "transient UI state"`

Expected: FAIL because `SidepanelState.ui` does not exist.

- [ ] **Step 3: Add state shape and normalizer**

Add to `src/sidepanel/state.ts`:

```ts
export type SettingsTabId = "configs" | "skills" | "search" | "general";
export type ThemeMode = "system" | "light" | "dark";

export interface SidepanelUiState {
  settingsTab: SettingsTabId;
  toolMenuOpen: boolean;
  modelPickerOpen: boolean;
  sessionDrawerOpen: boolean;
  themeMode: ThemeMode;
}

export const DEFAULT_SIDEPANEL_UI_STATE: SidepanelUiState = {
  settingsTab: "configs",
  toolMenuOpen: false,
  modelPickerOpen: false,
  sessionDrawerOpen: false,
  themeMode: "system"
};

export function withDefaultUiState(state: SidepanelState): SidepanelState {
  return {
    ...state,
    ui: {
      ...DEFAULT_SIDEPANEL_UI_STATE,
      ...state.ui
    }
  };
}
```

Add `ui?: SidepanelUiState` to `SidepanelState`.

- [ ] **Step 4: Use ViewModel instead of CSS selectors as logic**

In `src/sidepanel/view-model.ts`, produce `WorkbenchViewModel` using state only, not DOM inspection:

```ts
export function buildWorkbenchViewModel(state: SidepanelState): WorkbenchViewModel {
  const normalized = withDefaultUiState(withDerivedMode(state));
  const running = Boolean(normalized.activeTask && !["completed", "failed", "stopped"].includes(normalized.activeTask.status));
  return {
    title: normalized.activeTask?.currentAction || "Task Chat",
    statusLabel: normalized.activeTask?.status || "idle",
    statusTone: statusToneFromTask(normalized.activeTask?.status),
    composer: {
      value: normalized.composerInput ?? "",
      disabled: !normalized.modelConfigured,
      running,
      modelLabel: normalized.modelSettings?.plannerModel || "Choose model",
      contextLabel: `${normalized.timeline?.length ?? 0}`,
      toolMenuOpen: normalized.ui?.toolMenuOpen ?? false
    },
    showSessionDrawer: normalized.view === "history" || Boolean(normalized.ui?.sessionDrawerOpen)
  };
}
```

- [ ] **Step 5: Wire UI state handlers in `main.ts`**

Add handler updates:

```ts
function patchUi(next: Partial<NonNullable<SidepanelState["ui"]>>): void {
  state = withDerivedMode(withDefaultUiState({ ...state, ui: { ...state.ui, ...next } }));
  render();
}
```

Use `patchUi({ toolMenuOpen: !state.ui?.toolMenuOpen })`, `patchUi({ modelPickerOpen: true })`, and `patchUi({ settingsTab: "configs" })` in handlers.

- [ ] **Step 6: Run tests**

Run: `npx vitest run tests/unit/sidepanel/state.test.ts tests/unit/sidepanel/view-model.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/sidepanel/state.ts src/sidepanel/view-model.ts src/sidepanel/main.ts tests/unit/sidepanel/state.test.ts tests/unit/sidepanel/view-model.test.ts
git commit -m "feat(sidepanel): model workbench ui state"
```

## Task 3: Build Pie-Like Settings Center With Persistent Config

**Files:**
- Create: `src/sidepanel/components/settings-center.ts`
- Modify: `src/sidepanel/settings.ts`
- Modify: `src/adapters/chrome/model-config-store.ts`
- Modify: `src/core/model/model-config-service.ts`
- Modify: `src/sidepanel/main.ts`
- Test: `tests/unit/sidepanel/settings.test.ts`
- Test: `tests/unit/adapters/model-config-store.test.ts`
- Test: `tests/unit/core/model-config-service.test.ts`

**Interfaces:**

```ts
export interface StoredModelConfigV2 {
  version: 2;
  instances: ModelInstance[];
  activeSelection?: ModelSelection;
  detectedModelsByInstance: Record<string, string[]>;
}

export interface ModelConfigStore {
  load(): Promise<StoredModelConfigV2>;
  save(config: StoredModelConfigV2): Promise<void>;
}
```

- [ ] **Step 1: Write failing persistence migration test**

```ts
it("loads v1 sidepanel settings into v2 model config without losing selected models", async () => {
  const legacy = {
    providerBaseUrl: "https://api.example.com/v1",
    apiKey: "secret",
    apiKeyRef: "naturalclick:model-api-key",
    plannerModel: "qwen3-max",
    visionModel: "qwen-vl"
  };
  const store = createMemoryModelConfigStore({ legacySettings: legacy, detectedModels: ["qwen3-max", "qwen-vl"] });

  const config = await store.load();

  expect(config.version).toBe(2);
  expect(config.instances[0].baseUrl).toBe("https://api.example.com/v1");
  expect(config.activeSelection).toEqual({ instanceId: "legacy_openai_compatible", model: "qwen3-max" });
  expect(JSON.stringify(config)).not.toContain("secret");
});
```

- [ ] **Step 2: Verify failure**

Run: `npx vitest run tests/unit/adapters/model-config-store.test.ts -t "loads v1 sidepanel settings"`

Expected: FAIL because the v2 store and migration helper are incomplete.

- [ ] **Step 3: Add v2 schema and migration**

In `src/adapters/chrome/model-config-store.ts`, implement versioned load:

```ts
export function migrateModelConfig(value: unknown): StoredModelConfigV2 {
  if (isStoredModelConfigV2(value)) return value;
  const legacy = isLegacyModelSettings(value) ? value : defaultModelSettings();
  const instance = legacySettingsToModelInstance({ ...legacy, apiKey: "", apiKeyRef: legacy.apiKeyRef || "naturalclick:model-api-key" });
  return {
    version: 2,
    instances: instance ? [instance] : [],
    activeSelection: instance && legacy.plannerModel ? { instanceId: instance.id, model: legacy.plannerModel } : undefined,
    detectedModelsByInstance: instance ? { [instance.id]: instance.models.map((model) => model.id) } : {}
  };
}
```

- [ ] **Step 4: Render settings tabs as real state**

`settings-center.ts` renders `Configs`, `Skills`, `Search`, `General` tabs with `aria-selected`, and only the active panel is visible. The disabled panels still show honest available controls:

```ts
export function renderSettingsTabs(active: SettingsTabId, onChange: (tab: SettingsTabId) => void): HTMLElement {
  const tabs = el("div", "nc-settings-tabs");
  for (const tab of ["configs", "skills", "search", "general"] as const) {
    const node = button(`nc-settings-tab${active === tab ? " nc-settings-tab--active" : ""}`, settingsTabLabel(tab));
    node.type = "button";
    node.setAttribute("role", "tab");
    node.setAttribute("aria-selected", String(active === tab));
    node.addEventListener("click", () => onChange(tab));
    tabs.append(node);
  }
  return tabs;
}
```

- [ ] **Step 5: Stop using volatile-only storage for saved config**

In `src/sidepanel/main.ts`, route save/load through `ModelConfigStore` when Chrome storage is available; keep `localStorage` only as preview fallback. The success message must be based on the store promise resolving, not on in-memory state update.

- [ ] **Step 6: Run tests**

Run: `npx vitest run tests/unit/sidepanel/settings.test.ts tests/unit/adapters/model-config-store.test.ts tests/unit/core/model-config-service.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/sidepanel/components/settings-center.ts src/sidepanel/settings.ts src/adapters/chrome/model-config-store.ts src/core/model/model-config-service.ts src/sidepanel/main.ts tests/unit/sidepanel/settings.test.ts tests/unit/adapters/model-config-store.test.ts tests/unit/core/model-config-service.test.ts
git commit -m "feat(settings): add persistent model config center"
```

## Task 4: Fix Session Drawer, New Session, And Panel Rehydrate Semantics

**Files:**
- Create: `src/sidepanel/components/session-drawer.ts`
- Modify: `src/core/session/session-state-machine.ts`
- Modify: `src/adapters/chrome/chrome-session-memory.ts`
- Modify: `src/sidepanel/runtime-subscription.ts`
- Modify: `src/sidepanel/main.ts`
- Test: `tests/unit/core/session-state-machine.test.ts`
- Test: `tests/unit/adapters/chrome-session-memory.test.ts`
- Test: `tests/unit/sidepanel/state.test.ts`

**Interfaces:**

```ts
export interface SessionOpenPolicy {
  panelOpenedAt: number;
  hasActiveRunningTask: boolean;
  userRequestedFreshSession: boolean;
}

export type SessionOpenDecision =
  | { type: "resume_active"; sessionId: string }
  | { type: "start_fresh" }
  | { type: "show_history"; selectedSessionId?: string };
```

- [ ] **Step 1: Write failing policy tests**

```ts
it("opens a fresh chat after the user explicitly created a new session and the panel is reopened", () => {
  const decision = decideSessionOpen({
    panelOpenedAt: 1000,
    hasActiveRunningTask: false,
    userRequestedFreshSession: true
  }, { activeSessionId: "old", lastFreshSessionRequestAt: 900 });

  expect(decision).toEqual({ type: "start_fresh" });
});
```

- [ ] **Step 2: Verify failure**

Run: `npx vitest run tests/unit/adapters/chrome-session-memory.test.ts -t "fresh chat"`

Expected: FAIL because reopen currently can prefer prior history.

- [ ] **Step 3: Add session open policy**

Add a pure `decideSessionOpen()` helper near session persistence code and use it from `runtime-subscription.ts`. The rule is:

- Resume active only if a task is running or awaiting confirmation.
- Start fresh if the last explicit new-session marker is newer than the selected historical session.
- Show history only when user clicked history or opened a historical record.

- [ ] **Step 4: Make drawer overlay non-destructive**

`session-drawer.ts` must render over chat and close back to chat without changing the current composer text.

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/unit/core/session-state-machine.test.ts tests/unit/adapters/chrome-session-memory.test.ts tests/unit/sidepanel/state.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/sidepanel/components/session-drawer.ts src/core/session/session-state-machine.ts src/adapters/chrome/chrome-session-memory.ts src/sidepanel/runtime-subscription.ts src/sidepanel/main.ts tests/unit/core/session-state-machine.test.ts tests/unit/adapters/chrome-session-memory.test.ts tests/unit/sidepanel/state.test.ts
git commit -m "fix(session): honor fresh panel sessions"
```

## Task 5: Make Stop Durable And Complete

**Files:**
- Modify: `src/core/runtime/execution-controller.ts`
- Modify: `src/core/runtime/agent-runtime.ts`
- Modify: `src/core/runtime/tool-loop.ts`
- Modify: `src/background/index.ts`
- Modify: `src/adapters/content/action-settle.ts`
- Modify: `src/adapters/content/primitive-executor.ts`
- Test: `tests/unit/core/execution-controller.test.ts`
- Test: `tests/unit/core/agent-runtime.test.ts`
- Test: `tests/unit/core/tool-loop.test.ts`
- Test: `tests/unit/adapters/action-settle.test.ts`

**Interfaces:**

```ts
export interface StopToken {
  readonly taskId: string;
  readonly reason: RuntimeAbortReason;
  readonly signal: AbortSignal;
  throwIfStopped(): void;
  isStopped(): boolean;
}
```

- [ ] **Step 1: Write failing cancellation test**

```ts
it("does not execute a second tool call after stop is requested", async () => {
  const abort = new AbortController();
  const calls: string[] = [];
  const result = await runToolLoopStep({
    tools: [{ name: "click", group: "browser", description: "click", parameters: {} }, { name: "done", group: "control", description: "done", parameters: {} }],
    signal: abort.signal,
    async modelTurn() {
      return { type: "tool_calls", calls: [{ id: "1", name: "click", args: {} }, { id: "2", name: "done", args: {} }] };
    },
    async executeTool(call) {
      calls.push(call.name);
      abort.abort("user_stop");
      return { success: true, observation: "clicked" };
    }
  });

  expect(calls).toEqual(["click"]);
  expect(result.terminal).toEqual({ success: false, summary: "Stopped by user." });
});
```

- [ ] **Step 2: Verify failure**

Run: `npx vitest run tests/unit/core/tool-loop.test.ts -t "second tool call"`

Expected: FAIL because `runToolLoopStep` does not accept or check an abort signal between calls.

- [ ] **Step 3: Thread abort signals through every loop**

Update `ToolLoopInput`:

```ts
export interface ToolLoopInput {
  tools: ToolDefinition[];
  signal?: AbortSignal;
  modelTurn(): Promise<ModelToolTurn>;
  executeTool(call: ToolCall): Promise<ToolResult>;
}
```

At the start of the loop and before each tool execution:

```ts
if (input.signal?.aborted) {
  return { observations, terminal: { success: false, summary: "Stopped by user." } };
}
```

- [ ] **Step 4: Persist stop tombstones**

`execution-controller.ts` emits one stop event with payload:

```ts
{
  status: "stopped",
  reason: "user_stop",
  stoppedAt: Date.now()
}
```

`background/index.ts` stores the tombstone before aborting async work so panel reopen observes the stopped state.

- [ ] **Step 5: Make adapters abort-aware**

`action-settle.ts` and `primitive-executor.ts` must accept `AbortSignal` and return `{ status: "failed", reason: "aborted" }` without additional clicks or typing after stop.

- [ ] **Step 6: Run tests**

Run: `npx vitest run tests/unit/core/execution-controller.test.ts tests/unit/core/agent-runtime.test.ts tests/unit/core/tool-loop.test.ts tests/unit/adapters/action-settle.test.ts tests/unit/adapters/primitive-executor.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/runtime/execution-controller.ts src/core/runtime/agent-runtime.ts src/core/runtime/tool-loop.ts src/background/index.ts src/adapters/content/action-settle.ts src/adapters/content/primitive-executor.ts tests/unit/core/execution-controller.test.ts tests/unit/core/agent-runtime.test.ts tests/unit/core/tool-loop.test.ts tests/unit/adapters/action-settle.test.ts tests/unit/adapters/primitive-executor.test.ts
git commit -m "fix(runtime): make stop durable across execution"
```

## Task 6: Separate Debug Overlay From Recognition And Vision

**Files:**
- Modify: `src/adapters/content/overlay-controller.ts`
- Modify: `src/shared/overlay-targets.ts`
- Modify: `src/core/observation/debug-overlay-model.ts`
- Modify: `src/core/vision/vision.ts`
- Test: `tests/unit/adapters/overlay-controller.test.ts`
- Test: `tests/unit/shared/overlay-targets.test.ts`
- Test: `tests/unit/core/vision.test.ts`

**Interfaces:**

```ts
export interface DebugOverlayTarget {
  id: string;
  rect: DOMRectInit;
  label: string;
  tone: "focus" | "candidate" | "evidence" | "error";
}

export interface VisionCaptureHooks {
  clearDebugOverlay(): Promise<void>;
  restoreDebugOverlay(): Promise<void>;
}
```

- [ ] **Step 1: Write failing overlay label test**

```ts
it("does not render verbose model labels over the page", () => {
  const target = toDebugOverlayTarget({
    semanticId: "menu-1",
    label: "button - 客户管理 - 0.88",
    role: "button",
    confidence: 0.88,
    rect: { x: 10, y: 10, width: 100, height: 30 }
  });

  expect(target.label).toBe("客户管理");
  expect(target.label).not.toContain("button -");
  expect(target.label).not.toContain("0.88");
});
```

- [ ] **Step 2: Verify failure**

Run: `npx vitest run tests/unit/shared/overlay-targets.test.ts -t "verbose model labels"`

Expected: FAIL if current projection keeps verbose role/confidence text.

- [ ] **Step 3: Add label projection**

In `src/core/observation/debug-overlay-model.ts`, project short labels only:

```ts
export function shortDebugLabel(input: { label: string; role?: string; confidence?: number }): string {
  return input.label
    .replace(/^\s*(button|link|menuitem|textbox|tab)\s*-\s*/i, "")
    .replace(/\s*-\s*0\.\d+\s*$/i, "")
    .trim()
    .slice(0, 24);
}
```

- [ ] **Step 4: Clear overlay for vision capture**

In `vision.ts`, wrap screenshot capture:

```ts
await hooks.clearDebugOverlay();
try {
  return await captureScreenshot();
} finally {
  await hooks.restoreDebugOverlay();
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/unit/adapters/overlay-controller.test.ts tests/unit/shared/overlay-targets.test.ts tests/unit/core/vision.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/adapters/content/overlay-controller.ts src/shared/overlay-targets.ts src/core/observation/debug-overlay-model.ts src/core/vision/vision.ts tests/unit/adapters/overlay-controller.test.ts tests/unit/shared/overlay-targets.test.ts tests/unit/core/vision.test.ts
git commit -m "fix(overlay): keep debug markers out of recognition"
```

## Task 7: Improve Element Recognition With Atlas-First Target Binding

**Files:**
- Modify: `src/core/observation/page-atlas.ts`
- Modify: `src/core/observation/interactive-index.ts`
- Modify: `src/adapters/content/dom-observer.ts`
- Modify: `src/adapters/content/page-node-index.ts`
- Modify: `src/core/commands/binder.ts`
- Test: `tests/unit/core/page-atlas.test.ts`
- Test: `tests/unit/core/interactive-index.test.ts`
- Test: `tests/unit/adapters/dom-observer.test.ts`
- Test: `tests/unit/adapters/page-node-index.test.ts`
- Test: `tests/unit/core/commands-binder.test.ts`

**Interfaces:**

```ts
export interface TargetBindingRequest {
  semanticId?: string;
  handle?: string;
  label?: string;
  roleHint?: string[];
  scope?: "visible" | "full_page" | "current_region";
}

export interface TargetBindingResult {
  status: "bound" | "ambiguous" | "not_found";
  handle?: string;
  candidates: Array<{ handle: string; label: string; role: string; score: number }>;
  source: "semantic_id" | "handle" | "atlas_exact" | "atlas_ranked" | "legacy_fuzzy";
}
```

- [ ] **Step 1: Add generic menu fixture**

Create `tests/fixtures/pages/sidebar-menu.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <body>
    <nav aria-label="Primary">
      <button aria-expanded="false">客户管理</button>
      <button aria-expanded="false">表管理</button>
      <button aria-expanded="false">源码管理</button>
    </nav>
    <main><h1>数据中心</h1></main>
  </body>
</html>
```

- [ ] **Step 2: Write failing binder test**

```ts
it("binds a unique visible menuitem by exact atlas label before fuzzy fallback", () => {
  const result = bindTargetFromAtlas({
    label: "客户管理",
    roleHint: ["button", "menuitem"],
    scope: "visible"
  }, sidebarAtlasFixture());

  expect(result.status).toBe("bound");
  expect(result.source).toBe("atlas_exact");
  expect(result.candidates).toHaveLength(1);
});
```

- [ ] **Step 3: Verify failure**

Run: `npx vitest run tests/unit/core/commands-binder.test.ts -t "exact atlas label"`

Expected: FAIL because the binder does not expose an atlas-first result with source information.

- [ ] **Step 4: Implement binding priority**

Priority order in `src/core/commands/binder.ts`:

1. Explicit `semanticId`.
2. Explicit hidden `handle`.
3. Exact visible atlas label with role hint.
4. Exact accessible name with role hint.
5. Ranked atlas candidates.
6. Legacy fuzzy control candidates.

- [ ] **Step 5: Preserve stable hidden handles**

`page-node-index.ts` must attach or reuse `data-naturalclick-handle` and never require visible marker labels to execute. Handles are internal and excluded from screenshot overlays.

- [ ] **Step 6: Run tests**

Run: `npx vitest run tests/unit/core/page-atlas.test.ts tests/unit/core/interactive-index.test.ts tests/unit/adapters/dom-observer.test.ts tests/unit/adapters/page-node-index.test.ts tests/unit/core/commands-binder.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add tests/fixtures/pages/sidebar-menu.html src/core/observation/page-atlas.ts src/core/observation/interactive-index.ts src/adapters/content/dom-observer.ts src/adapters/content/page-node-index.ts src/core/commands/binder.ts tests/unit/core/page-atlas.test.ts tests/unit/core/interactive-index.test.ts tests/unit/adapters/dom-observer.test.ts tests/unit/adapters/page-node-index.test.ts tests/unit/core/commands-binder.test.ts
git commit -m "feat(observation): bind targets from page atlas"
```

## Task 8: Expand Fast Paths For Simple Operations

**Files:**
- Modify: `src/core/runtime/fast-paths.ts`
- Modify: `src/core/runtime/agent-runtime.ts`
- Modify: `src/core/events/runtime-health.ts`
- Test: `tests/unit/core/agent-speed-paths.test.ts`
- Test: `tests/unit/core/agent-runtime.test.ts`
- Test: `tests/unit/core/performance-guardrails.test.ts`

**Interfaces:**

```ts
export type FastPathSource =
  | "explicit_url"
  | "exact_visible_control"
  | "exact_visible_input"
  | "exact_visible_select"
  | "single_step_keyboard";

export interface FastPathDecision {
  source: FastPathSource;
  command: SemanticCommand;
  reasoningSummary: string;
  risk: "low";
  modelBypassed: true;
}
```

- [ ] **Step 1: Write failing no-model click test**

```ts
it("activates one exact low-risk sidebar control without planner model call", async () => {
  const plan = vi.fn();
  const events: AgentEvent[] = [];
  const result = await runOneAgentStep({
    sessionId: "s1",
    taskId: "t1",
    observePage: async () => pageWithControls([{ semanticId: "c1", role: "button", label: "客户管理", visibility: "visible", confidence: 0.95 }]),
    plan,
    execute: async () => ({ status: "completed" }),
    appendEvent: async (event) => events.push(event)
  }, "点击客户管理");

  expect(result.metrics?.modelCalls).toBe(0);
  expect(plan).not.toHaveBeenCalled();
  expect(events.some((event) => event.type === "fast_path_selected")).toBe(true);
});
```

- [ ] **Step 2: Verify failure**

Run: `npx vitest run tests/unit/core/agent-speed-paths.test.ts -t "without planner model call"`

Expected: FAIL if fast path does not emit metrics or still calls planner for a simple exact click.

- [ ] **Step 3: Add model bypass metrics**

`agent-runtime.ts` emits:

```ts
appendEvent(event(ports, stepId, "fast_path_selected", {
  source: decision.source,
  modelBypassed: true,
  reasoningSummary: decision.reasoningSummary
}, "debug"));
```

Metrics return `modelCalls: 0`.

- [ ] **Step 4: Keep ambiguity conservative**

`fast-paths.ts` must return `undefined` when two candidates have the same normalized exact label or when role/risk is not low. Ambiguous cases still call the planner.

- [ ] **Step 5: Add performance guardrail**

`performance-guardrails.test.ts` asserts exact control detection does not exceed a small deterministic budget:

```ts
expect(durationMs).toBeLessThan(20);
```

Use a fake timer or measured pure function loop, not a flaky browser timing test.

- [ ] **Step 6: Run tests**

Run: `npx vitest run tests/unit/core/agent-speed-paths.test.ts tests/unit/core/agent-runtime.test.ts tests/unit/core/performance-guardrails.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/runtime/fast-paths.ts src/core/runtime/agent-runtime.ts src/core/events/runtime-health.ts tests/unit/core/agent-speed-paths.test.ts tests/unit/core/agent-runtime.test.ts tests/unit/core/performance-guardrails.test.ts
git commit -m "perf(runtime): bypass planner for exact simple actions"
```

## Task 9: Make Tool Loop Bounded, Observable, And Recoverable

**Files:**
- Modify: `src/core/runtime/tool-loop.ts`
- Modify: `src/core/tools/tool-registry.ts`
- Modify: `src/core/tools/page-tools.ts`
- Modify: `src/core/tools/browser-tools.ts`
- Modify: `src/core/runtime/execution-recovery.ts`
- Test: `tests/unit/core/tool-loop.test.ts`
- Test: `tests/unit/core/tool-registry.test.ts`
- Test: `tests/unit/core/execution-recovery.test.ts`

**Interfaces:**

```ts
export interface ToolLoopLimits {
  maxCallsPerTurn: number;
  maxConsecutiveFailures: number;
  maxObservationRepeats: number;
}

export interface ToolLoopEventSink {
  onToolStarted(call: ToolCall): Promise<void>;
  onToolFinished(call: ToolCall, result: ToolResult): Promise<void>;
}
```

- [ ] **Step 1: Write failing bounded-loop test**

```ts
it("stops after max tool calls and reports a recoverable failure", async () => {
  const result = await runToolLoopStep({
    tools: [fakeTool("read_page"), fakeTool("click"), fakeTool("done")],
    limits: { maxCallsPerTurn: 2, maxConsecutiveFailures: 1, maxObservationRepeats: 1 },
    async modelTurn() {
      return { type: "tool_calls", calls: [{ id: "1", name: "read_page", args: {} }, { id: "2", name: "click", args: {} }, { id: "3", name: "done", args: {} }] };
    },
    async executeTool(call) {
      return { success: true, observation: call.name };
    }
  });

  expect(result.observations.map((item) => item.call.name)).toEqual(["read_page", "click"]);
  expect(result.terminal).toEqual({ success: false, summary: "Tool call limit reached." });
});
```

- [ ] **Step 2: Verify failure**

Run: `npx vitest run tests/unit/core/tool-loop.test.ts -t "max tool calls"`

Expected: FAIL because `limits` are not enforced.

- [ ] **Step 3: Enforce limits and emit events**

`runToolLoopStep()` checks `maxCallsPerTurn` before executing the next call and calls `eventSink` around every tool. It must not hide unknown-tool errors.

- [ ] **Step 4: Disclose tools progressively**

`tool-registry.ts` selects page-reading tools first, browser mutation tools only after target context is available, and heavyweight capability groups only when enabled.

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/unit/core/tool-loop.test.ts tests/unit/core/tool-registry.test.ts tests/unit/core/execution-recovery.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/runtime/tool-loop.ts src/core/tools/tool-registry.ts src/core/tools/page-tools.ts src/core/tools/browser-tools.ts src/core/runtime/execution-recovery.ts tests/unit/core/tool-loop.test.ts tests/unit/core/tool-registry.test.ts tests/unit/core/execution-recovery.test.ts
git commit -m "feat(runtime): bound and observe tool loop"
```

## Task 10: Add Action Executor Strategies

**Files:**
- Modify: `src/adapters/content/primitive-executor.ts`
- Modify: `src/adapters/chrome/cdp-session.ts`
- Modify: `src/adapters/chrome/cdp-input.ts`
- Modify: `src/background/index.ts`
- Test: `tests/unit/adapters/primitive-executor.test.ts`
- Test: `tests/unit/adapters/cdp-session.test.ts`
- Test: `tests/unit/adapters/cdp-input.test.ts`

**Interfaces:**

```ts
export type ActionExecutorName = "dom" | "cdp";

export interface ActionExecutor {
  readonly name: ActionExecutorName;
  canExecute(primitive: BrowserPrimitive): boolean;
  execute(primitive: BrowserPrimitive, signal?: AbortSignal): Promise<PrimitiveResult>;
}
```

- [ ] **Step 1: Write failing strategy selection test**

```ts
it("uses DOM executor for trusted element handles and falls back to CDP only when DOM cannot perform the action", async () => {
  const selected = chooseActionExecutor(
    { type: "click", targetRef: "h1" },
    [domExecutor({ canExecute: true }), cdpExecutor({ canExecute: true })]
  );

  expect(selected.name).toBe("dom");
});
```

- [ ] **Step 2: Verify failure**

Run: `npx vitest run tests/unit/adapters/primitive-executor.test.ts -t "DOM executor"`

Expected: FAIL if strategy selection is implicit or unavailable.

- [ ] **Step 3: Implement strategy selection**

Prefer DOM for stable hidden handles, CDP for pointer-precision fallback, and never attach CDP unless selected. CDP attach/detach is owner-token based and abort-safe.

- [ ] **Step 4: Return action evidence**

Every action result includes executor name, duration, and settle outcome:

```ts
{
  status: "completed",
  executor: "dom",
  durationMs: 12,
  settle: { navigationChanged: false, mutationsObserved: true }
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/unit/adapters/primitive-executor.test.ts tests/unit/adapters/cdp-session.test.ts tests/unit/adapters/cdp-input.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/adapters/content/primitive-executor.ts src/adapters/chrome/cdp-session.ts src/adapters/chrome/cdp-input.ts src/background/index.ts tests/unit/adapters/primitive-executor.test.ts tests/unit/adapters/cdp-session.test.ts tests/unit/adapters/cdp-input.test.ts
git commit -m "feat(actions): add executor strategies"
```

## Task 11: Add Runtime Telemetry And Slow-Path Diagnosis

**Files:**
- Modify: `src/core/events/runtime-health.ts`
- Modify: `src/sidepanel/runtime-issue.ts`
- Modify: `src/core/events/events.ts`
- Modify: `src/sidepanel/render.ts`
- Test: `tests/unit/core/runtime-health.test.ts`
- Test: `tests/unit/sidepanel/runtime-issue.test.ts`
- Test: `tests/unit/sidepanel/render.test.ts`

**Interfaces:**

```ts
export interface RuntimeLatencyMetric {
  name: "observe" | "model" | "bind" | "execute" | "settle" | "verify";
  durationMs: number;
  stepId: string;
}

export interface RuntimeHealthFinding {
  code: "slow_observation" | "slow_model" | "unnecessary_model_call" | "overlay_interference" | "stop_leak";
  severity: "info" | "warning" | "error";
  message: string;
}
```

- [ ] **Step 1: Write failing health test**

```ts
it("flags a simple exact click that called the model", () => {
  const findings = analyzeRuntimeHealth([
    eventOf("observation_completed", { visibleExactTarget: true }),
    eventOf("model_call_started", { role: "planner" }),
    eventOf("command_bound", { source: "atlas_exact" })
  ]);

  expect(findings).toContainEqual(expect.objectContaining({ code: "unnecessary_model_call", severity: "warning" }));
});
```

- [ ] **Step 2: Verify failure**

Run: `npx vitest run tests/unit/core/runtime-health.test.ts -t "simple exact click"`

Expected: FAIL until the analyzer knows this pattern.

- [ ] **Step 3: Add health analysis rules**

Rules:

- `slow_observation`: observation duration exceeds configured budget.
- `slow_model`: planner model duration dominates a simple task.
- `unnecessary_model_call`: exact fast-path target existed but planner was called.
- `overlay_interference`: vision capture happened while debug overlay root was present.
- `stop_leak`: action/model/tool event appears after `task_stopped`.

- [ ] **Step 4: Surface findings in side panel**

`runtime-issue.ts` maps findings into short Chinese and English messages. `render.ts` shows them in the execution report, not as blocking modal alerts.

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/unit/core/runtime-health.test.ts tests/unit/sidepanel/runtime-issue.test.ts tests/unit/sidepanel/render.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/events/runtime-health.ts src/sidepanel/runtime-issue.ts src/core/events/events.ts src/sidepanel/render.ts tests/unit/core/runtime-health.test.ts tests/unit/sidepanel/runtime-issue.test.ts tests/unit/sidepanel/render.test.ts
git commit -m "feat(runtime): diagnose slow and leaky execution"
```

## Task 12: Add Visual And Accessibility Verification For Sidepanel

**Files:**
- Modify: `tests/unit/sidepanel/render.test.ts`
- Create: `tests/unit/sidepanel/accessibility-contract.test.ts`
- Modify: `public/sidepanel.css`
- Test: `tests/unit/sidepanel/accessibility-contract.test.ts`

**Interfaces:**

```ts
export interface SidepanelLayoutContract {
  minWidthPx: 360;
  noNestedCards: true;
  iconButtonsHaveLabels: true;
  popoversStayInsideViewport: true;
}
```

- [ ] **Step 1: Write failing accessibility contract test**

```ts
it("gives every icon-only button an accessible name", () => {
  const root = renderSidepanel(baseRenderableState());
  const iconButtons = [...root.querySelectorAll<HTMLButtonElement>("button.nc-top-icon, button.nc-send-button")];
  expect(iconButtons.length).toBeGreaterThan(0);
  for (const button of iconButtons) {
    expect(button.getAttribute("aria-label") || button.title || button.textContent?.trim()).toBeTruthy();
  }
});
```

- [ ] **Step 2: Verify failure**

Run: `npx vitest run tests/unit/sidepanel/accessibility-contract.test.ts`

Expected: FAIL if any icon button lacks label or if the new test file is not implemented.

- [ ] **Step 3: Add CSS layout invariants**

Make fixed-format controls stable:

```css
.nc-top-icon {
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
}

.nc-session-title,
.nc-model-picker-button,
.nc-inline-alert {
  min-width: 0;
}

.nc-session-title__text,
.nc-model-picker-button {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/unit/sidepanel/render.test.ts tests/unit/sidepanel/accessibility-contract.test.ts`

Expected: PASS.

- [ ] **Step 5: Manual screenshot check**

Run a built extension preview and capture 430x900 and 360x760 side panel screenshots. Confirm:

- Composer uses full width and is not clipped.
- Settings tabs do not overflow.
- Drawer overlays chat without covering top bar actions incorrectly.
- No debug marker labels appear in the side panel preview unless the overlay setting is explicitly represented.

- [ ] **Step 6: Commit**

```bash
git add public/sidepanel.css tests/unit/sidepanel/render.test.ts tests/unit/sidepanel/accessibility-contract.test.ts
git commit -m "test(sidepanel): add layout accessibility contracts"
```

## Task 13: Add End-To-End Fixtures For Generic Agent Behavior

**Files:**
- Create: `tests/fixtures/pages/settings-form.html`
- Create: `tests/fixtures/pages/table-and-detail.html`
- Modify: `tests/unit/core/page-atlas-fixtures.test.ts`
- Modify: `tests/unit/core/agent-speed-paths.test.ts`
- Modify: `tests/unit/adapters/dom-observer.test.ts`

**Fixture Contracts:**

- `sidebar-menu.html`: generic navigation expansion.
- `settings-form.html`: text inputs, combobox, checkbox, save button, validation message.
- `table-and-detail.html`: table row selection and detail region update.

- [ ] **Step 1: Create fixtures**

Use semantic HTML with ARIA labels and a small amount of script for mutation/expanded state. Keep labels generic enough to avoid CRM-specific behavior.

- [ ] **Step 2: Write fixture atlas tests**

```ts
it("extracts controls, forms, and data surfaces from generic settings form", () => {
  const atlas = observeFixtureAsAtlas("settings-form.html");
  expect(atlas.forms.some((form) => form.label === "Profile settings")).toBe(true);
  expect(atlas.controls.some((control) => control.role === "textbox" && control.label === "Display name")).toBe(true);
  expect(atlas.controls.some((control) => control.role === "button" && control.label === "Save")).toBe(true);
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/unit/core/page-atlas-fixtures.test.ts tests/unit/core/agent-speed-paths.test.ts tests/unit/adapters/dom-observer.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/fixtures/pages/settings-form.html tests/fixtures/pages/table-and-detail.html tests/unit/core/page-atlas-fixtures.test.ts tests/unit/core/agent-speed-paths.test.ts tests/unit/adapters/dom-observer.test.ts
git commit -m "test(fixtures): cover generic browser agent pages"
```

## Task 14: Add Version, Build, And Release Gate

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `public/manifest.json`
- Modify: `naturalclick-extension/manifest.json`
- Modify: `tests/unit/build/manifest.test.ts`

**Interfaces:**

```ts
export interface VersionConsistency {
  packageVersion: string;
  publicManifestVersion: string;
  builtManifestVersion: string;
}
```

- [ ] **Step 1: Write failing version consistency test**

```ts
it("keeps package and extension manifest versions aligned", () => {
  const versions = readVersionConsistency();
  expect(versions.publicManifestVersion).toBe(versions.packageVersion);
  expect(versions.builtManifestVersion).toBe(versions.packageVersion);
});
```

- [ ] **Step 2: Verify failure if versions drift**

Run: `npx vitest run tests/unit/build/manifest.test.ts`

Expected: PASS on a clean aligned tree; manually inspect the failure by temporarily changing the in-memory fixture inside the test only, then restore before commit.

- [ ] **Step 3: Bump version for code release**

For the first implementation batch after this plan, bump from current `0.1.75` to `0.1.76` in:

- `package.json`
- `package-lock.json`
- `public/manifest.json`
- generated `naturalclick-extension/manifest.json` after `npm run build`

- [ ] **Step 4: Run full validation**

Run: `npm run typecheck`

Expected: PASS.

Run: `npm run test:unit`

Expected: PASS.

Run: `npm run build`

Expected: PASS and refreshed `naturalclick-extension`.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json public/manifest.json naturalclick-extension/manifest.json naturalclick-extension/sidepanel.js naturalclick-extension/sidepanel.css tests/unit/build/manifest.test.ts
git commit -m "chore(release): bump extension after workbench refactor"
```

---

## Cross-Task Acceptance Checklist

- [ ] A user can reopen the side panel after switching away from Chrome and see the current conversation or active task, not an accidental blank state.
- [ ] Clicking New Session creates a fresh current chat that remains fresh after panel close/open unless an active running task must be resumed.
- [ ] Saved model and overlay settings survive side panel refresh and plugin close/open.
- [ ] The model configuration center clearly separates provider config, model selection, skills, search, and general settings.
- [ ] The composer exposes tools, model picker, context status, send, and stop in a compact Pie-inspired bottom surface.
- [ ] Stop produces no later model chunks, tool calls, primitive actions, or verification attempts for that task.
- [ ] Visible debug markers are off by default and never required for recognition or click execution.
- [ ] Vision capture clears visible debug overlays before screenshot.
- [ ] A simple exact visible click records `modelCalls: 0`.
- [ ] Ambiguous targets do not use fast path and ask for observation/model reasoning instead.
- [ ] Runtime health can explain why a task was slow: observation, model, binding, execution, settle, or verification.
- [ ] Side panel passes 360px width layout checks without clipped primary controls.
- [ ] `npm run typecheck`, `npm run test:unit`, and `npm run build` pass before release.
- [ ] Versions are aligned across package and manifests after code changes.

## Execution Order

This plan is not split into product phases. The order below is the safest engineering order because each task leaves the project testable:

1. Task 2: UI state foundation.
2. Task 1: Workbench component boundaries.
3. Task 3: Persistent settings center.
4. Task 4: Session drawer and reopen semantics.
5. Task 5: Durable stop.
6. Task 6: Overlay and vision hygiene.
7. Task 7: Atlas-first recognition.
8. Task 8: Fast path expansion.
9. Task 9: Bounded tool loop.
10. Task 10: Action executor strategies.
11. Task 11: Telemetry and diagnosis.
12. Task 12: Visual and accessibility contracts.
13. Task 13: Generic behavior fixtures.
14. Task 14: Release gate and version bump.

## Self-Review

- Spec coverage: The plan covers Pie-like UI, model configuration, chat composer, settings persistence, session rehydrate, stop completeness, overlay marker hygiene, element recognition, fast execution, tool loop, action adapters, telemetry, tests, and release versioning.
- Placeholder scan: The plan avoids open-ended placeholders and gives concrete files, interfaces, tests, commands, expected outcomes, and commit boundaries.
- Type consistency: `SettingsTabId`, `SidepanelUiState`, `ComposerProps`, `ToolLoopLimits`, `StopToken`, `DebugOverlayTarget`, `TargetBindingResult`, and telemetry types are defined before tasks consume them.
- Risk note: The biggest implementation risk is touching `sidepanel/main.ts` and runtime cancellation at the same time. Keep task order disciplined and review between tasks.

