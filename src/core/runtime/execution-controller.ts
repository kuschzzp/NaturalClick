import type { AgentEvent } from "../events/events";
import type { AgentStepResult, StartTaskContext } from "./agent-runtime";
import type { RuntimeSettings, RuntimeSettingsInput } from "./execution-budget";
import { limitStatus, resolveRuntimeSettings } from "./execution-budget";
import type { RestoredExecutionCounters } from "./execution-recovery";
import { createEventId, createStepId } from "../../shared/ids";

export interface ExecutionRuntime {
  startTask(taskText: string, context?: StartTaskContext): Promise<void>;
  resumeTask?(taskText: string): Promise<void>;
  runNextStep(): Promise<AgentStepResult>;
}

export interface StopOptions {
  eventAlreadyAppended?: boolean;
}

export interface StopTaskOptions extends StopOptions {
  reason?: string;
}

export type ExecutionStatus = "running" | "completed" | "awaiting_confirmation" | "awaiting_user_input" | "failed" | "stopped";

export interface ExecutionControllerPorts {
  sessionId: string;
  taskId: string;
  runtime: ExecutionRuntime;
  appendEvent(event: AgentEvent): Promise<void>;
  settings?: RuntimeSettingsInput;
  now?: () => number;
}

export interface ExecutionControllerResult {
  status: ExecutionStatus;
  reason?: string;
  stepsRun: number;
}

function event(
  sessionId: string,
  taskId: string,
  type: AgentEvent["type"],
  payload: Record<string, unknown> = {},
  visibility: AgentEvent["visibility"] = "debug"
): AgentEvent {
  const stepId = createStepId();
  return {
    id: createEventId(),
    sessionId,
    taskId,
    stepId,
    type,
    timestamp: Date.now(),
    payload,
    visibility,
    correlationId: stepId
  };
}

export class ExecutionController {
  readonly settings: RuntimeSettings;
  private readonly ports: ExecutionControllerPorts;
  private readonly now: () => number;
  private stopped = false;
  private startedAt = 0;
  private stepCount = 0;
  private modelCallCount = 0;
  private observationRoundCount = 0;
  private consecutiveFailures = 0;
  private sameCommandRetries = 0;
  private lastActionKey: string | undefined;
  private stopReason = "user_requested";
  private stopEventAppended = false;

  constructor(ports: ExecutionControllerPorts) {
    this.ports = ports;
    this.settings = resolveRuntimeSettings(ports.settings);
    this.now = ports.now ?? (() => Date.now());
  }

  private resetCounters(restored?: RestoredExecutionCounters): void {
    this.startedAt = restored ? this.now() - restored.activeElapsedMs : this.now();
    this.stopped = false;
    this.stepCount = restored?.stepCount ?? 0;
    this.modelCallCount = restored?.modelCallCount ?? 0;
    this.observationRoundCount = restored?.observationRoundCount ?? 0;
    this.consecutiveFailures = restored?.consecutiveFailures ?? 0;
    this.sameCommandRetries = restored?.sameCommandRetries ?? 0;
    this.lastActionKey = restored?.lastActionKey;
    this.stopReason = "user_requested";
    this.stopEventAppended = false;
  }

  async startTask(taskText: string, context?: StartTaskContext): Promise<ExecutionControllerResult> {
    this.resetCounters();
    await this.ports.runtime.startTask(taskText, context);
    return this.runUntilPaused();
  }

  async resumeTask(
    taskText: string,
    payload: Record<string, unknown> = {},
    restoredCounters?: RestoredExecutionCounters
  ): Promise<ExecutionControllerResult> {
    if (!this.ports.runtime.resumeTask) {
      throw new Error("runtime_resume_unsupported");
    }
    this.resetCounters(restoredCounters);
    await this.ports.runtime.resumeTask(taskText);
    await this.append("RuntimeResumed", { reason: "user_requested", ...payload }, "user");
    return this.runUntilPaused();
  }

