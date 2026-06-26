import type { BoundCommand, BrowserPrimitive, PrimitiveResult, SemanticCommand, SemanticCommandType } from "../commands/commands";
import { bindCommand } from "../commands/binder";
import { EvidenceManager } from "../evidence/manager";
import type { AgentEvent, EventVisibility } from "../events/events";
import type { PlannerDecision } from "../model/contracts";
import { validatePlannerDecision } from "../model/contracts";
import type { PageModel } from "../observation/page-model";
import { evaluatePolicy, type SafetyMode } from "../policy/policy";
import { verifyOutcome, type VerificationResult } from "../verification/verifier";
import { interpretTask, type TaskFrame } from "./task-interpreter";
import { createEventId, createStepId } from "../../shared/ids";

export interface AgentRuntimePorts {
  sessionId: string;
  taskId: string;
  safetyMode?: SafetyMode;
  observePage(): Promise<PageModel>;
  plan(input: PlannerInput): Promise<PlannerDecision>;
  execute(primitive: BrowserPrimitive): Promise<PrimitiveResult>;
  appendEvent(event: AgentEvent): Promise<void>;
}

export interface PlannerInput {
  taskFrame: TaskFrame;
  page: PageModel;
  evidence: unknown[];
  stepId: string;
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
  return {
    id: createEventId(),
    type: decision.nextCommand.type as SemanticCommandType,
    targetGoal: decision.nextCommand.targetGoal ?? "",
    inputs: decision.nextCommand.inputs ?? {},
    expectedOutcome: decision.expectedOutcome,
    successCriteria: decision.successCriteria,
    riskHint: decision.riskHint,
    fallbackHints: []
  };
}

export class AgentRuntime {
  private readonly ports: AgentRuntimePorts;
  private readonly evidenceManager = new EvidenceManager();
  private taskFrame: TaskFrame | undefined;

  constructor(ports: AgentRuntimePorts) {
    this.ports = ports;
  }

  async startTask(taskText: string): Promise<void> {
    const stepId = createStepId();
    this.taskFrame = interpretTask(taskText);
    await this.append(stepId, "TaskStarted", { taskText }, "user");
    await this.append(stepId, "TaskInterpreted", { frame: this.taskFrame });
  }

  async runNextStep(): Promise<void> {
    if (!this.taskFrame) {
      throw new Error("Cannot run an agent step before startTask.");
    }

    const stepId = createStepId();
    await this.append(stepId, "ObservationRequested", { reason: "before_step" });
    const before = await this.ports.observePage();
    await this.append(stepId, "ObservationReceived", { pageIdentity: before.pageIdentity, controls: before.controls.length });

    const evidence = this.evidenceManager.fromPageModel(before, stepId, { taskId: this.ports.taskId });
    for (const item of evidence) {
      await this.append(stepId, "EvidenceAdded", { evidenceId: item.id, evidence: item });
    }

    await this.append(stepId, "PlanRequested", { activeProfile: this.taskFrame.initialProfile });
    const rawDecision = await this.ports.plan({ taskFrame: this.taskFrame, page: before, evidence, stepId });
    const validDecision = validatePlannerDecision(rawDecision);
    if (!validDecision.ok) {
      await this.append(stepId, "ModelContractViolation", { message: validDecision.message }, "debug");
      await this.append(stepId, "TaskFailed", { reason: validDecision.error, message: validDecision.message }, "user");
      return;
    }

    const decision = validDecision.value;
    await this.append(stepId, "PlanProduced", {
      taskUnderstanding: decision.taskUnderstanding,
      activeSubgoal: decision.activeSubgoal,
      shortPlan: decision.shortPlan,
      nextCommand: decision.nextCommand,
      reasoningSummary: decision.reasoningSummary
    });

    const command = commandFromDecision(decision);
    const bound = bindCommand(command, before);
    if (!bound.ok) {
      await this.append(stepId, "TaskFailed", { reason: bound.error, message: bound.message, command }, "user");
      return;
    }

    await this.appendBoundCommand(stepId, command, bound.value);

    const policy = evaluatePolicy(command, {
      safetyMode: this.ports.safetyMode ?? "balanced",
      origin: before.pageIdentity.origin,
      pageIdentity: before.pageIdentity.title
    });
    await this.append(stepId, "PolicyEvaluated", { decision: policy, commandId: command.id });

    if (policy.status === "ask_user") {
      await this.append(stepId, "UserConsentRequested", { decision: policy, commandId: command.id }, "user");
      return;
    }

    if (policy.status === "block" || policy.status === "hard_block") {
      await this.append(stepId, "TaskFailed", { reason: policy.status, policy, commandId: command.id }, "user");
      return;
    }

    await this.append(stepId, "CommandIssued", { command, primitive: bound.value.primitive }, "debug");
    const primitiveResult = await this.ports.execute(bound.value.primitive);
    await this.append(stepId, "CommandResultReceived", { commandId: command.id, result: primitiveResult });

    await this.append(stepId, "ObservationRequested", { reason: "after_command" });
    const after = await this.ports.observePage();
    await this.append(stepId, "ObservationReceived", { pageIdentity: after.pageIdentity, controls: after.controls.length });

    const verification = verifyOutcome({ command, before, after, primitiveResult });
    await this.appendVerification(stepId, command.id, verification);
  }

  private async append(
    stepId: string,
    type: AgentEvent["type"],
    payload: Record<string, unknown> = {},
    visibility: EventVisibility = "debug"
  ): Promise<void> {
    await this.ports.appendEvent(event(this.ports, stepId, type, payload, visibility));
  }

  private async appendBoundCommand(stepId: string, command: SemanticCommand, bound: BoundCommand): Promise<void> {
    await this.append(stepId, "CommandBound", {
      commandId: command.id,
      targetRef: bound.targetRef,
      primitive: bound.primitive,
      confidence: bound.confidence,
      alternatives: bound.alternatives
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
}
