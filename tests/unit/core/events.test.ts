import { describe, expect, it } from "vitest";
import { createEventId, createStepId } from "../../../src/shared/ids";
import { MemoryEventStore } from "../../../src/core/events/memory-event-store";
import { StateReducer } from "../../../src/core/events/reducer";
import { deriveSessionExecutionHealth, shouldSuspendRecoveredSession } from "../../../src/core/events/runtime-health";
import type { AgentEvent } from "../../../src/core/events/events";

function event(type: AgentEvent["type"], payload: Record<string, unknown> = {}): AgentEvent {
  return {
    id: createEventId(),
    sessionId: "session-1",
    taskId: "task-1",
    stepId: createStepId(),
    type,
    timestamp: 1,
    payload,
    visibility: "debug",
    correlationId: "corr-1"
  };
}

describe("event store and reducer", () => {
  it("stores events and reduces task status", async () => {
    const store = new MemoryEventStore();
    await store.append(event("TaskStarted", { taskText: "open settings" }));
    await store.append(event("PlanProduced", { activeSubgoal: "open settings" }));
    await store.append(event("TaskCompleted", { summary: "done" }));

    const events = await store.loadAfter("session-1", "task-1");
    const state = StateReducer.reduce(undefined, events);

    expect(state.runtimeStatus).toBe("completed");
    expect(state.activeSubgoal).toBe("open settings");
    expect(state.lastEventId).toBe(events.at(-1)?.id);
  });

  it("keeps pending consent from policy events", () => {
    const state = StateReducer.reduce(undefined, [
      event("TaskStarted"),
      event("PolicyEvaluated", {
        decision: { status: "ask_user", riskLevel: "medium", reasons: ["submit requires consent"] }
      })
    ]);

    expect(state.runtimeStatus).toBe("waiting");
    expect(state.pendingConsent?.riskLevel).toBe("medium");
  });

  it("detects sessions that were interrupted while still running", () => {
    const runningEvents = [event("TaskStarted"), event("ModelCallStarted")];
    const suspendedEvents = [...runningEvents, event("RuntimeSuspended", { reason: "background_recovered_without_controller" })];

    expect(deriveSessionExecutionHealth(runningEvents)).toBe("running");
    expect(shouldSuspendRecoveredSession(runningEvents)).toBe(true);
    expect(deriveSessionExecutionHealth(suspendedEvents)).toBe("suspended");
    expect(shouldSuspendRecoveredSession(suspendedEvents)).toBe(false);
    expect(StateReducer.reduce(undefined, suspendedEvents).runtimeStatus).toBe("paused");
  });
});
