import { button, el } from "./components";
import {
  needsModelGuidance,
  withDerivedMode,
  type OverlayMode,
  type SessionSummary,
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
  onCopyLog?: () => void;
  onDownloadLog?: () => void;
  onNewSession?: () => void;
  onOpenHistory?: () => void;
  onBackToChat?: () => void;
  onModelSettingChange?: (field: "providerBaseUrl" | "apiKey" | "plannerModel" | "visionModel", value: string) => void;
  onDetectModels?: () => void;
  onSaveModelSettings?: () => void;
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
    executing: "执行中",
    verifying: "校验中",
    awaiting_confirmation: "待确认",
    completed: "已完成",
    failed: "错误",
    stopped: "已停止",
    blocked: "已阻塞"
  };
  return status ? (labels[status] ?? status) : "空闲";
}

function statusTone(status?: string): string {
  if (!status) return "idle";
  if (status === "completed") return "completed";
  if (status === "failed" || status === "blocked") return "error";
  if (status === "stopped") return "stopped";
  return "running";
}

function iconMarkup(name: "copy" | "download" | "plus" | "history" | "settings" | "back" | "send" | "stop"): string {
  const icons: Record<typeof name, string> = {
    copy:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>',
    download:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12"></path><path d="m7 10 5 5 5-5"></path><path d="M5 21h14"></path></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>',
    history:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16"></path><path d="M4 12h16"></path><path d="M4 18h16"></path></svg>',
    settings:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 0 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.3 7A2 2 0 0 1 7.1 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 0 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"></path></svg>',
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"></path></svg>',
    send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"></path><path d="m13 6 6 6-6 6"></path></svg>',
    stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1"></rect></svg>'
  };
  return icons[name];
}

function iconButton(className: string, icon: Parameters<typeof iconMarkup>[0], label: string): HTMLButtonElement {
  const node = button(className, "", label);
  node.innerHTML = iconMarkup(icon);
  node.title = label;
  return node;
}

function renderTopBar(state: SidepanelState, handlers: SidepanelHandlers): HTMLElement {
  const topbar = el("header", "nc-app-header");

  const brand = el("div", "nc-brand");
  const logo = el("img", "nc-brand__logo") as HTMLImageElement;
  logo.src = "icons/icon-48.png";
  logo.alt = "";
  const meta = el("div", "nc-brand__meta");
  meta.append(el("span", "nc-brand__eyebrow", "NaturalClick"));
  meta.append(el("h1", "nc-brand__title", state.view === "settings" ? "设置" : state.view === "history" ? "历史会话" : "任务对话"));
  brand.append(logo, meta);

  const status = el("div", "nc-status");
  status.append(el("span", `nc-status__dot nc-status__dot--${statusTone(state.activeTask?.status)}`));
  status.append(el("span", "nc-status__text", formatTaskStatus(state.activeTask?.status)));

  const actions = el("div", "nc-toolbar");
  const copy = iconButton("nc-tool-button", "copy", "复制执行日志");
  copy.addEventListener("click", () => handlers.onCopyLog?.());
  const download = iconButton("nc-tool-button", "download", "下载执行日志");
  download.addEventListener("click", () => handlers.onDownloadLog?.());
  const fresh = iconButton("nc-tool-button", "plus", "新建会话");
  fresh.addEventListener("click", () => handlers.onNewSession?.());
  const history = iconButton("nc-tool-button", "history", "历史会话");
  history.addEventListener("click", () => handlers.onOpenHistory?.());
  const settings = iconButton("nc-tool-button", "settings", "设置");
  settings.addEventListener("click", () => handlers.onOpenSettings?.());
  actions.append(copy, download, fresh, history, settings);

  topbar.append(brand, status, actions);
  return topbar;
}

function renderGuidance(handlers: SidepanelHandlers): HTMLElement {
  const card = el("article", "nc-inline-alert nc-inline-alert--warning");
  const copy = el("div", "nc-inline-alert__copy");
  copy.append(el("strong", undefined, "需要先配置模型"));
  copy.append(el("p", undefined, "配置 Planner 模型后，就可以让 Agent 操作当前 Chrome 页面。"));
  const open = button("nc-quiet-button", "去设置");
  open.addEventListener("click", () => handlers.onOpenSettings?.());
  card.append(copy, open);
  return card;
}

