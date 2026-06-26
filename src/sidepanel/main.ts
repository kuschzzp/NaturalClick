import { sendRuntimeMessage } from "../adapters/chrome/messaging";
import type { SessionStateResponse } from "../shared/protocol";
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

let state: SidepanelState = {
  mode: "conversation",
  view: "chat",
  overlayMode: "Off",
  safetyMode: "balanced",
  modelConfigured: false,
  traceOpen: false,
  activityText: "等待任务...",
  sessions: loadStoredSessions(),
  modelSettings: loadStoredModelSettings(),
  modelSettingsDirty: false,
  modelSaveStatus: "idle",
  detectedModels: loadStoredDetectedModels(),
  modelDetectionStatus: "idle",
  timeline: [{ id: "welcome", title: "准备就绪", detail: "配置 Planner 模型后，就可以让 Agent 操作当前页面。" }]
};

state = { ...state, modelConfigured: isModelConfigured(state.modelSettings) };

function hasChromeRuntime(): boolean {
  return Boolean(globalThis.chrome?.runtime?.sendMessage);
}

function formatNow(): string {
  return new Date().toLocaleString("zh-CN", { hour12: false });
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
  if (!firstTask) return "未命名会话";
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
  const lines = [
    "NaturalClick Agent 执行日志",
    `导出时间: ${formatNow()}`,
    `当前状态: ${state.activeTask?.status ?? "idle"}`,
    "",
    "Timeline:"
  ];
  const timeline = state.timeline ?? [];
  if (timeline.length === 0) {
    lines.push("- 暂无事件");
  } else {
    timeline.forEach((item, index) => {
      lines.push(`${index + 1}. ${item.title}${item.detail ? ` - ${item.detail}` : ""}`);
    });
  }
  if (state.traceSummary?.length) {
    lines.push("", "Trace:");
    state.traceSummary.forEach((item) => lines.push(`- ${item}`));
  }
  return `${lines.join("\n")}\n`;
}

