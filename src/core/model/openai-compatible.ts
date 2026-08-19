interface ChatCompletionChoice {
  delta?: ChatMessageLike;
  message?: ChatMessageLike;
  text?: unknown;
  finish_reason?: unknown;
}

interface ChatCompletionLike {
  choices?: ChatCompletionChoice[];
}

interface ChatMessageLike {
  content?: string | Array<{ text?: string }>;
  reasoning?: string | Array<{ text?: string }>;
  reasoning_content?: string | Array<{ text?: string }>;
  reasoningContent?: string | Array<{ text?: string }>;
  refusal?: string;
  function_call?: {
    arguments?: unknown;
  };
  tool_calls?: Array<{
    id?: unknown;
    index?: unknown;
    function?: {
      name?: unknown;
      arguments?: unknown;
    };
  }>;
}

export interface OpenAICompatibleToolCall {
  id: string;
  name: string;
  argumentsText: string;
  index?: number;
}

export interface OpenAICompatibleToolCallDelta {
  id?: string;
  name?: string;
  argumentsText: string;
  index?: number;
}

function stringifyArgument(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return JSON.stringify(value);
  return "";
}

function contentText(content: ChatMessageLike["content"]): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((part) => part.text ?? "").join("");
  return "";
}

function argumentsText(message?: ChatMessageLike): string {
  const functionArguments = stringifyArgument(message?.function_call?.arguments);
  if (functionArguments) return functionArguments;
  const toolArguments = message?.tool_calls?.map((tool) => stringifyArgument(tool.function?.arguments)).find(Boolean);
  return toolArguments ?? "";
}

export function extractOpenAICompatibleText(payload: unknown): string {
  const choice = (payload as ChatCompletionLike | undefined)?.choices?.[0];
  const message = choice?.delta ?? choice?.message;
  const content = contentText(message?.content);
  if (content) return content;
  return argumentsText(message);
}

export function extractOpenAICompatibleContentText(payload: unknown): string {
  const choice = (payload as ChatCompletionLike | undefined)?.choices?.[0];
  const message = choice?.delta ?? choice?.message;
  return contentText(message?.content);
}

export function extractOpenAICompatibleReasoningText(payload: unknown): string {
  const choice = (payload as ChatCompletionLike | undefined)?.choices?.[0];
  const message = choice?.delta ?? choice?.message;
  return contentText(message?.reasoning_content) || contentText(message?.reasoning) || contentText(message?.reasoningContent);
}

export function extractOpenAICompatibleCompletionText(payload: unknown): string {
  const choice = (payload as ChatCompletionLike | undefined)?.choices?.[0];
  return typeof choice?.text === "string" ? choice.text : "";
}

export function extractOpenAICompatibleRefusal(payload: unknown): string {
  const choice = (payload as ChatCompletionLike | undefined)?.choices?.[0];
  const message = choice?.delta ?? choice?.message;
  return typeof message?.refusal === "string" ? message.refusal : "";
}

export function extractOpenAICompatibleToolCallDeltas(payload: unknown): OpenAICompatibleToolCallDelta[] {
  const choice = (payload as ChatCompletionLike | undefined)?.choices?.[0];
  const message = choice?.delta ?? choice?.message;
  return (message?.tool_calls ?? []).flatMap((tool): OpenAICompatibleToolCallDelta[] => {
    const name = typeof tool.function?.name === "string" ? tool.function.name.trim() : undefined;
    const index = typeof tool.index === "number" && Number.isFinite(tool.index) ? tool.index : undefined;
    const id = typeof tool.id === "string" && tool.id.trim() ? tool.id.trim() : undefined;
    const delta = stringifyArgument(tool.function?.arguments);
    if (!id && !name && !delta) return [];
    return [
      {
        id,
        name,
        argumentsText: delta,
        index
      }
    ];
  });
}

export function extractOpenAICompatibleToolCalls(payload: unknown): OpenAICompatibleToolCall[] {
  return extractOpenAICompatibleToolCallDeltas(payload).flatMap((tool, fallbackIndex): OpenAICompatibleToolCall[] => {
    if (!tool.name) return [];
    return [
      {
        id: tool.id ?? `call_${tool.index ?? fallbackIndex}`,
        name: tool.name,
        argumentsText: tool.argumentsText,
        index: tool.index
      }
    ];
  });
}

export function parseLooseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!match) return undefined;
    try {
      return JSON.parse(match[0]);
    } catch {
      return undefined;
    }
  }
}
