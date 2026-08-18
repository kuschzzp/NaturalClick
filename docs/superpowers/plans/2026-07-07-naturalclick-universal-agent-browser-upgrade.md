# NaturalClick Universal Agent Browser Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade NaturalClick from a model-heavy browser automation prototype into a general Chrome browser-operation Agent with a fast DOM-handle execution layer, stable session runtime, richer model configuration, and a polished workbench side panel.

**Architecture:** Use a hexagonal Agent Core: domain modules define tasks, observations, tools, sessions, model instances, and runtime events; Chrome, content scripts, side panel UI, storage, model APIs, screenshots, CDP, and file/PDF/search capabilities are adapters. The key redesign is to move from visual-overlay/model-first operation to hidden DOM handles plus compact Page Atlas observations, while keeping overlays as optional user/debug visualization.

**Tech Stack:** TypeScript, Chrome MV3, Vite, Vitest + jsdom, current NaturalClick event-store/runtime modules, Chrome side panel, content scripts, OpenAI-compatible model APIs, optional Chrome DevTools Protocol for trusted mouse/keyboard input.

## Global Constraints

- Do not introduce site-specific rules, CRM-specific menu names, or one-off workflows.
- Do not depend on a backend service, local daemon, or native messaging host for the core browser Agent.
- Do not send raw full DOM to the model as the default observation path.
- Page overlay labels are optional debug/user visualization; execution must work when overlay is off.
- Execution must not draw visual markers that pollute vision model screenshots.
- Simple deterministic actions must avoid planner model calls when the intent and target are already unambiguous.
- Every meaningful runtime transition writes an `AgentEvent`.
- Side panel receives runtime events in real time when possible and rehydrates from storage after panel close, panel refresh, browser focus changes, or service worker restart.
- Stop must abort model streaming, tool execution, CDP sessions, settle waits, and the runtime loop.
- API keys and provider credentials must persist safely and must not be exposed in runtime logs or downloaded traces.
- Full auto never means infinite execution; execution budgets and recovery limits still apply.
- Existing user changes in the working tree must not be reverted.
- Implementation must bump `package.json` and `public/manifest.json` / generated extension manifest versions when code changes land.

---

## Design Brief

NaturalClick is an operational browser Agent side panel. The UI should feel like a compact workbench: conversation when idle, execution console while running, with model/provider controls close to the composer. The side panel should take inspiration from Pie's dense workbench and model picker, but preserve NaturalClick's current event-driven core and Chrome MV3 boundaries.

Primary content objects:

- Active browser task.
- Current focused tab and page atlas.
- Agent step/tool call.
- Session and runtime event history.
- Model provider/instance/model selection.
- Optional debug overlay and downloaded diagnostic log.

Main action model:

- Start a task.
- Run simple operations quickly without unnecessary model calls.
- Observe a page through hidden DOM handles and compact structure.
- Execute tools by stable handles.
- Stop, recover, resume, or add mid-task instructions.
- Configure models and advanced runtime settings without losing data on refresh.

Layout archetype:

- Operational workbench, not marketing dashboard.
- Dense but calm.
- Bottom composer with integrated model picker/context status.
- Settings as a first-class configuration center, not a loose form.

## Source References Used

- Current NaturalClick modules:
  - `src/core/runtime/agent-runtime.ts`
  - `src/core/runtime/execution-controller.ts`
  - `src/core/runtime/execution-budget.ts`
  - `src/core/commands/binder.ts`
  - `src/adapters/content/dom-observer.ts`
  - `src/adapters/content/page-node-index.ts`
  - `src/adapters/content/primitive-executor.ts`
  - `src/adapters/content/overlay-controller.ts`
  - `src/sidepanel/main.ts`
  - `src/sidepanel/render.ts`
  - `src/sidepanel/state.ts`
  - `src/background/index.ts`
- Existing NaturalClick docs:
  - `docs/superpowers/specs/2026-06-26-agent-core-architecture-design.md`
  - `docs/superpowers/specs/2026-06-26-sidepanel-experience-design.md`
  - `docs/superpowers/plans/2026-06-26-agent-execution-loop-runtime.md`
  - `docs/superpowers/plans/2026-06-26-smart-observation-retrieval.md`
- Pie repository concepts inspected at commit `ff10ac784345f355c22a7104a9643d3c623cbd08`:
  - workbench composer and model picker
  - provider/instance/model registry
  - tool-call loop
  - `read_page` / Page Atlas
  - DOM `data-pie-idx` probing
  - CDP mouse/keyboard action layer
  - action settle wait

## Architectural Pattern Decisions

- **Hexagonal Architecture:** Agent Core defines ports; Chrome/background/content/sidepanel/storage/model/CDP are adapters.
- **Bounded Contexts:** Model Config, Observation, Execution, Session, Sidepanel UI, Capabilities, and Evaluation are separate contexts with explicit interfaces.
- **Command Pattern:** Browser actions are semantic commands or tool invocations; concrete primitives are adapter-owned.
- **Repository Pattern:** Session records, model instances, runtime settings, event logs, and page-atlas cache use narrow repositories instead of direct storage calls from core modules.
- **State Machine:** Session/task states are explicit, persisted, and recoverable.
- **Strategy Pattern:** Observation modes, model roles, action executors, and fast paths are pluggable strategies selected by capability/risk/context.
- **Anti-Corruption Layer:** Pie-inspired concepts are adapted into NaturalClick names and boundaries; no Pie file shapes are imported directly.

## File Map

### Model Config Context

- Create: `src/core/model/model-registry.ts`
  - Built-in provider/model metadata and capability lookup.
- Create: `src/core/model/model-instance.ts`
  - ProviderRef, ModelInstance, ModelSelection, ModelCapability value types.
- Create: `src/core/model/model-config-service.ts`
  - Pure use cases for create/update/delete/test/select model instances.
- Create: `src/adapters/chrome/model-config-store.ts`
  - Chrome storage adapter for encrypted/persisted model config.
- Modify: `src/core/model/config.ts`
  - Delegate to the new registry/service without breaking existing callers.
- Modify: `src/adapters/model/openai-compatible-client.ts`
  - Consume resolved `ModelRuntimeConfig`.
- Modify: `src/sidepanel/settings.ts`
  - Replace single settings shape with provider/instance/model form state.
- Test: `tests/unit/core/model-config-service.test.ts`
- Test: `tests/unit/adapters/model-config-store.test.ts`

### Sidepanel Workbench Context

- Create: `src/sidepanel/view-model.ts`
  - Pure selectors from sidepanel state to renderable workbench props.
- Create: `src/sidepanel/components/workbench.ts`
  - Top bar, timeline, agent step, composer, model picker, context ring render helpers.
- Create: `src/sidepanel/components/settings-panel.ts`
  - Config center render helpers.
- Modify: `src/sidepanel/render.ts`
  - Compose new workbench/settings surfaces.
- Modify: `src/sidepanel/main.ts`
  - Wire events, session actions, config actions, pending instructions.
- Modify: `src/sidepanel/state.ts`
  - Add model config, composer, pending instruction, and drawer state.
- Modify: `public/sidepanel.css`
  - Add workbench tokens, popovers, model picker, cards, focus rings.
- Test: `tests/unit/sidepanel/render.test.ts`
- Test: `tests/unit/sidepanel/state.test.ts`
- Test: `tests/unit/sidepanel/view-model.test.ts`

### Observation / Page Atlas Context

- Create: `src/core/observation/page-atlas.ts`
  - PageAtlas, AtlasControl, AtlasTarget, AtlasFingerprint domain types.
- Create: `src/core/observation/interactive-index.ts`
  - InteractiveElementRecord and render/priority helpers.
- Create: `src/core/observation/atlas-store.ts`
  - In-memory and persisted atlas cache contracts.
- Modify: `src/adapters/content/dom-observer.ts`
  - Add atlas and interactive modes without mutating visible UI.
- Modify: `src/adapters/content/page-node-index.ts`
  - Support atlas records, frame IDs, stable hidden handles, and retrieval.
- Modify: `src/core/context/page-context-assembler.ts`
  - Prefer atlas/interactive snapshots over large page contexts.
- Test: `tests/unit/core/page-atlas.test.ts`
- Test: `tests/unit/core/interactive-index.test.ts`
- Test: `tests/unit/adapters/dom-observer.test.ts`
- Test: `tests/unit/adapters/page-node-index.test.ts`

### Execution / Tool Runtime Context

- Create: `src/core/tools/tool.ts`
  - ToolDefinition, ToolResult, ToolHandlerContext, ToolGroup.
- Create: `src/core/tools/tool-registry.ts`
  - Tool group disclosure, selection, capability gates.
- Create: `src/core/tools/page-tools.ts`
  - `read_page`, `find_target`, `read_target`, `read_struct` definitions.
- Create: `src/core/tools/browser-tools.ts`
  - `click`, `hover`, `type`, `select`, `scroll`, `wait`, `done`, `fail`.
- Create: `src/core/runtime/tool-loop.ts`
  - Tool-call runtime orchestration that can coexist with current planner turns.
- Modify: `src/core/runtime/agent-runtime.ts`
  - Add deterministic fast paths and tool-loop execution mode.
- Modify: `src/core/commands/binder.ts`
  - Prefer explicit atlas/interactive handles before fuzzy text binding.
- Test: `tests/unit/core/tool-registry.test.ts`
- Test: `tests/unit/core/tool-loop.test.ts`
- Test: `tests/unit/core/agent-runtime.test.ts`
- Test: `tests/unit/core/commands-binder.test.ts`

### Chrome Action Adapter Context

- Create: `src/adapters/chrome/cdp-session.ts`
  - Lazy attach, owner token, abort-safe detach, conflict handling.
- Create: `src/adapters/chrome/cdp-input.ts`
  - Mouse and keyboard input commands.
- Create: `src/adapters/content/action-settle.ts`
  - Mutation/navigation quiet wait after mutating actions.
- Modify: `src/adapters/content/primitive-executor.ts`
  - Execute hidden-handle actions, editor-aware typing, and action settle.
- Modify: `src/background/index.ts`
  - Wire CDP and abort controller lifecycle.
- Test: `tests/unit/adapters/cdp-session.test.ts`
- Test: `tests/unit/adapters/cdp-input.test.ts`
- Test: `tests/unit/adapters/primitive-executor.test.ts`

### Session / Lifecycle Context

- Create: `src/core/session/session-state-machine.ts`
  - SessionStatus, TaskStatus, transition rules.
- Create: `src/core/session/session-store.ts`
  - Store interface and serialization helpers.
- Modify: `src/adapters/chrome/chrome-session-memory.ts`
  - Implement session store and snapshot recovery.
- Modify: `src/core/events/reducer.ts`
  - Derive visible session state from runtime events.
- Modify: `src/core/runtime/execution-controller.ts`
  - Ensure stop/resume/done/failed/tombstone transitions.
- Modify: `src/sidepanel/runtime-subscription.ts`
  - Rehydrate active session on sidepanel visibility/focus changes.
