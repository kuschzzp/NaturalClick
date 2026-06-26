import { describe, expect, it } from "vitest";
import { renderSidepanel } from "../../../src/sidepanel/render";
import type { SidepanelState } from "../../../src/sidepanel/state";

describe("sidepanel render", () => {
  it("renders configuration guidance in conversation mode", () => {
    const root = document.createElement("main");
    const state: SidepanelState = {
      mode: "conversation",
      overlayMode: "Off",
      safetyMode: "balanced",
      modelConfigured: false,
      traceOpen: false
    };

    renderSidepanel(root, state);

    expect(root.textContent).toContain("需要先配置模型");
    expect(root.textContent).toContain("Chatflow 编排");
    expect(root.querySelector("textarea")?.getAttribute("placeholder")).toContain("让 Agent 操作当前页面");
  });

  it("renders chatflow runtime in workbench mode", () => {
    const root = document.createElement("main");
    const state: SidepanelState = {
      mode: "workbench",
      overlayMode: "Focus",
      safetyMode: "balanced",
      modelConfigured: true,
      traceOpen: false,
      activeTask: {
        taskId: "task-1",
        status: "running",
        currentAction: "点击个人版继续",
        activeNodeId: "plan",
        targetLabel: "#17 个人版继续",
        expectedOutcome: "进入个人版套餐页面",
        semanticTargetId: "target-17"
      }
    };

    renderSidepanel(root, state);

    expect(root.textContent).toContain("当前对话流");
    expect(root.textContent).toContain("计划动作");
    expect(root.textContent).toContain("点击个人版继续");
    expect(root.textContent).toContain("Chatflow 编排");
    expect(root.textContent).toContain("高级配置");
    expect(root.textContent).toContain("Decision");
    expect(root.textContent).toContain("Evidence");
    expect(root.textContent).toContain("Trace");
    expect(root.querySelector(".nc-flow-node--active")?.textContent).toContain("计划动作");
    expect(root.querySelector(".nc-action-card")?.textContent).toContain("标记目标");
  });
});
