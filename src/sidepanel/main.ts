import { sendRuntimeMessage } from "../adapters/chrome/messaging";
import { safeRedactedJson } from "../core/architecture/redaction";
import {
  MAX_TEXT_ATTACHMENT_PREVIEW_CHARS,
  canPreviewTextAttachment,
  sanitizeFileAttachmentContexts,
  stripGeneratedArtifactContent,
  type FileAttachmentContext
} from "../core/capabilities/file-artifacts";
import type { ScratchpadRecord } from "../core/capabilities/scratchpad";
import type { ScheduledTaskRecord } from "../core/capabilities/schedule";
import type { SkillPackageDetail, SkillPackageSummary } from "../core/capabilities/skills";
import type { AgentEvent } from "../core/events/events";
import { resolveRuntimeSettings, standardRuntimeSettings, type ExecutionPreset, type RuntimeSettings, type RuntimeSettingsInput } from "../core/runtime/execution-budget";
import type {
  ArtifactDetailProtocolState,
  ArtifactProtocolState,
  ModelConfigProtocolState,
  ScheduleProtocolState,
  ScratchpadProtocolState,
  SessionStateResponse,
  SkillDetailProtocolState,
  SkillProtocolState
} from "../shared/protocol";
import { createTranslator, DEFAULT_LOCALE, normalizeLocale, type SidepanelLocale } from "./i18n";
import { renderSidepanel } from "./render";
import { subscribeRuntimeEvents } from "./runtime-subscription";
import {
  defaultCapabilitySettings,
  defaultModelSettings,
  type ExistingModelInstanceDraft,
  legacySettingsToModelConfigSyncRequests,
  preferredPlannerModelAfterDetection,
  resolveCapabilitySettings,
  serializeCapabilitySettings,
  type CapabilitySettingsState,
  type ModelSettingsState,
  type SearchProviderMode
} from "./settings";
import {
  buildTimelineItems,
  applyModelDetectionSuccessState,
  applyModelSettingChangeState,
  applyPlannerQuickPickState,
  currentProjectionSessionIds,
  deriveActiveTaskFromEvents,
  deriveSessionTitle,
  deriveLatestModelStream,
  mapEventToTimelineItem,
  mergeSuppressedSessionIds,
  mergeRuntimeEventForSession,
  openModelConfigEditorState,
  openNewModelConfigState,
  resolveStoredGeneralSettings,
  serializeGeneralSettings,
  shouldClearConversationForRemovedSessions,
  shouldRefreshSessionOnChatReturn,
  shouldRefreshSessionOnPanelVisible,
  shouldSuppressIncomingSession,
  withDerivedMode,
  type DiagnosticEvent,
  type ConversationTurnState,
  type OverlayMode,
  type SettingsTabId,
  type SessionRecord,
  type SessionSummary,
  type SidepanelState,
  type ThemeMode,
  type TimelineItem
} from "./state";

const root = document.querySelector<HTMLElement>("#app");
if (!root) {
  throw new Error("Missing #app root");
}
const appRoot = root;
const STORAGE_KEY_SESSION_SUMMARIES = "naturalclick.sidepanel.sessionSummaries.v1";
const STORAGE_KEY_SESSION_RECORDS = "naturalclick.sidepanel.sessionRecords.v1";
const STORAGE_KEY_MODEL_SETTINGS = "naturalclick.sidepanel.modelSettings.v1";
const STORAGE_KEY_CAPABILITY_SETTINGS = "naturalclick.sidepanel.capabilitySettings.v1";
const STORAGE_KEY_RUNTIME_SETTINGS = "naturalclick.sidepanel.runtimeSettings.v1";
const STORAGE_KEY_RUNTIME_STREAM_DEFAULT_MIGRATED = "naturalclick.sidepanel.runtimeSettings.rawPlannerStreamDefaultMigrated.v1";
const STORAGE_KEY_LOCALE = "naturalclick.sidepanel.locale.v1";
const STORAGE_KEY_GENERAL_SETTINGS = "naturalclick.sidepanel.generalSettings.v1";
const DEFAULT_OVERLAY_MODE: OverlayMode = "Focus";
const DEFAULT_SAFETY_MODE: SidepanelState["safetyMode"] = "experimental_full_auto";
const DEFAULT_THEME_MODE: ThemeMode = "light";

const initialLocale = loadStoredLocale();
const initialT = createTranslator(initialLocale);
const initialGeneralSettings = loadStoredGeneralSettings();

let state: SidepanelState = {
  mode: "conversation",
  locale: initialLocale,
  view: "chat",
  overlayMode: initialGeneralSettings.overlayMode,
  safetyMode: initialGeneralSettings.safetyMode,
  themeMode: initialGeneralSettings.themeMode,
  settingsTab: "configs",
  toolMenuOpen: false,
  modelPickerOpen: false,
  modelConfigured: false,
  traceOpen: false,
  activityText: initialT("activity.waiting"),
  sessions: loadStoredSessions(),
  sessionRecords: loadStoredSessionRecords(),
  diagnostics: [],
  modelSettings: loadStoredModelSettings(),
  capabilitySettings: loadStoredCapabilitySettings(),
  settingsDirty: false,
  settingsSaveStatus: "idle",
  modelSettingsDirty: false,
  modelSaveStatus: "idle",
  detectedModels: loadStoredDetectedModels(),
  modelDetectionStatus: "idle",
  runtimeSettings: loadStoredRuntimeSettings(),
  pendingAttachments: [],
  timeline: [welcomeTimelineItem(initialLocale)]
};

state = { ...state, modelConfigured: isModelConfigured(state.modelSettings) };
applyThemeMode(state.themeMode ?? DEFAULT_THEME_MODE);

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

function applyThemeMode(mode: ThemeMode): void {
  if (mode === "light" || mode === "dark") {
    document.documentElement.dataset.theme = mode;
    return;
  }
  delete document.documentElement.dataset.theme;
}

function loadStoredGeneralSettings(): Pick<SidepanelState, "overlayMode" | "safetyMode"> & { themeMode: ThemeMode } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_GENERAL_SETTINGS);
    return resolveStoredGeneralSettings(raw ? JSON.parse(raw) : undefined, {
      overlayMode: DEFAULT_OVERLAY_MODE,
      safetyMode: DEFAULT_SAFETY_MODE,
      themeMode: DEFAULT_THEME_MODE
    });
  } catch {
    return { overlayMode: DEFAULT_OVERLAY_MODE, safetyMode: DEFAULT_SAFETY_MODE, themeMode: DEFAULT_THEME_MODE };
  }
}

function saveStoredGeneralSettings(settings: Pick<SidepanelState, "overlayMode" | "safetyMode"> & { themeMode: ThemeMode }): boolean {
  try {
    localStorage.setItem(STORAGE_KEY_GENERAL_SETTINGS, serializeGeneralSettings(settings));
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

function isTimelineItem(item: unknown): item is TimelineItem {
  if (!item || typeof item !== "object") return false;
  const record = item as Record<string, unknown>;
  return typeof record.id === "string" && typeof record.title === "string";
}

function isSessionRecord(item: unknown): item is SessionRecord {
  if (!item || typeof item !== "object") return false;
  const record = item as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.title === "string" &&
    typeof record.status === "string" &&
    typeof record.updatedAt === "string" &&
    typeof record.eventCount === "number" &&
    Array.isArray(record.timeline) &&
    record.timeline.every(isTimelineItem) &&
    (record.turns === undefined || (Array.isArray(record.turns) && record.turns.every(isConversationTurnState)))
  );
}

function isConversationTurnState(item: unknown): item is ConversationTurnState {
  if (!item || typeof item !== "object") return false;
  const record = item as Record<string, unknown>;
  return (
    typeof record.taskId === "string" &&
    typeof record.taskText === "string" &&
    typeof record.status === "string" &&
    typeof record.updatedAt === "string" &&
    Array.isArray(record.timeline) &&
    record.timeline.every(isTimelineItem)
  );
}

function loadStoredSessionRecords(): Record<string, SessionRecord> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SESSION_RECORDS);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    const entries = Array.isArray(parsed)
      ? parsed.map((item) => [isSessionRecord(item) ? item.id : "", item] as const)
      : parsed && typeof parsed === "object"
        ? Object.entries(parsed as Record<string, unknown>)
        : [];
    return entries.reduce<Record<string, SessionRecord>>((records, [key, value]) => {
      if (isSessionRecord(value)) records[key || value.id] = value;
      return records;
    }, {});
  } catch {
    return {};
  }
}

function saveStoredSessions(sessions: SessionSummary[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_SESSION_SUMMARIES, JSON.stringify(sessions));
  } catch {
    // Storage can be unavailable in restricted preview contexts; the sidepanel can still run without history persistence.
  }
}

