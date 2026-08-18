# NaturalClick Design Pattern Refactor Detailed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 NaturalClick 改造成通用型浏览器操作 Agent：识别稳定、简单操作快速、停止可彻底取消、配置和会话可恢复、侧边栏体验接近 Pie 的工作台质感，但内部架构保持 NaturalClick 自己的边界。

**Architecture:** 保持 TypeScript Chrome MV3 扩展和现有 hexagonal architecture。`src/core/**` 只放领域规则、状态机、命令、观察模型、执行策略和事件；`src/adapters/**` 只接 Chrome、DOM、CDP、storage、model API 等外部现实；`src/sidepanel/**` 只负责 view model、DOM render 和交互绑定。用 bounded context、ports and adapters、command pattern、strategy pattern、repository pattern、state machine、presenter/view-model、anti-corruption layer 做系统性改造。

**Tech Stack:** TypeScript, Chrome Manifest V3, Vite, Vitest + jsdom, DOM-rendered side panel, Chrome storage, OpenAI-compatible model APIs, Page Atlas, optional CDP input adapter, existing NaturalClick core/adapters/sidepanel modules.

## Global Constraints

- NaturalClick 是通用浏览器操作 Agent，不写 CRM 专属选择器、菜单文案、URL、截图坐标或恢复规则。
- 借鉴 Pie 的交互和工程思路，不迁移到 React，不复制 Pie 的组件命名、存储 key、daemon 假设或 `data-pie-*` 语义。
- 页面识别和执行不能依赖可见标记；可见 overlay 只用于调试和用户理解。
- Vision 截图前必须清理可见 debug overlay，避免标记干扰视觉模型。
- 明确 URL 跳转、单个精确可见低风险控件点击、明确绑定的简单表单动作必须优先走 fast path，不能每次都先调用 planner 模型。
- Stop 必须取消 model streaming、runtime loop、tool loop、action settle、content primitive、CDP session、queued continuation 和 panel resume work。
- 新建会话、关闭/打开侧边栏、刷新侧边栏、浏览器切后台再回来、service worker restart，都不能静默丢配置、活动会话元数据或未发送输入。
- API key 不得进入日志、trace、下载文件、prompt、DOM snapshot、截图、测试 fixture。
- 每个有意义的运行时状态变化都必须写入或能由 `AgentEvent` 还原。
- 侧边栏所有新增控件必须有 accessible label、键盘可达、可见 focus state，并在 360px 宽度不截断。
- Sidepanel UI 禁止 `alert()`, `confirm()`, `prompt()`, `<select>` 作为唯一自定义控件方案, `outline: none`, `transition: all`。
- 改运行时代码、扩展行为或可见 UI 时必须同步提升 `package.json`, `package-lock.json`, `public/manifest.json`, `naturalclick-extension/manifest.json` 版本号。
- 不回滚已有未提交改动；每个任务只触碰自己列出的文件。

---

## Reference Baseline

### NaturalClick 当前资产

- Runtime: `src/core/runtime/agent-runtime.ts`, `src/core/runtime/execution-controller.ts`, `src/core/runtime/fast-paths.ts`, `src/core/runtime/tool-loop.ts`, `src/core/runtime/execution-budget.ts`.
- Observation: `src/core/observation/page-model.ts`, `src/core/observation/page-atlas.ts`, `src/core/observation/interactive-index.ts`, `src/adapters/content/dom-observer.ts`, `src/adapters/content/page-node-index.ts`.
- Commands and tools: `src/core/commands/commands.ts`, `src/core/commands/binder.ts`, `src/core/tools/tool.ts`, `src/core/tools/tool-registry.ts`, `src/core/tools/page-tools.ts`, `src/core/tools/browser-tools.ts`.
- Sidepanel: `src/sidepanel/render.ts`, `src/sidepanel/main.ts`, `src/sidepanel/state.ts`, `src/sidepanel/view-model.ts`, `src/sidepanel/settings.ts`, `src/sidepanel/components/workbench.ts`, `public/sidepanel.css`.
- Model config: `src/core/model/model-instance.ts`, `src/core/model/model-config-service.ts`, `src/core/model/model-registry.ts`, `src/adapters/chrome/model-config-store.ts`, `src/adapters/model/openai-compatible-client.ts`.
- Session and events: `src/core/session/session-state-machine.ts`, `src/core/session/session-store.ts`, `src/core/events/events.ts`, `src/core/events/reducer.ts`, `src/adapters/chrome/chrome-session-memory.ts`, `src/adapters/chrome/chrome-storage-event-store.ts`.
- Existing tests: `tests/unit/core/**`, `tests/unit/adapters/**`, `tests/unit/sidepanel/**`, `tests/unit/shared/**`, `tests/unit/build/manifest.test.ts`.

### Pie 参考点

Reference repo: `WiseriaAI/pie-ai-agent`, inspected commit `ff10ac7`.

值得吸收：

- `src/sidepanel/App.tsx`: 顶层拥有 session hook，使 Chat 切换到 Settings 时后台连接仍存活。
- `src/sidepanel/components/Chat.tsx`: bottom composer、model picker、context ring、pending instruction list、step group、pinned tab、file/quote/skill chips 的组合方式。
- `src/sidepanel/components/Settings.tsx`: Configs/Skills/Search/General 的清晰设置中心，以及 provider instance 列表、wizard、connection test。
- `src/lib/agent/loop.ts`: tool disclosure、active tool groups、abort signal、session snapshots、stale observation elision、token budget、CDP gating。
- `src/lib/dom-actions/**`: DOM probe/act 分离，几何、可交互元素、wait/settle、editor action 独立测试。
- `src/__tests__/cross-layer/**`: 跨层测试覆盖 read page、probe-act、abort-resume、CDP routing、PDF、mid-task instruction。

不应照抄：

- 不引入 React 作为本轮改造前提。
- 不依赖 Pie 的 local daemon/native host。
- 不把 Pie 的 provider schema、session schema、CSS class、storage key 泄漏到 NaturalClick core。
- 不把功能堆进一个巨大的 Chat 组件；NaturalClick 继续保持 core/adapters/sidepanel 分层。

---

## Design Pattern Map

### Bounded Contexts

- `Workbench UI`: 顶栏、会话抽屉、聊天流、composer、模型选择器、设置中心、运行报告。
- `Model Config`: provider instance、模型池、能力标签、运行时选择、连接测试、持久化。
- `Observation`: page identity、Page Atlas、Interactive Index、hidden handles、evidence slice。
- `Target Binding`: semantic command 到 stable handle、候选排序、歧义诊断。
- `Execution`: fast path、planner turn、tool loop、browser primitive、settle、verification。
- `Session Lifecycle`: active session、新建会话、stop、pause/resume、rehydrate、tombstone。
- `Overlay And Vision Hygiene`: debug overlay、highlight、marker 配置、clean screenshot。
- `Runtime Health`: 慢 observation、慢 model、重复模型调用、stop 未完成、配置失效、日志导出。
- `Capabilities`: skills、search、file artifacts、PDF、schedules 的可选能力面。

### Dependency Rules

```text
src/core/**        -> framework-free domain and use cases
src/adapters/**    -> Chrome, DOM, CDP, storage, model implementations
src/background/**  -> extension service worker composition root
src/content/**     -> content script composition root
src/sidepanel/**   -> view model, render, handlers, UI state
public/**          -> static extension assets
```

Forbidden imports:

```text
src/core/** -> chrome.*
src/core/** -> document/window/HTMLElement
src/core/** -> src/sidepanel/**
src/core/** -> public/**
src/sidepanel/view-model.ts -> DOM APIs
src/sidepanel/state.ts -> Chrome APIs
```

### Ports And Adapters Shape

