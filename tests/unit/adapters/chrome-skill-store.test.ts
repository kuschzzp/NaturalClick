import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChromeSkillStore } from "../../../src/adapters/chrome/chrome-skill-store";

const backing = new Map<string, unknown>();

describe("Chrome skill store", () => {
  beforeEach(() => {
    backing.clear();
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          async get(key: string) {
            return { [key]: backing.get(key) };
          },
          async set(value: Record<string, unknown>) {
            Object.entries(value).forEach(([key, stored]) => backing.set(key, stored));
          }
        }
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores, lists, loads, updates, and clears recorded workflow skills", async () => {
    const store = new ChromeSkillStore();

    const saved = await store.saveRecordedWorkflow({
      id: "workflow_reports",
      name: "打开报表",
      description: "进入报表页面并读取摘要",
      steps: ["点击报表入口", "读取页面摘要"]
    });

    expect(saved).toMatchObject({
      id: "workflow_reports",
      name: "打开报表",
      enabled: true,
      source: "recorded_workflow",
      steps: ["点击报表入口", "读取页面摘要"]
    });
    expect(saved.instructions).toContain("Reusable browser workflow");

    await expect(store.listSkills()).resolves.toMatchObject([
      {
        id: "workflow_reports",
        name: "打开报表",
        description: "进入报表页面并读取摘要",
        enabled: true
      }
    ]);
    await expect(store.loadSkill("workflow_reports")).resolves.toMatchObject({
      id: "workflow_reports",
      instructions: expect.stringContaining("点击报表入口")
    });

    const updated = await store.saveRecordedWorkflow({
      id: "workflow_reports",
      name: "打开报表",
      description: "读取新的摘要",
      steps: ["打开报表", "复制摘要"]
    });

    expect(updated.createdAt).toBe(saved.createdAt);
    expect(updated.description).toBe("读取新的摘要");
    await store.clear();
    await expect(store.listSkills()).resolves.toEqual([]);
  });
});