function saveStoredSessionRecords(records: Record<string, SessionRecord>): void {
  try {
    localStorage.setItem(STORAGE_KEY_SESSION_RECORDS, JSON.stringify(records));
  } catch {
    // Storage can be unavailable in restricted preview contexts; history details are a convenience layer.
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

function editingModelInstanceDraft(): ExistingModelInstanceDraft | undefined {
  const editingId = state.editingModelInstanceId;
  if (!editingId) return undefined;
  const instance = state.modelConfigState?.instances.find((item) => item.id === editingId);
  return instance
    ? {
        id: instance.id,
        provider: instance.provider,
        label: instance.label,
        endpointVariant: instance.endpointVariant,
        createdAt: instance.createdAt
      }
    : state.modelConfigWizardOpen
      ? {
          id: editingId,
          provider: "custom",
          label: "OpenAI Compatible",
          endpointVariant: "openai_compatible",
          createdAt: Date.now()
        }
      : undefined;
}

async function syncModelConfigContext(settings: ModelSettingsState, detectedModels: string[]): Promise<boolean> {
  if (!hasChromeRuntime()) return true;
  let nextModelConfigState: ModelConfigProtocolState | undefined;
  const existingInstance = editingModelInstanceDraft();
  for (const request of legacySettingsToModelConfigSyncRequests(settings, detectedModels, existingInstance)) {
    const response = await sendRuntimeMessage<ModelConfigProtocolState>(request);
    if (!response.ok) return false;
    nextModelConfigState = response.data;
  }
  if (nextModelConfigState) state = { ...state, modelConfigState: nextModelConfigState };
  return true;
}

async function refreshModelConfigState(): Promise<void> {
  if (!hasChromeRuntime()) return;
  const response = await sendRuntimeMessage<ModelConfigProtocolState>({ type: "GET_MODEL_CONFIG" });
  if (!response.ok) return;
  state = { ...state, modelConfigState: response.data };
  paint();
}

function loadStoredCapabilitySettings(): CapabilitySettingsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CAPABILITY_SETTINGS);
    return resolveCapabilitySettings(raw ? JSON.parse(raw) : undefined);
  } catch {
    return defaultCapabilitySettings();
  }
}

function saveStoredCapabilitySettings(settings: CapabilitySettingsState): boolean {
  try {
    localStorage.setItem(STORAGE_KEY_CAPABILITY_SETTINGS, serializeCapabilitySettings(settings));
    return true;
  } catch {
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

function loadStoredRuntimeSettings(): RuntimeSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_RUNTIME_SETTINGS);
    const settings = resolveRuntimeSettings(raw ? (JSON.parse(raw) as RuntimeSettingsInput) : undefined);
    if (!localStorage.getItem(STORAGE_KEY_RUNTIME_STREAM_DEFAULT_MIGRATED)) {
      return {
        ...settings,
        streaming: {
          ...settings.streaming,
          showPlannerRawStream: true
        }
      };
    }
    return settings;
  } catch {
    return standardRuntimeSettings;
  }
}

function saveStoredRuntimeSettings(settings: RuntimeSettings): boolean {
  try {
    localStorage.setItem(
      STORAGE_KEY_RUNTIME_SETTINGS,
      JSON.stringify({
        executionPreset: settings.executionPreset,
        executionBudget: settings.execution,
        observationBudget: settings.observation,
        visionFallback: settings.visionFallback,
        streaming: settings.streaming,
        limitReachedAction: settings.limitReachedAction
      })
    );
    localStorage.setItem(STORAGE_KEY_RUNTIME_STREAM_DEFAULT_MIGRATED, "1");
    return true;
  } catch {
    return false;
  }
}

function isModelConfigured(settings?: ModelSettingsState): boolean {
  return Boolean(settings?.providerBaseUrl.trim() && settings.apiKey.trim() && settings.plannerModel.trim());
}

function runtimeModelSettings(settings?: ModelSettingsState): {
  providerBaseUrl: string;
  apiKey: string;
  plannerModel: string;
  visionModel?: string;
} {
  const current = settings ?? defaultModelSettings();
  return {
    providerBaseUrl: current.providerBaseUrl,
    apiKey: current.apiKey,
    plannerModel: current.plannerModel,
    visionModel: current.visionModel
  };
}

function runtimeSettingsForMessage(): RuntimeSettingsInput {
  const current = state.runtimeSettings ?? standardRuntimeSettings;
  return {
    executionPreset: current.executionPreset,
    executionBudget: current.execution,
    observationBudget: current.observation,
    visionFallback: current.visionFallback,
    streaming: current.streaming,
    limitReachedAction: current.limitReachedAction
  };
}

function capabilitySettingsForMessage(): CapabilitySettingsState {
  return resolveCapabilitySettings(state.capabilitySettings ?? defaultCapabilitySettings());
}

function sessionIdForResponse(session: SessionStateResponse): string {
  const latest = session.events.at(-1);
  return session.sessionId ?? session.taskId ?? latest?.taskId ?? "local-session";
}

function extractTaskText(session: SessionStateResponse, timeline: TimelineItem[]): string | undefined {
  const started = session.events.find((event) => event.type === "TaskStarted");
  const startedText = typeof started?.payload.taskText === "string" ? started.payload.taskText.trim() : "";
  if (startedText) return startedText;
  const firstDetail = timeline.find((item) => item.detail)?.detail?.trim();
  return firstDetail || undefined;
}

function buildSessionTitle(timeline: TimelineItem[], taskText?: string): string {
  const firstTask = taskText || timeline.find((item) => item.detail)?.detail;
  return deriveSessionTitle(firstTask, currentT()("session.untitled"));
}

function toSessionSummary(record: SessionRecord): SessionSummary {
  return {
    id: record.id,
    title: record.title,
    status: record.status,
    updatedAt: record.updatedAt,
    eventCount: record.eventCount,
    taskText: record.taskText,
    hasDetail: true
  };
}

function buildSessionRecord(
  sessionId: string,
  turns: ConversationTurnState[],
  extras: Pick<SessionRecord, "activityText" | "decisionSummary" | "evidenceSummary" | "traceSummary">
): SessionRecord | undefined {
  if (turns.length === 0) return undefined;
  const firstTurn = turns[0];
  const latestTurn = turns.at(-1)!;
  return {
    id: sessionId,
    title: buildSessionTitle(firstTurn.timeline, firstTurn.taskText),
    status: latestTurn.status,
    updatedAt: formatNow(),
    eventCount: turns.reduce((count, turn) => count + (turn.events?.length ?? turn.timeline.length), 0),
    taskText: firstTurn.taskText,
    hasDetail: true,
    timeline: turns.flatMap((turn) => turn.timeline),
    events: turns.flatMap((turn) => turn.events ?? []),
    turns,
    ...extras
  };
}

function buildConversationTurn(taskId: string, events: AgentEvent[]): ConversationTurnState | undefined {
  if (events.length === 0) return undefined;
  const timeline = buildTimelineItems(events, state.locale);
  const taskText = extractTaskText({ taskId, events }, timeline) ?? "";
  const activeTask = deriveActiveTaskFromEvents(events, state.locale);
  return {
    taskId,
    taskText,
    status: activeTask?.status ?? "running",
    timeline,
    events,
    activeTask,
    modelStream: deriveLatestModelStream(events, state.locale),
    updatedAt: formatNow()
  };
}

function upsertSessionSummary(record: SessionRecord): SessionSummary[] {
  const withoutCurrent = (state.sessions ?? []).filter((item) => item.id !== record.id);
  return [toSessionSummary(record), ...withoutCurrent].slice(0, 20);
}

function upsertSessionRecord(record: SessionRecord, sessions: SessionSummary[]): Record<string, SessionRecord> {
  const allowedIds = new Set(sessions.map((item) => item.id));
  return Object.fromEntries(
    Object.entries({ ...(state.sessionRecords ?? {}), [record.id]: record }).filter(([id]) => allowedIds.has(id))
  ) as Record<string, SessionRecord>;
}

interface LogSnapshot {
  sessionId?: string;
  title?: string;
  status: string;
  updatedAt?: string;
  timeline: TimelineItem[];
  traceSummary?: string[];
  events?: unknown[];
  diagnostics?: DiagnosticEvent[];
}

function resolveLogSnapshot(sessionId?: string): LogSnapshot {
  const t = currentT();
  if (sessionId) {
    const summary = (state.sessions ?? []).find((item) => item.id === sessionId);
    const record = state.sessionRecords?.[sessionId];
    if (record) {
      return {
        sessionId: record.id,
        title: record.title,
        status: record.status,
        updatedAt: record.updatedAt,
        timeline: record.timeline,
        traceSummary: record.traceSummary,
        events: record.events,
        diagnostics: state.diagnostics
      };
    }
    if (summary) {
      return {
        sessionId: summary.id,
        title: summary.title,
        status: summary.status,
        updatedAt: summary.updatedAt,
        timeline: [{ id: `summary-${summary.id}`, title: t("history.summaryOnlyTitle"), detail: summary.title, tone: "info" }],
        diagnostics: state.diagnostics
      };
    }
  }
  return {
    sessionId: state.activeSessionId,
    status: state.activeTask?.status ?? "idle",
    timeline: state.timeline ?? [],
    traceSummary: state.traceSummary,
    events: state.lastSessionEvents,
    diagnostics: state.diagnostics
  };
}