```ts
export interface PageObservationPort {
  observePage(request?: NeedMoreObservationRequest, options?: ObservePageRuntimeOptions): Promise<PageModel>;
}

export interface BrowserActionPort {
  execute(primitive: BrowserPrimitive, signal?: AbortSignal): Promise<PrimitiveResult>;
}

export interface SessionRepository {
  loadActive(): Promise<SessionSnapshot | undefined>;
  saveActive(snapshot: SessionSnapshot): Promise<void>;
  markStopped(taskId: string, reason: RuntimeAbortReason): Promise<void>;
}

export interface RuntimeSettingsRepository {
  load(): Promise<RuntimeSettingsSnapshot>;
  save(snapshot: RuntimeSettingsSnapshot): Promise<void>;
}
```

Core 消费接口，Chrome/DOM/CDP/storage/model 在 adapters 实现。

---

## System Diagnosis

### 1. 页面元素标记影响视觉模型

症状：可见 overlay 画出编号、边框和 verbose label，例如 `button - 客户管理 - 0.88`，会遮挡页面内容，导致后续视觉模型把标记当页面真实 UI。

根因边界：`Overlay And Vision Hygiene` 和 `Observation` 混在一起。debug marker 是展示层，却被用户和模型同时看到。

目标设计：Observation 输出 hidden handles、Page Atlas、Interactive Index；overlay 从这些记录投影出短 marker。Vision capture 前调用 overlay clear hook，截图结束后按用户配置恢复。

### 2. 识别按钮和点击慢

症状：简单“点击某按钮/打开某菜单”也像全程模型识别，体感明显慢。

根因边界：`Execution` 没有把 deterministic fast path、planner model、tool loop 三个层级严格分流；observation 也可能重复做全量扫描。

目标设计：先观察轻量 atlas，再检测 URL/精确控件 fast path；只有歧义、风险或多步骤任务才进入 planner。每轮记录 `modelCalls`, `observationRounds`, `fastPathSource`, `elapsedMs`，由 runtime health 报警。

### 3. Stop 没有完全停止

症状：点停止后模型或后续动作仍继续。

根因边界：Stop 只改了 controller 状态，没有成为跨 model stream、tool loop、content action、CDP session、queued continuation 的同一 cancel token。

目标设计：每个 task 拥有 `AbortController` 和 durable tombstone。所有 await 后检查 signal；background 拒绝 stopped task 的 continuation；CDP session 用 owner token 懒 attach 并在 abort 时 detach。

### 4. 新建会话和侧栏重开恢复不一致

症状：新建会话后关闭/打开插件，仍可能回到历史会话；浏览器切到其他应用再回来，插件对话消失。

根因边界：`Session Lifecycle` 中 active session、fresh session marker、panel local view state、service worker live state 没有统一持久化和恢复规则。

目标设计：active session 与 fresh marker 由 repository 持久化；panel mount 时先 rehydrate，再订阅事件；新建会话写入 tombstone/fresh marker 并清掉历史 view selection。

### 5. 配置刷新后被还原

症状：保存“页面标记”等设置后刷新插件被旧值覆盖。

根因边界：general settings、model settings、runtime settings 的 store、state decode、handler save 入口不统一。

目标设计：所有设置都走 repository；state 只保存 draft；保存成功后由 store event 回填；版本化 decode 能迁移旧值，不能用 default 覆盖合法存储。

---

## Implementation Task Graph

这些任务是完整一次性计划，不按产品阶段切分。实现时可以按依赖顺序推进，也可以用子代理并行处理没有共享文件冲突的任务。

Recommended dependency order:

```text
Task 1 -> Task 2 -> Task 3
Task 1 -> Task 4 -> Task 5 -> Task 6
Task 1 -> Task 7 -> Task 8 -> Task 9
Task 1 -> Task 10 -> Task 11
Task 2 -> Task 12
Task 4/7/10 -> Task 13
All tasks -> Task 14
```

## Detailed Refactor Blueprint By Bounded Context

这一节把“每一个地方怎么改”落到代码设计模式、文件责任和验收信号。实现时不要把它当成额外阶段；它是下面 14 个任务的架构约束。

### 1. Workbench UI

**Primary pattern:** Presenter/ViewModel, Component Composition, Anti-Corruption Layer.

**目标结构：**

```text
src/sidepanel/main.ts
  -> 处理 Chrome runtime/localStorage 事件，转成 SidepanelState action
src/sidepanel/state.ts
  -> decode/encode state，处理 view transition，不碰 DOM/Chrome
src/sidepanel/view-model.ts
  -> 将 SidepanelState + AgentEvent[] 投影成 WorkbenchViewModel
src/sidepanel/render.ts
  -> 只组装组件和绑定 handler，不做业务判断
src/sidepanel/components/*
  -> topbar/composer/transcript/settings/session drawer 的 DOM 组件
```

**必须拆开的判断：**

- `render.ts` 不能直接分析 `AgentEvent` 来决定运行状态；状态归 `view-model.ts`。
- `render.ts` 不能验证模型配置；验证归 `settings.ts` 和 `model-config-service.ts`。
- `main.ts` 不能直接拼 DOM；它只负责事件、持久化和 runtime message。
- Pie 参考只允许影响布局和交互质量，不允许把 Pie 的组件名、storage key、React hooks 迁入 NaturalClick core。

**具体改造点：**

- `topbar.ts` 输出稳定的历史、日程、设置、主题、新建会话按钮。新建会话按钮在常规侧边栏宽度显示 `+` 图标和短文本；极窄宽度才退化为纯图标。
- `composer.ts` 分离 Send、Stop、Queue、Tools、Model Picker、Context Ring。运行中 Stop 必须是明确主操作；输入框内容非空时才显示 Queue 语义。
- `transcript.ts` 把 task summary、model stream、tool events、verification、issue hint 渲染成可扫描的事件流。
- `settings-center.ts` 使用 tablist 管理 Configs/Skills/Search/General；不要把模型配置、页面标记、运行预算塞进一条长表单。
- `session-drawer.ts` 独立管理历史列表、当前会话详情、删除确认和日志下载；不能让历史 view 覆盖 active chat 状态。

**UI 质量验收：**

- 360px 宽度下按钮文案不溢出、不重叠、不靠负 letter-spacing 解决。
- 所有 icon button 有 `aria-label`，所有 popover 有 `role="dialog"` 或明确 label。
- 焦点态可见；禁用 `outline: none` 和 `transition: all`。
- 不使用页面内说明文字解释功能；交互本身要直观。

### 2. Model Config

**Primary pattern:** Repository Pattern, Value Object, Service Layer.

**目标结构：**

```text
src/core/model/model-instance.ts
  -> ProviderId, ModelInstance, ModelCapability, ModelSelection value objects
src/core/model/model-registry.ts
  -> 内置 provider 默认值和 capability hints
src/core/model/model-config-service.ts
  -> create/update/delete/test/select/resolve runtime config use cases
src/adapters/chrome/model-config-store.ts
  -> Chrome/local storage migration, masked export, detected model cache
src/adapters/model/openai-compatible-client.ts
  -> 只消费 resolve 后的 runtime config，支持 AbortSignal
src/sidepanel/settings.ts
  -> draft form 转 service input，显示 validation result
```

**必须隔离的数据：**

- `apiKey` 只能存在于受控 store 和 runtime request 中。
- `AgentEvent`、下载日志、DOM snapshot、prompt context、截图元数据只允许出现 `apiKeyRef` 或 `hasApiKey`。
- 检测模型列表要带 timestamp 和 provider id，避免多个 provider 的缓存串线。

**具体改造点：**

- 旧的单 provider 配置迁移成一个默认 `ModelInstance`。
- 保存配置时走 `ModelConfigService.saveDraft()`，成功后重新从 repository load，避免 UI draft 覆盖存储值。
- 模型选择器读取 active model selection，不直接读表单输入。
- 检测模型失败要返回 typed error：`missing_api_key`, `http_error`, `empty_models`, `invalid_response`, `aborted`。

**验收信号：**

- 刷新侧边栏后 provider、planner、vision、页面标记、运行预算都保持保存后的值。
- 单测证明 redaction 后日志里没有 raw key、Authorization header、token、secret。

### 3. Observation And Target Binding

