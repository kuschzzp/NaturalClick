import { button, el } from "./components";
import type { FileAttachmentContext, GeneratedTextArtifactSummary } from "../core/capabilities/file-artifacts";
import type { ScratchpadFieldValue, ScratchpadRecord } from "../core/capabilities/scratchpad";
import type { ScheduledTaskRecord, ScheduleTrigger } from "../core/capabilities/schedule";
import type { SkillPackageSummary } from "../core/capabilities/skills";
import type { ModelRuntimeConfig } from "../core/model/model-instance";
import { standardRuntimeSettings, type ExecutionPreset, type RuntimeSettings } from "../core/runtime/execution-budget";
import { createTranslator, normalizeLocale, type SidepanelLocale, type TranslationKey } from "./i18n";
import { renderWorkbenchComposerMeta } from "./components/workbench";
import {
  buildRunDigest,
  needsModelGuidance,
  withDerivedMode,
  type OverlayMode,
  type RunDigest,
  type SettingsTabId,
  type SessionRecord,
  type SessionSummary,
  type SidepanelSafetyMode,
  type SidepanelState,
  type ThemeMode,
  type ModelStreamState,
  type TimelineItem
} from "./state";
import {
  defaultCapabilitySettings,
  defaultModelConfigPanelState,
  defaultModelSettings,
  plannerModelChoices,
  visionModelChoices,
  type SearchProviderMode
} from "./settings";
import { buildWorkbenchViewModel } from "./view-model";

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
  onOpenSession?: (sessionId: string) => void;
  onRunSession?: (sessionId: string) => void;
  onDeleteSession?: (sessionId: string) => void;
  onClearHistory?: () => void;
  onBackToHistory?: () => void;
  onCopySessionLog?: (sessionId: string) => void;
  onDownloadSessionLog?: (sessionId: string) => void;
  onBackToChat?: () => void;
  onOpenSchedules?: () => void;
  onSettingsTabChange?: (tab: SettingsTabId | string) => void;
  onToggleToolMenu?: () => void;
  onToggleModelPicker?: () => void;
  onAttachFiles?: (files: File[]) => void;
  onRemoveAttachment?: (attachmentId: string) => void;
  onDownloadArtifact?: (artifactId: string) => void;
  onToggleModelConfigWizard?: () => void;
  onOpenNewModelConfig?: () => void;
  onOpenModelConfigEditor?: (instanceId?: string) => void;
  onCloseModelConfigEditor?: () => void;
  onThemeModeChange?: (mode: ThemeMode | string) => void;
  onModelSettingChange?: (field: "providerBaseUrl" | "apiKey" | "plannerModel" | "visionModel", value: string) => void;
  onPickPlannerModel?: (model: string) => void;
  onModelPickerQueryChange?: (query: string) => void;
  onDetectModels?: () => void;
  onSaveSettings?: () => void;
  onLocaleChange?: (locale: SidepanelLocale) => void;
  onRuntimePresetChange?: (preset: ExecutionPreset) => void;
  onRuntimeNumberChange?: (section: "execution" | "observation", field: string, value: number) => void;
  onRuntimeBooleanChange?: (section: "observation" | "streaming" | "visionFallback", field: string, value: boolean) => void;
  onCapabilitySettingChange?: (section: "skills" | "search", field: string, value: boolean | string | number) => void;
  onOpenSkillsSettings?: () => void;
  onUseSkill?: (skillId: string) => void;
  onUseSearchContext?: () => void;
  onUseScratchpad?: (recordId: string) => void;
  onRecordWorkflowRequest?: () => void;
  onUseSchedule?: (scheduleId: string) => void;
  onRunSchedule?: (scheduleId: string) => void;
  onResolveConsent?: (approved: boolean, scope?: "once" | "task") => void;
  onResumeTask?: () => void;
  onResolvePendingConfirmation?: (approved: boolean) => void;
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
    paused: "status.paused",
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
  if (status === "paused" || status === "awaiting_confirmation") return "warning";
  return "running";
}

function isTerminalStatus(status?: string): boolean {
  return status === "completed" || status === "failed" || status === "stopped";
}

function isPausedStatus(status?: string): boolean {
  return status === "paused";
}

function iconMarkup(name: "copy" | "download" | "newSession" | "history" | "settings" | "back" | "send" | "stop" | "theme" | "schedule" | "tools"): string {
  const icons: Record<typeof name, string> = {
    copy:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>',
    download:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12"></path><path d="m7 10 5 5 5-5"></path><path d="M5 21h14"></path></svg>',
    newSession:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>',
    history:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16"></path><path d="M4 12h16"></path><path d="M4 18h16"></path></svg>',
    settings:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 0 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.3 7A2 2 0 0 1 7.1 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 0 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"></path></svg>',
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"></path></svg>',
    send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"></path><path d="m13 6 6 6-6 6"></path></svg>',
    stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1"></rect></svg>',
    theme: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a7 7 0 1 0 7 7 5 5 0 0 1-7-7Z"></path></svg>',
    schedule: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"></rect><path d="M8 3v4"></path><path d="M16 3v4"></path><path d="M4 10h16"></path></svg>',
    tools: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>'
  };
  return icons[name];
}

function iconButton(className: string, icon: Parameters<typeof iconMarkup>[0], label: string): HTMLButtonElement {
  const node = button(className, "", label);
  node.innerHTML = iconMarkup(icon);
  node.title = label;
  return node;
}

function viewTitle(state: SidepanelState, t: Translator): string {
  if (state.view === "settings") return t("view.settings");
  if (state.view === "schedules") return t("view.schedules");
  if (state.view === "history" || state.view === "history-detail") return t("view.history");
  return t("view.chat");
}

function nextThemeMode(mode: ThemeMode | undefined): ThemeMode {
  if (mode === "light") return "dark";
  if (mode === "dark") return "system";
  return "light";
}

function themeModeLabel(mode: ThemeMode | undefined, t: Translator): string {
  if (mode === "light") return t("toolbar.themeLight");
  if (mode === "dark") return t("toolbar.themeDark");
  return t("toolbar.themeSystem");
}

