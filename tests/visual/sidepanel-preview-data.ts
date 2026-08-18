import type { SidepanelState } from "../../src/sidepanel/state";

export interface SidepanelVisualScenario {
  id: string;
  title: string;
  description: string;
  state: SidepanelState;
}

function baseState(overrides: Partial<SidepanelState> = {}): SidepanelState {
  return {
    mode: "conversation",
    view: "chat",
    overlayMode: "Off",
    safetyMode: "balanced",
    themeMode: "dark",
    modelConfigured: true,
    traceOpen: false,
    ...overrides
  };
}

export const sidepanelVisualScenarios: SidepanelVisualScenario[] = [
  {
    id: "home",
    title: "Conversation home",
    description: "Empty chat surface with guidance, composer, model picker entry, and new-session chrome.",
    state: baseState({
      modelConfigured: false,
      activityText: "Waiting for a task..."
    })
  },
  {
    id: "running",
    title: "Running task",
    description: "Compact execution workbench with active step, folded history, target metadata, and stop/queue controls.",
    state: baseState({
      mode: "workbench",
      overlayMode: "Focus",
      composerInput: "Then export the visible results",
      activeTask: {
        taskId: "task-visual-running",
        status: "running",
        currentAction: "Click the matching customer row",
        activeNodeId: "act",
        targetLabel: "#17 Customer row",
        expectedOutcome: "Customer details become visible",
        semanticTargetId: "target-17"
      },
      timeline: [
        { id: "observe", title: "Page observation complete", detail: "Found 42 interactive candidates", tone: "success" },
        { id: "plan", title: "Plan generated", detail: "Click the matching customer row" },
        { id: "act", title: "Executing action", detail: "Waiting for the table response" }
      ]
    })
  },
  {
    id: "model-popover",
    title: "Composer popovers",
    description: "Tools menu and model picker open above the Pie-like composer.",
    state: baseState({
      composerInput: "Summarize the selected page section",
      toolMenuOpen: true,
      modelPickerOpen: true,
      modelSettings: {
        providerBaseUrl: "https://api.openai.com/v1",
        apiKey: "sk-test",
        plannerModel: "gpt-4.1-mini",
        visionModel: "gpt-4.1",
        apiKeyRef: "naturalclick:model-api-key"
      },
      detectedModels: ["gpt-4.1-mini", "gpt-4.1", "o4-mini"]
    })
  },
  {
    id: "settings",
    title: "Settings workbench",
    description: "Model configuration center with provider card, wizard, model pool, execution controls, and save bar.",
    state: baseState({
      view: "settings",
      settingsTab: "configs",
      modelConfigWizardOpen: true,
      modelSettingsDirty: true,
      settingsDirty: true,
      modelSettings: {
        providerBaseUrl: "https://api.openai.com/v1",
        apiKey: "sk-test",
        plannerModel: "gpt-4.1-mini",
        visionModel: "gpt-4.1",
        apiKeyRef: "naturalclick:model-api-key"
      },
      detectedModels: ["gpt-4.1-mini", "gpt-4.1", "o4-mini"],
      modelDetectionStatus: "success",
      modelDetectionMessage: "Detected 3 models. Selected gpt-4.1-mini; save configuration to apply."
    })
  },
  {
    id: "history",
    title: "History page",
    description: "Dedicated session history page with active run summaries and local history actions.",
    state: baseState({
      view: "history",
      activeSessionId: "session-2",
      sessions: [
        {
          id: "session-1",
          title: "Extract current table",
          status: "completed",
          updatedAt: "2026-07-07 15:24",
          eventCount: 9,
          taskText: "Extract the current table"
        },
        {
          id: "session-2",
          title: "Open customer details",
          status: "running",
          updatedAt: "2026-07-07 15:31",
          eventCount: 4,
          taskText: "Open customer details"
        }
      ]
    })
  },
  {
    id: "schedules",
    title: "Schedules workbench",
    description: "Automation schedule placeholder view with template stats and compact queue rows.",
    state: baseState({ view: "schedules" })
  }
];

export function getSidepanelVisualScenario(id?: string | null): SidepanelVisualScenario {
  return sidepanelVisualScenarios.find((scenario) => scenario.id === id) ?? sidepanelVisualScenarios[0];
}