**Primary pattern:** Strategy Pattern, Value Object, Information Hiding.

**目标结构：**

```text
dom-observer.ts
  -> 从真实 DOM 采集语义、可见性、bounds、region、form context
page-node-index.ts
  -> 给真实节点维护 hidden handle，不改变视觉
page-model.ts
  -> 定义 PageModel/ControlCandidate/EvidenceSlice 等纯数据
page-atlas.ts
  -> 压缩页面结构，给 planner 和 fast path 使用
interactive-index.ts
  -> 对候选控件排序和解释分数
commands/binder.ts
  -> semantic command -> stable handle/browser primitive
```

**识别顺序：**

1. handle 精确命中。
2. role + accessible name + visible text 精确命中。
3. region/section 限定后的 fuzzy 命中。
4. 请求更窄的 observation slice。
5. 返回 ambiguity diagnostics 给 runtime，而不是盲点。

**具体改造点：**

- 菜单、侧边栏项、tab、按钮、链接、图标按钮、输入框、组合框、contenteditable 都是 first-class candidate。
- `expandedState`、`disabled`、`covered`、`offscreen`、`regionRef` 参与排序。
- 可见 overlay 的编号和文案不能进入 `ControlCandidate.label`，只能作为 debug projection。
- `NeedMoreObservationRequest` 要能指定 target hint、region hint、mode 和 candidate limit。

**验收信号：**

- 相似文案的页面返回 ranked candidates，错误消息包含候选差异，而不是 “Multiple controls match” 后停住。
- 关闭页面标记后，识别与点击仍然通过 hidden handle 工作。
- 简单侧栏菜单展开不需要视觉模型，也不需要 planner 重试。

### 4. Execution, Fast Path, And Planner Gating

**Primary pattern:** Chain of Responsibility, Command Pattern, Strategy Pattern.

**目标结构：**

```text
fast-paths.ts
  -> deterministic decision chain
agent-runtime.ts
  -> orchestrates interpret -> observe -> fast path/planner -> execute -> verify
commands/commands.ts
  -> SemanticCommand and BrowserPrimitive contracts
commands/binder.ts
  -> command binding, ambiguity diagnostics
tool-loop.ts
  -> model tool calls only when planner is needed
execution-budget.ts
  -> max step/model/observation/failure policy
```

**执行分流：**

```text
User task
  -> explicit URL? navigate without planner
  -> exact low-risk visible control? bind and execute without planner
  -> exact one-field fill? bind and execute without planner
  -> ambiguous/risky/multi-step? planner + tool loop
```

**必须记录的事件：**

- `FastPathSelected`
- `FastPathRejected`
- `ModelCallStarted`
- `ModelCallCompleted`
- `CommandBound`
- `CommandResultReceived`
- `VerificationProduced`

**验收信号：**

- exact click fast path 的单测断言 `modelCalls === 0`。
- fast path 被拒绝时，事件里能看到拒绝原因，如 `ambiguous_candidates`, `destructive_action`, `target_hidden`, `needs_multistep_plan`。
- 复杂任务进入 planner 时，上下文经过 stale observation elision，避免把旧页面状态反复塞给模型。

### 5. Tool Loop And Capability Disclosure

**Primary pattern:** Registry, Progressive Disclosure, Budgeted Loop.

**目标结构：**

```text
tool.ts
  -> ToolDefinition/ToolCall/ToolResult contracts
tool-registry.ts
  -> tool groups and active disclosure policy
page-tools.ts
  -> read_page, find_target, read_target, read_structure
browser-tools.ts
  -> click, type, select, scroll, wait, done, fail
capabilities/registry.ts
  -> optional feature gates for search/files/skills/schedule/pdf
```

**默认工具集：**

- 默认只暴露 page + browser 的小集合。
- Search/File/Skill/Schedule/PDF 只有用户意图或模型明确需要时才通过 disclosure 打开。
- Tool result 必须短、结构化、可被日志 redaction。

**验收信号：**

- 简单点击任务的 planner context 不包含 heavyweight tools。
- 每个 tool 执行前后检查 `AbortSignal`。
- 停止后的 queued tool call 被拒绝，并产生 `RuntimeContinuationRejected`。

### 6. Primitive Executor And Input Adapters

**Primary pattern:** Adapter Pattern, Strategy Pattern, Null Object.

**目标结构：**

```text
primitive-executor.ts
  -> DOM click/type/select/scroll/focus/keyboard primitives
action-settle.ts
  -> navigation/mutation/paint/idle wait policies
cdp-session.ts
  -> optional lazy attach/detach with owner token
cdp-input.ts
  -> trusted mouse/keyboard fallback
background/index.ts
  -> chooses adapter and owns per-task abort controller
```

**执行原则：**

- 先按 hidden handle 执行，再考虑坐标 fallback。
- 坐标 fallback 必须有 bounds、viewport、occlusion 信息，且事件里记录原因。
- CDP 是可选 fallback，不是默认路径；冲突或权限失败时回到 DOM executor 或报告可解释错误。
- `action-settle.ts` 返回 elapsed、trigger、mutation count、navigation detected，供 runtime health 使用。

**验收信号：**

- 菜单展开等待 `aria-expanded`、子项可见、mutation 或 route change 中任一明确信号。
- contenteditable 和常见富文本输入有独立 fixture。
- abort during settle 立即停止，不执行下一步。

### 7. Session Lifecycle And Stop Semantics

**Primary pattern:** State Machine, Repository Pattern, Cancellation Token.

**目标结构：**

```text
session-state-machine.ts
  -> legal transitions
session-store.ts
  -> active session/history/tombstone repository contract
chrome-session-memory.ts
  -> adapter persistence and migration
execution-controller.ts
  -> task generation, abort signal, budget, stop tombstone
runtime-subscription.ts
  -> sidepanel rehydrate and event subscription
background/index.ts
  -> reject stale continuations
```

**状态规则：**

- `running -> stopping -> stopped` 是正常用户停止路径。
- `running -> paused` 只用于 service worker restart 或 runtime suspend。
- `stopped` 是 terminal，不能自动 resume。
- `completed`、`failed`、`stopped` 都要阻止 queued continuation。

**验收信号：**

- Stop 写 tombstone 早于 downstream abort。
- 模型 streaming、tool loop、settle、CDP 都能收到同一个 task signal。
- 新建会话写 fresh active snapshot；关闭再打开插件仍看到新会话，而不是历史详情。
- 浏览器切出再回来，sidepanel mount 先 rehydrate active session，再渲染历史。

### 8. Overlay And Vision Hygiene

**Primary pattern:** Adapter Isolation, Policy Object.

**目标结构：**

```text
debug-overlay-model.ts
  -> convert candidates/evidence to debug-only overlay targets
overlay-controller.ts
  -> draw/remove overlay root
overlay-targets.ts
  -> shared mapping and short label policy
vision.ts
  -> screenshot capture contract with overlay hidden
```

**可见标记规则：**

- 默认不显示长 label、role chain、confidence。
- `Off` 删除 overlay root；不是透明隐藏。
- `Focus` 只高亮当前 target 或当前证据。
- `All targets` 是调试模式，不能作为 vision 或 execution 的输入。

**验收信号：**

- Vision capture 测试证明 overlay clear -> capture -> restore 顺序。
- 页面上看不到 `button - 客户管理 - 0.88` 这类遮挡文案。
- hidden handles 不受 overlay 开关影响。

### 9. Runtime Health, Diagnostics, And Logs

**Primary pattern:** Observer, Reducer, Fitness Function.

**目标结构：**

```text
events.ts
  -> event vocabulary and payload contracts
reducer.ts
  -> derive task/session state from events
runtime-health.ts
  -> warnings and performance metrics
runtime-issue.ts
  -> user-readable sidepanel issue view model
```

**必须诊断的问题：**

- 简单任务触发 planner model。
- observation 超时或 candidate 过多。
- action settle 超时。
- stop 超时或 continuation 未拒绝。
- vision capture 时 overlay 可见。
- 配置保存失败或刷新后回退。

