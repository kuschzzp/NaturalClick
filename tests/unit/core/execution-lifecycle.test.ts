import { describe, expect, it } from "vitest";
import type { AgentEvent } from "../../../src/core/events/events";
import type { AgentStepResult } from "../../../src/core/runtime/agent-runtime";
import { applyContinuationBudgetMultiplier, limitStatus, resolveRuntimeSettings } from "../../../src/core/runtime/execution-budget";
import { ExecutionController } from "../../../src/core/runtime/execution-controller";
import { nextContinuationBudgetMultiplier, restoreExecutionCounters } from "../../../src/core/runtime/execution-recovery";
import { createEventId } from "../../../src/shared/ids";

function event(type: AgentEvent["type"], stepId: string, timestamp: number, payload: Record<string, unknown> = {}): AgentEvent {
  return {
    id: createEventId(),
    sessionId: "session-1",
    taskId: "task-1",
    stepId,
    type,
    timestamp,
    payload,
    visibility: "debug",
    correlationId: stepId
  };
}

function runtime(results: AgentStepResult[]) {
  let index = 0;
  return {
    startTask: async () => {},
    resumeTask: async () => {},
    runNextStep: async () => results[index++] ?? { status: "completed" as const, stepId: `step-${index}`, reason: "done" }
  };
}

describe("execution budget", () => {
  it("uses standard defaults", () => {
    const settings = resolveRuntimeSettings();

    expect(settings.executionPreset).toBe("standard");
    expect(settings.execution.maxStepsPerTask).toBe(8);
    expect(settings.execution.maxTaskDurationMs).toBe(120000);
    expect(settings.execution.maxModelCallsPerTask).toBe(12);
    expect(settings.observation.maxObservationRoundsPerStep).toBe(6);
    expect(settings.observation.initialCandidateLimit).toBe(120);
    expect(settings.observation.expandedCandidateLimit).toBe(320);
    expect(settings.observation.hardCandidateLimit).toBe(600);
    expect(settings.observation.maxObservationTokensPerStep).toBe(36000);
    expect(settings.streaming.runtimeEvents).toBe(true);
    expect(settings.streaming.assistantReplyTokens).toBe(true);
    expect(settings.streaming.showPlannerRawStream).toBe(true);
  });

  it("merges custom budget overrides", () => {
    const settings = resolveRuntimeSettings({
      executionPreset: "custom",
      executionBudget: { maxStepsPerTask: 20 },
      observationBudget: { hardCandidateLimit: 900 },
      streaming: { showPlannerRawStream: true }
    });

    expect(settings.executionPreset).toBe("custom");
    expect(settings.execution.maxStepsPerTask).toBe(20);
    expect(settings.execution.maxModelCallsPerTask).toBe(12);
    expect(settings.observation.hardCandidateLimit).toBe(900);
    expect(settings.observation.maxObservationRoundsPerStep).toBe(6);
    expect(settings.streaming.showPlannerRawStream).toBe(true);
  });

  it("reports step budget exhaustion", () => {
    const settings = resolveRuntimeSettings({ executionBudget: { maxStepsPerTask: 2 } });

    expect(
      limitStatus(
        {
          stepCount: 2,
          modelCallCount: 0,
          consecutiveFailures: 0,
          sameCommandRetries: 0,
          observationRoundCount: 0,
          startedAt: Date.now()
        },
        settings
      )
    ).toEqual({ reached: true, reason: "max_steps" });
  });

  it("reports task observation budget exhaustion", () => {
    const settings = resolveRuntimeSettings({ observationBudget: { maxObservationRoundsPerTask: 3 } });

    expect(
      limitStatus(
        {
          stepCount: 1,
          modelCallCount: 1,
          consecutiveFailures: 0,
          sameCommandRetries: 0,
          observationRoundCount: 3,
          startedAt: Date.now()
        },
        settings
      )
    ).toEqual({ reached: true, reason: "max_observation_rounds" });
  });

  it("only expands continuable resource limits for a resumed task", () => {
    const settings = applyContinuationBudgetMultiplier(
      resolveRuntimeSettings({
        executionBudget: {
          maxStepsPerTask: 3,
          maxTaskDurationMs: 900,
          maxModelCallsPerTask: 5,
          maxConsecutiveFailures: 2,
          maxSameCommandRetries: 1
        },
        observationBudget: {
          maxObservationRoundsPerTask: 4,
          maxObservationRoundsPerStep: 6,
          maxObservationExpansionRetries: 3
        }
      }),
      2
    );

    expect(settings.execution.maxStepsPerTask).toBe(6);
    expect(settings.execution.maxTaskDurationMs).toBe(1800);
    expect(settings.execution.maxModelCallsPerTask).toBe(10);
    expect(settings.observation.maxObservationRoundsPerTask).toBe(8);
    expect(settings.execution.maxConsecutiveFailures).toBe(2);
    expect(settings.execution.maxSameCommandRetries).toBe(1);
    expect(settings.observation.maxObservationRoundsPerStep).toBe(6);
    expect(settings.observation.maxObservationExpansionRetries).toBe(3);
  });

  it("continues a suspended task with its expanded budget", async () => {
    const events: AgentEvent[] = [];
    const controller = new ExecutionController({
      sessionId: "session-1",
      taskId: "task-1",
      settings: { executionBudget: { maxStepsPerTask: 1 } },
      continuationBudgetMultiplier: 2,
      runtime: runtime([{ status: "completed", stepId: "step-resumed", reason: "planner_finish" }]),
      appendEvent: async (record) => {
        events.push(record);
      }
    });

    const result = await controller.resumeTask(
      "Search weather",
      { resumedFromEventId: "event-paused" },
      { stepCount: 1, modelCallCount: 0, observationRoundCount: 0, consecutiveFailures: 0, sameCommandRetries: 0, activeElapsedMs: 1000 }
    );

    expect(result).toMatchObject({ status: "completed", stepsRun: 2 });
    expect(events[0]?.payload.budgetMultiplier).toBe(2);
  });

  it("restores an expanded multiplier only after a resource-budget suspension", () => {
    const expanded = [event("RuntimeSuspended", "step-1", 400, { reason: "max_task_duration", budgetMultiplier: 2 })];
    const nonContinuable = [event("RuntimeSuspended", "step-1", 400, { reason: "max_same_command_retries", budgetMultiplier: 2 })];

    expect(nextContinuationBudgetMultiplier(expanded)).toBe(4);
    expect(nextContinuationBudgetMultiplier(nonContinuable)).toBe(2);
  });

  it("restores active execution time across repeated budget suspensions", () => {
    const counters = restoreExecutionCounters([
      event("TaskStarted", "start", 100, { taskText: "打开设置" }),
      event("RuntimeSuspended", "step-1", 400, { reason: "max_task_duration", budgetMultiplier: 1 }),
      event("RuntimeResumed", "resume-1", 1000, { reason: "user_requested", budgetMultiplier: 2 }),
      event("RuntimeSuspended", "step-2", 1250, { reason: "max_steps", budgetMultiplier: 2 })
    ]);

    expect(counters.activeElapsedMs).toBe(550);
  });
});