function renderEmptyState(): HTMLElement {
  const empty = el("section", "nc-empty-state");
  const mark = el("div", "nc-empty-state__mark");
  mark.append(el("span", undefined, "⌁"));
  empty.append(mark);
  empty.append(el("h2", undefined, "开始你的自动化任务"));
  empty.append(el("p", undefined, "输入目标后按 Enter 发送，Agent 会在这里持续输出执行过程。"));
  return empty;
}

function visibleTimelineItems(timeline?: TimelineItem[]): TimelineItem[] {
  return (timeline ?? []).filter((item) => item.id !== "welcome");
}

function renderTimelineItem(item: TimelineItem): HTMLElement {
  const row = el("article", `nc-message nc-message--${item.tone ?? "info"}`);
  const marker = el("span", "nc-message__marker");
  const body = el("div", "nc-message__body");
  body.append(el("strong", undefined, item.title));
  if (item.detail) body.append(el("p", undefined, item.detail));
  row.append(marker, body);
  return row;
}

function renderTaskSummary(state: SidepanelState, handlers: SidepanelHandlers): HTMLElement | undefined {
  const task = state.activeTask;
  if (!task) return undefined;

  const card = el("article", "nc-task-summary");
  const top = el("div", "nc-task-summary__top");
  top.append(el("span", "nc-task-summary__label", "当前任务"));
  if (task.semanticTargetId) {
    const highlight = button("nc-quiet-button", "标记目标");
    highlight.addEventListener("click", () => handlers.onHighlightTarget?.(task.semanticTargetId!));
    top.append(highlight);
  }
  card.append(top);
  card.append(el("p", "nc-task-summary__text", task.currentAction ?? "等待 Agent 决定下一步"));
  if (task.targetLabel || task.expectedOutcome) {
    const meta = el("dl", "nc-task-summary__meta");
    if (task.targetLabel) meta.append(el("dt", undefined, "目标"), el("dd", undefined, task.targetLabel));
    if (task.expectedOutcome) meta.append(el("dt", undefined, "预期"), el("dd", undefined, task.expectedOutcome));
    card.append(meta);
  }
  return card;
}

function renderChatView(state: SidepanelState, handlers: SidepanelHandlers): HTMLElement {
  const view = el("main", "nc-chat-view");
  if (needsModelGuidance(state)) view.append(renderGuidance(handlers));

  const taskSummary = renderTaskSummary(state, handlers);
  if (taskSummary) view.append(taskSummary);

  const stream = el("section", "nc-chat-stream");
  stream.setAttribute("aria-live", "polite");
  const items = visibleTimelineItems(state.timeline);
  if (items.length === 0) {
    stream.append(renderEmptyState());
  } else {
    items.forEach((item) => stream.append(renderTimelineItem(item)));
  }

  const activity = el("section", "nc-activity-bar");
  activity.append(el("strong", undefined, state.activityText ?? state.activeTask?.currentAction ?? "等待任务..."));
  stream.append(activity);
  view.append(stream);
  return view;
}

function renderHistoryView(state: SidepanelState, handlers: SidepanelHandlers): HTMLElement {
  const view = el("main", "nc-page-view");
  view.append(renderPageHeader("历史会话", handlers));

  const list = el("section", "nc-session-list");
  const sessions = state.sessions ?? [];
  if (sessions.length === 0) {
    const empty = el("article", "nc-page-empty");
    empty.append(el("h2", undefined, "暂无历史会话"));
    empty.append(el("p", undefined, "开始一次任务后，这里会保留本次侧边栏可见的会话摘要。"));
    list.append(empty);
  } else {
    sessions.forEach((session) => list.append(renderSessionSummary(session)));
  }
  view.append(list);
  return view;
}

function renderSessionSummary(session: SessionSummary): HTMLElement {
  const row = el("article", "nc-session-card");
  const head = el("div", "nc-session-card__head");
  head.append(el("strong", undefined, session.title));
  head.append(el("span", undefined, formatTaskStatus(session.status)));
  row.append(head);
  row.append(el("p", undefined, `${session.eventCount} 条事件 · ${session.updatedAt}`));
  return row;
}

function renderPageHeader(title: string, handlers: SidepanelHandlers): HTMLElement {
  const header = el("header", "nc-page-header");
  const back = iconButton("nc-back-button", "back", "返回对话");
  back.addEventListener("click", () => handlers.onBackToChat?.());
  header.append(back, el("h2", undefined, title));
  return header;
}

