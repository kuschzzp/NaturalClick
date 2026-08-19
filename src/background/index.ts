import type { AgentEvent, EventVisibility } from "../core/events/events";
import { ChromeScheduleStore } from "../adapters/chrome/chrome-schedule-store";
import { ChromeSkillStore } from "../adapters/chrome/chrome-skill-store";
import { ChromeArtifactStore } from "../adapters/chrome/chrome-artifact-store";
import { ChromeStorageEventStore } from "../adapters/chrome/chrome-storage-event-store";
import { ChromeSessionMemory } from "../adapters/chrome/chrome-session-memory";
import { createChromeModelConfigStore } from "../adapters/chrome/model-config-store";
import { runtimeEventBus } from "../adapters/chrome/runtime-event-bus";
import { ModelProtocolHttpError, requestPlannerProtocolTurn, type PlannerModelMessage } from "../adapters/model/planner-model-client";
import { captureTabScreenshot, getActiveTab, getTab, selectNewTaskChildTab, sendActiveTabMessage, sendTabMessageTo } from "../adapters/chrome/tabs";
import { defaultCapabilitySettings, resolveCapabilitySettings, type CapabilitySettingsState } from "../core/capabilities/settings";
import { defaultCapabilityToolGroups, toolGroupsForCapabilitySettings, toolRuntimeCapabilitiesForSettings } from "../core/capabilities/registry";
import { sanitizeFileAttachmentContexts, stripGeneratedArtifactContent, type FileAttachmentContext } from "../core/capabilities/file-artifacts";
import type { SerializableRecord } from "../core/architecture/serialization";
import type { BoundCommand, BrowserPrimitive, PrimitiveResult, SemanticCommand } from "../core/commands/commands";
import { assemblePlannerPageContext } from "../core/context/page-context-assembler";
import { deriveSessionExecutionHealth, shouldSuspendRecoveredSession } from "../core/events/runtime-health";
import type { GlobalModelConfig } from "../core/model/config";
import { createModelConfigService } from "../core/model/model-config-service";
import { parseLooseJson, type OpenAICompatibleToolCall } from "../core/model/openai-compatible";
import { validatePlannerTurn, type NeedMoreObservationRequest, type PlannerDecision, type PlannerTurn } from "../core/model/contracts";
import { expandedPlannerOutputBudget, plannerOutputBudget, protocolCandidates, type ModelStreamProgress, type ModelTurnResult, type ResolvedModelApiProtocol } from "../core/model/model-protocol";
import { plannerResponseJsonSchema } from "../core/model/planner-schema";
import { PlannerTimeoutError, plannerTimeoutPolicy, remainingPlannerBudget, withPlannerRequestTimeout, type PlannerTimeoutPolicy } from "../core/model/planner-timeout";
import type { PageModel } from "../core/observation/page-model";
import type { ConsentScope } from "../core/policy/consent";
import type { SafetyMode } from "../core/policy/policy";
import { AgentRuntime, type ActionMemoryItem, type ConversationHistoryItem, type ObservePageRuntimeOptions, type PlannerInput, type PlannerPortMetrics, type PlannerPortResult } from "../core/runtime/agent-runtime";
import { ExecutionController } from "../core/runtime/execution-controller";
import type { ObservationBudget } from "../core/runtime/execution-budget";
import { restoreExecutionCounters } from "../core/runtime/execution-recovery";
import {
  DEFAULT_MAX_PLANNER_NATIVE_TOOL_ROUNDS,
  executePlannerNativeToolCallsWithCache,
  parsePlannerNativeToolArguments,
  plannerNativeToolBudgetInstruction,
  plannerNativeToolResultContent,
  selectPlannerNativeTools,
  shouldRetryPlannerRequestWithoutTools
} from "../core/runtime/planner-native-tools";
import type { ToolDefinition, ToolGroup, ToolResult, ToolRuntimeCapabilities } from "../core/tools/tool";
import { executeRegisteredTool, type CustomSearchRequest, type LoadToolGroupsResult, type ToolObserveOptions } from "../core/tools/tool-executor";
import { createDefaultToolRegistry } from "../core/tools/tool-registry";
import { verifyOutcome, type VerificationResult } from "../core/verification/verifier";
import { createEventId, createSessionId, createStepId, createTaskId } from "../shared/ids";
import { overlayTargetsFromPage } from "../shared/overlay-targets";
import type {
  ModelConfigProtocolState,
  NaturalClickRequest,
  NaturalClickResponse,
  OverlayMode,
  RuntimeModelSettings,
  SessionStateResponse,
  ToolDefinitionsProtocolState
} from "../shared/protocol";

const eventStore = new ChromeStorageEventStore();
const sessionMemory = new ChromeSessionMemory();
const scheduleStore = new ChromeScheduleStore();
const skillStore = new ChromeSkillStore();
const artifactStore = new ChromeArtifactStore();
const modelConfigService = createModelConfigService(createChromeModelConfigStore());
const toolRegistry = createDefaultToolRegistry();
const resolvedPlannerProtocols = new Map<string, ResolvedModelApiProtocol>();
interface ActiveSessionRef {
  sessionId: string;
  taskId: string;
  targetTabId?: number;
  targetWindowId?: number;
  targetTabUrl?: string;
  targetTabTitle?: string;
}

let activeSession: ActiveSessionRef | undefined;
let activeController: ExecutionController | undefined;
let activeOverlayMode: OverlayMode = "Off";
let activeCapabilitySettings: CapabilitySettingsState = defaultCapabilitySettings();
let activeToolGroups: Set<ToolGroup> = defaultCapabilityToolGroups();
let activeTaskAttachments: FileAttachmentContext[] = [];
let activeConsentScope: ConsentScope | undefined;
let lastObservedPage: PageModel | undefined;
let currentOverlayTargetId: string | undefined;
let activeRunAbortController: AbortController | undefined;
const detachedSessionIds = new Set<string>();
const stoppedSessionIds = new Set<string>();
const ACTIVE_SESSION_STORAGE_KEY = "naturalclick.runtime.activeSession.v1";
const OVERLAY_OBSERVATION_LIMIT = 600;

function okResponse<T>(data: T): NaturalClickResponse<T> {
  return { ok: true, data };
}

function errorResponse(error: string): NaturalClickResponse<never> {
  return { ok: false, error };
}

function makeStepEvent(
  stepId: string,
  type: AgentEvent["type"],
  payload: Record<string, unknown> = {},
  visibility: EventVisibility = "debug"
): AgentEvent {
  activeSession ??= { sessionId: createSessionId(), taskId: createTaskId() };
  return {
    id: createEventId(),
    sessionId: activeSession.sessionId,
    taskId: activeSession.taskId,
    stepId,
    type,
    timestamp: Date.now(),
    payload,
    visibility,
    correlationId: stepId
  };
}

function makeEvent(
  type: AgentEvent["type"],
  payload: Record<string, unknown> = {},
  visibility: EventVisibility = "debug"
): AgentEvent {
  return makeStepEvent(createStepId(), type, payload, visibility);
}

async function appendEvent(event: AgentEvent): Promise<void> {
  if (stoppedSessionIds.has(event.sessionId) && event.type !== "TaskStopped") return;
  await eventStore.append(event);
  if (!detachedSessionIds.has(event.sessionId)) {
    activeSession = activeSession?.sessionId === event.sessionId && activeSession.taskId === event.taskId
      ? { ...activeSession, sessionId: event.sessionId, taskId: event.taskId }
      : { sessionId: event.sessionId, taskId: event.taskId };
    void persistActiveSession(activeSession).catch(() => undefined);
    runtimeEventBus.broadcast(event);
    void syncOverlayForEvent(event).catch(() => undefined);
  }
}

function isSessionRef(value: unknown): value is ActiveSessionRef {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.sessionId === "string" &&
    Boolean(record.sessionId) &&
    typeof record.taskId === "string" &&
    Boolean(record.taskId) &&
    (record.targetTabId === undefined || typeof record.targetTabId === "number") &&
    (record.targetWindowId === undefined || typeof record.targetWindowId === "number")
  );
}

async function persistActiveSession(session: ActiveSessionRef): Promise<void> {
  await chrome.storage.local.set({ [ACTIVE_SESSION_STORAGE_KEY]: session });
}

function tabTarget(tab: chrome.tabs.Tab): Pick<ActiveSessionRef, "targetTabId" | "targetWindowId" | "targetTabUrl" | "targetTabTitle"> | undefined {
  if (tab.id === undefined) return undefined;
  return {
    targetTabId: tab.id,
    targetWindowId: tab.windowId,
    targetTabUrl: tab.url,
    targetTabTitle: tab.title
  };
}

async function bindActiveTaskToTab(tab: chrome.tabs.Tab): Promise<boolean> {
  const target = tabTarget(tab);
  if (!activeSession || !target) return false;
  activeSession = { ...activeSession, ...target };
  await persistActiveSession(activeSession);
  return true;
}

async function resolveTaskTab(rebindMissing = false): Promise<chrome.tabs.Tab | undefined> {
  const targetTabId = activeSession?.targetTabId;
  if (targetTabId !== undefined) {
    const target = await getTab(targetTabId);
    if (target) return target;
  }
  if (!rebindMissing) return undefined;
  const activeTab = await getActiveTab();
  if (!activeTab || !(await bindActiveTaskToTab(activeTab))) return undefined;
  return activeTab;
}

async function sendTaskTabMessage<TResponse = unknown>(message: NaturalClickRequest): Promise<NaturalClickResponse<TResponse>> {
  const targetTabId = activeSession?.targetTabId;
  if (targetTabId === undefined) return sendActiveTabMessage<TResponse>(message);
  const response = await sendTabMessageTo<TResponse>(targetTabId, message);
  if (!response.ok && response.error === "task_tab_not_found") {
    await suspendTaskForClosedTab(targetTabId);
  }
  return response;
}

async function clearPersistedActiveSession(): Promise<void> {
  await chrome.storage.local.remove(ACTIVE_SESSION_STORAGE_KEY);
}

async function restoreActiveSession(): Promise<typeof activeSession> {
  if (activeSession) return activeSession;
  const stored = await chrome.storage.local.get(ACTIVE_SESSION_STORAGE_KEY);
  const candidate = stored[ACTIVE_SESSION_STORAGE_KEY];
  if (isSessionRef(candidate) && !detachedSessionIds.has(candidate.sessionId)) {
    activeSession = candidate;
  }
  return activeSession;
}

async function detachActiveSession(reason = "new_session_requested"): Promise<void> {
  const current = activeSession ?? (await restoreActiveSession());
  if (current?.sessionId) detachedSessionIds.add(current.sessionId);
  activeRunAbortController?.abort();
  activeController?.stop(reason);
  activeController = undefined;
  activeRunAbortController = undefined;
  activeSession = undefined;
  activeConsentScope = undefined;
  activeToolGroups = defaultCapabilityToolGroups();
  activeTaskAttachments = [];
  lastObservedPage = undefined;
  currentOverlayTargetId = undefined;
  await clearPersistedActiveSession();
}

