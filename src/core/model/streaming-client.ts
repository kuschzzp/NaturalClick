import {
  extractOpenAICompatibleCompletionText,
  extractOpenAICompatibleContentText,
  extractOpenAICompatibleReasoningText,
  extractOpenAICompatibleToolCallDeltas,
  type OpenAICompatibleToolCall
} from "./openai-compatible";

export interface StreamProgress {
  chunk: string;
  reasoningChunk?: string;
  toolArgumentsChunk?: string;
  visibleChunk: string;
  accumulatedText: string;
  chunkIndex: number;
  receivedChars: number;
  visibleReceivedChars: number;
  toolCallNames?: string[];
  toolArgumentsChars?: number;
}

export interface OpenAICompatibleStreamTurn {
  text: string;
  toolCalls: OpenAICompatibleToolCall[];
  toolArgumentsText: string;
  responseId?: string;
  finishReason?: string;
  refusal?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    reasoningTokens?: number;
  };
}

export interface OpenAICompatibleStreamOptions {
  protocol?: "chat_completions" | "completions";
  onActivity?: () => void | Promise<void>;
}

interface PendingToolCall {
  id?: string;
  name?: string;
  argumentsText: string;
  index?: number;
  order: number;
}

function parseDataLine(line: string): string | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return undefined;
  return trimmed.slice("data:".length).trim();
}

export async function readOpenAICompatibleStream(
  stream: ReadableStream<Uint8Array>,
  onProgress?: (progress: StreamProgress) => void | Promise<void>
): Promise<string> {
  const turn = await readOpenAICompatibleStreamTurn(stream, onProgress);
  if (turn.text) return turn.text;
  return turn.toolCalls.map((call) => call.argumentsText).join("") || turn.toolArgumentsText;
}

export async function readOpenAICompatibleStreamTurn(
  stream: ReadableStream<Uint8Array>,
  onProgress?: (progress: StreamProgress) => void | Promise<void>,
  options: OpenAICompatibleStreamOptions = {}
): Promise<OpenAICompatibleStreamTurn> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let visibleReceivedChars = 0;
  let chunkIndex = 0;
  const pendingToolCalls = new Map<string, PendingToolCall>();
  let responseId: string | undefined;
  let finishReason: string | undefined;
  let refusal: string | undefined;
  let usage: OpenAICompatibleStreamTurn["usage"];

  const updateMetadata = (payload: unknown): void => {
    if (!payload || typeof payload !== "object") return;
    const record = payload as Record<string, unknown>;
    if (typeof record.id === "string") responseId = record.id;
    const choice = Array.isArray(record.choices) && record.choices[0] && typeof record.choices[0] === "object"
      ? record.choices[0] as Record<string, unknown>
      : undefined;
    if (typeof choice?.finish_reason === "string") finishReason = choice.finish_reason;
    const message = choice?.delta && typeof choice.delta === "object" ? choice.delta as Record<string, unknown>
      : choice?.message && typeof choice.message === "object" ? choice.message as Record<string, unknown>
      : undefined;
    if (typeof message?.refusal === "string") refusal = `${refusal ?? ""}${message.refusal}`;
    const rawUsage = record.usage && typeof record.usage === "object" ? record.usage as Record<string, unknown> : undefined;
    if (rawUsage) {
      const details = rawUsage.completion_tokens_details && typeof rawUsage.completion_tokens_details === "object"
        ? rawUsage.completion_tokens_details as Record<string, unknown>
        : undefined;
      usage = {
        inputTokens: typeof rawUsage.prompt_tokens === "number" ? rawUsage.prompt_tokens : undefined,
        outputTokens: typeof rawUsage.completion_tokens === "number" ? rawUsage.completion_tokens : undefined,
        reasoningTokens: typeof details?.reasoning_tokens === "number" ? details.reasoning_tokens : undefined
      };
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value.byteLength > 0) await options.onActivity?.();
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const data = parseDataLine(line);
      if (!data) continue;
      if (data === "[DONE]") return finishedStreamTurn(text, pendingToolCalls, { responseId, finishReason, refusal, usage });
      try {
        const payload = JSON.parse(data);
        updateMetadata(payload);
        const toolProgress = mergeToolCallDeltas(pendingToolCalls, payload);
        const chunk = options.protocol === "completions"
          ? extractOpenAICompatibleCompletionText(payload)
          : extractOpenAICompatibleContentText(payload);
        const reasoningChunk = extractOpenAICompatibleReasoningText(payload);
        const visibleChunk = `${chunk}${reasoningChunk}${toolProgress.argumentsChunk}`;
        if (chunk) {
          text += chunk;
        }
        if (visibleChunk || toolProgress.changed) {
          chunkIndex += 1;
          visibleReceivedChars += visibleChunk.length;
          await onProgress?.({
            chunk,
            reasoningChunk: reasoningChunk || undefined,
            toolArgumentsChunk: toolProgress.argumentsChunk || undefined,
            visibleChunk,
            accumulatedText: text,
            chunkIndex,
            receivedChars: text.length,
            visibleReceivedChars,
            toolCallNames: pendingToolCallNames(pendingToolCalls),
            toolArgumentsChars: pendingToolArgumentsChars(pendingToolCalls)
          });
        }
      } catch {
        // Some OpenAI-compatible providers send keepalive or non-JSON data lines.
      }
    }
  }

  const remaining = parseDataLine(buffer);
  if (remaining && remaining !== "[DONE]") {
    try {
      const payload = JSON.parse(remaining);
      updateMetadata(payload);
      mergeToolCallDeltas(pendingToolCalls, payload);
      text += options.protocol === "completions"
        ? extractOpenAICompatibleCompletionText(payload)
        : extractOpenAICompatibleContentText(payload);
    } catch {
      // Ignore malformed trailing data.
    }
  }
  return finishedStreamTurn(text, pendingToolCalls, { responseId, finishReason, refusal, usage });
}