function renderOverlayControls(state: SidepanelState, handlers: SidepanelHandlers): HTMLElement {
  const controls = el("section", "nc-settings-group");
  controls.append(el("h3", undefined, "页面标记"));
  controls.append(el("p", undefined, "标记模式只影响页面上的可视化提示，不关闭观察、绑定或执行能力。"));

  const options = el("div", "nc-segmented");
  (["Off", "Focus", "All Targets", "Evidence", "Vision"] as OverlayMode[]).forEach((mode) => {
    const option = button(`nc-segment${state.overlayMode === mode ? " nc-segment--active" : ""}`, formatOverlayMode(mode));
    option.setAttribute("aria-pressed", String(state.overlayMode === mode));
    option.addEventListener("click", () => handlers.onOverlayModeChange?.(mode));
    options.append(option);
  });
  controls.append(options);
  return controls;
}

function renderSafetyControls(state: SidepanelState, handlers: SidepanelHandlers): HTMLElement {
  const controls = el("section", "nc-settings-group");
  controls.append(el("h3", undefined, "执行权限"));
  controls.append(el("p", undefined, "权限配置会影响 Agent 是否需要在中高风险动作前询问你。"));

  const options = el("div", "nc-segmented nc-segmented--safety");
  (["conservative", "balanced", "autonomous", "experimental_full_auto"] as SidepanelSafetyMode[]).forEach((mode) => {
    const option = button(`nc-segment${state.safetyMode === mode ? " nc-segment--active" : ""}`, formatSafetyMode(mode));
    option.setAttribute("aria-pressed", String(state.safetyMode === mode));
    option.addEventListener("click", () => handlers.onSafetyModeChange?.(mode));
    options.append(option);
  });
  controls.append(options);
  return controls;
}

function renderInputField(
  label: string,
  value: string,
  onInput: (value: string) => void,
  options: { type?: string; placeholder?: string; autocomplete?: string } = {}
): HTMLElement {
  const wrapper = el("label", "nc-field");
  wrapper.append(el("span", "nc-field__label", label));
  const input = el("input", "nc-input") as HTMLInputElement;
  input.type = options.type ?? "text";
  input.value = value;
  input.placeholder = options.placeholder ?? "";
  if (options.autocomplete) input.setAttribute("autocomplete", options.autocomplete);
  input.addEventListener("input", () => onInput(input.value));
  wrapper.append(input);
  return wrapper;
}

function renderSelectField(
  label: string,
  value: string,
  models: string[],
  onChange: (value: string) => void,
  placeholder: string,
  allowEmpty = false
): HTMLElement {
  const wrapper = el("label", "nc-field");
  wrapper.append(el("span", "nc-field__label", label));
  const select = el("select", "nc-input nc-select") as HTMLSelectElement;
  select.disabled = models.length === 0;
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = placeholder;
  empty.disabled = !allowEmpty;
  select.append(empty);
  models.forEach((model) => {
    const option = document.createElement("option");
    option.value = model;
    option.textContent = model;
    select.append(option);
  });
  select.value = value && models.includes(value) ? value : "";
  select.addEventListener("change", () => onChange(select.value));
  wrapper.append(select);
  return wrapper;
}