async function appendBackgroundEvent(
  type: AgentEvent["type"],
  payload: Record<string, unknown> = {},
  visibility: EventVisibility = "debug"
): Promise<void> {
  await appendEvent(makeEvent(type, payload, visibility));
}

async function appendBackgroundStepEvent(
  stepId: string,
  type: AgentEvent["type"],
  payload: Record<string, unknown> = {},
  visibility: EventVisibility = "debug"
): Promise<void> {
  await appendEvent(makeStepEvent(stepId, type, payload, visibility));
}

async function sessionState(
  sessionId = activeSession?.sessionId,
  taskId = activeSession?.taskId
): Promise<SessionStateResponse> {
  if (!sessionId || !taskId) {
    const restored = await restoreActiveSession();
    sessionId = restored?.sessionId;
    taskId = restored?.taskId;
  }
  if (!sessionId || !taskId) return { events: [], turns: [] };
  let events = await eventStore.loadAfter(sessionId, taskId);
  if (activeController === undefined && activeSession?.sessionId === sessionId && activeSession.taskId === taskId && shouldSuspendRecoveredSession(events)) {
    const latest = events.at(-1);
    const recoveryEvent = makeStepEvent(
      latest?.stepId ?? createStepId(),
      "RuntimeSuspended",
      {
        reason: "background_recovered_without_controller",
        lastEventType: latest?.type,
        message: "The Chrome extension background restarted before the previous execution controller could finish."
      },
      "user"
    );
    await appendEvent(recoveryEvent);
    events = [...events, recoveryEvent];
  }
  const turns = await eventStore.loadSession(sessionId);
  return {
    sessionId,
    taskId,
    events,
    turns: turns.map((turn) => (turn.taskId === taskId ? { ...turn, events } : turn))
  };
}

async function modelConfigState(): Promise<ModelConfigProtocolState> {
  const [instances, activeSelection, roleSelections, roleRuntimeConfigs, activeRuntimeConfig, globalModelConfig] = await Promise.all([
    modelConfigService.listInstances(),
    modelConfigService.getActiveSelection(),
    modelConfigService.getRoleSelections(),
    modelConfigService.resolveRoleRuntimeConfigs(),
    modelConfigService.resolveActiveRuntimeConfig(),
    modelConfigService.resolveGlobalModelConfig()
  ]);
  return { instances, activeSelection, roleSelections, roleRuntimeConfigs, activeRuntimeConfig, globalModelConfig };
}

function registeredToolGroups(): Set<ToolGroup> {
  return new Set(toolRegistry.listTools().map((tool) => tool.group));
}

function availableToolGroupsFor(settings: CapabilitySettingsState): Set<ToolGroup> {
  const registered = registeredToolGroups();
  const groups = new Set([...toolGroupsForCapabilitySettings(settings)].filter((group) => group === "core" || registered.has(group)));
  if (registered.has("scratchpad")) groups.add("scratchpad");
  if (registered.has("files")) groups.add("files");
  if (registered.has("schedule")) groups.add("schedule");
  return groups;
}

function loadableToolGroupsFor(settings: CapabilitySettingsState): ToolGroup[] {
  return [...availableToolGroupsFor(settings)].filter((group) => group !== "core");
}

function activeToolGroupsFor(settings: CapabilitySettingsState): Set<ToolGroup> {
  const available = availableToolGroupsFor(settings);
  const active = new Set([...activeToolGroups].filter((group) => available.has(group)));
  active.add("core");
  return active;
}

function reconcileActiveToolGroups(settings: CapabilitySettingsState): void {
  activeToolGroups = activeToolGroupsFor(settings);
}

function loadToolGroups(groups: ToolGroup[]): LoadToolGroupsResult {
  const available = availableToolGroupsFor(activeCapabilitySettings);
  const loaded: ToolGroup[] = [];
  const alreadyActive: ToolGroup[] = [];
  const unavailable: ToolGroup[] = [];

  for (const group of groups) {
    if (group === "core" || !available.has(group)) {
      unavailable.push(group);
      continue;
    }
    if (activeToolGroups.has(group)) {
      alreadyActive.push(group);
      continue;
    }
    activeToolGroups.add(group);
    loaded.push(group);
  }

  reconcileActiveToolGroups(activeCapabilitySettings);
  return {
    loaded,
    alreadyActive,
    unavailable,
    unknown: [],
    activeGroups: [...activeToolGroups]
  };
}

async function toolDefinitionsState(groups?: ToolGroup[], settings?: CapabilitySettingsState): Promise<ToolDefinitionsProtocolState> {
  const resolvedSettings = resolveCapabilitySettings(settings ?? activeCapabilitySettings);
  const activeRuntimeConfig = await modelConfigService.resolveActiveRuntimeConfig().catch(() => undefined);
  const capabilities: ToolRuntimeCapabilities = toolRuntimeCapabilitiesForSettings(resolvedSettings, {
    tools: activeRuntimeConfig?.tools ?? true,
    vision: activeRuntimeConfig?.vision ?? false
  });
  const availableGroups = availableToolGroupsFor(resolvedSettings);
  const selectedGroups = groups?.length ? new Set(groups.filter((group) => availableGroups.has(group))) : activeToolGroupsFor(resolvedSettings);
  return {
    tools: toolRegistry.selectTools(selectedGroups, capabilities),
    activeGroups: [...selectedGroups],
    availableGroups: [...availableGroups],
    loadableGroups: loadableToolGroupsFor(resolvedSettings)
  };
}

async function executeToolWithEvents(
  tool: NonNullable<ReturnType<typeof toolRegistry.getTool>>,
  args: SerializableRecord,
  callId?: string
): Promise<ToolResult> {
  const stepId = typeof callId === "string" && callId.trim() ? callId.trim() : createStepId();
  const startedAt = Date.now();
  await appendBackgroundStepEvent(stepId, "ToolCallStarted", toolEventPayload(tool, args));

  if (activeRunAbortController?.signal.aborted) {
    const result: ToolResult = {
      success: false,
      observation: "Tool execution aborted before start.",
      error: "task_stopped"
    };
    await appendToolFinishedEvent(stepId, tool, args, result, startedAt);
    return result;
  }

  try {
    const result = await executeRegisteredTool(tool, args, {
      observePage: observeActivePageForTool,
      executePrimitive,
      getLastPage: () => lastObservedPage,
      getCapabilitySettings: () => activeCapabilitySettings,
      customSearch,
      loadToolGroups,
      getAttachments: () => activeTaskAttachments,
      skills: {
        listSkills: () => skillStore.listSkills(),
        loadSkill: (skillId) => skillStore.loadSkill(skillId),
        saveRecordedWorkflow: (draft) => skillStore.saveRecordedWorkflow(draft)
      },
      scratchpad: {
        saveRecord: async (record) => {
          const session = activeSession ?? (await restoreActiveSession());
          if (!session?.sessionId) throw new Error("active_session_missing");
          return sessionMemory.saveScratchpadRecord(session.sessionId, record);
        },
        listRecords: async (query) => {
          const session = activeSession ?? (await restoreActiveSession());
          if (!session?.sessionId) return [];
          return sessionMemory.listScratchpadRecords(session.sessionId, query);
        }
      },
      schedules: {
        saveSchedule: (record) => scheduleStore.saveSchedule(record),
        listSchedules: (query) => scheduleStore.listSchedules(query)
      },
      artifacts: {
        saveArtifact: async (artifact) => {
          const session = activeSession ?? (await restoreActiveSession());
          if (!session?.sessionId) throw new Error("active_session_missing");
          return artifactStore.saveArtifact(session.sessionId, artifact);
        },
        listArtifacts: async (query) => {
          const session = activeSession ?? (await restoreActiveSession());
          if (!session?.sessionId) return [];
          return artifactStore.listArtifacts(session.sessionId, query);
        },
        loadArtifact: async (artifactId) => {
          const session = activeSession ?? (await restoreActiveSession());
          if (!session?.sessionId) return undefined;
          return artifactStore.loadArtifact(session.sessionId, artifactId);
        }
      }
    });
    await appendToolFinishedEvent(stepId, tool, args, result, startedAt);
    if (tool.name === "save_scratchpad" && result.success) {
      await appendBackgroundStepEvent(
        stepId,
        "MemoryUpdated",
        {
          kind: "scratchpad",
          recordId: typeof result.data?.recordId === "string" ? result.data.recordId : undefined,
          collection: typeof result.data?.collection === "string" ? result.data.collection : undefined,
          fieldKeys: Array.isArray(result.data?.fieldKeys) ? result.data.fieldKeys : []
        },
        "debug"
      );
    }
    return result;
  } catch (error) {
    const result: ToolResult = {
      success: false,
      observation: `Tool ${tool.name} failed: ${error instanceof Error ? error.message : String(error)}`,
      error: error instanceof Error ? error.message : "tool_execution_failed"
    };
    await appendToolFinishedEvent(stepId, tool, args, result, startedAt);
    return result;
  }
}

function toolEventPayload(
  tool: NonNullable<ReturnType<typeof toolRegistry.getTool>>,
  args: SerializableRecord,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    toolName: tool.name,
    group: tool.group,
    risk: tool.risk,
    argsKeys: Object.keys(args).sort(),
    ...extra
  };
}

async function appendToolFinishedEvent(
  stepId: string,
  tool: NonNullable<ReturnType<typeof toolRegistry.getTool>>,
  args: SerializableRecord,
  result: ToolResult,
  startedAt: number
): Promise<void> {
  await appendBackgroundStepEvent(
    stepId,
    result.success ? "ToolCallCompleted" : "ToolCallFailed",
    toolEventPayload(tool, args, {
      success: result.success,
      error: result.error,
      durationMs: Math.max(0, Date.now() - startedAt),
      observationPreview: result.observation.slice(0, 1000)
    }),
    result.success ? "debug" : "user"
  );
}

async function customSearch(request: CustomSearchRequest): Promise<ToolResult> {
  try {
    const response = await fetch(request.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(request.apiKey ? { Authorization: `Bearer ${request.apiKey}` } : {})
      },
      body: JSON.stringify({ query: request.query, maxResults: request.maxResults, max_results: request.maxResults })
    });
    const text = await response.text();
    if (!response.ok) {
      return {
        success: false,
        observation: `Custom search endpoint returned HTTP ${response.status}.`,
        error: `search_http_${response.status}`,
        data: { bodyPreview: text.slice(0, 1000) }
      };
    }

    const parsed = parseJsonRecord(text);
    if (!parsed) {
      return {
        success: true,
        observation: text.slice(0, 4000) || "Custom search endpoint returned an empty response.",
        data: { format: "text" }
      };
    }

    const rows = normalizeSearchRows(parsed).slice(0, request.maxResults);
    if (!rows.length) {
      return {
        success: true,
        observation: JSON.stringify(parsed).slice(0, 4000),
        data: { format: "json" }
      };
    }

    return {
      success: true,
      observation: [
        `${rows.length} custom search result(s) for "${request.query}":`,
        ...rows.map((row, index) => `${index + 1}. ${row.title}\n   ${row.url}\n   ${row.snippet}`)
      ].join("\n"),
      data: { results: rows }
    };
  } catch (error) {
    return {
      success: false,
      observation: `Custom search failed: ${error instanceof Error ? error.message : String(error)}`,
      error: "search_request_failed"
    };
  }
}