**验收信号：**

- 下载日志含 runtime metrics 和 redacted payload。
- sidepanel issue 文案告诉用户发生了什么、为什么影响执行、能采取什么动作。
- 性能 guardrail 测试把“点击慢了”变成可失败的测试，而不是体感反馈。

### 10. Release, Version, And Verification

**Primary pattern:** Release Fitness Function.

**每次行为/UI 改动的固定流程：**

1. 先写或更新目标单测。
2. 实现最小改动。
3. 运行 targeted tests。
4. 运行 `npm run typecheck`。
5. 运行 `npm run test:unit`。
6. 运行 `npm run build`。
7. 同步 bump `package.json`, `package-lock.json`, `public/manifest.json`, `naturalclick-extension/manifest.json`。
8. 扫描 UI 反模式。
9. 清理临时仓库、截图、dev server。

**固定扫描命令：**

```bash
rg -n "alert\\(|confirm\\(|prompt\\(|window\\.alert|window\\.confirm|window\\.prompt|<select\\b|outline\\s*:\\s*none|outline-none|transition\\s*:\\s*all" src/sidepanel public/sidepanel.css naturalclick-extension/sidepanel.css tests/unit/sidepanel tests/visual
```

## File-by-File Ownership Matrix

| Area | File | Owner Responsibility | Pattern | Regression Test |
| --- | --- | --- | --- | --- |
| UI | `src/sidepanel/main.ts` | Runtime message binding, local event handlers, persistence commands | Application Controller | `tests/unit/sidepanel/state.test.ts` |
| UI | `src/sidepanel/state.ts` | State decode, transitions, persisted view state | State Machine | `tests/unit/sidepanel/state.test.ts` |
| UI | `src/sidepanel/view-model.ts` | Pure projection into render props | Presenter/ViewModel | `tests/unit/sidepanel/view-model.test.ts` |
| UI | `src/sidepanel/render.ts` | DOM composition only | Composition Root | `tests/unit/sidepanel/render.test.ts` |
| UI | `src/sidepanel/components/topbar.ts` | Header actions and status | Component Composition | `tests/unit/sidepanel/render.test.ts` |
| UI | `src/sidepanel/components/composer.ts` | Input, tools, model picker, send/stop/queue | Component Composition | `tests/unit/sidepanel/render.test.ts` |
| UI | `src/sidepanel/components/transcript.ts` | Chat/task timeline and model stream | Component Composition | `tests/unit/sidepanel/render.test.ts` |
| UI | `src/sidepanel/components/settings-center.ts` | Settings tabs and panels | Component Composition | `tests/unit/sidepanel/settings.test.ts` |
| UI | `src/sidepanel/components/session-drawer.ts` | History drawer and active session controls | Component Composition | `tests/unit/sidepanel/render.test.ts` |
| UI | `public/sidepanel.css` | Design tokens, responsive layout, focus states | Design System Tokens | anti-pattern scan |
| Model | `src/core/model/model-instance.ts` | Provider/model/capability value objects | Value Object | `tests/unit/core/model-config-service.test.ts` |
| Model | `src/core/model/model-registry.ts` | Built-in provider defaults | Registry | `tests/unit/core/model-config-service.test.ts` |
| Model | `src/core/model/model-config-service.ts` | Save/test/select/resolve model use cases | Service Layer | `tests/unit/core/model-config-service.test.ts` |
| Model | `src/adapters/chrome/model-config-store.ts` | Persist config, migrate, redact export | Repository Adapter | `tests/unit/adapters/model-config-store.test.ts` |
| Model | `src/adapters/model/openai-compatible-client.ts` | Stream/model request with abort and redaction | Gateway Adapter | `tests/unit/core/openai-compatible.test.ts` |
| Observation | `src/core/observation/page-model.ts` | Canonical page data model | Value Object | `tests/unit/core/page-atlas.test.ts` |
| Observation | `src/core/observation/page-atlas.ts` | Compact structural page summary | Strategy | `tests/unit/core/page-atlas.test.ts` |
| Observation | `src/core/observation/interactive-index.ts` | Candidate ranking and explanation | Strategy | `tests/unit/core/interactive-index.test.ts` |
| Observation | `src/adapters/content/dom-observer.ts` | DOM semantics collection | Adapter | `tests/unit/adapters/dom-observer.test.ts` |
| Observation | `src/adapters/content/page-node-index.ts` | Stable hidden handle lookup | Repository Adapter | `tests/unit/adapters/page-node-index.test.ts` |
| Context | `src/core/context/page-context-assembler.ts` | Compact planner context | Builder | `tests/unit/core/observation-evidence.test.ts` |
| Context | `src/core/context/stale-observation-elision.ts` | Remove stale snapshots | Strategy | `tests/unit/core/agent-runtime.test.ts` |
| Commands | `src/core/commands/commands.ts` | Semantic command contracts | Command Pattern | `tests/unit/core/model-contracts.test.ts` |
| Commands | `src/core/commands/binder.ts` | Bind command to target primitive | Chain of Responsibility | `tests/unit/core/commands-binder.test.ts` |
| Runtime | `src/core/runtime/fast-paths.ts` | Deterministic no-model paths | Strategy Chain | `tests/unit/core/agent-speed-paths.test.ts` |
| Runtime | `src/core/runtime/agent-runtime.ts` | Orchestration and event emission | Use Case Interactor | `tests/unit/core/agent-runtime.test.ts` |
| Runtime | `src/core/runtime/tool-loop.ts` | Bounded model tool loop | Budgeted Loop | `tests/unit/core/tool-loop.test.ts` |
| Runtime | `src/core/runtime/execution-controller.ts` | Task generation, abort, budget | State Machine | `tests/unit/core/execution-controller.test.ts` |
| Runtime | `src/core/runtime/execution-budget.ts` | Runtime limits and presets | Policy Object | `tests/unit/core/execution-budget.test.ts` |
| Tools | `src/core/tools/tool-registry.ts` | Tool groups and disclosure | Registry | `tests/unit/core/tool-registry.test.ts` |
| Tools | `src/core/tools/page-tools.ts` | Page read/find tools | Port Implementation | `tests/unit/core/tool-loop.test.ts` |
| Tools | `src/core/tools/browser-tools.ts` | Browser action tools | Port Implementation | `tests/unit/core/tool-loop.test.ts` |
| Action | `src/adapters/content/primitive-executor.ts` | DOM primitive execution | Adapter Strategy | `tests/unit/adapters/primitive-executor.test.ts` |
| Action | `src/adapters/content/action-settle.ts` | Navigation/mutation/paint waits | Policy Object | `tests/unit/adapters/action-settle.test.ts` |
| Action | `src/adapters/chrome/cdp-session.ts` | Lazy CDP attach/detach | Adapter | `tests/unit/adapters/cdp-session.test.ts` |
| Action | `src/adapters/chrome/cdp-input.ts` | Trusted input fallback | Adapter Strategy | `tests/unit/adapters/cdp-input.test.ts` |
| Session | `src/core/session/session-state-machine.ts` | Legal session/task transitions | State Machine | `tests/unit/core/session-state-machine.test.ts` |
| Session | `src/core/session/session-store.ts` | Active/history/tombstone repository port | Repository Port | `tests/unit/adapters/chrome-session-memory.test.ts` |
| Session | `src/adapters/chrome/chrome-session-memory.ts` | Chrome-backed session repository | Repository Adapter | `tests/unit/adapters/chrome-session-memory.test.ts` |
| Session | `src/sidepanel/runtime-subscription.ts` | Rehydrate and live event subscription | Adapter | `tests/unit/sidepanel/state.test.ts` |
| Overlay | `src/core/observation/debug-overlay-model.ts` | Debug overlay projection | Policy Object | `tests/unit/shared/overlay-targets.test.ts` |
| Overlay | `src/adapters/content/overlay-controller.ts` | Draw/remove overlay root | Adapter | `tests/unit/adapters/overlay-controller.test.ts` |
| Overlay | `src/shared/overlay-targets.ts` | Short marker mapping | Mapper | `tests/unit/shared/overlay-targets.test.ts` |
| Vision | `src/core/vision/vision.ts` | Clean screenshot contract | Port Policy | `tests/unit/core/vision.test.ts` |
| Events | `src/core/events/events.ts` | Runtime event vocabulary | Event Sourcing Kernel | `tests/unit/core/events.test.ts` |
| Events | `src/core/events/reducer.ts` | Session state from events | Reducer | `tests/unit/core/events.test.ts` |
| Health | `src/core/events/runtime-health.ts` | Performance and issue derivation | Observer | `tests/unit/core/runtime-health.test.ts` |
| Health | `src/sidepanel/runtime-issue.ts` | User-readable issue messages | Presenter | `tests/unit/sidepanel/runtime-issue.test.ts` |
| Build | `tests/unit/build/manifest.test.ts` | Version consistency | Release Fitness Function | `npx vitest run tests/unit/build/manifest.test.ts` |

