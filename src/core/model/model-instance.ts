import type { ModelRole } from "./config";

export type BuiltInProviderRef = "openai" | "anthropic" | "gemini" | "openrouter" | "qwen" | "deepseek" | "custom";

export type ProviderRef = BuiltInProviderRef | `custom:${string}`;

export type ModelApiProtocol = "auto" | "responses" | "chat_completions" | "completions";

export interface ModelCapability {
  id: string;
  displayName?: string;
  vision: boolean;
  tools: boolean;
  structuredOutputs?: boolean;
  jsonMode?: boolean;
  strictTools?: boolean;
  reasoning?: boolean;
  maxContextTokens: number;
  maxOutputTokens?: number;
}

export interface ModelInstance {
  id: string;
  provider: ProviderRef;
  label: string;
  baseUrl: string;
  apiKeyRef: string;
  protocol?: ModelApiProtocol;
  models: ModelCapability[];
  endpointVariant?: "openai_compatible" | "anthropic" | "gemini";
  createdAt?: number;
  updatedAt?: number;
}

export interface ModelSelection {
  instanceId: string;
  model: string;
}

export type RoleModelSelections = Partial<Record<ModelRole, ModelSelection>>;

export interface ModelRuntimeConfig {
  instanceId: string;
  provider: ProviderRef;
  providerLabel: string;
  model: string;
  baseUrl: string;
  apiKeyRef: string;
  protocol?: ModelApiProtocol;
  vision: boolean;
  tools: boolean;
  structuredOutputs?: boolean;
  jsonMode?: boolean;
  strictTools?: boolean;
  reasoning?: boolean;
  maxContextTokens: number;
  maxOutputTokens?: number;
}

export type RoleRuntimeConfigs = Partial<Record<ModelRole, ModelRuntimeConfig>>;

export interface ModelConfigStore {
  listInstances(): Promise<ModelInstance[]>;
  saveInstance(instance: ModelInstance): Promise<void>;
  deleteInstance(id: string): Promise<void>;
  getActiveSelection(): Promise<ModelSelection | undefined>;
  setActiveSelection(selection: ModelSelection): Promise<void>;
  getRoleSelections(): Promise<RoleModelSelections>;
  setRoleSelection(role: ModelRole, selection: ModelSelection): Promise<void>;
  clearRoleSelection(role: ModelRole): Promise<void>;
}
