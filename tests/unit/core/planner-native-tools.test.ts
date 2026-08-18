import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_PLANNER_NATIVE_TOOL_ROUNDS,
  executePlannerNativeToolCallsWithCache,
  plannerNativeToolCallCacheKey,
  plannerNativeToolBudgetInstruction,
  plannerNativeToolResultContent,
  plannerNativeToolResultPayload,
  parsePlannerNativeToolArguments,
  selectPlannerNativeTools,
  shouldRetryPlannerRequestWithoutTools
} from "../../../src/core/runtime/planner-native-tools";
import type { OpenAICompatibleToolCall } from "../../../src/core/model/openai-compatible";
import type { ToolDefinition } from "../../../src/core/tools/tool";

const tools: ToolDefinition[] = [
  {
    name: "read_page",
    group: "core",
    risk: "read",
    description: "Read page.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "search_context",
    group: "search",
    risk: "read",
    description: "Search.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "wait",
    group: "core",
    risk: "read",
    description: "Wait.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "load_tools",
    group: "core",
    risk: "read",
    description: "Load tools.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "list_skills",
    group: "skills",
    risk: "read",
    description: "List skills.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "use_skill",
    group: "skills",
    risk: "read",
    description: "Use skill.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "record_workflow",
    group: "skills",
    risk: "write",
    description: "Record workflow.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "save_scratchpad",
    group: "scratchpad",
    risk: "write",
    description: "Save scratchpad.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "list_scratchpad",
    group: "scratchpad",
    risk: "read",
    description: "List scratchpad.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "list_attachments",
    group: "files",
    risk: "read",
    description: "List attachments.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "read_attachment",
    group: "files",
    risk: "read",
    description: "Read attachment.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "list_schedules",
    group: "schedule",
    risk: "read",
    description: "List schedules.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "save_schedule",
    group: "schedule",
    risk: "write",
    description: "Save schedule.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "click",
    group: "core",
    risk: "write",
    description: "Click.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "delete_record",
    group: "core",
    risk: "destructive",
    description: "Delete.",
    parameters: { type: "object", properties: {} }
  }
];

function call(argumentsText: string, name = "read_page", id = "call_1"): OpenAICompatibleToolCall {
  return {
    id,
    name,
    argumentsText
  };
}

describe("planner native tool policy", () => {
  it("keeps the default native tool loop budget short for browser operation latency", () => {
    expect(DEFAULT_MAX_PLANNER_NATIVE_TOOL_ROUNDS).toBe(1);
  });

  it("exposes only planner context tools by default", () => {
    expect(selectPlannerNativeTools(tools).map((tool) => tool.name)).toEqual([
      "read_page",
      "search_context",
      "load_tools",
      "list_skills",
      "use_skill",
      "save_scratchpad",
      "list_scratchpad",
      "list_attachments",
      "read_attachment",
      "list_schedules",
      "save_schedule"
    ]);
  });

  it("can opt into write tools while still honoring the explicit blocklist", () => {
    expect(selectPlannerNativeTools(tools, { allowWriteTools: true }).map((tool) => tool.name)).toEqual([
      "read_page",
      "search_context",
      "wait",
      "load_tools",
      "list_skills",
      "use_skill",
      "record_workflow",
      "save_scratchpad",
      "list_scratchpad",
      "list_attachments",
      "read_attachment",
      "list_schedules",
      "save_schedule",
      "delete_record"
    ]);
  });

  it("parses empty and object tool arguments into serializable records", () => {
    expect(parsePlannerNativeToolArguments(call(""))).toEqual({ ok: true, args: {} });
    expect(parsePlannerNativeToolArguments(call('{"mode":"atlas","candidateLimit":40}'))).toEqual({
      ok: true,
      args: { mode: "atlas", candidateLimit: 40 }
    });
  });

  it("rejects non-object tool arguments", () => {
    expect(parsePlannerNativeToolArguments(call("[1,2,3]"))).toEqual({ ok: false, error: "invalid_tool_arguments" });
  });

  it("builds stable cache keys for equivalent tool arguments", () => {
    expect(plannerNativeToolCallCacheKey(call('{"candidateLimit":40,"mode":"atlas"}'))).toBe(
      plannerNativeToolCallCacheKey(call('{"mode":"atlas","candidateLimit":40}'))
    );
    expect(plannerNativeToolCallCacheKey(call('{"query":"客户"}', "find_target"))).not.toBe(
      plannerNativeToolCallCacheKey(call('{"query":"客户"}', "search_context"))
    );
  });

  it("reuses identical native read tool results within one model turn", async () => {
    const executed: string[] = [];
    const executions = await executePlannerNativeToolCallsWithCache(
      [
        call('{"mode":"atlas","candidateLimit":40}', "read_page", "call_1"),
        call('{"candidateLimit":40,"mode":"atlas"}', "read_page", "call_2"),
        call('{"query":"客户"}', "find_target", "call_3")
      ],
      async (toolCall) => {
        executed.push(toolCall.id);
        return {
          success: true,
          observation: `result:${toolCall.name}:${executed.length}`
        };
      }
    );

    expect(executed).toEqual(["call_1", "call_3"]);
    expect(executions.map((execution) => execution.call.id)).toEqual(["call_1", "call_2", "call_3"]);
    expect(executions.map((execution) => execution.reused)).toEqual([false, true, false]);
    expect(executions[1]?.result).toBe(executions[0]?.result);
    expect(executions[2]?.result.observation).toBe("result:find_target:2");
  });

  it("serializes capped tool results back into tool messages", () => {
    const payload = plannerNativeToolResultPayload(
      {
        success: false,
        observation: "abcdef",
        error: "target_not_found",
        data: { count: 3 }
      },
      3
    );

    expect(payload).toEqual({
      success: false,
      observation: "abc",
      error: "target_not_found",
      data: { count: 3 }
    });
    expect(plannerNativeToolResultContent({ success: true, observation: "ok" })).toBe('{"success":true,"observation":"ok"}');
  });

  it("builds a structured instruction when the planner exhausts native tool rounds", () => {
    expect(JSON.parse(plannerNativeToolBudgetInstruction([call('{"mode":"atlas"}')], 1))).toEqual({
      nativeToolBudget: "exhausted",
      maxRounds: 1,
      requestedTools: ["read_page"],
      instruction:
        "Do not call more tools. Use the original page context and previous tool results already in this conversation, then return exactly one valid NaturalClick planner JSON object."
    });
  });

  it("detects provider errors that should retry without native tools", () => {
    expect(shouldRetryPlannerRequestWithoutTools(new Error("planner_http_400"))).toBe(true);
    expect(shouldRetryPlannerRequestWithoutTools(new Error("planner_http_422"))).toBe(true);
    expect(shouldRetryPlannerRequestWithoutTools(new Error("planner_http_500"))).toBe(false);
    expect(shouldRetryPlannerRequestWithoutTools(new DOMException("aborted", "AbortError"))).toBe(false);
  });
});