## Cross-Cutting Design Rules

- **No UI-to-core leakage:** sidepanel strings, CSS class names, DOM nodes, and Chrome runtime details never enter `src/core/**`.
- **No core-to-adapter leakage:** core emits ports and pure data; adapters own Chrome, DOM, CDP, storage, and network.
- **No visible-marker dependency:** execution can use hidden handles and atlas; visible marker mode only changes debug display.
- **No silent fallback:** any fallback from handle to fuzzy label, DOM to CDP, fast path to planner, or active session to history must emit an event.
- **No unbounded loops:** runtime step loop, tool loop, observation expansion, model retry, action settle, and recovery all use `ExecutionBudget`.
- **No raw secrets:** API keys and auth headers are redacted at serialization boundaries, not only at UI display.
- **No generic catch-all errors:** errors are typed so UI and runtime health can explain them.
- **No custom app assumptions:** tests use generic fixtures, not CRM-specific text or routes.

---

### Task 1: Architecture Boundary Guardrails

**Design Pattern:** Hexagonal Architecture, Architecture Fitness Function.

**Files:**

- Modify: `src/core/architecture/boundaries.ts`
- Modify: `src/core/architecture/serialization.ts`
- Modify: `src/shared/protocol.ts`
- Modify: `tests/unit/core/architecture-boundaries.test.ts`

**Responsibilities:**

- `boundaries.ts` owns opaque IDs, abort reasons, dependency vocabulary, and cross-context terms.
- `serialization.ts` owns JSON-safe runtime snapshots and redaction utilities.
- `protocol.ts` owns background/content/sidepanel message contracts.

**Interfaces:**

```ts
export type RuntimeAbortReason =
  | "user_stop"
  | "panel_disconnect"
  | "service_worker_restart"
  | "new_task_replaced_previous"
  | "cdp_detached"
  | "budget_exceeded"
  | "fresh_session_started";

export interface AbortableRuntimePort {
  readonly signal: AbortSignal;
  throwIfAborted(): void;
}
```

**Work Items:**

- [ ] Add `fresh_session_started` and `settings_reloaded` related vocabulary where needed.
- [ ] Add dependency boundary tests that scan `src/core/**` for forbidden imports.
- [ ] Add serialization redaction tests for API keys, bearer tokens, and model request headers.
- [ ] Ensure protocol messages distinguish user-visible commands from internal debug events.

**Tests:**

- `npx vitest run tests/unit/core/architecture-boundaries.test.ts`
- `npx vitest run tests/unit/shared/overlay-targets.test.ts`

**Done Criteria:**

- Core import guard fails if `src/core/**` imports Chrome, DOM, sidepanel, public, or generated extension output.
- Redaction removes API keys from every serialized event payload fixture.

---

### Task 2: Sidepanel Presenter And ViewModel Split

**Design Pattern:** Presenter/ViewModel, Single Responsibility Principle.

**Files:**

- Modify: `src/sidepanel/view-model.ts`
- Modify: `src/sidepanel/state.ts`
- Modify: `src/sidepanel/render.ts`
- Modify: `tests/unit/sidepanel/view-model.test.ts`
- Modify: `tests/unit/sidepanel/render.test.ts`

**Responsibilities:**

- `state.ts` owns raw state shape, storage decode, local view transitions.
- `view-model.ts` owns display projections and derived labels.
- `render.ts` owns DOM composition only; it should not parse `AgentEvent` directly.

**Interfaces:**

```ts
export interface WorkbenchViewModel {
  topbar: TopbarViewModel;
  composer: ComposerViewModel;
  transcript: TranscriptViewModel;
  settings: SettingsCenterViewModel;
  sessionDrawer: SessionDrawerViewModel;
  runtimeIssues: RuntimeIssueViewModel[];
}
```

**Work Items:**

- [ ] Move timeline grouping, run report tone, latest notice, status labels, settings dirty labels into `view-model.ts`.
- [ ] Keep `render.ts` helpers focused on DOM element creation and event binding.
- [ ] Add tests for status mapping: `running`, `stopping`, `paused`, `stopped`, `failed`, `completed`.
- [ ] Add tests that `render.ts` can render from a `WorkbenchViewModel` fixture without raw event input.

**Tests:**

- `npx vitest run tests/unit/sidepanel/view-model.test.ts tests/unit/sidepanel/render.test.ts`

**Done Criteria:**

- `render.ts` no longer contains business decisions such as runtime issue classification, raw event reduction, or settings validation.
- `view-model.ts` has no DOM or Chrome API dependency.

---

### Task 3: Pie-Inspired Workbench Component Boundaries

**Design Pattern:** Component Composition, Anti-Corruption Layer.

**Files:**

- Create: `src/sidepanel/components/topbar.ts`
- Create: `src/sidepanel/components/composer.ts`
- Create: `src/sidepanel/components/transcript.ts`
- Create: `src/sidepanel/components/settings-center.ts`
- Create: `src/sidepanel/components/session-drawer.ts`
- Modify: `src/sidepanel/components/workbench.ts`
- Modify: `src/sidepanel/render.ts`
- Modify: `public/sidepanel.css`
- Modify: `tests/unit/sidepanel/render.test.ts`

**Responsibilities:**

- `topbar.ts`: history, new session, title, status, schedules, theme, settings.
- `composer.ts`: textarea, tool menu button, model picker button, context indicator, send/stop/queue controls.
- `transcript.ts`: user/system/agent messages, run report, step group, model stream, pending confirmation.
- `settings-center.ts`: configs/skills/search/general shell and tab rendering.
- `session-drawer.ts`: drawer shell, session list, active session, run/delete/download actions.

**Interfaces:**

```ts
export type SettingsTabId = "configs" | "skills" | "search" | "general";

export interface ComposerViewModel {
  value: string;
  disabled: boolean;
  running: boolean;
  stopping: boolean;
  canQueue: boolean;
  modelLabel: string;
  contextLabel: string;
  toolMenuOpen: boolean;
  pendingInstructions: Array<{ id: string; text: string }>;
}
```

**Work Items:**

- [ ] Extract topbar rendering from `render.ts` and keep current labels through `i18n.ts`.
- [ ] Extract composer rendering and preserve current stop/queue semantics.
- [ ] Add visible, unmistakable new-session control with icon and short text; keep aria-label.
- [ ] Implement settings tab rail with `role="tablist"`, `role="tab"`, `aria-selected`, keyboard order, and clear active state.
- [ ] Convert history view into drawer composition that can remain mounted while main chat state rehydrates.
- [ ] Scan CSS for nested cards, text clipping, `transition: all`, and absent focus states.

**Tests:**

- `npx vitest run tests/unit/sidepanel/render.test.ts`
- UI scan:
  `rg -n "alert\\(|confirm\\(|prompt\\(|window\\.alert|window\\.confirm|window\\.prompt|<select\\b|outline\\s*:\\s*none|outline-none|transition\\s*:\\s*all" src/sidepanel public/sidepanel.css tests/unit/sidepanel`

