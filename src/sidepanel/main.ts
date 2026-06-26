import { sendRuntimeMessage } from "../adapters/chrome/messaging";
import type { SessionStateResponse } from "../shared/protocol";
import { createTranslator, DEFAULT_LOCALE, normalizeLocale, type SidepanelLocale } from "./i18n";
import { renderSidepanel } from "./render";
import { defaultModelSettings, type ModelSettingsState } from "./settings";
import {
  deriveActiveTaskFromEvents,
  mapEventToTimelineItem,
  withDerivedMode,
  type OverlayMode,
  type SessionSummary,
  type SidepanelState,
  type TimelineItem
} from "./state";

const root = document.querySelector<HTMLElement>("#app");
if (!root) {
  throw new Error("Missing #app root");
}
const appRoot = root;
const STORAGE_KEY_SESSION_SUMMARIES = "naturalclick.sidepanel.sessionSummaries.v1";
const STORAGE_KEY_MODEL_SETTINGS = "naturalclick.sidepanel.modelSettings.v1";
const STORAGE_KEY_LOCALE = "naturalclick.sidepanel.locale.v1";

const initialLocale = loadStoredLocale();
const initialT = createTranslator(initialLocale);

let state: SidepanelState = {
  mode: "conversation",
  locale: initialLocale,
  view: "chat",
  overlayMode: "Off",
  safetyMode: "balanced",
  modelConfigured: false,
  traceOpen: false,
  activityText: initialT("activity.waiting"),
  sessions: loadStoredSessions(),
  modelSettings: loadStoredModelSettings(),
  modelSettingsDirty: false,
  modelSaveStatus: "idle",
  detectedModels: loadStoredDetectedModels(),
  modelDetectionStatus: "idle",
  timeline: [welcomeTimelineItem(initialLocale)]
};

state = { ...state, modelConfigured: isModelConfigured(state.modelSettings) };

function hasChromeRuntime(): boolean {
  return Boolean(globalThis.chrome?.runtime?.sendMessage);
}

function currentT(): ReturnType<typeof createTranslator> {
  return createTranslator(state.locale);
}

function welcomeTimelineItem(locale: SidepanelLocale): TimelineItem {
  const t = createTranslator(locale);
  return { id: "welcome", title: t("timeline.ready"), detail: t("timeline.readyDetail") };
}

function formatNow(): string {
  const locale = normalizeLocale(state.locale) === "zh-CN" ? "zh-CN" : "en-US";
  return new Date().toLocaleString(locale, { hour12: false });
}

function loadStoredLocale(): SidepanelLocale {
  try {
    return normalizeLocale(localStorage.getItem(STORAGE_KEY_LOCALE));
  } catch {
    return DEFAULT_LOCALE;
  }
}

function saveStoredLocale(locale: SidepanelLocale): boolean {
  try {
    localStorage.setItem(STORAGE_KEY_LOCALE, locale);
    return true;
  } catch {
    return false;
  }
}

function loadStoredSessions(): SessionSummary[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SESSION_SUMMARIES);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is SessionSummary => {
      if (!item || typeof item !== "object") return false;
      const record = item as Record<string, unknown>;
      return (
        typeof record.id === "string" &&
        typeof record.title === "string" &&
        typeof record.status === "string" &&
        typeof record.updatedAt === "string" &&
        typeof record.eventCount === "number"
      );
    });
  } catch {
    return [];
  }
}

function saveStoredSessions(sessions: SessionSummary[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_SESSION_SUMMARIES, JSON.stringify(sessions));
  } catch {
    // Storage can be unavailable in restricted preview contexts; the sidepanel can still run without history persistence.
  }
}

function loadStoredModelSettings(): ModelSettingsState {
  const fallback = defaultModelSettings();
  try {
    const raw = localStorage.getItem(STORAGE_KEY_MODEL_SETTINGS);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<ModelSettingsState>;
    return {
      ...fallback,
      providerBaseUrl: typeof parsed.providerBaseUrl === "string" ? parsed.providerBaseUrl : fallback.providerBaseUrl,
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
      plannerModel: typeof parsed.plannerModel === "string" ? parsed.plannerModel : "",
      visionModel: typeof parsed.visionModel === "string" ? parsed.visionModel : "",
      apiKeyRef: typeof parsed.apiKeyRef === "string" ? parsed.apiKeyRef : fallback.apiKeyRef
    };
  } catch {
    return fallback;
  }
}

function saveStoredModelSettings(settings: ModelSettingsState): boolean {
  try {
    localStorage.setItem(STORAGE_KEY_MODEL_SETTINGS, JSON.stringify(settings));
    return true;
  } catch {
    // Settings can still be used in memory when storage is unavailable.
    return false;
  }
}

