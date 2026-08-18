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
});
