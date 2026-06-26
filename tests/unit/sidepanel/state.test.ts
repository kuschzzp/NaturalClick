import { describe, expect, it } from "vitest";
import type { AgentEvent, AgentEventType } from "../../../src/core/events/events";
import {
  deriveActiveTaskFromEvents,
  deriveRuntimeFlow,
  deriveSidepanelMode,
  mapEventToTimelineItem,
  needsModelGuidance,
  type SidepanelState
} from "../../../src/sidepanel/state";

const base: SidepanelState = {
  mode: "conversation",
  overlayMode: "Off",
  safetyMode: "balanced",
  modelConfigured: true,
  traceOpen: false
};

function makeEvent(type: AgentEventType, payload: Record<string, unknown> = {}): AgentEvent {
  return {
    id: `event-${type}`,
    sessionId: "session-1",
    taskId: "task-1",
    stepId: "step-1",
    type,
    timestamp: 1,
    payload,
    visibility: "debug",
    correlationId: "step-1"
  };
}

describe("sidepanel state", () => {
  it("uses conversation mode when no task is active", () => {
    expect(deriveSidepanelMode(base)).toBe("conversation");
  });

  it("uses workbench mode when a task is running", () => {
    expect(deriveSidepanelMode({ ...base, activeTask: { taskId: "task-1", status: "running" } })).toBe("workbench");
  });

  it("returns to conversation mode after completion when trace is closed", () => {
    expect(deriveSidepanelMode({ ...base, activeTask: { taskId: "task-1", status: "completed" } })).toBe("conversation");
  });

  it("keeps workbench mode while trace is open", () => {
    expect(deriveSidepanelMode({ ...base, traceOpen: true })).toBe("workbench");
  });

  it("shows model guidance when planner model is missing", () => {
    expect(needsModelGuidance({ ...base, modelConfigured: false })).toBe(true);
  });

  it("derives active runtime flow node", () => {
    const flow = deriveRuntimeFlow({ ...base, activeTask: { taskId: "task-1", status: "running", activeNodeId: "plan" } });

    expect(flow.find((node) => node.id === "start")?.status).toBe("done");
    expect(flow.find((node) => node.id === "plan")?.status).toBe("active");
    expect(flow.find((node) => node.id === "act")?.status).toBe("waiting");
  });

  it("maps agent events to Chinese timeline items", () => {
    const item = mapEventToTimelineItem(makeEvent("ObservationReceived", { summary: "发现 3 个候选按钮" }));

    expect(item.title).toBe("页面观察完成");
    expect(item.detail).toBe("发现 3 个候选按钮");
    expect(item.tone).toBe("info");
  });

  it("derives active task projection from events", () => {
    const activeTask = deriveActiveTaskFromEvents([makeEvent("TaskStarted", { taskText: "打开设置" })]);

    expect(activeTask?.activeNodeId).toBe("start");
    expect(activeTask?.currentAction).toBe("打开设置");
    expect(activeTask?.status).toBe("running");
  });
});
