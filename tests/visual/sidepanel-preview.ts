import { renderSidepanel, type SidepanelHandlers } from "../../src/sidepanel/render";
import { getSidepanelVisualScenario, sidepanelVisualScenarios } from "./sidepanel-preview-data";

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("Missing #app root for sidepanel visual preview");
}

const params = new URLSearchParams(window.location.search);
const scenario = getSidepanelVisualScenario(params.get("scenario"));
const handlers: SidepanelHandlers = {
  onSubmitTask: (text) => {
    console.info("[visual-preview] submit", text);
  },
  onStopTask: () => {
    console.info("[visual-preview] stop task");
  },
  onOpenSettings: () => {
    console.info("[visual-preview] open settings");
  },
  onBackToChat: () => {
    console.info("[visual-preview] back to chat");
  },
  onOpenHistory: () => {
    console.info("[visual-preview] open history");
  },
  onOpenSchedules: () => {
    console.info("[visual-preview] open schedules");
  },
  onToggleToolMenu: () => {
    console.info("[visual-preview] toggle tools menu");
  },
  onToggleModelPicker: () => {
    console.info("[visual-preview] toggle model picker");
  }
};

document.documentElement.dataset.theme = scenario.state.themeMode === "light" ? "light" : "dark";
document.documentElement.dataset.visualScenario = scenario.id;
document.title = `NaturalClick Preview - ${scenario.title}`;
root.setAttribute("aria-label", `NaturalClick visual preview: ${scenario.title}`);

renderSidepanel(root, scenario.state, handlers);

const scenarioMeta = document.createElement("meta");
scenarioMeta.name = "naturalclick-preview-scenarios";
scenarioMeta.content = sidepanelVisualScenarios.map((item) => item.id).join(",");
document.head.append(scenarioMeta);

const metricsMeta = document.createElement("meta");
metricsMeta.name = "naturalclick-preview-metrics";
metricsMeta.content = JSON.stringify({
  scenario: scenario.id,
  innerWidth: window.innerWidth,
  documentScrollWidth: document.documentElement.scrollWidth,
  bodyScrollWidth: document.body.scrollWidth,
  appScrollWidth: root.scrollWidth,
  shellScrollWidth: root.querySelector<HTMLElement>(".nc-shell")?.scrollWidth ?? 0
});
document.head.append(metricsMeta);
