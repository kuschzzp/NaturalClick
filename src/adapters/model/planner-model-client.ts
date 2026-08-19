import type { ToolDefinition } from "../../core/tools/tool";
import { toOpenAIChatTools } from "../../core/tools/openai-tool-schema";
import {
  extractOpenAICompatibleCompletionText,
  extractOpenAICompatibleReasoningText,
  extractOpenAICompatibleRefusal,
  extractOpenAICompatibleText,
  extractOpenAICompatibleToolCalls,
  type OpenAICompatibleToolCall
} from "../../core/model/openai-compatible";
import type { ModelStreamProgress, ModelTokenUsage, ModelTransportActivity, ModelTurnResult, ResolvedModelApiProtocol } from "../../core/model/model-protocol";
import { plannerResponseFormat } from "../../core/model/planner-schema";
import { readOpenAIResponsesStream } from "../../core/model/responses-streaming-client";
import { readOpenAICompatibleStreamTurn } from "../../core/model/streaming-client";

export type PlannerModelMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: PlannerAssistantToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export interface PlannerAssistantToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface PlannerProtocolCapabilities {
  structuredOutputs: boolean;
  jsonMode: boolean;
  strictTools: boolean;
  reasoning: boolean;
}

export interface PlannerProtocolTurnRequest {
  protocol: ResolvedModelApiProtocol;
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: PlannerModelMessage[];
  nativeTools: ToolDefinition[];
  capabilities: PlannerProtocolCapabilities;
  maxOutputTokens: number;
  stream: boolean;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  onProgress?: (progress: ModelStreamProgress) => void | Promise<void>;
  onActivity?: (activity: ModelTransportActivity) => void | Promise<void>;
}

export class ModelProtocolHttpError extends Error {
  readonly protocolUnsupported: boolean;
  readonly featureUnsupported: boolean;

  constructor(
    readonly protocol: ResolvedModelApiProtocol,
    readonly status: number,
    readonly responseBody: string
  ) {
    super(`planner_http_${status}`);
    const normalized = responseBody.toLowerCase();
    this.protocolUnsupported = status === 404 || status === 405 || /unsupported endpoint|unknown endpoint|not found/.test(normalized);
    this.featureUnsupported = status === 400 && (
      /(response[_ .-]?format|json[_ .-]?schema|structured output).*(unsupported|unknown|invalid|not support)|(unsupported|unknown).*(response[_ .-]?format|json[_ .-]?schema)/.test(normalized) ||
      /(strict|tool|function).*(unsupported|unknown|invalid|not support)|(unsupported|unknown).*(strict|tool|function)/.test(normalized)
    );
  }
}

type FormatMode = "strict" | "json" | "prompt";

function baseEndpoint(baseUrl: string, path: string): string {
  return `${baseUrl.trim().replace(/\/+$/, "")}/${path}`;
}

function formatModes(protocol: ResolvedModelApiProtocol, capabilities: PlannerProtocolCapabilities): FormatMode[] {
  if (protocol === "completions") return ["prompt"];
  const modes: FormatMode[] = [];
  if (capabilities.structuredOutputs) modes.push("strict");
  if (capabilities.jsonMode) modes.push("json");
  modes.push("prompt");
  return [...new Set(modes)];
}