- Test: `tests/unit/core/session-state-machine.test.ts`
- Test: `tests/unit/adapters/chrome-session-memory.test.ts`
- Test: `tests/unit/core/execution-controller.test.ts`

### Overlay / Debug Visualization Context

- Create: `src/core/observation/debug-overlay-model.ts`
  - OverlayTarget projection independent from execution handles.
- Modify: `src/adapters/content/overlay-controller.ts`
  - Render only debug/user-requested overlays; never required for execution.
- Modify: `src/shared/overlay-targets.ts`
  - Keep overlay labels separate from model-observation records.
- Modify: `src/sidepanel/main.ts`
  - Persist overlay settings reliably.
- Test: `tests/unit/adapters/overlay-controller.test.ts`
- Test: `tests/unit/shared/overlay-targets.test.ts`

### Capabilities Context

- Create: `src/core/capabilities/skills.ts`
  - Skill metadata, invocation contract, and slash command registry.
- Create: `src/core/capabilities/scratchpad.ts`
  - Per-session extraction memory contract.
- Create: `src/core/capabilities/file-artifacts.ts`
  - Output/download artifact metadata.
- Create: `src/core/capabilities/pdf.ts`
  - PDF outline/search/read contracts.
- Modify: `src/core/capabilities/registry.ts`
  - Add capability groups and gates.
- Test: `tests/unit/core/capabilities.test.ts`

### Evaluation / Observability Context

- Create: `tests/fixtures/pages/crm-sidebar.html`
- Create: `tests/fixtures/pages/iframe-form.html`
- Create: `tests/fixtures/pages/rich-editor.html`
- Create: `tests/unit/core/agent-speed-paths.test.ts`
- Create: `tests/unit/core/page-atlas-fixtures.test.ts`
- Modify: `src/core/events/runtime-health.ts`
  - Add duration, model-call, observation, and tool latency metrics.
- Modify: `src/sidepanel/runtime-issue.ts`
  - Show user-readable runtime health issues.

---

### Task 1: Architecture Boundary Rules and Shared Types

**Files:**
- Create: `src/core/architecture/boundaries.ts`
- Create: `src/core/architecture/serialization.ts`
- Modify: `src/shared/protocol.ts`
- Test: `tests/unit/core/architecture-boundaries.test.ts`

**Interfaces:**
- Produces: `SerializableRecord`, `OpaqueId`, `assertNever()`, `RuntimeAbortReason`.
- Produces: shared message discriminators for model config, page atlas, tool execution, and session lifecycle.
- Consumes: existing `AgentEvent`, `PageModel`, and runtime protocol messages.

- [ ] **Step 1: Write failing boundary tests**

Add `tests/unit/core/architecture-boundaries.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { assertNever, isSerializableRecord } from "../../../src/core/architecture/serialization";

describe("architecture serialization helpers", () => {
  it("accepts JSON-serializable records used across adapter boundaries", () => {
    expect(isSerializableRecord({ type: "x", count: 1, nested: { ok: true }, list: ["a"] })).toBe(true);
  });

  it("rejects functions at adapter boundaries", () => {
    expect(isSerializableRecord({ handler: () => undefined })).toBe(false);
  });

  it("keeps assertNever as an exhaustive-switch guard", () => {
    expect(() => assertNever("unexpected" as never)).toThrow("Unhandled case: unexpected");
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `npx vitest run tests/unit/core/architecture-boundaries.test.ts`

Expected: FAIL because `src/core/architecture/serialization.ts` does not exist.

- [ ] **Step 3: Add serialization helpers**

Create `src/core/architecture/serialization.ts`:

```ts
export type SerializablePrimitive = string | number | boolean | null;
export type SerializableValue = SerializablePrimitive | SerializableValue[] | { [key: string]: SerializableValue };
export type SerializableRecord = { [key: string]: SerializableValue };

export function isSerializableRecord(value: unknown): value is SerializableRecord {
  return isSerializableValue(value) && value !== null && !Array.isArray(value) && typeof value === "object";
}

function isSerializableValue(value: unknown): value is SerializableValue {
  if (value === null) return true;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return Number.isFinite(value) || typeof value !== "number";
  if (Array.isArray(value)) return value.every(isSerializableValue);
  if (typeof value !== "object") return false;
  return Object.values(value as Record<string, unknown>).every(isSerializableValue);
}

export function assertNever(value: never): never {
  throw new Error(`Unhandled case: ${String(value)}`);
}
```

- [ ] **Step 4: Add boundary type aliases**

Create `src/core/architecture/boundaries.ts`:

```ts
export type OpaqueId<T extends string> = string & { readonly __opaqueType: T };

export type RuntimeAbortReason =
  | "user_stop"
  | "panel_disconnect"
  | "service_worker_restart"
  | "new_task_replaced_previous"
  | "cdp_detached"
  | "budget_exceeded";
```

- [ ] **Step 5: Verify**

Run: `npx vitest run tests/unit/core/architecture-boundaries.test.ts`

Expected: PASS.

---

### Task 2: Model Registry and Instance Configuration Center

**Files:**
- Create: `src/core/model/model-instance.ts`
- Create: `src/core/model/model-registry.ts`
- Create: `src/core/model/model-config-service.ts`
- Create: `src/adapters/chrome/model-config-store.ts`
- Modify: `src/core/model/config.ts`
- Modify: `src/sidepanel/settings.ts`
- Test: `tests/unit/core/model-config-service.test.ts`
- Test: `tests/unit/adapters/model-config-store.test.ts`

**Interfaces:**
- Produces: `ProviderRef`, `ModelCapability`, `ModelInstance`, `ModelSelection`, `ModelRuntimeConfig`.
- Produces: `ModelConfigStore` port with `listInstances()`, `saveInstance()`, `deleteInstance()`, `getActiveSelection()`, `setActiveSelection()`.
- Produces: `ModelConfigService` with provider/model validation and fallback selection.
- Consumes: existing `ModelSettingsState` as migration input.

- [ ] **Step 1: Write failing model service tests**

Add `tests/unit/core/model-config-service.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createModelConfigService } from "../../../src/core/model/model-config-service";
import type { ModelConfigStore, ModelInstance } from "../../../src/core/model/model-instance";

function memoryStore(initial: ModelInstance[] = []): ModelConfigStore {
  let instances = [...initial];
  let active: { instanceId: string; model: string } | undefined;
  return {
    listInstances: async () => instances,
    saveInstance: async (instance) => {
      instances = instances.filter((item) => item.id !== instance.id).concat(instance);
    },
    deleteInstance: async (id) => {
      instances = instances.filter((item) => item.id !== id);
      if (active?.instanceId === id) active = undefined;
    },
    getActiveSelection: async () => active,
    setActiveSelection: async (selection) => {
      active = selection;
    }
  };
}

describe("model config service", () => {
  it("selects the first configured model when no active selection exists", async () => {
    const service = createModelConfigService(memoryStore([
      {
        id: "inst_1",
        provider: "openai",
        label: "OpenAI",
        baseUrl: "https://api.openai.com/v1",
        apiKeyRef: "secret:openai",
        models: [{ id: "gpt-4o-mini", vision: true, tools: true, maxContextTokens: 128000 }]
      }
    ]));

    await expect(service.resolveActiveRuntimeConfig()).resolves.toMatchObject({
      provider: "openai",
      model: "gpt-4o-mini",
      vision: true,
      tools: true
    });
  });

  it("rejects selecting a model that is not in the instance model list", async () => {
    const store = memoryStore([
      {
        id: "inst_1",
        provider: "openai",
        label: "OpenAI",
        baseUrl: "https://api.openai.com/v1",
        apiKeyRef: "secret:openai",
        models: [{ id: "gpt-4o-mini", vision: true, tools: true, maxContextTokens: 128000 }]
      }
    ]);
    const service = createModelConfigService(store);

    await expect(service.setActiveSelection({ instanceId: "inst_1", model: "missing" })).rejects.toThrow("Unknown model missing");
  });
});
```

- [ ] **Step 2: Run failing tests**

Run: `npx vitest run tests/unit/core/model-config-service.test.ts`

Expected: FAIL because the new model config modules do not exist.

- [ ] **Step 3: Add model value types and store port**

Create `src/core/model/model-instance.ts`:

```ts
export type BuiltInProviderRef =
  | "openai"
  | "anthropic"
  | "gemini"
  | "openrouter"
  | "qwen"
  | "deepseek"
  | "custom";

export type ProviderRef = BuiltInProviderRef | `custom:${string}`;

export interface ModelCapability {
  id: string;
  displayName?: string;
  vision: boolean;
  tools: boolean;
  maxContextTokens: number;
  maxOutputTokens?: number;
}

