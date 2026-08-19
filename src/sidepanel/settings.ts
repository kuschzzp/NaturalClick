import type { ModelApiProtocol, ModelInstance, ModelSelection } from "../core/model/model-instance";
import type { ModelConfigProtocolRequest } from "../shared/protocol";
export {
  defaultCapabilitySettings,
  resolveCapabilitySettings,
  serializeCapabilitySettings,
  type CapabilitySettingsState,
  type SearchProviderMode
} from "../core/capabilities/settings";

export interface ModelSettingsState {
  providerBaseUrl: string;
  apiKey: string;
  plannerModel: string;
  visionModel?: string;
  apiKeyRef: string;
  protocol?: ModelApiProtocol;
}

export type ModelSettingField = "providerBaseUrl" | "apiKey" | "plannerModel" | "visionModel" | "protocol";

export interface ModelConfigPanelState {
  instances: ModelInstance[];
  activeSelection?: ModelSelection;
  draft: ModelSettingsState;
  saving: boolean;
  lastError?: string;
}

export interface SettingsValidationResult {
  ok: boolean;
  errors: Record<string, string>;
}

export const LEGACY_MODEL_INSTANCE_ID = "legacy_openai_compatible";

export type ExistingModelInstanceDraft = Pick<ModelInstance, "id" | "provider" | "label" | "endpointVariant" | "protocol" | "createdAt">;

export function isModelApiProtocol(value: unknown): value is ModelApiProtocol {
  return value === "auto" || value === "responses" || value === "chat_completions" || value === "completions";
}

export function defaultModelSettings(): ModelSettingsState {
  return {
    providerBaseUrl: "https://api.openai.com/v1",
    apiKey: "",
    plannerModel: "",
    visionModel: "",
    apiKeyRef: "naturalclick:model-api-key",
    protocol: "auto"
  };
}

export function validateModelSettings(settings: ModelSettingsState): SettingsValidationResult {
  const errors: Record<string, string> = {};
  if (!settings.providerBaseUrl.trim()) {
    errors.providerBaseUrl = "Provider URL is required.";
  }
  if (!settings.apiKey.trim()) {
    errors.apiKey = "API key is required.";
  }
  if (!settings.plannerModel.trim()) {
    errors.plannerModel = "Planner model is required.";
  }
  if (!settings.apiKeyRef.trim()) {
    errors.apiKeyRef = "API key reference is required.";
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

export function legacySettingsToModelInstance(
  settings: ModelSettingsState,
  detectedModels: string[] = [],
  existingInstance?: ExistingModelInstanceDraft
): ModelInstance | undefined {
  const providerBaseUrl = settings.providerBaseUrl.trim();
  const apiKeyRef = settings.apiKeyRef.trim();
  const models = Array.from(new Set([settings.plannerModel, settings.visionModel ?? "", ...detectedModels].map((item) => item.trim()).filter(Boolean)));
  if (!providerBaseUrl || !apiKeyRef || models.length === 0) return undefined;
  return {
    id: existingInstance?.id ?? LEGACY_MODEL_INSTANCE_ID,
    provider: existingInstance?.provider ?? "custom",
    label: existingInstance?.label ?? "OpenAI Compatible",
    baseUrl: providerBaseUrl,
    apiKeyRef,
    endpointVariant: existingInstance?.endpointVariant ?? "openai_compatible",
    protocol: settings.protocol ?? existingInstance?.protocol ?? "auto",
    createdAt: existingInstance?.createdAt,
    models: models.map((id) => ({
      id,
      vision: id === settings.visionModel || looksLikeVisionModel(id),
      tools: looksLikeToolCapableModel(id),
      maxContextTokens: 128000
    }))
  };
}

export function legacySettingsToModelConfigSyncRequests(
  settings: ModelSettingsState,
  detectedModels: string[] = [],
  existingInstance?: ExistingModelInstanceDraft
): ModelConfigProtocolRequest[] {
  const instance = legacySettingsToModelInstance(settings, detectedModels, existingInstance);
  const plannerModel = settings.plannerModel.trim();
  if (!instance || !plannerModel) {
    return [{ type: "DELETE_MODEL_INSTANCE", instanceId: existingInstance?.id ?? LEGACY_MODEL_INSTANCE_ID }];
  }

  const requests: ModelConfigProtocolRequest[] = [
    { type: "SAVE_MODEL_INSTANCE", instance },
    {
      type: "SET_ROLE_MODEL_SELECTION",
      role: "planner",
      selection: { instanceId: instance.id, model: plannerModel }
    }
  ];
  const visionModel = (settings.visionModel ?? "").trim();
  if (visionModel) {
    requests.push({
      type: "SET_ROLE_MODEL_SELECTION",
      role: "vision",
      selection: { instanceId: instance.id, model: visionModel }
    });
  } else {
    requests.push({ type: "CLEAR_ROLE_MODEL_SELECTION", role: "vision" });
  }
  return requests;
}

export function defaultModelConfigPanelState(settings: ModelSettingsState = defaultModelSettings(), detectedModels: string[] = []): ModelConfigPanelState {
  const instance = legacySettingsToModelInstance(settings, detectedModels);
  return {
    instances: instance ? [instance] : [],
    activeSelection: instance && settings.plannerModel.trim() ? { instanceId: instance.id, model: settings.plannerModel.trim() } : undefined,
    draft: settings,
    saving: false
  };
}

export function plannerModelChoices(detectedModels: string[], currentModel = ""): string[] {
  const models = uniqueModelIds(detectedModels);
  const plannerModels = models.filter(looksLikeToolCapableModel);
  return uniqueModelIds([currentModel, ...(plannerModels.length > 0 ? plannerModels : models)]);
}

export function visionModelChoices(detectedModels: string[], currentModel = ""): string[] {
  const models = uniqueModelIds(detectedModels);
  const visionModels = models.filter(looksLikeVisionModel);
  return uniqueModelIds([currentModel, ...(visionModels.length > 0 ? visionModels : models)]);
}

export function preferredPlannerModelAfterDetection(detectedModels: string[], currentModel = ""): string {
  const models = uniqueModelIds(detectedModels);
  const current = currentModel.trim();
  if (current && models.includes(current)) return current;
  return models.find(looksLikeToolCapableModel) ?? models[0] ?? "";
}

function uniqueModelIds(models: string[]): string[] {
  return Array.from(new Set(models.map((item) => item.trim()).filter(Boolean)));
}

export function looksLikeVisionModel(model: string): boolean {
  return /\b(vl|vision|visual)\b/i.test(model) || /^gpt-4o/i.test(model) || /^gemini/i.test(model);
}

export function looksLikeToolCapableModel(model: string): boolean {
  const normalized = model.toLowerCase();
  if (/(image|img|voice|speech|audio|asr|tts|rerank|embed|embedding|moderation)/.test(normalized)) return false;
  return /(gpt|qwen|deepseek|claude|gemini|kimi|glm|minimax|moonshot|mistral|llama|yi|doubao)/.test(normalized);
}