function extensionVersion(): string {
  try {
    return chrome.runtime.getManifest().version;
  } catch {
    return "preview";
  }
}

function yesNo(value: boolean, t: ReturnType<typeof createTranslator>): string {
  return value ? t("log.yes") : t("log.no");
}

function safeJson(value: unknown): string {
  return safeRedactedJson(value);
}

interface LogModelSettings {
  providerBaseUrl: string;
  plannerModel: string;
  visionModel: string;
  apiKeyRef: string;
  hasApiKey: boolean;
}

function modelSettingsForLog(settings: ModelSettingsState | undefined): LogModelSettings {
  const current = settings ?? defaultModelSettings();
  return {
    providerBaseUrl: current.providerBaseUrl,
    plannerModel: current.plannerModel,
    visionModel: current.visionModel ?? "",
    apiKeyRef: current.apiKeyRef ?? "",
    hasApiKey: Boolean(current.apiKey.trim())
  };
}

function buildStateSnapshotForLog(snapshot: LogSnapshot): Record<string, unknown> {
  return {
    locale: normalizeLocale(state.locale),
    view: state.view ?? "chat",
    mode: state.mode,
    overlayMode: state.overlayMode,
    safetyMode: state.safetyMode,
    modelConfigured: state.modelConfigured,
    modelSettings: modelSettingsForLog(state.modelSettings),
    capabilitySettings: capabilitySettingsForLog(state.capabilitySettings),
    runtimeSettings: state.runtimeSettings ?? standardRuntimeSettings,
    detectedModels: state.detectedModels ?? [],
    activeSessionId: snapshot.sessionId,
    selectedSessionId: state.selectedSessionId,
    activeTask: state.activeTask,
    activityText: state.activityText,
    modelStream: state.modelStream,
    timeline: snapshot.timeline,
    traceSummary: snapshot.traceSummary ?? [],
    diagnostics: snapshot.diagnostics ?? [],
    sessions: state.sessions ?? []
  };
}

function capabilitySettingsForLog(settings: CapabilitySettingsState | undefined): Record<string, unknown> {
  const current = resolveCapabilitySettings(settings ?? defaultCapabilitySettings());
  return {
    skills: current.skills,
    search: {
      provider: current.search.provider,
      endpointConfigured: Boolean(current.search.endpoint.trim()),
      hasApiKey: Boolean(current.search.apiKey.trim()),
      maxResults: current.search.maxResults
    }
  };
}

function currentLogSessionId(sessionId?: string): string | undefined {
  if (sessionId) return sessionId;
  if (state.view === "history-detail" && state.selectedSessionId) return state.selectedSessionId;
  return undefined;
}

function buildLogText(sessionId?: string): string {
  const t = currentT();
  const snapshot = resolveLogSnapshot(currentLogSessionId(sessionId));
  const settings = modelSettingsForLog(state.modelSettings);
  const lines = [
    t("log.title"),
    `${t("log.exportedAt")}: ${formatNow()}`,
    `${t("log.extensionVersion")}: ${extensionVersion()}`,
    snapshot.title ? `${t("log.session")}: ${snapshot.title}` : "",
    snapshot.updatedAt ? `${t("log.updatedAt")}: ${snapshot.updatedAt}` : "",
    `${t("log.currentStatus")}: ${snapshot.status}`,
    "",
    t("log.environment"),
    `${t("log.locale")}: ${normalizeLocale(state.locale)}`,
    `${t("log.view")}: ${state.view ?? "chat"}`,
    `${t("log.mode")}: ${state.mode}`,
    `${t("log.runtimeAvailable")}: ${yesNo(hasChromeRuntime(), t)}`,
    `${t("log.pageUrl")}: ${globalThis.location?.href ?? ""}`,
    `${t("log.overlayMode")}: ${state.overlayMode}`,
    `${t("log.safetyMode")}: ${state.safetyMode}`,
    `${t("log.modelConfigured")}: ${yesNo(state.modelConfigured, t)}`,
    `${t("log.modelProvider")}: ${settings.providerBaseUrl || t("log.none")}`,
    `${t("log.plannerModel")}: ${settings.plannerModel || t("log.none")}`,
    `${t("log.visionModel")}: ${settings.visionModel || t("log.none")}`,
    `${t("log.hasApiKey")}: ${yesNo(Boolean(settings.hasApiKey), t)}`,
    "",
    t("log.diagnostics"),
    ...(snapshot.diagnostics?.length
      ? snapshot.diagnostics.map((item, index) => {
          const count = item.count && item.count > 1 ? ` x${item.count}` : "";
          return `${index + 1}. [${item.at}] ${item.source ? `${item.source} · ` : ""}${item.title}${count}${item.detail ? ` - ${item.detail}` : ""}`;
        })
      : [t("log.emptyDiagnostics")]),
    "",
    t("log.timeline")
  ].filter(Boolean);
  const timeline = snapshot.timeline;
  if (timeline.length === 0) {
    lines.push(t("log.emptyTimeline"));
  } else {
    timeline.forEach((item, index) => {
      lines.push(`${index + 1}. [${item.tone ?? "info"}] ${item.title}${item.detail ? ` - ${item.detail}` : ""}`);
    });
  }
  if (snapshot.traceSummary?.length) {
    lines.push("", t("log.trace"));
    snapshot.traceSummary.forEach((item) => lines.push(`- ${item}`));
  }
  if (snapshot.events?.length) {
    lines.push("", t("log.rawEvents"), safeJson(snapshot.events));
  }
  lines.push("", t("log.stateJson"), safeJson(buildStateSnapshotForLog(snapshot)));
  return `${lines.join("\n")}\n`;
}

function applySession(session: SessionStateResponse): void {
  if (blankSessionResetInFlight) return;
  if (session.events.length === 0) return;
  const incomingSessionId = sessionIdForResponse(session);
  if (shouldSuppressIncomingSession(state, incomingSessionId)) return;
  const incomingTurns = session.turns?.length
    ? session.turns
    : (state.activeSessionId === incomingSessionId && state.conversationTurns?.length
        ? state.conversationTurns.map((turn) => ({ taskId: turn.taskId, events: turn.events ?? [] }))
        : []).filter((turn) => turn.taskId !== session.taskId).concat([{ taskId: session.taskId ?? session.events.at(-1)?.taskId ?? "pending-task", events: session.events }]);
  const conversationTurns = incomingTurns
    .map((turn) => buildConversationTurn(turn.taskId, turn.events))
    .filter((turn): turn is ConversationTurnState => Boolean(turn));
  const latestTurn = conversationTurns.find((turn) => turn.taskId === session.taskId) ?? conversationTurns.at(-1);
  const timeline = latestTurn?.timeline ?? [];
  const activeTask = latestTurn?.activeTask;
  const modelStream = latestTurn?.modelStream;
  const latestItem = timeline.at(-1);
  const evidenceSummary = session.events
    .filter((event) => ["ObservationReceived", "EvidenceAdded", "VisualEvidenceAdded", "VisionCompleted"].includes(event.type))
    .slice(-4)
    .map((event) => {
      const item = mapEventToTimelineItem(event, state.locale);
      return item.detail ?? item.title;
    });
  const traceSummary = session.events.slice(-6).map((event) => `${event.type} · ${event.stepId}`);
  const record = buildSessionRecord(incomingSessionId, conversationTurns, {
    activityText: latestItem?.detail ?? latestItem?.title ?? currentT()("activity.waiting"),
    decisionSummary: latestItem?.title,
    evidenceSummary,
    traceSummary
  });
  const sessions = record ? upsertSessionSummary(record) : (state.sessions ?? []);
  const sessionRecords = record ? upsertSessionRecord(record, sessions) : (state.sessionRecords ?? {});
  saveStoredSessions(sessions);
  saveStoredSessionRecords(sessionRecords);
  state = withDerivedMode({
    ...state,
    activeTask,
    modelStream,
    timeline,
    conversationTurns,
    sessions,
    sessionRecords,
    activeSessionId: record?.id ?? incomingSessionId,
    lastSessionEvents: session.events,
    activityText: latestItem?.detail ?? latestItem?.title ?? currentT()("activity.waiting"),
    decisionSummary: latestItem?.title ?? state.decisionSummary,
    evidenceSummary,
    traceSummary
  });
}

function applyRuntimeEvent(event: AgentEvent): void {
  if (blankSessionResetInFlight) return;
  const priorTurns = state.activeSessionId === event.sessionId ? state.conversationTurns ?? [] : [];
  const priorEvents = priorTurns.find((turn) => turn.taskId === event.taskId)?.events ?? [];
  const events = mergeRuntimeEventForSession(priorEvents, event);
  const turns = [
    ...priorTurns.filter((turn) => turn.taskId !== event.taskId).map((turn) => ({ taskId: turn.taskId, events: turn.events ?? [] })),
    { taskId: event.taskId, events }
  ];
  applySession({ sessionId: event.sessionId, taskId: event.taskId, events, turns });
  paint();
  if (event.type === "ToolCallCompleted" && event.payload.toolName === "save_artifact") {
    void refreshArtifacts();
  }
}

