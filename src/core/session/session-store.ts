import type { RuntimeAbortReason } from "../architecture/boundaries";
import type { SessionRuntimeState } from "./session-state-machine";

export type TaskTerminalStatus = "completed" | "failed" | "stopped" | "suspended";

export interface TaskTombstone {
  sessionId: string;
  taskId: string;
  status: TaskTerminalStatus;
  reason?: string | RuntimeAbortReason;
  eventId?: string;
  createdAt: number;
}

export interface SessionStore {
  loadState(sessionId: string): Promise<SessionRuntimeState | undefined>;
  saveState(sessionId: string, state: SessionRuntimeState): Promise<void>;
  saveTombstone(tombstone: TaskTombstone): Promise<void>;
  listTombstones(sessionId: string): Promise<TaskTombstone[]>;
}

export function createMemorySessionStore(): SessionStore {
  const states = new Map<string, SessionRuntimeState>();
  const tombstones = new Map<string, TaskTombstone[]>();

  return {
    async loadState(sessionId) {
      const state = states.get(sessionId);
      return state ? { ...state } : undefined;
    },
    async saveState(sessionId, state) {
      states.set(sessionId, { ...state });
    },
    async saveTombstone(tombstone) {
      const list = tombstones.get(tombstone.sessionId) ?? [];
      tombstones.set(tombstone.sessionId, [...list.filter((item) => item.taskId !== tombstone.taskId), { ...tombstone }]);
    },
    async listTombstones(sessionId) {
      return [...(tombstones.get(sessionId) ?? [])];
    }
  };
}
