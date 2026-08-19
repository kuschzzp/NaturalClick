import type { AgentEvent, AgentEventType } from "../core/events/events";
import type { FileAttachmentContext, GeneratedTextArtifactSummary } from "../core/capabilities/file-artifacts";
import type { ScratchpadRecord } from "../core/capabilities/scratchpad";
import type { ScheduledTaskRecord } from "../core/capabilities/schedule";
import type { SkillPackageSummary } from "../core/capabilities/skills";
import type { RuntimeSettings } from "../core/runtime/execution-budget";
import type { ModelConfigProtocolState } from "../shared/protocol";
import { createTranslator, type SidepanelLocale, type TranslationKey } from "./i18n";
import { defaultModelSettings, type CapabilitySettingsState, type ModelSettingsState } from "./settings";
import { classifyRuntimeIssue, formatRuntimeIssue } from "./runtime-issue";

export type SidepanelMode = "conversation" | "workbench";
export type SidepanelView = "chat" | "history" | "history-detail" | "settings" | "schedules";
export type OverlayMode = "Off" | "Focus" | "All Targets" | "Evidence" | "Vision";
export type SidepanelSafetyMode = "conservative" | "balanced" | "autonomous" | "experimental_full_auto";
export type SettingsTabId = "configs" | "skills" | "search" | "general";
export type ThemeMode = "system" | "light" | "dark";
export type ModelDetectionStatus = "idle" | "checking" | "success" | "error";
export type ModelSaveStatus = "idle" | "saved" | "error";
export type FlowNodeId = "start" | "intent" | "observe" | "route" | "plan" | "act" | "verify" | "reply";
export type RuntimeFlowNodeStatus = "done" | "active" | "waiting" | "blocked";
export const GENERAL_SETTINGS_STORAGE_VERSION = 3;

export interface RuntimeFlowNode {
  id: FlowNodeId;
  label: string;
  shortLabel: string;
  description: string;
  status: RuntimeFlowNodeStatus;
}

export interface ActiveTaskState {
  taskId: string;
  status: string;
  currentAction?: string;
  activeNodeId?: FlowNodeId;
  targetLabel?: string;
  expectedOutcome?: string;
  semanticTargetId?: string;
  bindingSource?: "DOM" | "Vision" | "DOM+Vision";
  riskLevel?: "low" | "medium" | "high" | "blocked";
}

export interface TimelineItem {
  id: string;
  title: string;
  detail?: string;
  tone?: "info" | "success" | "warning" | "error";
  eventType?: AgentEventType;
}