function parseJsonRecord(text: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (Array.isArray(parsed)) return { results: parsed };
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function normalizeSearchRows(value: Record<string, unknown>): Array<{ title: string; url: string; snippet: string }> {
  const candidates = Array.isArray(value.results) ? value.results : Array.isArray(value.data) ? value.data : Array.isArray(value.items) ? value.items : [];
  return candidates.flatMap((item): Array<{ title: string; url: string; snippet: string }> => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const title = firstString(row.title, row.name, row.heading, row.url);
    const url = firstString(row.url, row.link, row.href, row.source);
    const snippet = firstString(row.snippet, row.content, row.summary, row.description, row.text);
    if (!title && !url && !snippet) return [];
    return [{ title: title || url || "Untitled result", url, snippet }];
  });
}

function firstString(...values: unknown[]): string {
  return values.find((value): value is string => typeof value === "string" && Boolean(value.trim()))?.trim() ?? "";
}

function fallbackPageModel(tab: chrome.tabs.Tab | undefined, reason: string): PageModel {
  const rawUrl = tab?.url ?? "";
  let origin = "";
  let path = "";
  try {
    const url = new URL(rawUrl);
    origin = url.origin;
    path = `${url.pathname}${url.search}${url.hash}`;
  } catch {
    origin = rawUrl.split(":")[0] ? `${rawUrl.split(":")[0]}:` : "";
    path = rawUrl;
  }

  return {
    pageIdentity: {
      url: rawUrl,
      title: tab?.title ?? "Unavailable page",
      origin,
      path
    },
    viewport: { width: 0, height: 0, scrollX: 0, scrollY: 0, deviceScaleFactor: 1 },
    feedback: [`Observation unavailable: ${reason}`],
    readableContent: [],
    textBlocks: [],
    forms: [],
    riskSignals: [],
    capturedAt: Date.now(),
    controls: []
  };
}

async function observeActivePage(
  observationRequest?: NeedMoreObservationRequest,
  options?: Partial<ObservePageRuntimeOptions> & Pick<ToolObserveOptions, "mode">,
  syncOverlay = true
): Promise<PageModel> {
  const response = await sendTaskTabMessage<PageModel>({
    type: "OBSERVE_PAGE",
    observationRequest,
    observationRound: options?.observationRound,
    candidateLimit: options?.candidateLimit,
    mode: options?.mode
  });
  if (response.ok) {
    lastObservedPage = response.data;
    if (syncOverlay) {
      void syncOverlayForPage(response.data).catch(() => undefined);
    }
    return response.data;
  }
  return fallbackPageModel(await resolveTaskTab(false), response.error);
}

async function observeActivePageForTool(options?: ToolObserveOptions): Promise<PageModel> {
  return observeActivePage(
    options?.observationRequest,
    {
      ...(options?.observationRound === undefined ? {} : { observationRound: options.observationRound }),
      ...(options?.candidateLimit === undefined ? {} : { candidateLimit: options.candidateLimit }),
      ...(options?.mode === undefined ? {} : { mode: options.mode })
    },
    true
  );
}

async function syncOverlayForPage(page: PageModel): Promise<void> {
  if (activeOverlayMode === "Off") return;
  await sendTaskTabMessage({
    type: "SET_OVERLAY_MODE",
    mode: activeOverlayMode,
    targets: overlayTargetsFromPage(page, { currentTargetId: currentOverlayTargetId })
  });
}

async function syncOverlayForEvent(event: AgentEvent): Promise<void> {
  if (event.type !== "CommandBound" || !lastObservedPage) return;
  const targetRef = event.payload.targetRef;
  currentOverlayTargetId = typeof targetRef === "string" ? targetRef : undefined;
  await syncOverlayForPage(lastObservedPage);
}

function modelConfig(settings: RuntimeModelSettings, overrides: { supportsToolUse?: boolean; maxOutputTokens?: number } = {}): GlobalModelConfig {
  return {
    provider: {
      baseUrl: settings.providerBaseUrl,
      apiKeyRef: "sidepanel-runtime",
      compatibilityMode: "openai_compatible",
      defaultHeaders: {}
    },
    roleModels: {
      plannerModel: settings.plannerModel,
      visionModel: settings.visionModel
    },
    capabilities: {
      supportsStreaming: true,
      supportsJsonMode: false,
      supportsToolUse: overrides.supportsToolUse ?? false,
      supportsVisionInput: Boolean(settings.visionModel),
      supportsReasoningSummary: true,
      maxContextTokens: 32000,
      maxOutputTokens: overrides.maxOutputTokens ?? 12000
    },
    runtime: {
      planner: { requestTimeoutMs: 120000, firstTokenTimeoutMs: 30000, maxRetries: 0 },
      vision: { requestTimeoutMs: 60000, firstTokenTimeoutMs: 30000, maxRetries: 0 },
      verifier: { requestTimeoutMs: 60000, firstTokenTimeoutMs: 30000, maxRetries: 0 },
      summarizer: { requestTimeoutMs: 60000, firstTokenTimeoutMs: 30000, maxRetries: 0 }
    },
    contextBudget: {
      plannerMaxInputTokens: 24000,
      visionMaxInputTokens: 12000,
      verifierMaxInputTokens: 12000,
      summarizerMaxInputTokens: 12000,
      reservedOutputTokens: overrides.maxOutputTokens ?? 12000,
      evidenceLimit: 20,
      recentEventLimit: 20,
      observationCandidateLimit: 80,
      rawExcerptLimit: 12000,
      compressionStrategy: "evidence_first"
    },
    logging: { level: "summary", storeRawModelRequests: false, storeRawModelResponses: false, storeScreenshotImages: false },
    privacy: { redactSensitiveValues: true, sendScreenshotsToRemoteVision: Boolean(settings.visionModel) }
  };
}

function candidateLimitForPlanner(input: PlannerInput): number {
  if ((input.observationRound ?? 1) <= 1) return 120;
  if (input.observationRound === 2) return 320;
  return 600;
}

function plannerPageContext(input: PlannerInput): ReturnType<typeof assemblePlannerPageContext> {
  return assemblePlannerPageContext(input.page, {
    candidateLimit: candidateLimitForPlanner(input),
    taskText: input.taskFrame.taskText,
    request: input.observationRequests?.at(-1)
  });
}

function userLanguageForTask(taskText: string): "zh-CN" | "en" {
  return /[\u3400-\u9fff]/.test(taskText) ? "zh-CN" : "en";
}

function abortErrorReason(error: unknown, runtimeSignal?: AbortSignal): string {
  if (runtimeSignal?.aborted) return "task_stopped";
  if (error instanceof DOMException && error.name === "AbortError") return "planner_request_aborted";
  if (error instanceof Error) return error.message;
  return String(error);
}

type PlannerChatMessage = PlannerModelMessage;

type PlannerErrorWithMetrics = Error & { plannerMetrics?: PlannerPortMetrics };