function renderModelSettings(state: SidepanelState, handlers: SidepanelHandlers): HTMLElement {
  const group = el("section", "nc-settings-group");
  group.append(el("h3", undefined, "大模型 API"));
  const form = el("form", "nc-settings-form");
  const settings = state.modelSettings ?? defaultModelSettings();
  const detectedModels = state.detectedModels ?? [];

  form.append(
    renderInputField("API", settings.providerBaseUrl, (value) => handlers.onModelSettingChange?.("providerBaseUrl", value), {
      placeholder: "https://api.openai.com/v1",
      autocomplete: "url"
    }),
    renderInputField("API Key", settings.apiKey, (value) => handlers.onModelSettingChange?.("apiKey", value), {
      type: "password",
      placeholder: "sk-...",
      autocomplete: "off"
    })
  );

  if (settings.apiKey.trim()) {
    const row = el("div", "nc-model-detect-row");
    const detect = button("nc-quiet-button nc-model-detect-button", state.modelDetectionStatus === "checking" ? "检测中..." : "检测模型");
    detect.disabled = state.modelDetectionStatus === "checking" || !settings.providerBaseUrl.trim();
    detect.addEventListener("click", () => handlers.onDetectModels?.());
    row.append(detect);
    if (state.modelDetectionMessage) {
      row.append(el("span", `nc-model-detect-message nc-model-detect-message--${state.modelDetectionStatus ?? "idle"}`, state.modelDetectionMessage));
    }
    form.append(row);
  }

  form.append(
    renderSelectField(
      "Planner 模型",
      settings.plannerModel,
      detectedModels,
      (value) => handlers.onModelSettingChange?.("plannerModel", value),
      detectedModels.length > 0 ? "请选择 Planner 模型" : "检测后自动选择第一个模型"
    ),
    renderSelectField(
      "Vision 模型",
      settings.visionModel ?? "",
      detectedModels,
      (value) => handlers.onModelSettingChange?.("visionModel", value),
      detectedModels.length > 0 ? "不启用视觉模型" : "检测后可选择视觉模型",
      true
    )
  );

  const canSave = Boolean(settings.providerBaseUrl.trim() && settings.apiKey.trim() && settings.plannerModel.trim());
  const saved = state.modelSaveStatus === "saved" && !state.modelSettingsDirty;
  const saveRow = el("div", "nc-settings-save-row");
  const save = button("nc-primary-button", "保存设置");
  save.disabled = !canSave || saved;
  save.addEventListener("click", () => handlers.onSaveModelSettings?.());
  saveRow.append(save);
  const saveMessage =
    state.modelSaveMessage ??
    (state.modelSettingsDirty
      ? "有未保存修改"
      : saved
        ? "设置已保存，可开始任务。"
        : canSave
          ? "点击保存后生效。"
          : "检测并选择 Planner 模型后保存。");
  saveRow.append(el("span", `nc-settings-save-message nc-settings-save-message--${state.modelSaveStatus ?? "idle"}`, saveMessage));
  form.append(saveRow);

  form.append(el("p", "nc-settings-note", "API Key 只用于模型检测和后续模型调用配置，不会写入 Trace。"));
  group.append(form);
  return group;
}

function renderSettingsView(state: SidepanelState, handlers: SidepanelHandlers): HTMLElement {
  const view = el("main", "nc-page-view");
  view.append(renderPageHeader("设置", handlers));
  view.append(renderModelSettings(state, handlers), renderOverlayControls(state, handlers), renderSafetyControls(state, handlers));
  return view;
}

function renderComposer(state: SidepanelState, handlers: SidepanelHandlers): HTMLElement {
  const form = el("form", "nc-composer");
  const label = el("label", "nc-composer__field");
  label.append(el("span", "nc-sr-only", "任务描述"));
  const textarea = el("textarea", "nc-textarea") as HTMLTextAreaElement;
  textarea.rows = 3;
  textarea.placeholder = "描述你的任务...（Enter 发送，Shift+Enter 换行）";
  label.append(textarea);

  const submit = iconButton(
    `nc-send-button${state.activeTask && !["completed", "failed", "stopped"].includes(state.activeTask.status) ? " nc-send-button--stop" : ""}`,
    state.activeTask && !["completed", "failed", "stopped"].includes(state.activeTask.status) ? "stop" : "send",
    state.activeTask && !["completed", "failed", "stopped"].includes(state.activeTask.status) ? "停止任务" : "发送任务"
  );
  submit.type = "submit";
  form.append(label, submit);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (state.activeTask && !["completed", "failed", "stopped"].includes(state.activeTask.status)) {
      handlers.onStopTask?.();
      return;
    }
    const text = textarea.value.trim();
    if (!text) return;
    handlers.onSubmitTask?.(text);
    textarea.value = "";
  });

  textarea.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  return form;
}

export function renderSidepanel(root: HTMLElement, input: SidepanelState, handlers: SidepanelHandlers = {}): void {
  const state = withDerivedMode(input);
  const viewName = state.view ?? "chat";
  const shell = el("section", `nc-shell nc-shell--${state.mode} nc-shell--view-${viewName}`);
  shell.append(renderTopBar(state, handlers));

  if (viewName === "history") {
    shell.append(renderHistoryView(state, handlers));
  } else if (viewName === "settings") {
    shell.append(renderSettingsView(state, handlers));
  } else {
    shell.append(renderChatView(state, handlers), renderComposer(state, handlers));
  }

  root.replaceChildren(shell);
}
