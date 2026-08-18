import type { ModelInstance, ModelRuntimeConfig } from "../core/model/model-instance";
import type { TimelineItem } from "./state";

export interface WorkbenchActiveTask {
  status: "running" | "stopping" | "paused" | "awaiting_confirmation" | "completed" | "failed" | "stopped" | string;
  taskId: string;
  title: string;
}

export interface PendingInstruction {
  id: string;
  text: string;
}

export interface WorkbenchViewModelInput {
  mode: "conversation" | "settings" | "sessions";
  locale?: "en" | "zh-CN";
  activeTask?: WorkbenchActiveTask;
  composerInput: string;
  modelInstances: ModelInstance[];
  activeModel?: ModelRuntimeConfig;
  timeline: TimelineItem[];
  pendingInstructions: PendingInstruction[];
}

export interface WorkbenchViewModel {
  topbar: {
    title: string;
    running: boolean;
    newSessionLabel: string;
  };
  composer: {
    input: string;
    primaryAction: "send" | "queue" | "resume" | "stop" | "disabled";
    stopVisible: boolean;
    modelLabel: string;
    modelPickerLabel: string;
    pendingCount: number;
    modelConfigured: boolean;
  };
  timeline: TimelineItem[];
}

export function buildWorkbenchViewModel(input: WorkbenchViewModelInput): WorkbenchViewModel {
  const locale = input.locale ?? "zh-CN";
  const hasInput = input.composerInput.trim().length > 0;
  const status = input.activeTask?.status;
  const running = Boolean(status && !["completed", "failed", "stopped", "paused"].includes(status));
  const paused = status === "paused";
  return {
    topbar: {
      title: input.activeTask?.title || "NaturalClick",
      running,
      newSessionLabel: locale === "zh-CN" ? "新建会话" : "New session"
    },
    composer: {
      input: input.composerInput,
      primaryAction: paused ? "resume" : running ? "stop" : hasInput ? "send" : "disabled",
      stopVisible: running,
      modelLabel: input.activeModel ? `${input.activeModel.providerLabel} · ${input.activeModel.model}` : locale === "zh-CN" ? "选择模型" : "Select model",
      modelPickerLabel: locale === "zh-CN" ? "打开模型配置" : "Open model settings",
      pendingCount: input.pendingInstructions.length,
      modelConfigured: Boolean(input.activeModel || input.modelInstances.length > 0)
    },
    timeline: input.timeline
  };
}
