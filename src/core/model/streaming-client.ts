import {
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
  onProgress?: (progress: StreamProgress) => void | Promise<void>
): Promise<OpenAICompatibleStreamTurn> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let visibleReceivedChars = 0;
  let chunkIndex = 0;
  const pendingToolCalls = new Map<string, PendingToolCall>();

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const data = parseDataLine(line);
      if (!data) continue;
      if (data === "[DONE]") return finishedStreamTurn(text, pendingToolCalls);
      try {
        const payload = JSON.parse(data);
        const toolProgress = mergeToolCallDeltas(pendingToolCalls, payload);
        const chunk = extractOpenAICompatibleContentText(payload);
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
      mergeToolCallDeltas(pendingToolCalls, payload);
      text += extractOpenAICompatibleContentText(payload);
    } catch {
      // Ignore malformed trailing data.
    }
  }
  return finishedStreamTurn(text, pendingToolCalls);
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

function finishedStreamTurn(text: string, pending: Map<string, PendingToolCall>): OpenAICompatibleStreamTurn {
  return {
    text,
    toolCalls: finishedToolCalls(pending),
    toolArgumentsText: [...pending.values()]
      .sort((left, right) => left.order - right.order)
      .map((call) => call.argumentsText)
      .join("")
  };
}
