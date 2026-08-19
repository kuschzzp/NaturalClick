import { describe, expect, it } from "vitest";
import { createGlobalModelConfigFromRuntime, createModelConfigService } from "../../../src/core/model/model-config-service";
import type { ModelRole } from "../../../src/core/model/config";
import type { ModelConfigStore, ModelInstance, ModelSelection, RoleModelSelections } from "../../../src/core/model/model-instance";

function memoryStore(initial: ModelInstance[] = [], initialActive?: ModelSelection, initialRoleSelections: RoleModelSelections = {}): ModelConfigStore {
  let instances = [...initial];
  let active = initialActive;
  let roleSelections = { ...initialRoleSelections };
  return {
    listInstances: async () => instances,
    saveInstance: async (instance) => {
      instances = instances.filter((item) => item.id !== instance.id).concat(instance);
    },
    deleteInstance: async (id) => {
      instances = instances.filter((item) => item.id !== id);
      if (active?.instanceId === id) active = undefined;
      roleSelections = Object.fromEntries(Object.entries(roleSelections).filter(([, selection]) => selection?.instanceId !== id));
    },
    getActiveSelection: async () => active,
    setActiveSelection: async (selection) => {
      active = selection;
    },
    getRoleSelections: async () => roleSelections,
    setRoleSelection: async (role: ModelRole, selection: ModelSelection) => {
      roleSelections = { ...roleSelections, [role]: selection };
    },
    clearRoleSelection: async (role: ModelRole) => {
      const { [role]: _removed, ...nextSelections } = roleSelections;
      roleSelections = nextSelections;
      if (role === "planner") active = undefined;
    }
  };
}

const openAiInstance: ModelInstance = {
  id: "inst_1",
  provider: "openai",
  label: "OpenAI",
  baseUrl: "https://api.openai.com/v1",
  apiKeyRef: "secret:openai",
  models: [{ id: "gpt-4o-mini", vision: true, tools: true, maxContextTokens: 128000 }]
};

const mixedInstance: ModelInstance = {
  id: "inst_2",
  provider: "custom",
  label: "Mixed Provider",
  baseUrl: "https://api.example.com/v1",
  apiKeyRef: "secret:mixed",
  models: [
    { id: "text-fast", vision: false, tools: true, maxContextTokens: 64000 },
    { id: "vision-pro", vision: true, tools: false, maxContextTokens: 128000 }
  ]
};

