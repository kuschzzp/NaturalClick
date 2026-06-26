import type { AgentEvent } from "./events";
import type { TaskRuntimeState, TaskSnapshot } from "./snapshot";

function initialFrom(event: AgentEvent): TaskRuntimeState {
  return {
    sessionId: event.sessionId,
    taskId: event.taskId,
    runtimeStatus: "idle",
    shortPlan: [],
    knownEvidenceRefs: [],
    memoryRefs: [],
    failedAttempts: []
  };
}

export class StateReducer {
  static reduce(snapshot: TaskSnapshot | undefined, events: AgentEvent[]): TaskRuntimeState {
    let state: TaskRuntimeState | undefined = snapshot ? { ...snapshot, shortPlan: [...snapshot.shortPlan] } : undefined;

    for (const event of events) {
      state ??= initialFrom(event);
      state.lastEventId = event.id;

      if (event.type === "TaskStarted") {
        state.runtimeStatus = "running";
      }
      if (event.type === "PlanProduced") {
        const shortPlan = event.payload.shortPlan;
        state.shortPlan = Array.isArray(shortPlan) ? shortPlan.map(String) : state.shortPlan;
        state.activeSubgoal = typeof event.payload.activeSubgoal === "string" ? event.payload.activeSubgoal : state.activeSubgoal;
      }
      if (event.type === "EvidenceAdded" && typeof event.payload.evidenceId === "string") {
        state.knownEvidenceRefs = Array.from(new Set([...state.knownEvidenceRefs, event.payload.evidenceId]));
      }
      if (event.type === "PolicyEvaluated") {
        const decision = event.payload.decision as { status?: string; riskLevel?: string; reasons?: string[] } | undefined;
        if (decision?.status === "ask_user") {
          state.runtimeStatus = "waiting";
          state.pendingConsent = {
            riskLevel: decision.riskLevel === "high" ? "high" : decision.riskLevel === "hard_block" ? "hard_block" : "medium",
            reasons: Array.isArray(decision.reasons) ? decision.reasons : []
          };
        }
      }
      if (event.type === "UserConsentResolved") {
        state.pendingConsent = undefined;
        state.runtimeStatus = "running";
      }
      if (event.type === "VerificationProduced" && event.payload.status === "failed") {
        state.failedAttempts = [...state.failedAttempts, event.id];
      }
      if (event.type === "TaskCompleted") {
        state.runtimeStatus = "completed";
      }
      if (event.type === "TaskFailed") {
        state.runtimeStatus = "failed";
      }
      if (event.type === "TaskStopped") {
        state.runtimeStatus = "stopped";
      }
    }

    return state ?? {
      sessionId: "unknown",
      taskId: "unknown",
      runtimeStatus: "idle",
      shortPlan: [],
      knownEvidenceRefs: [],
      memoryRefs: [],
      failedAttempts: []
    };
  }
}