export function deriveSessionTitle(prompt: string | undefined, fallback: string, limit = 15): string {
  const normalized = String(prompt ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return fallback;
  const characters = Array.from(normalized);
  return characters.length > limit ? `${characters.slice(0, limit).join("")}...` : normalized;
}

export interface RunDigestMetric {
  id: "events" | "modelCalls" | "observations" | "slowCalls" | "hiddenNoise";
  label: string;
  value: string;
  tone?: TimelineItem["tone"];
}

export interface RunDigest {
  summary: string;
  latest?: TimelineItem;
  metrics: RunDigestMetric[];
  recentSteps: TimelineItem[];
  hiddenNoiseCount: number;
  eventCount: number;
}

export interface ModelStreamState {
  title: string;
  text: string;
  reasoningText?: string;
  contentText?: string;
  toolArgumentsText?: string;
  phase?: "waiting" | "reasoning" | "tool" | "answering" | "complete";
  isStreaming: boolean;
  role?: string;
  model?: string;
  chunkCount?: number;
  receivedChars?: number;
  toolNames?: string[];
  truncated?: boolean;
}

export interface ConversationTurnState {
  taskId: string;
  taskText: string;
  status: string;
  timeline: TimelineItem[];
  events?: AgentEvent[];
  activeTask?: ActiveTaskState;
  modelStream?: ModelStreamState;
  updatedAt: string;
}

export interface DiagnosticEvent {
  id: string;
  at: string;
  title: string;
  detail?: string;
  source?: string;
  tone?: "info" | "success" | "warning" | "error";
  count?: number;
}

export interface SessionSummary {
  id: string;
  title: string;
  status: string;
  updatedAt: string;
  eventCount: number;
  taskText?: string;
  hasDetail?: boolean;
}

export interface SessionRecord extends SessionSummary {
  timeline: TimelineItem[];
  events?: AgentEvent[];
  turns?: ConversationTurnState[];
  activityText?: string;
  decisionSummary?: string;
  evidenceSummary?: string[];
  traceSummary?: string[];
}

export interface PendingConfirmationState {
  id: string;
  message: string;
  detail?: string;
  subject?: string;
  confirmLabel: string;
  cancelLabel: string;
  action: "delete-session" | "clear-history";
  sessionId?: string;
}

export interface SidepanelState {
  mode: SidepanelMode;
  locale?: SidepanelLocale;
  view?: SidepanelView;
  overlayMode: OverlayMode;
  safetyMode: SidepanelSafetyMode;
  themeMode?: ThemeMode;
  settingsTab?: SettingsTabId;
  toolMenuOpen?: boolean;
  modelPickerOpen?: boolean;
  modelPickerQuery?: string;
  modelConfigWizardOpen?: boolean;
  editingModelInstanceId?: string;
  modelConfigured: boolean;
  activeTask?: ActiveTaskState;
  traceOpen: boolean;
  settingsOpen?: boolean;
  timeline?: TimelineItem[];
  conversationTurns?: ConversationTurnState[];
  sessions?: SessionSummary[];
  sessionRecords?: Record<string, SessionRecord>;
  selectedSessionId?: string;
  activeSessionId?: string;
  suppressedSessionIds?: string[];
  lastSessionEvents?: AgentEvent[];
  diagnostics?: DiagnosticEvent[];
  activityText?: string;
  modelSettings?: ModelSettingsState;
  modelConfigState?: ModelConfigProtocolState;
  capabilitySettings?: CapabilitySettingsState;
  skills?: SkillPackageSummary[];
  skillsLoading?: boolean;
  skillsError?: string;
  schedules?: ScheduledTaskRecord[];
  schedulesLoading?: boolean;
  schedulesError?: string;
  scratchpadRecords?: ScratchpadRecord[];
  scratchpadLoading?: boolean;
  scratchpadError?: string;
  settingsDirty?: boolean;
  settingsSaveStatus?: ModelSaveStatus;
  settingsSaveMessage?: string;
  modelSettingsDirty?: boolean;
  modelSaveStatus?: ModelSaveStatus;
  modelSaveMessage?: string;
  detectedModels?: string[];
  modelDetectionStatus?: ModelDetectionStatus;
  modelDetectionMessage?: string;
  runtimeSettings?: RuntimeSettings;
  decisionSummary?: string;
  evidenceSummary?: string[];
  traceSummary?: string[];
  modelStream?: ModelStreamState;
  composerInput?: string;
  pendingInstructions?: Array<{ id: string; text: string }>;
  pendingAttachments?: FileAttachmentContext[];
  generatedArtifacts?: GeneratedTextArtifactSummary[];
  artifactsLoading?: boolean;
  artifactsError?: string;
  pendingConfirmation?: PendingConfirmationState;
}

export type GeneralSettingsState = Pick<SidepanelState, "overlayMode" | "safetyMode"> & { themeMode: ThemeMode };

function isStoredOverlayMode(value: unknown): value is OverlayMode {
  return value === "Off" || value === "Focus" || value === "All Targets" || value === "Evidence" || value === "Vision";
}

function isStoredSafetyMode(value: unknown): value is SidepanelSafetyMode {
  return value === "conservative" || value === "balanced" || value === "autonomous" || value === "experimental_full_auto";
}

function isStoredThemeMode(value: unknown): value is ThemeMode {
  return value === "system" || value === "light" || value === "dark";
}

export function resolveStoredGeneralSettings(value: unknown, defaults: GeneralSettingsState): GeneralSettingsState {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const version = typeof record.version === "number" ? record.version : 0;
  const storedOverlayMode = isStoredOverlayMode(record.overlayMode) ? record.overlayMode : defaults.overlayMode;
  return {
    overlayMode: version < GENERAL_SETTINGS_STORAGE_VERSION && storedOverlayMode === "All Targets" ? defaults.overlayMode : storedOverlayMode,
    safetyMode: isStoredSafetyMode(record.safetyMode) ? record.safetyMode : defaults.safetyMode,
    themeMode: isStoredThemeMode(record.themeMode) ? record.themeMode : defaults.themeMode
  };
}

export function serializeGeneralSettings(settings: GeneralSettingsState): string {
  return JSON.stringify({
    version: GENERAL_SETTINGS_STORAGE_VERSION,
    overlayMode: settings.overlayMode,
    safetyMode: settings.safetyMode,
    themeMode: settings.themeMode
  });
}

export const RUNTIME_FLOW: Array<Omit<RuntimeFlowNode, "status">> = [
  {
    id: "start",
    label: "开始",
    shortLabel: "开",
    description: "接收用户目标"
  },
  {
    id: "intent",
    label: "意图理解",
    shortLabel: "脑",
    description: "拆解任务和约束"
  },
  {
    id: "observe",
    label: "页面观察",
    shortLabel: "观",
    description: "DOM、截图、元素标号"
  },
  {
    id: "route",
    label: "路由判断",
    shortLabel: "判",
    description: "继续、追问或确认"
  },
  {
    id: "plan",
    label: "计划动作",
    shortLabel: "计",
    description: "生成下一条语义命令"
  },
  {
    id: "act",
    label: "Chrome 执行",
    shortLabel: "执",
    description: "执行页面动作"
  },
  {
    id: "verify",
    label: "结果校验",
    shortLabel: "验",
    description: "确认页面是否推进"
  },
  {
    id: "reply",
    label: "回复用户",
    shortLabel: "答",
    description: "输出结果和下一步"
  }
];

export function deriveSidepanelMode(state: SidepanelState): SidepanelMode {
  if (state.traceOpen) return "workbench";
  if (state.activeTask && !["completed", "failed", "stopped"].includes(state.activeTask.status)) return "workbench";
  return "conversation";
}

export function needsModelGuidance(state: SidepanelState): boolean {
  return !state.modelConfigured;
}

export function withDerivedMode(state: SidepanelState): SidepanelState {
  return { ...state, mode: deriveSidepanelMode(state) };
}

export function openNewModelConfigState(state: SidepanelState, instanceId: string): SidepanelState {
  return {
    ...state,
    view: "settings",
    settingsOpen: true,
    settingsTab: "configs",
    modelConfigWizardOpen: true,
    editingModelInstanceId: instanceId,
    modelSettings: defaultModelSettings(),
    detectedModels: [],
    modelDetectionStatus: "idle",
    modelDetectionMessage: undefined,
    modelPickerQuery: "",
    modelSettingsDirty: false,
    toolMenuOpen: false,
    modelPickerOpen: false
  };
}

export function openModelConfigEditorState(state: SidepanelState, instanceId?: string): SidepanelState {
  const draft = instanceId ? modelSettingsDraftForInstance(state, instanceId) : undefined;
  return {
    ...state,
    ...(draft
      ? {
          modelSettings: draft.modelSettings,
          detectedModels: draft.detectedModels,
          modelDetectionStatus: draft.detectedModels.length > 0 ? ("success" as const) : state.modelDetectionStatus,
          modelDetectionMessage: state.modelDetectionMessage,
          modelPickerQuery: ""
        }
      : {}),
    view: "settings",
    settingsOpen: true,
    settingsTab: "configs",
    modelConfigWizardOpen: true,
    editingModelInstanceId: draft ? instanceId : undefined,
    toolMenuOpen: false,
    modelPickerOpen: false
  };
}

function modelSettingsDraftForInstance(
  state: SidepanelState,
  instanceId: string
): { modelSettings: ModelSettingsState; detectedModels: string[] } | undefined {
  const instance = state.modelConfigState?.instances.find((item) => item.id === instanceId);
  if (!instance) return undefined;

  const current = state.modelSettings ?? defaultModelSettings();
  const detectedModels = instance.models.map((model) => model.id);
  const plannerSelection = state.modelConfigState?.roleSelections?.planner ?? state.modelConfigState?.activeSelection;
  const visionSelection = state.modelConfigState?.roleSelections?.vision;
  const currentVisionModel = current.visionModel ?? "";
  const plannerModel =
    plannerSelection?.instanceId === instance.id
      ? plannerSelection.model
      : detectedModels.includes(current.plannerModel)
        ? current.plannerModel
        : instance.models.find((model) => model.tools)?.id ?? detectedModels[0] ?? "";
  const visionModel =
    visionSelection?.instanceId === instance.id
      ? visionSelection.model
      : detectedModels.includes(currentVisionModel)
        ? currentVisionModel
        : instance.models.find((model) => model.vision)?.id ?? "";

  return {
    modelSettings: {
      ...current,
      providerBaseUrl: instance.baseUrl,
      plannerModel,
      visionModel,
      apiKeyRef: instance.apiKeyRef
    },
    detectedModels
  };
}

export function applyModelDetectionSuccessState(
  state: SidepanelState,
  input: {
    modelSettings: ModelSettingsState;
    detectedModels: string[];
    message: string;
    unsavedMessage: string;
  }
): SidepanelState {
  return {
    ...state,
    modelSettings: input.modelSettings,
    modelConfigured: false,
    settingsDirty: true,
    settingsSaveStatus: "idle",
    settingsSaveMessage: input.unsavedMessage,
    modelSettingsDirty: true,
    detectedModels: input.detectedModels,
    modelDetectionStatus: "success",
    modelDetectionMessage: input.message,
    modelSaveStatus: "idle",
    modelSaveMessage: input.unsavedMessage,
    modelPickerQuery: ""
  };
}

export function applyModelSettingChangeState(
  state: SidepanelState,
  input: {
    field: "providerBaseUrl" | "apiKey" | "plannerModel" | "visionModel";
    value: string;
    defaultSettings: ModelSettingsState;
    unsavedMessage: string;
  }
): SidepanelState {
  const resetDetection = input.field === "providerBaseUrl" || input.field === "apiKey";
  const modelSettings: ModelSettingsState = {
    ...(state.modelSettings ?? input.defaultSettings),
    [input.field]: input.value,
    ...(resetDetection ? { plannerModel: "", visionModel: "" } : {})
  };

  return {
    ...state,
    modelSettings,
    modelConfigured: false,
    settingsDirty: true,
    settingsSaveStatus: "idle",
    settingsSaveMessage: input.unsavedMessage,
    modelSettingsDirty: true,
    modelSaveStatus: "idle",
    modelSaveMessage: input.unsavedMessage,
    modelDetectionStatus: resetDetection ? "idle" : state.modelDetectionStatus,
    modelDetectionMessage: resetDetection ? undefined : state.modelDetectionMessage,
    detectedModels: resetDetection ? [] : state.detectedModels,
    modelPickerQuery: resetDetection ? "" : state.modelPickerQuery
  };
}

export function applyPlannerQuickPickState(
  state: SidepanelState,
  input: {
    modelSettings: ModelSettingsState;
    modelConfigured: boolean;
    saved: boolean;
    savedMessage: string;
    missingModelMessage: string;
    storageErrorMessage: string;
  }
): SidepanelState {
  const hadNonModelDirtySettings = Boolean(state.settingsDirty && !state.modelSettingsDirty);
  return {
    ...state,
    modelSettings: input.modelSettings,
    modelConfigured: input.modelConfigured,
    modelPickerOpen: false,
    modelPickerQuery: "",
    modelSettingsDirty: !input.saved,
    modelSaveStatus: input.saved ? "saved" : "error",
    modelSaveMessage: input.saved
      ? input.modelConfigured
        ? input.savedMessage
        : input.missingModelMessage
      : input.storageErrorMessage,
    settingsDirty: input.saved ? hadNonModelDirtySettings : true,
    settingsSaveStatus: input.saved ? (hadNonModelDirtySettings ? state.settingsSaveStatus : "saved") : "error",
    settingsSaveMessage: input.saved
      ? hadNonModelDirtySettings
        ? state.settingsSaveMessage
        : input.modelConfigured
          ? input.savedMessage
          : input.missingModelMessage
      : input.storageErrorMessage
  };
}

export function flowNodeForEventType(type: AgentEventType): FlowNodeId {
  switch (type) {
    case "TaskStarted":
      return "start";
    case "TaskInterpreted":
    case "PlanRequested":
    case "ModelCallStarted":
    case "ModelCallProgress":
    case "ModelCallCompleted":
    case "ModelCallFailed":
    case "ModelContractViolation":
      return "intent";
    case "ObservationRequested":
    case "ObservationReceived":
    case "EvidenceAdded":
    case "ScreenshotCaptured":
    case "VisionRequested":
    case "VisionCompleted":
    case "VisualEvidenceAdded":
      return "observe";
    case "PolicyEvaluated":
    case "UserConsentRequested":
    case "UserConsentResolved":
    case "RecoverySuggested":
      return "route";
    case "PlanProduced":
    case "CommandBound":
      return "plan";
    case "CommandIssued":
    case "CommandResultReceived":
    case "ToolCallStarted":
    case "ToolCallCompleted":
    case "ToolCallFailed":
      return "act";
    case "VerificationProduced":
    case "MemoryUpdated":
      return "verify";
    case "TaskCompleted":
    case "TaskFailed":
    case "TaskStopped":
    case "RuntimeSuspended":
    case "RuntimeResumed":
      return "reply";
  }
}

export function deriveActiveNodeId(state: SidepanelState): FlowNodeId | undefined {
  if (!state.activeTask) return undefined;
  if (state.activeTask.activeNodeId) return state.activeTask.activeNodeId;

  switch (state.activeTask.status) {
    case "completed":
    case "failed":
    case "stopped":
      return "reply";
    case "waiting":
    case "awaiting_confirmation":
    case "blocked":
      return "route";
    case "observing":
      return "observe";
    case "executing":
      return "act";
    case "verifying":
      return "verify";
    case "interpreting":
      return "intent";
    case "planning":
    case "running":
    default:
      return "plan";
  }
}

export function deriveRuntimeFlow(state: SidepanelState): RuntimeFlowNode[] {
  const activeNodeId = deriveActiveNodeId(state);
  const activeIndex = activeNodeId ? RUNTIME_FLOW.findIndex((node) => node.id === activeNodeId) : -1;
  const blocked = state.activeTask?.status === "failed" || state.activeTask?.status === "blocked";

  return RUNTIME_FLOW.map((node, index) => {
    let status: RuntimeFlowNodeStatus = "waiting";
    if (activeIndex >= 0 && index < activeIndex) status = "done";
    if (activeIndex >= 0 && index === activeIndex) status = blocked ? "blocked" : "active";
    return { ...node, status };
  });
}

function stringPayload(payload: Record<string, unknown>, keys: string[], locale?: SidepanelLocale): string | undefined {
  const t = createTranslator(locale);
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "boolean") return value ? t("value.true") : t("value.false");
    if (typeof value === "number") return String(value);
  }
  return undefined;
}

