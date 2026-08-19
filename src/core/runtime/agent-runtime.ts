import type { BoundCommand, BrowserPrimitive, PrimitiveResult, SemanticCommand, SemanticCommandType } from "../commands/commands";
import { bindCommand, type BindingFailureDetails } from "../commands/binder";
import {
  sanitizeFileAttachmentContexts,
  stripFileArtifactPreviews,
  type FileAttachmentContext
} from "../capabilities/file-artifacts";
import type { Evidence } from "../evidence/evidence";
import { EvidenceManager } from "../evidence/manager";
import type { AgentEvent, EventVisibility } from "../events/events";
import type { NeedMoreObservationRequest, PlannerDecision, PlannerTurn } from "../model/contracts";
import { validatePlannerTurn } from "../model/contracts";
import type { PageModel } from "../observation/page-model";
import type { ConsentScope } from "../policy/consent";
import { evaluatePolicy, type SafetyMode } from "../policy/policy";
import { verifyOutcome, type VerificationResult } from "../verification/verifier";
import { commandActionKey } from "./action-key";
import { detectFastPath } from "./fast-paths";
import { interpretTask, type TaskFrame } from "./task-interpreter";
import type { ObservationBudget } from "./execution-budget";
import { standardObservationBudget } from "./execution-budget";
import { createEventId, createStepId } from "../../shared/ids";

export interface AgentRuntimePorts {
  sessionId: string;
  taskId: string;
  safetyMode?: SafetyMode;
  abortSignal?: AbortSignal;
  getConsentScope?: () => ConsentScope | undefined;
  observationBudget?: Partial<ObservationBudget>;
  initialActionMemory?: ActionMemoryItem[];
  observePage(request?: NeedMoreObservationRequest, options?: ObservePageRuntimeOptions): Promise<PageModel>;
  plan(input: PlannerInput): Promise<unknown>;
  execute(primitive: BrowserPrimitive): Promise<PrimitiveResult>;
  appendEvent(event: AgentEvent): Promise<void>;
}

export interface StartTaskContext {
  attachments?: FileAttachmentContext[];
  conversationHistory?: ConversationHistoryItem[];
}

export interface ConversationHistoryItem {
  taskId: string;
  role: "user" | "assistant";
  content: string;
}

export interface ObservePageRuntimeOptions {
  observationRound: number;
  candidateLimit: number;
}

export interface PlannerInput {
  taskFrame: TaskFrame;
  page: PageModel;
  evidence: unknown[];
  attachments?: FileAttachmentContext[];
  stepId: string;
  observationRound?: number;
  observationRequests?: NeedMoreObservationRequest[];
  recentActions?: ActionMemoryItem[];
  conversationHistory?: ConversationHistoryItem[];
  contractRepair?: PlannerContractRepair;
}

export interface PlannerPortMetrics {
  modelCalls?: number;
  observationRounds?: number;
}

export interface PlannerPortResult {
  turn: unknown;
  metrics?: PlannerPortMetrics;
}

export interface PlannerContractRepair {
  attempt: number;
  error: "invalid_contract";
  message: string;
  rawTurn: unknown;
}

export type AgentStepStatus =
  | "continue"
  | "completed"
  | "awaiting_confirmation"
  | "awaiting_user_input"
  | "needs_more_observation"
  | "failed";

export interface AgentStepResult {
  status: AgentStepStatus;
  stepId: string;
  reason?: string;
  request?: NeedMoreObservationRequest;
  actionKey?: string;
  metrics?: AgentStepMetrics;
}

export interface AgentStepMetrics {
  modelCalls: number;
  observationRounds: number;
}

type CommandStepResult = AgentStepResult & { after?: PageModel; observedAfter?: boolean };

export interface ActionMemoryItem {
  commandType: SemanticCommandType;
  targetGoal: string;
  targetRef?: string;
  status: PrimitiveResult["status"];
  verificationStatus: VerificationResult["status"];
  failureReason?: string;
  satisfiedCriteria?: string[];
  failedCriteria?: string[];
  valueStateAfter?: unknown;
  valueMatchesExpected?: unknown;
}

function event(
  ports: Pick<AgentRuntimePorts, "sessionId" | "taskId">,
  stepId: string,
  type: AgentEvent["type"],
  payload: Record<string, unknown> = {},
  visibility: EventVisibility = "debug",
  correlationId = stepId
): AgentEvent {
  return {
    id: createEventId(),
    sessionId: ports.sessionId,
    taskId: ports.taskId,
    stepId,
    type,
    timestamp: Date.now(),
    payload,
    visibility,
    correlationId
  };
}

function commandFromDecision(decision: PlannerDecision): SemanticCommand {
  return commandFromSpec(decision, decision.nextCommand);
}

function commandFromSpec(decision: PlannerDecision, spec: PlannerDecision["nextCommand"]): SemanticCommand {
  return {
    id: createEventId(),
    type: spec.type as SemanticCommandType,
    targetGoal: spec.targetGoal ?? "",
    inputs: spec.inputs ?? {},
    expectedOutcome: spec.expectedOutcome ?? decision.expectedOutcome,
    successCriteria: spec.successCriteria?.length ? spec.successCriteria : decision.successCriteria,
    riskHint: spec.riskHint ?? decision.riskHint,
    fallbackHints: []
  };
}

function commandsFromDecision(decision: PlannerDecision): SemanticCommand[] {
  const specs = decision.nextCommands?.length ? decision.nextCommands : [decision.nextCommand];
  return specs.map((spec) => commandFromSpec(decision, spec));
}

function rawTurnDiagnostics(rawTurn: unknown, page: PageModel, observationRound: number): Record<string, unknown> {
  const rawRecord = rawTurn && typeof rawTurn === "object" ? (rawTurn as Record<string, unknown>) : undefined;
  return {
    rawTurnType: rawRecord && typeof rawRecord.type === "string" ? rawRecord.type : typeof rawTurn,
    rawTurnKeys: rawRecord ? Object.keys(rawRecord).slice(0, 30) : [],
    pageIdentity: page.pageIdentity,
    observationRound,
    acceptedShapes: [
      "commandTurn",
      "direct command object with nextCommand",
      "direct semantic command such as NavigateTo or FillField",
      "NeedMoreObservation",
      "AskUser",
      "FinishTask"
    ]
  };
}

