export interface ModelSettingsState {
  providerBaseUrl: string;
  apiKey: string;
  plannerModel: string;
  visionModel?: string;
  apiKeyRef: string;
}

export interface SettingsValidationResult {
  ok: boolean;
  errors: Record<string, string>;
}

export function defaultModelSettings(): ModelSettingsState {
  return {
    providerBaseUrl: "https://api.openai.com/v1",
    apiKey: "",
    plannerModel: "",
    visionModel: "",
    apiKeyRef: "naturalclick:model-api-key"
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
