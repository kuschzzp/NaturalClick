import { badge, button, el, textInput } from "./components";
import {
  deriveActiveNodeId,
  deriveRuntimeFlow,
  needsModelGuidance,
  RUNTIME_FLOW,
  withDerivedMode,
  type OverlayMode,
  type SidepanelSafetyMode,
  type SidepanelState,
  type TimelineItem
} from "./state";
import { defaultModelSettings } from "./settings";

export interface SidepanelHandlers {
  onSubmitTask?: (text: string) => void;
  onOpenSettings?: () => void;
  onCloseSettings?: () => void;
  onOverlayModeChange?: (mode: string) => void;
  onSafetyModeChange?: (mode: string) => void;
  onStopTask?: () => void;
  onHighlightTarget?: (semanticId: string) => void;
}

function formatSafetyMode(mode: SidepanelSafetyMode): string {
  const labels: Record<SidepanelSafetyMode, string> = {
    conservative: "保守",
    balanced: "平衡",
    autonomous: "自主",
    experimental_full_auto: "完全放开"
  };
  return labels[mode];
}

function formatOverlayMode(mode: OverlayMode): string {
  const labels: Record<OverlayMode, string> = {
    Off: "关闭",
    Focus: "聚焦",
    "All Targets": "全部目标",
    Evidence: "证据",
    Vision: "视觉"
  };
  return labels[mode];
}

function formatTaskStatus(status?: string): string {
  const labels: Record<string, string> = {
    running: "执行中",
    planning: "规划中",
    observing: "观察中",
    executing: "执行动作",
    verifying: "校验中",
    awaiting_confirmation: "等待确认",
    completed: "已完成",
    failed: "失败",
    stopped: "已停止",
    blocked: "已阻塞"
  };
  return status ? (labels[status] ?? status) : "待命";
}

function renderTopBar(state: SidepanelState, handlers: SidepanelHandlers): HTMLElement {
  const topbar = el("header", "nc-topbar");
  const identity = el("div", "nc-product");
  identity.append(el("strong", "nc-product__name", "NaturalClick"));
  identity.append(el("span", "nc-product__sub", state.activeTask ? formatTaskStatus(state.activeTask.status) : "Chrome 操作 Agent"));

  const controls = el("div", "nc-topbar__controls");
  controls.append(badge(formatSafetyMode(state.safetyMode), state.safetyMode === "experimental_full_auto" ? "warning" : "neutral"));
  controls.append(badge(formatOverlayMode(state.overlayMode), state.overlayMode === "Vision" ? "vision" : "neutral"));

  if (state.mode === "workbench") {
    const stop = button("nc-button nc-button--danger nc-button--compact", "停止");
    stop.addEventListener("click", () => handlers.onStopTask?.());
    controls.append(stop);
  }

  const settings = button("nc-icon-button", "设置");
  settings.addEventListener("click", () => handlers.onOpenSettings?.());
  controls.append(settings);

  topbar.append(identity, controls);
  return topbar;
}

function renderBuilderEntry(): HTMLElement {
  const card = el("section", "nc-builder-entry");
  const copy = el("div", "nc-builder-entry__copy");
  copy.append(el("span", "nc-kicker", "B 方向"));
  copy.append(el("strong", undefined, "Chatflow 编排"));
  copy.append(el("p", undefined, "高级配置会进入 Dify 风格节点画布；侧边栏只展示当前流程路径、节点状态和运行证据。"));
  const badgeNode = el("span", "nc-builder-entry__badge", "高级配置");
  card.append(copy, badgeNode);
  return card;
}

function renderGuidance(handlers: SidepanelHandlers): HTMLElement {
  const card = el("article", "nc-panel nc-guidance");
  card.append(el("h1", undefined, "需要先配置模型"));
  card.append(el("p", undefined, "Planner 模型负责理解任务和决定下一步动作，配置完成后才能开始执行。"));
  const open = button("nc-button nc-button--primary", "打开模型设置");
  open.addEventListener("click", () => handlers.onOpenSettings?.());
  card.append(open);
  return card;
}

function renderFlowMap(state: SidepanelState): HTMLElement {
  const flow = deriveRuntimeFlow(state);
  const map = el("section", "nc-flow-map");
  const header = el("header", "nc-section-head");
  header.append(el("div", undefined, "当前对话流"));
  header.append(el("span", undefined, state.activeTask ? `第 ${Math.max(1, flow.findIndex((node) => node.status === "active" || node.status === "blocked") + 1)} / ${flow.length} 节点` : "未开始"));
  map.append(header);

  const list = el("div", "nc-flow-list");
  flow.forEach((node) => {
    const item = el("article", `nc-flow-node nc-flow-node--${node.status}`);
    item.append(el("span", "nc-flow-node__icon", node.shortLabel));
    const copy = el("span", "nc-flow-node__copy");
    copy.append(el("strong", undefined, node.label));
    copy.append(el("span", undefined, node.description));
    item.append(copy);
    item.append(el("span", "nc-flow-node__state", node.status === "done" ? "完成" : node.status === "active" ? "当前" : node.status === "blocked" ? "阻塞" : "等待"));
    list.append(item);
  });
  map.append(list);
  return map;
}