**Done Criteria:**

- User can identify “新建会话” without guessing the plus icon meaning.
- Settings center visually exposes Configs, Skills, Search, General as primary tabs.
- Composer during running state has separate Stop and Queue semantics.

---

### Task 4: Model Configuration Center

**Design Pattern:** Repository Pattern, Value Object, Service Layer.

**Files:**

- Modify: `src/core/model/model-instance.ts`
- Modify: `src/core/model/model-registry.ts`
- Modify: `src/core/model/model-config-service.ts`
- Modify: `src/adapters/chrome/model-config-store.ts`
- Modify: `src/adapters/model/openai-compatible-client.ts`
- Modify: `src/sidepanel/settings.ts`
- Modify: `tests/unit/core/model-config-service.test.ts`
- Modify: `tests/unit/adapters/model-config-store.test.ts`
- Modify: `tests/unit/sidepanel/settings.test.ts`

**Responsibilities:**

- Core owns provider/model value objects and validation.
- Adapter owns Chrome storage and migration.
- Sidepanel owns draft editing only.

**Interfaces:**

```ts
export interface ModelInstance {
  id: string;
  provider: "openai_compatible" | "custom";
  label: string;
  baseUrl: string;
  apiKeyRef: string;
  models: ModelCapability[];
}

export interface ModelConfigService {
  listInstances(): Promise<ModelInstance[]>;
  saveDraft(input: ModelConfigDraft): Promise<ModelConfigSaveResult>;
  selectModel(selection: ModelSelection): Promise<void>;
  resolveRuntimeConfig(role: "planner" | "vision" | "fast_verifier"): Promise<ModelRuntimeConfig>;
}
```

**Work Items:**

- [ ] Migrate legacy single provider settings into one `ModelInstance`.
- [ ] Store API key by reference; runtime events only hold `apiKeyRef`.
- [ ] Add detected model cache with timestamp and source.
- [ ] Add model capability flags: `tools`, `vision`, `json`, `maxContextTokens`.
- [ ] Add connection test command that never logs raw API key.
- [ ] Make settings save reload from repository after success; do not reset to defaults on refresh.

**Tests:**

- `npx vitest run tests/unit/core/model-config-service.test.ts tests/unit/adapters/model-config-store.test.ts tests/unit/sidepanel/settings.test.ts`

**Done Criteria:**

- Refreshing sidepanel after saving model or marker settings preserves saved values.
- API key is not present in event snapshots, logs, or exported settings fixtures.

---

### Task 5: Observation And Target Recognition Rebuild

**Design Pattern:** Strategy Pattern, Information Hiding, Value Object.

**Files:**

- Modify: `src/core/observation/page-model.ts`
- Modify: `src/core/observation/page-atlas.ts`
- Modify: `src/core/observation/interactive-index.ts`
- Modify: `src/adapters/content/dom-observer.ts`
- Modify: `src/adapters/content/page-node-index.ts`
- Modify: `src/core/context/page-context-assembler.ts`
- Modify: `src/core/commands/binder.ts`
- Modify: `tests/unit/core/page-atlas.test.ts`
- Modify: `tests/unit/core/interactive-index.test.ts`
- Modify: `tests/unit/adapters/dom-observer.test.ts`
- Modify: `tests/unit/adapters/page-node-index.test.ts`
- Modify: `tests/unit/core/commands-binder.test.ts`

**Responsibilities:**

- `PageModel` is the canonical observation value object.
- `PageAtlas` summarizes page regions and relationships.
- `InteractiveIndex` ranks actionable controls.
- `PageNodeIndex` maintains hidden handles and mutation-aware lookup.
- `CommandBinder` binds semantic commands to handles before fuzzy text.

**Interfaces:**

```ts
export interface ControlCandidate {
  semanticId: string;
  handle: string;
  role: string;
  label: string;
  accessibleName: string;
  visibility: "visible" | "hidden" | "offscreen";
  bounds?: { x: number; y: number; width: number; height: number };
  confidence: number;
  regionRef?: string;
  expandedState?: "expanded" | "collapsed";
}
```

**Work Items:**

- [ ] Treat menu items, sidebar items, tab items, and icon-only buttons as first-class candidates.
- [ ] Score candidates using role, label, accessible name, visible text, region, occlusion, disabled state, and expanded state.
- [ ] Add hidden handle attributes that do not change visible page appearance.
- [ ] Bind exact `semanticId`/handle before label fuzzy matching.
- [ ] Return ambiguity diagnostics with candidate list instead of throwing a generic “multiple controls match”.
- [ ] Add observation modes: `atlas`, `interactive`, `content`, `full`; default runtime should start from cheapest useful mode.

**Tests:**

- `npx vitest run tests/unit/adapters/dom-observer.test.ts tests/unit/core/interactive-index.test.ts tests/unit/core/commands-binder.test.ts`

**Done Criteria:**

- Generic sidebar fixture can identify collapsed menu parent as `menuitem` or `button` with `expandedState`.
- Ambiguous labels return ranked candidates and requested observation hints.
- Overlay off does not reduce binding accuracy.

---

### Task 6: Overlay And Vision Hygiene

**Design Pattern:** Adapter Isolation, Policy Object.

**Files:**

- Modify: `src/core/observation/debug-overlay-model.ts`
- Modify: `src/adapters/content/overlay-controller.ts`
- Modify: `src/shared/overlay-targets.ts`
- Modify: `src/core/vision/vision.ts`
- Modify: `tests/unit/adapters/overlay-controller.test.ts`
- Modify: `tests/unit/shared/overlay-targets.test.ts`
- Modify: `tests/unit/core/vision.test.ts`

**Responsibilities:**

- Debug overlay receives already-computed overlay targets; it never performs recognition.
- Overlay text is short and non-invasive.
- Vision capture always runs with visible overlay cleared.

**Interfaces:**

```ts
export interface OverlayTarget {
  markerId: number;
  handle: string;
  role: string;
  shortLabel: string;
  bounds: DOMRectLike;
  tone: "candidate" | "evidence" | "focus";
}

export interface CleanScreenshotPort {
  withOverlayHidden<T>(capture: () => Promise<T>): Promise<T>;
}
```

**Work Items:**

- [ ] Remove verbose overlay labels such as confidence scores and role-name chains from visible UI.
- [ ] Keep marker configuration persisted but make `Off` remove overlay root from page.
- [ ] Implement `withOverlayHidden` in content/background capture path.
- [ ] Add tests proving screenshot capture calls clear/restore in order.
- [ ] Ensure hidden handles remain after visible overlay is off.

**Tests:**

- `npx vitest run tests/unit/adapters/overlay-controller.test.ts tests/unit/shared/overlay-targets.test.ts tests/unit/core/vision.test.ts`

**Done Criteria:**

- User-visible page no longer shows long marker chips that affect visual model.
- Vision tests fail if capture happens while overlay root is visible.

---

### Task 7: Fast Path Strategy And Model-Call Gating

**Design Pattern:** Strategy Pattern, Chain of Responsibility.

**Files:**

- Modify: `src/core/runtime/fast-paths.ts`
- Modify: `src/core/runtime/agent-runtime.ts`
- Modify: `src/core/context/stale-observation-elision.ts`
- Modify: `src/core/context/page-context-assembler.ts`
- Modify: `tests/unit/core/agent-speed-paths.test.ts`
- Modify: `tests/unit/core/agent-runtime.test.ts`
- Modify: `tests/unit/core/performance-guardrails.test.ts`

**Responsibilities:**

- Fast path owns deterministic “无需 planner” routes.
- Agent runtime records why it skipped or invoked model.
- Context assembler keeps model input compact when model is needed.

**Interfaces:**

```ts
export type FastPathSource =
  | "explicit_url"
  | "exact_visible_control"
  | "exact_bound_handle"
  | "single_field_fill"
  | "known_safe_shortcut";

export interface FastPathDecision {
  source: FastPathSource;
  command: SemanticCommand;
  confidence: number;
  reasoningSummary: string;
}
```