function clearConversationProjection(patch: Partial<SidepanelState> = {}): SidepanelState {
  return withDerivedMode({
    ...state,
    activeSessionId: undefined,
    lastSessionEvents: [],
    activeTask: undefined,
    conversationTurns: [],
    modelStream: undefined,
    timeline: [],
    decisionSummary: undefined,
    evidenceSummary: [],
    traceSummary: [],
    pendingAttachments: [],
    generatedArtifacts: [],
    ...patch
  });
}

function returnToChat(): void {
  state = { ...state, view: "chat", settingsOpen: false, selectedSessionId: undefined, toolMenuOpen: false, modelPickerOpen: false };
  paint();
  if (shouldRefreshSessionOnChatReturn(state)) void refreshSession();
}

async function startBlankSession(options: { reason?: string } = {}): Promise<void> {
  const t = currentT();
  const reason = options.reason ?? "user_requested";
  blankSessionResetInFlight = hasChromeRuntime();
  const suppressedSessionIds = mergeSuppressedSessionIds(state.suppressedSessionIds, currentProjectionSessionIds(state));
  state = clearConversationProjection({
    view: "chat",
    selectedSessionId: undefined,
    suppressedSessionIds,
    toolMenuOpen: false,
    modelPickerOpen: false,
    activityText: t("activity.newSession")
  });
  paint();

  if (!hasChromeRuntime()) {
    blankSessionResetInFlight = false;
    return;
  }
  try {
    const response = await sendRuntimeMessage<SessionStateResponse>({ type: "NEW_SESSION", reason });
    if (!response.ok) {
      appendDiagnostic({ title: t("runtime.sendFailed"), detail: response.error, source: "runtime", tone: "warning" });
      paint();
    }
  } finally {
    blankSessionResetInFlight = false;
  }
}

function appendLocalTimeline(item: TimelineItem): void {
  state = {
    ...state,
    timeline: [...(state.timeline ?? []), item],
    activityText: item.detail ?? item.title
  };
}

function appendDiagnostic(event: Omit<DiagnosticEvent, "id" | "at" | "count">): void {
  const diagnostics = state.diagnostics ?? [];
  const last = diagnostics.at(-1);
  const at = new Date().toISOString();
  const nextEvent: DiagnosticEvent =
    last && last.title === event.title && last.detail === event.detail && last.source === event.source
      ? { ...last, at, count: (last.count ?? 1) + 1 }
      : { ...event, id: `diag-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, at, count: 1 };
  state = {
    ...state,
    diagnostics: [...diagnostics.slice(0, -1), nextEvent].slice(-50),
    activityText: event.detail ?? event.title
  };
}

async function fileToAttachmentContext(file: File, index: number, now: number): Promise<FileAttachmentContext> {
  const attachment: FileAttachmentContext = {
    id: `attachment-${now}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    filename: file.name,
    mime: file.type || "application/octet-stream",
    size: file.size,
    createdAt: now
  };

  if (!canPreviewTextAttachment(attachment) || typeof file.text !== "function") return attachment;

  try {
    const text = (await file.text()).replace(/\u0000/g, "").trim();
    if (!text) return attachment;
    const textPreview = text.slice(0, MAX_TEXT_ATTACHMENT_PREVIEW_CHARS);
    return {
      ...attachment,
      textPreview,
      textPreviewChars: textPreview.length,
      textTruncated: text.length > MAX_TEXT_ATTACHMENT_PREVIEW_CHARS
    };
  } catch {
    return attachment;
  }
}

async function addPendingAttachments(files: File[]): Promise<void> {
  if (files.length === 0) return;
  const now = Date.now();
  const additions = sanitizeFileAttachmentContexts(await Promise.all(files.map((file, index) => fileToAttachmentContext(file, index, now))));
  state = {
    ...state,
    pendingAttachments: [...(state.pendingAttachments ?? []), ...additions].slice(-10),
    toolMenuOpen: false,
    activityText: currentT()("attachments.added", { count: additions.length })
  };
  paint();
}

function removePendingAttachment(attachmentId: string): void {
  state = {
    ...state,
    pendingAttachments: (state.pendingAttachments ?? []).filter((attachment) => attachment.id !== attachmentId)
  };
  paint();
}

function paint(): void {
  renderSidepanel(appRoot, state, {
    onSubmitTask: (text) => {
      void submitText(text);
    },
    onStopTask: () => {
      void stopTask();
    },
    onResumeTask: () => {
      void resumeTask();
    },
    onRetryTask: (taskId) => {
      void retryTask(taskId);
    },
    onOverlayModeChange: (mode) => {
      updateOverlayMode(mode as OverlayMode);
    },
    onHighlightTarget: (semanticId) => {
      void highlightTarget(semanticId);
    },
    onOpenSettings: () => {
      state = { ...state, view: "settings", settingsOpen: true, toolMenuOpen: false, modelPickerOpen: false };
      paint();
      if ((state.settingsTab ?? "configs") === "skills") void refreshSkillsPanelData();
    },
    onOpenSchedules: () => {
      const nextView = state.view === "schedules" ? "chat" : "schedules";
      state = { ...state, view: nextView, toolMenuOpen: false, modelPickerOpen: false };
      paint();
      if (nextView === "schedules") void refreshSchedules();
    },
    onCloseSettings: () => {
      returnToChat();
    },
    onOpenHistory: () => {
      state = { ...state, view: "history", toolMenuOpen: false, modelPickerOpen: false };
      paint();
    },
    onOpenSession: (sessionId) => {
      openHistorySession(sessionId);
    },
    onBackToHistory: () => {
      state = { ...state, view: "history", selectedSessionId: undefined };
      paint();
    },
    onRunSession: (sessionId) => {
      void rerunHistorySession(sessionId);
    },
    onDeleteSession: (sessionId) => {
      deleteHistorySession(sessionId);
    },
    onClearHistory: () => {
      clearHistory();
    },
    onResolvePendingConfirmation: (approved) => {
      resolvePendingConfirmation(approved);
    },
    onCopySessionLog: (sessionId) => {
      void copyLog(sessionId);
    },
    onDownloadSessionLog: (sessionId) => {
      downloadLog(sessionId);
    },
    onBackToChat: () => {
      returnToChat();
    },
    onSettingsTabChange: (tab) => {
      state = { ...state, settingsTab: tab as SettingsTabId };
      paint();
      if (tab === "skills") void refreshSkillsPanelData();
    },
    onToggleToolMenu: () => {
      const nextOpen = !state.toolMenuOpen;
      state = { ...state, toolMenuOpen: nextOpen, modelPickerOpen: false };
      paint();
      if (nextOpen) void refreshSkills();
    },
    onToggleModelPicker: () => {
      state = { ...state, modelPickerOpen: !state.modelPickerOpen, modelPickerQuery: "", toolMenuOpen: false };
      paint();
    },
    onDismissComposerMenus: () => {
      if (!state.toolMenuOpen && !state.modelPickerOpen) return;
      state = { ...state, toolMenuOpen: false, modelPickerOpen: false, modelPickerQuery: "" };
      paint();
    },
    onComposerInput: (text) => {
      state = { ...state, composerInput: text };
    },
    onAttachFiles: (files) => {
      void addPendingAttachments(files);
    },
    onRemoveAttachment: (attachmentId) => {
      removePendingAttachment(attachmentId);
    },
    onDownloadArtifact: (artifactId) => {
      void downloadArtifact(artifactId);
    },
    onToggleModelConfigWizard: () => {
      if (state.modelConfigWizardOpen) {
        closeModelConfigEditor();
        return;
      }
      state = openNewModelConfigState(state, newModelInstanceId());
      paint();
    },
    onOpenNewModelConfig: () => {
      state = openNewModelConfigState(state, newModelInstanceId());
      paint();
    },
    onOpenModelConfigEditor: (instanceId) => {
      state = openModelConfigEditorState(state, instanceId);
      paint();
    },
    onCloseModelConfigEditor: () => {
      closeModelConfigEditor();
    },
    onThemeModeChange: (mode) => {
      setThemeMode(mode as ThemeMode);
    },
    onNewSession: () => {
      void startBlankSession();
    },
    onCopyLog: () => {
      void copyLog();
    },
    onDownloadLog: () => {
      downloadLog();
    },
    onSafetyModeChange: (mode) => {
      updateSafetyMode(mode as SidepanelState["safetyMode"]);
    },
    onModelSettingChange: (field, value) => {
      updateModelSetting(field, value);
    },
    onPickPlannerModel: (model) => {
      void pickPlannerModel(model);
    },
    onModelPickerQueryChange: (query) => {
      state = { ...state, modelPickerQuery: query };
      paint();
    },
    onDetectModels: () => {
      void detectModels();
    },
    onSaveSettings: () => {
      void saveSettings();
    },
    onLocaleChange: (locale) => {
      setLocale(locale);
    },
    onRuntimePresetChange: (preset) => {
      updateRuntimePreset(preset);
    },
    onRuntimeNumberChange: (section, field, value) => {
      updateRuntimeNumber(section, field, value);
    },
    onRuntimeBooleanChange: (section, field, value) => {
      updateRuntimeBoolean(section, field, value);
    },
    onCapabilitySettingChange: (section, field, value) => {
      updateCapabilitySetting(section, field, value);
    },
    onOpenSkillsSettings: () => {
      state = { ...state, view: "settings", settingsOpen: true, settingsTab: "skills", toolMenuOpen: false, modelPickerOpen: false };
      paint();
      void refreshSkillsPanelData();
    },
    onUseSkill: (skillId) => {
      void useSkillInComposer(skillId);
    },
    onUseSearchContext: () => {
      useSearchContextInComposer();
    },
    onUseScratchpad: (recordId) => {
      useScratchpadInComposer(recordId);
    },
    onRecordWorkflowRequest: () => {
      insertTextIntoComposer(currentT()("skills.recordPrompt"));
    },
    onUseSchedule: (scheduleId) => {
      useScheduleInComposer(scheduleId);
    },
    onRunSchedule: (scheduleId) => {
      void runSchedule(scheduleId);
    },
    onResolveConsent: (approved, scope) => {
      void resolveUserConsent(approved, scope);
    }
  });
}

