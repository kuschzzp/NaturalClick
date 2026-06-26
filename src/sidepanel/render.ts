import { button, el } from "./components";
import { createTranslator, normalizeLocale, type SidepanelLocale, type TranslationKey } from "./i18n";
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
  onLocaleChange?: (locale: SidepanelLocale) => void;
}

type Translator = ReturnType<typeof createTranslator>;

function formatSafetyMode(mode: SidepanelSafetyMode, t: Translator): string {
  const labels: Record<SidepanelSafetyMode, TranslationKey> = {
    conservative: "safety.conservative",
    balanced: "safety.balanced",
    autonomous: "safety.autonomous",
    experimental_full_auto: "safety.fullAuto"
  };
  return t(labels[mode]);
}

function formatOverlayMode(mode: OverlayMode, t: Translator): string {
  const labels: Record<OverlayMode, TranslationKey> = {
    Off: "overlay.off",
    Focus: "overlay.focus",
    "All Targets": "overlay.allTargets",
    Evidence: "overlay.evidence",
    Vision: "overlay.vision"
  };
  return t(labels[mode]);
}

function formatTaskStatus(status: string | undefined, t: Translator): string {
  const labels: Record<string, TranslationKey> = {
    running: "status.running",
    planning: "status.planning",
    observing: "status.observing",
    executing: "status.executing",
    verifying: "status.verifying",
    awaiting_confirmation: "status.awaiting_confirmation",
    completed: "status.completed",
    failed: "status.failed",
    stopped: "status.stopped",
    blocked: "status.blocked"
  };
  if (!status) return t("status.idle");
  const key = labels[status];
  return key ? t(key) : status;
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

function renderTopBar(state: SidepanelState, handlers: SidepanelHandlers, t: Translator): HTMLElement {
  const topbar = el("header", "nc-app-header");

  const brand = el("div", "nc-brand");
  const logo = el("img", "nc-brand__logo") as HTMLImageElement;
  logo.src = "icons/icon-48.png";
  logo.alt = "";
  const meta = el("div", "nc-brand__meta");
  meta.append(el("span", "nc-brand__eyebrow", "NaturalClick"));
  meta.append(
    el(
      "h1",
      "nc-brand__title",
      state.view === "settings" ? t("view.settings") : state.view === "history" ? t("view.history") : t("view.chat")
    )
  );
  brand.append(logo, meta);

  const status = el("div", "nc-status");
  status.append(el("span", `nc-status__dot nc-status__dot--${statusTone(state.activeTask?.status)}`));
  status.append(el("span", "nc-status__text", formatTaskStatus(state.activeTask?.status, t)));

  const actions = el("div", "nc-toolbar");
  const copy = iconButton("nc-tool-button", "copy", t("toolbar.copyLog"));
  copy.addEventListener("click", () => handlers.onCopyLog?.());
  const download = iconButton("nc-tool-button", "download", t("toolbar.downloadLog"));
  download.addEventListener("click", () => handlers.onDownloadLog?.());
  const fresh = iconButton("nc-tool-button", "plus", t("toolbar.newSession"));
  fresh.addEventListener("click", () => handlers.onNewSession?.());
  const history = iconButton("nc-tool-button", "history", t("toolbar.history"));
  history.addEventListener("click", () => handlers.onOpenHistory?.());
  const settings = iconButton("nc-tool-button", "settings", t("toolbar.settings"));
  settings.addEventListener("click", () => handlers.onOpenSettings?.());
  actions.append(copy, download, fresh, history, settings);

  topbar.append(brand, status, actions);
  return topbar;
}

function renderGuidance(handlers: SidepanelHandlers, t: Translator): HTMLElement {
  const card = el("article", "nc-inline-alert nc-inline-alert--warning");
  const copy = el("div", "nc-inline-alert__copy");
  copy.append(el("strong", undefined, t("guidance.title")));
  copy.append(el("p", undefined, t("guidance.detail")));
  const open = button("nc-quiet-button", t("guidance.action"));
  open.addEventListener("click", () => handlers.onOpenSettings?.());
  card.append(copy, open);
  return card;
}

function renderEmptyState(t: Translator): HTMLElement {
  const empty = el("section", "nc-empty-state");
  const mark = el("div", "nc-empty-state__mark");
  mark.append(el("span", undefined, "⌁"));
  empty.append(mark);
  empty.append(el("h2", undefined, t("empty.title")));
  empty.append(el("p", undefined, t("empty.detail")));
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

function renderTaskSummary(state: SidepanelState, handlers: SidepanelHandlers, t: Translator): HTMLElement | undefined {
  const task = state.activeTask;
  if (!task) return undefined;

  const card = el("article", "nc-task-summary");
  const top = el("div", "nc-task-summary__top");
  top.append(el("span", "nc-task-summary__label", t("task.current")));
  if (task.semanticTargetId) {
    const highlight = button("nc-quiet-button", t("task.highlightTarget"));
    highlight.addEventListener("click", () => handlers.onHighlightTarget?.(task.semanticTargetId!));
    top.append(highlight);
  }
  card.append(top);
  card.append(el("p", "nc-task-summary__text", task.currentAction ?? t("task.pending")));
  if (task.targetLabel || task.expectedOutcome) {
    const meta = el("dl", "nc-task-summary__meta");
    if (task.targetLabel) meta.append(el("dt", undefined, t("task.target")), el("dd", undefined, task.targetLabel));
    if (task.expectedOutcome) meta.append(el("dt", undefined, t("task.expected")), el("dd", undefined, task.expectedOutcome));
    card.append(meta);
  }
  return card;
}

function renderChatView(state: SidepanelState, handlers: SidepanelHandlers, t: Translator): HTMLElement {
  const view = el("main", "nc-chat-view");
  if (needsModelGuidance(state)) view.append(renderGuidance(handlers, t));

  const taskSummary = renderTaskSummary(state, handlers, t);
  if (taskSummary) view.append(taskSummary);

  const stream = el("section", "nc-chat-stream");
  stream.setAttribute("aria-live", "polite");
  const items = visibleTimelineItems(state.timeline);
  if (items.length === 0) {
    stream.append(renderEmptyState(t));
  } else {
    items.forEach((item) => stream.append(renderTimelineItem(item)));
  }

  const activity = el("section", "nc-activity-bar");
  activity.append(el("strong", undefined, state.activityText ?? state.activeTask?.currentAction ?? t("activity.waiting")));
  stream.append(activity);
  view.append(stream);
  return view;
}

function renderHistoryView(state: SidepanelState, handlers: SidepanelHandlers, t: Translator): HTMLElement {
  const view = el("main", "nc-page-view");
  view.append(renderPageHeader(t("view.history"), handlers, t));

  const list = el("section", "nc-session-list");
  const sessions = state.sessions ?? [];
  if (sessions.length === 0) {
    const empty = el("article", "nc-page-empty");
    empty.append(el("h2", undefined, t("history.emptyTitle")));
    empty.append(el("p", undefined, t("history.emptyDetail")));
    list.append(empty);
  } else {
    sessions.forEach((session) => list.append(renderSessionSummary(session, t)));
  }
  view.append(list);
  return view;
}

function renderSessionSummary(session: SessionSummary, t: Translator): HTMLElement {
  const row = el("article", "nc-session-card");
  const head = el("div", "nc-session-card__head");
  head.append(el("strong", undefined, session.title));
  head.append(el("span", undefined, formatTaskStatus(session.status, t)));
  row.append(head);
  row.append(el("p", undefined, `${t("history.eventCount", { count: session.eventCount })} · ${session.updatedAt}`));
  return row;
}

function renderPageHeader(title: string, handlers: SidepanelHandlers, t: Translator): HTMLElement {
  const header = el("header", "nc-page-header");
  const back = iconButton("nc-back-button", "back", t("page.backToChat"));
  back.addEventListener("click", () => handlers.onBackToChat?.());
  header.append(back, el("h2", undefined, title));
  return header;
}

function renderLanguageControls(state: SidepanelState, handlers: SidepanelHandlers, t: Translator): HTMLElement {
  const controls = el("section", "nc-settings-group");
  controls.append(el("h3", undefined, t("settings.language.title")));
  controls.append(el("p", undefined, t("settings.language.description")));

  const currentLocale = normalizeLocale(state.locale);
  const options = el("div", "nc-segmented nc-segmented--language");
  ([
    ["en", t("settings.language.english")],
    ["zh-CN", t("settings.language.chinese")]
  ] as Array<[SidepanelLocale, string]>).forEach(([locale, label]) => {
    const option = button(`nc-segment${currentLocale === locale ? " nc-segment--active" : ""}`, label);
    option.setAttribute("aria-pressed", String(currentLocale === locale));
    option.addEventListener("click", () => handlers.onLocaleChange?.(locale));
    options.append(option);
  });
  controls.append(options);
  return controls;
}

function renderOverlayControls(state: SidepanelState, handlers: SidepanelHandlers, t: Translator): HTMLElement {
  const controls = el("section", "nc-settings-group");
  controls.append(el("h3", undefined, t("settings.marker.title")));
  controls.append(el("p", undefined, t("settings.marker.description")));

  const options = el("div", "nc-segmented");
  (["Off", "Focus", "All Targets", "Evidence", "Vision"] as OverlayMode[]).forEach((mode) => {
    const option = button(`nc-segment${state.overlayMode === mode ? " nc-segment--active" : ""}`, formatOverlayMode(mode, t));
    option.setAttribute("aria-pressed", String(state.overlayMode === mode));
    option.addEventListener("click", () => handlers.onOverlayModeChange?.(mode));
    options.append(option);
  });
  controls.append(options);
  return controls;
}

function renderSafetyControls(state: SidepanelState, handlers: SidepanelHandlers, t: Translator): HTMLElement {
  const controls = el("section", "nc-settings-group");
  controls.append(el("h3", undefined, t("settings.permission.title")));
  controls.append(el("p", undefined, t("settings.permission.description")));

  const options = el("div", "nc-segmented nc-segmented--safety");
  (["conservative", "balanced", "autonomous", "experimental_full_auto"] as SidepanelSafetyMode[]).forEach((mode) => {
    const option = button(`nc-segment${state.safetyMode === mode ? " nc-segment--active" : ""}`, formatSafetyMode(mode, t));
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

function renderModelSettings(state: SidepanelState, handlers: SidepanelHandlers, t: Translator): HTMLElement {
  const group = el("section", "nc-settings-group");
  group.append(el("h3", undefined, t("settings.model.title")));
  const form = el("form", "nc-settings-form");
  const settings = state.modelSettings ?? defaultModelSettings();
  const detectedModels = state.detectedModels ?? [];

  form.append(
    renderInputField(t("settings.model.api"), settings.providerBaseUrl, (value) => handlers.onModelSettingChange?.("providerBaseUrl", value), {
      placeholder: "https://api.openai.com/v1",
      autocomplete: "url"
    }),
    renderInputField(t("settings.model.apiKey"), settings.apiKey, (value) => handlers.onModelSettingChange?.("apiKey", value), {
      type: "password",
      placeholder: "sk-...",
      autocomplete: "off"
    })
  );

  if (settings.apiKey.trim()) {
    const row = el("div", "nc-model-detect-row");
    const detect = button(
      "nc-quiet-button nc-model-detect-button",
      state.modelDetectionStatus === "checking" ? t("settings.model.detecting") : t("settings.model.detect")
    );
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
      t("settings.model.planner"),
      settings.plannerModel,
      detectedModels,
      (value) => handlers.onModelSettingChange?.("plannerModel", value),
      detectedModels.length > 0 ? t("settings.model.plannerPlaceholder") : t("settings.model.plannerAutoPlaceholder")
    ),
    renderSelectField(
      t("settings.model.vision"),
      settings.visionModel ?? "",
      detectedModels,
      (value) => handlers.onModelSettingChange?.("visionModel", value),
      detectedModels.length > 0 ? t("settings.model.visionPlaceholder") : t("settings.model.visionAutoPlaceholder"),
      true
    )
  );

  const canSave = Boolean(settings.providerBaseUrl.trim() && settings.apiKey.trim() && settings.plannerModel.trim());
  const saved = state.modelSaveStatus === "saved" && !state.modelSettingsDirty;
  const saveRow = el("div", "nc-settings-save-row");
  const save = button("nc-primary-button", t("settings.save"));
  save.disabled = !canSave || saved;
  save.addEventListener("click", () => handlers.onSaveModelSettings?.());
  saveRow.append(save);
  const saveMessage =
    state.modelSaveMessage ??
    (state.modelSettingsDirty
      ? t("settings.save.unsaved")
      : saved
        ? t("settings.save.saved")
        : canSave
          ? t("settings.save.ready")
          : t("settings.save.needsPlanner"));
  saveRow.append(el("span", `nc-settings-save-message nc-settings-save-message--${state.modelSaveStatus ?? "idle"}`, saveMessage));
  form.append(saveRow);

  form.append(el("p", "nc-settings-note", t("settings.model.note")));
  group.append(form);
  return group;
}

function renderSettingsView(state: SidepanelState, handlers: SidepanelHandlers, t: Translator): HTMLElement {
  const view = el("main", "nc-page-view");
  view.append(renderPageHeader(t("view.settings"), handlers, t));
  view.append(
    renderLanguageControls(state, handlers, t),
    renderModelSettings(state, handlers, t),
    renderOverlayControls(state, handlers, t),
    renderSafetyControls(state, handlers, t)
  );
  return view;
}

function renderComposer(state: SidepanelState, handlers: SidepanelHandlers, t: Translator): HTMLElement {
  const form = el("form", "nc-composer");
  const label = el("label", "nc-composer__field");
  label.append(el("span", "nc-sr-only", t("composer.descriptionLabel")));
  const textarea = el("textarea", "nc-textarea") as HTMLTextAreaElement;
  textarea.rows = 3;
  textarea.placeholder = t("composer.placeholder");
  label.append(textarea);

  const submit = iconButton(
    `nc-send-button${state.activeTask && !["completed", "failed", "stopped"].includes(state.activeTask.status) ? " nc-send-button--stop" : ""}`,
    state.activeTask && !["completed", "failed", "stopped"].includes(state.activeTask.status) ? "stop" : "send",
    state.activeTask && !["completed", "failed", "stopped"].includes(state.activeTask.status) ? t("composer.stop") : t("composer.send")
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
  const t = createTranslator(state.locale);
  const viewName = state.view ?? "chat";
  const shell = el("section", `nc-shell nc-shell--${state.mode} nc-shell--view-${viewName}`);
  shell.append(renderTopBar(state, handlers, t));

  if (viewName === "history") {
    shell.append(renderHistoryView(state, handlers, t));
  } else if (viewName === "settings") {
    shell.append(renderSettingsView(state, handlers, t));
  } else {
    shell.append(renderChatView(state, handlers, t), renderComposer(state, handlers, t));
  }

  root.replaceChildren(shell);
}