describe("model config service", () => {
  it("selects the first configured model when no active selection exists", async () => {
    const service = createModelConfigService(memoryStore([openAiInstance]));

    await expect(service.resolveActiveRuntimeConfig()).resolves.toMatchObject({
      provider: "openai",
      model: "gpt-4o-mini",
      vision: true,
      tools: true
    });
  });

  it("resolves legacy instances to auto protocol with provider-aware capabilities", async () => {
    const service = createModelConfigService(memoryStore([openAiInstance]));

    await expect(service.resolveActiveRuntimeConfig()).resolves.toMatchObject({
      protocol: "auto",
      structuredOutputs: true,
      jsonMode: true,
      strictTools: true,
      reasoning: false
    });
  });

  it("preserves explicit legacy completions capabilities", async () => {
    const service = createModelConfigService(memoryStore([{
      ...mixedInstance,
      protocol: "completions",
      models: [{
        id: "legacy-text",
        vision: false,
        tools: false,
        structuredOutputs: false,
        jsonMode: false,
        strictTools: false,
        reasoning: false,
        maxContextTokens: 16000,
        maxOutputTokens: 4096
      }]
    }]));

    await expect(service.resolveActiveRuntimeConfig()).resolves.toMatchObject({
      protocol: "completions",
      model: "legacy-text",
      structuredOutputs: false,
      jsonMode: false,
      strictTools: false,
      reasoning: false,
      maxOutputTokens: 4096
    });
  });

  it("rejects selecting a model that is not in the instance model list", async () => {
    const service = createModelConfigService(memoryStore([openAiInstance]));

    await expect(service.setActiveSelection({ instanceId: "inst_1", model: "missing" })).rejects.toThrow("Unknown model missing");
  });

  it("stores the active planner selection as a planner role selection", async () => {
    const service = createModelConfigService(memoryStore([mixedInstance]));

    await service.setActiveSelection({ instanceId: "inst_2", model: "text-fast" });

    await expect(service.getActiveSelection()).resolves.toEqual({ instanceId: "inst_2", model: "text-fast" });
    await expect(service.getRoleSelections()).resolves.toMatchObject({
      planner: { instanceId: "inst_2", model: "text-fast" }
    });
  });

  it("resolves role-specific runtime configs from stored selections", async () => {
    const service = createModelConfigService(
      memoryStore([mixedInstance], undefined, {
        planner: { instanceId: "inst_2", model: "text-fast" },
        vision: { instanceId: "inst_2", model: "vision-pro" }
      })
    );

    await expect(service.resolveRuntimeConfigForRole("planner")).resolves.toMatchObject({
      instanceId: "inst_2",
      model: "text-fast",
      vision: false,
      tools: true
    });
    await expect(service.resolveRuntimeConfigForRole("vision")).resolves.toMatchObject({
      instanceId: "inst_2",
      model: "vision-pro",
      vision: true,
      tools: false
    });
  });

  it("keeps vision disabled unless the planner can see or a vision role is selected", async () => {
    const service = createModelConfigService(memoryStore([mixedInstance], { instanceId: "inst_2", model: "text-fast" }));

    await expect(service.resolveRuntimeConfigForRole("vision")).resolves.toBeUndefined();
  });

  it("rejects vision role selections that do not support vision input", async () => {
    const service = createModelConfigService(memoryStore([mixedInstance]));

    await expect(service.setRoleSelection("vision", { instanceId: "inst_2", model: "text-fast" })).rejects.toThrow(
      "Model text-fast cannot be selected for vision"
    );
  });

  it("clears a role selection without disturbing the planner selection", async () => {
    const service = createModelConfigService(
      memoryStore([mixedInstance], undefined, {
        planner: { instanceId: "inst_2", model: "text-fast" },
        vision: { instanceId: "inst_2", model: "vision-pro" }
      })
    );

    await service.clearRoleSelection("vision");

    await expect(service.getRoleSelections()).resolves.toEqual({
      planner: { instanceId: "inst_2", model: "text-fast" }
    });
    await expect(service.resolveRuntimeConfigForRole("vision")).resolves.toBeUndefined();
  });

  it("clears legacy active selection when the planner role is cleared", async () => {
    const service = createModelConfigService(
      memoryStore([mixedInstance], { instanceId: "inst_2", model: "text-fast" }, {
        planner: { instanceId: "inst_2", model: "text-fast" },
        vision: { instanceId: "inst_2", model: "vision-pro" }
      })
    );

    await service.clearRoleSelection("planner");

    await expect(service.getActiveSelection()).resolves.toBeUndefined();
    await expect(service.getRoleSelections()).resolves.toEqual({
      vision: { instanceId: "inst_2", model: "vision-pro" }
    });
  });

  it("falls verifier and summarizer roles back to the planner selection", async () => {
    const service = createModelConfigService(memoryStore([mixedInstance], { instanceId: "inst_2", model: "text-fast" }));

    await expect(service.resolveRuntimeConfigForRole("verifier")).resolves.toMatchObject({
      instanceId: "inst_2",
      model: "text-fast"
    });
    await expect(service.resolveRuntimeConfigForRole("summarizer")).resolves.toMatchObject({
      instanceId: "inst_2",
      model: "text-fast"
    });
  });

  it("falls back to the first instance when the stored selection is stale", async () => {
    const service = createModelConfigService(memoryStore([openAiInstance], { instanceId: "deleted", model: "old" }));

    await expect(service.resolveActiveRuntimeConfig()).resolves.toMatchObject({
      instanceId: "inst_1",
      model: "gpt-4o-mini"
    });
  });

  it("builds global config with compatible role model selections", async () => {
    const service = createModelConfigService(
      memoryStore([mixedInstance], undefined, {
        planner: { instanceId: "inst_2", model: "text-fast" },
        vision: { instanceId: "inst_2", model: "vision-pro" }
      })
    );

    const globalConfig = await service.resolveGlobalModelConfig();

    expect(globalConfig?.provider.baseUrl).toBe("https://api.example.com/v1");
    expect(globalConfig?.roleModels).toMatchObject({
      plannerModel: "text-fast",
      visionModel: "vision-pro"
    });
    expect(globalConfig?.capabilities.supportsToolUse).toBe(true);
    expect(globalConfig?.capabilities.supportsVisionInput).toBe(true);
    expect(globalConfig?.privacy.sendScreenshotsToRemoteVision).toBe(true);
  });

  it("does not place cross-provider role models into the single-provider global config", async () => {
    const planner = {
      instanceId: "inst_2",
      provider: "custom" as const,
      providerLabel: "Mixed Provider",
      model: "text-fast",
      baseUrl: "https://api.example.com/v1",
      apiKeyRef: "secret:mixed",
      vision: false,
      tools: true,
      maxContextTokens: 64000
    };
    const vision = {
      instanceId: "inst_1",
      provider: "openai" as const,
      providerLabel: "OpenAI",
      model: "gpt-4o-mini",
      baseUrl: "https://api.openai.com/v1",
      apiKeyRef: "secret:openai",
      vision: true,
      tools: true,
      maxContextTokens: 128000
    };

    const globalConfig = createGlobalModelConfigFromRuntime(planner, { planner, vision });

    expect(globalConfig.provider.baseUrl).toBe("https://api.example.com/v1");
    expect(globalConfig.roleModels.plannerModel).toBe("text-fast");
    expect(globalConfig.roleModels.visionModel).toBeUndefined();
    expect(globalConfig.capabilities.supportsVisionInput).toBe(false);
    expect(globalConfig.privacy.sendScreenshotsToRemoteVision).toBe(false);
  });

  it("converts runtime selection into the existing global config shape", async () => {
    const service = createModelConfigService(memoryStore([openAiInstance]));
    const runtimeConfig = await service.resolveActiveRuntimeConfig();

    expect(runtimeConfig).toBeDefined();
    const globalConfig = createGlobalModelConfigFromRuntime(runtimeConfig!);

    expect(globalConfig.provider.baseUrl).toBe("https://api.openai.com/v1");
    expect(globalConfig.provider.apiKeyRef).toBe("secret:openai");
    expect(globalConfig.roleModels.plannerModel).toBe("gpt-4o-mini");
    expect(globalConfig.roleModels.visionModel).toBe("gpt-4o-mini");
    expect(globalConfig.capabilities.supportsToolUse).toBe(true);
  });
});