function eventPayloadStatus(payload: Record<string, unknown>, key = "status"): string | undefined {
  const value = payload[key];
  return typeof value === "string" ? value : undefined;
}

function commandResultStatus(payload: Record<string, unknown>): string | undefined {
  const result = payload.result;
  if (!result || typeof result !== "object") return undefined;
  return eventPayloadStatus(result as Record<string, unknown>);
}

function eventTone(type: AgentEventType, payload: Record<string, unknown> = {}): TimelineItem["tone"] {
  if (type === "TaskCompleted") return "success";
  if (type === "VerificationProduced") {
    const status = eventPayloadStatus(payload);
    if (status === "failed") return "error";
    if (status === "partial" || status === "inconclusive") return "warning";
    return "success";
  }
  if (type === "CommandResultReceived" && commandResultStatus(payload) === "failed") return "error";
  if (type === "TaskStopped" || type === "UserConsentRequested" || type === "RecoverySuggested") return "warning";
  if (type === "TaskFailed" || type === "ModelCallFailed" || type === "ModelContractViolation") return "error";
  return "info";
}

function eventTitle(type: AgentEventType, locale?: SidepanelLocale): string {
  return createTranslator(locale)(`event.${type}` as TranslationKey);
}

function modelString(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function modelRawString(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isModelEvent(type: AgentEventType): boolean {
  return type === "ModelCallStarted" || type === "ModelCallProgress" || type === "ModelCallCompleted" || type === "ModelCallFailed";
}

function observationDetail(payload: Record<string, unknown>, locale?: SidepanelLocale): string | undefined {
  if (!payload.retrieval || typeof payload.retrieval !== "object") return undefined;
  const retrieval = payload.retrieval as Record<string, unknown>;
  const query = typeof retrieval.query === "string" && retrieval.query.trim() ? retrieval.query : undefined;
  const scope = typeof retrieval.scope === "string" && retrieval.scope.trim() ? retrieval.scope : undefined;
  const returned = typeof retrieval.returnedControls === "number" ? retrieval.returnedControls : payload.controls;
  const total = typeof retrieval.totalControls === "number" ? retrieval.totalControls : undefined;
  const limit = typeof retrieval.candidateLimit === "number" ? retrieval.candidateLimit : payload.candidateLimit;
  const count = total ? `${returned}/${total}` : String(returned ?? "");
  if (locale === "zh-CN") {
    return [
      count ? `候选 ${count}` : undefined,
      scope ? `范围 ${scope}` : undefined,
      query ? `检索 ${query}` : undefined,
      limit ? `上限 ${limit}` : undefined
    ]
      .filter(Boolean)
      .join(" · ");
  }
  return [
    count ? `Candidates ${count}` : undefined,
    scope ? `scope ${scope}` : undefined,
    query ? `query ${query}` : undefined,
    limit ? `limit ${limit}` : undefined
  ]
    .filter(Boolean)
    .join(" · ");
}

export function mapEventToTimelineItem(event: AgentEvent, locale?: SidepanelLocale): TimelineItem {
  const issue = classifyRuntimeIssue(event, locale);
  const detail =
    issue
      ? formatRuntimeIssue(issue, locale)
      : event.type === "ObservationReceived"
      ? observationDetail(event.payload, locale) ??
        stringPayload(event.payload, [
          "taskText",
          "instruction",
          "summary",
          "detail",
          "command",
          "commandName",
          "targetLabel",
          "expectedOutcome",
          "message",
          "reason",
          "error"
        ], locale)
      : stringPayload(event.payload, [
          "taskText",
          "instruction",
          "summary",
          "detail",
          "command",
          "commandName",
          "targetLabel",
          "expectedOutcome",
          "message",
          "reason",
          "error"
        ], locale);

  return {
    id: event.id,
    title: eventTitle(event.type, locale),
    detail,
    tone: eventTone(event.type, event.payload),
    eventType: event.type
  };
}

function eventCountDetail(type: "EvidenceAdded" | "ModelCallProgress", events: AgentEvent[], locale?: SidepanelLocale): string {
  if (type === "EvidenceAdded") {
    const kindCounts = new Map<string, number>();
    for (const event of events) {
      const evidence = event.payload.evidence;
      const kind =
        evidence && typeof evidence === "object" && "kind" in evidence && typeof (evidence as { kind?: unknown }).kind === "string"
          ? (evidence as { kind: string }).kind
          : "unknown";
      kindCounts.set(kind, (kindCounts.get(kind) ?? 0) + 1);
    }
    const topKinds = Array.from(kindCounts.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 3)
      .map(([kind, count]) => `${kind} ${count}`)
      .join(", ");
    return locale === "zh-CN" ? `${events.length} 条证据${topKinds ? ` · ${topKinds}` : ""}` : `${events.length} evidence items${topKinds ? ` · ${topKinds}` : ""}`;
  }

  const last = events.at(-1)?.payload;
  const chunks = typeof last?.chunkIndex === "number" ? last.chunkIndex : events.length;
  const chars = typeof last?.receivedChars === "number" ? last.receivedChars : undefined;
  return locale === "zh-CN"
    ? `${chunks} 个片段${chars !== undefined ? ` · ${chars} 字符` : ""}`
    : `${chunks} chunks${chars !== undefined ? ` · ${chars} chars` : ""}`;
}

export function buildTimelineItems(events: AgentEvent[], locale?: SidepanelLocale): TimelineItem[] {
  const items: TimelineItem[] = [];
  let bufferedType: "EvidenceAdded" | "ModelCallProgress" | undefined;
  let bufferedEvents: AgentEvent[] = [];

  const flush = (): void => {
    if (!bufferedType || bufferedEvents.length === 0) return;
    const first = bufferedEvents[0];
    items.push({
      id: `${first.id}-group-${bufferedEvents.length}`,
      title: eventTitle(bufferedType, locale),
      detail: eventCountDetail(bufferedType, bufferedEvents, locale),
      tone: eventTone(bufferedType),
      eventType: bufferedType
    });
    bufferedType = undefined;
    bufferedEvents = [];
  };

  for (const event of events) {
    if (event.type === "EvidenceAdded" || event.type === "ModelCallProgress") {
      if (bufferedType !== event.type) flush();
      bufferedType = event.type;
      bufferedEvents.push(event);
      continue;
    }
    flush();
    items.push(mapEventToTimelineItem(event, locale));
  }
  flush();
  return items;
}

function isDigestNoiseEvent(type: AgentEventType): boolean {
  return type === "EvidenceAdded" || type === "ModelCallProgress";
}

function isDigestStepEvent(type: AgentEventType): boolean {
  return (
    type === "TaskStarted" ||
    type === "TaskInterpreted" ||
    type === "ObservationReceived" ||
    type === "PlanProduced" ||
    type === "CommandIssued" ||
    type === "CommandResultReceived" ||
    type === "VerificationProduced" ||
    type === "RecoverySuggested" ||
    type === "UserConsentRequested" ||
    type === "TaskCompleted" ||
    type === "TaskFailed" ||
    type === "TaskStopped" ||
    type === "RuntimeSuspended" ||
    type === "RuntimeResumed"
  );
}

function isSlowRuntimeEvent(event: AgentEvent): boolean {
  if (event.type === "ModelCallCompleted" && typeof event.payload.durationMs === "number") return event.payload.durationMs > 8000;
  if (event.type === "ObservationReceived" && typeof event.payload.durationMs === "number") return event.payload.durationMs > 1200;
  return false;
}

function latestDigestTimelineItem(events: AgentEvent[], timeline: TimelineItem[], locale?: SidepanelLocale): TimelineItem | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (!event || isDigestNoiseEvent(event.type)) continue;
    if (isDigestStepEvent(event.type) || eventTone(event.type, event.payload) !== "info") return mapEventToTimelineItem(event, locale);
  }
  return [...timeline].reverse().find((item) => item.detail || item.title);
}

