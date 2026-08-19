import type { GlobalModelConfig, ModelRole } from "./config";
import type { ModelConfigStore, ModelInstance, ModelRuntimeConfig, ModelSelection, RoleModelSelections, RoleRuntimeConfigs } from "./model-instance";
import { providerMetadata } from "./model-registry";

const MODEL_ROLES: ModelRole[] = ["planner", "vision", "verifier", "summarizer"];

export interface ModelConfigService {
  listInstances(): Promise<ModelInstance[]>;
  saveInstance(instance: ModelInstance): Promise<void>;
  deleteInstance(id: string): Promise<void>;
  getActiveSelection(): Promise<ModelSelection | undefined>;
  setActiveSelection(selection: ModelSelection): Promise<void>;
  getRoleSelections(): Promise<RoleModelSelections>;
  setRoleSelection(role: ModelRole, selection: ModelSelection): Promise<void>;
  clearRoleSelection(role: ModelRole): Promise<void>;
  resolveActiveRuntimeConfig(): Promise<ModelRuntimeConfig | undefined>;
  resolveRuntimeConfigForRole(role: ModelRole): Promise<ModelRuntimeConfig | undefined>;
  resolveRoleRuntimeConfigs(): Promise<RoleRuntimeConfigs>;
  resolveGlobalModelConfig(): Promise<GlobalModelConfig | undefined>;
}

export function createModelConfigService(store: ModelConfigStore): ModelConfigService {
  async function listInstances(): Promise<ModelInstance[]> {
    return store.listInstances();
  }

  async function saveInstance(instance: ModelInstance): Promise<void> {
    assertValidInstance(instance);
    await store.saveInstance({
      ...instance,
      label: instance.label.trim() || providerMetadata(instance.provider)?.label || instance.provider,
      updatedAt: Date.now()
    });
  }

  async function deleteInstance(id: string): Promise<void> {
    await store.deleteInstance(id);
  }

  async function getActiveSelection(): Promise<ModelSelection | undefined> {
    return store.getActiveSelection();
  }

  async function resolveActiveRuntimeConfig(): Promise<ModelRuntimeConfig | undefined> {
    return resolveRuntimeConfigForRole("planner");
  }

  async function resolveRuntimeConfigForRole(role: ModelRole): Promise<ModelRuntimeConfig | undefined> {
    const instances = await store.listInstances();
    if (instances.length === 0) return undefined;
    const [active, roleSelections] = await Promise.all([store.getActiveSelection(), store.getRoleSelections()]);
    const selected = roleSelections[role] ?? (role === "planner" ? active : undefined);
    const resolved = resolveSelection(instances, role, selected);
    if (resolved) return resolved;

    if (role === "planner") {
      return resolveFirstAvailableModel(instances);
    }
    if (role === "vision") {
      const planner = resolveSelection(instances, "planner", roleSelections.planner ?? active) ?? resolveFirstAvailableModel(instances);
      return planner?.vision ? planner : undefined;
    }
    return resolveRuntimeConfigForRole("planner");
  }

  async function setActiveSelection(selection: ModelSelection): Promise<void> {
    await assertValidSelection(selection, "planner");
    await store.setActiveSelection(selection);
    await store.setRoleSelection("planner", selection);
  }

  async function getRoleSelections(): Promise<RoleModelSelections> {
    return store.getRoleSelections();
  }

  async function setRoleSelection(role: ModelRole, selection: ModelSelection): Promise<void> {
    await assertValidSelection(selection, role);
    await store.setRoleSelection(role, selection);
    if (role === "planner") {
      await store.setActiveSelection(selection);
    }
  }

  async function clearRoleSelection(role: ModelRole): Promise<void> {
    await store.clearRoleSelection(role);
  }

  async function resolveRoleRuntimeConfigs(): Promise<RoleRuntimeConfigs> {
    const entries = await Promise.all(MODEL_ROLES.map(async (role) => [role, await resolveRuntimeConfigForRole(role)] as const));
    return entries.reduce<RoleRuntimeConfigs>((configs, [role, runtime]) => {
      if (runtime) configs[role] = runtime;
      return configs;
    }, {});
  }

  async function resolveGlobalModelConfig(): Promise<GlobalModelConfig | undefined> {
    const roleRuntimes = await resolveRoleRuntimeConfigs();
    const plannerRuntime = roleRuntimes.planner;
    return plannerRuntime ? createGlobalModelConfigFromRuntime(plannerRuntime, roleRuntimes) : undefined;
  }

  async function assertValidSelection(selection: ModelSelection, role: ModelRole): Promise<void> {
    const instances = await store.listInstances();
    const resolved = resolveSelection(instances, role, selection);
    if (!instances.some((item) => item.id === selection.instanceId)) {
      throw new Error(`Unknown model instance ${selection.instanceId}`);
    }
    const instance = instances.find((item) => item.id === selection.instanceId);
    if (!instance?.models.some((item) => item.id === selection.model)) {
      throw new Error(`Unknown model ${selection.model}`);
    }
    if (!resolved) {
      throw new Error(`Model ${selection.model} cannot be selected for ${role}`);
    }
  }

  return {
    listInstances,
    saveInstance,
    deleteInstance,
    clearRoleSelection,
    getActiveSelection,
    getRoleSelections,
    resolveActiveRuntimeConfig,
    resolveGlobalModelConfig,
    resolveRoleRuntimeConfigs,
    resolveRuntimeConfigForRole,
    setRoleSelection,
    setActiveSelection
  };
}