function renderCurrentAction(state: SidepanelState, handlers: SidepanelHandlers): HTMLElement {
  const task = state.activeTask;
  const activeNodeId = deriveActiveNodeId(state);
  const activeNode = RUNTIME_FLOW.find((node) => node.id === activeNodeId);
  const card = el("section", "nc-action-card");

  const header = el("header", "nc-section-head");
  header.append(el("div", undefined, "当前动作"));
  header.append(badge(task?.riskLevel === "medium" ? "需确认" : task?.riskLevel === "blocked" ? "已阻塞" : "低风险", task?.riskLevel === "medium" ? "warning" : task?.riskLevel === "blocked" ? "danger" : "neutral"));
  card.append(header);

  const nodeLine = el("div", "nc-action-card__node");
  nodeLine.append(el("span", "nc-action-card__node-icon", activeNode?.shortLabel ?? "计"));
  nodeLine.append(el("strong", undefined, activeNode?.label ?? "计划动作"));
  nodeLine.append(el("span", undefined, activeNode?.description ?? "等待 Agent 决定下一步"));
  card.append(nodeLine);

  card.append(el("p", "nc-action-card__main", task?.currentAction ?? "等待下一次模型决策"));

  const facts = el("dl", "nc-action-facts");
  const target = task?.targetLabel ?? "尚未绑定页面目标";
  const outcome = task?.expectedOutcome ?? "执行后会重新观察并校验页面状态";
  facts.append(el("dt", undefined, "目标"), el("dd", undefined, target), el("dt", undefined, "预期结果"), el("dd", undefined, outcome));
  if (task?.bindingSource) {
    facts.append(el("dt", undefined, "证据"), el("dd", undefined, task.bindingSource));
  }
  card.append(facts);

  const actions = el("div", "nc-action-row");
  const highlight = button("nc-button", "标记目标");
  highlight.disabled = !task?.semanticTargetId;
  highlight.addEventListener("click", () => {
    if (task?.semanticTargetId) handlers.onHighlightTarget?.(task.semanticTargetId);
  });
  actions.append(highlight);
  const stop = button("nc-button nc-button--danger", "停止任务");
  stop.addEventListener("click", () => handlers.onStopTask?.());
  actions.append(stop);
  card.append(actions);
  return card;
}

function renderTimelineItem(item: TimelineItem): HTMLElement {
  const row = el("article", `nc-timeline-item nc-timeline-item--${item.tone ?? "info"}`);
  row.append(el("strong", undefined, item.title));
  if (item.detail) row.append(el("p", undefined, item.detail));
  return row;
}

function renderTimeline(state: SidepanelState): HTMLElement {
  const timeline = el("section", "nc-timeline");
  timeline.setAttribute("aria-live", "polite");
  const header = el("header", "nc-section-head");
  header.append(el("div", undefined, "对话与进展"));
  header.append(el("span", undefined, state.timeline?.length ? `${state.timeline.length} 条事件` : "等待输入"));
  timeline.append(header);

  const items =
    state.timeline && state.timeline.length > 0
      ? state.timeline
      : [{ id: "empty", title: "准备就绪", detail: "描述你希望 Agent 在当前页面完成什么。", tone: "info" as const }];
  items.forEach((item) => timeline.append(renderTimelineItem(item)));
  return timeline;
}

function renderInspector(state: SidepanelState): HTMLElement {
  const inspector = el("aside", "nc-inspector");
  const header = el("header", "nc-section-head");
  header.append(el("div", undefined, "运行检查器"));
  header.append(el("span", undefined, "按需展开细节"));
  inspector.append(header);

  const tabs = el("div", "nc-tabs");
  ["Decision", "Evidence", "Trace"].forEach((label, index) => {
    const tab = button(`nc-tab${index === 0 ? " nc-tab--active" : ""}`, label);
    tab.setAttribute("aria-selected", String(index === 0));
    tabs.append(tab);
  });

  const body = el("div", "nc-inspector__body");
  body.append(el("h2", undefined, "Decision"));
  body.append(el("p", undefined, state.decisionSummary ?? "还没有产生模型决策。运行后这里会展示下一步为什么这么做。"));

  const evidence = el("section", "nc-evidence-list");
  evidence.append(el("h2", undefined, "Evidence"));
  (state.evidenceSummary ?? ["页面观察后会在这里展示 DOM、视觉和验证证据。"]).forEach((item) => {
    evidence.append(el("p", "nc-evidence-line", item));
  });

  const trace = el("section", "nc-trace-list");
  trace.append(el("h2", undefined, "Trace"));
  (state.traceSummary ?? ["任务开始后，内部事件会按步骤折叠展示。"]).forEach((item) => {
    trace.append(el("p", "nc-trace-line", item));
  });

  inspector.append(tabs, body, evidence, trace);
  return inspector;
}