export function buildRunDigest(events: AgentEvent[], timeline: TimelineItem[], locale?: SidepanelLocale): RunDigest {
  const t = createTranslator(locale);
  const eventCount = events.length || timeline.length;
  const modelCalls = events.filter((event) => event.type === "ModelCallStarted").length;
  const observations = events.filter((event) => event.type === "ObservationReceived").length;
  const slowCalls = events.filter(isSlowRuntimeEvent).length;
  const hiddenNoiseCount = events.filter((event) => isDigestNoiseEvent(event.type)).length;
  const latest = latestDigestTimelineItem(events, timeline, locale);
  const recentSteps =
    events.length > 0
      ? events
          .filter((event) => isDigestStepEvent(event.type))
          .slice(-4)
          .map((event) => mapEventToTimelineItem(event, locale))
      : timeline.filter((item) => item.id !== "welcome").slice(-4);

  const metrics: RunDigestMetric[] = [
    { id: "events", label: t("runDigest.events"), value: String(eventCount) },
    { id: "modelCalls", label: t("runDigest.modelCalls"), value: String(modelCalls) },
    { id: "observations", label: t("runDigest.observations"), value: String(observations) },
    { id: "slowCalls", label: t("runDigest.slowCalls"), value: String(slowCalls), tone: slowCalls > 0 ? "warning" : undefined }
  ];
  if (hiddenNoiseCount > 0) {
    metrics.push({ id: "hiddenNoise", label: t("runDigest.hiddenNoise"), value: String(hiddenNoiseCount), tone: "info" });
  }

  return {
    summary: latest?.detail ?? latest?.title ?? t("task.pending"),
    latest,
    metrics,
    recentSteps,
    hiddenNoiseCount,
    eventCount
  };
}