**Work Items:**

- [ ] Expand exact visible control fast path to use handle and normalized label.
- [ ] Add low-risk single field fill when one textbox/searchbox clearly matches target and value.
- [ ] Add model-call gating event: `FastPathSelected`, `FastPathRejected`, `ModelCallStarted`.
- [ ] Reject fast path for destructive actions, multiple equal candidates, hidden/covered target, or missing expected outcome.
- [ ] Add stale observation elision before planner call.

**Tests:**

- `npx vitest run tests/unit/core/agent-speed-paths.test.ts tests/unit/core/performance-guardrails.test.ts`

**Done Criteria:**

- Exact click tests show `modelCalls === 0`.
- Runtime emits clear rejection reason when it falls back to planner.

---

### Task 8: Tool Loop And Progressive Disclosure

**Design Pattern:** Tool Registry, Progressive Disclosure, Budgeted Loop.

**Files:**

- Modify: `src/core/tools/tool.ts`
- Modify: `src/core/tools/tool-registry.ts`
- Modify: `src/core/tools/page-tools.ts`
- Modify: `src/core/tools/browser-tools.ts`
- Modify: `src/core/runtime/tool-loop.ts`
- Modify: `src/core/capabilities/registry.ts`
- Modify: `tests/unit/core/tool-registry.test.ts`
- Modify: `tests/unit/core/tool-loop.test.ts`
- Modify: `tests/unit/core/capabilities.test.ts`

**Responsibilities:**

- Tool registry groups tools by capability and runtime availability.
- Tool loop enforces max steps, abort checks, and tool result contracts.
- Capabilities are disabled by default unless needed.

**Interfaces:**

```ts
export type ToolGroup =
  | "page"
  | "browser"
  | "keyboard"
  | "mouse"
  | "vision"
  | "search"
  | "files"
  | "skills"
  | "schedule";

export interface ToolDisclosureState {
  activeGroups: ToolGroup[];
  availableGroups: ToolGroup[];
  reasonByGroup: Partial<Record<ToolGroup, string>>;
}
```

**Work Items:**

- [ ] Keep default tool group small: page read, target find, click/type/select, done/fail.
- [ ] Add `load_tools` style disclosure for search/files/skills/schedules.
- [ ] Check abort signal before and after every tool execution.
- [ ] Emit tool loop events with group, name, elapsed, result status.
- [ ] Ensure tool arguments are redacted before sidepanel display.

**Tests:**

- `npx vitest run tests/unit/core/tool-registry.test.ts tests/unit/core/tool-loop.test.ts`

**Done Criteria:**

- Simple operations do not receive heavyweight tools in planner context.
- Stopped tasks cannot execute a queued next tool.

---

### Task 9: Primitive Executor, Settle Policy, And CDP Fallback

**Design Pattern:** Adapter Pattern, Strategy Pattern, Null Object.

**Files:**

- Modify: `src/adapters/content/primitive-executor.ts`
- Modify: `src/adapters/content/action-settle.ts`
- Modify: `src/adapters/chrome/cdp-session.ts`
- Modify: `src/adapters/chrome/cdp-input.ts`
- Modify: `src/background/index.ts`
- Modify: `tests/unit/adapters/primitive-executor.test.ts`
- Modify: `tests/unit/adapters/action-settle.test.ts`
- Modify: `tests/unit/adapters/cdp-session.test.ts`
- Modify: `tests/unit/adapters/cdp-input.test.ts`

**Responsibilities:**

- Content executor handles DOM-native click/type/select/scroll/keyboard.
- Settle policy waits for navigation, mutation, paint, and idle with abort support.
- CDP adapter is optional fallback for sites requiring trusted input.

**Interfaces:**

```ts
export interface PrimitiveExecutionOptions {
  signal: AbortSignal;
  settle: "none" | "mutation" | "navigation" | "paint" | "auto";
  inputMode: "dom" | "cdp" | "auto";
}
```

**Work Items:**

- [ ] Execute by hidden handle first; coordinate fallback only after handle lookup fails.
- [ ] Expand menu parent click should wait for `aria-expanded`, child visibility, mutation, or route change.
- [ ] Type supports input, textarea, contenteditable, and common rich editors.
- [ ] CDP session uses owner token, lazy attach, abort detach, and conflict diagnostics.
- [ ] Action settle returns timing details for runtime health.

**Tests:**

- `npx vitest run tests/unit/adapters/primitive-executor.test.ts tests/unit/adapters/action-settle.test.ts tests/unit/adapters/cdp-session.test.ts tests/unit/adapters/cdp-input.test.ts`

**Done Criteria:**

- Menu expansion fixture passes without model retry.
- Abort during settle returns stopped status instead of continuing action.

---

### Task 10: Stop, Abort, Tombstone, And Continuation Rejection

**Design Pattern:** State Machine, Cancellation Token, Repository Pattern.

**Files:**

- Modify: `src/core/session/session-state-machine.ts`
- Modify: `src/core/runtime/execution-controller.ts`
- Modify: `src/core/runtime/agent-runtime.ts`
- Modify: `src/core/runtime/tool-loop.ts`
- Modify: `src/adapters/model/openai-compatible-client.ts`
- Modify: `src/adapters/chrome/chrome-session-memory.ts`
- Modify: `src/background/index.ts`
- Modify: `tests/unit/core/session-state-machine.test.ts`
- Modify: `tests/unit/core/execution-controller.test.ts`
- Modify: `tests/unit/core/agent-runtime.test.ts`
- Modify: `tests/unit/adapters/chrome-session-memory.test.ts`

**Responsibilities:**

- Stop is durable and observable.
- Each task has one abort controller.
- Background rejects any work for a stopped task ID.

**Interfaces:**

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