function normalizedEndpointBase(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function runtimeMatchesPlannerSettings(runtime: Awaited<ReturnType<typeof modelConfigService.resolveActiveRuntimeConfig>>, settings: RuntimeModelSettings): boolean {
  if (!runtime) return false;
  return normalizedEndpointBase(runtime.baseUrl) === normalizedEndpointBase(settings.providerBaseUrl) && runtime.model === settings.plannerModel;
}

function plannerSupportsNativeTools(
  settings: RuntimeModelSettings,
  runtime: Awaited<ReturnType<typeof modelConfigService.resolveActiveRuntimeConfig>>
): boolean {
  if (runtimeMatchesPlannerSettings(runtime, settings)) return runtime?.tools === true;
  return true;
}

function plannerNativeTools(settings: CapabilitySettingsState, capabilities: ToolRuntimeCapabilities): ToolDefinition[] {
  return selectPlannerNativeTools(toolRegistry.selectTools(activeToolGroupsFor(settings), capabilities));
}

function plannerErrorWithMetrics(error: unknown, metrics: PlannerPortMetrics): PlannerErrorWithMetrics {
  const enriched = (error instanceof Error ? error : new Error(String(error || "planner_failed"))) as PlannerErrorWithMetrics;
  enriched.plannerMetrics = metrics;
  return enriched;
}

function assistantToolCallMessage(calls: OpenAICompatibleToolCall[]): PlannerChatMessage {
  return {
    role: "assistant",
    content: null,
    tool_calls: calls.map((call) => ({
      id: call.id,
      type: "function",
      function: {
        name: call.name,
        arguments: call.argumentsText || "{}"
      }
    }))
  };
}

function toolResultMessage(call: OpenAICompatibleToolCall, result: ToolResult): PlannerChatMessage {
  return {
    role: "tool",
    tool_call_id: call.id,
    content: plannerNativeToolResultContent(result)
  };
}

async function executePlannerNativeToolCall(call: OpenAICompatibleToolCall, toolsByName: Map<string, ToolDefinition>): Promise<ToolResult> {
  const tool = toolsByName.get(call.name);
  if (!tool) {
    return {
      success: false,
      observation: `Planner requested unavailable native tool ${call.name}.`,
      error: `native_tool_unavailable:${call.name}`
    };
  }

  const parsedArgs = parsePlannerNativeToolArguments(call);
  if (!parsedArgs.ok) {
    return {
      success: false,
      observation: `Planner emitted invalid JSON arguments for native tool ${call.name}.`,
      error: parsedArgs.error
    };
  }

  return executeToolWithEvents(tool, parsedArgs.args, call.id);
}

async function requestPlannerModelTurn(input: {
  stepId: string;
  settings: RuntimeModelSettings;
  protocol: ResolvedModelApiProtocol;
  capabilities: {
    structuredOutputs: boolean;
    jsonMode: boolean;
    strictTools: boolean;
    reasoning: boolean;
  };
  maxOutputTokens: number;
  stream: boolean;
  parentSignal?: AbortSignal;
  timeoutPolicy: PlannerTimeoutPolicy;
  totalDeadlineAt: number;
  totalStartedAt: number;
  messages: PlannerChatMessage[];
  nativeTools: ToolDefinition[];
  nativeToolRound: number;
  recoveryAttempt?: number;
  stage?: string;
}): Promise<ModelTurnResult> {
  const startedAt = Date.now();
  let stage = input.stage ?? "connecting";
  const endpoint = `${input.settings.providerBaseUrl.replace(/\/+$/, "")}/${input.protocol === "responses" ? "responses" : input.protocol === "chat_completions" ? "chat/completions" : "completions"}`;
  await appendBackgroundStepEvent(input.stepId, "ModelCallStarted", {
    role: "planner",
    model: input.settings.plannerModel,
    endpoint,
    protocol: input.protocol,
    maxOutputTokens: input.maxOutputTokens,
    reasoningEffort: input.capabilities.reasoning ? "low" : undefined,
    nativeTools: input.nativeTools.map((tool) => tool.name),
    nativeToolRound: input.nativeToolRound,
    recoveryAttempt: input.recoveryAttempt ?? 0,
    stage,
    firstResponseTimeoutMs: input.timeoutPolicy.firstResponseTimeoutMs,
    streamIdleTimeoutMs: input.timeoutPolicy.streamIdleTimeoutMs,
    requestTimeoutMs: input.timeoutPolicy.requestTimeoutMs,
    totalTimeoutMs: input.timeoutPolicy.totalTimeoutMs
  });
  let pendingChunk = "";
  let pendingContentChunk = "";
  let pendingReasoningChunk = "";
  let pendingToolArgumentsChunk = "";
  let pendingStreamKinds = new Set<string>();
  let progressEventIndex = 0;
  let latestReceivedChars = 0;
  let latestToolArgumentsChars = 0;
  let latestToolCallNames: string[] = [];
  let lastToolFingerprint = "";
  let lastProgressAt = Date.now();
  const progressTiming = (): Record<string, number> => ({
    elapsedMs: Math.max(0, Date.now() - input.totalStartedAt),
    requestElapsedMs: Math.max(0, Date.now() - startedAt),
    remainingBudgetMs: remainingPlannerBudget(input.totalDeadlineAt)
  });
  const emitStage = async (): Promise<void> => {
    await appendBackgroundStepEvent(input.stepId, "ModelCallProgress", {
      role: "planner",
      model: input.settings.plannerModel,
      protocol: input.protocol,
      stage,
      chunkIndex: progressEventIndex,
      receivedChars: latestReceivedChars,
      nativeToolRound: input.nativeToolRound,
      recoveryAttempt: input.recoveryAttempt ?? 0,
      ...progressTiming()
    });
  };
  const flushProgress = async (force = false): Promise<void> => {
    const now = Date.now();
    const toolFingerprint = latestToolCallNames.join("|");
    const hasVisibleProgress = pendingChunk.length > 0 || toolFingerprint !== lastToolFingerprint;
    if (!hasVisibleProgress) return;
    if (!force && now - lastProgressAt < 80 && pendingChunk.length < 96 && toolFingerprint === lastToolFingerprint) return;
    progressEventIndex += 1;
    await appendBackgroundStepEvent(input.stepId, "ModelCallProgress", {
      role: "planner",
      model: input.settings.plannerModel,
      protocol: input.protocol,
      chunk: pendingChunk,
      contentChunk: pendingContentChunk,
      reasoningChunk: pendingReasoningChunk,
      toolArgumentsChunk: pendingToolArgumentsChunk,
      chunkIndex: progressEventIndex,
      receivedChars: latestReceivedChars,
      toolCallNames: latestToolCallNames,
      toolArgumentsChars: latestToolArgumentsChars,
      streamKinds: [...pendingStreamKinds],
      stage,
      nativeToolRound: input.nativeToolRound,
      recoveryAttempt: input.recoveryAttempt ?? 0,
      ...progressTiming()
    });
    pendingChunk = "";
    pendingContentChunk = "";
    pendingReasoningChunk = "";
    pendingToolArgumentsChunk = "";
    pendingStreamKinds = new Set<string>();
    lastToolFingerprint = toolFingerprint;
    lastProgressAt = now;
  };
  const onProgress = async (progress: ModelStreamProgress): Promise<void> => {
    const content = progress.contentChunk ?? "";
    const reasoning = progress.reasoningChunk ?? "";
    const toolArguments = progress.toolArgumentsChunk ?? "";
    pendingChunk += `${content}${reasoning}${toolArguments}`;
    pendingContentChunk += content;
    pendingReasoningChunk += reasoning;
    pendingToolArgumentsChunk += toolArguments;
    latestReceivedChars = progress.visibleReceivedChars;
    latestToolArgumentsChars = progress.toolArgumentsChars ?? latestToolArgumentsChars;
    latestToolCallNames = progress.toolCallNames ?? latestToolCallNames;
    if (content) {
      pendingStreamKinds.add("content");
      stage = "content";
    }
    if (reasoning) {
      pendingStreamKinds.add("reasoning");
      stage = "reasoning";
    }
    if (toolArguments) {
      pendingStreamKinds.add("tool_arguments");
      stage = "tool_arguments";
    }
    await flushProgress(false);
  };
  await emitStage();
  const heartbeat = setInterval(() => void emitStage().catch(() => undefined), 2_000);
  let turn: ModelTurnResult;
  try {
    turn = await withPlannerRequestTimeout({
      policy: input.timeoutPolicy,
      totalDeadlineAt: input.totalDeadlineAt,
      parentSignal: input.parentSignal,
      run: (signal, activity) => requestPlannerProtocolTurn({
        protocol: input.protocol,
        baseUrl: input.settings.providerBaseUrl,
        apiKey: input.settings.apiKey,
        model: input.settings.plannerModel,
        messages: input.messages,
        nativeTools: input.protocol === "completions" ? [] : input.nativeTools,
        capabilities: input.capabilities,
        maxOutputTokens: input.maxOutputTokens,
        stream: input.stream,
        signal,
        onProgress,
        onActivity: async ({ kind }) => {
          activity.markActivity();
          if (kind === "response_headers") {
            stage = input.stream ? "waiting_model_output" : "receiving_response";
            await emitStage();
          }
        }
      })
    });
  } finally {
    clearInterval(heartbeat);
  }
  await flushProgress(true);
  const outputChars = turn.text.length || turn.toolCalls.reduce((count, call) => count + call.argumentsText.length, 0);
  await appendBackgroundStepEvent(input.stepId, "ModelCallCompleted", {
    role: "planner",
    model: input.settings.plannerModel,
    protocol: input.protocol,
    responseId: turn.responseId,
    completionStatus: turn.status,
    finishReason: turn.finishReason,
    incompleteReason: turn.incompleteReason,
    inputTokens: turn.usage?.inputTokens,
    outputTokens: turn.usage?.outputTokens,
    reasoningTokens: turn.usage?.reasoningTokens,
    outputChars,
    outputPreview: turn.text.slice(0, 12000),
    nativeToolCalls: turn.toolCalls.map((call) => call.name),
    nativeToolRound: input.nativeToolRound,
    recoveryAttempt: input.recoveryAttempt ?? 0,
    durationMs: Math.max(0, Date.now() - startedAt),
    totalElapsedMs: Math.max(0, Date.now() - input.totalStartedAt),
    stage: "complete"
  });
  return turn;
}

async function callPlanner(settings: RuntimeModelSettings, input: PlannerInput, runtimeSignal?: AbortSignal): Promise<PlannerPortResult> {
  if (!settings.providerBaseUrl.trim() || !settings.apiKey.trim() || !settings.plannerModel.trim()) {
    throw new Error("model_settings_missing");
  }

  const activeRuntimeConfig = await modelConfigService.resolveActiveRuntimeConfig().catch(() => undefined);
  const matchingRuntime = runtimeMatchesPlannerSettings(activeRuntimeConfig, settings) ? activeRuntimeConfig : undefined;
  const nativeToolsSupported = !input.contractRepair && plannerSupportsNativeTools(settings, activeRuntimeConfig);
  let outputBudget = plannerOutputBudget(matchingRuntime?.maxOutputTokens);
  const config = modelConfig(settings, { supportsToolUse: nativeToolsSupported, maxOutputTokens: outputBudget });
  const officialOpenAi = normalizedEndpointBase(settings.providerBaseUrl).toLowerCase() === "https://api.openai.com/v1";
  const configuredProtocol = matchingRuntime?.protocol ?? "auto";
  const capabilities = {
    structuredOutputs: matchingRuntime?.structuredOutputs ?? officialOpenAi,
    jsonMode: matchingRuntime?.jsonMode ?? officialOpenAi,
    strictTools: matchingRuntime?.strictTools ?? officialOpenAi,
    reasoning: matchingRuntime?.reasoning ?? /^(gpt-5|o\d)/i.test(settings.plannerModel)
  };
  const totalStartedAt = Date.now();
  const timeoutPolicy = plannerTimeoutPolicy({ model: settings.plannerModel, reasoning: capabilities.reasoning });
  const totalDeadlineAt = totalStartedAt + timeoutPolicy.totalTimeoutMs;
  const protocolKey = `${normalizedEndpointBase(settings.providerBaseUrl)}|${settings.plannerModel}`;
  const candidates = protocolCandidates({
    protocol: configuredProtocol,
    provider: matchingRuntime?.provider ?? (officialOpenAi ? "openai" : "custom"),
    baseUrl: settings.providerBaseUrl
  });
  const cachedProtocol = configuredProtocol === "auto" ? resolvedPlannerProtocols.get(protocolKey) : undefined;
  const protocolQueue = cachedProtocol && candidates.includes(cachedProtocol)
    ? [cachedProtocol, ...candidates.filter((protocol) => protocol !== cachedProtocol)]
    : [...candidates];
  let selectedProtocol: ResolvedModelApiProtocol | undefined;
  const schema = plannerResponseJsonSchema();
  const userLanguage = userLanguageForTask(input.taskFrame.taskText);
  const systemPrompt = [
    "You are NaturalClick Agent's browser planner for a Chrome extension.",
    "Return only one JSON object with commandTurn, needMoreObservationTurn, askUserTurn, and finishTaskTurn. Exactly one branch must be non-null. Do not use markdown or prose outside JSON.",
    "Use semantic commands only. Never output primitive actions such as dom_click, dom_input, dom_select_option, coordinate_click, or raw JavaScript.",
    "User-visible text fields must match the user's language. If userLanguage is zh-CN, write AskUser.question, FinishTask.summary, taskUnderstanding, activeSubgoal, expectedOutcome, and reasoningSummary in Chinese. If userLanguage is en, write them in English.",
    "Use observed page controls. When a control has semanticId, put it in inputs.controlId, inputs.semanticId, or inputs.controlRef exactly as observed.",
    "When observationRequests contains ambiguousCandidates, disambiguate by those candidates. If you choose one, put its semanticId exactly in nextCommand.inputs.controlId or inputs.semanticId. Do not repeat the same ambiguous text-only command unless none of the candidates matches the user task.",
    "For ActivateTarget, targetGoal must include the exact visible label of the target when one exists. Do not use only an abstract destination like 'open customer list'; use the visible menu/button text such as '客户管理'.",
    "Never choose controls whose label and accessibleName are both empty unless the role is a text field and the input has a clear placeholder/value context.",
    "Do not repeat an action that recentActions shows as status success with verificationStatus success or partial, unless the current observation proves the value/page state is wrong.",
    "Analyze the current page state every round. If the current page is an authenticated app/dashboard/admin console with navigation menus, data cards, tables, or workspace content visible, treat any earlier login/open-login subgoal as already satisfied. Do not navigate back to a login page unless the current observation clearly shows a login form, an auth error, or an unauthenticated page.",
    "For a simple sequence on the same stable page, you may return nextCommands with at most 3 actions. Good batches: fill username, fill password, then click login. Bad batches: actions after unknown navigation, destructive actions, or steps needing new observation.",
    "If a batch includes navigation, submit, or a click likely to change the page, place that action last.",
    "Each nextCommands item should include expectedOutcome, successCriteria, and riskHint. Use control_value_matches for FillField and SelectOption, control_state_matches for checkbox/switch/radio state changes, content_read for ReadContent, key_pressed for PressKey, page_changed or submission_feedback_or_validation for submit/login/navigation, target_visible for simple activation, menu_expanded or child_target_visible when expanding navigation/menu controls, and menu_collapsed when collapsing them.",
    "For tasks that ask to open a website or search the web, prefer NavigateTo with inputs.url as an absolute URL. For Baidu search, use https://www.baidu.com/s?wd=<encoded query>.",
    "If the task is already complete, fill finishTaskTurn and set the other three branches to null.",
    "If the current page context is insufficient, fill needMoreObservationTurn and set the other three branches to null.",
    "If user input is required, fill askUserTurn and set the other three branches to null.",
    "If native read-only tools are available, you may use them only to inspect page context or search enabled context. After tool results, return the final planner JSON object.",
    "Use load_tools when you need optional enabled groups such as files, scratchpad, schedule, search, or skills before returning a browser action.",
    "If attachments are present, use their filename, mime, size, and capped textPreview as user-provided context. Do not assume the attachment contains more than the preview.",
    "If contractRepair is present in the user payload, repair the previous invalid JSON/contract output only. Preserve the intended browser action when possible and return one valid schema object."
  ].join(" ");
  let plannerModelCalls = 0;

  try {
    const messages: PlannerChatMessage[] = [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: JSON.stringify({
          taskFrame: input.taskFrame,
          userLanguage,
          page: plannerPageContext(input),
          evidence: input.evidence,
          attachments: input.attachments ?? [],
          conversationHistory: input.conversationHistory ?? [],
          recentActions: input.recentActions ?? [],
          stepId: input.stepId,
          observationRound: input.observationRound ?? 1,
          observationRequests: input.observationRequests ?? [],
          contractRepair: input.contractRepair,
          schema
        })
      }
    ];
    let text = "";
    let nativeToolRound = 0;
    let nativeToolsDisabled = !config.capabilities.supportsToolUse;

    const requestNegotiatedTurn = async (
      requestMessages: PlannerChatMessage[],
      nativeTools: ToolDefinition[],
      options: { stream: boolean; recoveryAttempt?: number; stage?: string } = { stream: true }
    ): Promise<ModelTurnResult> => {
      const remainingBudgetMs = remainingPlannerBudget(totalDeadlineAt);
      if (remainingBudgetMs < Math.min(10_000, timeoutPolicy.firstResponseTimeoutMs)) {
        throw new PlannerTimeoutError("planner_total_budget_exhausted", Date.now() - totalStartedAt, false);
      }
      const attemptProtocols = selectedProtocol ? [selectedProtocol] : protocolQueue;
      let lastProtocolError: unknown;
      for (const protocol of attemptProtocols) {
        try {
          plannerModelCalls += 1;
          const turn = await requestPlannerModelTurn({
            stepId: input.stepId,
            settings,
            protocol,
            capabilities,
            maxOutputTokens: outputBudget,
            stream: options.stream,
            parentSignal: runtimeSignal,
            timeoutPolicy,
            totalDeadlineAt,
            totalStartedAt,
            messages: requestMessages,
            nativeTools,
            nativeToolRound,
            recoveryAttempt: options.recoveryAttempt,
            stage: options.stage
          });
          selectedProtocol = protocol;
          if (configuredProtocol === "auto") resolvedPlannerProtocols.set(protocolKey, protocol);
          return turn;
        } catch (error) {
          lastProtocolError = error;
          if (error instanceof PlannerTimeoutError) {
            Object.assign(error, {
              protocol,
              nativeToolRound,
              recoveryAttempt: options.recoveryAttempt ?? 0
            });
          }
          if (configuredProtocol === "auto" && error instanceof ModelProtocolHttpError && error.protocolUnsupported && protocol !== attemptProtocols.at(-1)) {
            await appendBackgroundStepEvent(input.stepId, "ModelCallProgress", {
              role: "planner",
              model: settings.plannerModel,
              protocol,
              stage: "protocol_fallback",
              elapsedMs: Date.now() - totalStartedAt,
              remainingBudgetMs: remainingPlannerBudget(totalDeadlineAt)
            });
            await appendBackgroundStepEvent(input.stepId, "RecoverySuggested", {
              reason: "planner_protocol_fallback",
              fromProtocol: protocol,
              status: error.status
            }, "debug");
            continue;
          }
          throw error;
        }
      }
      throw lastProtocolError ?? new Error("planner_provider_protocol_error");
    };

    const requestRecoverableTurn = async (requestMessages: PlannerChatMessage[], nativeTools: ToolDefinition[]): Promise<ModelTurnResult> => {
      let turn = await requestNegotiatedTurn(requestMessages, nativeTools, { stream: true });
      if (turn.status === "incomplete") {
        const expanded = expandedPlannerOutputBudget(outputBudget);
        if (turn.incompleteReason !== "max_output_tokens" || expanded <= outputBudget) throw new Error("planner_output_truncated");
        outputBudget = expanded;
        turn = await requestNegotiatedTurn(requestMessages, nativeTools, { stream: true, recoveryAttempt: 1, stage: "retrying_truncated_output" });
      }
      if (turn.status === "incomplete") throw new Error("planner_output_truncated");
      if (turn.status === "refused") throw new Error("planner_refused");
      if (turn.status === "failed") throw new Error("planner_provider_protocol_error");
      if (!turn.text.trim() && turn.toolCalls.length === 0) {
        turn = await requestNegotiatedTurn(requestMessages, nativeTools, { stream: false, recoveryAttempt: 1, stage: "retrying_empty_output" });
      }
      if (turn.status === "incomplete") throw new Error("planner_output_truncated");
      if (turn.status === "refused") throw new Error("planner_refused");
      if (turn.status === "failed") throw new Error("planner_provider_protocol_error");
      if (!turn.text.trim() && turn.toolCalls.length === 0) throw new Error("planner_empty_output");
      return turn;
    };

    while (true) {
      const capabilities = toolRuntimeCapabilitiesForSettings(activeCapabilitySettings, {
        tools: !nativeToolsDisabled,
        vision: activeRuntimeConfig?.vision ?? Boolean(settings.visionModel)
      });
      const nativeTools = nativeToolsDisabled ? [] : plannerNativeTools(activeCapabilitySettings, capabilities);
      let turn: ModelTurnResult;

      try {
        turn = await requestRecoverableTurn(messages, nativeTools);
      } catch (error) {
        if (nativeTools.length && shouldRetryPlannerRequestWithoutTools(error)) {
          await appendBackgroundStepEvent(
            input.stepId,
            "ModelCallFailed",
            {
              role: "planner",
              model: settings.plannerModel,
              reason: abortErrorReason(error, runtimeSignal),
              nativeToolRound,
              nativeTools: nativeTools.map((tool) => tool.name),
              retryWithoutNativeTools: true
            },
            "debug"
          );
          nativeToolsDisabled = true;
          await appendBackgroundStepEvent(input.stepId, "ModelCallProgress", {
            role: "planner",
            model: settings.plannerModel,
            protocol: selectedProtocol,
            stage: "retrying_without_tools",
            elapsedMs: Date.now() - totalStartedAt,
            remainingBudgetMs: remainingPlannerBudget(totalDeadlineAt)
          });
          continue;
        }
        throw error;
      }

      if (turn.toolCalls.length && nativeTools.length) {
        if (nativeToolRound < DEFAULT_MAX_PLANNER_NATIVE_TOOL_ROUNDS) {
          const toolsByName = new Map(nativeTools.map((tool) => [tool.name, tool]));
          const executions = await executePlannerNativeToolCallsWithCache(turn.toolCalls, (call) => executePlannerNativeToolCall(call, toolsByName));
          messages.push(assistantToolCallMessage(turn.toolCalls));
          for (const execution of executions) {
            messages.push(toolResultMessage(execution.call, execution.result));
          }
          nativeToolRound += 1;
          continue;
        }

        messages.push({
          role: "user",
          content: plannerNativeToolBudgetInstruction(turn.toolCalls)
        });
        nativeToolsDisabled = true;
        continue;
      }

      text = turn.text || turn.toolCalls.map((call) => call.argumentsText).join("");
      break;
    }

    let parsed = parseLooseJson(text);
    let validation = validatePlannerTurn(parsed);
    if (!parsed || !validation.ok) {
      const violation = parsed && !validation.ok ? validation.message : "Planner output was not valid JSON.";
      await appendBackgroundStepEvent(input.stepId, "ModelContractViolation", {
        message: violation,
        rawOutputPreview: text.slice(0, 12000),
        protocol: selectedProtocol
      }, "debug");
      const repairMessages: PlannerChatMessage[] = [
        ...messages,
        ...(text.trim() ? [{ role: "assistant" as const, content: text }] : []),
        {
          role: "user",
          content: JSON.stringify({
            contractRepair: {
              message: violation,
              instruction: "Return one complete object matching the supplied JSON Schema. Preserve the intended action. Do not include prose."
            },
            schema
          })
        }
      ];
      await appendBackgroundStepEvent(input.stepId, "ModelCallProgress", {
        role: "planner",
        model: settings.plannerModel,
        protocol: selectedProtocol,
        stage: "contract_repair",
        elapsedMs: Date.now() - totalStartedAt,
        remainingBudgetMs: remainingPlannerBudget(totalDeadlineAt)
      });
      const repaired = await requestNegotiatedTurn(repairMessages, [], { stream: false, recoveryAttempt: 1, stage: "contract_repair" });
      if (repaired.status === "refused") throw new Error("planner_refused");
      if (repaired.status === "incomplete") throw new Error("planner_output_truncated");
      if (repaired.status !== "completed" || !repaired.text.trim()) throw new Error("planner_repair_exhausted");
      parsed = parseLooseJson(repaired.text);
      validation = validatePlannerTurn(parsed);
      if (!parsed || !validation.ok) throw new Error("planner_repair_exhausted");
    }
    return {
      turn: parsed as PlannerDecision | PlannerTurn,
      metrics: {
        modelCalls: plannerModelCalls
      }
    };
  } catch (error) {
    const resolvedError = error;
    const totalElapsedMs = Date.now() - totalStartedAt;
    const requestElapsedMs = resolvedError instanceof PlannerTimeoutError ? resolvedError.elapsedMs : undefined;
    await appendBackgroundStepEvent(
      input.stepId,
      "ModelCallFailed",
      {
        role: "planner",
        model: settings.plannerModel,
        reason: abortErrorReason(resolvedError, runtimeSignal),
        protocol: selectedProtocol ?? (resolvedError && typeof resolvedError === "object" && "protocol" in resolvedError ? (resolvedError as { protocol?: unknown }).protocol : undefined),
        timeoutReason: resolvedError instanceof PlannerTimeoutError ? resolvedError.reason : undefined,
        elapsedMs: totalElapsedMs,
        requestElapsedMs,
        totalElapsedMs,
        receivedResponse: resolvedError instanceof PlannerTimeoutError ? resolvedError.receivedResponse : undefined,
        totalTimeoutMs: timeoutPolicy.totalTimeoutMs
      },
      "user"
    );
    throw plannerErrorWithMetrics(resolvedError, { modelCalls: Math.max(1, typeof plannerModelCalls === "number" ? plannerModelCalls : 0) });
  }
}

