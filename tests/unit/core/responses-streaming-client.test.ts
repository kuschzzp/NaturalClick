import { describe, expect, it } from "vitest";
import { readOpenAIResponsesStream } from "../../../src/core/model/responses-streaming-client";

function streamFrom(events: unknown[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")));
      controller.close();
    }
  });
}

describe("OpenAI Responses streaming client", () => {
  it("separates reasoning summaries from structured output and records usage", async () => {
    const progress: Array<{ content?: string; reasoning?: string }> = [];
    const activity: string[] = [];
    const stream = streamFrom([
      { type: "response.created", response: { id: "resp_1" } },
      { type: "response.reasoning_summary_text.delta", delta: "正在分析页面" },
      { type: "response.output_text.delta", delta: '{"finishTaskTurn":' },
      { type: "response.output_text.delta", delta: '{"type":"FinishTask","summary":"完成","evidenceRefs":[]}}' },
      {
        type: "response.completed",
        response: {
          id: "resp_1",
          usage: { input_tokens: 120, output_tokens: 80, output_tokens_details: { reasoning_tokens: 40 } }
        }
      }
    ]);

    const result = await readOpenAIResponsesStream(stream, (event) => {
      progress.push({ content: event.contentChunk, reasoning: event.reasoningChunk });
    }, (event) => {
      activity.push(event.kind);
    });

    expect(result).toMatchObject({
      protocol: "responses",
      responseId: "resp_1",
      status: "completed",
      text: '{"finishTaskTurn":{"type":"FinishTask","summary":"完成","evidenceRefs":[]}}',
      reasoningSummary: "正在分析页面",
      usage: { inputTokens: 120, outputTokens: 80, reasoningTokens: 40 }
    });
    expect(progress[0]).toEqual({ content: undefined, reasoning: "正在分析页面" });
    expect(activity).toContain("stream_data");
  });

  it("returns explicit incomplete details instead of a parse error", async () => {
    const result = await readOpenAIResponsesStream(streamFrom([
      { type: "response.output_text.delta", delta: '{"commandTurn":' },
      { type: "response.incomplete", response: { id: "resp_cut", incomplete_details: { reason: "max_output_tokens" } } }
    ]));

    expect(result).toMatchObject({
      status: "incomplete",
      responseId: "resp_cut",
      incompleteReason: "max_output_tokens"
    });
  });

  it("aggregates streamed function calls", async () => {
    const result = await readOpenAIResponsesStream(streamFrom([
      { type: "response.output_item.added", item: { type: "function_call", id: "item_1", call_id: "call_1", name: "read_page", arguments: "" } },
      { type: "response.function_call_arguments.delta", item_id: "item_1", delta: '{"mode":"' },
      { type: "response.function_call_arguments.delta", item_id: "item_1", delta: 'atlas"}' },
      { type: "response.completed", response: { id: "resp_tool" } }
    ]));

    expect(result.toolCalls).toEqual([{ id: "call_1", name: "read_page", argumentsText: '{"mode":"atlas"}' }]);
  });
});
