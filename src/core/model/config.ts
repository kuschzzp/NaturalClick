export type ModelRole = "planner" | "vision" | "verifier" | "summarizer";
export type CompatibilityMode = "openai" | "openai_compatible";

export interface ProviderConfig {
  baseUrl: string;
  apiKeyRef: string;
  compatibilityMode: CompatibilityMode;
  defaultHeaders: Record<string, string>;
}

export interface RoleModelConfig {
  plannerModel: string;
  visionModel?: string;
  verifierModel?: string;
  summarizerModel?: string;
}

export interface ModelCapabilities {
  supportsStreaming: boolean;
  supportsJsonMode: boolean;
  supportsToolUse: boolean;
  supportsVisionInput: boolean;
  supportsReasoningSummary: boolean;
  maxContextTokens: number;
  maxOutputTokens: number;
}

export interface RoleRuntimeConfig {
  requestTimeoutMs: number;
  firstTokenTimeoutMs: number;
  maxRetries: number;
  contractRepairAttempts?: number;
  minIntervalMs?: number;
  maxCallsPerStep?: number;
}

export interface ContextBudgetConfig {
  plannerMaxInputTokens: number;
  visionMaxInputTokens: number;
  verifierMaxInputTokens: number;
  summarizerMaxInputTokens: number;
  reservedOutputTokens: number;
  evidenceLimit: number;
  recentEventLimit: number;
  observationCandidateLimit: number;
  rawExcerptLimit: number;
  compressionStrategy: "evidence_first";
}

export interface ModelLoggingConfig {
  level: "summary" | "debug" | "raw" | "sensitive";
  storeRawModelRequests: boolean;
  storeRawModelResponses: boolean;
  storeScreenshotImages: boolean;
}

export interface ModelPrivacyConfig {
  redactSensitiveValues: boolean;
  sendScreenshotsToRemoteVision: boolean;
}

export interface GlobalModelConfig {
  provider: ProviderConfig;
  roleModels: RoleModelConfig;
  capabilities: ModelCapabilities;
  runtime: {
    planner: RoleRuntimeConfig;
    vision: RoleRuntimeConfig;
    verifier: RoleRuntimeConfig;
    summarizer: RoleRuntimeConfig;
  };
  contextBudget: ContextBudgetConfig;
  logging: ModelLoggingConfig;
  privacy: ModelPrivacyConfig;
}

export { createGlobalModelConfigFromRuntime } from "./model-config-service";
