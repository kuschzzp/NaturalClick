import type { AgentEvent } from "../core/events/events";
import { ChromeStorageEventStore } from "../adapters/chrome/chrome-storage-event-store";
import { sendActiveTabMessage } from "../adapters/chrome/tabs";
import { createEventId, createSessionId, createStepId, createTaskId } from "../shared/ids";
import type { NaturalClickRequest, NaturalClickResponse, SessionStateResponse } from "../shared/protocol";

const eventStore = new ChromeStorageEventStore();
let activeSession: { sessionId: string; taskId: string } | undefined;

function okResponse<T>(data: T): NaturalClickResponse<T> {
  return { ok: true, data };
}

function errorResponse(error: string): NaturalClickResponse<never> {
  return { ok: false, error };
}

function makeEvent(type: AgentEvent["type"], payload: Record<string, unknown> = {}): AgentEvent {
  activeSession ??= { sessionId: createSessionId(), taskId: createTaskId() };
  const stepId = createStepId();
  return {
    id: createEventId(),
    sessionId: activeSession.sessionId,
    taskId: activeSession.taskId,
    stepId,
    type,
    timestamp: Date.now(),
    payload,
    visibility: "debug",
    correlationId: stepId
  };
}

async function sessionState(
  sessionId = activeSession?.sessionId,
  taskId = activeSession?.taskId
): Promise<SessionStateResponse> {
  if (!sessionId || !taskId) return { events: [] };
  return {
    sessionId,
    taskId,
    events: await eventStore.loadAfter(sessionId, taskId)
  };
}

async function handleMessage(message: NaturalClickRequest): Promise<NaturalClickResponse> {
  if (message.type === "NATURALCLICK_PING") {
    return okResponse({ source: "background" });
  }

  if (message.type === "START_TASK") {
    activeSession = { sessionId: createSessionId(), taskId: createTaskId() };
    await eventStore.append(makeEvent("TaskStarted", { taskText: message.taskText }));
    return okResponse(await sessionState());
  }

  if (message.type === "STOP_TASK") {
    await eventStore.append(makeEvent("TaskStopped", { reason: message.reason ?? "user_requested" }));
    return okResponse(await sessionState());
  }

  if (message.type === "APPEND_INSTRUCTION") {
    await eventStore.append(makeEvent("TaskInterpreted", { instruction: message.text }));
    return okResponse(await sessionState());
  }

  if (message.type === "GET_SESSION_STATE") {
    return okResponse(await sessionState(message.sessionId, message.taskId));
  }

  if (
    message.type === "OBSERVE_PAGE" ||
    message.type === "EXECUTE_PRIMITIVE" ||
    message.type === "SET_OVERLAY_MODE" ||
    message.type === "HIGHLIGHT_TARGET"
  ) {
    return sendActiveTabMessage(message);
  }

  if (message.type === "OPEN_SETTINGS") {
    if (chrome.runtime.openOptionsPage) {
      await chrome.runtime.openOptionsPage();
      return okResponse({ opened: true });
    }
    return errorResponse("options_page_not_available");
  }

  return errorResponse("unsupported_message");
}

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const request = message as Partial<NaturalClickRequest> | undefined;
  if (!request?.type) {
    sendResponse(errorResponse("unsupported_message"));
    return true;
  }

  void handleMessage(request as NaturalClickRequest)
    .then(sendResponse)
    .catch((error: unknown) => sendResponse(errorResponse(error instanceof Error ? error.message : "background_error")));
  return true;
});