export interface ModelInstance {
  id: string;
  provider: ProviderRef;
  label: string;
  baseUrl: string;
  apiKeyRef: string;
  models: ModelCapability[];
  endpointVariant?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface ModelSelection {
  instanceId: string;
  model: string;
}

export interface ModelRuntimeConfig {
  instanceId: string;
  provider: ProviderRef;
  providerLabel: string;
  model: string;
  baseUrl: string;
  apiKeyRef: string;
  vision: boolean;
  tools: boolean;
  maxContextTokens: number;
  maxOutputTokens?: number;
}

export interface ModelConfigStore {
  listInstances(): Promise<ModelInstance[]>;
  saveInstance(instance: ModelInstance): Promise<void>;
  deleteInstance(id: string): Promise<void>;
  getActiveSelection(): Promise<ModelSelection | undefined>;
  setActiveSelection(selection: ModelSelection): Promise<void>;
}
```

- [ ] **Step 4: Add registry defaults**

Create `src/core/model/model-registry.ts`:

```ts
import type { ModelCapability, ProviderRef } from "./model-instance";

export interface ProviderMetadata {
  id: ProviderRef;
  label: string;
  defaultBaseUrl: string;
  keyPlaceholder: string;
  models: ModelCapability[];
}

export const providerRegistry: ProviderMetadata[] = [
  {
    id: "openai",
    label: "OpenAI",
    defaultBaseUrl: "https://api.openai.com/v1",
    keyPlaceholder: "sk-...",
    models: [
      { id: "gpt-4o-mini", vision: true, tools: true, maxContextTokens: 128000 },
      { id: "gpt-4o", vision: true, tools: true, maxContextTokens: 128000 }
    ]
  },
  {
    id: "qwen",
    label: "Qwen",
    defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    keyPlaceholder: "sk-...",
    models: [
      { id: "qwen-max", vision: false, tools: true, maxContextTokens: 32000 },
      { id: "qwen-vl-max", vision: true, tools: true, maxContextTokens: 32000 }
    ]
  },
  {
    id: "custom",
    label: "OpenAI Compatible",
    defaultBaseUrl: "",
    keyPlaceholder: "API key",
    models: []
  }
];

export function providerMetadata(provider: ProviderRef): ProviderMetadata | undefined {
  if (provider.startsWith("custom:")) return providerRegistry.find((item) => item.id === "custom");
  return providerRegistry.find((item) => item.id === provider);
}
```

- [ ] **Step 5: Implement service**

Create `src/core/model/model-config-service.ts`:

```ts
import type { ModelConfigStore, ModelRuntimeConfig, ModelSelection } from "./model-instance";
import { providerMetadata } from "./model-registry";

export function createModelConfigService(store: ModelConfigStore) {
  async function resolveActiveRuntimeConfig(): Promise<ModelRuntimeConfig | undefined> {
    const instances = await store.listInstances();
    if (instances.length === 0) return undefined;
    const active = await store.getActiveSelection();
    const instance = instances.find((item) => item.id === active?.instanceId) ?? instances[0];
    const model = instance.models.find((item) => item.id === active?.model) ?? instance.models[0];
    if (!model) return undefined;
    const provider = providerMetadata(instance.provider);
    return {
      instanceId: instance.id,
      provider: instance.provider,
      providerLabel: instance.label || provider?.label || instance.provider,
      model: model.id,
      baseUrl: instance.baseUrl,
      apiKeyRef: instance.apiKeyRef,
      vision: model.vision,
      tools: model.tools,
      maxContextTokens: model.maxContextTokens,
      maxOutputTokens: model.maxOutputTokens
    };
  }

  async function setActiveSelection(selection: ModelSelection): Promise<void> {
    const instances = await store.listInstances();
    const instance = instances.find((item) => item.id === selection.instanceId);
    if (!instance) throw new Error(`Unknown model instance ${selection.instanceId}`);
    if (!instance.models.some((item) => item.id === selection.model)) {
      throw new Error(`Unknown model ${selection.model}`);
    }
    await store.setActiveSelection(selection);
  }

  return {
    resolveActiveRuntimeConfig,
    setActiveSelection
  };
}
```

- [ ] **Step 6: Add Chrome store adapter tests**

Add `tests/unit/adapters/model-config-store.test.ts` with fake storage modeled after `tests/unit/adapters/chrome-storage-event-store.test.ts`. Cover:

```ts
it("round-trips model instances and active selection", async () => {
  const store = createChromeModelConfigStore(fakeStorageArea);
  await store.saveInstance({
    id: "inst_1",
    provider: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    apiKeyRef: "secret:openai",
    models: [{ id: "gpt-4o-mini", vision: true, tools: true, maxContextTokens: 128000 }]
  });
  await store.setActiveSelection({ instanceId: "inst_1", model: "gpt-4o-mini" });
  await expect(store.listInstances()).resolves.toHaveLength(1);
  await expect(store.getActiveSelection()).resolves.toEqual({ instanceId: "inst_1", model: "gpt-4o-mini" });
});
```

- [ ] **Step 7: Implement Chrome store adapter**

Create `src/adapters/chrome/model-config-store.ts` with keys:

```ts
const STORAGE_KEY_INSTANCES = "naturalclick.model.instances.v1";
const STORAGE_KEY_ACTIVE_SELECTION = "naturalclick.model.activeSelection.v1";
```

Use `chrome.storage.local.get/set/remove` through dependency injection so tests can pass a fake storage area. Store `apiKeyRef`, not raw API key, in ordinary model instance payloads.

- [ ] **Step 8: Update sidepanel settings UI model**

Modify `src/sidepanel/settings.ts`:

- Keep `defaultModelSettings()` for migration.
- Add `ModelConfigPanelState`.
- Add actions:
  - `modelConfig/addInstance`
  - `modelConfig/deleteInstance`
  - `modelConfig/selectModel`
  - `modelConfig/testConnection`
- Persist through background messages, not sidepanel-only `localStorage`.

- [ ] **Step 9: Verify**

Run: `npx vitest run tests/unit/core/model-config-service.test.ts tests/unit/adapters/model-config-store.test.ts tests/unit/sidepanel/state.test.ts`

Expected: PASS.

---

### Task 3: Workbench Sidepanel and Composer Redesign

**Files:**
- Create: `src/sidepanel/view-model.ts`
- Create: `src/sidepanel/components/workbench.ts`
- Create: `src/sidepanel/components/settings-panel.ts`
- Modify: `src/sidepanel/render.ts`
- Modify: `src/sidepanel/main.ts`
- Modify: `src/sidepanel/state.ts`
- Modify: `public/sidepanel.css`
- Test: `tests/unit/sidepanel/view-model.test.ts`
- Test: `tests/unit/sidepanel/render.test.ts`
- Test: `tests/unit/sidepanel/state.test.ts`

**Interfaces:**
- Produces: `WorkbenchViewModel`, `ComposerViewModel`, `ModelPickerViewModel`.
- Consumes: runtime events, session summaries, model instances, runtime settings.
- Produces UI regions: top bar, session drawer, timeline, step line, composer, model picker, settings panel.

- [ ] **Step 1: Write view-model tests**

Add `tests/unit/sidepanel/view-model.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildWorkbenchViewModel } from "../../../src/sidepanel/view-model";

describe("workbench view model", () => {
  it("shows stop button and queue button while running with typed input", () => {
    const vm = buildWorkbenchViewModel({
      mode: "conversation",
      activeTask: { status: "running", taskId: "task_1", title: "打开客户管理" },
      composerInput: "然后打开第一条客户",
      modelInstances: [],
      activeModel: undefined,
      timeline: [],
      pendingInstructions: []
    });

    expect(vm.composer.primaryAction).toBe("queue");
    expect(vm.composer.stopVisible).toBe(true);
  });

  it("shows send button while idle", () => {
    const vm = buildWorkbenchViewModel({
      mode: "conversation",
      activeTask: undefined,
      composerInput: "打开客户管理",
      modelInstances: [],
      activeModel: undefined,
      timeline: [],
      pendingInstructions: []
    });

    expect(vm.composer.primaryAction).toBe("send");
    expect(vm.composer.stopVisible).toBe(false);
  });
});
```

- [ ] **Step 2: Run failing test**

Run: `npx vitest run tests/unit/sidepanel/view-model.test.ts`

Expected: FAIL because `view-model.ts` does not exist.

- [ ] **Step 3: Implement view model**

Create `src/sidepanel/view-model.ts`:

```ts
import type { TimelineItem } from "./state";
import type { ModelInstance, ModelRuntimeConfig } from "../core/model/model-instance";

export interface WorkbenchViewModelInput {
  mode: "conversation" | "settings" | "sessions";
  activeTask?: { status: "running" | "stopping" | "paused"; taskId: string; title: string };
  composerInput: string;
  modelInstances: ModelInstance[];
  activeModel?: ModelRuntimeConfig;
  timeline: TimelineItem[];
  pendingInstructions: Array<{ id: string; text: string }>;
}

export interface WorkbenchViewModel {
  topbar: {
    title: string;
    running: boolean;
    newSessionLabel: string;
  };
  composer: {
    input: string;
    primaryAction: "send" | "queue" | "disabled";
    stopVisible: boolean;
    modelLabel: string;
    pendingCount: number;
  };
  timeline: TimelineItem[];
}

export function buildWorkbenchViewModel(input: WorkbenchViewModelInput): WorkbenchViewModel {
  const hasInput = input.composerInput.trim().length > 0;
  const running = input.activeTask?.status === "running" || input.activeTask?.status === "stopping";
  return {
    topbar: {
      title: input.activeTask?.title ?? "NaturalClick",
      running,
      newSessionLabel: "新建会话"
    },
    composer: {
      input: input.composerInput,
      primaryAction: hasInput ? (running ? "queue" : "send") : "disabled",
      stopVisible: running,
      modelLabel: input.activeModel ? `${input.activeModel.providerLabel} · ${input.activeModel.model}` : "选择模型",
      pendingCount: input.pendingInstructions.length
    },
    timeline: input.timeline
  };
}
```

- [ ] **Step 4: Split render helpers**

Create `src/sidepanel/components/workbench.ts` exporting:

```ts
import type { WorkbenchViewModel } from "../view-model";

export function renderWorkbench(vm: WorkbenchViewModel): string {
  return `
    <section class="nc-workbench" aria-label="NaturalClick Agent">
      ${renderTopbar(vm)}
      <main class="nc-timeline" aria-live="polite">
        ${vm.timeline.map((item) => `<article class="nc-timeline-item"><strong>${escapeHtml(item.title)}</strong>${item.detail ? `<p>${escapeHtml(item.detail)}</p>` : ""}</article>`).join("")}
      </main>
      ${renderComposer(vm)}
    </section>
  `;
}

export function renderTopbar(vm: WorkbenchViewModel): string {
  return `
    <header class="nc-topbar">
      <button class="nc-icon-button" data-action="toggle-sessions" aria-label="会话列表">☰</button>
      <button class="nc-new-session" data-action="new-session" aria-label="${vm.topbar.newSessionLabel}" title="${vm.topbar.newSessionLabel}">＋</button>
      <span class="nc-topbar-title">${escapeHtml(vm.topbar.title)}</span>
      <button class="nc-icon-button" data-action="open-settings" aria-label="设置">⚙</button>
    </header>
  `;
}

export function renderComposer(vm: WorkbenchViewModel): string {
  const actionLabel = vm.composer.primaryAction === "queue" ? "排队发送" : "发送";
  return `
    <footer class="nc-composer">
      <textarea class="nc-composer-input" data-role="composer-input" rows="3" placeholder="描述你的任务...">${escapeHtml(vm.composer.input)}</textarea>
      <div class="nc-composer-actions">
        <button class="nc-tool-button" data-action="attach-file" aria-label="添加附件">＋</button>
        <button class="nc-model-picker" data-action="open-model-picker">${escapeHtml(vm.composer.modelLabel)}</button>
        ${vm.composer.stopVisible ? `<button class="nc-stop-button" data-action="stop-task" aria-label="停止">■</button>` : ""}
        <button class="nc-send-button" data-action="submit-task" ${vm.composer.primaryAction === "disabled" ? "disabled" : ""}>${actionLabel}</button>
      </div>
    </footer>
  `;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}
```

- [ ] **Step 5: Add settings panel render helper**

Create `src/sidepanel/components/settings-panel.ts` with rendered regions:

- Provider list.
- Instance editor.
- Model list.
- Connection test result.
- Runtime settings.
- Overlay settings.

Do not use `alert`, `confirm`, `prompt`, unstyled native selects, `outline: none`, or `transition: all`.

- [ ] **Step 6: Wire render**

Modify `src/sidepanel/render.ts` to call `buildWorkbenchViewModel()` and `renderWorkbench()` for chat mode, and `renderSettingsPanel()` for settings mode.

- [ ] **Step 7: Add CSS tokens and states**

Modify `public/sidepanel.css`:

```css
:root {
  --nc-canvas: #f8fafb;
  --nc-surface: #ffffff;
  --nc-field: #f2f5f7;
  --nc-line: #dfe6ec;
  --nc-text: #17202a;
  --nc-muted: #6a7480;
  --nc-accent: #256f68;
  --nc-danger: #b9473e;
  --nc-radius-control: 8px;
  --nc-radius-panel: 10px;
  --nc-focus: 0 0 0 2px rgba(37, 111, 104, 0.24);
}