function resolveSelection(instances: ModelInstance[], role: ModelRole, selection?: ModelSelection): ModelRuntimeConfig | undefined {
  if (!selection) return undefined;
  const instance = instances.find((item) => item.id === selection.instanceId);
  const model = instance?.models.find((item) => item.id === selection.model);
  if (!instance || !model) return undefined;
  if (role === "vision" && !model.vision) return undefined;
  return toRuntimeConfig(instance, model);
}

function resolveFirstAvailableModel(instances: ModelInstance[]): ModelRuntimeConfig | undefined {
  const instance = instances.find((item) => item.models.length > 0);
  const model = instance?.models[0];
  return instance && model ? toRuntimeConfig(instance, model) : undefined;
}

function toRuntimeConfig(instance: ModelInstance, model: ModelInstance["models"][number]): ModelRuntimeConfig {
  const provider = providerMetadata(instance.provider);
  const officialOpenAi = instance.provider === "openai" && normalizedBaseUrl(instance.baseUrl) === "https://api.openai.com/v1";
  return {
    instanceId: instance.id,
    provider: instance.provider,
    providerLabel: instance.label || provider?.label || instance.provider,
    model: model.id,
    baseUrl: instance.baseUrl,
    apiKeyRef: instance.apiKeyRef,
    protocol: instance.protocol ?? "auto",
    vision: model.vision,
    tools: model.tools,
    structuredOutputs: model.structuredOutputs ?? officialOpenAi,
    jsonMode: model.jsonMode ?? officialOpenAi,
    strictTools: model.strictTools ?? (officialOpenAi && model.tools),
    reasoning: model.reasoning ?? /^(gpt-5|o\d)/i.test(model.id),
    maxContextTokens: model.maxContextTokens,
    maxOutputTokens: model.maxOutputTokens
  };
}

function assertValidInstance(instance: ModelInstance): void {
  if (!instance.id.trim()) throw new Error("Model instance id is required");
  if (!instance.baseUrl.trim()) throw new Error("Model instance baseUrl is required");
  if (!instance.apiKeyRef.trim()) throw new Error("Model instance apiKeyRef is required");
  if (!Array.isArray(instance.models)) throw new Error("Model instance models must be an array");
  for (const model of instance.models) {
    if (!model.id.trim()) throw new Error("Model id is required");
    if (!Number.isFinite(model.maxContextTokens) || model.maxContextTokens <= 0) {
      throw new Error(`Model ${model.id} maxContextTokens must be positive`);
    }
  }
}

