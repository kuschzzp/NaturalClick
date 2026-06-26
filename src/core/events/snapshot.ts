export type RuntimeStatus =
  | "idle"
  | "running"
  | "paused"
  | "waiting"
  | "completed"
  | "failed"
  | "stopped";

export interface PendingConsent {
  riskLevel: "low" | "medium" | "high" | "hard_block";
  reasons: string[];
}

export interface TaskSnapshot {
  sessionId: string;
  taskId: string;
  lastEventId?: string;
  runtimeStatus: RuntimeStatus;
  activeGoal?: string;
  activeSubgoal?: string;
  shortPlan: string[];
  knownEvidenceRefs: string[];
  memoryRefs: string[];
  failedAttempts: string[];
  pendingConsent?: PendingConsent;
}

export type TaskRuntimeState = TaskSnapshot;