.nc-workbench {
  display: flex;
  height: 100vh;
  min-width: 0;
  flex-direction: column;
  background: var(--nc-canvas);
  color: var(--nc-text);
}

.nc-topbar,
.nc-composer-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.nc-topbar {
  flex-shrink: 0;
  border-bottom: 1px solid var(--nc-line);
  padding: 8px 10px;
}

.nc-topbar-title {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 600;
}

.nc-icon-button,
.nc-new-session,
.nc-tool-button,
.nc-stop-button,
.nc-send-button {
  min-width: 32px;
  height: 32px;
  border: 1px solid var(--nc-line);
  border-radius: var(--nc-radius-control);
  background: var(--nc-surface);
  color: var(--nc-text);
}

.nc-icon-button:focus-visible,
.nc-new-session:focus-visible,
.nc-tool-button:focus-visible,
.nc-stop-button:focus-visible,
.nc-send-button:focus-visible,
.nc-model-picker:focus-visible,
.nc-composer-input:focus-visible {
  box-shadow: var(--nc-focus);
}

.nc-timeline {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.nc-composer {
  flex-shrink: 0;
  padding: 10px;
}

.nc-composer-input {
  width: 100%;
  min-height: 84px;
  resize: vertical;
  border: 1px solid var(--nc-line);
  border-radius: var(--nc-radius-panel);
  background: var(--nc-field);
  padding: 10px;
  color: var(--nc-text);
}

.nc-model-picker {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border: 0;
  background: transparent;
  color: var(--nc-muted);
  font-size: 12px;
}

.nc-stop-button {
  color: var(--nc-danger);
}

.nc-send-button:disabled {
  opacity: 0.45;
}
```

- [ ] **Step 8: Run UI primitive scan**

Run:

```bash
rg -n "alert\\(|confirm\\(|prompt\\(|window\\.alert|window\\.confirm|window\\.prompt|<select\\b|outline\\s*:\\s*none|outline-none|transition\\s*:\\s*all" src/sidepanel public/sidepanel.css
```

Expected: no product-facing browser dialog or focus/motion anti-pattern remains in changed UI files.

- [ ] **Step 9: Verify**

Run: `npx vitest run tests/unit/sidepanel/view-model.test.ts tests/unit/sidepanel/render.test.ts tests/unit/sidepanel/state.test.ts`

Expected: PASS.

---

### Task 4: Hidden DOM Handles, Interactive Index, and Page Atlas

**Files:**
- Create: `src/core/observation/page-atlas.ts`
- Create: `src/core/observation/interactive-index.ts`
- Create: `src/core/observation/atlas-store.ts`
- Modify: `src/adapters/content/dom-observer.ts`
- Modify: `src/adapters/content/page-node-index.ts`
- Modify: `src/core/context/page-context-assembler.ts`
- Test: `tests/unit/core/page-atlas.test.ts`
- Test: `tests/unit/core/interactive-index.test.ts`
- Test: `tests/unit/adapters/dom-observer.test.ts`

**Interfaces:**
- Produces: `PageAtlas`, `AtlasControl`, `AtlasTarget`, `InteractiveElementRecord`.
- Produces: `observePage(document, { mode: "atlas" | "interactive" | "content" | "full" })`.
- Consumes: existing `PageModel` and `NeedMoreObservationRequest`.

- [ ] **Step 1: Write atlas render tests**

Add `tests/unit/core/page-atlas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { renderPageAtlas } from "../../../src/core/observation/page-atlas";

describe("page atlas", () => {
  it("renders action and data surfaces without raw full DOM", () => {
    const atlas = renderPageAtlas({
      atlasId: "atlas_1",
      tabId: 7,
      url: "https://example.test/app",
      title: "Console",
      fingerprint: {
        url: "https://example.test/app",
        bodyTextLengthBucket: 1000,
        interactiveCountBucket: 20,
        topSectionCount: 3
      },
      controls: [{ id: "ctrl_1", frameId: 0, handle: "h1", role: "menuitem", label: "客户管理", expanded: false }],
      forms: [],
      targets: [{ id: "table_1", frameId: 0, type: "table", label: "客户列表", confidence: "high", summary: "10 rows", visibleCount: 10 }]
    });

    expect(atlas).toContain("<page_atlas");
    expect(atlas).toContain('label="客户管理"');
    expect(atlas).toContain('target_id="table_1"');
    expect(atlas).not.toContain("<body");
  });
});
```

- [ ] **Step 2: Write interactive index tests**

Add `tests/unit/core/interactive-index.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { renderInteractiveIndex } from "../../../src/core/observation/interactive-index";

describe("interactive index", () => {
  it("prioritizes inputs before buttons and links", () => {
    const text = renderInteractiveIndex([
      { frameId: 0, handle: "h2", tag: "a", role: "link", label: "详情", text: "" },
      { frameId: 0, handle: "h1", tag: "input", role: "textbox", label: "搜索", text: "" },
      { frameId: 0, handle: "h3", tag: "button", role: "button", label: "提交", text: "" }
    ]);

    expect(text.indexOf('label="搜索"')).toBeLessThan(text.indexOf('label="提交"'));
    expect(text.indexOf('label="提交"')).toBeLessThan(text.indexOf('label="详情"'));
  });
});
```

- [ ] **Step 3: Run failing tests**

Run: `npx vitest run tests/unit/core/page-atlas.test.ts tests/unit/core/interactive-index.test.ts`

Expected: FAIL because atlas modules do not exist.

- [ ] **Step 4: Add atlas types and renderer**

Create `src/core/observation/page-atlas.ts`:

```ts
export interface AtlasFingerprint {
  url: string;
  bodyTextLengthBucket: number;
  interactiveCountBucket: number;
  topSectionCount: number;
}

export interface AtlasControl {
  id: string;
  frameId: number;
  handle: string;
  role: string;
  label: string;
  value?: string;
  expanded?: boolean;
  disabled?: boolean;
}

export interface AtlasForm {
  id: string;
  frameId: number;
  label: string;
  fields: string[];
  submitControlId?: string;
}

export interface AtlasTarget {
  id: string;
  frameId: number;
  type: "table" | "collection" | "region" | "detail_region";
  label: string;
  confidence: "high" | "medium" | "low";
  summary: string;
  visibleCount?: number;
  estimatedTotal?: number;
}

export interface PageAtlas {
  atlasId: string;
  tabId: number;
  url: string;
  title: string;
  fingerprint: AtlasFingerprint;
  controls: AtlasControl[];
  forms: AtlasForm[];
  targets: AtlasTarget[];
}

export function renderPageAtlas(atlas: PageAtlas): string {
  const controls = atlas.controls.map((control) =>
    `    <control id="${xml(control.id)}" frame_id="${control.frameId}" handle="${xml(control.handle)}" role="${xml(control.role)}" label="${xml(control.label)}"${control.expanded !== undefined ? ` expanded="${control.expanded}"` : ""}${control.disabled ? ` disabled="true"` : ""} />`
  );
  const forms = atlas.forms.map((form) =>
    `    <form id="${xml(form.id)}" frame_id="${form.frameId}" label="${xml(form.label)}" fields="${xml(form.fields.join(","))}"${form.submitControlId ? ` submit_control_id="${xml(form.submitControlId)}"` : ""} />`
  );
  const targets = atlas.targets.map((target) =>
    `    <target target_id="${xml(target.id)}" frame_id="${target.frameId}" type="${target.type}" label="${xml(target.label)}" confidence="${target.confidence}"><summary>${xml(target.summary)}</summary></target>`
  );
  return [
    `<page_atlas atlas_id="${xml(atlas.atlasId)}" tab_id="${atlas.tabId}" url="${xml(atlas.url)}" title="${xml(atlas.title)}">`,
    "  <action_surfaces>",
    ...forms,
    ...controls,
    "  </action_surfaces>",
    "  <data_surfaces>",
    ...targets,
    "  </data_surfaces>",
    "</page_atlas>"
  ].join("\n");
}

function xml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}
```

- [ ] **Step 5: Add interactive index renderer**

Create `src/core/observation/interactive-index.ts`:

```ts
export interface InteractiveElementRecord {
  frameId: number;
  handle: string;
  tag: string;
  role: string;
  label: string;
  text: string;
  placeholder?: string;
  section?: string;
  expanded?: boolean;
  disabled?: boolean;
}

export function renderInteractiveIndex(records: InteractiveElementRecord[]): string {
  const sorted = [...records].sort((left, right) => priority(left) - priority(right));
  const lines = sorted.map((item) =>
    `  <interactive_element frame_id="${item.frameId}" handle="${xml(item.handle)}" tag="${xml(item.tag)}" role="${xml(item.role)}" label="${xml(item.label)}"${item.placeholder ? ` placeholder="${xml(item.placeholder)}"` : ""}${item.section ? ` section="${xml(item.section)}"` : ""}${item.expanded !== undefined ? ` expanded="${item.expanded}"` : ""}${item.disabled ? ` disabled="true"` : ""}>${xml(item.text)}</interactive_element>`
  );
  return `<interactive_index total="${records.length}">\n${lines.join("\n")}\n</interactive_index>`;
}

function priority(item: InteractiveElementRecord): number {
  const role = item.role.toLowerCase();
  const tag = item.tag.toLowerCase();
  if (tag === "input" || tag === "textarea" || role === "textbox" || role === "searchbox") return 0;
  if (tag === "select" || role === "combobox" || role === "listbox") return 1;
  if (tag === "button" || role === "button" || role === "menuitem" || role === "tab") return 2;
  if (tag === "a" || role === "link") return 3;
  return 4;
}

function xml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}
```

- [ ] **Step 6: Add atlas store contract**

Create `src/core/observation/atlas-store.ts`:

```ts
import type { PageAtlas } from "./page-atlas";

export interface AtlasLookup {
  atlasId: string;
  tabId: number;
  targetId?: string;
  handle?: string;
  now: number;
}

export interface AtlasStore {
  save(atlas: PageAtlas): void;
  get(atlasId: string): PageAtlas | undefined;
  resolve(lookup: AtlasLookup): { ok: true; atlas: PageAtlas } | { ok: false; reason: "missing" | "tab_mismatch" | "expired" };
}