export function deriveLatestModelStream(events: AgentEvent[], locale?: SidepanelLocale): ModelStreamState | undefined {
  const maxVisibleChars = 12_000;
  let latestIndex = -1;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (isModelEvent(events[index].type)) {
      latestIndex = index;
      break;
    }
  }
  if (latestIndex === -1) return undefined;

  const latest = events[latestIndex];
  const role = modelString(latest.payload, "role");
  const model = modelString(latest.payload, "model");
  const relevant = events.filter((event, index) => {
    if (index > latestIndex || event.stepId !== latest.stepId || !isModelEvent(event.type)) return false;
    const eventRole = modelString(event.payload, "role");
    return !role || !eventRole || eventRole === role;
  });

  const legacyChunks: string[] = [];
  const reasoningChunks: string[] = [];
  const contentChunks: string[] = [];
  const toolArgumentsChunks: string[] = [];
  let chunkCount = 0;
  let receivedChars: number | undefined;
  let accumulatedText: string | undefined;
  let outputPreview: string | undefined;
  let toolNames: string[] = [];
  let lastTitle = eventTitle(latest.type, locale);
  let latestKinds: string[] = [];

  for (const event of relevant) {
    lastTitle = eventTitle(event.type, locale);
    if (event.type === "ModelCallProgress") {
      const chunk = modelRawString(event.payload, "chunk");
      const reasoningChunk = modelRawString(event.payload, "reasoningChunk");
      const contentChunk = modelRawString(event.payload, "contentChunk");
      const toolArgumentsChunk = modelRawString(event.payload, "toolArgumentsChunk");
      const hasSeparatedChunks = ["reasoningChunk", "contentChunk", "toolArgumentsChunk"].some((key) => key in event.payload);
      if (!hasSeparatedChunks && chunk) legacyChunks.push(chunk);
      if (reasoningChunk) reasoningChunks.push(reasoningChunk);
      if (contentChunk) contentChunks.push(contentChunk);
      if (toolArgumentsChunk) toolArgumentsChunks.push(toolArgumentsChunk);
      if (Array.isArray(event.payload.streamKinds)) {
        latestKinds = event.payload.streamKinds.filter((kind): kind is string => typeof kind === "string");
      }
      const accumulated = modelRawString(event.payload, "accumulatedText");
      if (accumulated) accumulatedText = accumulated;
      if (typeof event.payload.chunkIndex === "number") chunkCount = Math.max(chunkCount, event.payload.chunkIndex);
      else chunkCount += 1;
      if (typeof event.payload.receivedChars === "number") receivedChars = event.payload.receivedChars;
      if (Array.isArray(event.payload.toolCallNames)) {
        toolNames = event.payload.toolCallNames.filter((name): name is string => typeof name === "string" && Boolean(name.trim()));
      }
    }
    if (event.type === "ModelCallCompleted") {
      outputPreview = modelString(event.payload, "outputPreview");
      if (typeof event.payload.outputChars === "number") receivedChars = Math.max(receivedChars ?? 0, event.payload.outputChars);
      if (Array.isArray(event.payload.nativeToolCalls)) {
        toolNames = event.payload.nativeToolCalls.filter((name): name is string => typeof name === "string" && Boolean(name.trim()));
      }
    }
  }

  const reasoningFullText = reasoningChunks.join("");
  const contentFullText = contentChunks.join("");
  const toolArgumentsFullText = toolArgumentsChunks.join("");
  const legacyText = accumulatedText ?? legacyChunks.join("");
  const answerFullText = contentFullText || outputPreview || legacyText;
  const truncate = (value: string): string => value.length > maxVisibleChars ? value.slice(-maxVisibleChars) : value;
  const reasoningText = truncate(reasoningFullText);
  const contentText = truncate(answerFullText);
  const toolArgumentsText = truncate(toolArgumentsFullText);
  const text = contentText || reasoningText || toolArgumentsText;
  const truncated = [reasoningFullText, answerFullText, toolArgumentsFullText].some((value) => value.length > maxVisibleChars);
  const isStreaming = latest.type === "ModelCallStarted" || latest.type === "ModelCallProgress";
  const phase: ModelStreamState["phase"] = !isStreaming
    ? "complete"
    : latestKinds.includes("content") || contentFullText
      ? "answering"
      : latestKinds.includes("tool_arguments") || toolArgumentsFullText
        ? "tool"
        : latestKinds.includes("reasoning") || reasoningFullText
          ? "reasoning"
          : "waiting";
  return {
    title: lastTitle,
    text,
    reasoningText: reasoningText || undefined,
    contentText: contentText || undefined,
    toolArgumentsText: toolArgumentsText || undefined,
    phase,
    isStreaming,
    role,
    model,
    chunkCount: chunkCount || undefined,
    receivedChars,
    toolNames: toolNames.length > 0 ? [...new Set(toolNames)] : undefined,
    truncated
  };
}

