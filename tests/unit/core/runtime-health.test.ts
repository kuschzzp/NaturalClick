import { describe, expect, it } from "vitest";
import type { AgentEvent } from "../../../src/core/events/events";
import { analyzeRuntimeHealth, deriveSessionExecutionHealth } from "../../../src/core/events/runtime-health";

function event(type: AgentEvent["type"], timestamp: number, payload: Record<string, unknown> = {}, correlationId = "step-1"): AgentEvent {
  return {
    id: `${type}-${timestamp}`,
    sessionId: "session-1",
    taskId: "task-1",
    stepId: correlationId,
    type,
    timestamp,
    payload,
    visibility: "debug",
    correlationId
  };
}

describe("runtime health", () => {
  it("keeps existing terminal health semantics", () => {
    expect(deriveSessionExecutionHealth([event("TaskStarted", 1), event("TaskCompleted", 2)])).toBe("terminal");
  });

  it("aggregates runtime durations and flags slow steps", () => {
    const report = analyzeRuntimeHealth([
      event("TaskStarted", 0, { taskText: "点击客户管理" }),
      event("ObservationRequested", 100),
      event("ObservationReceived", 1500),
      event("ModelCallStarted", 2000),
      event("ModelCallCompleted", 11250),
      event("ToolCallStarted", 12000),
      event("ToolCallCompleted", 12100, { settleMs: 80 }),
      event("TaskCompleted", 13000)
    ]);

    expect(report.metrics).toMatchObject({
      observationRounds: 1,
      modelCalls: 1,
      observeMs: 1400,
      modelCallMs: 9250,
      toolMs: 100,
      settleMs: 80
    });
    expect(report.issues.map((issue) => issue.kind)).toEqual(
      expect.arrayContaining(["slow_observation", "slow_model_call", "too_many_model_calls_for_simple_task"])
    );
  });

  it("flags debug overlay during vision or screenshot events", () => {
    const report = analyzeRuntimeHealth([
      event("TaskStarted", 0, { taskText: "识别页面" }),
      event("ScreenshotCaptured", 100, { overlayMode: "All Targets" })
    ]);

    expect(report.issues).toEqual([expect.objectContaining({ kind: "overlay_active_during_vision" })]);
  });
});
