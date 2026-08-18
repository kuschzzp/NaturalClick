import type { RuntimeAbortReason } from "../architecture/boundaries";

export type SessionStatus = "active" | "paused" | "failed" | "archived";
export type TaskStatus = "idle" | "running" | "paused" | "stopped" | "failed";

export interface SessionRuntimeState {
  status: SessionStatus;
  taskStatus?: TaskStatus;
  lastStopReason?: RuntimeAbortReason;
  failureReason?: string;
}

export type SessionTransition =
  | { type: "task_started" }
  | { type: "task_done" }
  | { type: "task_failed"; reason: string }
  | { type: "task_stopped"; reason: RuntimeAbortReason }
  | { type: "worker_restarted" }
  | { type: "resume_requested" }
  | { type: "archive" };

export function transitionSession(state: SessionRuntimeState, transition: SessionTransition): SessionRuntimeState {
  switch (transition.type) {
    case "task_started":
      return { ...state, status: "active", taskStatus: "running", lastStopReason: undefined, failureReason: undefined };
    case "task_done":
      return { ...state, status: "active", taskStatus: "idle" };
    case "task_failed":
      return { ...state, status: "failed", taskStatus: "failed", failureReason: transition.reason };
    case "task_stopped":
      return { ...state, status: "active", taskStatus: "stopped", lastStopReason: transition.reason };
    case "worker_restarted":
      return state.taskStatus === "running" ? { ...state, status: "paused", taskStatus: "paused" } : state;
    case "resume_requested":
      return state.status === "paused" ? { ...state, status: "active", taskStatus: "running" } : state;
    case "archive":
      return { ...state, status: "archived" };
  }
}
