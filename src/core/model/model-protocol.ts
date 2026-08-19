import type { OpenAICompatibleToolCall } from "./openai-compatible";
import type { ModelApiProtocol, ProviderRef } from "./model-instance";

export type ResolvedModelApiProtocol = Exclude<ModelApiProtocol, "auto">;
export type ModelTurnStatus = "completed" | "incomplete" | "refused" | "failed";

export interface ModelTokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
}

export interface ModelStreamProgress {
  contentChunk?: string;
  reasoningChunk?: string;
  toolArgumentsChunk?: string;
  accumulatedText: string;
  chunkIndex: number;
  receivedChars: number;
  visibleReceivedChars: number;
  toolCallNames?: string[];
  toolArgumentsChars?: number;
}

export interface ModelTransportActivity {
  kind: "response_headers" | "stream_data";
}

export interface ModelTurnResult {
  protocol: ResolvedModelApiProtocol;
  status: ModelTurnStatus;
  text: string;
  reasoningSummary: string;
  toolCalls: OpenAICompatibleToolCall[];
  responseId?: string;
  finishReason?: string;
  incompleteReason?: string;
  refusal?: string;
  failureReason?: string;
  usage?: ModelTokenUsage;
}

export function protocolCandidates(input: {
  protocol: ModelApiProtocol;
  provider: ProviderRef;
  baseUrl: string;
}): ResolvedModelApiProtocol[] {
  if (input.protocol !== "auto") return [input.protocol];
  const baseUrl = input.baseUrl.trim().replace(/\/+$/, "").toLowerCase();
  if (baseUrl === "https://api.openai.com/v1") {
    return ["responses", "chat_completions", "completions"];
  }
  return ["chat_completions", "completions"];
}

export function plannerOutputBudget(configured?: number): number {
  if (configured === undefined || !Number.isFinite(configured)) return 12000;
  return Math.max(8000, Math.min(32000, Math.floor(configured)));
}

export function expandedPlannerOutputBudget(current: number): number {
  return Math.max(8000, Math.min(32000, Math.ceil(current * 1.5)));
}