export function createMemoryAtlasStore(ttlMs = 120000): AtlasStore {
  const records = new Map<string, { atlas: PageAtlas; createdAt: number }>();
  return {
    save(atlas) {
      records.set(atlas.atlasId, { atlas, createdAt: Date.now() });
    },
    get(atlasId) {
      return records.get(atlasId)?.atlas;
    },
    resolve(lookup) {
      const record = records.get(lookup.atlasId);
      if (!record) return { ok: false, reason: "missing" };
      if (record.atlas.tabId !== lookup.tabId) return { ok: false, reason: "tab_mismatch" };
      if (lookup.now - record.createdAt > ttlMs) return { ok: false, reason: "expired" };
      return { ok: true, atlas: record.atlas };
    }
  };
}
```

- [ ] **Step 7: Update content observer**

Modify `src/adapters/content/dom-observer.ts`:

- Add observation option `mode?: "atlas" | "interactive" | "content" | "full"`.
- During observation, stamp hidden handles on live DOM only using a neutral attribute such as `data-naturalclick-handle`.
- Do not create visible overlay elements.
- Derive `AtlasControl` from controls.
- Derive `InteractiveElementRecord` from controls.
- Keep existing `PageModel` behavior for compatibility while adding atlas/interactive payloads.

- [ ] **Step 8: Verify no visible marker mutation**

Extend `tests/unit/adapters/dom-observer.test.ts`:

```ts
it("stamps hidden execution handles without adding visible marker nodes", () => {
  document.body.innerHTML = `<button>客户管理</button>`;
  const beforeElements = document.body.querySelectorAll("*").length;

  const page = observePage(document, { mode: "interactive" });

  const afterElements = document.body.querySelectorAll("*").length;
  expect(afterElements).toBe(beforeElements);
  expect(document.querySelector("[data-naturalclick-handle]")).toBeTruthy();
  expect(JSON.stringify(page)).toContain("客户管理");
});
```

- [ ] **Step 9: Verify**

Run: `npx vitest run tests/unit/core/page-atlas.test.ts tests/unit/core/interactive-index.test.ts tests/unit/adapters/dom-observer.test.ts tests/unit/adapters/page-node-index.test.ts`

Expected: PASS.

---

### Task 5: Tool Registry and Progressive Tool Disclosure

**Files:**
- Create: `src/core/tools/tool.ts`
- Create: `src/core/tools/tool-registry.ts`
- Create: `src/core/tools/page-tools.ts`
- Create: `src/core/tools/browser-tools.ts`
- Modify: `src/core/capabilities/registry.ts`
- Test: `tests/unit/core/tool-registry.test.ts`

**Interfaces:**
- Produces: `ToolDefinition`, `ToolGroup`, `ToolResult`, `ToolRegistry`.
- Produces: `selectTools(activeGroups, modelCapabilities)`.
- Consumes: model capabilities from Task 2 and page atlas types from Task 4.

- [ ] **Step 1: Write failing registry tests**

Add `tests/unit/core/tool-registry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createToolRegistry } from "../../../src/core/tools/tool-registry";
import { browserTools } from "../../../src/core/tools/browser-tools";
import { pageTools } from "../../../src/core/tools/page-tools";

describe("tool registry", () => {
  it("starts with core browser and page tools", () => {
    const registry = createToolRegistry([...browserTools, ...pageTools]);
    const names = registry.selectTools(new Set(["core"]), { vision: false, tools: true }).map((tool) => tool.name);
    expect(names).toContain("read_page");
    expect(names).toContain("click");
    expect(names).not.toContain("capture_visible_tab");
  });

  it("does not expose vision tools to non-vision models", () => {
    const registry = createToolRegistry([
      ...browserTools,
      ...pageTools,
      { name: "capture_visible_tab", group: "vision", risk: "read", description: "", parameters: { type: "object", properties: {} } }
    ]);
    expect(registry.selectTools(new Set(["core", "vision"]), { vision: false, tools: true }).some((tool) => tool.name === "capture_visible_tab")).toBe(false);
  });
});
```

- [ ] **Step 2: Run failing test**

Run: `npx vitest run tests/unit/core/tool-registry.test.ts`

Expected: FAIL because tool modules do not exist.

- [ ] **Step 3: Add tool contracts**

Create `src/core/tools/tool.ts`:

```ts
import type { SerializableRecord } from "../architecture/serialization";

export type ToolGroup = "core" | "vision" | "pdf" | "files" | "scratchpad" | "schedule" | "skills";
export type ToolRisk = "read" | "write" | "destructive";

export interface ToolDefinition {
  name: string;
  group: ToolGroup;
  risk: ToolRisk;
  description: string;
  parameters: SerializableRecord;
}

export interface ToolResult {
  success: boolean;
  observation: string;
  data?: SerializableRecord;
  error?: string;
}

export interface ToolRuntimeCapabilities {
  vision: boolean;
  tools: boolean;
}
```

- [ ] **Step 4: Add registry**

Create `src/core/tools/tool-registry.ts`:

```ts
import type { ToolDefinition, ToolRuntimeCapabilities, ToolGroup } from "./tool";

export function createToolRegistry(tools: ToolDefinition[]) {
  return {
    selectTools(activeGroups: ReadonlySet<ToolGroup | string>, capabilities: ToolRuntimeCapabilities): ToolDefinition[] {
      if (!capabilities.tools) return [];
      return tools.filter((tool) => {
        if (!activeGroups.has(tool.group)) return false;
        if (tool.group === "vision" && !capabilities.vision) return false;
        return true;
      });
    }
  };
}
```

- [ ] **Step 5: Add browser and page tool definitions**

Create `src/core/tools/browser-tools.ts` with core tools:

```ts
import type { ToolDefinition } from "./tool";

export const browserTools: ToolDefinition[] = [
  {
    name: "click",
    group: "core",
    risk: "write",
    description: "Click an interactive element by frameId and hidden handle from the latest read_page interactive index.",
    parameters: {
      type: "object",
      properties: {
        frameId: { type: "number" },
        handle: { type: "string" }
      },
      required: ["frameId", "handle"],
      additionalProperties: false
    }
  },
  {
    name: "type",
    group: "core",
    risk: "write",
    description: "Type text into an editable element by frameId and hidden handle.",
    parameters: {
      type: "object",
      properties: {
        frameId: { type: "number" },
        handle: { type: "string" },
        text: { type: "string" },
        clear: { type: "boolean" }
      },
      required: ["frameId", "handle", "text"],
      additionalProperties: false
    }
  },
  {
    name: "done",
    group: "core",
    risk: "read",
    description: "Signal successful task completion.",
    parameters: {
      type: "object",
      properties: { result: { type: "string" } },
      required: ["result"],
      additionalProperties: false
    }
  },
  {
    name: "fail",
    group: "core",
    risk: "read",
    description: "Signal that the task cannot be completed.",
    parameters: {
      type: "object",
      properties: { reason: { type: "string" } },
      required: ["reason"],
      additionalProperties: false
    }
  }
];
```

Create `src/core/tools/page-tools.ts`:

```ts
import type { ToolDefinition } from "./tool";

export const pageTools: ToolDefinition[] = [
  {
    name: "read_page",
    group: "core",
    risk: "read",
    description: "Inspect the current tab. Default mode returns a compact Page Atlas; interactive mode returns handles for click/type/select.",
    parameters: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["atlas", "interactive", "content", "full"] }
      },
      required: [],
      additionalProperties: false
    }
  },
  {
    name: "find_target",
    group: "core",
    risk: "read",
    description: "Search Page Atlas target metadata to find the right structured target.",
    parameters: {
      type: "object",
      properties: {
        atlasId: { type: "string" },
        query: { type: "string" }
      },
      required: ["atlasId", "query"],
      additionalProperties: false
    }
  }
];
```

- [ ] **Step 6: Verify**

Run: `npx vitest run tests/unit/core/tool-registry.test.ts`

Expected: PASS.

---

### Task 6: Deterministic Fast Paths Before Model Planning

**Files:**
- Create: `src/core/runtime/fast-paths.ts`
- Modify: `src/core/runtime/agent-runtime.ts`
- Modify: `src/core/runtime/execution-budget.ts`
- Test: `tests/unit/core/agent-speed-paths.test.ts`
- Test: `tests/unit/core/agent-runtime.test.ts`

**Interfaces:**
- Produces: `FastPathDecision`.
- Produces: `detectFastPath(taskFrame, pageModel, actionMemory)`.
- Consumes: existing `SemanticCommand`, `PageModel`, and `TaskFrame`.

- [ ] **Step 1: Write fast path tests**

Add `tests/unit/core/agent-speed-paths.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { detectFastPath } from "../../../src/core/runtime/fast-paths";

describe("runtime fast paths", () => {
  it("navigates explicit URLs without planner call", () => {
    const decision = detectFastPath({
      taskText: "打开 https://example.com/customers",
      pageUrl: "chrome://newtab/",
      controls: [],
      actionMemory: []
    });

    expect(decision).toMatchObject({
      source: "explicit_url",
      command: { type: "NavigateTo", inputs: { url: "https://example.com/customers" } }
    });
  });

  it("clicks an exact visible menu item without planner call", () => {
    const decision = detectFastPath({
      taskText: "点击客户管理",
      pageUrl: "https://crm.example.test/",
      controls: [
        { semanticId: "control_1_menuitem_customer", role: "menuitem", label: "客户管理", accessibleName: "客户管理", visibility: "visible", disabled: false, confidence: 0.92, interactionHints: [], locatorHints: [], bounds: { x: 0, y: 0, width: 100, height: 32 } }
      ],
      actionMemory: []
    });

    expect(decision).toMatchObject({
      source: "exact_visible_control",
      command: { type: "ActivateTarget", targetGoal: "客户管理" }
    });
  });
});
```

- [ ] **Step 2: Run failing test**

Run: `npx vitest run tests/unit/core/agent-speed-paths.test.ts`

Expected: FAIL because `fast-paths.ts` does not exist.

- [ ] **Step 3: Implement fast paths**

Create `src/core/runtime/fast-paths.ts`:

```ts
import type { ControlCandidate } from "../observation/page-model";
import type { SemanticCommand } from "../commands/commands";

export interface FastPathInput {
  taskText: string;
  pageUrl: string;
  controls: ControlCandidate[];
  actionMemory: unknown[];
}

export interface FastPathDecision {
  source: "explicit_url" | "exact_visible_control";
  command: SemanticCommand;
  reasoningSummary: string;
}

export function detectFastPath(input: FastPathInput): FastPathDecision | undefined {
  if (input.actionMemory.length > 0) return undefined;

  const explicitUrl = input.taskText.match(/https?:\/\/[^\s，。；;]+/i)?.[0];
  if (explicitUrl && !sameOrigin(input.pageUrl, explicitUrl)) {
    return {
      source: "explicit_url",
      command: {
        id: "fast_path_url",
        type: "NavigateTo",
        targetGoal: `Open ${explicitUrl}`,
        inputs: { url: explicitUrl },
        expectedOutcome: "The requested URL is loaded.",
        successCriteria: ["page_changed"],
        riskHint: "low",
        fallbackHints: []
      },
      reasoningSummary: "The user provided an explicit URL and the current page is outside that origin."
    };
  }

  const clickIntent = input.taskText.match(/(?:点击|打开|进入)\s*([^\s，。；;]+)/u)?.[1]?.trim();
  if (clickIntent) {
    const exact = input.controls.find((control) =>
      control.visibility === "visible" &&
      !control.disabled &&
      normalize(control.label || control.accessibleName) === normalize(clickIntent) &&
      ["button", "link", "menuitem", "tab", "listitem"].includes(control.role.toLowerCase())
    );
    if (exact) {
      return {
        source: "exact_visible_control",
        command: {
          id: "fast_path_click",
          type: "ActivateTarget",
          targetGoal: clickIntent,
          inputs: { semanticId: exact.semanticId, label: exact.label },
          expectedOutcome: "The target control is activated.",
          successCriteria: ["target_visible"],
          riskHint: "low",
          fallbackHints: []
        },
        reasoningSummary: "The task matches one exact visible low-risk control."
      };
    }
  }

  return undefined;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "").trim();
}