function renderComposer(state: SidepanelState, handlers: SidepanelHandlers): HTMLElement {
  const form = el("form", "nc-composer");
  const label = el("label", "nc-composer__field");
  label.append(el("span", "nc-field__label", state.activeTask ? "补充指令" : "任务"));
  const textarea = el("textarea", "nc-textarea") as HTMLTextAreaElement;
  textarea.rows = 3;
  textarea.placeholder = state.activeTask ? "补充约束、提供信息，或输入“停止”..." : "让 Agent 操作当前页面...";
  label.append(textarea);

  const actions = el("div", "nc-composer__actions");
  const submit = el("button", "nc-button nc-button--primary", state.activeTask ? "追加" : "开始") as HTMLButtonElement;
  submit.type = "submit";
  actions.append(submit);

  form.append(label, actions);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = textarea.value.trim();
    if (!text) return;
    handlers.onSubmitTask?.(text);
    textarea.value = "";
  });
  return form;
}

function renderOverlayControls(state: SidepanelState, handlers: SidepanelHandlers): HTMLElement {
  const controls = el("section", "nc-overlay-controls");
  const header = el("header", "nc-section-head");
  header.append(el("div", undefined, "页面标记"));
  header.append(el("span", undefined, "只控制可视化"));
  controls.append(header);

  const options = el("div", "nc-segmented");
  (["Off", "Focus", "All Targets", "Evidence", "Vision"] as OverlayMode[]).forEach((mode) => {
    const option = button(`nc-segment${state.overlayMode === mode ? " nc-segment--active" : ""}`, formatOverlayMode(mode));
    option.setAttribute("aria-pressed", String(state.overlayMode === mode));
    option.addEventListener("click", () => handlers.onOverlayModeChange?.(mode));
    options.append(option);
  });
  controls.append(options);
  controls.append(el("p", "nc-help-text", "关闭标记不会关闭观察、绑定或执行能力。"));
  return controls;
}

function renderSettingsDrawer(state: SidepanelState, handlers: SidepanelHandlers): HTMLElement {
  const drawer = el("section", `nc-settings${state.settingsOpen ? " nc-settings--open" : ""}`);
  drawer.setAttribute("aria-hidden", String(!state.settingsOpen));
  const header = el("header", "nc-settings__header");
  header.append(el("h2", undefined, "模型设置"));
  const close = button("nc-icon-button", "关闭");
  close.addEventListener("click", () => handlers.onCloseSettings?.());
  header.append(close);

  const form = el("form", "nc-settings__form");
  const settings = defaultModelSettings();
  form.append(
    textInput("Base URL", settings.providerBaseUrl),
    textInput("Planner 模型", settings.plannerModel, "gpt-4.1-mini"),
    textInput("Vision 模型", settings.visionModel ?? "", "可选"),
    textInput("API Key 引用", settings.apiKeyRef)
  );
  form.append(el("p", "nc-settings__note", "第一版使用一个全局 OpenAI-compatible Provider。API Key 不会写入 Trace。"));
  drawer.append(header, form);
  return drawer;
}

export function renderSidepanel(root: HTMLElement, input: SidepanelState, handlers: SidepanelHandlers = {}): void {
  const state = withDerivedMode(input);
  const shell = el("section", `nc-shell nc-shell--${state.mode}`);
  shell.append(renderTopBar(state, handlers));

  const main = el("div", "nc-main");
  if (needsModelGuidance(state)) {
    main.append(renderGuidance(handlers));
  }
  main.append(renderBuilderEntry());
  if (state.mode === "workbench") {
    main.append(renderFlowMap(state));
    main.append(renderCurrentAction(state, handlers));
    main.append(renderOverlayControls(state, handlers));
  }
  main.append(renderTimeline(state));
  if (state.mode === "workbench") {
    main.append(renderInspector(state));
  }
  shell.append(main, renderComposer(state, handlers), renderSettingsDrawer(state, handlers));
  root.replaceChildren(shell);
}