function refreshSkillsPanelData(): void {
  void refreshSkills();
  void refreshScratchpad();
}

async function refreshSkills(): Promise<void> {
  if (!hasChromeRuntime()) {
    state = { ...state, skills: state.skills ?? [], skillsLoading: false, skillsError: undefined };
    paint();
    return;
  }
  state = { ...state, skillsLoading: true, skillsError: undefined };
  paint();
  const response = await sendRuntimeMessage<SkillProtocolState>({ type: "GET_SKILLS" });
  if (response.ok) {
    state = { ...state, skills: response.data.skills, skillsLoading: false, skillsError: undefined };
  } else {
    state = { ...state, skillsLoading: false, skillsError: response.error };
  }
  paint();
}

async function refreshScratchpad(): Promise<void> {
  if (!hasChromeRuntime()) {
    state = { ...state, scratchpadRecords: state.scratchpadRecords ?? [], scratchpadLoading: false, scratchpadError: undefined };
    paint();
    return;
  }
  state = { ...state, scratchpadLoading: true, scratchpadError: undefined };
  paint();
  const response = await sendRuntimeMessage<ScratchpadProtocolState>({ type: "GET_SCRATCHPAD" });
  if (response.ok) {
    state = { ...state, scratchpadRecords: response.data.records, scratchpadLoading: false, scratchpadError: undefined };
  } else {
    state = { ...state, scratchpadLoading: false, scratchpadError: response.error };
  }
  paint();
}

async function refreshArtifacts(): Promise<void> {
  if (!hasChromeRuntime()) {
    state = { ...state, generatedArtifacts: state.generatedArtifacts ?? [], artifactsLoading: false, artifactsError: undefined };
    paint();
    return;
  }
  state = { ...state, artifactsLoading: true, artifactsError: undefined };
  paint();
  const response = await sendRuntimeMessage<ArtifactProtocolState>({ type: "GET_ARTIFACTS" });
  if (response.ok) {
    state = { ...state, generatedArtifacts: response.data.artifacts, artifactsLoading: false, artifactsError: undefined };
  } else {
    state = { ...state, artifactsLoading: false, artifactsError: response.error };
  }
  paint();
}

async function refreshSchedules(): Promise<void> {
  if (!hasChromeRuntime()) {
    state = { ...state, schedules: state.schedules ?? [], schedulesLoading: false, schedulesError: undefined };
    paint();
    return;
  }
  state = { ...state, schedulesLoading: true, schedulesError: undefined };
  paint();
  const response = await sendRuntimeMessage<ScheduleProtocolState>({ type: "GET_SCHEDULES" });
  if (response.ok) {
    state = { ...state, schedules: response.data.schedules, schedulesLoading: false, schedulesError: undefined };
  } else {
    state = { ...state, schedulesLoading: false, schedulesError: response.error };
  }
  paint();
}

async function useSkillInComposer(skillId: string): Promise<void> {
  const fallback = (state.skills ?? []).find((skill) => skill.id === skillId);
  let detail: SkillPackageDetail | SkillPackageSummary | undefined = fallback;
  if (hasChromeRuntime()) {
    const response = await sendRuntimeMessage<SkillDetailProtocolState>({ type: "GET_SKILL_DETAIL", skillId });
    if (response.ok && response.data.skill) detail = response.data.skill;
  }
  if (!detail) return;
  insertTextIntoComposer(skillPromptText(detail));
}

function insertTextIntoComposer(text: string, activityText = currentT()("skills.inserted")): void {
  const current = (state.composerInput ?? "").trim();
  state = {
    ...state,
    view: "chat",
    composerInput: current ? `${current}\n\n${text}` : text,
    toolMenuOpen: false,
    modelPickerOpen: false,
    activityText
  };
  paint();
}

function skillPromptText(skill: SkillPackageDetail | SkillPackageSummary): string {
  const parts = [currentT()("skills.usePrompt", { name: skill.name }), skill.description];
  const instructions = "instructions" in skill ? skill.instructions?.trim() : "";
  if (instructions) parts.push(instructions);
  return parts.filter(Boolean).join("\n");
}

function useSearchContextInComposer(): void {
  const t = currentT();
  const settings = resolveCapabilitySettings(state.capabilitySettings ?? defaultCapabilitySettings());
  if (settings.search.provider === "disabled") return;
  const providerLabel = settings.search.provider === "custom_endpoint" ? t("settings.search.provider.custom") : t("settings.search.provider.browser");
  const currentInput = (state.composerInput ?? "").trim();
  const prompt = currentInput
    ? t("search.contextPromptWithTask", { provider: providerLabel, count: settings.search.maxResults })
    : t("search.contextPrompt", { provider: providerLabel, count: settings.search.maxResults });
  insertTextIntoComposer(prompt, t("search.inserted"));
}

function useScratchpadInComposer(recordId: string): void {
  const record = (state.scratchpadRecords ?? []).find((item) => item.id === recordId);
  if (!record) return;
  insertTextIntoComposer(scratchpadPromptText(record), currentT()("settings.scratchpad.inserted"));
}

function scratchpadPromptText(record: ScratchpadRecord): string {
  const fields = Object.entries(record.fields)
    .map(([key, value]) => `${key}: ${value === null ? "null" : String(value)}`)
    .join("\n");
  return [currentT()("settings.scratchpad.usePrompt", { id: record.id, collection: record.collection }), fields, record.evidence ? `Evidence: ${record.evidence}` : ""]
    .filter(Boolean)
    .join("\n");
}

function useScheduleInComposer(scheduleId: string): void {
  const schedule = (state.schedules ?? []).find((item) => item.id === scheduleId);
  if (!schedule) return;
  insertTextIntoComposer(schedulePromptText(schedule), currentT()("schedules.inserted"));
}

async function runSchedule(scheduleId: string): Promise<void> {
  const schedule = (state.schedules ?? []).find((item) => item.id === scheduleId);
  if (!schedule) return;
  const t = currentT();
  state = {
    ...state,
    view: "chat",
    composerInput: "",
    toolMenuOpen: false,
    modelPickerOpen: false,
    activityText: t("schedules.started", { title: schedule.title })
  };
  paint();
  await startBlankSession({ reason: `schedule:${schedule.id}` });
  await submitText(schedulePromptText(schedule));
}

function schedulePromptText(schedule: ScheduledTaskRecord): string {
  return [currentT()("schedules.usePrompt", { title: schedule.title }), schedule.taskText, schedule.notes ?? ""].filter(Boolean).join("\n");
}

function markSettingsDirty(patch: Partial<SidepanelState> = {}): void {
  const t = createTranslator(patch.locale ?? state.locale);
  state = {
    ...state,
    ...patch,
    settingsDirty: true,
    settingsSaveStatus: "idle",
    settingsSaveMessage: t("settings.save.unsaved"),
    modelSaveStatus: "idle",
    modelSaveMessage: t("settings.save.unsaved")
  };
}

function updateRuntimeSettings(settings: RuntimeSettings): void {
  markSettingsDirty({ runtimeSettings: settings });
  paint();
}

function updateRuntimePreset(preset: ExecutionPreset): void {
  updateRuntimeSettings(resolveRuntimeSettings({ executionPreset: preset }));
}

function updateRuntimeNumber(section: "execution" | "observation", field: string, value: number): void {
  const current = state.runtimeSettings ?? standardRuntimeSettings;
  updateRuntimeSettings(
    resolveRuntimeSettings({
      executionPreset: "custom",
      executionBudget: section === "execution" ? { ...current.execution, [field]: value } : current.execution,
      observationBudget: section === "observation" ? { ...current.observation, [field]: value } : current.observation,
      visionFallback: current.visionFallback,
      streaming: current.streaming,
      limitReachedAction: current.limitReachedAction
    })
  );
}

