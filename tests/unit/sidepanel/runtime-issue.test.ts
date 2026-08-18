import { describe, expect, it } from "vitest";
import type { AgentEvent } from "../../../src/core/events/events";
import { classifyRuntimeIssue, formatRuntimeIssue } from "../../../src/sidepanel/runtime-issue";

function event(type: AgentEvent["type"], payload: Record<string, unknown>): AgentEvent {
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

describe("runtime issue copy", () => {
  it("surfaces slow model calls with concrete remediation", () => {
    const issue = classifyRuntimeIssue(event("ModelCallCompleted", { durationMs: 9000 }), "zh-CN");

    expect(issue?.kind).toBe("runtime_performance");
    expect(formatRuntimeIssue(issue!, "zh-CN")).toContain("切换模型");
  });

  it("surfaces overlay interference during vision", () => {
    const issue = classifyRuntimeIssue(event("VisionRequested", { overlayMode: "All Targets" }), "zh-CN");

    expect(issue?.kind).toBe("overlay_interference");
    expect(formatRuntimeIssue(issue!, "zh-CN")).toContain("关闭页面标记");
  });
});