function sameOrigin(left: string, right: string): boolean {
  try {
    return new URL(left).origin === new URL(right).origin;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Wire runtime before planner**

Modify `src/core/runtime/agent-runtime.ts`:

- Keep existing explicit URL fast path.
- Replace ad hoc logic with `detectFastPath()`.
- Emit `PlanProduced` with `plannerSource: "deterministic_fast_path"`.
- Do not increment `metrics.modelCalls` for fast path execution.

- [ ] **Step 5: Verify no model call for simple click**

Extend `tests/unit/core/agent-runtime.test.ts`:

```ts
it("does not call planner for exact low-risk visible control", async () => {
  let planCalls = 0;
  const runtime = new AgentRuntime({
    sessionId: "session-fast-click",
    taskId: "task-fast-click",
    appendEvent: async () => undefined,
    observePage: async () => pageWithVisibleControl("客户管理"),
    plan: async () => {
      planCalls += 1;
      return { type: "FinishTask", summary: "unexpected", evidenceRefs: [] };
    },
    execute: async () => ({ status: "success", details: {} })
  });

  await runtime.startTask("点击客户管理");
  const result = await runtime.runNextStep();

  expect(result.metrics?.modelCalls).toBe(0);
  expect(planCalls).toBe(0);
});
```

- [ ] **Step 6: Verify**

Run: `npx vitest run tests/unit/core/agent-speed-paths.test.ts tests/unit/core/agent-runtime.test.ts`

Expected: PASS.

---

### Task 7: Handle-Based Browser Action Execution and CDP Input

**Files:**
- Create: `src/adapters/chrome/cdp-session.ts`
- Create: `src/adapters/chrome/cdp-input.ts`
- Create: `src/adapters/content/action-settle.ts`
- Modify: `src/adapters/content/primitive-executor.ts`
- Modify: `src/background/index.ts`
- Test: `tests/unit/adapters/cdp-session.test.ts`
- Test: `tests/unit/adapters/cdp-input.test.ts`
- Test: `tests/unit/adapters/primitive-executor.test.ts`

**Interfaces:**
- Produces: `CdpSession`, `acquireCdpSession()`, `detachAllCdpSessions()`.
- Produces: `dispatchMouseClick()`, `dispatchKeyboardText()`, `pressKey()`.
- Produces: `withActionSettle(tabId, action)`.
- Consumes: hidden DOM handles from Task 4.

- [ ] **Step 1: Write CDP session tests**

Add `tests/unit/adapters/cdp-session.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createCdpSessionManager } from "../../../src/adapters/chrome/cdp-session";

describe("cdp session manager", () => {
  it("reuses a session for the same owner and detaches on abort", async () => {
    const attach = vi.fn((_, __, cb) => cb());
    const detach = vi.fn((_, cb) => cb());
    const sendCommand = vi.fn((_, __, ___, cb) => cb({}));
    const manager = createCdpSessionManager({ attach, detach, sendCommand });
    const abort = new AbortController();

    const first = await manager.acquire(12, { ownerId: "task_1", signal: abort.signal });
    const second = await manager.acquire(12, { ownerId: "task_1", signal: abort.signal });

    expect(first).toBe(second);
    expect(attach).toHaveBeenCalledTimes(1);
    abort.abort();
    expect(detach).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run failing tests**

Run: `npx vitest run tests/unit/adapters/cdp-session.test.ts`

Expected: FAIL because CDP session manager does not exist.

- [ ] **Step 3: Implement CDP session manager**

Create `src/adapters/chrome/cdp-session.ts`:

```ts
export interface ChromeDebuggerLike {
  attach(target: { tabId: number }, protocolVersion: string, callback: () => void): void;
  detach(target: { tabId: number }, callback: () => void): void;
  sendCommand(target: { tabId: number }, method: string, params: unknown, callback: (result?: unknown) => void): void;
}

export interface CdpSession {
  tabId: number;
  ownerId: string;
  send(method: string, params: unknown): Promise<unknown>;
  detach(): Promise<void>;
}

export function createCdpSessionManager(debuggerApi: ChromeDebuggerLike) {
  const sessions = new Map<number, CdpSession>();

  async function acquire(tabId: number, options: { ownerId: string; signal: AbortSignal }): Promise<CdpSession> {
    const existing = sessions.get(tabId);
    if (existing?.ownerId === options.ownerId) return existing;
    if (existing) throw new Error(`CDP session for tab ${tabId} is already owned by ${existing.ownerId}`);
    await attach(debuggerApi, tabId);
    const session: CdpSession = {
      tabId,
      ownerId: options.ownerId,
      send: (method, params) => send(debuggerApi, tabId, method, params),
      detach: async () => {
        if (sessions.get(tabId) !== session) return;
        sessions.delete(tabId);
        await detach(debuggerApi, tabId);
      }
    };
    sessions.set(tabId, session);
    options.signal.addEventListener("abort", () => void session.detach(), { once: true });
    return session;
  }

  async function detachAll(): Promise<void> {
    await Promise.all([...sessions.values()].map((session) => session.detach()));
  }

  return { acquire, detachAll };
}

function attach(debuggerApi: ChromeDebuggerLike, tabId: number): Promise<void> {
  return new Promise((resolve) => debuggerApi.attach({ tabId }, "1.3", () => resolve()));
}

function detach(debuggerApi: ChromeDebuggerLike, tabId: number): Promise<void> {
  return new Promise((resolve) => debuggerApi.detach({ tabId }, () => resolve()));
}

function send(debuggerApi: ChromeDebuggerLike, tabId: number, method: string, params: unknown): Promise<unknown> {
  return new Promise((resolve) => debuggerApi.sendCommand({ tabId }, method, params, (result) => resolve(result)));
}
```

- [ ] **Step 4: Implement CDP input helpers**

Create `src/adapters/chrome/cdp-input.ts`:

```ts
import type { CdpSession } from "./cdp-session";

export async function dispatchMouseClick(session: CdpSession, x: number, y: number): Promise<void> {
  await session.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none", clickCount: 0, pointerType: "mouse" });
  await session.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1, pointerType: "mouse" });
  await session.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1, pointerType: "mouse" });
}

export async function dispatchKeyboardText(session: CdpSession, text: string): Promise<void> {
  await session.send("Input.insertText", { text });
}
```

- [ ] **Step 5: Add action settle helper**

Create `src/adapters/content/action-settle.ts`:

```ts
export interface ActionSettleOptions {
  quietMs?: number;
  maxMs?: number;
  pollMs?: number;
}

export async function waitForActionSettle(readActivityAt: () => Promise<number>, options: ActionSettleOptions = {}): Promise<void> {
  const quietMs = options.quietMs ?? 400;
  const maxMs = options.maxMs ?? 2500;
  const pollMs = options.pollMs ?? 100;
  const startedAt = Date.now();
  let lastActivityAt = startedAt;

  while (Date.now() - startedAt < maxMs) {
    await new Promise((resolve) => setTimeout(resolve, pollMs));
    lastActivityAt = Math.max(lastActivityAt, await readActivityAt());
    if (Date.now() - lastActivityAt >= quietMs) return;
  }
}
```

- [ ] **Step 6: Update primitive executor**

Modify `src/adapters/content/primitive-executor.ts`:

- Resolve `dom_click` and `dom_input` by `semanticId` or `data-naturalclick-handle`.
- For native fields, use DOM value setter.
- For contenteditable, use `execCommand("insertText")` and input events.
- For editor-buffer detection, return a typed failure reason that suggests CDP keyboard fallback.
- Wrap mutating actions with settle wait in the background adapter.

- [ ] **Step 7: Verify**

Run: `npx vitest run tests/unit/adapters/cdp-session.test.ts tests/unit/adapters/cdp-input.test.ts tests/unit/adapters/primitive-executor.test.ts`

Expected: PASS.

---

### Task 8: Tool-Call Runtime Loop

**Files:**
- Create: `src/core/runtime/tool-loop.ts`
- Modify: `src/core/runtime/agent-runtime.ts`
- Modify: `src/core/model/contracts.ts`
- Modify: `src/adapters/model/openai-compatible-client.ts`
- Test: `tests/unit/core/tool-loop.test.ts`
- Test: `tests/unit/core/streaming-client.test.ts`

**Interfaces:**
- Produces: `ToolLoopInput`, `ToolLoopResult`, `runToolLoopStep()`.
- Consumes: `ToolDefinition`, `ToolResult`, model streaming client, runtime events.
- Supports current planner mode during transition.

- [ ] **Step 1: Write tool-loop tests**

Add `tests/unit/core/tool-loop.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { runToolLoopStep } from "../../../src/core/runtime/tool-loop";

describe("tool loop", () => {
  it("executes model tool calls in order and returns observations", async () => {
    const executed: string[] = [];
    const result = await runToolLoopStep({
      tools: [
        { name: "read_page", group: "core", risk: "read", description: "", parameters: { type: "object", properties: {} } },
        { name: "done", group: "core", risk: "read", description: "", parameters: { type: "object", properties: {} } }
      ],
      modelTurn: async () => ({
        type: "tool_calls",
        calls: [
          { id: "call_1", name: "read_page", args: { mode: "atlas" } },
          { id: "call_2", name: "done", args: { result: "完成" } }
        ]
      }),
      executeTool: async (call) => {
        executed.push(call.name);
        return { success: true, observation: call.name === "done" ? "完成" : "<page_atlas />" };
      }
    });

    expect(executed).toEqual(["read_page", "done"]);
    expect(result.terminal).toEqual({ success: true, summary: "完成" });
  });
});
```

- [ ] **Step 2: Run failing test**

Run: `npx vitest run tests/unit/core/tool-loop.test.ts`

Expected: FAIL because `tool-loop.ts` does not exist.

- [ ] **Step 3: Implement tool loop core**

Create `src/core/runtime/tool-loop.ts`:

```ts
import type { SerializableRecord } from "../architecture/serialization";
import type { ToolDefinition, ToolResult } from "../tools/tool";

export interface ToolCall {
  id: string;
  name: string;
  args: SerializableRecord;
}

export type ModelToolTurn =
  | { type: "tool_calls"; calls: ToolCall[] }
  | { type: "text"; text: string };

export interface ToolLoopInput {
  tools: ToolDefinition[];
  modelTurn(): Promise<ModelToolTurn>;
  executeTool(call: ToolCall): Promise<ToolResult>;
}

