import { describe, expect, it, vi } from "vitest";
import { ModelProtocolHttpError, requestPlannerProtocolTurn } from "../../../src/adapters/model/planner-model-client";

const messages = [
  { role: "system" as const, content: "Return JSON." },
  { role: "user" as const, content: "Plan this task." }
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("Planner model protocol client", () => {
  it("uses OpenAI Responses strict schema and reasoning-aware output settings", async () => {
    const onActivity = vi.fn();
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        model: "gpt-5",
        stream: false,
        max_output_tokens: 12000,
        reasoning: { effort: "low", summary: "auto" },
        text: { format: { type: "json_schema", name: "naturalclick_planner_turn", strict: true } }
      });
      return jsonResponse({
        id: "resp_1",
        status: "completed",
        output: [{ type: "message", content: [{ type: "output_text", text: '{"finishTaskTurn":null}' }] }],
        usage: { input_tokens: 10, output_tokens: 20, output_tokens_details: { reasoning_tokens: 5 } }
      });
    });

    const result = await requestPlannerProtocolTurn({
      protocol: "responses",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "secret",
      model: "gpt-5",
      messages,
      nativeTools: [],
      capabilities: { structuredOutputs: true, jsonMode: true, strictTools: true, reasoning: true },
      maxOutputTokens: 12000,
      stream: false,
      onActivity,
      fetchImpl
    });

    expect(fetchImpl).toHaveBeenCalledWith("https://api.openai.com/v1/responses", expect.any(Object));
    expect(onActivity).toHaveBeenCalledWith({ kind: "response_headers" });
    expect(result).toMatchObject({ protocol: "responses", status: "completed", responseId: "resp_1" });
  });

  it("keeps GPT-5 Chat Completions compatibility with max_completion_tokens", async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.max_completion_tokens).toBe(12000);
      expect(body).not.toHaveProperty("max_tokens");
      expect(body.response_format).toMatchObject({ type: "json_schema" });
      return jsonResponse({
        id: "chat_1",
        choices: [{ message: { content: '{"finishTaskTurn":null}' }, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 20 }
      });
    });

    const result = await requestPlannerProtocolTurn({
      protocol: "chat_completions",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "secret",
      model: "gpt-5",
      messages,
      nativeTools: [],
      capabilities: { structuredOutputs: true, jsonMode: true, strictTools: true, reasoning: true },
      maxOutputTokens: 12000,
      stream: false,
      fetchImpl
    });

    expect(result).toMatchObject({ protocol: "chat_completions", status: "completed", finishReason: "stop" });
  });

  it("supports legacy Completions with a compiled prompt", async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.prompt).toContain("SYSTEM:\nReturn JSON.");
      expect(body.prompt).toContain("USER:\nPlan this task.");
      expect(body.max_tokens).toBe(8000);
      expect(body).not.toHaveProperty("tools");
      return jsonResponse({ id: "cmpl_1", choices: [{ text: '{"finishTaskTurn":null}', finish_reason: "stop" }] });
    });

    const result = await requestPlannerProtocolTurn({
      protocol: "completions",
      baseUrl: "https://legacy.example/v1",
      apiKey: "secret",
      model: "legacy-model",
      messages,
      nativeTools: [],
      capabilities: { structuredOutputs: false, jsonMode: false, strictTools: false, reasoning: false },
      maxOutputTokens: 8000,
      stream: false,
      fetchImpl
    });

    expect(fetchImpl).toHaveBeenCalledWith("https://legacy.example/v1/completions", expect.any(Object));
    expect(result).toMatchObject({ protocol: "completions", status: "completed", text: '{"finishTaskTurn":null}' });
  });

  it("classifies explicit unsupported endpoints for protocol negotiation", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: { message: "Unsupported endpoint /responses" } }, 404));

    await expect(requestPlannerProtocolTurn({
      protocol: "responses",
      baseUrl: "https://gateway.example/v1",
      apiKey: "secret",
      model: "model",
      messages,
      nativeTools: [],
      capabilities: { structuredOutputs: false, jsonMode: false, strictTools: false, reasoning: false },
      maxOutputTokens: 8000,
      stream: false,
      fetchImpl
    })).rejects.toMatchObject({ status: 404, protocolUnsupported: true } satisfies Partial<ModelProtocolHttpError>);
  });

  it("retries without strict tool definitions when a compatible provider rejects them", async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      const strict = body.tools?.[0]?.function?.strict;
      if (strict) return jsonResponse({ error: { message: "strict function tools are not supported" } }, 400);
      return jsonResponse({
        id: "chat_2",
        choices: [{ message: { content: '{"finishTaskTurn":null}' }, finish_reason: "stop" }]
      });
    });

    const result = await requestPlannerProtocolTurn({
      protocol: "chat_completions",
      baseUrl: "https://gateway.example/v1",
      apiKey: "secret",
      model: "compatible-model",
      messages,
      nativeTools: [{
        name: "read_page",
        group: "core",
        risk: "read",
        description: "Read the current page.",
        parameters: { type: "object", properties: {}, additionalProperties: false }
      }],
      capabilities: { structuredOutputs: true, jsonMode: true, strictTools: true, reasoning: false },
      maxOutputTokens: 12000,
      stream: false,
      fetchImpl
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.status).toBe("completed");
  });
});