function updateRuntimeBoolean(section: "observation" | "streaming" | "visionFallback", field: string, value: boolean): void {
  const current = state.runtimeSettings ?? standardRuntimeSettings;
  updateRuntimeSettings(
    resolveRuntimeSettings({
      executionPreset: current.executionPreset,
      executionBudget: current.execution,
      observationBudget: section === "observation" ? { ...current.observation, [field]: value } : current.observation,
      visionFallback: section === "visionFallback" ? { ...current.visionFallback, [field]: value } : current.visionFallback,
      streaming: section === "streaming" ? { ...current.streaming, [field]: value } : current.streaming,
      limitReachedAction: current.limitReachedAction
    })
  );
}

function openHistorySession(sessionId: string): void {
  const summary = (state.sessions ?? []).find((item) => item.id === sessionId);
  const record = state.sessionRecords?.[sessionId];
  if (!summary && !record) return;
  state = {
    ...state,
    view: "history-detail",
    selectedSessionId: sessionId,
    activityText: currentT()("history.opened")
  };
  paint();
}

function deleteHistorySession(sessionId: string): void {
  const t = currentT();
  const summary = (state.sessions ?? []).find((item) => item.id === sessionId);
  const record = state.sessionRecords?.[sessionId];
  if (!summary && !record) return;
  if (state.pendingConfirmation?.action !== "delete-session" || state.pendingConfirmation.sessionId !== sessionId) {
    state = {
      ...state,
      pendingConfirmation: {
        id: `delete-${sessionId}`,
        action: "delete-session",
        sessionId,
        message: t("history.deleteConfirm"),
        detail: t("history.deleteWarning"),
        subject: summary?.title ?? record?.title,
        confirmLabel: t("history.confirmDelete"),
        cancelLabel: t("history.cancel")
      }
    };
    paint();
    return;
  }

  const sessions = (state.sessions ?? []).filter((item) => item.id !== sessionId);
  const { [sessionId]: _removed, ...sessionRecords } = state.sessionRecords ?? {};
  const shouldClearConversation = shouldClearConversationForRemovedSessions(state, [sessionId]);
  const suppressedSessionIds = mergeSuppressedSessionIds(state.suppressedSessionIds, [sessionId]);
  saveStoredSessions(sessions);
  saveStoredSessionRecords(sessionRecords);
  state = shouldClearConversation ? clearConversationProjection({ suppressedSessionIds }) : { ...state, suppressedSessionIds };
  state = withDerivedMode({
    ...state,
    sessions,
    sessionRecords,
    pendingConfirmation: undefined,
    view: state.view === "history-detail" && state.selectedSessionId === sessionId ? "history" : state.view,
    selectedSessionId: state.selectedSessionId === sessionId ? undefined : state.selectedSessionId,
    activityText: t("history.deleted")
  });
  paint();
}

function clearHistory(): void {
  const t = currentT();
  if (!(state.sessions?.length || Object.keys(state.sessionRecords ?? {}).length)) return;
  if (state.pendingConfirmation?.action !== "clear-history") {
    const sessionCount = new Set([...(state.sessions ?? []).map((session) => session.id), ...Object.keys(state.sessionRecords ?? {})]).size;
    state = {
      ...state,
      pendingConfirmation: {
        id: "clear-history",
        action: "clear-history",
        message: t("history.clearConfirm"),
        detail: t("history.clearWarning", { count: sessionCount }),
        confirmLabel: t("history.confirmClear"),
        cancelLabel: t("history.cancel")
      }
    };
    paint();
    return;
  }

  saveStoredSessions([]);
  saveStoredSessionRecords({});
  const removedSessionIds = [...(state.sessions ?? []).map((session) => session.id), ...Object.keys(state.sessionRecords ?? {})];
  const shouldClearConversation = shouldClearConversationForRemovedSessions(state, removedSessionIds);
  const suppressedSessionIds = mergeSuppressedSessionIds(state.suppressedSessionIds, removedSessionIds);
  state = shouldClearConversation ? clearConversationProjection({ suppressedSessionIds }) : { ...state, suppressedSessionIds };
  state = withDerivedMode({
    ...state,
    sessions: [],
    sessionRecords: {},
    pendingConfirmation: undefined,
    view: "history",
    selectedSessionId: undefined,
    activityText: t("history.cleared")
  });
  paint();
}

function resolvePendingConfirmation(approved: boolean): void {
  const pending = state.pendingConfirmation;
  if (!pending) return;
  if (!approved) {
    state = { ...state, pendingConfirmation: undefined };
    paint();
    return;
  }
  if (pending.action === "delete-session" && pending.sessionId) {
    deleteHistorySession(pending.sessionId);
    return;
  }
  if (pending.action === "clear-history") {
    clearHistory();
  }
}

function taskTextForSession(sessionId: string): string {
  const record = state.sessionRecords?.[sessionId];
  const summary = (state.sessions ?? []).find((item) => item.id === sessionId);
  return String(record?.taskText ?? summary?.taskText ?? "").trim();
}

async function rerunHistorySession(sessionId: string): Promise<void> {
  const t = currentT();
  const taskText = taskTextForSession(sessionId);
  if (!taskText) {
    state = { ...state, activityText: t("history.rerunUnavailable") };
    paint();
    return;
  }

  state = withDerivedMode({
    ...state,
    view: "chat",
    selectedSessionId: undefined,
    activeTask: undefined,
    suppressedSessionIds: [],
    timeline: [],
    decisionSummary: undefined,
    evidenceSummary: [],
    traceSummary: [],
    activityText: t("activity.newSession")
  });
  paint();
  await submitText(taskText);
}

function setLocale(locale: SidepanelLocale): void {
  const nextLocale = normalizeLocale(locale);
  const t = createTranslator(nextLocale);
  const timeline = state.timeline ?? [];
  const shouldLocalizeIdleState = !state.activeTask && timeline.every((item) => item.id === "welcome");

  markSettingsDirty({
    locale: nextLocale,
    activityText: shouldLocalizeIdleState ? t("activity.waiting") : state.activityText,
    timeline: shouldLocalizeIdleState ? [welcomeTimelineItem(nextLocale)] : state.timeline,
    settingsSaveMessage: t("settings.save.unsaved"),
    modelSaveMessage: undefined,
    modelDetectionMessage: undefined
  });
  paint();
}

async function refreshSession(): Promise<void> {
  const t = currentT();
  if (!hasChromeRuntime()) {
    appendDiagnostic({ title: t("runtime.unavailable.title"), detail: t("runtime.unavailable.detail"), source: "runtime", tone: "warning" });
    return;
  }
  const response = await sendRuntimeMessage<SessionStateResponse>({ type: "GET_SESSION_STATE" });
  if (response.ok) {
    applySession(response.data);
    paint();
  } else {
    appendDiagnostic({ title: t("runtime.sendFailed"), detail: response.error, source: "runtime", tone: "warning" });
    paint();
  }
}

async function submitText(text: string): Promise<void> {
  const t = currentT();
  if (!hasChromeRuntime()) {
    state = {
      ...state,
      view: "chat",
      composerInput: "",
      suppressedSessionIds: [],
      activityText: t("runtime.unavailable.title"),
      timeline: [{ id: "runtime-unavailable", title: t("runtime.unavailable.title"), detail: text, tone: "warning" }]
    };
    paint();
    return;
  }

  const appendToRunningTask = Boolean(state.activeTask && !["completed", "failed", "stopped"].includes(state.activeTask.status));
  const attachmentsForTask = appendToRunningTask ? [] : sanitizeFileAttachmentContexts(state.pendingAttachments ?? []);
  const localTaskId = appendToRunningTask ? state.activeTask?.taskId ?? "pending-task" : `pending-task-${Date.now()}`;
  const localTimeline = appendToRunningTask
    ? [...(state.timeline ?? []), { id: `local-submit-${Date.now()}`, title: t("event.TaskInterpreted"), detail: text, tone: "info" as const }]
    : [{ id: `local-start-${Date.now()}`, title: t("event.TaskStarted"), detail: text, tone: "info" as const }];
  const localTask = {
    taskId: localTaskId,
    status: "running",
    activeNodeId: appendToRunningTask ? "intent" as const : "start" as const,
    currentAction: text
  };
  const previousTurns = state.conversationTurns ?? [];
  const conversationTurns = appendToRunningTask
    ? previousTurns.map((turn) => turn.taskId === localTaskId ? { ...turn, status: "running", timeline: localTimeline, activeTask: localTask, updatedAt: formatNow() } : turn)
    : [...previousTurns, { taskId: localTaskId, taskText: text, status: "running", timeline: localTimeline, activeTask: localTask, updatedAt: formatNow() }];
  state = withDerivedMode({
    ...state,
    view: "chat",
    composerInput: "",
    selectedSessionId: undefined,
    suppressedSessionIds: [],
    activeTask: localTask,
    timeline: localTimeline,
    conversationTurns,
    activityText: text
  });
  paint();

  const response = await sendRuntimeMessage<SessionStateResponse>(
    appendToRunningTask
      ? {
          type: "APPEND_INSTRUCTION",
          text,
          modelSettings: runtimeModelSettings(state.modelSettings),
          capabilitySettings: capabilitySettingsForMessage(),
          safetyMode: state.safetyMode,
          runtimeSettings: runtimeSettingsForMessage()
        }
      : {
          type: "START_TASK",
          taskText: text,
          attachments: attachmentsForTask,
          modelSettings: runtimeModelSettings(state.modelSettings),
          capabilitySettings: capabilitySettingsForMessage(),
          safetyMode: state.safetyMode,
          runtimeSettings: runtimeSettingsForMessage()
        }
  );
  if (response.ok) {
    applySession(response.data);
    if (attachmentsForTask.length > 0) {
      state = { ...state, pendingAttachments: [] };
    }
  } else {
    const failedTimeline: TimelineItem[] = [{ id: "send-error", title: t("runtime.sendFailed"), detail: response.error, tone: "error" }];
    const failedTask = { ...localTask, status: "failed", currentAction: response.error };
    state = {
      ...state,
      activeTask: failedTask,
      activityText: t("runtime.sendFailed"),
      timeline: failedTimeline,
      conversationTurns: conversationTurns.map((turn) => turn.taskId === localTaskId
        ? { ...turn, status: "failed", timeline: failedTimeline, activeTask: failedTask, updatedAt: formatNow() }
        : turn)
    };
  }
  paint();
}

