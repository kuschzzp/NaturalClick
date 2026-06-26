import { describe, expect, it } from "vitest";
import { deriveSidepanelMode, needsModelGuidance, type SidepanelState } from "../../../src/sidepanel/state";

const base: SidepanelState = {
  mode: "conversation",
  overlayMode: "Off",
  safetyMode: "balanced",
  modelConfigured: true,
  traceOpen: false
};

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
});
