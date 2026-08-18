import { describe, expect, it } from "vitest";
import type { AgentEvent } from "../../../src/core/events/events";
import type { AgentStepResult } from "../../../src/core/runtime/agent-runtime";
import { ExecutionController } from "../../../src/core/runtime/execution-controller";

function runtime(results: AgentStepResult[]) {
  let index = 0;
  return {
    started: false,
    startTask: async () => {
      runtime(results).started = true;
    },
    resumeTask: async () => {
      runtime(results).started = true;
    },
    runNextStep: async () => results[index++] ?? { status: "completed", stepId: `step-${index}`, reason: "done" }
  };
}

describe("ExecutionController", () => {
  it("runs multiple steps until completion", async () => {
    const events: AgentEvent[] = [];
    const controller = new ExecutionController({
      sessionId: "session-1",
      taskId: "task-1",
      runtime: runtime([
        { status: "continue", stepId: "step-1", reason: "success" },
        { status: "completed", stepId: "step-2", reason: "planner_finish" }
      ]),
      appendEvent: async (event) => {
        events.push(event);
      }
    });

    const result = await controller.startTask("Search weather");

    expect(result).toMatchObject({ status: "completed", stepsRun: 2 });
    expect(events).toHaveLength(0);
  });

  it("pauses when runtime asks for confirmation", async () => {
    const controller = new ExecutionController({
      sessionId: "session-1",
      taskId: "task-1",
      runtime: runtime([{ status: "awaiting_confirmation", stepId: "step-1", reason: "policy_ask_user" }]),
      appendEvent: async () => {}
    });

    await expect(controller.startTask("Submit form")).resolves.toMatchObject({
      status: "awaiting_confirmation",
      reason: "policy_ask_user",
      stepsRun: 1
    });
  });

  it("suspends when step budget is reached", async () => {
    const events: AgentEvent[] = [];
    const controller = new ExecutionController({
      sessionId: "session-1",
      taskId: "task-1",
      settings: { executionBudget: { maxStepsPerTask: 1 } },
      runtime: runtime([
        { status: "continue", stepId: "step-1", reason: "success" },
        { status: "continue", stepId: "step-2", reason: "success" }
      ]),
      appendEvent: async (event) => {
        events.push(event);
      }
    });

    const result = await controller.startTask("Search weather");

    expect(result).toMatchObject({ status: "awaiting_user_input", reason: "max_steps", stepsRun: 1 });
    expect(events.at(-1)?.type).toBe("RuntimeSuspended");
    expect(events.at(-1)?.payload.reason).toBe("max_steps");
  });

  it("uses runtime step metrics for model and observation budgets", async () => {
    const events: AgentEvent[] = [];
    const controller = new ExecutionController({
      sessionId: "session-1",
      taskId: "task-1",
      settings: {
        executionBudget: { maxModelCallsPerTask: 2, maxStepsPerTask: 5 },
        observationBudget: { maxObservationRoundsPerTask: 4 }
      },
      runtime: runtime([
        {
          status: "continue",
          stepId: "step-1",
          reason: "contract_repaired",
          metrics: { modelCalls: 2, observationRounds: 3 }
        },
        { status: "completed", stepId: "step-2", reason: "should_not_run" }
      ]),
      appendEvent: async (event) => {
        events.push(event);
      }
    });

    const result = await controller.startTask("Repair planner output");

    expect(result).toMatchObject({ status: "awaiting_user_input", reason: "max_model_calls", stepsRun: 1 });
    expect(events.at(-1)?.payload).toMatchObject({
      reason: "max_model_calls",
      counters: {
        stepCount: 1,
        modelCallCount: 2,
        observationRoundCount: 3
      }
    });
  });

  it("suspends when the same action repeats beyond the retry budget", async () => {
    const events: AgentEvent[] = [];
    const controller = new ExecutionController({
      sessionId: "session-1",
      taskId: "task-1",
      settings: { executionBudget: { maxSameCommandRetries: 0, maxStepsPerTask: 5 } },
      runtime: runtime([
        { status: "continue", stepId: "step-1", reason: "success", actionKey: "ActivateTarget:customers" },
        { status: "continue", stepId: "step-2", reason: "success", actionKey: "ActivateTarget:customers" },
        { status: "completed", stepId: "step-3", reason: "should_not_run" }
      ]),
      appendEvent: async (event) => {
        events.push(event);
      }
    });

    const result = await controller.startTask("Open customers");

    expect(result).toMatchObject({ status: "awaiting_user_input", reason: "max_same_command_retries", stepsRun: 2 });
    expect(events.at(-1)?.type).toBe("RuntimeSuspended");
    expect(events.at(-1)?.payload).toMatchObject({
      reason: "max_same_command_retries",
      lastActionKey: "ActivateTarget:customers",
      counters: { sameCommandRetries: 1 }
    });
  });

  it("does not count different actions as same-command retries", async () => {
    const controller = new ExecutionController({
      sessionId: "session-1",
      taskId: "task-1",
      settings: { executionBudget: { maxSameCommandRetries: 0, maxStepsPerTask: 5 } },
      runtime: runtime([
        { status: "continue", stepId: "step-1", reason: "success", actionKey: "FillField:username" },
        { status: "continue", stepId: "step-2", reason: "success", actionKey: "FillField:password" },
        { status: "completed", stepId: "step-3", reason: "planner_finish" }
      ]),
      appendEvent: async () => {}
    });

    await expect(controller.startTask("Log in")).resolves.toMatchObject({
      status: "completed",
      reason: "planner_finish",
      stepsRun: 3
    });
  });

  it("resumes a paused task without starting a new task event", async () => {
    const events: AgentEvent[] = [];
    const controller = new ExecutionController({
      sessionId: "session-1",
      taskId: "task-1",
      runtime: runtime([{ status: "completed", stepId: "step-1", reason: "planner_finish" }]),
      appendEvent: async (event) => {
        events.push(event);
      }
    });

    const result = await controller.resumeTask("Search weather", { resumedFromEventId: "event-paused" });

    expect(result).toMatchObject({ status: "completed", stepsRun: 1 });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("RuntimeResumed");
    expect(events[0].payload.resumedFromEventId).toBe("event-paused");
  });

  it("uses restored counters before running resumed steps", async () => {
    const events: AgentEvent[] = [];
    const controller = new ExecutionController({
      sessionId: "session-1",
      taskId: "task-1",
      settings: { executionBudget: { maxStepsPerTask: 2 } },
      runtime: runtime([{ status: "completed", stepId: "step-ignored", reason: "should_not_run" }]),
      appendEvent: async (event) => {
        events.push(event);
      }
    });

    const result = await controller.resumeTask(
      "Search weather",
      { resumedFromEventId: "event-paused" },
      {
        stepCount: 2,
        modelCallCount: 1,
        observationRoundCount: 1,
        consecutiveFailures: 0,
        sameCommandRetries: 0,
        activeElapsedMs: 1000
      }
    );

    expect(result).toMatchObject({ status: "awaiting_user_input", reason: "max_steps", stepsRun: 2 });
    expect(events.map((event) => event.type)).toEqual(["RuntimeResumed", "RuntimeSuspended"]);
  });

  it("continues restored same-action retry state after resume", async () => {
    const events: AgentEvent[] = [];
    const controller = new ExecutionController({
      sessionId: "session-1",
      taskId: "task-1",
      settings: { executionBudget: { maxSameCommandRetries: 1, maxStepsPerTask: 5 } },
      runtime: runtime([
        { status: "continue", stepId: "step-resumed", reason: "success", actionKey: "activatetarget:customers" },
        { status: "completed", stepId: "step-ignored", reason: "should_not_run" }
      ]),
      appendEvent: async (event) => {
        events.push(event);
      }
    });

    const result = await controller.resumeTask(
      "Open customers",
      { resumedFromEventId: "event-paused" },
      {
        stepCount: 2,
        modelCallCount: 2,
        observationRoundCount: 2,
        consecutiveFailures: 0,
        sameCommandRetries: 1,
        lastActionKey: "activatetarget:customers",
        activeElapsedMs: 1000
      }
    );

    expect(result).toMatchObject({ status: "awaiting_user_input", reason: "max_same_command_retries", stepsRun: 3 });
    expect(events.at(-1)?.payload).toMatchObject({
      reason: "max_same_command_retries",
      lastActionKey: "activatetarget:customers",
      counters: { sameCommandRetries: 2 }
    });
  });

  it("continues the same controller after user consent is resolved", async () => {
    const events: AgentEvent[] = [];
    const controller = new ExecutionController({
      sessionId: "session-1",
      taskId: "task-1",
      runtime: runtime([
        { status: "awaiting_confirmation", stepId: "step-1", reason: "policy_ask_user" },
        { status: "completed", stepId: "step-2", reason: "planner_finish" }
      ]),
      appendEvent: async (event) => {
        events.push(event);
      }
    });

    const paused = await controller.startTask("Submit form");
    const continued = await controller.continueTask({ resumedFromEventId: "event-consent" });

    expect(paused).toMatchObject({ status: "awaiting_confirmation", stepsRun: 1 });
    expect(continued).toMatchObject({ status: "completed", reason: "planner_finish", stepsRun: 2 });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("RuntimeResumed");
    expect(events[0].payload.reason).toBe("user_consent_resolved");
    expect(events[0].payload.resumedFromEventId).toBe("event-consent");
  });

  it("returns stopped instead of accepting an in-flight step result after stop", async () => {
    const events: AgentEvent[] = [];
    let finishStep: ((result: AgentStepResult) => void) | undefined;
    const controller = new ExecutionController({
      sessionId: "session-1",
      taskId: "task-1",
      runtime: {
        startTask: async () => {},
        runNextStep: () =>
          new Promise<AgentStepResult>((resolve) => {
            finishStep = resolve;
          })
      },
      appendEvent: async (event) => {
        events.push(event);
      }
    });

    const running = controller.startTask("Long model call");
    await Promise.resolve();
    controller.stop("user_requested");
    finishStep?.({ status: "completed", stepId: "step-late", reason: "planner_finish" });
    const result = await running;

    expect(result).toMatchObject({ status: "stopped", reason: "user_requested" });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("TaskStopped");
  });

  it("does not run another step after stopTask is requested", async () => {
    const events: AgentEvent[] = [];
    let steps = 0;
    let finishStep: ((result: AgentStepResult) => void) | undefined;
    const controller = new ExecutionController({
      sessionId: "session-stop-task",
      taskId: "task-stop-task",
      runtime: {
        startTask: async () => {},
        runNextStep: () => {
          steps += 1;
          return new Promise<AgentStepResult>((resolve) => {
            finishStep = resolve;
          });
        }
      },
      appendEvent: async (event) => {
        events.push(event);
      }
    });

    const running = controller.startTask("Long task");
    await Promise.resolve();
    controller.stopTask({ reason: "user_stop" });
    finishStep?.({ status: "continue", stepId: "step-1", reason: "success" });
    const result = await running;

    expect(result).toMatchObject({ status: "stopped", reason: "user_stop" });
    expect(steps).toBe(1);
    expect(events.map((event) => event.type)).toEqual(["TaskStopped"]);
  });
});