function tabUpdate(tabId: number, updateProperties: chrome.tabs.UpdateProperties): Promise<chrome.tabs.Tab> {
  return chrome.tabs.update(tabId, updateProperties);
}

function tabCreate(createProperties: chrome.tabs.CreateProperties): Promise<chrome.tabs.Tab> {
  return chrome.tabs.create(createProperties);
}

async function adoptTaskChildTab(sourceTabId: number, tabsBefore: Set<number>): Promise<void> {
  if (activeSession?.targetTabId !== sourceTabId) return;
  const child = selectNewTaskChildTab(await chrome.tabs.query({}), tabsBefore, sourceTabId);
  if (!child?.id) return;
  if (child.status !== "complete") {
    await waitForTabComplete(child.id, 15000, activeRunAbortController?.signal);
  }
  const updated = await getTab(child.id);
  await bindActiveTaskToTab(updated ?? child);
  lastObservedPage = undefined;
  currentOverlayTargetId = undefined;
}

async function tabHistoryAction(tabId: number, action: "back" | "forward" | "reload"): Promise<void> {
  const tabs = chrome.tabs as typeof chrome.tabs & {
    goBack?: (tabId?: number) => Promise<void>;
    goForward?: (tabId?: number) => Promise<void>;
    reload?: (tabId?: number, reloadProperties?: chrome.tabs.ReloadProperties) => Promise<void>;
  };
  if (action === "back") {
    if (!tabs.goBack) throw new Error("history_back_unavailable");
    await tabs.goBack(tabId);
    return;
  }
  if (action === "forward") {
    if (!tabs.goForward) throw new Error("history_forward_unavailable");
    await tabs.goForward(tabId);
    return;
  }
  if (!tabs.reload) throw new Error("history_reload_unavailable");
  await tabs.reload(tabId, {});
}

