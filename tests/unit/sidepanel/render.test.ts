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

    expect(root.textContent).toContain("Need model configuration before starting");
    expect(root.querySelector("textarea")?.getAttribute("placeholder")).toContain("Ask the Agent");
  });

  it("renders current action in workbench mode", () => {
    const root = document.createElement("main");
    const state: SidepanelState = {
      mode: "workbench",
      overlayMode: "Focus",
      safetyMode: "balanced",
      modelConfigured: true,
      traceOpen: false,
      activeTask: { taskId: "task-1", status: "running", currentAction: "Click Settings" }
    };

    renderSidepanel(root, state);

    expect(root.textContent).toContain("Click Settings");
    expect(root.textContent).toContain("Decision");
    expect(root.textContent).toContain("Evidence");
    expect(root.textContent).toContain("Trace");
  });
});
