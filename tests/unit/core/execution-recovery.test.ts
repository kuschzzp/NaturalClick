import { describe, expect, it } from "vitest";
import type { AgentEvent } from "../../../src/core/events/events";
import { createEventId } from "../../../src/shared/ids";
import { restoreExecutionCounters } from "../../../src/core/runtime/execution-recovery";

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

describe("execution recovery", () => {
  it("restores budget counters from persisted runtime events", () => {
    const counters = restoreExecutionCounters([
      event("TaskStarted", "start", 1000, { taskText: "打开设置" }),
      event("ObservationRequested", "step-1", 1100),
      event("ModelCallStarted", "step-1", 1200),
      event("CommandIssued", "step-1", 1300, { commandId: "cmd-1" }),
      event("VerificationProduced", "step-1", 1400, { commandId: "cmd-1", status: "success" }),
      event("ObservationRequested", "step-2", 1500),
      event("ModelCallStarted", "step-2", 1600),
      event("TaskFailed", "step-2", 1700, { reason: "target_not_found" }),
      event("RuntimeSuspended", "step-2", 5000, { reason: "background_recovered_without_controller" })
    ]);

    expect(counters).toEqual({
      stepCount: 2,
      modelCallCount: 2,
      observationRoundCount: 2,
      consecutiveFailures: 1,
      sameCommandRetries: 0,
      activeElapsedMs: 700
    });
  });

  it("does not count cached before-step reuse as a fresh observation round", () => {
    const counters = restoreExecutionCounters([
      event("TaskStarted", "start", 1000, { taskText: "打开设置" }),
      event("ObservationRequested", "step-1", 1100),
      event("ObservationRequested", "step-2", 1200, { reason: "before_step_reuse", cached: true }),
      event("ObservationReceived", "step-2", 1250, { cached: true }),
      event("ModelCallStarted", "step-2", 1300)
    ]);

    expect(counters.stepCount).toBe(2);
    expect(counters.modelCallCount).toBe(1);
    expect(counters.observationRoundCount).toBe(1);
  });

  it("restores trailing same-command retry state from command events", () => {
    const repeatedCommand = {
      id: "cmd-customers",
      type: "ActivateTarget",
      targetGoal: "客户管理",
      inputs: { controlId: "control_7_button_客户管理" }
    };
    const counters = restoreExecutionCounters([
      event("TaskStarted", "start", 1000, { taskText: "打开客户管理" }),
      event("CommandIssued", "step-1", 1100, { command: { ...repeatedCommand, id: "cmd-1" } }),
      event("VerificationProduced", "step-1", 1200, { commandId: "cmd-1", status: "partial" }),
      event("CommandIssued", "step-2", 1300, { command: { ...repeatedCommand, id: "cmd-2" } }),
      event("CommandIssued", "step-2", 1350, { command: { ...repeatedCommand, id: "cmd-2" }, retry: 1 }),
      event("VerificationProduced", "step-2", 1400, { commandId: "cmd-2", status: "partial" }),
      event("CommandIssued", "step-3", 1500, { command: { ...repeatedCommand, id: "cmd-3" } }),
      event("VerificationProduced", "step-3", 1600, { commandId: "cmd-3", status: "partial" })
    ]);

    expect(counters.sameCommandRetries).toBe(2);
    expect(counters.lastActionKey).toBe("activatetarget:客户管理:control_7_button_客户管理");
  });
});