function isPlannerPortResult(value: unknown): value is PlannerPortResult {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (!("turn" in record)) return false;
  return record.metrics === undefined || (record.metrics !== null && typeof record.metrics === "object");
}

function plannerPortMetrics(value: unknown): PlannerPortMetrics | undefined {
  if (isPlannerPortResult(value)) return value.metrics;
  if (value && typeof value === "object") {
    const metrics = (value as Record<string, unknown>).plannerMetrics;
    if (metrics && typeof metrics === "object") return metrics as PlannerPortMetrics;
  }
  return undefined;
}

function metricCount(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

function recordPlannerPortMetrics(metrics: AgentStepMetrics, source: unknown, fallbackModelCalls = 1): void {
  const portMetrics = plannerPortMetrics(source);
  metrics.modelCalls += metricCount(portMetrics?.modelCalls, fallbackModelCalls);
  metrics.observationRounds += metricCount(portMetrics?.observationRounds, 0);
}

function unwrapPlannerPortResult(value: unknown, metrics: AgentStepMetrics): unknown {
  recordPlannerPortMetrics(metrics, value);
  return isPlannerPortResult(value) ? value.turn : value;
}

function preferredRolesForCommand(command: SemanticCommand): NeedMoreObservationRequest["preferredRoles"] {
  if (command.type === "FillField") return ["textbox", "searchbox", "combobox"];
  if (command.type === "SelectOption") return ["combobox"];
  if (command.type === "SubmitCurrentForm") return ["button"];
  if (command.type === "ActivateTarget" && command.successCriteria.includes("control_state_matches")) return ["checkbox", "radio", "switch"];
  if (command.type === "ActivateTarget") return ["button", "link", "tab", "menuitem", "listitem"];
  return undefined;
}

function commandInputText(command: SemanticCommand, key: string): string | undefined {
  const value = command.inputs[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizedRuntimeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function requestKey(request: NeedMoreObservationRequest): string {
  return JSON.stringify({
    reason: normalizedRuntimeText(request.reason),
    query: normalizedRuntimeText(request.query ?? ""),
    scope: request.scope,
    expand: [...(request.expand ?? [])].sort(),
    preferredRoles: [...(request.preferredRoles ?? [])].sort(),
    targetTextHints: [...(request.targetTextHints ?? [])].map(normalizedRuntimeText).sort(),
    ambiguousCandidates: [...(request.ambiguousCandidates ?? [])]
      .map((candidate) => [
        normalizedRuntimeText(candidate.semanticId ?? ""),
        normalizedRuntimeText(candidate.label ?? ""),
        normalizedRuntimeText(candidate.role ?? ""),
        normalizedRuntimeText(candidate.regionRef ?? "")
      ].join("|"))
      .sort()
  });
}

function hasEquivalentRequest(requests: NeedMoreObservationRequest[], request: NeedMoreObservationRequest): boolean {
  const key = requestKey(request);
  return requests.some((existing) => requestKey(existing) === key);
}

function partialActivationNeedsObservation(command: SemanticCommand, verification: VerificationResult): boolean {
  if (command.type !== "ActivateTarget" || verification.status !== "partial") return false;
  const failedRecoverableCriterion = verification.failedCriteria.some((criterion) =>
    criterion === "page_changed" || criterion === "menu_expanded" || criterion === "child_target_visible"
  );
  return failedRecoverableCriterion && verification.satisfiedCriteria.includes("target_visible");
}

function candidateTargetHints(details?: BindingFailureDetails): string[] {
  return (details?.candidates ?? []).flatMap((candidate) => [
    candidate.semanticId,
    candidate.label,
    candidate.accessibleName
  ]).filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

function uniqueHints(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const hints: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const key = normalizedRuntimeText(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    hints.push(trimmed);
  }
  return hints;
}

function recoveryObservationRequest(command: SemanticCommand, reason: string, details?: BindingFailureDetails): NeedMoreObservationRequest {
  const ambiguousCandidates = details?.candidates?.length ? details.candidates : undefined;
  const targetHints = uniqueHints([
    command.targetGoal,
    commandInputText(command, "label"),
    commandInputText(command, "targetLabel"),
    commandInputText(command, "name"),
    commandInputText(command, "title"),
    commandInputText(command, "ariaLabel"),
    commandInputText(command, "accessibleName"),
    commandInputText(command, "placeholder"),
    command.type === "FillField" || command.type === "SelectOption" ? undefined : commandInputText(command, "text"),
    command.inputs.semanticId,
    command.inputs.controlId,
    command.inputs.targetRef,
    command.inputs.targetId,
    command.inputs.controlRef,
    ...candidateTargetHints(details)
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0));
  const expand: NeedMoreObservationRequest["expand"] = ["more_candidates", "nearby_text", "form_fields", "validation_feedback"];
  if (command.type === "ActivateTarget") {
    expand.push("hidden_menus", "offscreen_links");
  }
  return {
    reason,
    query: command.targetGoal,
    scope: "full_page",
    expand,
    preferredRoles: preferredRolesForCommand(command),
    targetTextHints: targetHints,
    ambiguousCandidates
  };
}

function isRecoverablePrimitiveFailure(result: PrimitiveResult): boolean {
  if (result.status !== "failed") return false;
  return ["element_not_found", "control_not_found", "target_not_found"].includes(String(result.reason ?? ""));
}

function canVerifyValueFromPrimitive(command: SemanticCommand, result: PrimitiveResult): boolean {
  if (result.status !== "success") return false;
  if (!command.successCriteria.length || command.successCriteria.some((criterion) => criterion !== "control_value_matches")) return false;
  if (command.type === "FillField" || command.type === "SelectOption") {
    return (result.details.primitive === "dom_input" || result.details.primitive === "dom_select_option") && result.details.valueMatchesExpected === true;
  }
  return false;
}

function canVerifyScrollFromPrimitive(command: SemanticCommand, result: PrimitiveResult): boolean {
  if (result.status !== "success" || command.type !== "ScrollRegion") return false;
  if (!command.successCriteria.length || command.successCriteria.some((criterion) => criterion !== "viewport_scrolled")) return false;
  return result.details.primitive === "scroll" && result.details.scrollMoved === true;
}

function canVerifyWaitFromPrimitive(command: SemanticCommand, result: PrimitiveResult): boolean {
  if (result.status !== "success" || command.type !== "WaitForChange") return false;
  if (!command.successCriteria.length || command.successCriteria.some((criterion) => criterion !== "wait_completed")) return false;
  return result.details.primitive === "wait";
}

function canVerifyKeyFromPrimitive(command: SemanticCommand, result: PrimitiveResult): boolean {
  if (result.status !== "success" || command.type !== "PressKey") return false;
  if (!command.successCriteria.length || command.successCriteria.some((criterion) => criterion !== "key_pressed")) return false;
  return result.details.primitive === "key_press" && result.details.key === command.inputs.key;
}

function canVerifyControlStateFromPrimitive(command: SemanticCommand, result: PrimitiveResult): boolean {
  if (result.status !== "success" || command.type !== "ActivateTarget") return false;
  if (!command.successCriteria.length || command.successCriteria.some((criterion) => criterion !== "control_state_matches")) return false;
  const desiredState = command.inputs.desiredChecked;
  if (typeof desiredState !== "boolean") return false;
  if (typeof result.details.checkedStateAfter === "boolean") return result.details.checkedStateAfter === desiredState;
  if (result.details.valueStateAfter === "checked" || result.details.valueStateAfter === "selected") return desiredState;
  if (result.details.valueStateAfter === "unchecked") return !desiredState;
  return false;
}

function canVerifyReadContentFromPrimitive(command: SemanticCommand, result: PrimitiveResult): boolean {
  if (result.status !== "success" || command.type !== "ReadContent") return false;
  if (!command.successCriteria.length || command.successCriteria.some((criterion) => criterion !== "content_read")) return false;
  if (result.details.primitive !== "read_content") return false;
  if (typeof result.details.textLength === "number") return result.details.textLength > 0;
  return typeof result.details.text === "string" && result.details.text.trim().length > 0;
}

function canVerifyFromPrimitiveResult(command: SemanticCommand, result: PrimitiveResult): boolean {
  return (
    canVerifyValueFromPrimitive(command, result) ||
    canVerifyScrollFromPrimitive(command, result) ||
    canVerifyWaitFromPrimitive(command, result) ||
    canVerifyKeyFromPrimitive(command, result) ||
    canVerifyControlStateFromPrimitive(command, result) ||
    canVerifyReadContentFromPrimitive(command, result)
  );
}

function isRecoverableBindingError(error: string): boolean {
  return error === "target_not_found" || error === "target_not_interactable" || error === "needs_more_observation" || error === "ambiguous_target";
}

function plannerErrorReason(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error || "planner_failed");
}

function runtimePortErrorReason(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error || fallback);
}

export class AgentRuntime {
  private readonly ports: AgentRuntimePorts;
  private readonly evidenceManager = new EvidenceManager();
  private readonly observationBudget: ObservationBudget;
  private readonly actionMemory: ActionMemoryItem[];
  private taskFrame: TaskFrame | undefined;
  private taskAttachments: FileAttachmentContext[] = [];
  private conversationHistory: ConversationHistoryItem[] = [];
  private reusablePage: { page: PageModel; candidateLimit: number } | undefined;

  constructor(ports: AgentRuntimePorts) {
    this.ports = ports;
    this.observationBudget = { ...standardObservationBudget, ...ports.observationBudget };
    this.actionMemory = [...(ports.initialActionMemory ?? [])].slice(-20);
  }

  async startTask(taskText: string, context: StartTaskContext = {}): Promise<void> {
    const stepId = createStepId();
    this.taskFrame = interpretTask(taskText);
    this.taskAttachments = sanitizeFileAttachmentContexts(context.attachments);
    this.conversationHistory = [...(context.conversationHistory ?? [])];
    this.reusablePage = undefined;
    const attachments = stripFileArtifactPreviews(this.taskAttachments);
    await this.append(stepId, "TaskStarted", attachments.length > 0 ? { taskText, attachments } : { taskText }, "user");
    await this.append(stepId, "TaskInterpreted", { frame: this.taskFrame });
  }

  async resumeTask(taskText: string): Promise<void> {
    this.taskFrame = interpretTask(taskText);
    this.taskAttachments = [];
    this.reusablePage = undefined;
  }

  async runNextStep(): Promise<AgentStepResult> {
    if (!this.taskFrame) {
      throw new Error("Cannot run an agent step before startTask.");
    }
    this.throwIfAborted();

    const stepId = createStepId();
    const observationRequests: NeedMoreObservationRequest[] = [];
    const metrics: AgentStepMetrics = { modelCalls: 0, observationRounds: 0 };
    const finish = <T extends AgentStepResult>(result: T): T => ({ ...result, metrics: { ...metrics } });

    observationLoop:
    for (let observationRound = 0; observationRound < this.observationBudget.maxObservationRoundsPerStep; observationRound += 1) {
      const observationRequest = observationRequests.at(-1);
      const candidateLimit = this.candidateLimitForRound(observationRound);
      const reusableBefore = this.takeReusablePage(observationRequest, observationRound, candidateLimit);
      const cachedBefore = Boolean(reusableBefore);
      if (!cachedBefore) metrics.observationRounds += 1;
      await this.append(stepId, "ObservationRequested", {
        reason: cachedBefore ? "before_step_reuse" : observationRequest ? "need_more_observation" : "before_step",
        observationRound: observationRound + 1,
        request: observationRequest,
        cached: cachedBefore
      });
      let before: PageModel;
      try {
        before =
          reusableBefore ??
          (await this.ports.observePage(observationRequest, {
            observationRound: observationRound + 1,
            candidateLimit
          }));
      } catch (error) {
        if (this.isAborted()) throw error;
        const reason = runtimePortErrorReason(error, "observe_failed");
        await this.append(stepId, "TaskFailed", { reason, phase: "observe", observationRound: observationRound + 1 }, "user");
        return finish({ status: "failed", stepId, reason });
      }
      this.throwIfAborted();
      await this.append(stepId, "ObservationReceived", {
        pageIdentity: before.pageIdentity,
        controls: before.controls.length,
        observationRound: observationRound + 1,
        candidateLimit,
        request: observationRequest,
        retrieval: before.observation,
        cached: cachedBefore
      });

      const evidence: Evidence[] = this.evidenceManager.fromPageModel(before, stepId, { taskId: this.ports.taskId });
      for (const item of evidence) {
        await this.append(stepId, "EvidenceAdded", { evidenceId: item.id, evidence: item, observationRound: observationRound + 1 });
      }

      const fastPath =
        observationRound === 0 && observationRequests.length === 0
          ? detectFastPath({
              taskText: this.taskFrame.taskText,
              pageUrl: before.pageIdentity.url,
              controls: before.controls,
              forms: before.forms,
              actionMemory: this.actionMemory
            })
          : undefined;
      if (fastPath) {
        const fastCommands = fastPath.commands?.length ? fastPath.commands : [fastPath.command];
        const fastCommand = fastCommands[0];
        const fastPathIsNavigation = fastCommand.type === "NavigateTo";
        const fastPathIsOpenTab = fastCommand.type === "OpenTab";
        const fastPathIsSearch = fastPath.source === "web_search";
        const fastPathIsField = fastCommand.type === "FillField";
        const fastPathIsSelect = fastCommand.type === "SelectOption";
        const fastPathIsStateControl = fastPath.source === "exact_visible_state_control";
        const fastPathIsExpansionControl = fastPath.source === "exact_visible_expansion_control";
        const fastPathIsTabControl = fastPath.source === "visible_tab_control";
        const fastPathIsReadContent = fastPath.source === "explicit_read_content";
        const fastPathIsDismiss = fastPath.source === "visible_dismiss_control";
        const fastPathIsFocusedFieldClear = fastPath.source === "focused_field_clear";
        const fastPathIsFieldClear = fastPath.source === "exact_visible_field_clear";
        const fastPathIsSearchForm = fastPath.source === "exact_visible_search_form";
        const fastPathIsSearchEnter = fastPath.source === "single_search_field_enter";
        const fastPathIsSubmitControl = fastPath.source === "exact_visible_submit_control";
        const fastPathIsFieldEnter = fastPath.source === "exact_visible_field_enter";
        const fastPathIsFocusedEntryEnter = fastPath.source === "focused_text_entry_enter";
        const fastPathIsFocusedEntry = fastPath.source === "focused_text_entry";
        const fastPathIsRefreshControl = fastPath.source === "visible_refresh_control";
        const fastPathIsPagination = fastPath.source === "visible_pagination_control";
        const fastPathIsScroll = fastCommand.type === "ScrollRegion";
        const fastPathIsWait = fastCommand.type === "WaitForChange";
        const fastPathIsBrowserNavigation = fastCommand.type === "BrowserNavigation";
        const fastPathIsKeyPress = fastCommand.type === "PressKey";
        const fastTaskUnderstanding = fastPathIsSearchForm
          ? "Run the page-local search by filling the matched field and submitting the matched search control."
          : fastPathIsSearchEnter
            ? "Run the page-local search by filling the single matched search field and pressing Enter."
          : fastPathIsSubmitControl
            ? "Submit the unique visible save, confirm, submit, or apply control without a planner model call."
          : fastPathIsFieldEnter
            ? "Fill the matched visible field and press Enter without a planner model call."
          : fastPathIsFocusedEntryEnter
            ? "Enter text into the currently focused editable field and press Enter without a planner model call."
          : fastPathIsExpansionControl
            ? "Expand or collapse the unique visible menu, panel, or disclosure whose observed state needs one click."
          : fastPathIsTabControl
            ? "Switch the unique visible tab or segmented control without a planner model call."
          : fastPathIsReadContent
            ? "Read the requested visible page content without a planner model call."
          : fastPathIsPagination
            ? "Activate the unique visible next or previous page control before falling back to viewport scrolling."
          : fastPathIsRefreshControl
            ? "Activate the unique visible refresh, reload, or retry control without a planner model call."
          : fastPathIsSearch
            ? "Open a web search results page directly for the user's query."
            : fastPathIsOpenTab
              ? "Open the explicit URL from the user task in a new tab before planning page-specific actions."
            : fastPathIsNavigation
            ? "Open the explicit URL from the user task before planning page-specific actions."
              : fastPathIsFocusedEntry
                ? "Enter text into the currently focused editable field without a planner model call."
                : fastPathIsDismiss
                  ? "Dismiss the unique visible close, cancel, or dismiss control without a planner model call."
                : fastPathIsFocusedFieldClear
                  ? "Clear the currently focused editable field without a planner model call."
                : fastPathIsFieldClear
                  ? "Clear the unique visible field that the runtime matched without a planner model call."
                : fastPathIsField
                  ? "Fill the unique visible field that the runtime matched without a planner model call."
                  : fastPathIsSelect
                    ? "Select the requested option in the unique visible selector without a planner model call."
                    : fastPathIsStateControl
                      ? "Set the unique visible checkbox or switch to the requested state without a planner model call."
                  : fastPathIsScroll
                    ? "Scroll the page in the requested direction without a planner model call."
                    : fastPathIsWait
                      ? "Wait for the requested duration without a planner model call."
                      : fastPathIsBrowserNavigation
                        ? "Use the browser history/navigation action requested by the user without a planner model call."
                        : fastPathIsKeyPress
                          ? "Press the explicitly requested keyboard key without a planner model call."
                        : "Activate the visible control that the runtime matched without a planner model call.";
        const fastShortPlan = fastPathIsSearchForm
          ? "Fill the search field and submit the page search."
          : fastPathIsSearchEnter
            ? "Fill the search field and press Enter."
          : fastPathIsSubmitControl
            ? "Submit the matched visible control."
          : fastPathIsFieldEnter
            ? "Fill the field and press Enter."
          : fastPathIsFocusedEntryEnter
            ? "Fill the focused field and press Enter."
          : fastPathIsExpansionControl
            ? "Toggle the matched expandable control to the requested state."
          : fastPathIsTabControl
            ? "Select the matched tab or segment."
          : fastPathIsReadContent
            ? "Read the requested page content."
          : fastPathIsPagination
            ? "Activate the pagination control."
          : fastPathIsRefreshControl
            ? "Activate the refresh control."
          : fastPathIsSearch
            ? "Navigate directly to search results."
            : fastPathIsOpenTab
              ? "Open the explicit URL in a new tab."
            : fastPathIsNavigation
            ? "Navigate directly to the explicit URL."
              : fastPathIsFocusedEntry
                ? "Fill the currently focused field."
                : fastPathIsDismiss
                  ? "Dismiss the visible surface."
                : fastPathIsFocusedFieldClear
                  ? "Clear the focused field."
                : fastPathIsFieldClear
                  ? "Clear the matched visible field."
                : fastPathIsField
                  ? "Fill the matched visible field."
                  : fastPathIsSelect
                    ? "Select the matched option."
                    : fastPathIsStateControl
                      ? "Set the matched state control."
                  : fastPathIsScroll
                    ? "Scroll the page."
                    : fastPathIsWait
                    ? "Wait briefly."
                    : fastPathIsBrowserNavigation
                      ? "Run the browser navigation action."
                      : fastPathIsKeyPress
                        ? "Press the requested key."
                      : "Activate the matched visible target.";
        await this.append(stepId, "PlanProduced", {
          plannerSource: "deterministic_fast_path",
          fastPathSource: fastPath.source,
          taskUnderstanding: fastTaskUnderstanding,
          activeSubgoal: fastCommand.targetGoal,
          shortPlan: [fastShortPlan],
          nextCommand: fastCommand,
          nextCommands: fastCommands.length > 1 ? fastCommands : undefined,
          reasoningSummary: fastPath.reasoningSummary
        });

        let currentPage = before;
        let reusablePage: PageModel | undefined = before;
        const actionKey = fastCommands.map(commandActionKey).join(" -> ");
        for (let index = 0; index < fastCommands.length; index += 1) {
          const command = fastCommands[index];
          const result = await this.executeCommand(stepId, command, currentPage, {
            batchIndex: index,
            batchSize: fastCommands.length
          }, metrics);
          if (result.status === "needs_more_observation" && result.request) {
            observationRequests.push(result.request);
            continue observationLoop;
          }
          if (result.status !== "continue") return finish(result);
          currentPage = result.after ?? currentPage;
          reusablePage = result.observedAfter && result.after ? result.after : undefined;
        }
        if (reusablePage) {
          this.reusablePage = { page: reusablePage, candidateLimit: this.observationBudget.initialCandidateLimit };
        }
        return finish({
          status: "continue",
          stepId,
          reason: fastPathIsOpenTab ? "fast_new_tab_navigation" : fastPathIsNavigation ? "fast_url_navigation" : fastPathIsSearchForm ? "fast_search_form" : fastPathIsSearchEnter ? "fast_search_enter" : fastPathIsSubmitControl ? "fast_submit_control" : fastPathIsFieldEnter ? "fast_field_enter" : fastPathIsFocusedEntryEnter ? "fast_focused_text_entry_enter" : fastPathIsFocusedEntry ? "fast_focused_text_entry" : fastPathIsExpansionControl ? "fast_expansion_control" : fastPathIsTabControl ? "fast_tab_control" : fastPathIsReadContent ? "fast_read_content" : fastPathIsDismiss ? "fast_dismiss_control" : fastPathIsFocusedFieldClear ? "fast_focused_field_clear" : fastPathIsFieldClear ? "fast_field_clear" : fastPathIsField ? "fast_field_fill" : fastPathIsSelect ? "fast_select_option" : fastPathIsStateControl ? "fast_control_state" : fastPathIsRefreshControl ? "fast_refresh_control" : fastPathIsPagination ? "fast_pagination_control" : fastPathIsScroll ? "fast_scroll" : fastPathIsWait ? "fast_wait" : fastPathIsBrowserNavigation ? "fast_browser_navigation" : fastPathIsKeyPress ? "fast_key_press" : "fast_control_activation",
          actionKey
        });
      }

      await this.append(stepId, "PlanRequested", {
        activeProfile: this.taskFrame.initialProfile,
        observationRound: observationRound + 1,
        observationRequests
      });
      this.throwIfAborted();
      let rawDecision: unknown;
      try {
        const plannerResult = await this.ports.plan({
          taskFrame: this.taskFrame,
          page: before,
          evidence,
          attachments: this.taskAttachments,
          stepId,
          observationRound: observationRound + 1,
          observationRequests,
          recentActions: this.actionMemory.slice(-8),
          conversationHistory: this.conversationHistory
        });
        rawDecision = unwrapPlannerPortResult(plannerResult, metrics);
      } catch (error) {
        recordPlannerPortMetrics(metrics, error);
        if (this.isAborted()) throw error;
        const reason = plannerErrorReason(error);
        await this.append(stepId, "TaskFailed", { reason, phase: "planner", observationRound: observationRound + 1 }, "user");
        return finish({ status: "failed", stepId, reason });
      }
      this.throwIfAborted();
      let validTurn = validatePlannerTurn(rawDecision);
      let repairedRawDecision: unknown;
      if (!validTurn.ok) {
        const diagnostics = rawTurnDiagnostics(rawDecision, before, observationRound + 1);
        await this.append(stepId, "ModelContractViolation", { message: validTurn.message, rawTurn: rawDecision, ...diagnostics }, "debug");
        await this.append(stepId, "RecoverySuggested", {
          reason: "model_contract_repair",
          message: validTurn.message,
          repairAttempt: 1,
          ...diagnostics
        }, "user");
        await this.append(stepId, "PlanRequested", {
          activeProfile: this.taskFrame.initialProfile,
          observationRound: observationRound + 1,
          observationRequests,
          contractRepair: {
            attempt: 1,
            error: validTurn.error,
            message: validTurn.message
          }
        });
        this.throwIfAborted();
        try {
          const repairedPlannerResult = await this.ports.plan({
            taskFrame: this.taskFrame,
            page: before,
            evidence,
            attachments: this.taskAttachments,
            stepId,
            observationRound: observationRound + 1,
            observationRequests,
            recentActions: this.actionMemory.slice(-8),
            conversationHistory: this.conversationHistory,
            contractRepair: {
              attempt: 1,
              error: validTurn.error,
              message: validTurn.message,
              rawTurn: rawDecision
            }
          });
          repairedRawDecision = unwrapPlannerPortResult(repairedPlannerResult, metrics);
        } catch (error) {
          recordPlannerPortMetrics(metrics, error);
          if (this.isAborted()) throw error;
          const reason = plannerErrorReason(error);
          await this.append(stepId, "TaskFailed", { reason, phase: "planner_contract_repair", observationRound: observationRound + 1 }, "user");
          return finish({ status: "failed", stepId, reason });
        }
        this.throwIfAborted();
        validTurn = validatePlannerTurn(repairedRawDecision);
        if (!validTurn.ok) {
          const repairDiagnostics = rawTurnDiagnostics(repairedRawDecision, before, observationRound + 1);
          await this.append(stepId, "ModelContractViolation", {
            message: validTurn.message,
            rawTurn: repairedRawDecision,
            repairAttempt: 1,
            ...repairDiagnostics
          }, "debug");
          await this.append(stepId, "TaskFailed", { reason: validTurn.error, message: validTurn.message, repairAttempt: 1, ...repairDiagnostics }, "user");
          return finish({ status: "failed", stepId, reason: validTurn.error });
        }
      }

      const turn: PlannerTurn = validTurn.value;
      if (turn.type === "NeedMoreObservation") {
        if (hasEquivalentRequest(observationRequests, turn.request)) {
          await this.append(stepId, "RuntimeSuspended", {
            reason: "repeated_observation_request",
            request: turn.request,
            observationRound: observationRound + 1,
            observationRequests
          }, "user");
          return finish({ status: "awaiting_user_input", stepId, reason: "repeated_observation_request", request: turn.request });
        }
        await this.append(stepId, "RecoverySuggested", {
          reason: "need_more_observation",
          request: turn.request,
          observationRound: observationRound + 1
        });
        observationRequests.push(turn.request);
        continue;
      }

      if (turn.type === "AskUser") {
        await this.append(stepId, "UserConsentRequested", { kind: "ask_user", question: turn.question, options: turn.options, reason: turn.reason }, "user");
        return finish({ status: "awaiting_user_input", stepId, reason: "ask_user" });
      }

      if (turn.type === "FinishTask") {
        await this.append(stepId, "TaskCompleted", { summary: turn.summary, evidenceRefs: turn.evidenceRefs }, "user");
        return finish({ status: "completed", stepId, reason: "planner_finish" });
      }

      const decision = turn.decision;
      await this.append(stepId, "PlanProduced", {
        taskUnderstanding: decision.taskUnderstanding,
        activeSubgoal: decision.activeSubgoal,
        shortPlan: decision.shortPlan,
        nextCommand: decision.nextCommand,
        nextCommands: decision.nextCommands,
        reasoningSummary: decision.reasoningSummary
      });

      const commands = commandsFromDecision(decision).slice(0, 3);
      const repeatedPartialRequest =
        observationRequests.length === 0 && commands[0]
          ? this.recoveryRequestForRepeatedPartial(commands[0])
          : undefined;
      if (repeatedPartialRequest) {
        if (hasEquivalentRequest(observationRequests, repeatedPartialRequest)) {
          await this.append(stepId, "RuntimeSuspended", {
            reason: "repeated_partial_command",
            request: repeatedPartialRequest,
            observationRound: observationRound + 1,
            observationRequests
          }, "user");
          return finish({ status: "awaiting_user_input", stepId, reason: "repeated_partial_command", request: repeatedPartialRequest });
        }
        await this.append(stepId, "RecoverySuggested", {
          reason: "repeated_partial_command_reobserve",
          request: repeatedPartialRequest,
          command: commands[0],
          observationRound: observationRound + 1
        }, "user");
        observationRequests.push(repeatedPartialRequest);
        continue;
      }
      let currentPage: PageModel = before;
      let reusablePage: PageModel | undefined = before;
      const actionKey = commands.map(commandActionKey).join(" -> ");
      for (let index = 0; index < commands.length; index += 1) {
        this.throwIfAborted();
        const command = commands[index];
        const result = await this.executeCommand(stepId, command, currentPage, {
          batchIndex: index,
          batchSize: commands.length
        }, metrics);
        if (result.status === "needs_more_observation" && result.request) {
          if (hasEquivalentRequest(observationRequests, result.request)) {
            await this.append(stepId, "RuntimeSuspended", {
              reason: "repeated_recovery_observation_request",
              request: result.request,
              command,
              bindingReason: result.reason,
              observationRound: observationRound + 1,
              observationRequests
            }, "user");
            return finish({
              status: "awaiting_user_input",
              stepId,
              reason: "repeated_recovery_observation_request",
              request: result.request,
              actionKey
            });
          }
          observationRequests.push(result.request);
          continue observationLoop;
        }
        if (result.status !== "continue") return finish(result);
        currentPage = result.after ?? currentPage;
        reusablePage = result.observedAfter && result.after ? result.after : undefined;
      }

      if (reusablePage) {
        this.reusablePage = { page: reusablePage, candidateLimit: this.observationBudget.initialCandidateLimit };
      }
      return finish({ status: "continue", stepId, reason: commands.length > 1 ? "batch_executed" : "success", actionKey });
    }

    await this.append(stepId, "RuntimeSuspended", { reason: "max_observation_rounds_per_step", observationRequests }, "user");
    return finish({
      status: "awaiting_user_input",
      stepId,
      reason: "max_observation_rounds_per_step",
      request: observationRequests.at(-1)
    });
  }

  private async executeCommand(
    stepId: string,
    command: SemanticCommand,
    before: PageModel,
    batch: { batchIndex: number; batchSize: number },
    metrics: AgentStepMetrics
  ): Promise<CommandStepResult> {
    this.throwIfAborted();
    const bound = bindCommand(command, before);
    if (!bound.ok) {
      if (isRecoverableBindingError(bound.error)) {
        const details = bound.details as BindingFailureDetails | undefined;
        const request = recoveryObservationRequest(command, bound.error, details);
        await this.append(stepId, "RecoverySuggested", {
          reason: "bind_failed_replan",
          bindingError: bound.error,
          message: bound.message,
          request,
          details,
          commandId: command.id,
          batch
        }, "user");
        return { status: "needs_more_observation", stepId, reason: bound.error, request, actionKey: commandActionKey(command) };
      }
      await this.append(stepId, "TaskFailed", { reason: bound.error, message: bound.message, command }, "user");
      return { status: "failed", stepId, reason: bound.error, actionKey: commandActionKey(command) };
    }

    await this.appendBoundCommand(stepId, command, bound.value, undefined, batch);
    this.throwIfAborted();

    const policyContext = {
      safetyMode: this.ports.safetyMode ?? "balanced",
      consentScope: this.ports.getConsentScope?.(),
      origin: before.pageIdentity.origin,
      pageIdentity: before.pageIdentity.title
    };
    const policy = evaluatePolicy(command, policyContext);
    await this.append(stepId, "PolicyEvaluated", { decision: policy, commandId: command.id, batch });
    this.throwIfAborted();

    if (policy.status === "ask_user") {
      await this.append(
        stepId,
        "UserConsentRequested",
        { decision: policy, policyContext: { origin: policyContext.origin, pageIdentity: policyContext.pageIdentity }, commandId: command.id, command, boundCommand: bound.value, batch },
        "user"
      );
      return { status: "awaiting_confirmation", stepId, reason: "policy_ask_user", actionKey: commandActionKey(command) };
    }

    if (policy.status === "block" || policy.status === "hard_block") {
      await this.append(stepId, "TaskFailed", { reason: policy.status, policy, commandId: command.id }, "user");
      return { status: "failed", stepId, reason: policy.status, actionKey: commandActionKey(command) };
    }

    await this.append(stepId, "CommandIssued", { command, primitive: bound.value.primitive, batch }, "debug");
    this.throwIfAborted();
    let primitiveResult: PrimitiveResult;
    try {
      primitiveResult = await this.ports.execute(bound.value.primitive);
    } catch (error) {
      if (this.isAborted()) throw error;
      const reason = runtimePortErrorReason(error, "primitive_execute_failed");
      primitiveResult = {
        status: "failed",
        reason,
        details: { phase: "execute", primitive: bound.value.primitive }
      };
      await this.append(stepId, "CommandResultReceived", { commandId: command.id, result: primitiveResult }, "user");
      await this.append(stepId, "TaskFailed", { reason, phase: "execute", commandId: command.id }, "user");
      return { status: "failed", stepId, reason, actionKey: commandActionKey(command) };
    }
    this.throwIfAborted();
    await this.append(stepId, "CommandResultReceived", { commandId: command.id, result: primitiveResult }, primitiveResult.status === "failed" ? "user" : "debug");

    if (canVerifyFromPrimitiveResult(command, primitiveResult)) {
      const verification = verifyOutcome({ command, before, after: before, primitiveResult });
      await this.appendVerification(stepId, command.id, verification);
      this.rememberAction(command, bound.value, primitiveResult, verification);
      return {
        status: "continue",
        stepId,
        reason: "primitive_value_confirmed",
        actionKey: commandActionKey(command),
        observedAfter: false
      };
    }

    metrics.observationRounds += 1;
    await this.append(stepId, "ObservationRequested", { reason: "after_command" });
    this.throwIfAborted();
    const afterCandidateLimit = this.observationBudget.initialCandidateLimit;
    let after: PageModel;
    try {
      after = await this.ports.observePage(undefined, {
        observationRound: 1,
        candidateLimit: afterCandidateLimit
      });
    } catch (error) {
      if (this.isAborted()) throw error;
      const reason = runtimePortErrorReason(error, "after_command_observe_failed");
      await this.append(stepId, "TaskFailed", { reason, phase: "after_command_observe", commandId: command.id }, "user");
      return { status: "failed", stepId, reason, actionKey: commandActionKey(command) };
    }
    this.throwIfAborted();
    await this.append(stepId, "ObservationReceived", {
      pageIdentity: after.pageIdentity,
      controls: after.controls.length,
      candidateLimit: afterCandidateLimit,
      retrieval: after.observation
    });

    let verification = verifyOutcome({ command, before, after, primitiveResult });
    if (verification.status === "failed" && isRecoverablePrimitiveFailure(primitiveResult)) {
      const recoveryRequest = recoveryObservationRequest(command, verification.failureReason ?? primitiveResult.reason ?? "primitive_failed");
      await this.append(stepId, "RecoverySuggested", {
        reason: "retry_after_reobserve",
        failureReason: verification.failureReason,
        recoveryHints: verification.recoveryHints,
        request: recoveryRequest,
        commandId: command.id
      }, "user");

      const retryCandidateLimit = this.candidateLimitForRound(1);
      metrics.observationRounds += 1;
      await this.append(stepId, "ObservationRequested", {
        reason: "recovery_reobserve",
        observationRound: 2,
        request: recoveryRequest
      });
      this.throwIfAborted();
      try {
        before = await this.ports.observePage(recoveryRequest, {
          observationRound: 2,
          candidateLimit: retryCandidateLimit
        });
      } catch (error) {
        if (this.isAborted()) throw error;
        const reason = runtimePortErrorReason(error, "recovery_observe_failed");
        await this.append(stepId, "TaskFailed", { reason, phase: "recovery_observe", commandId: command.id }, "user");
        return { status: "failed", stepId, reason, actionKey: commandActionKey(command) };
      }
      this.throwIfAborted();
      await this.append(stepId, "ObservationReceived", {
        pageIdentity: before.pageIdentity,
        controls: before.controls.length,
        observationRound: 2,
        candidateLimit: retryCandidateLimit,
        request: recoveryRequest,
        retrieval: before.observation
      });

      const rebound = bindCommand(command, before);
      if (rebound.ok) {
        await this.appendBoundCommand(stepId, command, rebound.value, 1, batch);
        this.throwIfAborted();
        await this.append(stepId, "CommandIssued", { command, primitive: rebound.value.primitive, retry: 1, batch }, "debug");
        this.throwIfAborted();
        try {
          primitiveResult = await this.ports.execute(rebound.value.primitive);
        } catch (error) {
          if (this.isAborted()) throw error;
          const reason = runtimePortErrorReason(error, "primitive_retry_execute_failed");
          primitiveResult = {
            status: "failed",
            reason,
            details: { phase: "execute_retry", primitive: rebound.value.primitive }
          };
          await this.append(stepId, "CommandResultReceived", { commandId: command.id, result: primitiveResult, retry: 1 }, "user");
          await this.append(stepId, "TaskFailed", { reason, phase: "execute_retry", commandId: command.id }, "user");
          return { status: "failed", stepId, reason, actionKey: commandActionKey(command) };
        }
        this.throwIfAborted();
        await this.append(
          stepId,
          "CommandResultReceived",
          { commandId: command.id, result: primitiveResult, retry: 1 },
          primitiveResult.status === "failed" ? "user" : "debug"
        );
        metrics.observationRounds += 1;
        await this.append(stepId, "ObservationRequested", { reason: "after_retry", retry: 1 });
        this.throwIfAborted();
        try {
          after = await this.ports.observePage(undefined, {
            observationRound: 3,
            candidateLimit: afterCandidateLimit
          });
        } catch (error) {
          if (this.isAborted()) throw error;
          const reason = runtimePortErrorReason(error, "after_retry_observe_failed");
          await this.append(stepId, "TaskFailed", { reason, phase: "after_retry_observe", commandId: command.id }, "user");
          return { status: "failed", stepId, reason, actionKey: commandActionKey(command) };
        }
        this.throwIfAborted();
        await this.append(stepId, "ObservationReceived", {
          pageIdentity: after.pageIdentity,
          controls: after.controls.length,
          observationRound: 3,
          candidateLimit: afterCandidateLimit,
          retrieval: after.observation,
          retry: 1
        });
        verification = verifyOutcome({ command, before, after, primitiveResult });
      } else {
        await this.append(stepId, "RecoverySuggested", {
          reason: "retry_rebind_failed",
          bindingError: rebound.error,
          message: rebound.message,
          commandId: command.id
        }, "user");
      }
    }

    await this.appendVerification(stepId, command.id, verification);
    this.rememberAction(command, bound.value, primitiveResult, verification);
    if (partialActivationNeedsObservation(command, verification)) {
      const request = recoveryObservationRequest(command, "partial_activation_needs_menu_discovery");
      await this.append(stepId, "RecoverySuggested", {
        reason: "partial_activation_needs_menu_discovery",
        request,
        commandId: command.id,
        satisfiedCriteria: verification.satisfiedCriteria,
        failedCriteria: verification.failedCriteria
      }, "user");
      return { status: "needs_more_observation", stepId, reason: "partial_activation_needs_menu_discovery", request, actionKey: commandActionKey(command) };
    }
    if (verification.status === "failed") {
      await this.append(stepId, "TaskFailed", {
        reason: verification.failureReason ?? "verification_failed",
        commandId: command.id,
        failedCriteria: verification.failedCriteria,
        recoveryHints: verification.recoveryHints
      }, "user");
      return { status: "failed", stepId, reason: verification.failureReason ?? "verification_failed", actionKey: commandActionKey(command) };
    }
    return { status: "continue", stepId, reason: verification.status, after, observedAfter: true, actionKey: commandActionKey(command) };
  }

  private isAborted(): boolean {
    return this.ports.abortSignal?.aborted === true;
  }

  private throwIfAborted(): void {
    if (this.isAborted()) throw new Error("task_stopped");
  }

  private candidateLimitForRound(roundIndex: number): number {
    if (roundIndex <= 0) return this.observationBudget.initialCandidateLimit;
    if (roundIndex === 1) return this.observationBudget.expandedCandidateLimit;
    return this.observationBudget.hardCandidateLimit;
  }

  private takeReusablePage(request: NeedMoreObservationRequest | undefined, roundIndex: number, candidateLimit: number): PageModel | undefined {
    if (roundIndex !== 0 || request || !this.reusablePage || this.reusablePage.candidateLimit < candidateLimit) return undefined;
    const page = this.reusablePage.page;
    this.reusablePage = undefined;
    return page;
  }

  private async append(
    stepId: string,
    type: AgentEvent["type"],
    payload: Record<string, unknown> = {},
    visibility: EventVisibility = "debug"
  ): Promise<void> {
    await this.ports.appendEvent(event(this.ports, stepId, type, payload, visibility));
  }

  private async appendBoundCommand(
    stepId: string,
    command: SemanticCommand,
    bound: BoundCommand,
    retry?: number,
    batch?: { batchIndex: number; batchSize: number }
  ): Promise<void> {
    await this.append(stepId, "CommandBound", {
      commandId: command.id,
      targetRef: bound.targetRef,
      primitive: bound.primitive,
      confidence: bound.confidence,
      alternatives: bound.alternatives,
      retry,
      batch
    });
  }

  private async appendVerification(stepId: string, commandId: string, verification: VerificationResult): Promise<void> {
    await this.append(stepId, "VerificationProduced", {
      commandId,
      status: verification.status,
      confidence: verification.confidence,
      satisfiedCriteria: verification.satisfiedCriteria,
      failedCriteria: verification.failedCriteria,
      failureReason: verification.failureReason,
      recoveryHints: verification.recoveryHints
    });
  }

  private rememberAction(command: SemanticCommand, bound: BoundCommand, result: PrimitiveResult, verification: VerificationResult): void {
    this.actionMemory.push({
      commandType: command.type,
      targetGoal: command.targetGoal,
      targetRef: bound.targetRef,
      status: result.status,
      verificationStatus: verification.status,
      failureReason: verification.failureReason,
      satisfiedCriteria: verification.satisfiedCriteria,
      failedCriteria: verification.failedCriteria,
      valueStateAfter: result.details.valueStateAfter,
      valueMatchesExpected: result.details.valueMatchesExpected
    });
    if (this.actionMemory.length > 20) this.actionMemory.splice(0, this.actionMemory.length - 20);
  }

  private recoveryRequestForRepeatedPartial(command: SemanticCommand): NeedMoreObservationRequest | undefined {
    if (command.type !== "ActivateTarget") return undefined;
    const targetGoal = normalizedRuntimeText(command.targetGoal);
    if (!targetGoal) return undefined;
    const recentPartial = this.actionMemory.slice(-6).find((item) => {
      return (
        item.commandType === command.type &&
        item.verificationStatus === "partial" &&
        normalizedRuntimeText(item.targetGoal) === targetGoal &&
        item.failedCriteria?.some((criterion) => criterion === "page_changed" || criterion === "menu_expanded" || criterion === "child_target_visible") &&
        item.satisfiedCriteria?.includes("target_visible")
      );
    });
    return recentPartial ? recoveryObservationRequest(command, "repeated_partial_activation") : undefined;
  }
}
