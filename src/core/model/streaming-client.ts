import {
  extractOpenAICompatibleContentText,
  extractOpenAICompatibleToolCallDeltas,
  type OpenAICompatibleToolCall
} from "./openai-compatible";

export interface StreamProgress {
  chunk: string;
  accumulatedText: string;
  chunkIndex: number;
  receivedChars: number;
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
        mergeToolCallDeltas(pendingToolCalls, payload);
        const chunk = extractOpenAICompatibleContentText(payload);
        if (chunk) {
          text += chunk;
          chunkIndex += 1;
          await onProgress?.({
            chunk,
            accumulatedText: text,
            chunkIndex,
            receivedChars: text.length
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

function mergeToolCallDeltas(pending: Map<string, PendingToolCall>, payload: unknown): void {
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