export function createGlobalModelConfigFromRuntime(runtime: ModelRuntimeConfig, roleRuntimes: RoleRuntimeConfigs = {}): GlobalModelConfig {
  const plannerRuntime = roleRuntimes.planner ?? runtime;
  const visionRuntime = sharedProviderRuntime(plannerRuntime, roleRuntimes.vision);
  const verifierRuntime = sharedProviderRuntime(plannerRuntime, roleRuntimes.verifier);
  const summarizerRuntime = sharedProviderRuntime(plannerRuntime, roleRuntimes.summarizer);
  const visionModel = visionRuntime?.vision ? visionRuntime.model : plannerRuntime.vision ? plannerRuntime.model : undefined;
  const allRuntimes = [plannerRuntime, visionRuntime, verifierRuntime, summarizerRuntime].filter((item): item is ModelRuntimeConfig => Boolean(item));
  const maxContextTokens = Math.max(...allRuntimes.map((item) => item.maxContextTokens), plannerRuntime.maxContextTokens);
  const maxOutputTokens = Math.max(...allRuntimes.map((item) => item.maxOutputTokens ?? 4096), plannerRuntime.maxOutputTokens ?? 4096);

  return {
    provider: {
      baseUrl: plannerRuntime.baseUrl,
      apiKeyRef: plannerRuntime.apiKeyRef,
      compatibilityMode: "openai_compatible",
      defaultHeaders: {}
    },
    roleModels: {
      plannerModel: plannerRuntime.model,
      visionModel,
      verifierModel: verifierRuntime?.model,
      summarizerModel: summarizerRuntime?.model
    },
    capabilities: {
      supportsStreaming: true,
      supportsJsonMode: false,
      supportsToolUse: plannerRuntime.tools,
      supportsVisionInput: Boolean(visionModel),
      supportsReasoningSummary: false,
      maxContextTokens,
      maxOutputTokens
    },
    runtime: {
      planner: { requestTimeoutMs: 120000, firstTokenTimeoutMs: 30000, maxRetries: 1, contractRepairAttempts: 1 },
      vision: { requestTimeoutMs: 45000, firstTokenTimeoutMs: 15000, maxRetries: 0, minIntervalMs: 750, maxCallsPerStep: 1 },
      verifier: { requestTimeoutMs: 15000, firstTokenTimeoutMs: 5000, maxRetries: 0 },
      summarizer: { requestTimeoutMs: 20000, firstTokenTimeoutMs: 8000, maxRetries: 0 }
    },
    contextBudget: {
      plannerMaxInputTokens: Math.max(4000, Math.min(plannerRuntime.maxContextTokens - 4096, 64000)),
      visionMaxInputTokens: 12000,
      verifierMaxInputTokens: 4000,
      summarizerMaxInputTokens: 6000,
      reservedOutputTokens: maxOutputTokens,
      evidenceLimit: 24,
      recentEventLimit: 18,
      observationCandidateLimit: 120,
      rawExcerptLimit: 12000,
      compressionStrategy: "evidence_first"
    },
    logging: { level: "summary", storeRawModelRequests: false, storeRawModelResponses: false, storeScreenshotImages: false },
    privacy: { redactSensitiveValues: true, sendScreenshotsToRemoteVision: Boolean(visionModel) }
  };
}

function sharedProviderRuntime(plannerRuntime: ModelRuntimeConfig, runtime?: ModelRuntimeConfig): ModelRuntimeConfig | undefined {
  if (!runtime) return undefined;
  return runtime.provider === plannerRuntime.provider &&
    normalizedBaseUrl(runtime.baseUrl) === normalizedBaseUrl(plannerRuntime.baseUrl) &&
    runtime.apiKeyRef === plannerRuntime.apiKeyRef
    ? runtime
    : undefined;
}

function normalizedBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}