  async continueTask(payload: Record<string, unknown> = {}): Promise<ExecutionControllerResult> {
    this.stopped = false;
    this.stopReason = "user_requested";
    this.stopEventAppended = false;
    await this.append("RuntimeResumed", { reason: "user_consent_resolved", ...payload }, "user");
    return this.runUntilPaused();
  }

  stop(reason = "user_requested", options: StopOptions = {}): void {
    this.stopped = true;
    this.stopReason = reason;
    this.stopEventAppended = options.eventAlreadyAppended === true;
  }

  stopTask(options: StopTaskOptions = {}): void {
    this.stop(options.reason ?? "user_requested", options);
  }

  private async runUntilPaused(): Promise<ExecutionControllerResult> {
    while (true) {
      if (this.stopped) {
        await this.appendStopEventIfNeeded();
        return { status: "stopped", reason: this.stopReason, stepsRun: this.stepCount };
      }

      const limit = limitStatus(
        {
          stepCount: this.stepCount,
          modelCallCount: this.modelCallCount,
          observationRoundCount: this.observationRoundCount,
          consecutiveFailures: this.consecutiveFailures,
          sameCommandRetries: this.sameCommandRetries,
          startedAt: this.startedAt,
          now: this.now()
        },
        this.settings
      );
      if (limit.reached) {
        await this.append(
          "RuntimeSuspended",
          {
            reason: limit.reason,
            action: this.settings.limitReachedAction,
            lastActionKey: this.lastActionKey,
            counters: {
              stepCount: this.stepCount,
              modelCallCount: this.modelCallCount,
              observationRoundCount: this.observationRoundCount,
              consecutiveFailures: this.consecutiveFailures,
              sameCommandRetries: this.sameCommandRetries
            }
          },
          "user"
        );
        return { status: "awaiting_user_input", reason: limit.reason, stepsRun: this.stepCount };
      }

      let result: AgentStepResult;
      try {
        result = await this.ports.runtime.runNextStep();
      } catch (error) {
        if (this.stopped) {
          await this.appendStopEventIfNeeded();
          return { status: "stopped", reason: this.stopReason, stepsRun: this.stepCount };
        }
        throw error;
      }
      this.stepCount += 1;
      this.modelCallCount += result.metrics?.modelCalls ?? 1;
      this.observationRoundCount += result.metrics?.observationRounds ?? (result.status === "needs_more_observation" ? 1 : 0);
      this.recordActionKey(result.actionKey);
      if (this.stopped) {
        await this.appendStopEventIfNeeded();
        return { status: "stopped", reason: this.stopReason, stepsRun: this.stepCount };
      }

      if (result.status === "continue") {
        this.consecutiveFailures = 0;
        continue;
      }

      if (result.status === "failed") {
        this.consecutiveFailures += 1;
        return { status: "failed", reason: result.reason, stepsRun: this.stepCount };
      }

      if (result.status === "completed") {
        return { status: "completed", reason: result.reason, stepsRun: this.stepCount };
      }

      if (result.status === "awaiting_confirmation") {
        return { status: "awaiting_confirmation", reason: result.reason, stepsRun: this.stepCount };
      }

      if (result.status === "awaiting_user_input" || result.status === "needs_more_observation") {
        return { status: "awaiting_user_input", reason: result.reason, stepsRun: this.stepCount };
      }
    }
  }

  private async append(type: AgentEvent["type"], payload: Record<string, unknown>, visibility: AgentEvent["visibility"]): Promise<void> {
    await this.ports.appendEvent(event(this.ports.sessionId, this.ports.taskId, type, payload, visibility));
  }

  private recordActionKey(actionKey?: string): void {
    if (!actionKey) return;
    if (this.lastActionKey === actionKey) {
      this.sameCommandRetries += 1;
      return;
    }
    this.lastActionKey = actionKey;
    this.sameCommandRetries = 0;
  }

  private async appendStopEventIfNeeded(): Promise<void> {
    if (this.stopEventAppended) return;
    await this.append("TaskStopped", { reason: this.stopReason }, "user");
    this.stopEventAppended = true;
  }
}
