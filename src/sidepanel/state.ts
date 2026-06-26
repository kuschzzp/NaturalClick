export type SidepanelMode = "conversation" | "workbench";
export type OverlayMode = "Off" | "Focus" | "All Targets" | "Evidence" | "Vision";
export type SidepanelSafetyMode = "conservative" | "balanced" | "autonomous" | "experimental_full_auto";

export interface ActiveTaskState {
  taskId: string;
  status: string;
  currentAction?: string;
}

export interface TimelineItem {
  id: string;
  title: string;
  detail?: string;
  tone?: "info" | "success" | "warning" | "error";
}

export interface SidepanelState {
  mode: SidepanelMode;
  overlayMode: OverlayMode;
  safetyMode: SidepanelSafetyMode;
  modelConfigured: boolean;
  activeTask?: ActiveTaskState;
  traceOpen: boolean;
  settingsOpen?: boolean;
  timeline?: TimelineItem[];
  decisionSummary?: string;
  evidenceSummary?: string[];
  traceSummary?: string[];
}

export function deriveSidepanelMode(state: SidepanelState): SidepanelMode {
  if (state.traceOpen) return "workbench";
  if (state.activeTask && !["completed", "failed", "stopped"].includes(state.activeTask.status)) return "workbench";
  return "conversation";
}

export function needsModelGuidance(state: SidepanelState): boolean {
  return !state.modelConfigured;
}

export function withDerivedMode(state: SidepanelState): SidepanelState {
  return { ...state, mode: deriveSidepanelMode(state) };
}