function loadStoredDetectedModels(): string[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_MODEL_SETTINGS}.models`);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
  } catch {
    return [];
  }
}

function saveStoredDetectedModels(models: string[]): boolean {
  try {
    localStorage.setItem(`${STORAGE_KEY_MODEL_SETTINGS}.models`, JSON.stringify(models));
    return true;
  } catch {
    // Detection results are a convenience cache only.
    return false;
  }
}

function isModelConfigured(settings?: ModelSettingsState): boolean {
  return Boolean(settings?.providerBaseUrl.trim() && settings.apiKey.trim() && settings.plannerModel.trim());
}

function buildSessionTitle(timeline: TimelineItem[]): string {
  const firstTask = timeline.find((item) => item.detail)?.detail;
  if (!firstTask) return currentT()("session.untitled");
  return firstTask.length > 28 ? `${firstTask.slice(0, 28)}...` : firstTask;
}

function upsertSessionSummary(
  session: SessionStateResponse,
  timeline: TimelineItem[],
  activeTask: SidepanelState["activeTask"]
): SessionSummary[] {
  if (timeline.length === 0) return state.sessions ?? [];
  const latest = session.events.at(-1);
  const id = session.sessionId ?? session.taskId ?? latest?.taskId ?? "local-session";
  const summary: SessionSummary = {
    id,
    title: buildSessionTitle(timeline),
    status: activeTask?.status ?? "running",
    updatedAt: formatNow(),
    eventCount: timeline.length
  };
  const withoutCurrent = (state.sessions ?? []).filter((item) => item.id !== id);
  return [summary, ...withoutCurrent].slice(0, 20);
}

function buildLogText(): string {
  const t = currentT();
  const lines = [
    t("log.title"),
    `${t("log.exportedAt")}: ${formatNow()}`,
    `${t("log.currentStatus")}: ${state.activeTask?.status ?? "idle"}`,
    "",
    t("log.timeline")
  ];
  const timeline = state.timeline ?? [];
  if (timeline.length === 0) {
    lines.push(t("log.emptyTimeline"));
  } else {
    timeline.forEach((item, index) => {
      lines.push(`${index + 1}. ${item.title}${item.detail ? ` - ${item.detail}` : ""}`);
    });
  }
  if (state.traceSummary?.length) {
    lines.push("", t("log.trace"));
    state.traceSummary.forEach((item) => lines.push(`- ${item}`));
  }
  return `${lines.join("\n")}\n`;
}

function applySession(session: SessionStateResponse): void {
  const timeline = session.events.map((event) => mapEventToTimelineItem(event, state.locale));
  const activeTask = deriveActiveTaskFromEvents(session.events, state.locale);
  const latestItem = timeline.at(-1);
  const sessions = upsertSessionSummary(session, timeline, activeTask);
  saveStoredSessions(sessions);
  state = withDerivedMode({
    ...state,
    activeTask,
    timeline,
    sessions,
    activityText: latestItem?.detail ?? latestItem?.title ?? currentT()("activity.waiting"),
    decisionSummary: latestItem?.title ?? state.decisionSummary,
    evidenceSummary: session.events
      .filter((event) => ["ObservationReceived", "EvidenceAdded", "VisualEvidenceAdded", "VisionCompleted"].includes(event.type))
      .slice(-4)
      .map((event) => {
        const item = mapEventToTimelineItem(event, state.locale);
        return item.detail ?? item.title;
      }),
    traceSummary: session.events.slice(-6).map((event) => `${event.type} · ${event.stepId}`)
  });
}

function appendLocalTimeline(item: TimelineItem): void {
  state = {
    ...state,
    timeline: [...(state.timeline ?? []), item],
    activityText: item.detail ?? item.title
  };
}

function paint(): void {
  renderSidepanel(appRoot, state, {
    onSubmitTask: (text) => {
      void submitText(text);
    },
    onStopTask: () => {
      void stopTask();
    },
    onOverlayModeChange: (mode) => {
      void setOverlayMode(mode as OverlayMode);
    },
    onHighlightTarget: (semanticId) => {
      void highlightTarget(semanticId);
    },
    onOpenSettings: () => {
      state = { ...state, view: "settings", settingsOpen: true };
      paint();
    },
    onCloseSettings: () => {
      state = { ...state, view: "chat", settingsOpen: false };
      paint();
    },
    onOpenHistory: () => {
      state = { ...state, view: "history" };
      paint();
    },
    onBackToChat: () => {
      state = { ...state, view: "chat", settingsOpen: false };
      paint();
    },
    onNewSession: () => {
      const t = currentT();
      state = withDerivedMode({
        ...state,
        view: "chat",
        activeTask: undefined,
        timeline: [],
        decisionSummary: undefined,
        evidenceSummary: [],
        traceSummary: [],
        activityText: t("activity.newSession")
      });
      paint();
    },
    onCopyLog: () => {
      void copyLog();
    },
    onDownloadLog: () => {
      downloadLog();
    },
    onSafetyModeChange: (mode) => {
      state = { ...state, safetyMode: mode as SidepanelState["safetyMode"] };
      paint();
    },
    onModelSettingChange: (field, value) => {
      updateModelSetting(field, value);
    },
    onDetectModels: () => {
      void detectModels();
    },
    onSaveModelSettings: () => {
      saveModelSettings();
    },
    onLocaleChange: (locale) => {
      setLocale(locale);
    }
  });
}

function setLocale(locale: SidepanelLocale): void {
  const nextLocale = normalizeLocale(locale);
  saveStoredLocale(nextLocale);
  const t = createTranslator(nextLocale);
  const timeline = state.timeline ?? [];
  const shouldLocalizeIdleState = !state.activeTask && timeline.every((item) => item.id === "welcome");

  state = {
    ...state,
    locale: nextLocale,
    activityText: shouldLocalizeIdleState ? t("activity.waiting") : state.activityText,
    timeline: shouldLocalizeIdleState ? [welcomeTimelineItem(nextLocale)] : state.timeline,
    modelSaveMessage: undefined,
    modelDetectionMessage: undefined
  };
  paint();
}

async function refreshSession(): Promise<void> {
  if (!hasChromeRuntime()) return;
  const response = await sendRuntimeMessage<SessionStateResponse>({ type: "GET_SESSION_STATE" });
  if (response.ok) {
    applySession(response.data);
    paint();
  }
}

async function submitText(text: string): Promise<void> {
  const t = currentT();
  if (!hasChromeRuntime()) {
    state = {
      ...state,
      view: "chat",
      activityText: t("runtime.unavailable.title"),
      timeline: [{ id: "runtime-unavailable", title: t("runtime.unavailable.title"), detail: text, tone: "warning" }]
    };
    paint();
    return;
  }

  const response = await sendRuntimeMessage<SessionStateResponse>(
    state.activeTask ? { type: "APPEND_INSTRUCTION", text } : { type: "START_TASK", taskText: text }
  );
  if (response.ok) {
    applySession(response.data);
  } else {
    state = {
      ...state,
      activityText: t("runtime.sendFailed"),
      timeline: [{ id: "send-error", title: t("runtime.sendFailed"), detail: response.error, tone: "error" }]
    };
  }
  paint();
}

async function stopTask(): Promise<void> {
  const t = currentT();
  if (!hasChromeRuntime()) {
    appendLocalTimeline({
      id: "stop-runtime-unavailable",
      title: t("runtime.unavailable.title"),
      detail: t("runtime.unavailable.detail"),
      tone: "warning"
    });
    state = withDerivedMode({ ...state, activeTask: state.activeTask ? { ...state.activeTask, status: "stopped" } : undefined });
    paint();
    return;
  }

  const response = await sendRuntimeMessage<SessionStateResponse>({ type: "STOP_TASK", reason: "user_requested" });
  if (response.ok) {
    applySession(response.data);
  } else {
    appendLocalTimeline({ id: "stop-error", title: t("runtime.stopFailed"), detail: response.error, tone: "error" });
  }
  paint();
}

async function setOverlayMode(mode: OverlayMode): Promise<void> {
  state = { ...state, overlayMode: mode };
  paint();

  if (!hasChromeRuntime()) return;
  const response = await sendRuntimeMessage({ type: "SET_OVERLAY_MODE", mode });
  if (!response.ok) {
    appendLocalTimeline({ id: `overlay-${Date.now()}`, title: currentT()("runtime.overlaySyncFailed"), detail: response.error, tone: "warning" });
    paint();
  }
}

async function highlightTarget(semanticId: string): Promise<void> {
  const t = currentT();
  if (!hasChromeRuntime()) {
    appendLocalTimeline({ id: "highlight-runtime-unavailable", title: t("runtime.highlightUnavailable"), detail: semanticId, tone: "warning" });
    paint();
    return;
  }

  const response = await sendRuntimeMessage({ type: "HIGHLIGHT_TARGET", semanticId });
  if (!response.ok) {
    appendLocalTimeline({ id: `highlight-${Date.now()}`, title: t("runtime.highlightFailed"), detail: response.error, tone: "warning" });
    paint();
  }
}

function updateModelSetting(field: "providerBaseUrl" | "apiKey" | "plannerModel" | "visionModel", value: string): void {
  const t = currentT();
  const settings = { ...(state.modelSettings ?? defaultModelSettings()), [field]: value };
  const resetDetection = field === "providerBaseUrl" || field === "apiKey";
  state = {
    ...state,
    modelSettings: settings,
    modelConfigured: false,
    modelSettingsDirty: true,
    modelSaveStatus: "idle",
    modelSaveMessage: t("model.unsaved"),
    modelDetectionStatus: resetDetection ? "idle" : state.modelDetectionStatus,
    modelDetectionMessage: resetDetection ? undefined : state.modelDetectionMessage,
    detectedModels: resetDetection ? [] : state.detectedModels
  };
  paint();
}

function saveModelSettings(): void {
  const t = currentT();
  const settings = state.modelSettings ?? defaultModelSettings();
  if (!isModelConfigured(settings)) {
    state = {
      ...state,
      modelConfigured: false,
      modelSaveStatus: "error",
      modelSaveMessage: t("model.fillRequired")
    };
    paint();
    return;
  }

  const settingsSaved = saveStoredModelSettings(settings);
  const modelsSaved = saveStoredDetectedModels(state.detectedModels ?? []);
  if (!settingsSaved || !modelsSaved) {
    state = {
      ...state,
      modelSaveStatus: "error",
      modelSaveMessage: t("model.storageUnavailable")
    };
    paint();
    return;
  }

  state = {
    ...state,
    modelConfigured: true,
    modelSettingsDirty: false,
    modelSaveStatus: "saved",
    modelSaveMessage: t("model.saved")
  };
  paint();
}

function modelEndpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/models`;
}

