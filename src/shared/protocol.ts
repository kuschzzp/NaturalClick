import type { BrowserPrimitive } from "../core/commands/commands";
import type { AgentEvent } from "../core/events/events";
import type { PageModel } from "../core/observation/page-model";

export type OverlayMode = "off" | "minimal" | "numbered" | "debug";

export type StartTaskRequest = {
  type: "START_TASK";
  taskText: string;
};

export type StopTaskRequest = {
  type: "STOP_TASK";
  reason?: string;
};

export type AppendInstructionRequest = {
  type: "APPEND_INSTRUCTION";
  text: string;
};

export type GetSessionStateRequest = {
  type: "GET_SESSION_STATE";
  sessionId?: string;
  taskId?: string;
};

export type ObservePageRequest = {
  type: "OBSERVE_PAGE";
};

export type ExecutePrimitiveRequest = {
  type: "EXECUTE_PRIMITIVE";
  primitive: BrowserPrimitive;
  pageModel?: PageModel;
};

export type SetOverlayModeRequest = {
  type: "SET_OVERLAY_MODE";
  mode: OverlayMode;
};

export type HighlightTargetRequest = {
  type: "HIGHLIGHT_TARGET";
  semanticId: string;
};

export type OpenSettingsRequest = {
  type: "OPEN_SETTINGS";
};

export type NaturalClickRequest =
  | StartTaskRequest
  | StopTaskRequest
  | AppendInstructionRequest
  | GetSessionStateRequest
  | ObservePageRequest
  | ExecutePrimitiveRequest
  | SetOverlayModeRequest
  | HighlightTargetRequest
  | OpenSettingsRequest
  | { type: "NATURALCLICK_PING" };

export type SessionStateResponse = {
  sessionId?: string;
  taskId?: string;
  events: AgentEvent[];
};

export type NaturalClickResponse<T = unknown> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: string;
    };
