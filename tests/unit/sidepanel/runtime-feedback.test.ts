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

  it("explains that continuing a resource-budget suspension doubles the task budget", () => {
    const issue = classifyRuntimeIssue(
      event("RuntimeSuspended", { reason: "max_task_duration", budgetMultiplier: 1, nextBudgetMultiplier: 2 }),
      "zh-CN"
    );

    expect(formatRuntimeIssue(issue!, "zh-CN")).toContain("继续执行");
    expect(formatRuntimeIssue(issue!, "zh-CN")).toContain("2×");
  });

  it.each([
    ["planner_output_truncated", "模型输出被截断", "输出预算"],
    ["planner_empty_output", "模型返回空内容", "非流式"],
    ["planner_refused", "模型拒绝执行", "切换模型"],
    ["planner_provider_protocol_error", "模型协议不兼容", "自动检测"],
    ["planner_transport_timeout", "模型调用超时", "Provider 延迟"],
    ["planner_first_token_timeout", "等待模型响应超时", "首 Token"],
    ["planner_stream_idle_timeout", "模型流式响应中断", "SSE"],
    ["planner_request_timeout", "单次模型请求超时", "输入上下文"],
    ["planner_total_budget_exhausted", "Planner 总时间预算耗尽", "累计时间"],
    ["planner_repair_exhausted", "Planner 修复失败", "Structured Outputs"]
  ])("explains planner failure %s with a targeted recovery", (reason, label, recovery) => {
    const issue = classifyRuntimeIssue(event("TaskFailed", { reason }), "zh-CN");

    expect(issue?.label).toBe(label);
    expect(issue?.suggestion).toContain(recovery);
  });
});
