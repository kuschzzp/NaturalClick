import { beforeEach, describe, expect, it } from "vitest";
import { createChromeModelConfigStore } from "../../../src/adapters/chrome/model-config-store";
import type { ModelConfigStorageArea } from "../../../src/adapters/chrome/model-config-store";

const backing = new Map<string, unknown>();

const fakeStorageArea: ModelConfigStorageArea = {
  async get(key?: string | string[] | Record<string, unknown> | null) {
    if (key === null || key === undefined) return Object.fromEntries(backing.entries());
    if (typeof key === "string") return { [key]: backing.get(key) };
    if (Array.isArray(key)) return Object.fromEntries(key.map((item) => [item, backing.get(item)]));
    return Object.fromEntries(Object.keys(key).map((item) => [item, backing.get(item) ?? key[item]]));
  },
  async set(value: Record<string, unknown>) {
    Object.entries(value).forEach(([key, stored]) => backing.set(key, stored));
  },
  async remove(keys: string | string[]) {
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      backing.delete(key);
    }
  }
};

describe("Chrome model config store", () => {
  beforeEach(() => {
    backing.clear();
  });

  it("round-trips model instances and active selection", async () => {
    const store = createChromeModelConfigStore(fakeStorageArea);
    await store.saveInstance({
      id: "inst_1",
      provider: "openai",
      label: "OpenAI",
      baseUrl: "https://api.openai.com/v1",
      apiKeyRef: "secret:openai",
      models: [{ id: "gpt-4o-mini", vision: true, tools: true, maxContextTokens: 128000 }]
    });
    await store.setActiveSelection({ instanceId: "inst_1", model: "gpt-4o-mini" });

    await expect(store.listInstances()).resolves.toHaveLength(1);
    await expect(store.getActiveSelection()).resolves.toEqual({ instanceId: "inst_1", model: "gpt-4o-mini" });
  });

  it("round-trips protocol and structured model capabilities", async () => {
    const store = createChromeModelConfigStore(fakeStorageArea);
    await store.saveInstance({
      id: "inst_protocol",
      provider: "openai",
      label: "OpenAI Responses",
      baseUrl: "https://api.openai.com/v1",
      apiKeyRef: "secret:openai",
      protocol: "responses",
      models: [
        {
          id: "gpt-5",
          vision: true,
          tools: true,
          structuredOutputs: true,
          jsonMode: true,
          strictTools: true,
          reasoning: true,
          maxContextTokens: 400000,
          maxOutputTokens: 128000
        }
      ]
    });

    await expect(store.listInstances()).resolves.toEqual([
      expect.objectContaining({
        protocol: "responses",
        models: [
          expect.objectContaining({
            id: "gpt-5",
            structuredOutputs: true,
            jsonMode: true,
            strictTools: true,
            reasoning: true
          })
        ]
      })
    ]);
  });

  it("round-trips role selections independently from the legacy active selection", async () => {
    const store = createChromeModelConfigStore(fakeStorageArea);

    await store.setActiveSelection({ instanceId: "inst_1", model: "planner-model" });
    await store.setRoleSelection("planner", { instanceId: "inst_1", model: "planner-model" });
    await store.setRoleSelection("vision", { instanceId: "inst_2", model: "vision-model" });

    await expect(store.getActiveSelection()).resolves.toEqual({ instanceId: "inst_1", model: "planner-model" });
    await expect(store.getRoleSelections()).resolves.toEqual({
      planner: { instanceId: "inst_1", model: "planner-model" },
      vision: { instanceId: "inst_2", model: "vision-model" }
    });
  });

  it("clears one role selection without removing other roles", async () => {
    const store = createChromeModelConfigStore(fakeStorageArea);

    await store.setRoleSelection("planner", { instanceId: "inst_1", model: "planner-model" });
    await store.setRoleSelection("vision", { instanceId: "inst_2", model: "vision-model" });

    await store.clearRoleSelection("vision");

    await expect(store.getRoleSelections()).resolves.toEqual({
      planner: { instanceId: "inst_1", model: "planner-model" }
    });
  });

  it("clears the legacy active selection when clearing the planner role", async () => {
    const store = createChromeModelConfigStore(fakeStorageArea);

    await store.setActiveSelection({ instanceId: "inst_1", model: "planner-model" });
    await store.setRoleSelection("planner", { instanceId: "inst_1", model: "planner-model" });
    await store.setRoleSelection("vision", { instanceId: "inst_2", model: "vision-model" });

    await store.clearRoleSelection("planner");

    await expect(store.getActiveSelection()).resolves.toBeUndefined();
    await expect(store.getRoleSelections()).resolves.toEqual({
      vision: { instanceId: "inst_2", model: "vision-model" }
    });
  });

  it("drops raw api keys before persisting an instance", async () => {
    const store = createChromeModelConfigStore(fakeStorageArea);
    await store.saveInstance({
      id: "inst_1",
      provider: "custom",
      label: "Custom",
      baseUrl: "https://api.example.com/v1",
      apiKeyRef: "secret:custom",
      models: [{ id: "fast-model", vision: false, tools: false, maxContextTokens: 32000 }],
      apiKey: "sk-raw"
    } as never);

    const stored = await store.listInstances();
    expect(stored[0]).not.toHaveProperty("apiKey");
    expect(stored[0].apiKeyRef).toBe("secret:custom");
  });

  it("clears active selection when deleting its instance", async () => {
    const store = createChromeModelConfigStore(fakeStorageArea);
    await store.saveInstance({
      id: "inst_1",
      provider: "openai",
      label: "OpenAI",
      baseUrl: "https://api.openai.com/v1",
      apiKeyRef: "secret:openai",
      models: [{ id: "gpt-4o-mini", vision: true, tools: true, maxContextTokens: 128000 }]
    });
    await store.setActiveSelection({ instanceId: "inst_1", model: "gpt-4o-mini" });
    await store.setRoleSelection("planner", { instanceId: "inst_1", model: "gpt-4o-mini" });
    await store.setRoleSelection("vision", { instanceId: "inst_2", model: "vision-model" });

    await store.deleteInstance("inst_1");

    await expect(store.listInstances()).resolves.toEqual([]);
    await expect(store.getActiveSelection()).resolves.toBeUndefined();
    await expect(store.getRoleSelections()).resolves.toEqual({
      vision: { instanceId: "inst_2", model: "vision-model" }
    });
  });
});