export interface ToolLoopResult {
  observations: Array<{ call: ToolCall; result: ToolResult }>;
  terminal?: { success: boolean; summary: string };
  text?: string;
}

export async function runToolLoopStep(input: ToolLoopInput): Promise<ToolLoopResult> {
  const turn = await input.modelTurn();
  if (turn.type === "text") return { observations: [], text: turn.text };

  const observations: ToolLoopResult["observations"] = [];
  let terminal: ToolLoopResult["terminal"];
  const toolNames = new Set(input.tools.map((tool) => tool.name));

  for (const call of turn.calls) {
    if (!toolNames.has(call.name)) {
      observations.push({ call, result: { success: false, observation: `Unknown tool ${call.name}`, error: `Unknown tool ${call.name}` } });
      continue;
    }
    const result = await input.executeTool(call);
    observations.push({ call, result });
    if (call.name === "done" && result.success) terminal = { success: true, summary: result.observation };
    if (call.name === "fail") terminal = { success: false, summary: result.error ?? result.observation };
  }

  return { observations, terminal };
}
```

- [ ] **Step 4: Wire with `AgentRuntime`**

Modify `src/core/runtime/agent-runtime.ts`:

- Add runtime setting `executionMode: "planner_commands" | "tool_loop" | "hybrid"`.
- In hybrid mode:
  - Try deterministic fast path first.
  - Use tool loop if active model supports tools.
  - Fall back to existing planner contract if model/tool streaming is unavailable.
- Emit `ToolCallStarted`, `ToolCallCompleted`, and `ToolCallFailed` events.

- [ ] **Step 5: Verify**

Run: `npx vitest run tests/unit/core/tool-loop.test.ts tests/unit/core/agent-runtime.test.ts tests/unit/core/streaming-client.test.ts`

Expected: PASS.

---

### Task 9: Stop, Abort, Resume, and Tombstone Lifecycle

**Files:**
- Create: `src/core/session/session-state-machine.ts`
- Create: `src/core/session/session-store.ts`
- Modify: `src/core/runtime/execution-controller.ts`
- Modify: `src/core/events/reducer.ts`
- Modify: `src/adapters/chrome/chrome-session-memory.ts`
- Modify: `src/background/index.ts`
- Modify: `src/sidepanel/runtime-subscription.ts`
- Test: `tests/unit/core/session-state-machine.test.ts`
- Test: `tests/unit/core/execution-controller.test.ts`
- Test: `tests/unit/adapters/chrome-session-memory.test.ts`

**Interfaces:**
- Produces: `SessionStatus`, `TaskStatus`, `transitionSession()`.
- Produces: task tombstone snapshot on every terminal path.
- Consumes: abort reasons from Task 1.

- [ ] **Step 1: Write lifecycle tests**

Add `tests/unit/core/session-state-machine.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { transitionSession } from "../../../src/core/session/session-state-machine";

describe("session state machine", () => {
  it("keeps session active after normal task completion", () => {
    expect(transitionSession({ status: "active" }, { type: "task_done" })).toEqual({ status: "active", taskStatus: "idle" });
  });

  it("marks running task as stopped after user stop", () => {
    expect(transitionSession({ status: "active", taskStatus: "running" }, { type: "task_stopped", reason: "user_stop" })).toEqual({
      status: "active",
      taskStatus: "stopped",
      lastStopReason: "user_stop"
    });
  });

  it("marks restart-interrupted task as paused", () => {
    expect(transitionSession({ status: "active", taskStatus: "running" }, { type: "worker_restarted" })).toEqual({
      status: "paused",
      taskStatus: "paused"
    });
  });
});
```

- [ ] **Step 2: Run failing test**

Run: `npx vitest run tests/unit/core/session-state-machine.test.ts`

Expected: FAIL because session state machine does not exist.

- [ ] **Step 3: Implement state machine**

Create `src/core/session/session-state-machine.ts`:

```ts
import type { RuntimeAbortReason } from "../architecture/boundaries";

export type SessionStatus = "active" | "paused" | "failed" | "archived";
export type TaskStatus = "idle" | "running" | "paused" | "stopped" | "failed";

export interface SessionRuntimeState {
  status: SessionStatus;
  taskStatus?: TaskStatus;
  lastStopReason?: RuntimeAbortReason;
  failureReason?: string;
}

export type SessionTransition =
  | { type: "task_started" }
  | { type: "task_done" }
  | { type: "task_failed"; reason: string }
  | { type: "task_stopped"; reason: RuntimeAbortReason }
  | { type: "worker_restarted" }
  | { type: "resume_requested" }
  | { type: "archive" };

export function transitionSession(state: SessionRuntimeState, transition: SessionTransition): SessionRuntimeState {
  switch (transition.type) {
    case "task_started":
      return { ...state, status: "active", taskStatus: "running", lastStopReason: undefined, failureReason: undefined };
    case "task_done":
      return { ...state, status: "active", taskStatus: "idle" };
    case "task_failed":
      return { ...state, status: "failed", taskStatus: "failed", failureReason: transition.reason };
    case "task_stopped":
      return { ...state, status: "active", taskStatus: "stopped", lastStopReason: transition.reason };
    case "worker_restarted":
      return state.taskStatus === "running" ? { ...state, status: "paused", taskStatus: "paused" } : state;
    case "resume_requested":
      return state.status === "paused" ? { ...state, status: "active", taskStatus: "running" } : state;
    case "archive":
      return { ...state, status: "archived" };
  }
}
```

- [ ] **Step 4: Fix execution stop propagation**

Modify `src/core/runtime/execution-controller.ts`:

- Own one `AbortController` per task.
- `stopTask()` aborts the current controller and appends `TaskStopped`.
- `run()` checks signal before and after model calls, tool execution, and settle waits.
- Terminal paths write a tombstone event/snapshot:
  - completed
  - failed
  - stopped
  - budget exceeded
  - model stream error
  - panel disconnect

- [ ] **Step 5: Add stop integration test**

Extend `tests/unit/core/execution-controller.test.ts`:

```ts
it("does not run another step after stop is requested", async () => {
  let steps = 0;
  const controller = new ExecutionController({
    sessionId: "s",
    taskId: "t",
    appendEvent: async () => undefined,
    runtime: {
      startTask: async () => undefined,
      runNextStep: async () => {
        steps += 1;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { status: "continue", stepId: `step_${steps}` };
      }
    }
  });

  const run = controller.run("long task");
  controller.stopTask({ reason: "user_stop" });
  const result = await run;

  expect(result.status).toBe("stopped");
  expect(steps).toBeLessThanOrEqual(1);
});
```

- [ ] **Step 6: Wire sidepanel visibility rehydrate**

Modify `src/sidepanel/runtime-subscription.ts`:

- On sidepanel mount/focus/visibilitychange, request session sync from background.
- Do not clear active session just because the panel was hidden.
- If a task is running, display current state from persisted events and live subscription.

- [ ] **Step 7: Verify**

Run: `npx vitest run tests/unit/core/session-state-machine.test.ts tests/unit/core/execution-controller.test.ts tests/unit/adapters/chrome-session-memory.test.ts`

Expected: PASS.

---

### Task 10: Overlay Separation and Non-Interfering Visual Debug Mode

**Files:**
- Create: `src/core/observation/debug-overlay-model.ts`
- Modify: `src/adapters/content/overlay-controller.ts`
- Modify: `src/shared/overlay-targets.ts`
- Modify: `src/sidepanel/main.ts`
- Modify: `src/sidepanel/state.ts`
- Test: `tests/unit/adapters/overlay-controller.test.ts`
- Test: `tests/unit/shared/overlay-targets.test.ts`

**Interfaces:**
- Produces: `DebugOverlayTarget`, `projectOverlayTargets(pageModel)`.
- Consumes: `PageModel` and hidden handles.
- Does not feed overlay labels back into model observation.

- [ ] **Step 1: Write overlay projection tests**

Add/extend `tests/unit/shared/overlay-targets.test.ts`:

```ts
it("keeps debug overlay labels out of model-facing handles", () => {
  const targets = projectOverlayTargets({
    controls: [{ semanticId: "control_1", role: "button", label: "客户管理", bounds: { x: 1, y: 2, width: 80, height: 32 } }]
  } as never);

  expect(targets[0]).toMatchObject({ label: "客户管理", debugOnly: true });
  expect(JSON.stringify(targets)).not.toContain("button - 客户管理 - 0.88");
});
```

- [ ] **Step 2: Implement debug overlay model**

Create `src/core/observation/debug-overlay-model.ts`:

```ts
export interface DebugOverlayTarget {
  id: string;
  label: string;
  bounds: { x: number; y: number; width: number; height: number };
  debugOnly: true;
}
```

- [ ] **Step 3: Update overlay controller**

Modify `src/adapters/content/overlay-controller.ts`:

- Only render when `overlayMode !== "Off"`.
- Render compact labels: index + role icon + short label.
- Never change page layout.
- Never add overlay DOM before model screenshot capture.
- Provide `clearOverlay()` and call it before any vision screenshot.

- [ ] **Step 4: Persist overlay settings**

Modify `src/sidepanel/main.ts` and `src/sidepanel/state.ts`:

- Use the existing general settings storage path.
- Save `overlayMode` immediately on change.
- Rehydrate on panel refresh.

- [ ] **Step 5: Verify**

Run: `npx vitest run tests/unit/adapters/overlay-controller.test.ts tests/unit/shared/overlay-targets.test.ts tests/unit/sidepanel/state.test.ts`

Expected: PASS.

---

### Task 11: Context Budget, Stale Observation Elision, and Runtime Metrics

**Files:**
- Create: `src/core/context/stale-observation-elision.ts`
- Modify: `src/core/context/budget.ts`
- Modify: `src/core/context/page-context-assembler.ts`
- Modify: `src/core/events/runtime-health.ts`
- Modify: `src/sidepanel/runtime-issue.ts`
- Test: `tests/unit/core/model-context.test.ts`
- Test: `tests/unit/core/runtime-health.test.ts`

**Interfaces:**
- Produces: `elideStaleObservations(history)`.
- Produces: runtime health metrics: `modelCallMs`, `observeMs`, `toolMs`, `settleMs`, `modelCalls`, `observationRounds`.
- Consumes: existing budget and runtime events.

- [ ] **Step 1: Write elision tests**

Add to `tests/unit/core/model-context.test.ts`:

```ts
it("elides old interactive indexes but keeps the latest one", () => {
  const history = [
    { role: "user", content: "<interactive_index total=\"100\">old</interactive_index>" },
    { role: "assistant", content: "ok" },
    { role: "user", content: "<interactive_index total=\"3\">latest</interactive_index>" }
  ];

  const elided = elideStaleObservations(history);

  expect(JSON.stringify(elided)).toContain("[stale interactive index elided");
  expect(JSON.stringify(elided)).toContain("latest");
  expect(JSON.stringify(elided)).not.toContain(">old<");
});
```

- [ ] **Step 2: Implement elision**

Create `src/core/context/stale-observation-elision.ts`:

```ts
export interface MessageLike {
  role: string;
  content: string;
}

