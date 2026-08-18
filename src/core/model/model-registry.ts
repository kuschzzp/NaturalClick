import type { ModelCapability, ProviderRef } from "./model-instance";

export interface ProviderMetadata {
  id: ProviderRef;
  label: string;
  defaultBaseUrl: string;
  keyPlaceholder: string;
  endpointVariant: "openai_compatible" | "anthropic" | "gemini";
  models: ModelCapability[];
}

export const providerRegistry: ProviderMetadata[] = [
  {
    id: "openai",
    label: "OpenAI",
    defaultBaseUrl: "https://api.openai.com/v1",
    keyPlaceholder: "sk-...",
    endpointVariant: "openai_compatible",
    models: [
      { id: "gpt-4o-mini", displayName: "GPT-4o mini", vision: true, tools: true, maxContextTokens: 128000 },
      { id: "gpt-4o", displayName: "GPT-4o", vision: true, tools: true, maxContextTokens: 128000 }
    ]
  },
  {
    id: "qwen",
    label: "Qwen",
    defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    keyPlaceholder: "sk-...",
    endpointVariant: "openai_compatible",
    models: [
      { id: "qwen-max", displayName: "Qwen Max", vision: false, tools: true, maxContextTokens: 32000 },
      { id: "qwen-vl-max", displayName: "Qwen VL Max", vision: true, tools: true, maxContextTokens: 32000 }
    ]
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    keyPlaceholder: "sk-...",
    endpointVariant: "openai_compatible",
    models: [{ id: "deepseek-chat", displayName: "DeepSeek Chat", vision: false, tools: true, maxContextTokens: 64000 }]
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    keyPlaceholder: "sk-or-...",
    endpointVariant: "openai_compatible",
    models: []
  },
  {
    id: "anthropic",
    label: "Anthropic",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    keyPlaceholder: "sk-ant-...",
    endpointVariant: "anthropic",
    models: [
      { id: "claude-3-5-haiku-latest", displayName: "Claude 3.5 Haiku", vision: true, tools: true, maxContextTokens: 200000 },
      { id: "claude-sonnet-4-5", displayName: "Claude Sonnet 4.5", vision: true, tools: true, maxContextTokens: 200000 }
    ]
  },
  {
    id: "gemini",
    label: "Gemini",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    keyPlaceholder: "AIza...",
    endpointVariant: "gemini",
    models: [{ id: "gemini-2.5-flash", displayName: "Gemini 2.5 Flash", vision: true, tools: true, maxContextTokens: 1000000 }]
  },
  {
    id: "custom",
    label: "OpenAI Compatible",
    defaultBaseUrl: "",
    keyPlaceholder: "API key",
    endpointVariant: "openai_compatible",
    models: []
  }
];

export function providerMetadata(provider: ProviderRef): ProviderMetadata | undefined {
  if (provider.startsWith("custom:")) return providerRegistry.find((item) => item.id === "custom");
  return providerRegistry.find((item) => item.id === provider);
}