function terminalStatusForEvent(event: AgentEvent): string | undefined {
  const type = event.type;
  if (type === "TaskCompleted") return "completed";
  if (type === "TaskFailed") return "failed";
  if (type === "TaskStopped") return "stopped";
  if (type === "RuntimeSuspended") return "paused";
  if (type === "UserConsentRequested") return "awaiting_confirmation";
  if (type === "CommandResultReceived" && commandResultStatus(event.payload) === "failed") return "failed";
  if (type === "VerificationProduced" && eventPayloadStatus(event.payload) === "failed") return "failed";
  return undefined;
}

function progressStatusForEvent(event: AgentEvent): string | undefined {
  switch (event.type) {
    case "TaskStarted":
    case "TaskInterpreted":
      return "interpreting";
    case "ObservationRequested":
    case "ObservationReceived":
    case "ScreenshotCaptured":
    case "VisionRequested":
    case "VisionCompleted":
    case "VisualEvidenceAdded":
      return "observing";
    case "CommandBound":
    case "CommandIssued":
    case "CommandResultReceived":
    case "ToolCallStarted":
    case "ToolCallCompleted":
    case "ToolCallFailed":
      return "executing";
    case "VerificationProduced":
    case "MemoryUpdated":
      return "verifying";
    default:
      return undefined;
  }
}

