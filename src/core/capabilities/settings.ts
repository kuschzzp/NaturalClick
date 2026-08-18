export type SearchProviderMode = "disabled" | "browser_context" | "custom_endpoint";

export interface CapabilitySettingsState {
  skills: {
    slashCommandsEnabled: boolean;
    recordedWorkflowsEnabled: boolean;
    requireConfirmation: boolean;
  };
  search: {
    provider: SearchProviderMode;
    endpoint: string;
    apiKey: string;
    maxResults: number;
  };
}

export function defaultCapabilitySettings(): CapabilitySettingsState {
  return {
    skills: {
      slashCommandsEnabled: true,
      recordedWorkflowsEnabled: false,
      requireConfirmation: true
    },
    search: {
      provider: "browser_context",
      endpoint: "",
      apiKey: "",
      maxResults: 5
    }
  };
}

export function resolveCapabilitySettings(value: unknown): CapabilitySettingsState {
  const defaults = defaultCapabilitySettings();
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const skills = record.skills && typeof record.skills === "object" ? (record.skills as Record<string, unknown>) : {};
  const search = record.search && typeof record.search === "object" ? (record.search as Record<string, unknown>) : {};
  return {
    skills: {
      slashCommandsEnabled: typeof skills.slashCommandsEnabled === "boolean" ? skills.slashCommandsEnabled : defaults.skills.slashCommandsEnabled,
      recordedWorkflowsEnabled:
        typeof skills.recordedWorkflowsEnabled === "boolean" ? skills.recordedWorkflowsEnabled : defaults.skills.recordedWorkflowsEnabled,
      requireConfirmation: typeof skills.requireConfirmation === "boolean" ? skills.requireConfirmation : defaults.skills.requireConfirmation
    },
    search: {
      provider: isSearchProviderMode(search.provider) ? search.provider : defaults.search.provider,
      endpoint: typeof search.endpoint === "string" ? search.endpoint : defaults.search.endpoint,
      apiKey: typeof search.apiKey === "string" ? search.apiKey : defaults.search.apiKey,
      maxResults: normalizeMaxResults(search.maxResults, defaults.search.maxResults)
    }
  };
}

export function serializeCapabilitySettings(settings: CapabilitySettingsState): string {
  return JSON.stringify(resolveCapabilitySettings(settings));
}

function isSearchProviderMode(value: unknown): value is SearchProviderMode {
  return value === "disabled" || value === "browser_context" || value === "custom_endpoint";
}

function normalizeMaxResults(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(20, Math.max(1, Math.round(value)));
}