export interface StopTombstone {
  taskId: string;
  sessionId: string;
  reason: RuntimeAbortReason;
  stoppedAt: number;
  generation: number;
}
```

**Work Items:**

- [ ] Add `stopping` state and legal transitions.
- [ ] Write tombstone before aborting downstream work.
- [ ] Thread `AbortSignal` into model streaming, observation, tool loop, primitive executor, settle, CDP.
- [ ] After every awaited operation, call a shared abort check.
- [ ] Reject queued continuation if tombstone generation does not match active task generation.
- [ ] Emit `RuntimeStopRequested`, `RuntimeStopped`, and `RuntimeContinuationRejected`.

**Tests:**

- `npx vitest run tests/unit/core/session-state-machine.test.ts tests/unit/core/execution-controller.test.ts tests/unit/core/agent-runtime.test.ts`

**Done Criteria:**

- Stop test proves model stream abort handler is called.
- Stop during action settle does not run next step.
- Reopening panel after stop shows stopped, not running.

---

### Task 11: Session Rehydrate And Fresh Session Semantics

**Design Pattern:** State Machine, Repository Pattern, Idempotent Recovery.

**Files:**

- Modify: `src/core/session/session-store.ts`
- Modify: `src/adapters/chrome/chrome-session-memory.ts`
- Modify: `src/sidepanel/runtime-subscription.ts`
- Modify: `src/sidepanel/main.ts`
- Modify: `src/sidepanel/state.ts`
- Modify: `src/background/index.ts`
- Modify: `tests/unit/adapters/chrome-session-memory.test.ts`
- Modify: `tests/unit/sidepanel/state.test.ts`
- Modify: `tests/unit/sidepanel/runtime-issue.test.ts`

**Responsibilities:**

- Session repository is the source of active session truth.
- Sidepanel mount rehydrates before rendering stale history.
- New session creates a fresh active session marker.

**Interfaces:**

```ts
export interface ActiveSessionSnapshot {
  activeSessionId: string;
  fresh: boolean;
  selectedHistorySessionId?: string;
  taskStatus: TaskStatus;
  updatedAt: number;
}
```

**Work Items:**

- [ ] New session handler writes active session snapshot and clears selected history detail.
- [ ] Panel open reads active snapshot first, then event history.
- [ ] Panel disconnect does not archive or erase active session.
- [ ] Browser focus switch does not clear sidepanel state; rehydrate should restore composer draft and status.
- [ ] Service worker restart turns running task into paused unless tombstone says stopped.

**Tests:**

- `npx vitest run tests/unit/adapters/chrome-session-memory.test.ts tests/unit/sidepanel/state.test.ts`

**Done Criteria:**

- New session stays new after closing/opening plugin.
- Switching away from browser and back does not lose conversation view.

---

### Task 12: Settings Persistence And Runtime Controls

**Design Pattern:** Repository Pattern, Versioned Migration, Command Handler.

**Files:**

- Modify: `src/sidepanel/state.ts`
- Modify: `src/sidepanel/settings.ts`
- Modify: `src/sidepanel/main.ts`
- Modify: `src/adapters/chrome/model-config-store.ts`
- Modify: `src/core/runtime/execution-budget.ts`
- Modify: `tests/unit/sidepanel/settings.test.ts`
- Modify: `tests/unit/sidepanel/state.test.ts`
- Modify: `tests/unit/core/execution-budget.test.ts`

**Responsibilities:**

- General settings, model settings, runtime settings each have a persisted snapshot.
- Draft state never overwrites stored value unless save succeeds.
- Runtime controls are versioned and validated.

**Interfaces:**

```ts
export interface RuntimeSettingsSnapshot {
  version: number;
  overlayMode: OverlayMode;
  safetyMode: SidepanelSafetyMode;
  themeMode: ThemeMode;
  executionPreset: ExecutionPreset;
  runtimeSettings: RuntimeSettings;
}
```

**Work Items:**

- [ ] Add decode tests for old missing `version`, old `All Targets`, invalid string values, and valid saved marker mode.
- [ ] Save settings through one command handler in `main.ts`.
- [ ] On save success, reload from repository and update state with `saved` status.
- [ ] On save failure, keep draft and show error without reverting.
- [ ] Add store-change subscription so multiple sidepanel instances stay consistent.

**Tests:**

- `npx vitest run tests/unit/sidepanel/settings.test.ts tests/unit/sidepanel/state.test.ts tests/unit/core/execution-budget.test.ts`

**Done Criteria:**

- Marker settings survive sidepanel refresh.
- Invalid stored values migrate to defaults without replacing valid saved values.

---

### Task 13: Runtime Health, Logs, And Performance Guardrails

**Design Pattern:** Observer, Reducer, Fitness Function.

**Files:**

- Modify: `src/core/events/events.ts`
- Modify: `src/core/events/reducer.ts`
- Modify: `src/core/events/runtime-health.ts`
- Modify: `src/sidepanel/runtime-issue.ts`
- Modify: `src/sidepanel/view-model.ts`
- Modify: `tests/unit/core/runtime-health.test.ts`
- Modify: `tests/unit/core/events.test.ts`
- Modify: `tests/unit/sidepanel/runtime-issue.test.ts`
- Modify: `tests/unit/core/performance-guardrails.test.ts`

**Responsibilities:**

- Events remain the single source for diagnostics.
- Runtime health derives actionable warnings from event stream.
- Performance tests lock in fast-path expectations.

**Interfaces:**

```ts
export interface RuntimeMetricEventPayload {
  observationElapsedMs?: number;
  modelElapsedMs?: number;
  actionElapsedMs?: number;
  settleElapsedMs?: number;
  modelCalls?: number;
  observationRounds?: number;
  fastPathSource?: string;
}
```

**Work Items:**

- [ ] Add events for fast path selected/rejected, observation mode, action settle timings, stop acknowledgement, continuation rejection.
- [ ] Add health warnings for repeated planner calls on simple task, slow observation, slow action settle, overlay visible during vision, stop timeout.
- [ ] Make sidepanel issue messages specific: what happened, why it matters, what user can do.
- [ ] Keep logs downloadable and redacted.

**Tests:**

- `npx vitest run tests/unit/core/runtime-health.test.ts tests/unit/core/performance-guardrails.test.ts tests/unit/sidepanel/runtime-issue.test.ts`

**Done Criteria:**

- A regression that adds a model call to exact click fast path fails tests.
- Stop timeout produces a visible issue and redacted log event.

---

### Task 14: Generic Fixtures, Cross-Layer Tests, Build, And Release

**Design Pattern:** Test Pyramid, Contract Test, Release Fitness Function.

**Files:**

- Create: `tests/fixtures/pages/sidebar-menu.html`
- Create: `tests/fixtures/pages/settings-form.html`
- Modify: `tests/fixtures/pages/rich-editor.html`
- Modify: `tests/fixtures/pages/iframe-form.html`
- Modify: `tests/unit/core/performance-guardrails.test.ts`
- Modify: `tests/unit/build/manifest.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `public/manifest.json`
- Modify: `naturalclick-extension/manifest.json`

**Responsibilities:**

- Fixtures must be framework-independent and not CRM-specific.
- Tests cover unit behavior first; build test enforces version consistency.
- Release task bumps version only when behavior/UI changes are implemented.

**Work Items:**

- [ ] Add sidebar menu fixture with repeated labels, nested collapsed menu, icon-only menu, and content button sharing similar text.
- [ ] Add settings form fixture with persisted inputs, toggle-like buttons, textareas, and validation messages.
- [ ] Add rich editor fixture with contenteditable, synthetic event traps, and fallback typing behavior.
- [ ] Add iframe form fixture with same-origin iframe and cross-origin placeholder behavior.
- [ ] Add performance guardrails: exact click has `modelCalls === 0`, observation uses candidate limit, stop prevents next step.
- [ ] Add manifest version consistency test for all extension manifests.
- [ ] Run full verification before release.

**Verification Commands:**

```bash
npm run typecheck
npm run test:unit
npm run build
npx vitest run tests/unit/build/manifest.test.ts
rg -n "alert\\(|confirm\\(|prompt\\(|window\\.alert|window\\.confirm|window\\.prompt|<select\\b|outline\\s*:\\s*none|outline-none|transition\\s*:\\s*all" src/sidepanel public/sidepanel.css naturalclick-extension/sidepanel.css tests/unit/sidepanel
```

**Done Criteria:**

- All verification commands pass.
- Version is consistent in `package.json`, `package-lock.json`, `public/manifest.json`, and `naturalclick-extension/manifest.json`.
- No fixture or test contains CRM-specific shortcut logic.

---

## Acceptance Checklist

- [ ] Simple exact click path finishes without planner model call.
- [ ] Ambiguous target reports ranked candidates instead of choosing wrong control.
- [ ] Visible marker labels are short, debug-only, and absent during vision capture.
- [ ] Stop cancels stream, tools, settle, CDP, queued continuation, and panel resume.
- [ ] New session remains active after closing/opening the sidepanel.
- [ ] Browser focus switch does not wipe current conversation.
- [ ] Marker/config/runtime settings survive refresh and service worker restart.
- [ ] Model config can add/test/select provider instance without leaking API key.
- [ ] Sidepanel has Pie-like workbench clarity while retaining NaturalClick DOM renderer.
- [ ] Runtime health highlights slow observation/model/action and exact fast-path regressions.
- [ ] Tests cover unit, adapter, sidepanel render/state, performance guardrails, and manifest version consistency.

## Implementation Notes For Agentic Workers

- Prefer one task per subagent when files do not overlap. Use inline execution for tasks touching shared files like `src/sidepanel/render.ts`, `src/sidepanel/state.ts`, or `src/background/index.ts`.
- Before editing any file, read the latest version of that file in the current worktree.
- Add tests before implementation for each task.
- Keep implementation generic; if a test needs a CRM page, replace it with a generic fixture.
- Do not use Pie code directly. Translate ideas into NaturalClick interfaces and names.
- If a task starts a dev server or temporary debug program, stop it before completion.
- If a task creates temporary folders, delete them before completion.
- For behavior or UI changes, bump version and rebuild generated extension output.