function applySession(session: SessionStateResponse): void {
  const timeline = session.events.map(mapEventToTimelineItem);
  const activeTask = deriveActiveTaskFromEvents(session.events);
  const latestItem = timeline.at(-1);
  const sessions = upsertSessionSummary(session, timeline, activeTask);
  saveStoredSessions(sessions);
  state = withDerivedMode({
    ...state,
    activeTask,
    timeline,
    sessions,
    activityText: latestItem?.detail ?? latestItem?.title ?? "等待任务...",
    decisionSummary: latestItem?.title ?? state.decisionSummary,
    evidenceSummary: session.events
      .filter((event) => ["ObservationReceived", "EvidenceAdded", "VisualEvidenceAdded", "VisionCompleted"].includes(event.type))
      .slice(-4)
      .map((event) => mapEventToTimelineItem(event).detail ?? mapEventToTimelineItem(event).title),
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
      state = withDerivedMode({
        ...state,
        view: "chat",
        activeTask: undefined,
        timeline: [],
        decisionSummary: undefined,
        evidenceSummary: [],
        traceSummary: [],
        activityText: "已新建会话，等待任务..."
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
    }
  });
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
  if (!hasChromeRuntime()) {
    state = {
      ...state,
      view: "chat",
      activityText: "后台运行时不可用",
      timeline: [{ id: "runtime-unavailable", title: "后台运行时不可用", detail: text, tone: "warning" }]
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
      activityText: "无法联系后台运行时",
      timeline: [{ id: "send-error", title: "无法联系后台运行时", detail: response.error, tone: "error" }]
    };
  }
  paint();
}

async function stopTask(): Promise<void> {
  if (!hasChromeRuntime()) {
    appendLocalTimeline({
      id: "stop-runtime-unavailable",
      title: "后台运行时不可用",
      detail: "当前只能在预览状态下停止展示，无法通知 Chrome 扩展后台。",
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
    appendLocalTimeline({ id: "stop-error", title: "停止任务失败", detail: response.error, tone: "error" });
  }
  paint();
}

async function setOverlayMode(mode: OverlayMode): Promise<void> {
  state = { ...state, overlayMode: mode };
  paint();

  if (!hasChromeRuntime()) return;
  const response = await sendRuntimeMessage({ type: "SET_OVERLAY_MODE", mode });
  if (!response.ok) {
    appendLocalTimeline({ id: `overlay-${Date.now()}`, title: "页面标记未同步", detail: response.error, tone: "warning" });
    paint();
  }
}

async function highlightTarget(semanticId: string): Promise<void> {
  if (!hasChromeRuntime()) {
    appendLocalTimeline({ id: "highlight-runtime-unavailable", title: "无法标记页面目标", detail: semanticId, tone: "warning" });
    paint();
    return;
  }

  const response = await sendRuntimeMessage({ type: "HIGHLIGHT_TARGET", semanticId });
  if (!response.ok) {
    appendLocalTimeline({ id: `highlight-${Date.now()}`, title: "目标高亮失败", detail: response.error, tone: "warning" });
    paint();
  }
}

function updateModelSetting(field: "providerBaseUrl" | "apiKey" | "plannerModel" | "visionModel", value: string): void {
  const settings = { ...(state.modelSettings ?? defaultModelSettings()), [field]: value };
  const resetDetection = field === "providerBaseUrl" || field === "apiKey";
  state = {
    ...state,
    modelSettings: settings,
    modelConfigured: false,
    modelSettingsDirty: true,
    modelSaveStatus: "idle",
    modelSaveMessage: "有未保存修改",
    modelDetectionStatus: resetDetection ? "idle" : state.modelDetectionStatus,
    modelDetectionMessage: resetDetection ? undefined : state.modelDetectionMessage,
    detectedModels: resetDetection ? [] : state.detectedModels
  };
  paint();
}

function saveModelSettings(): void {
  const settings = state.modelSettings ?? defaultModelSettings();
  if (!isModelConfigured(settings)) {
    state = {
      ...state,
      modelConfigured: false,
      modelSaveStatus: "error",
      modelSaveMessage: "请先填写 API、API Key，并选择 Planner 模型。"
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
      modelSaveMessage: "保存失败，当前浏览器存储不可用。"
    };
    paint();
    return;
  }

  state = {
    ...state,
    modelConfigured: true,
    modelSettingsDirty: false,
    modelSaveStatus: "saved",
    modelSaveMessage: "设置已保存，可开始任务。"
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
  const settings = state.modelSettings ?? defaultModelSettings();
  const providerBaseUrl = settings.providerBaseUrl.trim();
  const apiKey = settings.apiKey.trim();
  if (!providerBaseUrl || !apiKey) {
    state = {
      ...state,
      modelDetectionStatus: "error",
      modelDetectionMessage: "请先填写 API 和 API Key。"
    };
    paint();
    return;
  }

  state = { ...state, modelDetectionStatus: "checking", modelDetectionMessage: "正在检测模型..." };
  paint();

  try {
    const response = await fetch(modelEndpoint(providerBaseUrl), {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    if (!response.ok) {
      throw new Error(`模型检测失败：HTTP ${response.status}`);
    }
    const models = extractModelIds(await response.json());
    if (models.length === 0) {
      throw new Error("没有检测到可用模型。");
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
      modelDetectionMessage: `检测到 ${models.length} 个模型，已选择 ${models[0]}，请保存设置。`,
      modelSaveStatus: "idle",
      modelSaveMessage: "有未保存修改"
    };
  } catch (error) {
    state = {
      ...state,
      modelDetectionStatus: "error",
      modelDetectionMessage: error instanceof Error ? error.message : "模型检测失败。"
    };
  }
  paint();
}

async function copyLog(): Promise<void> {
  const text = buildLogText();
  if (!navigator.clipboard?.writeText) {
    appendLocalTimeline({ id: `copy-${Date.now()}`, title: "无法复制日志", detail: "当前环境没有剪贴板权限。", tone: "warning" });
    paint();
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    appendLocalTimeline({ id: `copy-${Date.now()}`, title: "执行日志已复制", detail: "可粘贴到任意文本位置。", tone: "success" });
  } catch (error) {
    appendLocalTimeline({ id: `copy-${Date.now()}`, title: "复制日志失败", detail: String(error), tone: "warning" });
  }
  paint();
}

function downloadLog(): void {
  const blob = new Blob([buildLogText()], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `naturalclick-log-${Date.now()}.txt`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  appendLocalTimeline({ id: `download-${Date.now()}`, title: "执行日志已下载", detail: anchor.download, tone: "success" });
  paint();
}

paint();
void refreshSession();