function taskStoppedError(): Error {
  return new Error("task_stopped");
}

function waitForTabComplete(tabId: number, timeoutMs = 15000, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(taskStoppedError());

  return new Promise((resolve, reject) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout>;

    function cleanup(): void {
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
      signal?.removeEventListener("abort", onAbort);
    }

    function finish(done: () => void): void {
      if (settled) return;
      settled = true;
      cleanup();
      done();
    }

    function onAbort(): void {
      finish(() => reject(taskStoppedError()));
    }

    function listener(updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo): void {
      if (updatedTabId !== tabId || changeInfo.status !== "complete") return;
      finish(resolve);
    }

    timeout = setTimeout(() => {
      finish(resolve);
    }, timeoutMs);
    chrome.tabs.onUpdated.addListener(listener);
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
    }
  });
}

async function executePrimitive(primitive: BrowserPrimitive): Promise<PrimitiveResult> {
  if (primitive.type === "navigate") {
    const signal = activeRunAbortController?.signal;
    if (signal?.aborted) throw taskStoppedError();
    const tab = await resolveTaskTab(false);
    if (!tab?.id) return { status: "failed", reason: "task_tab_not_found", details: { primitive } };
    if (signal?.aborted) throw taskStoppedError();
    await tabUpdate(tab.id, { url: primitive.url });
    await waitForTabComplete(tab.id, 15000, signal);
    const updated = await getTab(tab.id);
    if (updated) await bindActiveTaskToTab(updated);
    return { status: "success", details: { primitive: "navigate", url: primitive.url, tabId: tab.id } };
  }

  if (primitive.type === "open_tab") {
    const signal = activeRunAbortController?.signal;
    if (signal?.aborted) throw taskStoppedError();
    const tab = await tabCreate({ url: primitive.url, active: primitive.active !== false });
    if (!tab.id) return { status: "failed", reason: "created_tab_missing_id", details: { primitive } };
    if (signal?.aborted) throw taskStoppedError();
    await waitForTabComplete(tab.id, 15000, signal);
    const updated = await getTab(tab.id);
    await bindActiveTaskToTab(updated ?? tab);
    return { status: "success", details: { primitive: "open_tab", url: primitive.url, tabId: tab.id, active: primitive.active !== false } };
  }

  if (primitive.type === "history") {
    const signal = activeRunAbortController?.signal;
    if (signal?.aborted) throw taskStoppedError();
    const tab = await resolveTaskTab(false);
    if (!tab?.id) return { status: "failed", reason: "task_tab_not_found", details: { primitive } };
    if (signal?.aborted) throw taskStoppedError();
    await tabHistoryAction(tab.id, primitive.action);
    await waitForTabComplete(tab.id, 15000, signal);
    return { status: "success", details: { primitive: "history", action: primitive.action, tabId: tab.id } };
  }

  if (primitive.type === "capture_screenshot") {
    const screenshot = await captureCleanVisibleTabScreenshot();
    return {
      status: "success",
      details: { primitive: "capture_screenshot", capturedAt: screenshot.capturedAt, dataUrlLength: screenshot.dataUrl.length }
    };
  }

  const sourceTabId = activeSession?.targetTabId;
  const tabsBefore = primitive.type === "dom_click"
    ? new Set((await chrome.tabs.query({})).flatMap((tab) => tab.id === undefined ? [] : [tab.id]))
    : undefined;
  const response = await sendTaskTabMessage<PrimitiveResult>({ type: "EXECUTE_PRIMITIVE", primitive, pageModel: lastObservedPage });
  if (response.ok && response.data.status === "success" && sourceTabId !== undefined && tabsBefore) {
    await adoptTaskChildTab(sourceTabId, tabsBefore);
  }
  return response.ok ? response.data : { status: "failed", reason: response.error, details: { primitive } };
}

function cancelActiveContentPrimitive(reason: string): void {
  void sendTaskTabMessage({ type: "CANCEL_ACTIVE_PRIMITIVE", reason }).catch(() => undefined);
}

async function captureCleanVisibleTabScreenshot(): Promise<{ dataUrl: string; capturedAt: number }> {
  const shouldRestoreOverlay = activeOverlayMode !== "Off";
  if (shouldRestoreOverlay) {
    await sendTaskTabMessage({ type: "SET_OVERLAY_MODE", mode: "Off" });
  }

  try {
    const target = await resolveTaskTab(false);
    if (!target?.id) throw new Error("task_tab_not_found");
    return await captureTabScreenshot(target.id);
  } finally {
    if (shouldRestoreOverlay) {
      if (lastObservedPage) {
        await syncOverlayForPage(lastObservedPage);
      } else {
        await sendTaskTabMessage({ type: "SET_OVERLAY_MODE", mode: activeOverlayMode });
      }
    }
  }
}

async function appendTaskFailure(error: unknown): Promise<void> {
  await appendBackgroundEvent(
    "TaskFailed",
    { reason: error instanceof Error ? error.message : String(error) },
    "user"
  );
}

function isBoundCommand(value: unknown): value is BoundCommand {
  return Boolean(value && typeof value === "object" && "primitive" in value);
}

function taskTextFromEvents(events: AgentEvent[]): string | undefined {
  const started = events.find((event) => event.type === "TaskStarted");
  const taskText = started?.payload.taskText;
  return typeof taskText === "string" && taskText.trim() ? taskText : undefined;
}

