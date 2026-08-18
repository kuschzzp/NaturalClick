import type { ModelRole } from "../../core/model/config";
import type { ModelCapability, ModelConfigStore, ModelInstance, ModelSelection, ProviderRef, RoleModelSelections } from "../../core/model/model-instance";

const STORAGE_KEY_INSTANCES = "naturalclick.model.instances.v1";
const STORAGE_KEY_ACTIVE_SELECTION = "naturalclick.model.activeSelection.v1";
const STORAGE_KEY_ROLE_SELECTIONS = "naturalclick.model.roleSelections.v1";

export interface ModelConfigStorageArea {
  get(keys?: string | string[] | Record<string, unknown> | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

export function createChromeModelConfigStore(storage: ModelConfigStorageArea = chrome.storage.local): ModelConfigStore {
  async function listInstances(): Promise<ModelInstance[]> {
    const stored = await storage.get(STORAGE_KEY_INSTANCES);
    const value = stored[STORAGE_KEY_INSTANCES];
    return Array.isArray(value) ? value.map(readModelInstance).filter((item): item is ModelInstance => Boolean(item)) : [];
  }

  async function saveInstance(instance: ModelInstance): Promise<void> {
    const instances = await listInstances();
    const sanitized = sanitizeModelInstance(instance);
    const next = instances.filter((item) => item.id !== sanitized.id).concat(sanitized);
    await storage.set({ [STORAGE_KEY_INSTANCES]: next });
  }

  async function deleteInstance(id: string): Promise<void> {
    const instances = await listInstances();
    await storage.set({ [STORAGE_KEY_INSTANCES]: instances.filter((item) => item.id !== id) });
    const active = await getActiveSelection();
    if (active?.instanceId === id) {
      await storage.remove(STORAGE_KEY_ACTIVE_SELECTION);
    }
    const roleSelections = await getRoleSelections();
    const nextSelections = Object.fromEntries(Object.entries(roleSelections).filter(([, selection]) => selection?.instanceId !== id));
    await storage.set({ [STORAGE_KEY_ROLE_SELECTIONS]: nextSelections });
  }

  async function getActiveSelection(): Promise<ModelSelection | undefined> {
    const stored = await storage.get(STORAGE_KEY_ACTIVE_SELECTION);
    return readModelSelection(stored[STORAGE_KEY_ACTIVE_SELECTION]);
  }

  async function setActiveSelection(selection: ModelSelection): Promise<void> {
    await storage.set({ [STORAGE_KEY_ACTIVE_SELECTION]: selection });
  }

  async function getRoleSelections(): Promise<RoleModelSelections> {
    const stored = await storage.get(STORAGE_KEY_ROLE_SELECTIONS);
    return readRoleSelections(stored[STORAGE_KEY_ROLE_SELECTIONS]);
  }

  async function setRoleSelection(role: ModelRole, selection: ModelSelection): Promise<void> {
    const selections = await getRoleSelections();
    await storage.set({ [STORAGE_KEY_ROLE_SELECTIONS]: { ...selections, [role]: selection } });
  }

  async function clearRoleSelection(role: ModelRole): Promise<void> {
    const selections = await getRoleSelections();
    const { [role]: _removed, ...nextSelections } = selections;
    await storage.set({ [STORAGE_KEY_ROLE_SELECTIONS]: nextSelections });
    if (role === "planner") {
      await storage.remove(STORAGE_KEY_ACTIVE_SELECTION);
    }
  }

  return { listInstances, saveInstance, deleteInstance, getActiveSelection, setActiveSelection, getRoleSelections, setRoleSelection, clearRoleSelection };
}

function sanitizeModelInstance(instance: ModelInstance): ModelInstance {
  return {
    id: instance.id,
    provider: instance.provider,
    label: instance.label,
    baseUrl: instance.baseUrl,
    apiKeyRef: instance.apiKeyRef,
    endpointVariant: instance.endpointVariant,
    models: instance.models.map(sanitizeModelCapability),
    createdAt: instance.createdAt,
    updatedAt: instance.updatedAt
  };
}

function sanitizeModelCapability(model: ModelCapability): ModelCapability {
  return {
    id: model.id,
    displayName: model.displayName,
    vision: model.vision,
    tools: model.tools,
    maxContextTokens: model.maxContextTokens,
    maxOutputTokens: model.maxOutputTokens
  };
}

function readModelInstance(value: unknown): ModelInstance | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const models = Array.isArray(record.models) ? record.models.map(readModelCapability).filter((item): item is ModelCapability => Boolean(item)) : [];
  if (
    typeof record.id !== "string" ||
    !record.id.trim() ||
    !isProviderRef(record.provider) ||
    typeof record.label !== "string" ||
    typeof record.baseUrl !== "string" ||
    typeof record.apiKeyRef !== "string"
  ) {
    return undefined;
  }
  return {
    id: record.id,
    provider: record.provider,
    label: record.label,
    baseUrl: record.baseUrl,
    apiKeyRef: record.apiKeyRef,
    endpointVariant: readEndpointVariant(record.endpointVariant),
    models,
    createdAt: typeof record.createdAt === "number" && Number.isFinite(record.createdAt) ? record.createdAt : undefined,
    updatedAt: typeof record.updatedAt === "number" && Number.isFinite(record.updatedAt) ? record.updatedAt : undefined
  };
}

function readModelCapability(value: unknown): ModelCapability | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !record.id.trim()) return undefined;
  const maxContextTokens = typeof record.maxContextTokens === "number" && Number.isFinite(record.maxContextTokens) ? record.maxContextTokens : 32000;
  return {
    id: record.id,
    displayName: typeof record.displayName === "string" ? record.displayName : undefined,
    vision: record.vision === true,
    tools: record.tools === true,
    maxContextTokens,
    maxOutputTokens: typeof record.maxOutputTokens === "number" && Number.isFinite(record.maxOutputTokens) ? record.maxOutputTokens : undefined
  };
}

function readModelSelection(value: unknown): ModelSelection | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  return typeof record.instanceId === "string" && typeof record.model === "string"
    ? { instanceId: record.instanceId, model: record.model }
    : undefined;
}

function readRoleSelections(value: unknown): RoleModelSelections {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  return (["planner", "vision", "verifier", "summarizer"] as const).reduce<RoleModelSelections>((selections, role) => {
    const selection = readModelSelection(record[role]);
    if (selection) selections[role] = selection;
    return selections;
  }, {});
}

function isProviderRef(value: unknown): value is ProviderRef {
  return (
    value === "openai" ||
    value === "anthropic" ||
    value === "gemini" ||
    value === "openrouter" ||
    value === "qwen" ||
    value === "deepseek" ||
    value === "custom" ||
    (typeof value === "string" && value.startsWith("custom:"))
  );
}

function readEndpointVariant(value: unknown): ModelInstance["endpointVariant"] {
  return value === "openai_compatible" || value === "anthropic" || value === "gemini" ? value : undefined;
}
