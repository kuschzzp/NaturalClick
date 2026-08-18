import { describe, expect, it } from "vitest";
import {
  defaultModelConfigPanelState,
  legacySettingsToModelConfigSyncRequests,
  legacySettingsToModelInstance,
  plannerModelChoices,
  preferredPlannerModelAfterDetection,
  resolveCapabilitySettings,
  visionModelChoices
} from "../../../src/sidepanel/settings";
import type { ModelInstance } from "../../../src/core/model/model-instance";

describe("sidepanel model settings migration", () => {
  it("projects legacy model settings into a model instance without raw API key", () => {
    const instance = legacySettingsToModelInstance(
      {
        providerBaseUrl: "https://api.example.com/v1",
        apiKey: "sk-raw",
        plannerModel: "qwen-max",
        visionModel: "qwen-vl-max",
        apiKeyRef: "naturalclick:model-api-key"
      },
      ["qwen-max", "qwen-vl-max"]
    );

    expect(instance).toMatchObject({
      id: "legacy_openai_compatible",
      provider: "custom",
      baseUrl: "https://api.example.com/v1",
      apiKeyRef: "naturalclick:model-api-key"
    });
    expect(instance).not.toHaveProperty("apiKey");
    expect(instance?.models.map((model) => model.id)).toEqual(["qwen-max", "qwen-vl-max"]);
    expect(instance?.models.find((model) => model.id === "qwen-vl-max")?.vision).toBe(true);
    expect(instance?.models.find((model) => model.id === "qwen-max")?.tools).toBe(true);
  });

  it("does not infer browser tools for non-chat detected models", () => {
    const instance = legacySettingsToModelInstance(
      {
        providerBaseUrl: "https://api.example.com/v1",
        apiKey: "sk-raw",
        plannerModel: "qwen3-max",
        visionModel: "",
        apiKeyRef: "naturalclick:model-api-key"
      },
      ["qwen-image", "qwen3-asr-flash", "deepseek-chat"]
    );

    expect(instance?.models.find((model) => model.id === "qwen3-max")?.tools).toBe(true);
    expect(instance?.models.find((model) => model.id === "deepseek-chat")?.tools).toBe(true);
    expect(instance?.models.find((model) => model.id === "qwen-image")?.tools).toBe(false);
    expect(instance?.models.find((model) => model.id === "qwen3-asr-flash")?.tools).toBe(false);
  });

  it("builds a model config panel state from saved legacy settings", () => {
    const state = defaultModelConfigPanelState({
      providerBaseUrl: "https://api.openai.com/v1",
      apiKey: "sk-raw",
      plannerModel: "gpt-4o-mini",
      visionModel: "",
      apiKeyRef: "naturalclick:model-api-key"
    });

    expect(state.instances).toHaveLength(1);
    expect(state.activeSelection).toEqual({ instanceId: "legacy_openai_compatible", model: "gpt-4o-mini" });
    expect(state.saving).toBe(false);
  });

  it("builds sync messages for legacy planner and vision role selections", () => {
    const requests = legacySettingsToModelConfigSyncRequests(
      {
        providerBaseUrl: "https://api.example.com/v1",
        apiKey: "sk-raw",
        plannerModel: "qwen-max",
        visionModel: "qwen-vl-max",
        apiKeyRef: "naturalclick:model-api-key"
      },
      ["qwen-max", "qwen-vl-max"]
    );

    expect(requests.map((request) => request.type)).toEqual(["SAVE_MODEL_INSTANCE", "SET_ROLE_MODEL_SELECTION", "SET_ROLE_MODEL_SELECTION"]);
    expect(requests[0]).toMatchObject({
      type: "SAVE_MODEL_INSTANCE",
      instance: {
        id: "legacy_openai_compatible",
        baseUrl: "https://api.example.com/v1",
        apiKeyRef: "naturalclick:model-api-key"
      }
    });
    expect(requests[0]).not.toHaveProperty("instance.apiKey");
    expect(requests[1]).toEqual({
      type: "SET_ROLE_MODEL_SELECTION",
      role: "planner",
      selection: { instanceId: "legacy_openai_compatible", model: "qwen-max" }
    });
    expect(requests[2]).toEqual({
      type: "SET_ROLE_MODEL_SELECTION",
      role: "vision",
      selection: { instanceId: "legacy_openai_compatible", model: "qwen-vl-max" }
    });
  });

  it("clears the legacy vision role when no vision model is selected", () => {
    const requests = legacySettingsToModelConfigSyncRequests(
      {
        providerBaseUrl: "https://api.example.com/v1",
        apiKey: "sk-raw",
        plannerModel: "qwen-max",
        visionModel: "",
        apiKeyRef: "naturalclick:model-api-key"
      },
      ["qwen-max", "qwen-vl-max"]
    );

    expect(requests.map((request) => request.type)).toEqual(["SAVE_MODEL_INSTANCE", "SET_ROLE_MODEL_SELECTION", "CLEAR_ROLE_MODEL_SELECTION"]);
    expect(requests[2]).toEqual({ type: "CLEAR_ROLE_MODEL_SELECTION", role: "vision" });
  });

  it("builds a delete message when legacy settings no longer have a planner model", () => {
    const requests = legacySettingsToModelConfigSyncRequests(
      {
        providerBaseUrl: "https://api.example.com/v1",
        apiKey: "sk-raw",
        plannerModel: "",
        visionModel: "",
        apiKeyRef: "naturalclick:model-api-key"
      },
      ["old-model"]
    );

    expect(requests).toEqual([{ type: "DELETE_MODEL_INSTANCE", instanceId: "legacy_openai_compatible" }]);
  });

  it("preserves an edited core model instance identity when syncing settings", () => {
    const existing: ModelInstance = {
      id: "custom_provider_1",
      provider: "custom:workbench",
      label: "Workbench Provider",
      baseUrl: "https://old.example.com/v1",
      apiKeyRef: "secret:old",
      endpointVariant: "openai_compatible",
      createdAt: 123,
      models: [{ id: "old-model", vision: false, tools: true, maxContextTokens: 32000 }]
    };
    const requests = legacySettingsToModelConfigSyncRequests(
      {
        providerBaseUrl: "https://new.example.com/v1",
        apiKey: "sk-new",
        plannerModel: "qwen-max",
        visionModel: "",
        apiKeyRef: "secret:new"
      },
      ["qwen-max"],
      existing
    );

    expect(requests[0]).toMatchObject({
      type: "SAVE_MODEL_INSTANCE",
      instance: {
        id: "custom_provider_1",
        provider: "custom:workbench",
        label: "Workbench Provider",
        baseUrl: "https://new.example.com/v1",
        apiKeyRef: "secret:new",
        endpointVariant: "openai_compatible",
        createdAt: 123
      }
    });
    expect(requests[1]).toEqual({
      type: "SET_ROLE_MODEL_SELECTION",
      role: "planner",
      selection: { instanceId: "custom_provider_1", model: "qwen-max" }
    });
  });

  it("keeps planner and vision dropdown candidates focused on compatible model families", () => {
    const detectedModels = [
      "cosyvoice-v3-flash",
      "qwen-image",
      "qwen3-asr-flash",
      "text-embedding-3-large",
      "deepseek-chat",
      "qwen-max",
      "qwen-vl-max"
    ];

    expect(plannerModelChoices(detectedModels, "qwen-max")).toEqual(["qwen-max", "deepseek-chat", "qwen-vl-max"]);
    expect(visionModelChoices(detectedModels, "")).toEqual(["qwen-vl-max"]);
  });

  it("preserves an existing detected planner before falling back to a compatible candidate", () => {
    const detectedModels = ["qwen-image", "deepseek-chat", "qwen-max"];

    expect(preferredPlannerModelAfterDetection(detectedModels, "qwen-max")).toBe("qwen-max");
    expect(preferredPlannerModelAfterDetection(detectedModels, "missing-model")).toBe("deepseek-chat");
    expect(preferredPlannerModelAfterDetection(["qwen-image"], "")).toBe("qwen-image");
  });

  it("normalizes capability settings from stored values", () => {
    const settings = resolveCapabilitySettings({
      skills: {
        slashCommandsEnabled: false,
        recordedWorkflowsEnabled: true,
        requireConfirmation: false
      },
      search: {
        provider: "custom_endpoint",
        endpoint: "https://search.example.com/query",
        apiKey: "search-key",
        maxResults: 99
      }
    });

    expect(settings.skills).toEqual({
      slashCommandsEnabled: false,
      recordedWorkflowsEnabled: true,
      requireConfirmation: false
    });
    expect(settings.search).toEqual({
      provider: "custom_endpoint",
      endpoint: "https://search.example.com/query",
      apiKey: "search-key",
      maxResults: 20
    });
  });
});