function latestProgressEvent(events: AgentEvent[]): AgentEvent | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (progressStatusForEvent(event)) return event;
  }
  return undefined;
}

export function deriveActiveTaskFromEvents(events: AgentEvent[], locale?: SidepanelLocale): ActiveTaskState | undefined {
  const latest = events.at(-1);
  if (!latest) return undefined;
  const terminalStatus = terminalStatusForEvent(latest);
  const progressEvent = terminalStatus ? latest : latestProgressEvent(events) ?? latest;
  const status = terminalStatus ?? progressStatusForEvent(progressEvent) ?? "running";

  return {
    taskId: latest.taskId,
    status,
    activeNodeId: flowNodeForEventType(terminalStatus ? latest.type : progressEvent.type),
    currentAction:
      stringPayload(progressEvent.payload, ["currentAction", "taskText", "command", "commandName", "summary", "instruction", "message", "reason"], locale) ??
      eventTitle(progressEvent.type, locale),
    targetLabel: stringPayload(progressEvent.payload, ["targetLabel", "label", "semanticLabel", "elementLabel"], locale),
    expectedOutcome: stringPayload(progressEvent.payload, ["expectedOutcome", "successCriteria", "outcome"], locale),
    semanticTargetId: stringPayload(progressEvent.payload, ["semanticTargetId", "targetId", "targetRef", "id"], locale),
    bindingSource: progressEvent.type.startsWith("Vision") || progressEvent.type === "VisualEvidenceAdded" ? "Vision" : undefined,
    riskLevel: latest.type === "UserConsentRequested" ? "medium" : latest.type === "TaskFailed" ? "blocked" : undefined
  };
}

