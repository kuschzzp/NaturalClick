import type { OpenAICompatibleToolCall } from "./openai-compatible";
import type { ModelStreamProgress, ModelTokenUsage, ModelTransportActivity, ModelTurnResult } from "./model-protocol";

interface PendingFunctionCall {
  itemId: string;
  id: string;
  name: string;
  argumentsText: string;
  order: number;
}

function dataLine(line: string): string | undefined {
  const trimmed = line.trim();
  return trimmed.startsWith("data:") ? trimmed.slice(5).trim() : undefined;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function responseUsage(value: unknown): ModelTokenUsage | undefined {
  const usage = record(record(value)?.usage);
  if (!usage) return undefined;
  const details = record(usage.output_tokens_details);
  return {
    inputTokens: numberValue(usage.input_tokens),
    outputTokens: numberValue(usage.output_tokens),
    reasoningTokens: numberValue(details?.reasoning_tokens)
  };
}

function finishedToolCalls(pending: Map<string, PendingFunctionCall>): OpenAICompatibleToolCall[] {
  return [...pending.values()]
    .sort((left, right) => left.order - right.order)
    .filter((call) => Boolean(call.name))
    .map((call) => ({ id: call.id, name: call.name, argumentsText: call.argumentsText }));
}

export async function readOpenAIResponsesStream(
  stream: ReadableStream<Uint8Array>,
  onProgress?: (progress: ModelStreamProgress) => void | Promise<void>,
  onActivity?: (activity: ModelTransportActivity) => void | Promise<void>
): Promise<ModelTurnResult> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const pending = new Map<string, PendingFunctionCall>();
  let buffer = "";
  let text = "";
  let reasoningSummary = "";
  let responseId: string | undefined;
  let status: ModelTurnResult["status"] | undefined;
  let incompleteReason: string | undefined;
  let refusal: string | undefined;
  let failureReason: string | undefined;
  let usage: ModelTokenUsage | undefined;
  let chunkIndex = 0;
  let visibleReceivedChars = 0;

  const emit = async (contentChunk?: string, reasoningChunk?: string, toolArgumentsChunk?: string): Promise<void> => {
    const visible = `${contentChunk ?? ""}${reasoningChunk ?? ""}${toolArgumentsChunk ?? ""}`;
    if (!visible) return;
    chunkIndex += 1;
    visibleReceivedChars += visible.length;
    await onProgress?.({
      contentChunk,
      reasoningChunk,
      toolArgumentsChunk,
      accumulatedText: text,
      chunkIndex,
      receivedChars: text.length,
      visibleReceivedChars,
      toolCallNames: [...new Set([...pending.values()].map((call) => call.name).filter(Boolean))],
      toolArgumentsChars: [...pending.values()].reduce((count, call) => count + call.argumentsText.length, 0)
    });
  };

  const consume = async (payload: unknown): Promise<void> => {
    const event = record(payload);
    if (!event) return;
    const type = stringValue(event.type);
    const response = record(event.response);
    responseId = stringValue(response?.id) ?? responseId;
    usage = responseUsage(response) ?? usage;

    if (type === "response.output_text.delta") {
      const delta = stringValue(event.delta) ?? "";
      text += delta;
      await emit(delta || undefined);
      return;
    }
    if (type === "response.reasoning_summary_text.delta") {
      const delta = stringValue(event.delta) ?? "";
      reasoningSummary += delta;
      await emit(undefined, delta || undefined);
      return;
    }
    if (type === "response.refusal.delta") {
      const delta = stringValue(event.delta) ?? "";
      refusal = `${refusal ?? ""}${delta}`;
      return;
    }
    if (type === "response.output_item.added" || type === "response.output_item.done") {
      const item = record(event.item);
      if (item?.type !== "function_call") return;
      const itemId = stringValue(item.id) ?? `item_${pending.size}`;
      const current = pending.get(itemId) ?? {
        itemId,
        id: stringValue(item.call_id) ?? itemId,
        name: stringValue(item.name) ?? "",
        argumentsText: "",
        order: pending.size
      };
      current.id = stringValue(item.call_id) ?? current.id;
      current.name = stringValue(item.name) ?? current.name;
      const completeArguments = stringValue(item.arguments);
      if (completeArguments !== undefined) current.argumentsText = completeArguments;
      pending.set(itemId, current);
      return;
    }
    if (type === "response.function_call_arguments.delta") {
      const itemId = stringValue(event.item_id) ?? `item_${pending.size}`;
      const current = pending.get(itemId) ?? { itemId, id: itemId, name: "", argumentsText: "", order: pending.size };
      const delta = stringValue(event.delta) ?? "";
      current.argumentsText += delta;
      pending.set(itemId, current);
      await emit(undefined, undefined, delta || undefined);
      return;
    }
    if (type === "response.completed") status = "completed";
    if (type === "response.incomplete") {
      status = "incomplete";
      incompleteReason = stringValue(record(response?.incomplete_details)?.reason) ?? "unknown";
    }
    if (type === "response.failed" || type === "error") {
      status = "failed";
      failureReason = stringValue(record(response?.error)?.message) ?? stringValue(record(event.error)?.message) ?? "responses_stream_failed";
    }
    if (type === "response.refusal.done") {
      status = "refused";
      refusal = stringValue(event.refusal) ?? refusal ?? "Model refused the Planner request.";
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value.byteLength > 0) await onActivity?.({ kind: "stream_data" });
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const data = dataLine(line);
      if (!data || data === "[DONE]") continue;
      try {
        await consume(JSON.parse(data));
      } catch {
        // Unknown or malformed provider events are ignored without corrupting accumulated output.
      }
    }
  }
  const trailing = dataLine(buffer);
  if (trailing && trailing !== "[DONE]") {
    try {
      await consume(JSON.parse(trailing));
    } catch {
      // Ignore malformed trailing data.
    }
  }

  return {
    protocol: "responses",
    status: status ?? "failed",
    text,
    reasoningSummary,
    toolCalls: finishedToolCalls(pending),
    responseId,
    incompleteReason,
    refusal,
    failureReason: failureReason ?? (status ? undefined : "responses_stream_ended_without_terminal_event"),
    usage
  };
}
