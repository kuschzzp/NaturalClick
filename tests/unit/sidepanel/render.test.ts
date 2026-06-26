import { describe, expect, it } from "vitest";
import { renderSidepanel } from "../../../src/sidepanel/render";
import type { SidepanelState } from "../../../src/sidepanel/state";

function baseState(overrides: Partial<SidepanelState> = {}): SidepanelState {
  return {
    mode: "conversation",
    view: "chat",
    overlayMode: "Off",
    safetyMode: "balanced",
    modelConfigured: true,
    traceOpen: false,
    ...overrides
  };
}

describe("sidepanel render", () => {
  it("renders the conversation home in English by default", () => {
    const root = document.createElement("main");

    renderSidepanel(root, baseState({ modelConfigured: false, activityText: "Waiting for a task..." }));

    expect(root.textContent).toContain("NaturalClick");
    expect(root.textContent).toContain("Task Chat");
    expect(root.textContent).toContain("Idle");
    expect(root.textContent).toContain("Start your automation task");
    expect(root.textContent).toContain("Waiting for a task...");
    expect(root.textContent).toContain("Model setup required");
    expect(root.querySelector('button[aria-label="Copy run log"]')).not.toBeNull();
    expect(root.querySelector('button[aria-label="Download run log"]')).not.toBeNull();
    expect(root.querySelector('button[aria-label="New session"]')).not.toBeNull();
    expect(root.querySelector('button[aria-label="History"]')).not.toBeNull();
    expect(root.querySelector('button[aria-label="Settings"]')).not.toBeNull();
    expect(root.querySelector("textarea")?.getAttribute("placeholder")).toBe("Describe your task... (Enter to send, Shift+Enter for newline)");
  });

  it("keeps the running task visible without turning the home into a flow board", () => {
    const root = document.createElement("main");
    const state = baseState({
      mode: "workbench",
      overlayMode: "Focus",
      activeTask: {
        taskId: "task-1",
        status: "running",
        currentAction: "点击个人版继续",
        activeNodeId: "plan",
        targetLabel: "#17 个人版继续",
        expectedOutcome: "进入个人版套餐页面",
        semanticTargetId: "target-17"
      },
      timeline: [{ id: "event-1", title: "计划已生成", detail: "点击个人版继续" }]
    });

    renderSidepanel(root, state);

    expect(root.textContent).toContain("Running");
    expect(root.textContent).toContain("Current task");
    expect(root.textContent).toContain("点击个人版继续");
    expect(root.textContent).toContain("Highlight target");
    expect(root.textContent).not.toContain("当前对话流");
    expect(root.querySelector('button[aria-label="Stop task"]')).not.toBeNull();
  });

  it("renders the history page from the top toolbar entry", () => {
    const root = document.createElement("main");
    renderSidepanel(
      root,
      baseState({
        view: "history",
        sessions: [{ id: "s1", title: "打开定价页面", status: "completed", updatedAt: "2026/6/26 12:00:00", eventCount: 8 }]
      })
    );

    expect(root.textContent).toContain("History");
    expect(root.textContent).toContain("打开定价页面");
    expect(root.textContent).toContain("8 events");
    expect(root.querySelector('button[aria-label="Back to chat"]')).not.toBeNull();
  });

  it("renders settings as a full sidepanel page", () => {
    const root = document.createElement("main");

    renderSidepanel(
      root,
      baseState({
        view: "settings",
        overlayMode: "Vision",
        safetyMode: "autonomous",
        modelSettings: {
          providerBaseUrl: "https://api.openai.com/v1",
          apiKey: "sk-test",
          plannerModel: "gpt-4.1-mini",
          visionModel: "",
          apiKeyRef: "naturalclick:model-api-key"
        },
        detectedModels: ["gpt-4.1-mini", "gpt-4.1"],
        modelDetectionStatus: "success",
        modelDetectionMessage: "Detected 2 models. Selected gpt-4.1-mini; save settings to apply.",
        modelSettingsDirty: true
      })
    );

    expect(root.textContent).toContain("Settings");
    expect(root.textContent).toContain("Language");
    expect(root.textContent).toContain("Model API");
    expect(Array.from(root.querySelectorAll(".nc-field__label")).map((node) => node.textContent)).toEqual([
      "API",
      "API Key",
      "Planner model",
      "Vision model"
    ]);
    expect(root.querySelector('button[aria-label="Detect models"]')).not.toBeNull();
    expect(root.querySelector('button[aria-label="Save settings"]')).not.toBeNull();
    expect(root.textContent).toContain("Unsaved changes");
    expect(root.querySelector('select')?.textContent).toContain("gpt-4.1-mini");
    expect(root.textContent).toContain("Page Markers");
    expect(root.textContent).toContain("Execution Permission");
    expect(root.textContent).not.toContain("运行链路");
    expect(Array.from(root.querySelectorAll(".nc-segment--active")).map((node) => node.textContent)).toContain("Vision");
  });

  it("renders settings in Chinese when the locale is zh-CN", () => {
    const root = document.createElement("main");

    renderSidepanel(
      root,
      baseState({
        locale: "zh-CN",
        view: "settings",
        overlayMode: "Vision",
        safetyMode: "balanced",
        modelSettings: {
          providerBaseUrl: "https://api.openai.com/v1",
          apiKey: "sk-test",
          plannerModel: "gpt-4.1-mini",
          visionModel: "",
          apiKeyRef: "naturalclick:model-api-key"
        },
        detectedModels: ["gpt-4.1-mini"],
        modelSettingsDirty: true
      })
    );

    expect(root.textContent).toContain("设置");
    expect(root.textContent).toContain("插件语言");
    expect(root.textContent).toContain("大模型 API");
    expect(root.textContent).toContain("有未保存修改");
    expect(root.querySelector('button[aria-label="检测模型"]')).not.toBeNull();
    expect(root.querySelector('button[aria-label="保存设置"]')).not.toBeNull();
    expect(Array.from(root.querySelectorAll(".nc-segment--active")).map((node) => node.textContent)).toEqual(
      expect.arrayContaining(["中文", "视觉", "平衡"])
    );
  });

  it("hides model detection until an API key is entered", () => {
    const root = document.createElement("main");

    renderSidepanel(
      root,
      baseState({
        view: "settings",
        modelSettings: {
          providerBaseUrl: "https://api.openai.com/v1",
          apiKey: "",
          plannerModel: "",
          visionModel: "",
          apiKeyRef: "naturalclick:model-api-key"
        }
      })
    );

    expect(root.textContent).toContain("API Key");
    expect(root.querySelector('button[aria-label="Detect models"]')).toBeNull();
    expect(root.querySelector('button[aria-label="Save settings"]')).not.toBeNull();
    expect((root.querySelector('button[aria-label="Save settings"]') as HTMLButtonElement).disabled).toBe(true);
  });
});
