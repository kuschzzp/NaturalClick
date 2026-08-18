import { describe, expect, it, vi } from "vitest";
import { runToolLoopStep } from "../../../src/core/runtime/tool-loop";
import type { ToolCall } from "../../../src/core/runtime/tool-loop";
import type { ToolDefinition } from "../../../src/core/tools/tool";

const tools: ToolDefinition[] = [
  { name: "read_page", group: "core", risk: "read", description: "Read page.", parameters: { type: "object", properties: {} } },
  { name: "done", group: "core", risk: "read", description: "Finish.", parameters: { type: "object", properties: {} } },
  { name: "fail", group: "core", risk: "read", description: "Fail.", parameters: { type: "object", properties: {} } }
];

describe("tool loop", () => {
  it("executes model tool calls in order and returns observations", async () => {
    const executed: string[] = [];
    const calls: ToolCall[] = [
      { id: "call_1", name: "read_page", args: { mode: "atlas" } },
      { id: "call_2", name: "done", args: { result: "完成" } }
    ];
    const result = await runToolLoopStep({
      tools,
      modelTurn: async () => ({
        type: "tool_calls",
        calls
      }),
      executeTool: async (call) => {
        executed.push(call.name);
        return { success: true, observation: call.name === "done" ? "完成" : "<page_atlas />" };
      }
    });

    expect(executed).toEqual(["read_page", "done"]);
    expect(result.observations.map((item) => item.call.name)).toEqual(["read_page", "done"]);
    expect(result.terminal).toEqual({ success: true, summary: "完成" });
  });

  it("returns text turns without executing tools", async () => {
    const result = await runToolLoopStep({
      tools,
      modelTurn: async () => ({ type: "text", text: "Need more context." }),
      executeTool: async () => {
        throw new Error("execute_should_not_be_called");
      }
    });

    expect(result).toEqual({ observations: [], text: "Need more context." });
  });

  it("reports unknown tools as observations", async () => {
    const executed: string[] = [];
    const result = await runToolLoopStep({
      tools,
      modelTurn: async () => ({
        type: "tool_calls",
        calls: [{ id: "call_unknown", name: "delete_everything", args: {} }]
      }),
      executeTool: async (call) => {
        executed.push(call.name);
        return { success: true, observation: "unexpected" };
      }
    });

    expect(executed).toEqual([]);
    expect(result.observations[0].result).toMatchObject({
      success: false,
      error: "Unknown tool delete_everything"
    });
  });

  it("turns fail tool calls into terminal failure", async () => {
    const result = await runToolLoopStep({
      tools,
      modelTurn: async () => ({
        type: "tool_calls",
        calls: [{ id: "call_fail", name: "fail", args: { reason: "blocked" } }]
      }),
      executeTool: async () => ({ success: false, observation: "blocked", error: "blocked" })
    });

    expect(result.terminal).toEqual({ success: false, summary: "blocked" });
  });

  it("stops after max tool calls and reports a recoverable failure", async () => {
    const calls: ToolCall[] = [
      { id: "call_1", name: "read_page", args: {} },
      { id: "call_2", name: "read_page", args: {} },
      { id: "call_3", name: "done", args: { result: "done" } }
    ];
    const result = await runToolLoopStep({
      tools,
      limits: { maxCallsPerTurn: 2 },
      modelTurn: async () => ({ type: "tool_calls", calls }),
      executeTool: async (call) => ({ success: true, observation: call.name })
    });

    expect(result.observations.map((item) => item.call.id)).toEqual(["call_1", "call_2"]);
    expect(result.terminal).toEqual({ success: false, summary: "Tool call limit reached." });
  });

  it("emits tool events around known tool execution", async () => {
    const started = vi.fn();
    const finished = vi.fn();
    const result = await runToolLoopStep({
      tools,
      eventSink: {
        onToolStarted: started,
        onToolFinished: finished
      },
      modelTurn: async () => ({
        type: "tool_calls",
        calls: [{ id: "call_1", name: "read_page", args: {} }]
      }),
      executeTool: async () => ({ success: true, observation: "<page_atlas />" })
    });

    expect(result.observations).toHaveLength(1);
    expect(started).toHaveBeenCalledWith(expect.objectContaining({ name: "read_page" }), expect.objectContaining({ name: "read_page" }));
    expect(finished).toHaveBeenCalledWith(
      expect.objectContaining({ name: "read_page" }),
      expect.objectContaining({ success: true }),
      expect.objectContaining({ name: "read_page" })
    );
  });

  it("does not hide unknown tools behind event or execution hooks", async () => {
    const started = vi.fn();
    const executed = vi.fn();
    const result = await runToolLoopStep({
      tools,
      eventSink: { onToolStarted: started },
      modelTurn: async () => ({
        type: "tool_calls",
        calls: [{ id: "call_unknown", name: "delete_everything", args: {} }]
      }),
      executeTool: async (call) => {
        executed(call);
        return { success: true, observation: "unexpected" };
      }
    });

    expect(started).not.toHaveBeenCalled();
    expect(executed).not.toHaveBeenCalled();
    expect(result.observations[0].result.error).toBe("Unknown tool delete_everything");
  });

  it("turns thrown tool errors into failed observations and calls the finish hook", async () => {
    const finished = vi.fn();
    const result = await runToolLoopStep({
      tools,
      eventSink: { onToolFinished: finished },
      modelTurn: async () => ({
        type: "tool_calls",
        calls: [{ id: "call_1", name: "read_page", args: {} }]
      }),
      executeTool: async () => {
        throw new Error("boom");
      }
    });

    expect(result.observations[0].result).toMatchObject({
      success: false,
      error: "boom"
    });
    expect(finished).toHaveBeenCalledWith(
      expect.objectContaining({ name: "read_page" }),
      expect.objectContaining({ success: false, error: "boom" }),
      expect.objectContaining({ name: "read_page" })
    );
  });

  it("stops before executing when the abort signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await runToolLoopStep({
      tools,
      abortSignal: controller.signal,
      modelTurn: async () => {
        throw new Error("model_turn_should_not_run");
      },
      executeTool: async () => {
        throw new Error("execute_should_not_run");
      }
    });

    expect(result).toEqual({
      observations: [],
      terminal: { success: false, summary: "Tool loop aborted." }
    });
  });

  it("stops after the tool started hook aborts before executing the tool", async () => {
    const controller = new AbortController();
    const executed = vi.fn();
    const result = await runToolLoopStep({
      tools,
      abortSignal: controller.signal,
      eventSink: {
        onToolStarted: () => controller.abort()
      },
      modelTurn: async () => ({
        type: "tool_calls",
        calls: [{ id: "call_1", name: "read_page", args: {} }]
      }),
      executeTool: async (call) => {
        executed(call);
        return { success: true, observation: "unexpected" };
      }
    });

    expect(executed).not.toHaveBeenCalled();
    expect(result).toEqual({
      observations: [],
      terminal: { success: false, summary: "Tool loop aborted." }
    });
  });

  it("stops queued follow-up tools when abort happens after a tool result", async () => {
    const controller = new AbortController();
    const executed: string[] = [];
    const calls: ToolCall[] = [
      { id: "call_1", name: "read_page", args: {} },
      { id: "call_2", name: "done", args: { result: "done" } }
    ];
    const result = await runToolLoopStep({
      tools,
      abortSignal: controller.signal,
      modelTurn: async () => ({
        type: "tool_calls",
        calls
      }),
      executeTool: async (call) => {
        executed.push(call.name);
        controller.abort();
        return { success: true, observation: call.name };
      }
    });

    expect(executed).toEqual(["read_page"]);
    expect(result.observations.map((item) => item.call.id)).toEqual(["call_1"]);
    expect(result.terminal).toEqual({ success: false, summary: "Tool loop aborted." });
  });
});
