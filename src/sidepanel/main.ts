import { sendRuntimeMessage } from "../adapters/chrome/messaging";
import type { SessionStateResponse } from "../shared/protocol";
import { renderSidepanel } from "./render";
import {
  deriveActiveTaskFromEvents,
  mapEventToTimelineItem,
  withDerivedMode,
  type OverlayMode,
  type SidepanelState,
  type TimelineItem
} from "./state";

const root = document.querySelector<HTMLElement>("#app");
if (!root) {
  throw new Error("Missing #app root");
}
const appRoot = root;

let state: SidepanelState = {
  mode: "conversation",
  overlayMode: "Off",
  safetyMode: "balanced",
  modelConfigured: false,
  traceOpen: false,
  timeline: [{ id: "welcome", title: "准备就绪", detail: "配置 Planner 模型后，就可以让 Agent 操作当前页面。" }]
};

function hasChromeRuntime(): boolean {
  return Boolean(globalThis.chrome?.runtime?.sendMessage);
}

function applySession(session: SessionStateResponse): void {
  state = withDerivedMode({
    ...state,
    activeTask: deriveActiveTaskFromEvents(session.events),
    timeline: session.events.map(mapEventToTimelineItem),
    decisionSummary: session.events.at(-1)?.type ? mapEventToTimelineItem(session.events.at(-1)!).title : state.decisionSummary,
    evidenceSummary: session.events
      .filter((event) => ["ObservationReceived", "EvidenceAdded", "VisualEvidenceAdded", "VisionCompleted"].includes(event.type))
      .slice(-4)
      .map((event) => mapEventToTimelineItem(event).detail ?? mapEventToTimelineItem(event).title),
    traceSummary: session.events.slice(-6).map((event) => `${event.type} · ${event.stepId}`)
  });
}

function appendLocalTimeline(item: TimelineItem): void {
  state = {
    ...state,
    timeline: [...(state.timeline ?? []), item]
  };
}

function paint(): void {
  renderSidepanel(appRoot, state, {
    onSubmitTask: (text) => {
      void submitText(text);
    },
    onStopTask: () => {
      void stopTask();
    },
    onOverlayModeChange: (mode) => {
      void setOverlayMode(mode as OverlayMode);
    },
    onHighlightTarget: (semanticId) => {
      void highlightTarget(semanticId);
    },
    onOpenSettings: () => {
      state = { ...state, settingsOpen: true };
      paint();
    },
    onCloseSettings: () => {
      state = { ...state, settingsOpen: false };
      paint();
    }
  });
}

async function refreshSession(): Promise<void> {
  if (!hasChromeRuntime()) return;
  const response = await sendRuntimeMessage<SessionStateResponse>({ type: "GET_SESSION_STATE" });
  if (response.ok) {
    applySession(response.data);
    paint();
  }
}

async function submitText(text: string): Promise<void> {
  if (!hasChromeRuntime()) {
    state = {
      ...state,
      timeline: [{ id: "runtime-unavailable", title: "后台运行时不可用", detail: text, tone: "warning" }]
    };
    paint();
    return;
  }

  const response = await sendRuntimeMessage<SessionStateResponse>(
    state.activeTask ? { type: "APPEND_INSTRUCTION", text } : { type: "START_TASK", taskText: text }
  );
  if (response.ok) {
    applySession(response.data);
  } else {
    state = {
      ...state,
      timeline: [{ id: "send-error", title: "无法联系后台运行时", detail: response.error, tone: "error" }]
    };
  }
  paint();
}

async function stopTask(): Promise<void> {
  if (!hasChromeRuntime()) {
    appendLocalTimeline({
      id: "stop-runtime-unavailable",
      title: "后台运行时不可用",
      detail: "当前只能在预览状态下停止展示，无法通知 Chrome 扩展后台。",
      tone: "warning"
    });
    state = withDerivedMode({ ...state, activeTask: state.activeTask ? { ...state.activeTask, status: "stopped" } : undefined });
    paint();
    return;
  }

  const response = await sendRuntimeMessage<SessionStateResponse>({ type: "STOP_TASK", reason: "user_requested" });
  if (response.ok) {
    applySession(response.data);
  } else {
    appendLocalTimeline({ id: "stop-error", title: "停止任务失败", detail: response.error, tone: "error" });
  }
  paint();
}

async function setOverlayMode(mode: OverlayMode): Promise<void> {
  state = { ...state, overlayMode: mode };
  paint();

  if (!hasChromeRuntime()) return;
  const response = await sendRuntimeMessage({ type: "SET_OVERLAY_MODE", mode });
  if (!response.ok) {
    appendLocalTimeline({ id: `overlay-${Date.now()}`, title: "页面标记未同步", detail: response.error, tone: "warning" });
    paint();
  }
}

async function highlightTarget(semanticId: string): Promise<void> {
  if (!hasChromeRuntime()) {
    appendLocalTimeline({ id: "highlight-runtime-unavailable", title: "无法标记页面目标", detail: semanticId, tone: "warning" });
    paint();
    return;
  }

  const response = await sendRuntimeMessage({ type: "HIGHLIGHT_TARGET", semanticId });
  if (!response.ok) {
    appendLocalTimeline({ id: `highlight-${Date.now()}`, title: "目标高亮失败", detail: response.error, tone: "warning" });
    paint();
  }
}

paint();
void refreshSession();
