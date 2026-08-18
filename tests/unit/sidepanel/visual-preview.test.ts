import { describe, expect, it } from "vitest";
import { renderSidepanel } from "../../../src/sidepanel/render";
import { getSidepanelVisualScenario, sidepanelVisualScenarios } from "../../visual/sidepanel-preview-data";

describe("sidepanel visual preview scenarios", () => {
  it("exposes stable scenario ids for screenshot review", () => {
    expect(sidepanelVisualScenarios.map((scenario) => scenario.id)).toEqual([
      "home",
      "running",
      "model-popover",
      "settings",
      "history",
      "schedules"
    ]);
  });

  it("renders every preview scenario through the production sidepanel renderer", () => {
    for (const scenario of sidepanelVisualScenarios) {
      const root = document.createElement("main");

      renderSidepanel(root, scenario.state);

      expect(root.querySelector(".nc-shell"), scenario.id).not.toBeNull();
      expect(root.querySelector(".nc-app-header"), scenario.id).not.toBeNull();
      expect(root.textContent, scenario.id).toContain(scenario.state.view === "settings" ? "Settings" : scenario.state.view === "schedules" ? "Schedules" : "");
    }
  });

  it("falls back to the home preview when the scenario id is unknown", () => {
    expect(getSidepanelVisualScenario("missing").id).toBe("home");
  });
});
