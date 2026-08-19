import { describe, expect, it } from "vitest";
import { readOpenAICompatibleStream, readOpenAICompatibleStreamTurn } from "../../../src/core/model/streaming-client";

function streamFrom(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    }
  });
}

describe("OpenAI-compatible streaming client", () => {
  it("reads content deltas from SSE chunks", async () => {
    const progress: string[] = [];
    const stream = streamFrom(
      [
        'data: {"choices":[{"delta":{"content":"hello"}}]}',
        "",
        'data: {"choices":[{"delta":{"content":" world"}}]}',
        "",
        "data: [DONE]",
        ""
      ].join("\n")
    );

    const text = await readOpenAICompatibleStream(stream, (event) => {
      progress.push(event.chunk);
    });

    expect(text).toBe("hello world");
    expect(progress).toEqual(["hello", " world"]);
  });

  it("ignores malformed data lines", async () => {
    const stream = streamFrom(['data: {"choices":[{"delta":{"content":"ok"}}]}', "data: not-json", "data: [DONE]", ""].join("\n\n"));

    await expect(readOpenAICompatibleStream(stream)).resolves.toBe("ok");
  });

  it("reports reasoning deltas as visible progress without changing final content", async () => {
    const progress: Array<{ chunk: string; reasoningChunk?: string; visibleChunk: string }> = [];
    const stream = streamFrom(
      [
        'data: {"choices":[{"delta":{"reasoning_content":"正在理解"}}]}',
        "",
        'data: {"choices":[{"delta":{"reasoning":"用户需求"}}]}',
        "",
        'data: {"choices":[{"delta":{"content":"最终结果"}}]}',
        "",
        "data: [DONE]",
        ""
      ].join("\n")
    );

    const turn = await readOpenAICompatibleStreamTurn(stream, (event) => {
      progress.push({ chunk: event.chunk, reasoningChunk: event.reasoningChunk, visibleChunk: event.visibleChunk });
    });

    expect(turn.text).toBe("最终结果");
    expect(progress).toEqual([
      { chunk: "", reasoningChunk: "正在理解", visibleChunk: "正在理解" },
      { chunk: "", reasoningChunk: "用户需求", visibleChunk: "用户需求" },
      { chunk: "最终结果", reasoningChunk: undefined, visibleChunk: "最终结果" }
    ]);
  });

  it("reads streamed tool call argument deltas", async () => {
    const stream = streamFrom(
      [
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"type\\":\\"FinishTask\\""}}]}}]}',
        "",
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":",\\"summary\\":\\"done\\",\\"evidenceRefs\\":[]}"}}]}}]}',
        "",
        "data: [DONE]",
        ""
      ].join("\n")
    );

    await expect(readOpenAICompatibleStream(stream)).resolves.toBe('{"type":"FinishTask","summary":"done","evidenceRefs":[]}');
  });

  it("aggregates streamed named tool calls", async () => {
    const stream = streamFrom(
      [
        'data: {"choices":[{"delta":{"tool_calls":[{"id":"call_read","index":0,"function":{"name":"read_page","arguments":"{\\"mode\\":\\""}}]}}]}',
        "",
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"atlas\\"}"}}]}}]}',
        "",
        "data: [DONE]",
        ""
      ].join("\n")
    );

    await expect(readOpenAICompatibleStreamTurn(stream)).resolves.toEqual({
      text: "",
      toolArgumentsText: '{"mode":"atlas"}',
      toolCalls: [{ id: "call_read", index: 0, name: "read_page", argumentsText: '{"mode":"atlas"}' }]
    });
  });

  it("reports streamed tool-call arguments as visible progress before the model turn completes", async () => {
    const progress: Array<{ names?: string[]; argumentChars?: number; argumentsChunk?: string; visibleChunk: string }> = [];
    const stream = streamFrom(
      [
        'data: {"choices":[{"delta":{"tool_calls":[{"id":"call_read","index":0,"function":{"name":"read_page","arguments":"{\\"mode\\":\\""}}]}}]}',
        "",
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"atlas\\"}"}}]}}]}',
        "",
        "data: [DONE]",
        ""
      ].join("\n")
    );

    await readOpenAICompatibleStreamTurn(stream, (event) => {
      progress.push({
        names: event.toolCallNames,
        argumentChars: event.toolArgumentsChars,
        argumentsChunk: event.toolArgumentsChunk,
        visibleChunk: event.visibleChunk
      });
    });

    expect(progress).toEqual([
      { names: ["read_page"], argumentChars: 9, argumentsChunk: '{"mode":"', visibleChunk: '{"mode":"' },
      { names: ["read_page"], argumentChars: 16, argumentsChunk: 'atlas"}', visibleChunk: 'atlas"}' }
    ]);
  });

  it("captures Chat Completions finish reason and token usage", async () => {
    const stream = streamFrom([
      'data: {"id":"chat_1","choices":[{"delta":{"content":"{\\"type\\":\\"FinishTask\\"}"},"finish_reason":null}]}',
      "",
      'data: {"id":"chat_1","choices":[{"delta":{},"finish_reason":"length"}],"usage":{"prompt_tokens":100,"completion_tokens":2200,"completion_tokens_details":{"reasoning_tokens":1800}}}',
      "",
      "data: [DONE]",
      ""
    ].join("\n"));

    await expect(readOpenAICompatibleStreamTurn(stream)).resolves.toMatchObject({
      responseId: "chat_1",
      finishReason: "length",
      usage: { inputTokens: 100, outputTokens: 2200, reasoningTokens: 1800 }
    });
  });

  it("reads legacy Completions choices text", async () => {
    const stream = streamFrom([
      'data: {"id":"cmpl_1","choices":[{"text":"{\\"type\\":","finish_reason":null}]}',
      "",
      'data: {"id":"cmpl_1","choices":[{"text":"\\"FinishTask\\"}","finish_reason":"stop"}]}',
      "",
      "data: [DONE]",
      ""
    ].join("\n"));

    await expect(readOpenAICompatibleStreamTurn(stream, undefined, { protocol: "completions" })).resolves.toMatchObject({
      text: '{"type":"FinishTask"}',
      responseId: "cmpl_1",
      finishReason: "stop"
    });
  });

  it("reports transport activity for Chat and legacy Completions streams", async () => {
    const chatActivity: string[] = [];
    await readOpenAICompatibleStreamTurn(
      streamFrom('data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n'),
      undefined,
      { protocol: "chat_completions", onActivity: () => { chatActivity.push("chat"); } }
    );
    const completionActivity: string[] = [];
    await readOpenAICompatibleStreamTurn(
      streamFrom('data: {"choices":[{"text":"ok"}]}\n\ndata: [DONE]\n'),
      undefined,
      { protocol: "completions", onActivity: () => { completionActivity.push("completion"); } }
    );

    expect(chatActivity).not.toHaveLength(0);
    expect(completionActivity).not.toHaveLength(0);
  });
});