export function mergeRuntimeEventForSession(currentEvents: AgentEvent[], event: AgentEvent): AgentEvent[] {
  const sameSession = currentEvents.every((item) => item.sessionId === event.sessionId && item.taskId === event.taskId);
  const base = sameSession ? currentEvents : [];
  return [...base.filter((item) => item.id !== event.id), event];
}

export function isTaskInProgress(status?: string): boolean {
  return Boolean(status && !["completed", "failed", "stopped"].includes(status));
}

export function shouldClearConversationForRemovedSessions(state: SidepanelState, removedSessionIds: string[]): boolean {
  const projectionSessionIds = currentProjectionSessionIds(state);
  return Boolean(
    projectionSessionIds.some((sessionId) => removedSessionIds.includes(sessionId)) &&
      !isTaskInProgress(state.activeTask?.status)
  );
}

export function shouldRefreshSessionOnChatReturn(state: SidepanelState): boolean {
  return Boolean(state.activeSessionId || isTaskInProgress(state.activeTask?.status));
}

export function shouldRefreshSessionOnPanelVisible(state: SidepanelState): boolean {
  return Boolean(state.activeSessionId || isTaskInProgress(state.activeTask?.status));
}

export function currentProjectionSessionIds(state: SidepanelState): string[] {
  const ids = new Set<string>();
  if (state.activeSessionId) ids.add(state.activeSessionId);
  for (const event of state.lastSessionEvents ?? []) {
    if (event.sessionId) ids.add(event.sessionId);
  }
  return Array.from(ids);
}

export function mergeSuppressedSessionIds(current: string[] | undefined, incoming: string[]): string[] {
  return Array.from(new Set([...(current ?? []), ...incoming.filter(Boolean)])).slice(-30);
}

export function shouldSuppressIncomingSession(state: SidepanelState, sessionId?: string): boolean {
  return Boolean(sessionId && state.suppressedSessionIds?.includes(sessionId));
}
