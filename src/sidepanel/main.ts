import { sendRuntimeMessage } from "../adapters/chrome/messaging";
import type { SessionStateResponse } from "../shared/protocol";
import { renderSidepanel } from "./render";
import { withDerivedMode, type SidepanelState } from "./state";

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
  timeline: [{ id: "welcome", title: "Ready", detail: "Configure a planner model, then ask the Agent to operate the current page." }]
};

function hasChromeRuntime(): boolean {
  return Boolean(globalThis.chrome?.runtime?.sendMessage);
}

function applySession(session: SessionStateResponse): void {
  const latest = session.events.at(-1);
  state = withDerivedMode({
    ...state,
    activeTask: session.taskId
      ? {
          taskId: session.taskId,
          status: latest?.type === "TaskStopped" ? "stopped" : latest?.type === "TaskStarted" ? "running" : "running"
        }
      : state.activeTask,
    timeline: session.events.map((event) => ({
      id: event.id,
      title: event.type,
      detail: typeof event.payload.taskText === "string" ? event.payload.taskText : undefined,
      tone: event.type === "TaskStopped" ? "warning" : "info"
    }))
  });
}

function paint(): void {
  renderSidepanel(appRoot, state, {
    onSubmitTask: (text) => {
      void submitText(text);
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
      timeline: [{ id: "runtime-unavailable", title: "Background runtime unavailable", detail: text, tone: "warning" }]
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
      timeline: [{ id: "send-error", title: "Could not contact background runtime", detail: response.error, tone: "error" }]
    };
  }
  paint();
}

paint();
void refreshSession();