function mergeToolCallDeltas(pending: Map<string, PendingToolCall>, payload: unknown): { changed: boolean; argumentsChunk: string } {
  const deltas = extractOpenAICompatibleToolCallDeltas(payload);
  for (const delta of deltas) {
    const key = delta.index !== undefined ? `index:${delta.index}` : delta.id ? `id:${delta.id}` : `fallback:${pending.size}`;
    const current = pending.get(key) ?? {
      argumentsText: "",
      index: delta.index,
      order: pending.size
    };
    current.id = delta.id ?? current.id;
    current.index = delta.index ?? current.index;
    if (delta.name) current.name = `${current.name ?? ""}${delta.name}`;
    current.argumentsText += delta.argumentsText;
    pending.set(key, current);
  }
  return {
    changed: deltas.length > 0,
    argumentsChunk: deltas.map((delta) => delta.argumentsText).join("")
  };
}

function pendingToolCallNames(pending: Map<string, PendingToolCall>): string[] {
  return [...pending.values()].flatMap((call) => call.name?.trim() ? [call.name.trim()] : []);
}

function pendingToolArgumentsChars(pending: Map<string, PendingToolCall>): number {
  return [...pending.values()].reduce((count, call) => count + call.argumentsText.length, 0);
}

function finishedToolCalls(pending: Map<string, PendingToolCall>): OpenAICompatibleToolCall[] {
  return [...pending.values()]
    .sort((left, right) => left.order - right.order)
    .flatMap((call, fallbackIndex): OpenAICompatibleToolCall[] => {
      const name = call.name?.trim();
      if (!name) return [];
      return [
        {
          id: call.id ?? `call_${call.index ?? fallbackIndex}`,
          name,
          argumentsText: call.argumentsText,
          index: call.index
        }
      ];
    });
}

function finishedStreamTurn(
  text: string,
  pending: Map<string, PendingToolCall>,
  metadata: Pick<OpenAICompatibleStreamTurn, "responseId" | "finishReason" | "refusal" | "usage"> = {}
): OpenAICompatibleStreamTurn {
  return {
    text,
    toolCalls: finishedToolCalls(pending),
    toolArgumentsText: [...pending.values()]
      .sort((left, right) => left.order - right.order)
      .map((call) => call.argumentsText)
      .join(""),
    ...(metadata.responseId ? { responseId: metadata.responseId } : {}),
    ...(metadata.finishReason ? { finishReason: metadata.finishReason } : {}),
    ...(metadata.refusal ? { refusal: metadata.refusal } : {}),
    ...(metadata.usage ? { usage: metadata.usage } : {})
  };
}