async function retryTask(taskId: string): Promise<void> {
  const t = currentT();
  const sessionId = state.activeSessionId;
  const current = state.conversationTurns?.find((turn) => turn.taskId === taskId);
  if (!sessionId || !current || current.status !== "failed") return;

  const localTimeline: TimelineItem[] = [{
    id: `local-retry-${Date.now()}`,
    title: t("event.TaskStarted"),
    detail: current.taskText,
    tone: "info"
  }];
  const activeTask = { taskId, status: "interpreting", activeNodeId: "intent" as const, currentAction: t("conversation.progress.interpreting") };
  const conversationTurns = (state.conversationTurns ?? []).map((turn) =>
    turn.taskId === taskId
      ? { ...turn, status: "interpreting", timeline: localTimeline, events: undefined, activeTask, modelStream: undefined, updatedAt: formatNow() }
      : turn
  );
  state = withDerivedMode({ ...state, activeTask, timeline: localTimeline, lastSessionEvents: [], modelStream: undefined, conversationTurns });
  paint();

  if (!hasChromeRuntime()) return;
  const response = await sendRuntimeMessage<SessionStateResponse>({
    type: "RETRY_TASK",
    sessionId,
    taskId,
    modelSettings: runtimeModelSettings(state.modelSettings),
    capabilitySettings: capabilitySettingsForMessage(),
    safetyMode: state.safetyMode,
    runtimeSettings: runtimeSettingsForMessage()
  });
  if (response.ok) {
    applySession(response.data);
  } else {
    const failedTask = { ...activeTask, status: "failed", currentAction: response.error };
    const failedTimeline: TimelineItem[] = [{ id: `retry-error-${Date.now()}`, title: t("runtime.sendFailed"), detail: response.error, tone: "error" }];
    state = withDerivedMode({
      ...state,
      activeTask: failedTask,
      timeline: failedTimeline,
      conversationTurns: conversationTurns.map((turn) => turn.taskId === taskId ? { ...turn, status: "failed", timeline: failedTimeline, activeTask: failedTask } : turn)
    });
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

async function resumeTask(): Promise<void> {
  const t = currentT();
  if (!hasChromeRuntime()) {
    appendLocalTimeline({
      id: `resume-runtime-unavailable-${Date.now()}`,
      title: t("runtime.unavailable.title"),
      detail: t("runtime.unavailable.detail"),
      tone: "warning"
    });
    paint();
    return;
  }

  state = withDerivedMode({
    ...state,
    view: "chat",
    selectedSessionId: undefined,
    activeTask: state.activeTask ? { ...state.activeTask, status: "running", activeNodeId: "observe" } : undefined,
    activityText: t("event.RuntimeResumed")
  });
  paint();

  const response = await sendRuntimeMessage<SessionStateResponse>({
    type: "RESUME_TASK",
    modelSettings: runtimeModelSettings(state.modelSettings),
    capabilitySettings: capabilitySettingsForMessage(),
    safetyMode: state.safetyMode,
    runtimeSettings: runtimeSettingsForMessage()
  });
  if (response.ok) {
    applySession(response.data);
  } else {
    appendLocalTimeline({ id: `resume-error-${Date.now()}`, title: t("runtime.resumeFailed"), detail: response.error, tone: "error" });
  }
  paint();
}

async function resolveUserConsent(approved: boolean, scope: "once" | "task" = "once"): Promise<void> {
  const t = currentT();
  if (!hasChromeRuntime()) {
    appendLocalTimeline({ id: `consent-${Date.now()}`, title: t("runtime.unavailable.title"), detail: t("runtime.unavailable.detail"), tone: "warning" });
    paint();
    return;
  }

  const response = await sendRuntimeMessage<SessionStateResponse>({ type: "RESOLVE_USER_CONSENT", approved, scope });
  if (response.ok) {
    applySession(response.data);
  } else {
    appendLocalTimeline({ id: `consent-error-${Date.now()}`, title: t("runtime.sendFailed"), detail: response.error, tone: "error" });
  }
  paint();
}

async function setOverlayMode(mode: OverlayMode): Promise<void> {
  const t = currentT();
  state = { ...state, overlayMode: mode };
  if (!saveStoredGeneralSettings({ overlayMode: mode, safetyMode: state.safetyMode, themeMode: state.themeMode ?? DEFAULT_THEME_MODE })) {
    appendDiagnostic({ title: t("runtime.overlaySyncFailed"), detail: t("model.storageUnavailable"), source: "overlay", tone: "warning" });
  }
  paint();

  if (!hasChromeRuntime()) {
    appendDiagnostic({ title: t("runtime.overlaySyncFailed"), detail: t("runtime.unavailable.detail"), source: "overlay", tone: "warning" });
    paint();
    return;
  }
  const response = await sendRuntimeMessage({ type: "SET_OVERLAY_MODE", mode });
  if (!response.ok) {
    if (isIgnorableOverlaySyncError(response.error)) return;
    appendDiagnostic({ title: t("runtime.overlaySyncFailed"), detail: response.error, source: "overlay", tone: "warning" });
    paint();
  }
}

function isIgnorableOverlaySyncError(error: string): boolean {
  return error.includes("chrome-extension://") || error.includes("chrome://") || error.includes("unsupported_tab_url");
}

function newModelInstanceId(): string {
  return `custom_provider_${Date.now().toString(36)}`;
}

function closeModelConfigEditor(): void {
  const keepNonModelDirtySettings = Boolean(state.settingsDirty && !state.modelSettingsDirty);
  state = {
    ...state,
    modelConfigWizardOpen: false,
    editingModelInstanceId: undefined,
    modelSettings: loadStoredModelSettings(),
    detectedModels: loadStoredDetectedModels(),
    modelDetectionStatus: "idle",
    modelDetectionMessage: undefined,
    modelPickerQuery: "",
    modelSettingsDirty: false,
    modelSaveStatus: "idle",
    modelSaveMessage: undefined,
    settingsDirty: keepNonModelDirtySettings,
    settingsSaveMessage: keepNonModelDirtySettings ? currentT()("settings.save.unsaved") : undefined
  };
  paint();
}

function updateOverlayMode(mode: OverlayMode): void {
  void setOverlayMode(mode);
}

function updateSafetyMode(mode: SidepanelState["safetyMode"]): void {
  markSettingsDirty({ safetyMode: mode });
  paint();
}

function setThemeMode(mode: ThemeMode): void {
  const nextMode: ThemeMode = mode === "light" || mode === "dark" || mode === "system" ? mode : DEFAULT_THEME_MODE;
  applyThemeMode(nextMode);
  markSettingsDirty({ themeMode: nextMode });
  if (!saveStoredGeneralSettings({ overlayMode: state.overlayMode, safetyMode: state.safetyMode, themeMode: nextMode })) {
    appendDiagnostic({ title: currentT()("model.storageUnavailable"), source: "settings", tone: "warning" });
  }
  paint();
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
  state = applyModelSettingChangeState(state, {
    field,
    value,
    defaultSettings: defaultModelSettings(),
    unsavedMessage: currentT()("settings.save.unsaved")
  });
  paint();
}

function settingsSaveFailureMessage(
  t: ReturnType<typeof createTranslator>,
  failures: {
    settingsSaved: boolean;
    capabilitySaved: boolean;
    modelContextSynced: boolean;
    runtimeSaved: boolean;
    localeSaved: boolean;
    generalSaved: boolean;
  }
): string {
  const parts = [
    !failures.settingsSaved ? t("settings.save.partModel") : "",
    !failures.capabilitySaved ? t("settings.save.partCapabilities") : "",
    !failures.modelContextSynced ? t("settings.save.partModelContext") : "",
    !failures.runtimeSaved ? t("settings.save.partRuntime") : "",
    !failures.localeSaved ? t("settings.save.partLocale") : "",
    !failures.generalSaved ? t("settings.save.partGeneral") : ""
  ].filter(Boolean);
  return t("settings.save.failedParts", { parts: parts.join(" / ") || t("settings.save.partGeneral") });
}

async function pickPlannerModel(model: string): Promise<void> {
  const t = currentT();
  const plannerModel = model.trim();
  if (!plannerModel) return;

  const settings: ModelSettingsState = {
    ...(state.modelSettings ?? defaultModelSettings()),
    plannerModel
  };
  const settingsSaved = saveStoredModelSettings(settings);
  const modelsSaved = saveStoredDetectedModels(state.detectedModels ?? []);
  const modelContextSynced = await syncModelConfigContext(settings, state.detectedModels ?? []);
  if (!modelsSaved) {
    appendDiagnostic({ title: t("settings.save.detectedModelCacheWarning"), source: "settings", tone: "warning" });
  }
  const saved = settingsSaved && modelContextSynced;

  state = applyPlannerQuickPickState(state, {
    modelSettings: settings,
    modelConfigured: isModelConfigured(settings),
    saved,
    savedMessage: t("model.saved"),
    missingModelMessage: t("settings.save.savedModelMissing"),
    storageErrorMessage: t("model.storageUnavailable")
  });
  paint();
}

async function saveSettings(): Promise<void> {
  const t = currentT();
  const settings = state.modelSettings ?? defaultModelSettings();

  const settingsSaved = saveStoredModelSettings(settings);
  const capabilitySaved = saveStoredCapabilitySettings(state.capabilitySettings ?? defaultCapabilitySettings());
  const modelsSaved = saveStoredDetectedModels(state.detectedModels ?? []);
  const modelContextSynced = await syncModelConfigContext(settings, state.detectedModels ?? []);
  const runtimeSaved = saveStoredRuntimeSettings(state.runtimeSettings ?? standardRuntimeSettings);
  const localeSaved = saveStoredLocale(normalizeLocale(state.locale));
  const generalSaved = saveStoredGeneralSettings({
    overlayMode: state.overlayMode,
    safetyMode: state.safetyMode,
    themeMode: state.themeMode ?? DEFAULT_THEME_MODE
  });
  if (!modelsSaved) {
    appendDiagnostic({ title: t("settings.save.detectedModelCacheWarning"), source: "settings", tone: "warning" });
  }
  if (!settingsSaved || !capabilitySaved || !modelContextSynced || !runtimeSaved || !localeSaved || !generalSaved) {
    const failureMessage = settingsSaveFailureMessage(t, { settingsSaved, capabilitySaved, modelContextSynced, runtimeSaved, localeSaved, generalSaved });
    state = {
      ...state,
      settingsSaveStatus: "error",
      settingsSaveMessage: failureMessage,
      modelSaveStatus: "error",
      modelSaveMessage: failureMessage
    };
    paint();
    return;
  }

  state = {
    ...state,
    modelConfigured: isModelConfigured(settings),
    settingsDirty: false,
    settingsSaveStatus: "saved",
    settingsSaveMessage: isModelConfigured(settings) ? t("settings.save.saved") : t("settings.save.savedModelMissing"),
    modelSettingsDirty: false,
    modelSaveStatus: "saved",
    modelSaveMessage: isModelConfigured(settings) ? t("model.saved") : t("settings.save.savedModelMissing"),
    modelConfigWizardOpen: false,
    editingModelInstanceId: undefined
  };
  paint();
  await setOverlayMode(state.overlayMode);
}

function updateCapabilitySetting(section: "skills" | "search", field: string, value: boolean | string | number): void {
  const current = state.capabilitySettings ?? defaultCapabilitySettings();
  const next =
    section === "skills"
      ? {
          ...current,
          skills: {
            ...current.skills,
            [field]: Boolean(value)
          }
        }
      : {
          ...current,
          search: {
            ...current.search,
            [field]: normalizeCapabilitySearchValue(field, value)
          }
        };
  markSettingsDirty({ capabilitySettings: resolveCapabilitySettings(next) });
  paint();
}

function normalizeCapabilitySearchValue(field: string, value: boolean | string | number): string | number | SearchProviderMode {
  if (field === "provider") {
    return value === "disabled" || value === "browser_context" || value === "custom_endpoint" ? value : "disabled";
  }
  if (field === "maxResults") {
    const next = typeof value === "number" ? value : Number(value);
    return Number.isFinite(next) ? next : defaultCapabilitySettings().search.maxResults;
  }
  return String(value);
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
    const plannerModel = preferredPlannerModelAfterDetection(models, settings.plannerModel);
    const nextSettings: ModelSettingsState = {
      ...settings,
      plannerModel,
      visionModel: settings.visionModel && models.includes(settings.visionModel) ? settings.visionModel : ""
    };
    state = applyModelDetectionSuccessState(state, {
      modelSettings: nextSettings,
      detectedModels: models,
      message: t("model.detect.success", { count: models.length, model: plannerModel }),
      unsavedMessage: t("settings.save.unsaved")
    });
  } catch (error) {
    state = {
      ...state,
      modelDetectionStatus: "error",
      modelDetectionMessage: error instanceof Error ? error.message : t("model.detect.failure")
    };
  }
  paint();
}

async function copyLog(sessionId?: string): Promise<void> {
  const t = currentT();
  const effectiveSessionId = currentLogSessionId(sessionId);
  const text = buildLogText(effectiveSessionId);
  if (!navigator.clipboard?.writeText) {
    if (effectiveSessionId) {
      state = { ...state, activityText: t("copy.unavailable.title") };
      paint();
      return;
    }
    appendLocalTimeline({ id: `copy-${Date.now()}`, title: t("copy.unavailable.title"), detail: t("copy.unavailable.detail"), tone: "warning" });
    paint();
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    if (effectiveSessionId) {
      state = { ...state, activityText: t("copy.success.title") };
      paint();
      return;
    }
    appendLocalTimeline({ id: `copy-${Date.now()}`, title: t("copy.success.title"), detail: t("copy.success.detail"), tone: "success" });
  } catch (error) {
    if (effectiveSessionId) {
      state = { ...state, activityText: t("copy.failure.title") };
      paint();
      return;
    }
    appendLocalTimeline({ id: `copy-${Date.now()}`, title: t("copy.failure.title"), detail: String(error), tone: "warning" });
  }
  paint();
}

function downloadLog(sessionId?: string): void {
  const t = currentT();
  const effectiveSessionId = currentLogSessionId(sessionId);
  const blob = new Blob([buildLogText(effectiveSessionId)], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = effectiveSessionId ? `naturalclick-session-${effectiveSessionId}-${Date.now()}.txt` : `naturalclick-log-${Date.now()}.txt`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  if (effectiveSessionId) {
    state = { ...state, activityText: t("download.success.title") };
    paint();
    return;
  }
  appendLocalTimeline({ id: `download-${Date.now()}`, title: t("download.success.title"), detail: anchor.download, tone: "success" });
  paint();
}

async function downloadArtifact(artifactId: string): Promise<void> {
  const t = currentT();
  if (!hasChromeRuntime()) {
    state = { ...state, activityText: t("artifacts.unavailable") };
    paint();
    return;
  }
  const response = await sendRuntimeMessage<ArtifactDetailProtocolState>({ type: "GET_ARTIFACT_DETAIL", artifactId });
  const artifact = response.ok ? response.data.artifact : undefined;
  if (!artifact) {
    state = { ...state, activityText: response.ok ? t("artifacts.unavailable") : response.error };
    paint();
    return;
  }
  const blob = new Blob([artifact.textContent], { type: `${artifact.mime || "text/plain"};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = artifact.filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  const [summary] = stripGeneratedArtifactContent([artifact], 1);
  state = {
    ...state,
    generatedArtifacts: summary ? [summary, ...(state.generatedArtifacts ?? []).filter((item) => item.id !== summary.id)].slice(0, 20) : state.generatedArtifacts,
    activityText: t("artifacts.downloaded")
  };
  paint();
}

let panelOpenBlankSession: Promise<void> | undefined;
let lastPanelHiddenAt = 0;
let blankSessionResetInFlight = false;

function startBlankSessionForPanelOpen(reason: string): void {
  if (panelOpenBlankSession) return;
  panelOpenBlankSession = startBlankSession({ reason }).finally(() => {
    panelOpenBlankSession = undefined;
  });
}

paint();
void refreshModelConfigState();
startBlankSessionForPanelOpen("sidepanel_opened");
subscribeRuntimeEvents({
  onEvent: applyRuntimeEvent,
  onDisconnect: () => {
    if (state.activeSessionId) void refreshSession();
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    lastPanelHiddenAt = Date.now();
    return;
  }
  if (document.visibilityState === "visible" && lastPanelHiddenAt > 0) {
    lastPanelHiddenAt = 0;
    if (shouldRefreshSessionOnPanelVisible(state)) void refreshSession();
  }
});
if (hasChromeRuntime()) {
  void setOverlayMode(state.overlayMode);
}