export function elideStaleObservations<T extends MessageLike>(history: T[]): T[] {
  let latestIndex = -1;
  history.forEach((message, index) => {
    if (message.content.includes("<interactive_index")) latestIndex = index;
  });
  return history.map((message, index) => {
    if (index === latestIndex) return message;
    return {
      ...message,
      content: message.content.replace(/<interactive_index[\s\S]*?<\/interactive_index>/g, "[stale interactive index elided; re-read page if needed]")
    };
  });
}
```

- [ ] **Step 3: Add metrics to runtime health**

Modify `src/core/events/runtime-health.ts`:

- Aggregate durations by event correlation id.
- Flag:
  - `slow_observation` above 1200ms.
  - `slow_model_call` above 8000ms.
  - `too_many_model_calls_for_simple_task` when fast path could have handled the task.
  - `overlay_active_during_vision` if screenshot is requested while debug overlay is visible.

- [ ] **Step 4: Surface runtime issues**

Modify `src/sidepanel/runtime-issue.ts`:

- Render compact warnings in trace, not as blocking alerts.
- Include concrete remediation:
  - "关闭页面标记后重试视觉任务"
  - "该任务命中简单点击 fast path 失败，请下载日志"
  - "模型调用较慢，请检查 provider 或切换模型"

- [ ] **Step 5: Verify**

Run: `npx vitest run tests/unit/core/model-context.test.ts tests/unit/core/runtime-health.test.ts`

Expected: PASS.

---

### Task 12: Skills, Recording, Scratchpad, Files, and PDF Capability Contracts

**Files:**
- Create: `src/core/capabilities/skills.ts`
- Create: `src/core/capabilities/scratchpad.ts`
- Create: `src/core/capabilities/file-artifacts.ts`
- Create: `src/core/capabilities/pdf.ts`
- Modify: `src/core/capabilities/registry.ts`
- Modify: `src/core/tools/tool-registry.ts`
- Test: `tests/unit/core/capabilities.test.ts`

**Interfaces:**
- Produces: capability group contracts but does not require full UI implementation in this task.
- Consumes: progressive tool disclosure from Task 5.

- [ ] **Step 1: Write capability registry tests**

Add `tests/unit/core/capabilities.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { capabilityGroups } from "../../../src/core/capabilities/registry";

describe("capability registry", () => {
  it("declares optional capability groups without enabling them by default", () => {
    expect(capabilityGroups.map((group) => group.id)).toEqual(expect.arrayContaining(["skills", "scratchpad", "files", "pdf"]));
    expect(capabilityGroups.filter((group) => group.enabledByDefault).map((group) => group.id)).not.toContain("pdf");
  });
});
```

- [ ] **Step 2: Add capability contracts**

Create `src/core/capabilities/skills.ts`:

```ts
export interface SkillPackageSummary {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
}
```

Create `src/core/capabilities/scratchpad.ts`:

```ts
export interface ScratchpadRecord {
  id: string;
  collection: string;
  fields: Record<string, string | number | boolean | null>;
  evidence?: string;
}
```

Create `src/core/capabilities/file-artifacts.ts`:

```ts
export interface FileArtifact {
  id: string;
  filename: string;
  mime: string;
  size: number;
  createdAt: number;
}
```

Create `src/core/capabilities/pdf.ts`:

```ts
export interface PdfOutlineItem {
  title: string;
  page: number;
  level: number;
}
```

- [ ] **Step 3: Update capability registry**

Modify `src/core/capabilities/registry.ts`:

```ts
export interface CapabilityGroup {
  id: "core" | "vision" | "skills" | "scratchpad" | "files" | "pdf" | "schedule";
  enabledByDefault: boolean;
  description: string;
}

export const capabilityGroups: CapabilityGroup[] = [
  { id: "core", enabledByDefault: true, description: "Page observation and browser actions" },
  { id: "vision", enabledByDefault: false, description: "Screenshot and visual grounding" },
  { id: "skills", enabledByDefault: false, description: "Reusable user workflows" },
  { id: "scratchpad", enabledByDefault: false, description: "Durable structured extraction memory" },
  { id: "files", enabledByDefault: false, description: "Local file request and output artifacts" },
  { id: "pdf", enabledByDefault: false, description: "PDF outline, search, and reading tools" },
  { id: "schedule", enabledByDefault: false, description: "Recurring browser Agent tasks" }
];
```

- [ ] **Step 4: Verify**

Run: `npx vitest run tests/unit/core/capabilities.test.ts tests/unit/core/tool-registry.test.ts`

Expected: PASS.

---

### Task 13: Evaluation Fixtures and Performance Guardrails

**Files:**
- Create: `tests/fixtures/pages/crm-sidebar.html`
- Create: `tests/fixtures/pages/iframe-form.html`
- Create: `tests/fixtures/pages/rich-editor.html`
- Create: `tests/unit/core/page-atlas-fixtures.test.ts`
- Create: `tests/unit/core/performance-guardrails.test.ts`
- Modify: `tests/unit/adapters/dom-observer.test.ts`
- Modify: `tests/unit/core/agent-speed-paths.test.ts`

**Interfaces:**
- Produces reproducible fixtures for sidebar menus, iframe forms, rich editors, and exact-click fast paths.
- Consumes atlas and fast path modules from earlier tasks.

- [ ] **Step 1: Add CRM sidebar fixture**

Create `tests/fixtures/pages/crm-sidebar.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <body>
    <aside class="sidebar">
      <ul class="el-menu">
        <li class="el-sub-menu">
          <div class="el-sub-menu__title" aria-expanded="false">客户管理</div>
          <ul hidden>
            <li class="el-menu-item">客户列表</li>
          </ul>
        </li>
        <li class="el-sub-menu">
          <div class="el-sub-menu__title" aria-expanded="false">采购管理</div>
        </li>
      </ul>
    </aside>
    <main>
      <section>
        <h1>数据中心</h1>
        <button>新建客户</button>
      </section>
    </main>
  </body>
</html>
```

- [ ] **Step 2: Add fixture test**

Create `tests/unit/core/page-atlas-fixtures.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { observePage } from "../../../src/adapters/content/dom-observer";
import { readFileSync } from "node:fs";

describe("page atlas fixtures", () => {
  it("classifies CRM sidebar customer management as a navigation control", () => {
    document.documentElement.innerHTML = readFileSync("tests/fixtures/pages/crm-sidebar.html", "utf8");
    const page = observePage(document, { mode: "atlas" });
    const serialized = JSON.stringify(page);

    expect(serialized).toContain("客户管理");
    expect(serialized).toContain("menuitem");
    expect(serialized).not.toContain("button - 客户管理 - 0.88");
  });
});
```

- [ ] **Step 3: Add performance guardrail test**

Create `tests/unit/core/performance-guardrails.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { detectFastPath } from "../../../src/core/runtime/fast-paths";

describe("performance guardrails", () => {
  it("simple exact sidebar click is eligible for no-model execution", () => {
    const fast = detectFastPath({
      taskText: "点击客户管理",
      pageUrl: "https://crm.example.test/",
      actionMemory: [],
      controls: [
        { semanticId: "control_0_menuitem_customer", role: "menuitem", label: "客户管理", accessibleName: "客户管理", visibility: "visible", disabled: false, confidence: 0.95, interactionHints: [], locatorHints: [], bounds: { x: 10, y: 80, width: 120, height: 40 } }
      ]
    });

    expect(fast?.source).toBe("exact_visible_control");
  });
});
```

- [ ] **Step 4: Verify**

Run: `npx vitest run tests/unit/core/page-atlas-fixtures.test.ts tests/unit/core/performance-guardrails.test.ts`

Expected: PASS.

---

### Task 14: Migration, Version Bump, and Documentation Update

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `public/manifest.json`
- Modify: `naturalclick-extension/manifest.json`
- Modify: `README.zh-CN.md`
- Modify: `README.md`
- Create: `docs/superpowers/specs/2026-07-07-universal-agent-browser-upgrade.md`
- Test: `tests/unit/build/manifest.test.ts`

**Interfaces:**
- Produces migration notes and user-facing docs.
- Consumes all changed settings/session/model schemas.

- [ ] **Step 1: Add manifest/version test**

Extend `tests/unit/build/manifest.test.ts`:

```ts
it("keeps package and extension manifest versions aligned", async () => {
  const pkg = JSON.parse(await fs.promises.readFile("package.json", "utf8"));
  const manifest = JSON.parse(await fs.promises.readFile("public/manifest.json", "utf8"));
  expect(manifest.version).toBe(pkg.version);
});
```

- [ ] **Step 2: Bump version**

Increment `package.json` from the current version to the next patch version. Mirror the same value in:

- `package-lock.json`
- `public/manifest.json`
- `naturalclick-extension/manifest.json`

- [ ] **Step 3: Add upgrade spec**

Create `docs/superpowers/specs/2026-07-07-universal-agent-browser-upgrade.md` with:

- Architecture summary.
- User-facing behavior changes.
- Model configuration storage migration.
- Overlay behavior changes.
- Stop/resume guarantees.
- Performance expectations.
- Known limitations.

- [ ] **Step 4: Update README**

Modify README files to include:

- Fast execution path.
- Page Atlas / hidden handles.
- Model configuration center.
- Debug overlay default-off behavior.
- How to download diagnostic logs.

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npx vitest run tests/unit/build/manifest.test.ts && npm run build`

Expected: PASS.

---

## Cross-Task Acceptance Criteria

- Simple low-risk commands such as "点击客户管理" complete without a planner model call when one exact visible control exists.
- A page can be observed in atlas mode without visible markers being injected.
- Vision screenshots are captured after debug overlay is cleared.
- The sidepanel remains usable after browser focus changes, panel refresh, extension reload, and service worker restart.
- Stop aborts model streaming, tool execution, action settle, CDP sessions, and the controller loop.
- Model provider/instance/model configuration persists after sidepanel refresh.
- Page marker settings persist and default to non-interfering behavior.
- Runtime logs expose enough detail to diagnose slow observation, slow model calls, repeated binding failures, and stop propagation.
- The implementation remains general-purpose and contains no CRM-specific logic outside fixtures/tests.

## Self-Review Checklist

- Spec coverage: every user-requested area is represented by a task: UI/workbench, model configuration, page element recognition, click/input speed, hidden markers, stop/lifecycle, settings persistence, capability expansion, and eval/performance.
- Placeholder scan: no banned placeholder phrases or open-ended test instructions remain.
- Type consistency: model config uses `ModelInstance` / `ModelRuntimeConfig`; observation uses `PageAtlas` / `InteractiveElementRecord`; execution uses `ToolDefinition` / `ToolResult`.
- Architecture consistency: Agent Core owns domain types and decisions; adapters own Chrome/DOM/CDP/storage details.
- UI primitive check: sidepanel plan bans browser dialogs and unstyled native selects for product UI.
