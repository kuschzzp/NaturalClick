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
  it("renders the conversation home with old-style toolbar actions", () => {
    const root = document.createElement("main");

    renderSidepanel(root, baseState({ modelConfigured: false, activityText: "等待任务..." }));

    expect(root.textContent).toContain("NaturalClick Agent");
    expect(root.textContent).toContain("空闲");
    expect(root.textContent).toContain("开始你的自动化任务");
    expect(root.textContent).toContain("等待任务...");
    expect(root.textContent).toContain("需要先配置模型");
    expect(root.querySelector('button[aria-label="复制执行日志"]')).not.toBeNull();
    expect(root.querySelector('button[aria-label="下载执行日志"]')).not.toBeNull();
    expect(root.querySelector('button[aria-label="新建会话"]')).not.toBeNull();
    expect(root.querySelector('button[aria-label="历史会话"]')).not.toBeNull();
    expect(root.querySelector('button[aria-label="设置"]')).not.toBeNull();
    expect(root.querySelector("textarea")?.getAttribute("placeholder")).toBe("描述你的任务...（Enter 发送，Shift+Enter 换行）");
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

    expect(root.textContent).toContain("执行中");
    expect(root.textContent).toContain("当前任务");
    expect(root.textContent).toContain("点击个人版继续");
    expect(root.textContent).toContain("标记目标");
    expect(root.textContent).not.toContain("当前对话流");
    expect(root.querySelector('button[aria-label="停止任务"]')).not.toBeNull();
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

    expect(root.textContent).toContain("历史会话");
    expect(root.textContent).toContain("打开定价页面");
    expect(root.textContent).toContain("8 条事件");
    expect(root.querySelector('button[aria-label="返回对话"]')).not.toBeNull();
  });

  it("renders settings as a full sidepanel page", () => {
    const root = document.createElement("main");

    renderSidepanel(root, baseState({ view: "settings", overlayMode: "Vision", safetyMode: "autonomous" }));

    expect(root.textContent).toContain("设置");
    expect(root.textContent).toContain("大模型 API");
    expect(root.textContent).toContain("页面标记");
    expect(root.textContent).toContain("执行权限");
    expect(root.textContent).toContain("运行链路");
    expect(root.querySelector(".nc-segment--active")?.textContent).toContain("视觉");
  });
});