function terminalSummaryFromEvents(events: AgentEvent[]): string | undefined {
  const completed = [...events].reverse().find((event) => event.type === "TaskCompleted");
  if (!completed) return undefined;
  for (const key of ["summary", "message", "detail"]) {
    const value = completed.payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function boundedConversationHistory(turns: Array<{ taskId: string; events: AgentEvent[] }>): ConversationHistoryItem[] {
  return turns
    .flatMap((turn) => {
      const prompt = taskTextFromEvents(turn.events);
      const summary = terminalSummaryFromEvents(turn.events);
      if (!prompt || !summary) return [];
      return [
        { taskId: turn.taskId, role: "user" as const, content: prompt.slice(0, 1200) },
        { taskId: turn.taskId, role: "assistant" as const, content: summary.slice(0, 1200) }
      ];
    })
    .slice(-16);
}

function semanticCommandFromPayload(payload: Record<string, unknown>): SemanticCommand | undefined {
  const command = payload.command;
  if (!command || typeof command !== "object") return undefined;
  const record = command as Partial<SemanticCommand>;
  return typeof record.id === "string" && typeof record.type === "string" && typeof record.targetGoal === "string" ? (record as SemanticCommand) : undefined;
}

function primitiveResultFromPayload(payload: Record<string, unknown>): PrimitiveResult | undefined {
  const result = payload.result;
  if (!result || typeof result !== "object") return undefined;
  const record = result as Partial<PrimitiveResult>;
  return typeof record.status === "string" ? (record as PrimitiveResult) : undefined;
}

function stringArrayFromPayload(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

function taskConsentScopeFor(pending: AgentEvent | undefined, command: SemanticCommand, page: PageModel): ConsentScope {
  const policyContext = pending?.payload.policyContext;
  const context = policyContext && typeof policyContext === "object" ? (policyContext as Record<string, unknown>) : {};
  const decision = pending?.payload.decision;
  const decisionRecord = decision && typeof decision === "object" ? (decision as Record<string, unknown>) : {};
  return {
    id: createEventId(),
    taskId: activeSession?.taskId ?? command.id,
    origin: typeof context.origin === "string" ? context.origin : page.pageIdentity.origin,
    pageIdentity: typeof context.pageIdentity === "string" ? context.pageIdentity : page.pageIdentity.title,
    commandTypes: [command.type],
    dataCategories: stringArrayFromPayload(decisionRecord.redactions),
    expiresAt: Date.now() + 10 * 60 * 1000
  };
}

function isConsentScope(value: unknown): value is ConsentScope {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<ConsentScope>;
  return (
    typeof record.taskId === "string" &&
    typeof record.origin === "string" &&
    typeof record.pageIdentity === "string" &&
    Array.isArray(record.commandTypes) &&
    Array.isArray(record.dataCategories) &&
    typeof record.expiresAt === "number"
  );
}

function restoredConsentScope(events: AgentEvent[]): ConsentScope | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const scope = events[index].payload.consentScope;
    if (isConsentScope(scope) && scope.expiresAt > Date.now()) return scope;
  }
  return undefined;
}

async function observeForConsentExecution(stepId: string, reason: string, observationRound: number): Promise<PageModel> {
  await appendBackgroundStepEvent(stepId, "ObservationRequested", {
    reason,
    observationRound,
    candidateLimit: OVERLAY_OBSERVATION_LIMIT
  });
  const page = await observeActivePage(undefined, {
    observationRound,
    candidateLimit: OVERLAY_OBSERVATION_LIMIT
  });
  await appendBackgroundStepEvent(stepId, "ObservationReceived", {
    pageIdentity: page.pageIdentity,
    controls: page.controls.length,
    observationRound,
    candidateLimit: OVERLAY_OBSERVATION_LIMIT,
    retrieval: page.observation,
    reason
  });
  return page;
}

async function appendConsentVerification(stepId: string, commandId: string, verification: VerificationResult): Promise<void> {
  await appendBackgroundStepEvent(stepId, "VerificationProduced", {
    commandId,
    status: verification.status,
    confidence: verification.confidence,
    satisfiedCriteria: verification.satisfiedCriteria,
    failedCriteria: verification.failedCriteria,
    failureReason: verification.failureReason,
    recoveryHints: verification.recoveryHints
  });
}

type RestoredActionMemoryDraft = Partial<ActionMemoryItem> & {
  commandId: string;
  commandType?: ActionMemoryItem["commandType"];
  targetGoal?: string;
  status?: PrimitiveResult["status"];
  verificationStatus?: ActionMemoryItem["verificationStatus"];
};

function restoredActionMemory(events: AgentEvent[]): ActionMemoryItem[] {
  const byCommand = new Map<string, RestoredActionMemoryDraft>();

  const entryFor = (commandId: string): RestoredActionMemoryDraft => {
    const existing = byCommand.get(commandId);
    if (existing) return existing;
    const next: RestoredActionMemoryDraft = { commandId };
    byCommand.set(commandId, next);
    return next;
  };

  for (const event of events) {
    if (event.type === "CommandIssued") {
      const command = semanticCommandFromPayload(event.payload);
      if (!command) continue;
      const entry = entryFor(command.id);
      entry.commandType = command.type;
      entry.targetGoal = command.targetGoal;
      continue;
    }

    const commandId = typeof event.payload.commandId === "string" ? event.payload.commandId : undefined;
    if (!commandId) continue;
    const entry = entryFor(commandId);

    if (event.type === "CommandBound") {
      const targetRef = event.payload.targetRef;
      if (typeof targetRef === "string") entry.targetRef = targetRef;
    }

    if (event.type === "CommandResultReceived") {
      const result = primitiveResultFromPayload(event.payload);
      if (!result) continue;
      entry.status = result.status;
      entry.valueStateAfter = result.details?.valueStateAfter;
      entry.valueMatchesExpected = result.details?.valueMatchesExpected;
    }

    if (event.type === "VerificationProduced") {
      const status = event.payload.status;
      const failureReason = event.payload.failureReason;
      if (typeof status === "string") entry.verificationStatus = status as ActionMemoryItem["verificationStatus"];
      if (typeof failureReason === "string") entry.failureReason = failureReason;
    }
  }

  return Array.from(byCommand.values())
    .flatMap((entry): ActionMemoryItem[] => {
      if (!entry.commandType || !entry.targetGoal || !entry.status || !entry.verificationStatus) return [];
      return [
        {
          commandType: entry.commandType,
          targetGoal: entry.targetGoal,
          targetRef: entry.targetRef,
          status: entry.status,
          verificationStatus: entry.verificationStatus,
          failureReason: entry.failureReason,
          valueStateAfter: entry.valueStateAfter,
          valueMatchesExpected: entry.valueMatchesExpected
        }
      ];
    })
    .slice(-20);
}

async function resolveUserConsent(approved: boolean, scope = "once"): Promise<void> {
  const snapshot = await sessionState();
  const pending = [...snapshot.events].reverse().find((event) => event.type === "UserConsentRequested");
  if (!approved) {
    await appendBackgroundEvent("UserConsentResolved", { approved, scope }, "user");
    await appendBackgroundEvent("TaskStopped", { reason: "user_rejected_consent" }, "user");
    return;
  }

  const boundCommand = pending?.payload.boundCommand;
  const command = pending ? semanticCommandFromPayload(pending.payload) : undefined;
  if (!isBoundCommand(boundCommand)) {
    await appendBackgroundEvent("UserConsentResolved", { approved, scope }, "user");
    await appendBackgroundEvent("TaskFailed", { reason: "pending_consent_missing_bound_command" }, "user");
    return;
  }
  if (!command) {
    await appendBackgroundEvent("UserConsentResolved", { approved, scope }, "user");
    await appendBackgroundEvent("TaskFailed", { reason: "pending_consent_missing_command" }, "user");
    return;
  }

  const stepId = pending?.stepId ?? createStepId();
  const batch = pending?.payload.batch;
  const before = await observeForConsentExecution(stepId, "before_user_consent_execute", 1);
  let resolvedConsentScope: ConsentScope | undefined;
  if (scope === "task") {
    activeConsentScope = taskConsentScopeFor(pending, command, before);
    resolvedConsentScope = activeConsentScope;
  }
  await appendBackgroundEvent("UserConsentResolved", { approved, scope, consentScope: resolvedConsentScope }, "user");
  await appendBackgroundStepEvent(stepId, "CommandIssued", { command, primitive: boundCommand.primitive, consentScope: scope, batch });
  const result = await executePrimitive(boundCommand.primitive);
  await appendBackgroundStepEvent(
    stepId,
    "CommandResultReceived",
    { commandId: command.id, result, consentScope: scope, batch },
    result.status === "success" ? "debug" : "user"
  );
  const after = await observeForConsentExecution(stepId, "after_user_consent_execute", 2);
  const verification = verifyOutcome({ command, before, after, primitiveResult: result });
  await appendConsentVerification(stepId, command.id, verification);
  if (verification.status === "failed") {
    await appendBackgroundStepEvent(
      stepId,
      "TaskFailed",
      {
        reason: verification.failureReason ?? "verification_failed",
        commandId: command.id,
        failedCriteria: verification.failedCriteria,
        recoveryHints: verification.recoveryHints
      },
      "user"
    );
    return;
  }

  if (!activeController) {
    await appendBackgroundStepEvent(
      stepId,
      "RuntimeSuspended",
      { reason: "controller_unavailable_after_user_consent", commandId: command.id, verificationStatus: verification.status },
      "user"
    );
    return;
  }

  await activeController.continueTask({
    resumedFromEventId: pending?.id,
    resumedAfterConsent: true,
    consentScope: scope,
    commandId: command.id,
    verificationStatus: verification.status
  });
}

function runtimeSafetyMode(mode?: "conservative" | "balanced" | "autonomous" | "experimental_full_auto"): SafetyMode {
  if (mode === "conservative") return "guided";
  if (mode === "autonomous" || mode === "experimental_full_auto") return "experimental_full_auto";
  return "balanced";
}

function buildRuntime(
  settings: RuntimeModelSettings | undefined,
  safetyMode: ReturnType<typeof runtimeSafetyMode>,
  observationBudget?: Partial<ObservationBudget>,
  initialActionMemory?: ActionMemoryItem[],
  abortSignal?: AbortSignal
): AgentRuntime {
  activeSession ??= { sessionId: createSessionId(), taskId: createTaskId() };
  return new AgentRuntime({
    sessionId: activeSession.sessionId,
    taskId: activeSession.taskId,
    safetyMode,
    getConsentScope: () => activeConsentScope,
    observationBudget,
    initialActionMemory,
    abortSignal,
    appendEvent,
    observePage: observeActivePage,
    plan: (input) => {
      if (!settings) throw new Error("model_settings_missing");
      return callPlanner(settings, input, abortSignal);
    },
    execute: executePrimitive
  });
}

async function handleMessage(message: NaturalClickRequest): Promise<NaturalClickResponse> {
  if (message.type === "NATURALCLICK_PING") {
    return okResponse({ source: "background" });
  }

  if (message.type === "START_TASK") {
    const initialTaskTab = await getActiveTab();
    const initialTarget = initialTaskTab ? tabTarget(initialTaskTab) : undefined;
    if (!initialTaskTab || !initialTarget) return errorResponse("active_tab_not_found");
    const restored = await restoreActiveSession();
    const previousTurns = restored ? await eventStore.loadSession(restored.sessionId) : [];
    const currentEvents = restored ? previousTurns.find((turn) => turn.taskId === restored.taskId)?.events ?? [] : [];
    if (currentEvents.length > 0 && deriveSessionExecutionHealth(currentEvents) !== "terminal") {
      return errorResponse("active_task_not_terminal");
    }
    const conversationHistory = boundedConversationHistory(previousTurns);
    activeSession = {
      sessionId: restored?.sessionId ?? createSessionId(),
      taskId: createTaskId(),
      ...initialTarget
    };
    detachedSessionIds.delete(activeSession.sessionId);
    stoppedSessionIds.delete(activeSession.sessionId);
    await persistActiveSession(activeSession);
    currentOverlayTargetId = undefined;
    activeConsentScope = undefined;
    activeCapabilitySettings = resolveCapabilitySettings(message.capabilitySettings);
    activeToolGroups = defaultCapabilityToolGroups();
    activeTaskAttachments = sanitizeFileAttachmentContexts(message.attachments);
    reconcileActiveToolGroups(activeCapabilitySettings);
    activeRunAbortController = new AbortController();
    const runtime = buildRuntime(
      message.modelSettings,
      runtimeSafetyMode(message.safetyMode),
      message.runtimeSettings?.observationBudget,
      undefined,
      activeRunAbortController.signal
    );
    activeController = new ExecutionController({
      sessionId: activeSession.sessionId,
      taskId: activeSession.taskId,
      runtime,
      appendEvent,
      settings: message.runtimeSettings
    });
    try {
      await activeController.startTask(message.taskText, { attachments: activeTaskAttachments, conversationHistory });
    } catch (error) {
      await appendTaskFailure(error);
    }
    return okResponse(await sessionState());
  }

  if (message.type === "RETRY_TASK") {
    const restored = await restoreActiveSession();
    if (!restored || restored.sessionId !== message.sessionId || restored.taskId !== message.taskId) {
      return errorResponse("retry_task_not_active");
    }
    const events = await eventStore.loadAfter(restored.sessionId, restored.taskId);
    if (events.at(-1)?.type !== "TaskFailed") return errorResponse("retry_task_not_failed");
    const taskText = taskTextFromEvents(events);
    if (!taskText) return errorResponse("retry_task_text_missing");
    if (!(await resolveTaskTab(true))) return errorResponse("task_tab_not_found");

    const turns = await eventStore.loadSession(restored.sessionId);
    const conversationHistory = boundedConversationHistory(turns.filter((turn) => turn.taskId !== restored.taskId));
    const startedAttachments = events.find((event) => event.type === "TaskStarted")?.payload.attachments;
    const attachments = activeTaskAttachments.length > 0
      ? activeTaskAttachments
      : sanitizeFileAttachmentContexts(Array.isArray(startedAttachments) ? startedAttachments as FileAttachmentContext[] : []);

    activeRunAbortController?.abort();
    activeController?.stop("retry_requested");
    cancelActiveContentPrimitive("retry_requested");
    await eventStore.clear(restored.sessionId, restored.taskId);
    activeConsentScope = undefined;
    currentOverlayTargetId = undefined;
    activeCapabilitySettings = resolveCapabilitySettings(message.capabilitySettings ?? activeCapabilitySettings);
    activeToolGroups = defaultCapabilityToolGroups();
    activeTaskAttachments = attachments;
    reconcileActiveToolGroups(activeCapabilitySettings);
    activeRunAbortController = new AbortController();
    const runtime = buildRuntime(
      message.modelSettings,
      runtimeSafetyMode(message.safetyMode),
      message.runtimeSettings?.observationBudget,
      undefined,
      activeRunAbortController.signal
    );
    activeController = new ExecutionController({
      sessionId: restored.sessionId,
      taskId: restored.taskId,
      runtime,
      appendEvent,
      settings: message.runtimeSettings
    });
    try {
      await activeController.startTask(taskText, { attachments, conversationHistory });
    } catch (error) {
      await appendTaskFailure(error);
    }
    return okResponse(await sessionState());
  }

  if (message.type === "STOP_TASK") {
    const restored = await restoreActiveSession();
    const reason = message.reason ?? "user_requested";
    if (restored?.sessionId) stoppedSessionIds.add(restored.sessionId);
    activeController?.stopTask({ reason, eventAlreadyAppended: true });
    activeRunAbortController?.abort();
    cancelActiveContentPrimitive(reason);
    await appendBackgroundEvent("TaskStopped", { reason }, "user");
    return okResponse(await sessionState());
  }

  if (message.type === "APPEND_INSTRUCTION") {
    await restoreActiveSession();
    activeCapabilitySettings = resolveCapabilitySettings(message.capabilitySettings ?? activeCapabilitySettings);
    reconcileActiveToolGroups(activeCapabilitySettings);
    await appendBackgroundEvent("TaskInterpreted", { instruction: message.text }, "user");
    return okResponse(await sessionState());
  }

  if (message.type === "RESUME_TASK") {
    const restored = await restoreActiveSession();
    if (!restored) return errorResponse("no_active_session");
    const events = await eventStore.loadAfter(restored.sessionId, restored.taskId);
    const health = deriveSessionExecutionHealth(events);
    if (health !== "suspended") return errorResponse(`session_not_paused:${health}`);
    const taskText = taskTextFromEvents(events);
    if (!taskText) return errorResponse("resume_task_text_missing");
    const resumedTab = await resolveTaskTab(true);
    if (!resumedTab) return errorResponse("task_tab_not_found");

    const initialActionMemory = restoredActionMemory(events);
    const restoredCounters = restoreExecutionCounters(events);
    activeConsentScope = restoredConsentScope(events);
    currentOverlayTargetId = undefined;
    activeCapabilitySettings = resolveCapabilitySettings(message.capabilitySettings ?? activeCapabilitySettings);
    reconcileActiveToolGroups(activeCapabilitySettings);
    const runtime = buildRuntime(
      message.modelSettings,
      runtimeSafetyMode(message.safetyMode),
      message.runtimeSettings?.observationBudget,
      initialActionMemory,
      (activeRunAbortController = new AbortController()).signal
    );
    activeController = new ExecutionController({
      sessionId: restored.sessionId,
      taskId: restored.taskId,
      runtime,
      appendEvent,
      settings: message.runtimeSettings
    });
    try {
      await activeController.resumeTask(taskText, {
        resumedFromEventId: events.at(-1)?.id,
        recoveredActionMemoryItems: initialActionMemory.length,
        restoredCounters,
        targetTabId: resumedTab.id,
        targetTabUrl: resumedTab.url
      }, restoredCounters);
    } catch (error) {
      await appendTaskFailure(error);
    }
    return okResponse(await sessionState());
  }

  if (message.type === "GET_SESSION_STATE") {
    return okResponse(await sessionState(message.sessionId, message.taskId));
  }

  if (message.type === "GET_MODEL_CONFIG") {
    return okResponse(await modelConfigState());
  }

  if (message.type === "SAVE_MODEL_INSTANCE") {
    await modelConfigService.saveInstance(message.instance);
    const activeSelection = await modelConfigService.getActiveSelection();
    if (!activeSelection && message.instance.models[0]) {
      await modelConfigService.setActiveSelection({ instanceId: message.instance.id, model: message.instance.models[0].id });
    }
    return okResponse(await modelConfigState());
  }

  if (message.type === "DELETE_MODEL_INSTANCE") {
    await modelConfigService.deleteInstance(message.instanceId);
    return okResponse(await modelConfigState());
  }

  if (message.type === "SET_ACTIVE_MODEL_SELECTION") {
    await modelConfigService.setActiveSelection(message.selection);
    return okResponse(await modelConfigState());
  }

  if (message.type === "SET_ROLE_MODEL_SELECTION") {
    await modelConfigService.setRoleSelection(message.role, message.selection);
    return okResponse(await modelConfigState());
  }

  if (message.type === "CLEAR_ROLE_MODEL_SELECTION") {
    await modelConfigService.clearRoleSelection(message.role);
    return okResponse(await modelConfigState());
  }

  if (message.type === "TEST_MODEL_INSTANCE") {
    return okResponse({
      tested: false,
      reason: "api_key_ref_only",
      message: "Model instances persist apiKeyRef only; connection tests must resolve secrets through a credential adapter."
    });
  }

  if (message.type === "GET_TOOL_DEFINITIONS") {
    return okResponse(await toolDefinitionsState(message.groups, message.capabilitySettings));
  }

  if (message.type === "GET_SKILLS") {
    return okResponse({ skills: await skillStore.listSkills() });
  }

  if (message.type === "GET_SKILL_DETAIL") {
    return okResponse({ skill: await skillStore.loadSkill(message.skillId) });
  }

  if (message.type === "GET_SCHEDULES") {
    return okResponse({ schedules: await scheduleStore.listSchedules({ limit: 50 }) });
  }

  if (message.type === "GET_SCRATCHPAD") {
    const session = activeSession ?? (await restoreActiveSession());
    return okResponse({
      records: session?.sessionId
        ? await sessionMemory.listScratchpadRecords(session.sessionId, {
            query: message.query,
            collection: message.collection,
            limit: 50
          })
        : []
    });
  }

  if (message.type === "GET_ARTIFACTS") {
    const session = activeSession ?? (await restoreActiveSession());
    const artifacts = session?.sessionId ? await artifactStore.listArtifacts(session.sessionId, { query: message.query, limit: 50 }) : [];
    return okResponse({ artifacts: stripGeneratedArtifactContent(artifacts, 50) });
  }

  if (message.type === "GET_ARTIFACT_DETAIL") {
    const session = activeSession ?? (await restoreActiveSession());
    return okResponse({
      artifact: session?.sessionId ? await artifactStore.loadArtifact(session.sessionId, message.artifactId) : undefined
    });
  }

  if (message.type === "EXECUTE_TOOL") {
    const tool = toolRegistry.getTool(message.toolName);
    if (!tool) return errorResponse(`unknown_tool:${message.toolName}`);
    const activeDefinitions = await toolDefinitionsState(undefined, activeCapabilitySettings);
    if (!activeDefinitions.tools.some((definition) => definition.name === message.toolName)) {
      return errorResponse(`tool_not_enabled:${message.toolName}`);
    }
    return okResponse(await executeToolWithEvents(tool, message.args, message.callId));
  }

  if (message.type === "NEW_SESSION") {
    await detachActiveSession(message.reason);
    return okResponse({ events: [] } satisfies SessionStateResponse);
  }

  if (message.type === "RESOLVE_USER_CONSENT") {
    await restoreActiveSession();
    await resolveUserConsent(message.approved, message.scope);
    return okResponse(await sessionState());
  }

  if (message.type === "SET_OVERLAY_MODE") {
    activeOverlayMode = message.mode;
    if (message.mode === "Off" || message.targets?.length) {
      return sendTaskTabMessage(message);
    }
    const page = await observeActivePage(undefined, { observationRound: 1, candidateLimit: OVERLAY_OBSERVATION_LIMIT }, false);
    return sendTaskTabMessage({
      ...message,
      targets: overlayTargetsFromPage(page, { currentTargetId: currentOverlayTargetId })
    });
  }

  if (
    message.type === "OBSERVE_PAGE" ||
    message.type === "EXECUTE_PRIMITIVE" ||
    message.type === "HIGHLIGHT_TARGET"
  ) {
    return sendTaskTabMessage(message);
  }

  if (message.type === "OPEN_SETTINGS") {
    if (chrome.runtime.openOptionsPage) {
      await chrome.runtime.openOptionsPage();
      return okResponse({ opened: true });
    }
    return errorResponse("options_page_not_available");
  }

  return errorResponse("unsupported_message");
}

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onConnect.addListener((port) => {
  runtimeEventBus.connect(port);
});

async function suspendTaskForClosedTab(tabId: number): Promise<void> {
  const session = activeSession ?? (await restoreActiveSession());
  if (!session || session.targetTabId !== tabId) return;
  const events = await eventStore.loadAfter(session.sessionId, session.taskId);
  if (deriveSessionExecutionHealth(events) === "terminal" || events.at(-1)?.type === "RuntimeSuspended") return;

  activeController?.stop("task_tab_closed", { eventAlreadyAppended: true });
  activeRunAbortController?.abort();
  activeController = undefined;
  activeRunAbortController = undefined;
  lastObservedPage = undefined;
  currentOverlayTargetId = undefined;
  await appendBackgroundEvent(
    "RuntimeSuspended",
    {
      reason: "task_tab_closed",
      targetTabId: tabId,
      targetTabUrl: session.targetTabUrl,
      targetTabTitle: session.targetTabTitle,
      message: "The task page was closed. Open the intended page and resume to bind the task to the current tab."
    },
    "user"
  );
}

chrome.tabs.onRemoved.addListener((tabId) => {
  void suspendTaskForClosedTab(tabId).catch(() => undefined);
});

chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
  void restoreActiveSession()
    .then((session) => session?.targetTabId === removedTabId ? getTab(addedTabId) : undefined)
    .then((tab) => tab ? bindActiveTaskToTab(tab) : false)
    .catch(() => undefined);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const request = message as Partial<NaturalClickRequest> | undefined;
  if (!request?.type) {
    sendResponse(errorResponse("unsupported_message"));
    return true;
  }

  void handleMessage(request as NaturalClickRequest)
    .then(sendResponse)
    .catch((error: unknown) => sendResponse(errorResponse(error instanceof Error ? error.message : "background_error")));
  return true;
});