function authHeaders(apiKey: string): Record<string, string> {
  return { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` };
}

function chatUsage(payload: unknown): ModelTokenUsage | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const usage = (payload as Record<string, unknown>).usage;
  if (!usage || typeof usage !== "object") return undefined;
  const record = usage as Record<string, unknown>;
  const details = record.completion_tokens_details && typeof record.completion_tokens_details === "object"
    ? record.completion_tokens_details as Record<string, unknown>
    : undefined;
  return {
    inputTokens: typeof record.prompt_tokens === "number" ? record.prompt_tokens : undefined,
    outputTokens: typeof record.completion_tokens === "number" ? record.completion_tokens : undefined,
    reasoningTokens: typeof details?.reasoning_tokens === "number" ? details.reasoning_tokens : undefined
  };
}

function firstChoice(payload: unknown): Record<string, unknown> | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const choices = (payload as Record<string, unknown>).choices;
  return Array.isArray(choices) && choices[0] && typeof choices[0] === "object" ? choices[0] as Record<string, unknown> : undefined;
}

function chatResult(payload: unknown, protocol: Extract<ResolvedModelApiProtocol, "chat_completions" | "completions">): ModelTurnResult {
  const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const choice = firstChoice(payload);
  const finishReason = typeof choice?.finish_reason === "string" ? choice.finish_reason : undefined;
  const refusal = protocol === "chat_completions" ? extractOpenAICompatibleRefusal(payload) : "";
  const text = protocol === "completions" ? extractOpenAICompatibleCompletionText(payload) : extractOpenAICompatibleText(payload);
  const toolCalls = protocol === "chat_completions" ? extractOpenAICompatibleToolCalls(payload) : [];
  const status: ModelTurnResult["status"] = refusal ? "refused" : finishReason === "length" ? "incomplete" : "completed";
  return {
    protocol,
    status,
    text: toolCalls.length ? "" : text,
    reasoningSummary: protocol === "chat_completions" ? extractOpenAICompatibleReasoningText(payload) : "",
    toolCalls,
    responseId: typeof record.id === "string" ? record.id : undefined,
    finishReason,
    incompleteReason: finishReason === "length" ? "max_output_tokens" : undefined,
    refusal: refusal || undefined,
    usage: chatUsage(payload)
  };
}

function responsesUsage(response: Record<string, unknown>): ModelTokenUsage | undefined {
  const usage = response.usage && typeof response.usage === "object" ? response.usage as Record<string, unknown> : undefined;
  if (!usage) return undefined;
  const details = usage.output_tokens_details && typeof usage.output_tokens_details === "object"
    ? usage.output_tokens_details as Record<string, unknown>
    : undefined;
  return {
    inputTokens: typeof usage.input_tokens === "number" ? usage.input_tokens : undefined,
    outputTokens: typeof usage.output_tokens === "number" ? usage.output_tokens : undefined,
    reasoningTokens: typeof details?.reasoning_tokens === "number" ? details.reasoning_tokens : undefined
  };
}

function responsesResult(payload: unknown): ModelTurnResult {
  const response = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const output = Array.isArray(response.output) ? response.output.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object") : [];
  let text = "";
  let reasoningSummary = "";
  let refusal = "";
  const toolCalls: OpenAICompatibleToolCall[] = [];
  for (const item of output) {
    if (item.type === "function_call" && typeof item.name === "string") {
      toolCalls.push({
        id: typeof item.call_id === "string" ? item.call_id : typeof item.id === "string" ? item.id : `call_${toolCalls.length}`,
        name: item.name,
        argumentsText: typeof item.arguments === "string" ? item.arguments : "{}"
      });
    }
    if (item.type === "reasoning" && Array.isArray(item.summary)) {
      reasoningSummary += item.summary.flatMap((part) => part && typeof part === "object" && typeof (part as Record<string, unknown>).text === "string"
        ? [(part as Record<string, unknown>).text as string]
        : []).join("");
    }
    if (item.type === "message" && Array.isArray(item.content)) {
      for (const part of item.content) {
        if (!part || typeof part !== "object") continue;
        const content = part as Record<string, unknown>;
        if (content.type === "output_text" && typeof content.text === "string") text += content.text;
        if (content.type === "refusal" && typeof content.refusal === "string") refusal += content.refusal;
      }
    }
  }
  const rawStatus = typeof response.status === "string" ? response.status : "completed";
  const incompleteDetails = response.incomplete_details && typeof response.incomplete_details === "object"
    ? response.incomplete_details as Record<string, unknown>
    : undefined;
  return {
    protocol: "responses",
    status: refusal ? "refused" : rawStatus === "incomplete" ? "incomplete" : rawStatus === "failed" ? "failed" : "completed",
    text: toolCalls.length ? "" : text,
    reasoningSummary,
    toolCalls,
    responseId: typeof response.id === "string" ? response.id : undefined,
    incompleteReason: typeof incompleteDetails?.reason === "string" ? incompleteDetails.reason : undefined,
    refusal: refusal || undefined,
    failureReason: response.error && typeof response.error === "object" && typeof (response.error as Record<string, unknown>).message === "string"
      ? (response.error as Record<string, unknown>).message as string
      : undefined,
    usage: responsesUsage(response)
  };
}

function responsesInput(messages: PlannerModelMessage[]): unknown[] {
  return messages.flatMap((message): unknown[] => {
    if (message.role === "system") return [];
    if (message.role === "tool") {
      return [{ type: "function_call_output", call_id: message.tool_call_id, output: message.content }];
    }
    if (message.role === "assistant" && message.tool_calls?.length) {
      return message.tool_calls.map((call) => ({
        type: "function_call",
        call_id: call.id,
        name: call.function.name,
        arguments: call.function.arguments
      }));
    }
    return [{ role: message.role, content: message.content ?? "" }];
  });
}

function responsesTools(tools: ToolDefinition[], strict: boolean): unknown[] {
  return tools.map((tool) => ({
    type: "function",
    name: tool.name,
    description: tool.description.trim(),
    parameters: tool.parameters,
    ...(strict ? { strict: true } : {})
  }));
}

function compiledCompletionPrompt(messages: PlannerModelMessage[]): string {
  const body = messages.map((message) => {
    if (message.role === "tool") return `TOOL ${message.tool_call_id}:\n${message.content}`;
    if (message.role === "assistant" && message.tool_calls?.length) {
      return `ASSISTANT TOOL CALLS:\n${JSON.stringify(message.tool_calls)}`;
    }
    return `${message.role.toUpperCase()}:\n${message.content ?? ""}`;
  }).join("\n\n");
  return `${body}\n\nASSISTANT:\n`;
}

function requestBody(input: PlannerProtocolTurnRequest, formatMode: FormatMode, strictTools = input.capabilities.strictTools): Record<string, unknown> {
  if (input.protocol === "responses") {
    const instructions = input.messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n");
    return {
      model: input.model,
      instructions,
      input: responsesInput(input.messages),
      stream: input.stream,
      max_output_tokens: input.maxOutputTokens,
      ...(input.capabilities.reasoning ? { reasoning: { effort: "low", summary: "auto" } } : {}),
      ...(formatMode === "strict" ? { text: { format: plannerResponseFormat("responses") } }
        : formatMode === "json" ? { text: { format: { type: "json_object" } } } : {}),
      ...(input.nativeTools.length ? {
        tools: responsesTools(input.nativeTools, strictTools),
        tool_choice: "auto"
      } : {})
    };
  }
  if (input.protocol === "chat_completions") {
    const officialOpenAiReasoning = input.capabilities.reasoning && input.baseUrl.trim().replace(/\/+$/, "") === "https://api.openai.com/v1";
    return {
      model: input.model,
      stream: input.stream,
      messages: input.messages,
      ...(officialOpenAiReasoning ? { max_completion_tokens: input.maxOutputTokens } : { max_tokens: input.maxOutputTokens }),
      ...(input.capabilities.reasoning ? { reasoning_effort: "low" } : { temperature: 0.2 }),
      ...(formatMode === "strict" ? { response_format: plannerResponseFormat("chat_completions") }
        : formatMode === "json" ? { response_format: { type: "json_object" } } : {}),
      ...(input.nativeTools.length ? {
        tools: toOpenAIChatTools(input.nativeTools).map((tool) => strictTools
          ? { ...tool, function: { ...tool.function, strict: true } }
          : tool),
        tool_choice: "auto"
      } : {})
    };
  }
  return {
    model: input.model,
    prompt: compiledCompletionPrompt(input.messages),
    stream: input.stream,
    max_tokens: input.maxOutputTokens,
    temperature: 0.2
  };
}

async function parseResponse(input: PlannerProtocolTurnRequest, response: Response): Promise<ModelTurnResult> {
  const contentType = response.headers.get("content-type") ?? "";
  if (input.stream && response.body && contentType.includes("text/event-stream")) {
    if (input.protocol === "responses") return readOpenAIResponsesStream(response.body, input.onProgress, input.onActivity);
    const turn = await readOpenAICompatibleStreamTurn(response.body, async (progress) => {
      await input.onProgress?.({
        contentChunk: progress.chunk || undefined,
        reasoningChunk: progress.reasoningChunk,
        toolArgumentsChunk: progress.toolArgumentsChunk,
        accumulatedText: progress.accumulatedText,
        chunkIndex: progress.chunkIndex,
        receivedChars: progress.receivedChars,
        visibleReceivedChars: progress.visibleReceivedChars,
        toolCallNames: progress.toolCallNames,
        toolArgumentsChars: progress.toolArgumentsChars
      });
    }, { protocol: input.protocol, onActivity: () => input.onActivity?.({ kind: "stream_data" }) });
    const status: ModelTurnResult["status"] = turn.refusal ? "refused" : turn.finishReason === "length" ? "incomplete" : "completed";
    return {
      protocol: input.protocol,
      status,
      text: turn.text,
      reasoningSummary: "",
      toolCalls: turn.toolCalls,
      responseId: turn.responseId,
      finishReason: turn.finishReason,
      incompleteReason: turn.finishReason === "length" ? "max_output_tokens" : undefined,
      refusal: turn.refusal,
      usage: turn.usage
    };
  }
  const payload = await response.json();
  return input.protocol === "responses" ? responsesResult(payload) : chatResult(payload, input.protocol);
}

export async function requestPlannerProtocolTurn(input: PlannerProtocolTurnRequest): Promise<ModelTurnResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const endpoint = baseEndpoint(input.baseUrl, input.protocol === "responses" ? "responses" : input.protocol === "chat_completions" ? "chat/completions" : "completions");
  const modes = formatModes(input.protocol, input.capabilities);
  let lastError: ModelProtocolHttpError | undefined;
  let strictTools = input.capabilities.strictTools && input.nativeTools.length > 0;
  for (const mode of modes) {
    while (true) {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        signal: input.signal,
        headers: authHeaders(input.apiKey),
        body: JSON.stringify(requestBody(input, mode, strictTools))
      });
      await input.onActivity?.({ kind: "response_headers" });
      if (response.ok) return parseResponse(input, response);
      const body = await response.text();
      const error = new ModelProtocolHttpError(input.protocol, response.status, body);
      lastError = error;
      if (error.featureUnsupported && strictTools) {
        strictTools = false;
        continue;
      }
      if (error.featureUnsupported && mode !== modes.at(-1)) break;
      throw error;
    }
  }
  throw lastError ?? new Error("planner_provider_protocol_error");
}