function renderTopBar(state: SidepanelState, handlers: SidepanelHandlers, t: Translator): HTMLElement {
  const topbar = el("header", "nc-app-header");

  const history = iconButton(`nc-top-icon${state.view === "history" ? " nc-top-icon--active" : ""}`, "history", t("toolbar.history"));
  history.setAttribute("aria-expanded", String(state.view === "history"));
  history.addEventListener("click", () => handlers.onOpenHistory?.());

  const fresh = iconButton("nc-top-icon nc-top-icon--new-session", "newSession", t("toolbar.newSession"));
  fresh.append(el("span", "nc-top-icon__label", t("toolbar.newSessionShort")));
  fresh.addEventListener("click", () => handlers.onNewSession?.());

  const title = el("div", "nc-session-title");
  const logo = el("img", "nc-session-title__logo") as HTMLImageElement;
  logo.src = "icons/icon-48.png";
  logo.alt = "";
  const text = el("span", "nc-session-title__text", state.activeTask?.currentAction || viewTitle(state, t));
  text.title = state.activeTask?.currentAction || viewTitle(state, t);
  title.append(logo, text);

  const status = el("span", `nc-status-pill nc-status-pill--${statusTone(state.activeTask?.status)}`);
  status.append(el("span", "nc-status-pill__dot"));
  status.append(el("span", "nc-status-pill__text", formatTaskStatus(state.activeTask?.status, t)));

  const actions = el("div", "nc-top-actions");
  const theme = iconButton("nc-top-icon", "theme", themeModeLabel(state.themeMode, t));
  theme.dataset.themeMode = state.themeMode ?? "system";
  theme.addEventListener("click", () => handlers.onThemeModeChange?.(nextThemeMode(state.themeMode)));
  const schedule = iconButton(`nc-top-icon${state.view === "schedules" ? " nc-top-icon--active" : ""}`, "schedule", t("toolbar.schedules"));
  schedule.setAttribute("aria-pressed", String(state.view === "schedules"));
  schedule.addEventListener("click", () => handlers.onOpenSchedules?.());
  const settings = iconButton(`nc-top-icon${state.view === "settings" ? " nc-top-icon--active" : ""}`, "settings", t("toolbar.settings"));
  settings.setAttribute("aria-pressed", String(state.view === "settings"));
  settings.addEventListener("click", () => handlers.onOpenSettings?.());
  actions.append(theme, schedule, settings);

  topbar.append(history, fresh, title, status, actions);
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
  const panel = el("div", "nc-empty-state__panel");
  const copy = el("div", "nc-empty-state__copy");
  copy.append(el("h1", undefined, t("empty.title")));
  copy.append(el("p", undefined, t("empty.detail")));
  panel.append(copy);
  empty.append(panel);
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

function runReportTone(state: SidepanelState, items: TimelineItem[]): TimelineItem["tone"] {
  if (state.activeTask?.status === "completed") return "success";
  if (state.activeTask?.status === "failed" || state.activeTask?.status === "blocked") return "error";
  if (state.activeTask?.status === "stopped" || state.activeTask?.status === "awaiting_confirmation" || state.activeTask?.status === "paused") return "warning";
  const lastError = [...items].reverse().find((item) => item.tone === "error" || item.tone === "warning");
  return lastError?.tone ?? "info";
}

function latestNotice(items: TimelineItem[]): TimelineItem | undefined {
  return [...items].reverse().find((item) => item.tone === "error" || item.tone === "warning" || item.tone === "success");
}

function latestMeaningfulItem(items: TimelineItem[]): TimelineItem | undefined {
  return [...items].reverse().find((item) => item.detail || item.title);
}

function renderRunFact(label: string, value: string): HTMLElement {
  const item = el("div", "nc-run-fact");
  item.append(el("span", "nc-run-fact__label", label));
  item.append(el("span", "nc-run-fact__value", value));
  return item;
}

function renderModelOutput(stream: ModelStreamState, t: Translator): HTMLElement {
  const section = el("section", "nc-run-model-output");
  const head = el("div", "nc-run-model-output__head");
  const title = el("div", "nc-run-model-output__title");
  title.append(el("span", "nc-run-model-output__label", t("task.modelOutput")));
  title.append(el("strong", undefined, stream.title));
  head.append(title);

  const metaParts = [
    stream.isStreaming ? t("task.modelOutputStreaming") : t("task.modelOutputLatest"),
    stream.chunkCount ? t("task.modelOutputChunks", { count: stream.chunkCount }) : undefined,
    stream.receivedChars ? t("task.modelOutputChars", { count: stream.receivedChars }) : undefined,
    stream.model
  ].filter(Boolean);
  if (metaParts.length > 0) head.append(el("span", "nc-run-model-output__meta", metaParts.join(" · ")));
  section.append(head);

  const body = el("pre", "nc-run-model-output__body", stream.text || t("task.modelOutputWaiting"));
  body.setAttribute("aria-live", stream.isStreaming ? "polite" : "off");
  if (stream.isStreaming) body.dataset.streaming = "true";
  section.append(body);
  return section;
}

function renderConsentActions(handlers: SidepanelHandlers, t: Translator): HTMLElement {
  const actions = el("div", "nc-consent-actions");
  const allowOnce = button("nc-primary-button", t("consent.allow"));
  allowOnce.addEventListener("click", () => handlers.onResolveConsent?.(true, "once"));
  const allowTask = button("nc-quiet-button", t("consent.allowTask"));
  allowTask.addEventListener("click", () => handlers.onResolveConsent?.(true, "task"));
  const reject = button("nc-danger-button", t("consent.reject"));
  reject.addEventListener("click", () => handlers.onResolveConsent?.(false, "once"));
  actions.append(allowOnce, allowTask, reject);
  return actions;
}

function renderRunTrace(items: TimelineItem[], t: Translator): HTMLElement {
  const details = el("details", "nc-run-trace") as HTMLDetailsElement;
  const summary = el("summary", "nc-run-trace__summary");
  summary.append(el("span", undefined, t("task.trace")));
  summary.append(el("span", "nc-run-trace__count", t("task.traceCount", { count: items.length })));
  details.append(summary);

  const body = el("div", "nc-run-trace__body");
  const steps = el("ol", "nc-run-report__steps");
  for (const item of items) {
    const step = el("li", `nc-run-step nc-run-step--${item.tone ?? "info"}`);
    step.append(el("span", "nc-run-step__dot"));
    const body = el("div", "nc-run-step__body");
    body.append(el("strong", undefined, item.title));
    if (item.detail) body.append(el("p", undefined, item.detail));
    step.append(body);
    steps.append(step);
  }
  body.append(steps);
  details.append(body);
  return details;
}

function renderRunDigest(digest: RunDigest, t: Translator): HTMLElement {
  const section = el("section", "nc-run-digest");
  const head = el("div", "nc-run-digest__head");
  const copy = el("div", "nc-run-digest__copy");
  copy.append(el("span", "nc-run-digest__eyebrow", t("runDigest.title")));
  copy.append(el("p", undefined, digest.summary));
  head.append(copy);
  section.append(head);

  const metrics = el("dl", "nc-run-digest__metrics");
  for (const metric of digest.metrics) {
    const item = el("div", `nc-run-digest__metric${metric.tone ? ` nc-run-digest__metric--${metric.tone}` : ""}`);
    item.append(el("dt", undefined, metric.label), el("dd", undefined, metric.value));
    metrics.append(item);
  }
  section.append(metrics);

  if (digest.recentSteps.length > 0) {
    const steps = el("div", "nc-run-digest__steps");
    steps.append(el("span", "nc-run-digest__steps-label", t("runDigest.recentSteps")));
    const list = el("ol", "nc-run-digest__step-list");
    for (const item of digest.recentSteps) {
      const step = el("li", `nc-run-digest__step nc-run-digest__step--${item.tone ?? "info"}`);
      step.append(el("strong", undefined, item.title));
      if (item.detail) step.append(el("span", undefined, item.detail));
      list.append(step);
    }
    steps.append(list);
    section.append(steps);
  }

  if (digest.hiddenNoiseCount > 0) {
    section.append(el("p", "nc-run-digest__hint", t("runDigest.debugHint", { count: digest.hiddenNoiseCount })));
  }

  return section;
}

function renderRunReport(state: SidepanelState, handlers: SidepanelHandlers, t: Translator, items: TimelineItem[]): HTMLElement {
  const tone = runReportTone(state, items);
  const task = state.activeTask;
  const latest = latestMeaningfulItem(items);
  const digest = buildRunDigest(state.lastSessionEvents ?? [], items, state.locale);
  const report = el("article", `nc-run-report nc-run-report--${tone ?? "info"}`);
  const head = el("header", "nc-run-report__head");
  const identity = el("div", "nc-run-report__identity");
  const avatar = el("img", "nc-run-report__avatar") as HTMLImageElement;
  avatar.src = "icons/icon-32.png";
  avatar.alt = "";
  const copy = el("div", "nc-run-report__copy");
  copy.append(el("span", "nc-run-report__eyebrow", t("task.agentWorking")));
  copy.append(el("h2", undefined, formatTaskStatus(task?.status, t)));
  const current = task?.currentAction ?? latest?.detail ?? latest?.title ?? t("task.pending");
  copy.append(el("p", undefined, current));
  identity.append(avatar, copy);
  head.append(identity);
  const runActions = el("div", "nc-run-report__actions");
  const copyLog = iconButton("nc-inline-icon-button", "copy", t("toolbar.copyLog"));
  copyLog.addEventListener("click", () => handlers.onCopyLog?.());
  const downloadLog = iconButton("nc-inline-icon-button", "download", t("toolbar.downloadLog"));
  downloadLog.addEventListener("click", () => handlers.onDownloadLog?.());
  runActions.append(copyLog, downloadLog);
  if (task?.semanticTargetId) {
    const highlight = button("nc-quiet-button", t("task.highlightTarget"));
    highlight.addEventListener("click", () => handlers.onHighlightTarget?.(task.semanticTargetId!));
    runActions.append(highlight);
  }
  head.append(runActions);
  report.append(head);

  const facts = el("section", "nc-run-facts");
  facts.append(renderRunFact(t("task.currentStep"), latest?.title ?? formatTaskStatus(task?.status, t)));
  if (task?.targetLabel || task?.semanticTargetId) facts.append(renderRunFact(t("task.target"), task.targetLabel ?? task.semanticTargetId!));
  if (task?.expectedOutcome) facts.append(renderRunFact(t("task.expected"), task.expectedOutcome));
  report.append(facts);
  report.append(renderRunDigest(digest, t));

  const showModelStream = state.runtimeSettings?.streaming.showPlannerRawStream ?? standardRuntimeSettings.streaming.showPlannerRawStream;
  if (showModelStream && state.modelStream) {
    report.append(renderModelOutput(state.modelStream, t));
  }

  const notice = latestNotice(items);
  if (notice?.detail) {
    const note = el("div", `nc-run-report__notice nc-run-report__notice--${notice.tone ?? "info"}`);
    note.append(el("strong", undefined, notice.title));
    note.append(el("p", undefined, notice.detail));
    report.append(note);
  }

  report.append(renderRunTrace(items, t));

  if (task?.status === "awaiting_confirmation") {
    report.append(renderConsentActions(handlers, t));
  }
  if (task?.status === "paused") {
    const actions = el("div", "nc-consent-actions");
    const resume = button("nc-primary-button", t("composer.resume"));
    resume.addEventListener("click", () => handlers.onResumeTask?.());
    const stop = button("nc-danger-button", t("composer.stop"));
    stop.addEventListener("click", () => handlers.onStopTask?.());
    actions.append(resume, stop);
    report.append(actions);
  }

  return report;
}

function renderChatSurfaceHeader(state: SidepanelState, items: TimelineItem[], t: Translator): HTMLElement {
  const header = el("header", "nc-chat-surface__header");
  const copy = el("div", "nc-chat-surface__copy");
  copy.append(el("span", "nc-chat-surface__eyebrow", t("chat.surface.eyebrow")));
  copy.append(el("strong", undefined, state.activeTask?.currentAction ?? t("view.chat")));
  copy.append(el("span", undefined, items.length > 0 ? t("chat.surface.events", { count: items.length }) : t("chat.surface.ready")));

  const status = el("span", `nc-chat-surface__status nc-chat-surface__status--${statusTone(state.activeTask?.status)}`);
  status.append(el("span", "nc-chat-surface__dot"));
  status.append(el("span", undefined, formatTaskStatus(state.activeTask?.status, t)));
  header.append(copy, status);
  return header;
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
  if (task.status === "awaiting_confirmation") {
    card.append(renderConsentActions(handlers, t));
  }
  if (task.status === "paused") {
    const actions = el("div", "nc-consent-actions");
    const resume = button("nc-primary-button", t("composer.resume"));
    resume.addEventListener("click", () => handlers.onResumeTask?.());
    const stop = button("nc-danger-button", t("composer.stop"));
    stop.addEventListener("click", () => handlers.onStopTask?.());
    actions.append(resume, stop);
    card.append(actions);
  }
  return card;
}

function renderChatView(state: SidepanelState, handlers: SidepanelHandlers, t: Translator): HTMLElement {
  const view = el("main", "nc-chat-view");
  if (needsModelGuidance(state)) view.append(renderGuidance(handlers, t));

  const stream = el("section", "nc-chat-stream");
  stream.setAttribute("aria-live", "polite");
  const items = visibleTimelineItems(state.timeline);
  const surface = el("section", "nc-chat-surface");
  surface.append(renderChatSurfaceHeader(state, items, t));
  const body = el("div", "nc-chat-surface__body");
  if (items.length === 0) {
    body.append(renderEmptyState(t));
  } else {
    body.append(renderRunReport(state, handlers, t, items));
  }
  surface.append(body);
  stream.append(surface);

  view.append(stream);
  return view;
}

function renderHistoryView(state: SidepanelState, handlers: SidepanelHandlers, t: Translator): HTMLElement {
  const sessions = state.sessions ?? [];
  const view = el("main", "nc-page-view nc-history-page");
  view.setAttribute("aria-label", t("view.history"));

  const head = el("header", "nc-page-header nc-history-page__header");
  const back = iconButton("nc-back-button", "back", t("page.backToChat"));
  back.addEventListener("click", () => handlers.onBackToChat?.());
  const mark = el("img", "nc-session-drawer__logo") as HTMLImageElement;
  mark.src = "icons/icon-48.png";
  mark.alt = "";
  const title = el("div", "nc-session-drawer__title");
  title.append(el("strong", undefined, t("view.history")), el("span", undefined, t("history.localStore")));
  const count = el("span", "nc-session-drawer__count", String(sessions.length));
  count.setAttribute("aria-label", t("history.sessionCount", { count: sessions.length }));
  head.append(back, mark, title, count);
  view.append(head);

  if (state.pendingConfirmation) view.append(renderPendingConfirmation(state, handlers));

  const list = el("section", "nc-session-list");
  list.setAttribute("role", "list");
  if (sessions.length === 0) {
    const empty = el("article", "nc-page-empty nc-session-empty");
    empty.append(el("h2", undefined, t("history.emptyTitle")));
    empty.append(el("p", undefined, t("history.emptyDetail")));
    list.append(empty);
  } else {
    const toolbar = el("section", "nc-history-toolbar nc-history-section-head");
    const caption = el("span", "nc-history-section-head__label");
    caption.append(el("span", "nc-history-section-head__dot"), el("span", undefined, `${t("history.activeGroup")} · ${sessions.length}`));
    toolbar.append(caption);
    const clear = button("nc-danger-button", t("history.clear"));
    clear.addEventListener("click", () => handlers.onClearHistory?.());
    toolbar.append(clear);
    view.append(toolbar);
    sessions.forEach((session) => list.append(renderSessionSummary(session, handlers, t, session.id === state.activeSessionId)));
  }
  view.append(list);
  const footer = el("footer", "nc-history-footer");
  footer.append(el("span", undefined, t("history.localStore")), el("span", undefined, t("history.sessionCount", { count: sessions.length })));
  view.append(footer);
  return view;
}

function renderSessionSummary(session: SessionSummary, handlers: SidepanelHandlers, t: Translator, active = false): HTMLElement {
  const row = el("li", `nc-session-card nc-session-card--${statusTone(session.status)}${active ? " nc-session-card--active" : ""}`);
  row.setAttribute("role", "listitem");
  row.dataset.sessionStatus = session.status;

  const main = button("nc-session-card__main", "", `${session.title}, ${formatTaskStatus(session.status, t)}, ${session.updatedAt}`);
  main.addEventListener("click", () => handlers.onOpenSession?.(session.id));
  const icon = el("span", "nc-session-card__icon");
  const copy = el("span", "nc-session-card__copy");
  const head = el("span", "nc-session-card__head");
  head.append(el("strong", undefined, session.title));
  head.append(el("span", "nc-session-card__status", formatTaskStatus(session.status, t)));
  copy.append(head);
  const meta = el("span", "nc-session-card__meta");
  meta.append(
    el("span", "nc-session-card__time", session.updatedAt),
    el("span", "nc-session-card__events", t("history.eventCount", { count: session.eventCount }))
  );
  copy.append(meta);
  main.append(icon, copy);
  row.append(main);

  const actions = el("div", "nc-session-card__actions");
  const rerun = button("nc-quiet-button", t("history.rerun"));
  rerun.disabled = !session.taskText;
  rerun.addEventListener("click", () => handlers.onRunSession?.(session.id));
  const remove = button("nc-danger-button", t("history.delete"));
  remove.addEventListener("click", () => handlers.onDeleteSession?.(session.id));
  actions.append(rerun, remove);
  row.append(actions);
  return row;
}

function renderPageHeader(title: string, handlers: SidepanelHandlers, t: Translator): HTMLElement {
  const header = el("header", "nc-page-header");
  const back = iconButton("nc-back-button", "back", t("page.backToChat"));
  back.addEventListener("click", () => handlers.onBackToChat?.());
  header.append(back, el("h2", undefined, title));
  return header;
}

function renderHistoryDetailView(state: SidepanelState, handlers: SidepanelHandlers, t: Translator): HTMLElement {
  const view = el("main", "nc-page-view nc-history-detail-view");
  const header = el("header", "nc-page-header nc-history-detail-header");
  const back = iconButton("nc-back-button", "back", t("history.back"));
  back.addEventListener("click", () => handlers.onBackToHistory?.());
  header.append(back, el("h2", undefined, t("history.detailTitle")));
  view.append(header);
  if (state.pendingConfirmation) view.append(renderPendingConfirmation(state, handlers));

  const sessionId = state.selectedSessionId ?? "";
  const summary = (state.sessions ?? []).find((item) => item.id === sessionId);
  const record = sessionId ? state.sessionRecords?.[sessionId] : undefined;
  const session = record ?? summary;

  if (!session) {
    const empty = el("article", "nc-page-empty");
    empty.append(el("h2", undefined, t("history.missingTitle")));
    empty.append(el("p", undefined, t("history.missingDetail")));
    view.append(empty);
    return view;
  }

  view.append(renderHistoryDetailSummary(session, record, handlers, t));

  const timeline = record?.timeline ?? [];
  const list = el("section", "nc-session-detail-list");
  const timelineHead = el("div", "nc-history-detail-timeline-head");
  timelineHead.append(el("span", undefined, t("history.timeline")), el("span", undefined, t("history.eventCount", { count: timeline.length })));
  list.append(timelineHead);
  if (timeline.length === 0) {
    const empty = el("article", "nc-page-empty");
    empty.append(el("h2", undefined, t("history.summaryOnlyTitle")));
    empty.append(el("p", undefined, t("history.summaryOnlyDetail")));
    list.append(empty);
  } else {
    timeline.forEach((item) => list.append(renderTimelineItem(item)));
  }
  view.append(list);
  return view;
}

function renderHistoryDetailSummary(
  session: SessionSummary | SessionRecord,
  record: SessionRecord | undefined,
  handlers: SidepanelHandlers,
  t: Translator
): HTMLElement {
  const card = el("article", "nc-session-detail-card");
  const head = el("div", "nc-session-detail-card__head");
  const identity = el("div", "nc-session-detail-card__identity");
  identity.append(el("span", "nc-session-card__icon nc-session-detail-card__icon"));
  const summaryCopy = el("div", "nc-session-detail-card__copy");
  summaryCopy.append(el("span", "nc-session-detail-card__eyebrow", t("history.summary")));
  const title = el("div", "nc-session-card__head");
  title.append(el("strong", undefined, session.title));
  title.append(el("span", "nc-session-card__status", formatTaskStatus(session.status, t)));
  summaryCopy.append(title);
  identity.append(summaryCopy);
  const events = el("span", "nc-session-detail-card__count", t("history.eventCount", { count: session.eventCount }));
  head.append(identity, events);
  card.append(head);
  const meta = el("p", "nc-session-card__meta nc-session-detail-card__meta");
  meta.append(el("span", undefined, `${t("history.updated")}: ${session.updatedAt}`));
  card.append(meta);

  if (!record) {
    card.append(el("p", "nc-session-card__notice", t("history.summaryOnlyDetail")));
  }

  const actions = el("div", "nc-session-card__actions nc-session-card__actions--detail");
  const copy = button("nc-quiet-button", t("history.copy"));
  copy.addEventListener("click", () => handlers.onCopySessionLog?.(session.id));
  const download = button("nc-quiet-button", t("history.download"));
  download.addEventListener("click", () => handlers.onDownloadSessionLog?.(session.id));
  const rerun = button("nc-quiet-button", t("history.rerun"));
  rerun.disabled = !session.taskText;
  rerun.addEventListener("click", () => handlers.onRunSession?.(session.id));
  const remove = button("nc-danger-button", t("history.delete"));
  remove.addEventListener("click", () => handlers.onDeleteSession?.(session.id));
  const clear = button("nc-danger-button", t("history.clear"));
  clear.addEventListener("click", () => handlers.onClearHistory?.());
  actions.append(copy, download, rerun, remove, clear);
  card.append(actions);
  return card;
}

function renderPendingConfirmation(state: SidepanelState, handlers: SidepanelHandlers): HTMLElement {
  const pending = state.pendingConfirmation;
  const card = el("section", "nc-inline-alert nc-inline-alert--danger nc-pending-confirmation");
  const copy = el("div", "nc-inline-alert__copy");
  copy.append(el("strong", undefined, pending?.message ?? ""));
  card.append(copy);

  const actions = el("div", "nc-pending-confirmation__actions");
  const cancel = button("nc-quiet-button", pending?.cancelLabel ?? "Cancel");
  cancel.addEventListener("click", () => handlers.onResolvePendingConfirmation?.(false));
  const confirm = button("nc-danger-button", pending?.confirmLabel ?? "Confirm");
  confirm.addEventListener("click", () => handlers.onResolvePendingConfirmation?.(true));
  actions.append(cancel, confirm);
  card.append(actions);
  return card;
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

function renderNumberField(label: string, value: number, onInput: (value: number) => void): HTMLElement {
  const wrapper = el("label", "nc-field");
  wrapper.append(el("span", "nc-field__label", label));
  const input = el("input", "nc-input") as HTMLInputElement;
  input.type = "number";
  input.min = "0";
  input.step = "1";
  input.value = String(value);
  input.addEventListener("input", () => {
    const next = Number(input.value);
    if (Number.isFinite(next)) onInput(next);
  });
  wrapper.append(input);
  return wrapper;
}

function renderToggleField(label: string, checked: boolean, onChange: (checked: boolean) => void): HTMLElement {
  const wrapper = el("label", "nc-toggle-field");
  const input = el("input") as HTMLInputElement;
  input.type = "checkbox";
  input.checked = checked;
  input.addEventListener("change", () => onChange(input.checked));
  wrapper.append(input, el("span", undefined, label));
  return wrapper;
}

function renderExecutionControls(state: SidepanelState, handlers: SidepanelHandlers, t: Translator): HTMLElement {
  const group = el("section", "nc-settings-group");
  const settings: RuntimeSettings = state.runtimeSettings ?? standardRuntimeSettings;
  group.append(el("h3", undefined, t("settings.execution.title")));
  group.append(el("p", undefined, t("settings.execution.description")));

  const presets = el("div", "nc-segmented nc-segmented--execution");
  (["light", "standard", "deep", "custom"] as ExecutionPreset[]).forEach((preset) => {
    const option = button(`nc-segment${settings.executionPreset === preset ? " nc-segment--active" : ""}`, t(`settings.execution.preset.${preset}` as TranslationKey));
    option.setAttribute("aria-pressed", String(settings.executionPreset === preset));
    option.addEventListener("click", () => handlers.onRuntimePresetChange?.(preset));
    presets.append(option);
  });
  group.append(presets);

  const budget = el("div", "nc-settings-form nc-settings-form--compact");
  budget.append(
    renderNumberField(t("settings.execution.maxSteps"), settings.execution.maxStepsPerTask, (value) =>
      handlers.onRuntimeNumberChange?.("execution", "maxStepsPerTask", value)
    ),
    renderNumberField(t("settings.execution.maxDuration"), Math.round(settings.execution.maxTaskDurationMs / 1000), (value) =>
      handlers.onRuntimeNumberChange?.("execution", "maxTaskDurationMs", value * 1000)
    ),
    renderNumberField(t("settings.execution.maxModelCalls"), settings.execution.maxModelCallsPerTask, (value) =>
      handlers.onRuntimeNumberChange?.("execution", "maxModelCallsPerTask", value)
    ),
    renderNumberField(t("settings.execution.maxFailures"), settings.execution.maxConsecutiveFailures, (value) =>
      handlers.onRuntimeNumberChange?.("execution", "maxConsecutiveFailures", value)
    ),
    renderNumberField(t("settings.execution.sameRetry"), settings.execution.maxSameCommandRetries, (value) =>
      handlers.onRuntimeNumberChange?.("execution", "maxSameCommandRetries", value)
    ),
    renderNumberField(t("settings.execution.observationRounds"), settings.observation.maxObservationRoundsPerStep, (value) =>
      handlers.onRuntimeNumberChange?.("observation", "maxObservationRoundsPerStep", value)
    ),
    renderNumberField(t("settings.execution.initialCandidates"), settings.observation.initialCandidateLimit, (value) =>
      handlers.onRuntimeNumberChange?.("observation", "initialCandidateLimit", value)
    ),
    renderNumberField(t("settings.execution.expandedCandidates"), settings.observation.expandedCandidateLimit, (value) =>
      handlers.onRuntimeNumberChange?.("observation", "expandedCandidateLimit", value)
    ),
    renderNumberField(t("settings.execution.hardCandidates"), settings.observation.hardCandidateLimit, (value) =>
      handlers.onRuntimeNumberChange?.("observation", "hardCandidateLimit", value)
    ),
    renderNumberField(t("settings.execution.observationTokens"), settings.observation.maxObservationTokensPerStep, (value) =>
      handlers.onRuntimeNumberChange?.("observation", "maxObservationTokensPerStep", value)
    )
  );
  group.append(budget);

  const toggles = el("div", "nc-settings-toggles");
  toggles.append(
    renderToggleField(t("settings.execution.visionTarget"), settings.visionFallback.onTargetNotFound, (checked) =>
      handlers.onRuntimeBooleanChange?.("visionFallback", "onTargetNotFound", checked)
    ),
    renderToggleField(t("settings.execution.visionVerify"), settings.visionFallback.onVerificationInconclusive, (checked) =>
      handlers.onRuntimeBooleanChange?.("visionFallback", "onVerificationInconclusive", checked)
    ),
    renderToggleField(t("settings.execution.streamEvents"), settings.streaming.runtimeEvents, (checked) =>
      handlers.onRuntimeBooleanChange?.("streaming", "runtimeEvents", checked)
    ),
    renderToggleField(t("settings.execution.streamReply"), settings.streaming.assistantReplyTokens, (checked) =>
      handlers.onRuntimeBooleanChange?.("streaming", "assistantReplyTokens", checked)
    ),
    renderToggleField(t("settings.execution.showPlannerRaw"), settings.streaming.showPlannerRawStream, (checked) =>
      handlers.onRuntimeBooleanChange?.("streaming", "showPlannerRawStream", checked)
    )
  );
  group.append(toggles);
  return group;
}

function renderInputField(
  label: string,
  value: string,
  onInput: (value: string) => void,
  options: { type?: string; placeholder?: string; autocomplete?: string; disabled?: boolean; fieldKey?: string } = {}
): HTMLElement {
  const wrapper = el("label", "nc-field");
  wrapper.append(el("span", "nc-field__label", label));
  const input = el("input", "nc-input") as HTMLInputElement;
  input.type = options.type ?? "text";
  input.value = value;
  input.placeholder = options.placeholder ?? "";
  input.disabled = Boolean(options.disabled);
  if (options.fieldKey) input.dataset.ncFieldKey = options.fieldKey;
  if (options.autocomplete) input.setAttribute("autocomplete", options.autocomplete);
  input.addEventListener("input", () => onInput(input.value));
  wrapper.append(input);
  return wrapper;
}

function renderModelChoiceField(
  label: string,
  value: string,
  models: string[],
  onChange: (value: string) => void,
  placeholder: string,
  countLabel: string,
  allowEmpty = false,
  searchLabels?: { label: string; placeholder: string; noResults: string }
): HTMLElement {
  const wrapper = el("fieldset", "nc-field nc-model-choice-field");
  wrapper.append(el("legend", "nc-field__label", label));

  const selectedValue = value.trim();
  const selectedLabel = selectedValue || placeholder;
  const details = el("details", "nc-model-select");
  const trigger = el("summary", "nc-model-select__trigger");
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  trigger.title = selectedLabel;
  const triggerCopy = el("span", "nc-model-select__trigger-copy");
  triggerCopy.append(el("span", "nc-model-select__value", selectedLabel));
  const metaText = models.length > 0 ? countLabel : placeholder;
  triggerCopy.append(el("span", "nc-model-select__meta", metaText));
  trigger.append(triggerCopy, el("span", "nc-model-select__chevron"));
  details.append(trigger);

  let removeDocumentListeners: (() => void) | undefined;
  const syncOpenState = (): void => {
    trigger.setAttribute("aria-expanded", String(details.open));
    if (!details.open) {
      removeDocumentListeners?.();
      removeDocumentListeners = undefined;
      unmountChoices();
    }
  };
  const closeSelect = (): void => {
    details.open = false;
    syncOpenState();
  };
  const installDocumentListeners = (): void => {
    removeDocumentListeners?.();
    const ownerDocument = details.ownerDocument;
    const onPointerDown = (event: PointerEvent | MouseEvent): void => {
      if (!details.isConnected) {
        removeDocumentListeners?.();
        removeDocumentListeners = undefined;
        return;
      }
      if (event.target instanceof Node && !details.contains(event.target)) {
        closeSelect();
      }
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!details.isConnected) {
        removeDocumentListeners?.();
        removeDocumentListeners = undefined;
        return;
      }
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeSelect();
      trigger.focus();
    };
    ownerDocument.addEventListener("pointerdown", onPointerDown, true);
    ownerDocument.addEventListener("keydown", onKeyDown, true);
    removeDocumentListeners = () => {
      ownerDocument.removeEventListener("pointerdown", onPointerDown, true);
      ownerDocument.removeEventListener("keydown", onKeyDown, true);
    };
  };
  details.addEventListener("toggle", () => {
    syncOpenState();
    if (!details.open) return;
    mountChoices();
    installDocumentListeners();
    queueMicrotask(() => details.querySelector<HTMLElement>(".nc-model-select__search-input, .nc-model-choice--active, .nc-model-select__option")?.focus());
  });

  let choices: HTMLElement | undefined;
  function unmountChoices(): void {
    choices?.remove();
    choices = undefined;
  }

  function mountChoices(): HTMLElement {
    if (choices) return choices;
    const nextChoices = el("div", "nc-model-choice-list nc-model-select__menu");
    const list = el("div", "nc-model-select__options");
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", label);
    const optionValues = Array.from(new Set([...(allowEmpty ? [""] : []), selectedValue, ...models].filter((item) => allowEmpty || item.trim())));
    const selectableModels = optionValues.filter(Boolean);
    const searchEnabled = Boolean(searchLabels && selectableModels.length > 8);
    let noResults: HTMLElement | undefined;
    if (searchEnabled && searchLabels) {
      const searchWrap = el("label", "nc-model-select__search");
      searchWrap.append(el("span", "nc-model-select__search-label", searchLabels.label));
      const searchInput = el("input", "nc-model-select__search-input") as HTMLInputElement;
      searchInput.type = "search";
      searchInput.placeholder = searchLabels.placeholder;
      searchInput.setAttribute("aria-label", searchLabels.label);
      searchInput.addEventListener("input", () => {
        const query = searchInput.value.trim().toLowerCase();
        let visibleCount = 0;
        list.querySelectorAll<HTMLButtonElement>(".nc-model-select__option").forEach((option) => {
          const modelValue = option.dataset.modelValue ?? "";
          const matches = !query || modelValue.toLowerCase().includes(query);
          option.hidden = !matches;
          if (matches) visibleCount += 1;
        });
        if (noResults) noResults.hidden = visibleCount > 0;
      });
      searchWrap.append(searchInput);
      nextChoices.append(searchWrap);
    }
    if (allowEmpty) {
      const empty = button(`nc-model-choice nc-model-select__option${selectedValue === "" ? " nc-model-choice--active" : ""}`, placeholder);
      empty.setAttribute("role", "option");
      empty.setAttribute("aria-selected", String(selectedValue === ""));
      empty.dataset.modelValue = "";
      empty.addEventListener("click", () => {
        onChange("");
        closeSelect();
      });
      list.append(empty);
    }
    if (selectableModels.length === 0) {
      list.append(el("p", "nc-model-choice-empty", placeholder));
    } else {
      selectableModels.forEach((model) => {
        const option = button(`nc-model-choice nc-model-select__option${selectedValue === model ? " nc-model-choice--active" : ""}`, model);
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", String(selectedValue === model));
        option.dataset.modelValue = model;
        option.title = model;
        option.addEventListener("click", () => {
          onChange(model);
          closeSelect();
        });
        list.append(option);
      });
    }
    if (searchEnabled && searchLabels) {
      noResults = el("p", "nc-model-choice-empty nc-model-choice-empty--filtered", searchLabels.noResults);
      noResults.hidden = true;
      list.append(noResults);
    }
    nextChoices.append(list);
    details.append(nextChoices);
    choices = nextChoices;
    return nextChoices;
  }
  wrapper.append(details);
  return wrapper;
}

function modelPoolForSettings(settings: ReturnType<typeof defaultModelSettings>, detectedModels: string[]): string[] {
  const values = [settings.plannerModel, settings.visionModel ?? "", ...detectedModels].map((item) => item.trim()).filter(Boolean);
  return Array.from(new Set(values));
}

function renderProviderSummary(state: SidepanelState, t: Translator): HTMLElement {
  const settings = state.modelSettings ?? defaultModelSettings();
  const summary = el("section", "nc-provider-summary");
  summary.append(el("span", "nc-provider-summary__label", t("settings.myConfigs.providerSection")));

  const trigger = el("div", "nc-provider-summary__trigger");
  const icon = el("span", "nc-provider-summary__icon", "OC");
  const copy = el("span", "nc-provider-summary__copy");
  copy.append(el("strong", undefined, t("settings.myConfigs.openaiCompatible")));
  copy.append(el("span", undefined, settings.providerBaseUrl || t("modelPicker.noProvider")));
  const statePill = el("span", "nc-provider-summary__state", t("settings.myConfigs.providerLocked"));
  trigger.append(icon, copy, statePill);
  summary.append(trigger);
  return summary;
}

function renderModelPool(settings: ReturnType<typeof defaultModelSettings>, detectedModels: string[], t: Translator): HTMLElement {
  const pool = modelPoolForSettings(settings, detectedModels);
  const selectedModels = Array.from(new Set([settings.plannerModel, settings.visionModel ?? ""].map((item) => item.trim()).filter(Boolean)));
  const section = el("section", "nc-config-section nc-config-section--models");
  const head = el("div", "nc-model-pool-header");
  const copy = el("div", "nc-model-pool-header__copy");
  copy.append(el("strong", undefined, t("settings.myConfigs.modelPool")));
  copy.append(el("span", undefined, t("settings.myConfigs.modelPoolDetail")));
  head.append(copy, el("span", "nc-model-pool-header__count", t("settings.myConfigs.modelCount", { count: pool.length })));
  section.append(head);

  const list = el("div", "nc-config-model-list");
  if (selectedModels.length === 0) {
    list.append(
      el(
        "p",
        "nc-model-choice-empty",
        detectedModels.length > 0 ? t("settings.myConfigs.modelPoolEmpty") : t("settings.model.plannerAutoPlaceholder")
      )
    );
  } else {
    selectedModels.forEach((model) => {
      const row = el("div", "nc-config-model-row");
      const id = el("span", "nc-config-model-row__id", model);
      const tags = el("span", "nc-config-model-row__tags");
      if (model === settings.plannerModel) tags.append(el("span", "nc-config-model-tag nc-config-model-tag--active", t("settings.model.planner")));
      if (model === settings.visionModel) tags.append(el("span", "nc-config-model-tag", t("modelPicker.vision")));
      if (tags.childNodes.length === 0 && !detectedModels.includes(model)) {
        tags.append(el("span", "nc-config-model-tag", t("settings.myConfigs.modelCustom")));
      }
      row.append(id, tags);
      list.append(row);
    });
  }
  section.append(list);
  return section;
}

function maskSecret(value: string, t: Translator): string {
  const trimmed = value.trim();
  if (!trimmed) return t("settings.myConfigs.keyMissing");
  if (trimmed.length <= 8) return "••••••••";
  return `•••• ${trimmed.slice(-4)}`;
}

function hasModelConfigDraft(state: SidepanelState): boolean {
  const settings = state.modelSettings ?? defaultModelSettings();
  return Boolean(
    (state.modelConfigState?.instances.length ?? 0) > 0 ||
    settings.apiKey.trim() ||
      settings.plannerModel.trim() ||
      (settings.visionModel ?? "").trim() ||
      (state.detectedModels ?? []).some((model) => model.trim())
  );
}

function modelConfigPanelForState(state: SidepanelState): ReturnType<typeof defaultModelConfigPanelState> {
  const settings = state.modelSettings ?? defaultModelSettings();
  const coreConfig = state.modelConfigState;
  if (coreConfig?.instances.length) {
    return {
      instances: coreConfig.instances,
      activeSelection: coreConfig.roleSelections?.planner ?? coreConfig.activeSelection,
      draft: settings,
      saving: false
    };
  }
  return defaultModelConfigPanelState(settings, state.detectedModels ?? []);
}

function renderModelInstanceCard(
  state: SidepanelState,
  handlers: SidepanelHandlers,
  t: Translator,
  instance = modelConfigPanelForState(state).instances[0]
): HTMLElement {
  const settings = state.modelSettings ?? defaultModelSettings();
  const detectedModels = state.detectedModels ?? [];
  const panel = modelConfigPanelForState(state);
  const plannerSelection = panel.activeSelection;
  const visionSelection = state.modelConfigState?.roleSelections?.vision;
  const plannerModel = !instance || plannerSelection?.instanceId === instance.id ? (plannerSelection?.model ?? settings.plannerModel) : "";
  const visionModel = !instance || visionSelection?.instanceId === instance.id ? (visionSelection?.model ?? settings.visionModel ?? "") : "";
  const instanceModels = instance?.models.map((model) => model.id) ?? detectedModels;
  const cardSettings = {
    ...settings,
    providerBaseUrl: instance?.baseUrl ?? settings.providerBaseUrl,
    plannerModel,
    visionModel
  };
  const isActive = Boolean(plannerModel.trim());
  const card = el("article", `nc-config-card${isActive ? " nc-config-card--active" : ""}`);

  const head = el("div", "nc-config-card__head");
  const avatar = el("span", "nc-config-card__avatar", "OC");
  const title = el("div", "nc-config-card__title");
  title.append(el("strong", undefined, instance?.label ?? t("settings.myConfigs.openaiCompatible")));
  title.append(el("span", undefined, (instance?.baseUrl ?? settings.providerBaseUrl) || t("modelPicker.noProvider")));
  const badge = el("span", `nc-config-card__badge${isActive ? " nc-config-card__badge--active" : ""}`);
  badge.textContent = isActive ? t("settings.myConfigs.active") : t("settings.myConfigs.incomplete");
  const actions = el("div", "nc-config-card__actions");
  const edit = button("nc-quiet-button nc-config-card__edit", t("settings.myConfigs.editConfigButton"));
  edit.addEventListener("click", () => handlers.onOpenModelConfigEditor?.(instance?.id));
  actions.append(badge, edit);
  head.append(avatar, title, actions);

  const chips = el("div", "nc-config-card__chips");
  chips.append(el("span", "nc-config-chip", `${t("settings.model.planner")}: ${plannerModel || t("modelPicker.noModel")}`));
  chips.append(el("span", "nc-config-chip", `${t("modelPicker.vision")}: ${visionModel || t("modelPicker.noVision")}`));
  chips.append(el("span", "nc-config-chip", t("settings.myConfigs.modelCount", { count: Math.max(instanceModels.length, detectedModels.length) })));

  const meta = el("div", "nc-config-card__meta");
  meta.append(el("span", undefined, `${t("settings.myConfigs.key")}: ${maskSecret(settings.apiKey, t)}`));
  meta.append(el("span", undefined, `${t("settings.myConfigs.endpoint")}: ${instance?.endpointVariant ?? "openai_compatible"}`));

  const modelPreview = renderModelPool(cardSettings, instanceModels, t);
  modelPreview.classList.add("nc-config-section--embedded");

  card.append(head, chips, meta, modelPreview);
  return card;
}

function renderModelInstanceCards(state: SidepanelState, handlers: SidepanelHandlers, t: Translator): HTMLElement[] {
  const panel = modelConfigPanelForState(state);
  if (panel.instances.length === 0) return [];
  return panel.instances.map((instance) => renderModelInstanceCard(state, handlers, t, instance));
}

function isEditingExistingModelInstance(state: SidepanelState): boolean {
  return Boolean(state.editingModelInstanceId && state.modelConfigState?.instances.some((instance) => instance.id === state.editingModelInstanceId));
}

function renderModelConfigWizard(state: SidepanelState, handlers: SidepanelHandlers, t: Translator): HTMLElement {
  const isEditing = state.editingModelInstanceId ? isEditingExistingModelInstance(state) : hasModelConfigDraft(state);
  const backdrop = el("section", "nc-config-dialog-backdrop");
  const group = el("section", "nc-config-wizard nc-config-dialog");
  group.setAttribute("role", "dialog");
  group.setAttribute("aria-modal", "true");
  group.setAttribute("aria-labelledby", "nc-model-config-dialog-title");
  const head = el("div", "nc-config-wizard__head");
  const title = el("div", "nc-config-wizard__title");
  title.append(el("span", "nc-config-wizard__eyebrow", isEditing ? t("settings.myConfigs.wizardEditEyebrow") : t("settings.myConfigs.wizardEyebrow")));
  const heading = el("h3", undefined, t("settings.model.title"));
  heading.id = "nc-model-config-dialog-title";
  title.append(heading);
  title.append(el("p", undefined, isEditing ? t("settings.myConfigs.wizardEditDetail") : t("settings.myConfigs.wizardDetail")));
  const close = button("nc-quiet-button nc-config-dialog__close", t("settings.myConfigs.closeConfigButton"));
  close.addEventListener("click", () => handlers.onCloseModelConfigEditor?.());
  head.append(title, close);
  group.append(head);

  const providerGrid = el("div", "nc-provider-grid");
  const compatible = button("nc-provider-option nc-provider-option--active", t("settings.myConfigs.openaiCompatible"));
  compatible.setAttribute("aria-pressed", "true");
  compatible.append(el("span", "nc-provider-option__meta", "OpenAI / Qwen / DeepSeek / custom"));
  const managed = button("nc-provider-option", t("settings.myConfigs.managedProvider"));
  managed.disabled = true;
  managed.append(el("span", "nc-provider-option__meta", t("tools.comingSoon")));
  providerGrid.append(compatible, managed);
  group.append(providerGrid);

  const form = el("form", "nc-settings-form");
  const settings = state.modelSettings ?? defaultModelSettings();
  const detectedModels = state.detectedModels ?? [];
  const plannerModels = plannerModelChoices(detectedModels, settings.plannerModel);
  const visionModels = visionModelChoices(detectedModels, settings.visionModel ?? "");

  form.append(renderProviderSummary(state, t));

  const apiSection = el("section", "nc-config-section nc-config-section--api");
  apiSection.append(el("span", "nc-config-section__label", t("settings.myConfigs.apiSection")));
  apiSection.append(
    renderInputField(t("settings.model.api"), settings.providerBaseUrl, (value) => handlers.onModelSettingChange?.("providerBaseUrl", value), {
      placeholder: "https://api.openai.com/v1",
      autocomplete: "url",
      fieldKey: "model-provider-base-url"
    }),
    renderInputField(t("settings.model.apiKey"), settings.apiKey, (value) => handlers.onModelSettingChange?.("apiKey", value), {
      type: "password",
      placeholder: "sk-...",
      autocomplete: "off",
      fieldKey: "model-api-key"
    })
  );
  form.append(apiSection);

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

  const activeSection = el("section", "nc-config-section nc-config-section--active-model");
  activeSection.append(el("span", "nc-config-section__label", t("settings.myConfigs.currentModel")));
  activeSection.append(
    renderModelChoiceField(
      t("settings.model.planner"),
      settings.plannerModel,
      plannerModels,
      (value) => handlers.onModelSettingChange?.("plannerModel", value),
      detectedModels.length > 0 ? t("settings.model.plannerPlaceholder") : t("settings.model.plannerAutoPlaceholder"),
      t("settings.myConfigs.modelCount", { count: plannerModels.length }),
      false,
      { label: t("modelPicker.search"), placeholder: t("modelPicker.searchPlaceholder"), noResults: t("modelPicker.noResults") }
    ),
    renderModelChoiceField(
      t("settings.model.vision"),
      settings.visionModel ?? "",
      visionModels,
      (value) => handlers.onModelSettingChange?.("visionModel", value),
      detectedModels.length > 0 ? t("settings.model.visionPlaceholder") : t("settings.model.visionAutoPlaceholder"),
      t("settings.myConfigs.modelCount", { count: visionModels.length }),
      true,
      { label: t("modelPicker.search"), placeholder: t("modelPicker.searchPlaceholder"), noResults: t("modelPicker.noResults") }
    )
  );
  form.append(activeSection, renderModelPool(settings, detectedModels, t));

  form.append(el("p", "nc-settings-note", t("settings.model.note")));
  group.append(form);
  const footer = el("footer", "nc-config-dialog__footer");
  footer.append(el("p", `nc-settings-save-message nc-settings-save-message--${state.settingsSaveStatus ?? "idle"}`, settingsSaveMessage(state, t)));
  const cancel = button("nc-quiet-button", t("settings.myConfigs.closeConfigButton"));
  cancel.addEventListener("click", () => handlers.onCloseModelConfigEditor?.());
  const save = button("nc-primary-button", t("settings.save"));
  save.disabled = !state.settingsDirty;
  save.addEventListener("click", () => handlers.onSaveSettings?.());
  const actions = el("div", "nc-config-dialog__actions");
  actions.append(cancel, save);
  footer.append(actions);
  group.append(footer);
  backdrop.append(group);
  return backdrop;
}

function renderModelConfigEmptyState(handlers: SidepanelHandlers, t: Translator): HTMLElement {
  const empty = el("article", "nc-config-empty");
  const copy = el("div", "nc-config-empty__copy");
  copy.append(el("strong", undefined, t("settings.myConfigs.emptyTitle")));
  copy.append(el("p", undefined, t("settings.myConfigs.emptyDetail")));
  const add = button("nc-primary-button", t("settings.myConfigs.newConfigButton"));
  add.addEventListener("click", () => handlers.onOpenNewModelConfig?.());
  empty.append(copy, add);
  return empty;
}

function renderModelSettings(state: SidepanelState, handlers: SidepanelHandlers, t: Translator): HTMLElement {
  const group = el("section", "nc-settings-group nc-model-config-center");

  const head = el("div", "nc-config-center__head");
  const title = el("div", "nc-config-center__title");
  title.append(el("h3", undefined, t("settings.myConfigs.title")));
  title.append(el("p", undefined, t("settings.myConfigs.detail")));
  const fresh = button("nc-primary-button nc-config-new-button", t("settings.myConfigs.newConfigButton"));
  fresh.setAttribute("aria-haspopup", "dialog");
  fresh.setAttribute("aria-expanded", String(Boolean(state.modelConfigWizardOpen)));
  fresh.addEventListener("click", () => handlers.onOpenNewModelConfig?.());
  head.append(title, fresh);
  group.append(head);

  const list = el("div", "nc-config-list");
  const cards = renderModelInstanceCards(state, handlers, t);
  if (cards.length > 0) {
    list.append(...cards);
  } else {
    list.append(renderModelConfigEmptyState(handlers, t));
  }
  group.append(list);
  if (state.modelConfigWizardOpen) group.append(renderModelConfigWizard(state, handlers, t));
  return group;
}

function activeRuntimeModelForState(state: SidepanelState): ModelRuntimeConfig | undefined {
  const settings = state.modelSettings ?? defaultModelSettings();
  if (!settings.providerBaseUrl.trim() || !settings.plannerModel.trim()) return undefined;
  return {
    instanceId: "legacy_sidepanel",
    provider: "custom",
    providerLabel: "OpenAI Compatible",
    model: settings.plannerModel,
    baseUrl: settings.providerBaseUrl,
    apiKeyRef: settings.apiKeyRef,
    vision: Boolean(settings.visionModel),
    tools: false,
    maxContextTokens: 128000
  };
}

function settingsSaveMessage(state: SidepanelState, t: Translator): string {
  return (
    state.settingsSaveMessage ??
    (state.settingsDirty
      ? t("settings.save.unsaved")
      : state.settingsSaveStatus === "saved"
        ? t("settings.save.saved")
        : t("settings.save.ready"))
  );
}

function renderSettingsSaveBar(state: SidepanelState, handlers: SidepanelHandlers, t: Translator): HTMLElement {
  const bar = el("section", "nc-settings-save-bar");
  const copy = el("div", "nc-settings-save-bar__copy");
  copy.append(el("strong", undefined, t("settings.save.title")));
  copy.append(el("p", `nc-settings-save-message nc-settings-save-message--${state.settingsSaveStatus ?? "idle"}`, settingsSaveMessage(state, t)));
  const save = button("nc-primary-button", t("settings.save"));
  save.disabled = !state.settingsDirty;
  save.addEventListener("click", () => handlers.onSaveSettings?.());
  bar.append(copy, save);
  return bar;
}

function settingsTabLabel(tab: SettingsTabId, t: Translator): string {
  const labels: Record<SettingsTabId, string> = {
    configs: t("settings.tabs.configs"),
    skills: t("settings.tabs.skills"),
    search: t("settings.tabs.search"),
    general: t("settings.tabs.general")
  };
  return labels[tab];
}

function settingsTabDetail(tab: SettingsTabId, t: Translator): string {
  const labels: Record<SettingsTabId, TranslationKey> = {
    configs: "settings.tabs.configsDetail",
    skills: "settings.tabs.skillsDetail",
    search: "settings.tabs.searchDetail",
    general: "settings.tabs.generalDetail"
  };
  return t(labels[tab]);
}

function renderSettingsCenterHeader(activeTab: SettingsTabId, state: SidepanelState, t: Translator): HTMLElement {
  const header = el("header", "nc-settings-center-header");
  const copy = el("div", "nc-settings-center-header__copy");
  copy.append(el("span", "nc-settings-center-header__eyebrow", t("settings.center.eyebrow")));
  copy.append(el("h2", undefined, settingsTabLabel(activeTab, t)));
  copy.append(el("p", undefined, settingsTabDetail(activeTab, t)));

  const statusTone = state.settingsDirty ? "dirty" : state.settingsSaveStatus === "saved" ? "saved" : "idle";
  const status = el("aside", `nc-settings-center-status nc-settings-center-status--${statusTone}`);
  status.append(el("span", "nc-settings-center-status__label", t("settings.center.status")));
  status.append(el("strong", undefined, settingsSaveMessage(state, t)));
  status.append(el("span", "nc-settings-center-status__meta", t("settings.center.sections", { count: 4 })));
  header.append(copy, status);
  return header;
}

function renderSettingsPlaceholder(t: Translator, title: string, detail: string, actionLabel: string | undefined, action?: () => void): HTMLElement {
  const group = el("section", "nc-settings-group nc-settings-group--placeholder");
  const head = el("div", "nc-settings-placeholder__head");
  head.append(el("span", "nc-settings-placeholder__mark", "·"));
  const copy = el("div", "nc-settings-placeholder__copy");
  copy.append(el("span", "nc-settings-placeholder__eyebrow", t("settings.placeholder.eyebrow")));
  copy.append(el("h3", undefined, title));
  copy.append(el("p", undefined, detail));
  head.append(copy);
  group.append(head);

  const grid = el("div", "nc-settings-placeholder__grid");
  (
    [
      ["settings.placeholder.chat", "settings.placeholder.chatDetail"],
      ["settings.placeholder.controls", "settings.placeholder.controlsDetail"],
      ["settings.placeholder.ready", "settings.placeholder.readyDetail"]
    ] as [TranslationKey, TranslationKey][]
  ).forEach(([label, body]) => {
    const item = el("article", "nc-settings-placeholder__tile");
    item.append(el("strong", undefined, t(label)), el("span", undefined, t(body)));
    grid.append(item);
  });
  group.append(grid);

  if (actionLabel) {
    const actionButton = button("nc-quiet-button nc-settings-placeholder__action", actionLabel);
    actionButton.addEventListener("click", () => action?.());
    group.append(actionButton);
  }
  return group;
}

function renderCapabilityToggleCard(
  title: string,
  detail: string,
  checked: boolean,
  onChange: (checked: boolean) => void,
  t: Translator
): HTMLElement {
  const card = el("article", `nc-capability-card${checked ? " nc-capability-card--active" : ""}`);
  const copy = el("div", "nc-capability-card__copy");
  copy.append(el("strong", undefined, title));
  copy.append(el("span", undefined, detail));

  const toggle = el("label", "nc-capability-toggle");
  const input = el("input") as HTMLInputElement;
  input.type = "checkbox";
  input.checked = checked;
  input.addEventListener("change", () => onChange(input.checked));
  toggle.append(input, el("span", "nc-capability-toggle__track"), el("span", "nc-capability-toggle__text", checked ? t("settings.capability.enabled") : t("settings.capability.disabled")));
  card.append(copy, toggle);
  return card;
}

function renderSkillsSettings(state: SidepanelState, handlers: SidepanelHandlers, t: Translator): HTMLElement {
  const settings = state.capabilitySettings ?? defaultCapabilitySettings();
  const group = el("section", "nc-settings-group nc-capability-panel");
  const head = el("div", "nc-capability-panel__head");
  const copy = el("div", "nc-capability-panel__copy");
  copy.append(el("h3", undefined, t("settings.skills.title")));
  copy.append(el("p", undefined, t("settings.skills.detail")));
  const status = el("span", `nc-capability-status${settings.skills.slashCommandsEnabled ? " nc-capability-status--active" : ""}`);
  status.textContent = settings.skills.slashCommandsEnabled ? t("settings.capability.enabled") : t("settings.capability.disabled");
  head.append(copy, status);
  group.append(head);

  const grid = el("div", "nc-capability-grid");
  grid.append(
    renderCapabilityToggleCard(
      t("settings.skills.slash.title"),
      t("settings.skills.slash.detail"),
      settings.skills.slashCommandsEnabled,
      (checked) => handlers.onCapabilitySettingChange?.("skills", "slashCommandsEnabled", checked),
      t
    ),
    renderCapabilityToggleCard(
      t("settings.skills.record.title"),
      t("settings.skills.record.detail"),
      settings.skills.recordedWorkflowsEnabled,
      (checked) => handlers.onCapabilitySettingChange?.("skills", "recordedWorkflowsEnabled", checked),
      t
    ),
    renderCapabilityToggleCard(
      t("settings.skills.confirm.title"),
      t("settings.skills.confirm.detail"),
      settings.skills.requireConfirmation,
      (checked) => handlers.onCapabilitySettingChange?.("skills", "requireConfirmation", checked),
      t
    )
  );
  group.append(grid);

  group.append(renderRecordedSkillList(state.skills ?? [], state.skillsLoading, state.skillsError, handlers, t));
  group.append(renderScratchpadList(state.scratchpadRecords ?? [], state.scratchpadLoading, state.scratchpadError, handlers, t));
  return group;
}

function renderRecordedSkillList(
  skills: SkillPackageSummary[],
  loading: boolean | undefined,
  error: string | undefined,
  handlers: SidepanelHandlers,
  t: Translator
): HTMLElement {
  const section = el("section", "nc-skill-list");
  const head = el("div", "nc-skill-list__head");
  head.append(el("strong", undefined, t("settings.skills.saved.title")));
  head.append(el("span", undefined, loading ? t("settings.skills.saved.loading") : t("settings.skills.saved.count", { count: skills.length })));
  section.append(head);

  if (error) {
    section.append(el("p", "nc-skill-list__message nc-skill-list__message--error", error));
    return section;
  }

  if (!skills.length) {
    section.append(el("p", "nc-skill-list__message", loading ? t("settings.skills.saved.loading") : t("settings.skills.saved.empty")));
    return section;
  }

  const list = el("div", "nc-skill-list__items");
  skills.slice(0, 12).forEach((skill) => list.append(renderSkillRow(skill, handlers, t)));
  section.append(list);
  return section;
}

function renderSkillRow(skill: SkillPackageSummary, handlers: SidepanelHandlers, t: Translator): HTMLElement {
  const item = el("article", "nc-skill-row");
  const copy = el("div", "nc-skill-row__copy");
  const title = el("div", "nc-skill-row__title");
  title.append(el("strong", undefined, skill.name), el("span", "nc-skill-row__status", skill.source ?? "skill"));
  copy.append(title, el("p", undefined, skill.description));
  const use = button("nc-quiet-button nc-skill-row__action", t("settings.skills.saved.use"));
  use.addEventListener("click", () => handlers.onUseSkill?.(skill.id));
  item.append(copy, use);
  return item;
}

function renderScratchpadList(
  records: ScratchpadRecord[],
  loading: boolean | undefined,
  error: string | undefined,
  handlers: SidepanelHandlers,
  t: Translator
): HTMLElement {
  const section = el("section", "nc-skill-list nc-scratchpad-list");
  const head = el("div", "nc-skill-list__head");
  head.append(el("strong", undefined, t("settings.scratchpad.title")));
  head.append(el("span", undefined, loading ? t("settings.scratchpad.loading") : t("settings.scratchpad.count", { count: records.length })));
  section.append(head);

  if (error) {
    section.append(el("p", "nc-skill-list__message nc-skill-list__message--error", error));
    return section;
  }

  if (!records.length) {
    section.append(el("p", "nc-skill-list__message", loading ? t("settings.scratchpad.loading") : t("settings.scratchpad.empty")));
    return section;
  }

  const list = el("div", "nc-skill-list__items");
  records.slice(0, 12).forEach((record) => list.append(renderScratchpadRow(record, handlers, t)));
  section.append(list);
  return section;
}

function renderScratchpadRow(record: ScratchpadRecord, handlers: SidepanelHandlers, t: Translator): HTMLElement {
  const item = el("article", "nc-skill-row nc-scratchpad-row");
  const copy = el("div", "nc-skill-row__copy");
  const title = el("div", "nc-skill-row__title");
  title.append(el("strong", undefined, record.id), el("span", "nc-skill-row__status", record.collection));
  copy.append(title, el("p", undefined, scratchpadPreview(record)));
  const use = button("nc-quiet-button nc-skill-row__action", t("settings.scratchpad.use"));
  use.addEventListener("click", () => handlers.onUseScratchpad?.(record.id));
  item.append(copy, use);
  return item;
}

function scratchpadPreview(record: ScratchpadRecord): string {
  const fields = Object.entries(record.fields)
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${scratchpadValueText(value)}`);
  return fields.join(" · ") || record.evidence || record.collection;
}

function scratchpadValueText(value: ScratchpadFieldValue): string {
  if (value === null) return "null";
  return String(value);
}

function renderSearchSettings(state: SidepanelState, handlers: SidepanelHandlers, t: Translator): HTMLElement {
  const settings = state.capabilitySettings ?? defaultCapabilitySettings();
  const group = el("section", "nc-settings-group nc-capability-panel");
  const head = el("div", "nc-capability-panel__head");
  const copy = el("div", "nc-capability-panel__copy");
  copy.append(el("h3", undefined, t("settings.search.title")));
  copy.append(el("p", undefined, t("settings.search.detail")));
  const status = el("span", `nc-capability-status${settings.search.provider !== "disabled" ? " nc-capability-status--active" : ""}`);
  status.textContent = searchProviderLabel(settings.search.provider, t);
  head.append(copy, status);
  group.append(head);

  const provider = el("section", "nc-capability-section");
  provider.append(el("span", "nc-config-section__label", t("settings.search.provider")));
  const options = el("div", "nc-segmented nc-segmented--search-provider");
  (["disabled", "browser_context", "custom_endpoint"] as SearchProviderMode[]).forEach((mode) => {
    const option = button(`nc-segment${settings.search.provider === mode ? " nc-segment--active" : ""}`, searchProviderLabel(mode, t));
    option.setAttribute("aria-pressed", String(settings.search.provider === mode));
    option.addEventListener("click", () => handlers.onCapabilitySettingChange?.("search", "provider", mode));
    options.append(option);
  });
  provider.append(options);
  group.append(provider);

  const customEnabled = settings.search.provider === "custom_endpoint";
  const form = el("div", "nc-settings-form");
  form.append(
    renderInputField(t("settings.search.endpoint"), settings.search.endpoint, (value) => handlers.onCapabilitySettingChange?.("search", "endpoint", value), {
      placeholder: "https://api.example.com/search",
      autocomplete: "url",
      disabled: !customEnabled,
      fieldKey: "search-endpoint"
    }),
    renderInputField(t("settings.search.apiKey"), settings.search.apiKey, (value) => handlers.onCapabilitySettingChange?.("search", "apiKey", value), {
      type: "password",
      placeholder: "optional",
      autocomplete: "off",
      disabled: !customEnabled,
      fieldKey: "search-api-key"
    }),
    renderNumberField(t("settings.search.maxResults"), settings.search.maxResults, (value) =>
      handlers.onCapabilitySettingChange?.("search", "maxResults", value)
    )
  );
  group.append(form);

  const note = el("p", "nc-settings-note", settings.search.provider === "custom_endpoint" ? t("settings.search.customNote") : t("settings.search.browserNote"));
  group.append(note);
  return group;
}

function searchProviderLabel(mode: SearchProviderMode, t: Translator): string {
  const labels: Record<SearchProviderMode, TranslationKey> = {
    disabled: "settings.search.provider.disabled",
    browser_context: "settings.search.provider.browser",
    custom_endpoint: "settings.search.provider.custom"
  };
  return t(labels[mode]);
}

function renderSettingsView(state: SidepanelState, handlers: SidepanelHandlers, t: Translator): HTMLElement {
  const view = el("main", "nc-page-view");
  view.append(renderPageHeader(t("view.settings"), handlers, t));

  const activeTab = state.settingsTab ?? "configs";
  const tabs = el("nav", "nc-settings-tabs");
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", t("view.settings"));
  const tabItems: SettingsTabId[] = ["configs", "skills", "search", "general"];
  tabItems.forEach((id, index) => {
    const option = button(`nc-settings-tab${id === activeTab ? " nc-settings-tab--active" : ""}`, "");
    option.id = `nc-settings-tab-${id}`;
    option.setAttribute("role", "tab");
    option.setAttribute("aria-selected", String(id === activeTab));
    option.setAttribute("aria-controls", `nc-settings-pane-${id}`);
    option.setAttribute("aria-label", `${settingsTabLabel(id, t)}: ${settingsTabDetail(id, t)}`);
    option.append(el("span", "nc-settings-tab__mark", String(index + 1).padStart(2, "0")));
    const copy = el("span", "nc-settings-tab__copy");
    copy.append(el("span", "nc-settings-tab__label", settingsTabLabel(id, t)));
    copy.append(el("span", "nc-settings-tab__detail", settingsTabDetail(id, t)));
    option.append(copy);
    option.addEventListener("click", () => handlers.onSettingsTabChange?.(id));
    tabs.append(option);
  });

  const body = el("section", "nc-settings-layout");
  if (activeTab === "configs") {
    const configs = el("div", "nc-settings-pane nc-settings-pane--configs");
    configs.id = "nc-settings-pane-configs";
    configs.setAttribute("role", "tabpanel");
    configs.setAttribute("aria-labelledby", "nc-settings-tab-configs");
    configs.append(renderModelSettings(state, handlers, t), renderExecutionControls(state, handlers, t), renderSettingsSaveBar(state, handlers, t));
    body.append(configs);
  } else if (activeTab === "general") {
    const general = el("div", "nc-settings-pane nc-settings-pane--general");
    general.id = "nc-settings-pane-general";
    general.setAttribute("role", "tabpanel");
    general.setAttribute("aria-labelledby", "nc-settings-tab-general");
    general.append(renderLanguageControls(state, handlers, t), renderOverlayControls(state, handlers, t), renderSafetyControls(state, handlers, t), renderSettingsSaveBar(state, handlers, t));
    body.append(general);
  } else if (activeTab === "skills") {
    const skills = el("div", "nc-settings-pane nc-settings-pane--skills");
    skills.id = "nc-settings-pane-skills";
    skills.setAttribute("role", "tabpanel");
    skills.setAttribute("aria-labelledby", "nc-settings-tab-skills");
    skills.append(renderSkillsSettings(state, handlers, t), renderSettingsSaveBar(state, handlers, t));
    body.append(skills);
  } else {
    const search = el("div", "nc-settings-pane nc-settings-pane--search");
    search.id = "nc-settings-pane-search";
    search.setAttribute("role", "tabpanel");
    search.setAttribute("aria-labelledby", "nc-settings-tab-search");
    search.append(renderSearchSettings(state, handlers, t), renderSettingsSaveBar(state, handlers, t));
    body.append(search);
  }
  const workbench = el("section", "nc-settings-workbench");
  const panel = el("section", "nc-settings-panel");
  panel.append(renderSettingsCenterHeader(activeTab, state, t), tabs, body);
  workbench.append(panel);
  view.append(workbench);
  return view;
}

function renderSchedulesView(state: SidepanelState, handlers: SidepanelHandlers, t: Translator): HTMLElement {
  const schedules = state.schedules ?? [];
  const readyCount = schedules.filter((schedule) => schedule.status === "ready").length;
  const nextRun = schedules.find((schedule) => typeof schedule.nextRunAt === "number")?.nextRunAt;
  const view = el("main", "nc-page-view nc-schedules-view");
  const header = renderPageHeader(t("view.schedules"), handlers, t);
  header.classList.add("nc-schedules-header");
  view.append(header);

  const body = el("section", "nc-schedules-panel");
  const card = el("section", "nc-schedules-card");
  const head = el("div", "nc-schedules-card__head");
  const copy = el("div", "nc-schedules-card__copy");
  copy.append(el("span", "nc-schedules-card__eyebrow", t("schedules.eyebrow")));
  copy.append(el("h2", undefined, t("schedules.title")));
  copy.append(el("p", undefined, t("schedules.detail")));
  const badge = el("span", "nc-schedules-card__badge", t("schedules.savedCount", { count: schedules.length }));
  head.append(copy, badge);
  card.append(head);

  const stats = el("div", "nc-schedules-stats");
  [
    [t("schedules.nextRun"), nextRun ? formatScheduleTime(nextRun) : t("schedules.manual")],
    [t("schedules.readyCount"), `${readyCount}/${schedules.length}`],
    [t("schedules.engine"), t("schedules.engineDraft")]
  ].forEach(([label, value]) => {
    const stat = el("div", "nc-schedules-stat");
    stat.append(el("span", "nc-schedules-stat__label", label), el("strong", undefined, value));
    stats.append(stat);
  });
  card.append(stats);

  const actions = el("div", "nc-schedules-card__actions");
  const chat = button("nc-primary-button", t("schedules.action"));
  chat.addEventListener("click", () => handlers.onBackToChat?.());
  const settings = button("nc-quiet-button", t("schedules.settings"));
  settings.addEventListener("click", () => handlers.onOpenSettings?.());
  actions.append(chat, settings);
  card.append(actions);

  const listWrap = el("section", "nc-schedules-queue");
  const queueHead = el("div", "nc-schedules-queue__head");
  queueHead.append(el("span", undefined, t("schedules.queue")), el("span", undefined, t("schedules.savedCount", { count: schedules.length })));
  listWrap.append(queueHead);

  const list = el("div", "nc-schedules-list");
  if (state.schedulesError) {
    list.append(el("p", "nc-schedules-empty nc-schedules-empty--error", state.schedulesError));
  } else if (state.schedulesLoading) {
    list.append(el("p", "nc-schedules-empty", t("schedules.loading")));
  } else if (!schedules.length) {
    list.append(el("p", "nc-schedules-empty", t("schedules.empty")));
  } else {
    schedules.forEach((schedule) => list.append(renderScheduleRow(schedule, handlers, t)));
  }
  listWrap.append(list);

  body.append(card, listWrap);
  view.append(body);
  return view;
}

function renderScheduleRow(schedule: ScheduledTaskRecord, handlers: SidepanelHandlers, t: Translator): HTMLElement {
  const item = el("article", `nc-schedule-row nc-schedule-row--${schedule.status}`);
  item.append(el("span", "nc-schedule-row__dot"));
  const itemCopy = el("div", "nc-schedule-row__copy");
  const title = el("div", "nc-schedule-row__title");
  title.append(el("strong", undefined, schedule.title), el("span", "nc-schedule-row__status", scheduleStatusLabel(schedule.status, t)));
  itemCopy.append(title);
  itemCopy.append(el("span", "nc-schedule-row__meta", scheduleTriggerLabel(schedule.trigger, t)));
  itemCopy.append(el("p", undefined, schedule.notes || schedule.taskText));
  const actions = el("div", "nc-schedule-row__actions");
  const run = button("nc-primary-button nc-schedule-row__action", t("schedules.run"));
  run.addEventListener("click", () => handlers.onRunSchedule?.(schedule.id));
  const use = button("nc-quiet-button nc-schedule-row__action", t("schedules.use"));
  use.addEventListener("click", () => handlers.onUseSchedule?.(schedule.id));
  actions.append(run, use);
  item.append(itemCopy, actions);
  return item;
}

function scheduleStatusLabel(status: ScheduledTaskRecord["status"], t: Translator): string {
  if (status === "ready") return t("schedules.statusReady");
  if (status === "paused") return t("schedules.statusPaused");
  return t("schedules.statusDraft");
}

function scheduleTriggerLabel(trigger: ScheduleTrigger, t: Translator): string {
  if (trigger.type === "daily") return trigger.timeOfDay ? `${t("schedules.daily")} · ${trigger.timeOfDay}` : t("schedules.daily");
  if (trigger.type === "weekly") return trigger.timeOfDay ? `${t("schedules.weekly")} · ${trigger.timeOfDay}` : t("schedules.weekly");
  if (trigger.type === "page_change") return trigger.urlPattern ? `${t("schedules.monitor")} · ${trigger.urlPattern}` : t("schedules.monitor");
  return t("schedules.manual");
}

function formatScheduleTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function renderComposerToolsMenu(state: SidepanelState, handlers: SidepanelHandlers, t: Translator): HTMLElement {
  const menu = el("div", "nc-tools-menu");
  menu.setAttribute("role", "menu");
  const capabilitySettings = state.capabilitySettings ?? defaultCapabilitySettings();
  const pendingAttachmentCount = state.pendingAttachments?.length ?? 0;
  const focus = button("nc-tools-menu__item", t("tools.pickElement"));
  focus.setAttribute("role", "menuitem");
  focus.addEventListener("click", () => handlers.onOverlayModeChange?.("Focus"));

  const skills = button("nc-tools-menu__item", t("tools.slashSkills"));
  skills.setAttribute("role", "menuitem");
  skills.disabled = !capabilitySettings.skills.slashCommandsEnabled;
  skills.append(el("span", "nc-tools-menu__hint", capabilitySettings.skills.slashCommandsEnabled ? t("tools.enabled") : t("tools.disabled")));
  skills.addEventListener("click", () => handlers.onOpenSkillsSettings?.());

  const skillItems = renderToolSkillItems(state.skills ?? [], capabilitySettings.skills.slashCommandsEnabled, handlers, t);

  const search = button("nc-tools-menu__item", t("tools.search"));
  search.setAttribute("role", "menuitem");
  search.disabled = capabilitySettings.search.provider === "disabled";
  search.append(el("span", "nc-tools-menu__hint", searchProviderLabel(capabilitySettings.search.provider, t)));
  search.addEventListener("click", () => handlers.onUseSearchContext?.());

  const attach = button("nc-tools-menu__item", t("tools.attachFile"));
  attach.setAttribute("role", "menuitem");
  attach.append(el("span", "nc-tools-menu__hint", pendingAttachmentCount > 0 ? t("attachments.count", { count: pendingAttachmentCount }) : t("tools.enabled")));
  const fileInput = el("input", "nc-file-input nc-sr-only") as HTMLInputElement;
  fileInput.type = "file";
  fileInput.multiple = true;
  fileInput.setAttribute("aria-label", t("tools.attachFile"));
  fileInput.addEventListener("change", () => {
    const files = Array.from(fileInput.files ?? []);
    if (files.length > 0) handlers.onAttachFiles?.(files);
    fileInput.value = "";
  });
  attach.addEventListener("click", () => fileInput.click());

  const record = button("nc-tools-menu__item", t("tools.record"));
  record.setAttribute("role", "menuitem");
  record.disabled = !capabilitySettings.skills.recordedWorkflowsEnabled;
  record.append(el("span", "nc-tools-menu__hint", capabilitySettings.skills.recordedWorkflowsEnabled ? t("tools.enabled") : t("tools.disabled")));
  record.addEventListener("click", () => handlers.onRecordWorkflowRequest?.());

  const copy = button("nc-tools-menu__item", t("toolbar.copyLog"));
  copy.setAttribute("role", "menuitem");
  copy.addEventListener("click", () => handlers.onCopyLog?.());

  const download = button("nc-tools-menu__item", t("toolbar.downloadLog"));
  download.setAttribute("role", "menuitem");
  download.addEventListener("click", () => handlers.onDownloadLog?.());

  const settings = button("nc-tools-menu__item", t("tools.manage"));
  settings.setAttribute("role", "menuitem");
  settings.addEventListener("click", () => handlers.onOpenSettings?.());

  menu.append(focus, skills, ...skillItems, search, attach, fileInput, record, el("div", "nc-tools-menu__divider"), copy, download, settings);
  if (state.overlayMode === "Focus") menu.dataset.focusActive = "true";
  return menu;
}

function renderToolSkillItems(
  skills: SkillPackageSummary[],
  enabled: boolean,
  handlers: SidepanelHandlers,
  t: Translator
): HTMLElement[] {
  if (!enabled) return [];
  if (!skills.length) {
    const empty = el("div", "nc-tools-menu__note", t("tools.skills.empty"));
    return [empty];
  }
  return skills.slice(0, 4).map((skill) => {
    const item = button("nc-tools-menu__item nc-tools-menu__item--skill", skill.name);
    item.setAttribute("role", "menuitem");
    item.title = skill.description;
    item.append(el("span", "nc-tools-menu__hint", t("tools.skills.use")));
    item.addEventListener("click", () => handlers.onUseSkill?.(skill.id));
    return item;
  });
}

function renderModelPickerPopover(state: SidepanelState, handlers: SidepanelHandlers, t: Translator): HTMLElement {
  const settings = state.modelSettings ?? defaultModelSettings();
  const detectedModels = state.detectedModels ?? [];
  const popover = el("div", "nc-model-popover");
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-label", t("modelPicker.title"));

  const head = el("div", "nc-model-popover__head");
  const title = el("div", "nc-model-popover__title");
  title.append(el("span", "nc-model-popover__eyebrow", t("modelPicker.eyebrow")));
  title.append(el("strong", undefined, t("modelPicker.title")));
  title.append(el("span", undefined, settings.providerBaseUrl || t("modelPicker.noProvider")));
  const manage = button("nc-quiet-button", t("modelPicker.manage"));
  manage.addEventListener("click", () => {
    if (handlers.onOpenModelConfigEditor) {
      handlers.onOpenModelConfigEditor();
      return;
    }
    handlers.onOpenSettings?.();
  });
  head.append(title, manage);
  popover.append(head);

  const current = el("div", "nc-model-popover__current");
  current.append(el("span", undefined, t("modelPicker.current")), el("strong", undefined, settings.plannerModel || t("modelPicker.noModel")));
  popover.append(current);

  const activePlannerModel = settings.plannerModel.trim();
  const pickerModels = plannerModelChoices(detectedModels, activePlannerModel);
  const pickerQuery = state.modelPickerQuery ?? "";
  const normalizedQuery = pickerQuery.trim().toLowerCase();
  const visibleModels = normalizedQuery ? pickerModels.filter((model) => model.toLowerCase().includes(normalizedQuery)) : pickerModels;

  if (pickerModels.length > 0) {
    const searchWrap = el("label", "nc-model-popover__search");
    searchWrap.append(el("span", "nc-model-popover__search-label", t("modelPicker.search")));
    const searchInput = document.createElement("input");
    searchInput.className = "nc-model-popover__search-input";
    searchInput.type = "search";
    searchInput.value = pickerQuery;
    searchInput.placeholder = t("modelPicker.searchPlaceholder");
    searchInput.setAttribute("aria-label", t("modelPicker.search"));
    searchInput.addEventListener("input", () => handlers.onModelPickerQueryChange?.(searchInput.value));
    searchWrap.append(searchInput);
    popover.append(searchWrap);
  }

  const list = el("div", "nc-model-popover__list");
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", t("modelPicker.title"));
  if (pickerModels.length === 0) {
    list.append(el("p", "nc-model-popover__empty", t("modelPicker.empty")));
  } else if (visibleModels.length === 0) {
    list.append(el("p", "nc-model-popover__empty", t("modelPicker.noResults")));
  } else {
    visibleModels.forEach((model) => {
      const item = button(`nc-model-popover__item${model === activePlannerModel ? " nc-model-popover__item--active" : ""}`, model);
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(model === activePlannerModel));
      item.title = model;
      item.addEventListener("click", () => {
        if (handlers.onPickPlannerModel) {
          handlers.onPickPlannerModel(model);
          return;
        }
        handlers.onModelSettingChange?.("plannerModel", model);
      });
      list.append(item);
    });
  }
  popover.append(list);

  const footer = el("div", "nc-model-popover__footer");
  footer.append(el("span", undefined, `${t("modelPicker.vision")} · ${settings.visionModel || t("modelPicker.noVision")}`));
  const detect = button("nc-quiet-button", state.modelDetectionStatus === "checking" ? t("settings.model.detecting") : t("settings.model.detect"));
  detect.disabled = state.modelDetectionStatus === "checking" || !settings.providerBaseUrl.trim() || !settings.apiKey.trim();
  detect.addEventListener("click", () => handlers.onDetectModels?.());
  footer.append(detect);
  popover.append(footer);

  return popover;
}

function renderPendingInstructionList(pendingInstructions: NonNullable<SidepanelState["pendingInstructions"]>, t: Translator): HTMLElement | undefined {
  if (pendingInstructions.length === 0) return undefined;

  const list = el("section", "nc-pending-list");
  list.setAttribute("aria-label", t("composer.pendingLabel"));

  const caption = el("div", "nc-pending-list__caption");
  caption.append(
    el("span", "nc-pending-list__dot"),
    el("span", undefined, `${t("composer.pendingPrefix")} · ${pendingInstructions.length} ${t("composer.pendingSuffix")}`),
    el("span", "nc-pending-list__hint", t("composer.pendingHint"))
  );
  list.append(caption);

  pendingInstructions.forEach((instruction) => {
    const item = el("article", "nc-pending-item");
    item.dataset.pendingId = instruction.id;
    item.append(el("span", "nc-pending-item__dot"));
    item.append(el("p", "nc-pending-item__text", instruction.text));
    list.append(item);
  });
  return list;
}

function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

function renderPendingAttachmentList(attachments: FileAttachmentContext[], handlers: SidepanelHandlers, t: Translator): HTMLElement | undefined {
  if (attachments.length === 0) return undefined;

  const list = el("section", "nc-attachment-list");
  list.setAttribute("aria-label", t("attachments.pendingLabel"));
  const caption = el("div", "nc-attachment-list__caption");
  caption.append(
    el("span", "nc-attachment-list__dot"),
    el("span", undefined, `${t("attachments.pendingPrefix")} · ${t("attachments.count", { count: attachments.length })}`),
    el("span", "nc-attachment-list__hint", t("attachments.pendingHint"))
  );
  list.append(caption);

  attachments.forEach((attachment) => {
    const item = el("article", "nc-attachment-item");
    item.dataset.attachmentId = attachment.id;
    const body = el("div", "nc-attachment-item__body");
    body.append(el("strong", "nc-attachment-item__name", attachment.filename));
    body.append(el("span", "nc-attachment-item__meta", [attachment.mime || t("attachments.unknownType"), formatAttachmentSize(attachment.size)].join(" · ")));
    const remove = button("nc-attachment-item__remove", "×", t("attachments.remove", { name: attachment.filename }));
    remove.addEventListener("click", () => handlers.onRemoveAttachment?.(attachment.id));
    item.append(el("span", "nc-attachment-item__icon", "file"), body, remove);
    list.append(item);
  });
  return list;
}

function renderGeneratedArtifactList(artifacts: GeneratedTextArtifactSummary[], handlers: SidepanelHandlers, t: Translator): HTMLElement | undefined {
  if (artifacts.length === 0) return undefined;

  const list = el("section", "nc-attachment-list nc-artifact-list");
  list.setAttribute("aria-label", t("artifacts.label"));
  const caption = el("div", "nc-attachment-list__caption");
  caption.append(
    el("span", "nc-attachment-list__dot"),
    el("span", undefined, `${t("artifacts.prefix")} · ${t("artifacts.count", { count: artifacts.length })}`),
    el("span", "nc-attachment-list__hint", t("artifacts.hint"))
  );
  list.append(caption);

  artifacts.slice(0, 6).forEach((artifact) => {
    const item = el("article", "nc-attachment-item nc-artifact-item");
    item.dataset.artifactId = artifact.id;
    const body = el("div", "nc-attachment-item__body");
    body.append(el("strong", "nc-attachment-item__name", artifact.filename));
    body.append(el("span", "nc-attachment-item__meta", [artifact.mime || t("attachments.unknownType"), formatAttachmentSize(artifact.size)].join(" · ")));
    const download = button("nc-attachment-item__remove nc-artifact-item__download", t("artifacts.download"), t("artifacts.downloadNamed", { name: artifact.filename }));
    download.addEventListener("click", () => handlers.onDownloadArtifact?.(artifact.id));
    item.append(el("span", "nc-attachment-item__icon", "file"), body, download);
    list.append(item);
  });
  return list;
}

function renderComposer(state: SidepanelState, handlers: SidepanelHandlers, t: Translator): HTMLElement {
  const pendingInstructions = state.pendingInstructions ?? [];
  const pendingAttachments = state.pendingAttachments ?? [];
  const generatedArtifacts = state.generatedArtifacts ?? [];
  const hasPendingContext = pendingInstructions.length > 0 || pendingAttachments.length > 0 || generatedArtifacts.length > 0;
  const form = el("form", `nc-composer${hasPendingContext ? " nc-composer--has-pending" : ""}`);
  const vm = buildWorkbenchViewModel({
    mode: state.view === "settings" ? "settings" : state.view === "history" || state.view === "history-detail" ? "sessions" : "conversation",
    locale: normalizeLocale(state.locale),
    activeTask: state.activeTask
      ? {
          taskId: state.activeTask.taskId,
          status: state.activeTask.status,
          title: state.activeTask.currentAction ?? t("view.chat")
        }
      : undefined,
    composerInput: state.composerInput ?? "",
    modelInstances: [],
    activeModel: activeRuntimeModelForState(state),
    timeline: visibleTimelineItems(state.timeline),
    pendingInstructions
  });

  const pendingList = renderPendingInstructionList(pendingInstructions, t);
  if (pendingList) form.append(pendingList);
  const artifactList = renderGeneratedArtifactList(generatedArtifacts, handlers, t);
  if (artifactList) form.append(artifactList);
  const attachmentList = renderPendingAttachmentList(pendingAttachments, handlers, t);
  if (attachmentList) form.append(attachmentList);

  const label = el("label", "nc-composer__field");
  label.append(el("span", "nc-sr-only", t("composer.descriptionLabel")));
  const textarea = el("textarea", "nc-textarea") as HTMLTextAreaElement;
  textarea.rows = 3;
  textarea.value = state.composerInput ?? "";
  textarea.placeholder = t("composer.placeholder");
  label.append(textarea);

  const paused = isPausedStatus(state.activeTask?.status);
  const running = Boolean(state.activeTask && !isTerminalStatus(state.activeTask.status) && !paused);
  const initialHasText = Boolean((state.composerInput ?? "").trim());
  const toolsWrap = el("div", "nc-composer-toolbox");
  const tools = iconButton(`nc-composer-tool${state.toolMenuOpen ? " nc-composer-tool--active" : ""}`, "tools", t("tools.menu"));
  tools.setAttribute("aria-expanded", String(Boolean(state.toolMenuOpen)));
  tools.addEventListener("click", () => handlers.onToggleToolMenu?.());
  toolsWrap.append(tools);
  if (state.toolMenuOpen) toolsWrap.append(renderComposerToolsMenu(state, handlers, t));

  const modelWrap = el("div", "nc-model-picker-wrap");
  const composerMeta = renderWorkbenchComposerMeta(vm, { onOpenSettings: handlers.onOpenSettings, onOpenModelPicker: handlers.onToggleModelPicker });
  composerMeta.classList.add("nc-composer-meta--inline");
  composerMeta.querySelector("button")?.setAttribute("aria-expanded", String(Boolean(state.modelPickerOpen)));
  modelWrap.append(composerMeta);
  if (state.modelPickerOpen) modelWrap.append(renderModelPickerPopover(state, handlers, t));
  const context = el("div", "nc-context-ring");
  const contextText = `${visibleTimelineItems(state.timeline).length}`;
  context.append(el("span", "nc-context-ring__value", contextText), el("span", "nc-context-ring__label", "ctx"));

  const submit = iconButton("nc-send-button", "send", running ? t("composer.queue") : paused ? t("composer.resume") : t("composer.send"));
  submit.type = "submit";
  submit.disabled = !paused && !initialHasText;

  const queueWrap = el("span", `nc-queue-button-wrap${!running || initialHasText ? " nc-queue-button-wrap--visible" : ""}`);
  queueWrap.setAttribute("aria-hidden", String(running && !initialHasText));
  queueWrap.append(submit);

  const leftControls = el("div", "nc-composer__controls-left");
  leftControls.append(toolsWrap);
  const rightControls = el("div", "nc-composer__controls-right");
  rightControls.append(modelWrap, context);

  const row = el("div", "nc-composer__actions");
  row.append(leftControls, rightControls);
  if (running) {
    const stop = iconButton("nc-send-button nc-send-button--stop", "stop", t("composer.stop"));
    stop.addEventListener("click", () => handlers.onStopTask?.());
    rightControls.append(stop, queueWrap);
  } else {
    rightControls.append(queueWrap);
  }
  const frame = el("div", `nc-composer-frame${running ? " nc-composer-frame--running" : paused ? " nc-composer-frame--paused" : ""}`);
  frame.append(label, row);
  form.append(frame);

  const syncSubmitState = () => {
    const hasText = Boolean(textarea.value.trim());
    submit.disabled = !paused && !hasText;
    if (running) {
      queueWrap.classList.toggle("nc-queue-button-wrap--visible", hasText);
      queueWrap.setAttribute("aria-hidden", String(!hasText));
    }
  };
  textarea.addEventListener("input", syncSubmitState);
  syncSubmitState();

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (paused) {
      handlers.onResumeTask?.();
      return;
    }
    const text = textarea.value.trim();
    if (!text) return;
    handlers.onSubmitTask?.(text);
    textarea.value = "";
    syncSubmitState();
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
  const previousPageView = root.querySelector<HTMLElement>(".nc-page-view");
  const previousPageScrollTop = previousPageView?.scrollTop ?? 0;
  const activeElement = root.contains(document.activeElement) ? document.activeElement : undefined;
  const activeFieldKey = activeElement instanceof HTMLInputElement ? activeElement.dataset.ncFieldKey : undefined;
  const activeSelection =
    activeElement instanceof HTMLInputElement
      ? {
          start: activeElement.selectionStart,
          end: activeElement.selectionEnd,
          direction: activeElement.selectionDirection
        }
      : undefined;
  const shell = el("section", `nc-shell nc-shell--${state.mode} nc-shell--view-${viewName}`);
  shell.append(renderTopBar(state, handlers, t));

  if (viewName === "history") {
    shell.append(renderHistoryView(state, handlers, t));
  } else if (viewName === "history-detail") {
    shell.append(renderHistoryDetailView(state, handlers, t));
  } else if (viewName === "settings") {
    shell.append(renderSettingsView(state, handlers, t));
  } else if (viewName === "schedules") {
    shell.append(renderSchedulesView(state, handlers, t));
  } else {
    shell.append(renderChatView(state, handlers, t), renderComposer(state, handlers, t));
  }

  root.replaceChildren(shell);
  const nextPageView = root.querySelector<HTMLElement>(".nc-page-view");
  if (nextPageView && previousPageScrollTop > 0) nextPageView.scrollTop = previousPageScrollTop;
  if (activeFieldKey) {
    const nextActive = Array.from(root.querySelectorAll<HTMLInputElement>("[data-nc-field-key]")).find((node) => node.dataset.ncFieldKey === activeFieldKey);
    nextActive?.focus({ preventScroll: true });
    if (nextActive && activeSelection && nextActive.type !== "number") {
      try {
        nextActive.setSelectionRange(activeSelection.start, activeSelection.end, activeSelection.direction ?? "none");
      } catch {
        // Some input types do not expose text selection; focus restoration is enough for those fields.
      }
    }
  }
  root.querySelectorAll<HTMLElement>(".nc-run-model-output__body[data-streaming='true']").forEach((node) => {
    node.scrollTop = node.scrollHeight;
  });
}
