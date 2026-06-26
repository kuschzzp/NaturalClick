import { badge, button, el, textInput } from "./components";
import { needsModelGuidance, withDerivedMode, type SidepanelState, type TimelineItem } from "./state";
import { defaultModelSettings } from "./settings";

export interface SidepanelHandlers {
  onSubmitTask?: (text: string) => void;
  onOpenSettings?: () => void;
  onCloseSettings?: () => void;
  onOverlayModeChange?: (mode: string) => void;
  onSafetyModeChange?: (mode: string) => void;
}

function renderTopBar(state: SidepanelState, handlers: SidepanelHandlers): HTMLElement {
  const topbar = el("header", "nc-topbar");
  const identity = el("div", "nc-product");
  identity.append(el("strong", "nc-product__name", "NaturalClick"));
  identity.append(el("span", "nc-product__sub", state.activeTask ? state.activeTask.status : "Idle"));

  const controls = el("div", "nc-topbar__controls");
  controls.append(badge(state.safetyMode, state.safetyMode === "experimental_full_auto" ? "warning" : "neutral"));

  const settings = button("nc-icon-button", "Settings");
  settings.addEventListener("click", () => handlers.onOpenSettings?.());
  controls.append(settings);

  topbar.append(identity, controls);
  return topbar;
}

function renderGuidance(handlers: SidepanelHandlers): HTMLElement {
  const card = el("article", "nc-panel nc-guidance");
  card.append(el("h1", undefined, "Need model configuration before starting"));
  card.append(el("p", undefined, "Planner model is required for task understanding and next-action decisions."));
  const open = button("nc-button nc-button--primary", "Open model settings");
  open.addEventListener("click", () => handlers.onOpenSettings?.());
  card.append(open);
  return card;
}

function renderCurrentAction(state: SidepanelState): HTMLElement {
  const bar = el("section", "nc-current-action");
  bar.append(el("span", "nc-current-action__label", "Current action"));
  bar.append(el("strong", undefined, state.activeTask?.currentAction ?? "Waiting for next decision"));
  bar.append(badge(state.overlayMode, state.overlayMode === "Vision" ? "vision" : "neutral"));
  return bar;
}

function renderTimelineItem(item: TimelineItem): HTMLElement {
  const row = el("article", `nc-timeline-item nc-timeline-item--${item.tone ?? "info"}`);
  row.append(el("strong", undefined, item.title));
  if (item.detail) row.append(el("p", undefined, item.detail));
  return row;
}

function renderTimeline(state: SidepanelState): HTMLElement {
  const timeline = el("section", "nc-timeline");
  timeline.setAttribute("aria-live", "polite");
  const items =
    state.timeline && state.timeline.length > 0
      ? state.timeline
      : [{ id: "empty", title: "Ready", detail: "Describe what you want done on the current page.", tone: "info" as const }];
  items.forEach((item) => timeline.append(renderTimelineItem(item)));
  return timeline;
}

function renderInspector(state: SidepanelState): HTMLElement {
  const inspector = el("aside", "nc-inspector");
  const tabs = el("div", "nc-tabs");
  ["Decision", "Evidence", "Trace"].forEach((label, index) => {
    const tab = button(`nc-tab${index === 0 ? " nc-tab--active" : ""}`, label);
    tab.setAttribute("aria-selected", String(index === 0));
    tabs.append(tab);
  });

  const body = el("div", "nc-inspector__body");
  body.append(el("h2", undefined, "Decision"));
  body.append(el("p", undefined, state.decisionSummary ?? "No model decision has been produced yet."));

  const evidence = el("section", "nc-evidence-list");
  evidence.append(el("h2", undefined, "Evidence"));
  (state.evidenceSummary ?? ["DOM evidence will appear here after observation."]).forEach((item) => {
    evidence.append(el("p", "nc-evidence-line", item));
  });

  const trace = el("section", "nc-trace-list");
  trace.append(el("h2", undefined, "Trace"));
  (state.traceSummary ?? ["Trace is closed until a task starts."]).forEach((item) => {
    trace.append(el("p", "nc-trace-line", item));
  });

  inspector.append(tabs, body, evidence, trace);
  return inspector;
}

function renderComposer(state: SidepanelState, handlers: SidepanelHandlers): HTMLElement {
  const form = el("form", "nc-composer");
  const label = el("label", "nc-composer__field");
  label.append(el("span", "nc-field__label", state.activeTask ? "Instruction" : "Task"));
  const textarea = el("textarea", "nc-textarea") as HTMLTextAreaElement;
  textarea.rows = 3;
  textarea.placeholder = state.activeTask ? "Add an instruction for the Agent..." : "Ask the Agent to operate the current page...";
  label.append(textarea);

  const actions = el("div", "nc-composer__actions");
  const submit = el("button", "nc-button nc-button--primary", state.activeTask ? "Append" : "Start") as HTMLButtonElement;
  submit.type = "submit";
  actions.append(submit);

  form.append(label, actions);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = textarea.value.trim();
    if (!text) return;
    handlers.onSubmitTask?.(text);
    textarea.value = "";
  });
  return form;
}

function renderSettingsDrawer(state: SidepanelState, handlers: SidepanelHandlers): HTMLElement {
  const drawer = el("section", `nc-settings${state.settingsOpen ? " nc-settings--open" : ""}`);
  drawer.setAttribute("aria-hidden", String(!state.settingsOpen));
  const header = el("header", "nc-settings__header");
  header.append(el("h2", undefined, "Model settings"));
  const close = button("nc-icon-button", "Close");
  close.addEventListener("click", () => handlers.onCloseSettings?.());
  header.append(close);

  const form = el("form", "nc-settings__form");
  const settings = defaultModelSettings();
  form.append(
    textInput("Provider URL", settings.providerBaseUrl),
    textInput("Planner model", settings.plannerModel, "gpt-4.1-mini"),
    textInput("Vision model", settings.visionModel ?? "", "optional"),
    textInput("API key reference", settings.apiKeyRef)
  );
  form.append(el("p", "nc-settings__note", "Planner model is required before tasks can run."));
  drawer.append(header, form);
  return drawer;
}

export function renderSidepanel(root: HTMLElement, input: SidepanelState, handlers: SidepanelHandlers = {}): void {
  const state = withDerivedMode(input);
  const shell = el("section", `nc-shell nc-shell--${state.mode}`);
  shell.append(renderTopBar(state, handlers));

  const main = el("div", "nc-main");
  if (needsModelGuidance(state)) {
    main.append(renderGuidance(handlers));
  }
  if (state.mode === "workbench") {
    main.append(renderCurrentAction(state));
  }
  main.append(renderTimeline(state));
  if (state.mode === "workbench") {
    main.append(renderInspector(state));
  }
  shell.append(main, renderComposer(state, handlers), renderSettingsDrawer(state, handlers));
  root.replaceChildren(shell);
}