function extractModelIds(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  const ids = data
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string") return (item as { id: string }).id;
      return "";
    })
    .filter((item) => item.trim());
  return Array.from(new Set(ids));
}

async function detectModels(): Promise<void> {
  const t = currentT();
  const settings = state.modelSettings ?? defaultModelSettings();
  const providerBaseUrl = settings.providerBaseUrl.trim();
  const apiKey = settings.apiKey.trim();
  if (!providerBaseUrl || !apiKey) {
    state = {
      ...state,
      modelDetectionStatus: "error",
      modelDetectionMessage: t("model.detect.fillRequired")
    };
    paint();
    return;
  }

  state = { ...state, modelDetectionStatus: "checking", modelDetectionMessage: t("model.detect.checking") };
  paint();

  try {
    const response = await fetch(modelEndpoint(providerBaseUrl), {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    if (!response.ok) {
      throw new Error(t("model.detect.httpError", { status: response.status }));
    }
    const models = extractModelIds(await response.json());
    if (models.length === 0) {
      throw new Error(t("model.detect.empty"));
    }
    const nextSettings: ModelSettingsState = {
      ...settings,
      plannerModel: models[0],
      visionModel: settings.visionModel && models.includes(settings.visionModel) ? settings.visionModel : ""
    };
    state = {
      ...state,
      modelSettings: nextSettings,
      modelConfigured: false,
      modelSettingsDirty: true,
      detectedModels: models,
      modelDetectionStatus: "success",
      modelDetectionMessage: t("model.detect.success", { count: models.length, model: models[0] }),
      modelSaveStatus: "idle",
      modelSaveMessage: t("model.unsaved")
    };
  } catch (error) {
    state = {
      ...state,
      modelDetectionStatus: "error",
      modelDetectionMessage: error instanceof Error ? error.message : t("model.detect.failure")
    };
  }
  paint();
}

async function copyLog(): Promise<void> {
  const t = currentT();
  const text = buildLogText();
  if (!navigator.clipboard?.writeText) {
    appendLocalTimeline({ id: `copy-${Date.now()}`, title: t("copy.unavailable.title"), detail: t("copy.unavailable.detail"), tone: "warning" });
    paint();
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    appendLocalTimeline({ id: `copy-${Date.now()}`, title: t("copy.success.title"), detail: t("copy.success.detail"), tone: "success" });
  } catch (error) {
    appendLocalTimeline({ id: `copy-${Date.now()}`, title: t("copy.failure.title"), detail: String(error), tone: "warning" });
  }
  paint();
}

function downloadLog(): void {
  const t = currentT();
  const blob = new Blob([buildLogText()], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `naturalclick-log-${Date.now()}.txt`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  appendLocalTimeline({ id: `download-${Date.now()}`, title: t("download.success.title"), detail: anchor.download, tone: "success" });
  paint();
}

paint();
void refreshSession();
