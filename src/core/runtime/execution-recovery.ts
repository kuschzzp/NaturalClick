import type { AgentEvent } from "../events/events";
import { commandActionKeyFromUnknown } from "./action-key";

export interface RestoredExecutionCounters {
  stepCount: number;
  modelCallCount: number;
  observationRoundCount: number;
  consecutiveFailures: number;
  sameCommandRetries: number;
  lastActionKey?: string;
  activeElapsedMs: number;
}

const STEP_EVENTS = new Set<AgentEvent["type"]>([
  "ObservationRequested",
  "ObservationReceived",
  "EvidenceAdded",
  "PlanRequested",
  "ModelCallStarted",
  "ModelCallProgress",
  "ModelCallCompleted",
  "ModelCallFailed",
  "PlanProduced",
  "CommandBound",
  "PolicyEvaluated",
  "UserConsentRequested",
  "CommandIssued",
  "CommandResultReceived",
  "VerificationProduced",
  "RecoverySuggested",
  "TaskCompleted",
  "TaskFailed"
]);

function eventStatus(event: AgentEvent): "failed" | "success" | undefined {
  if (event.type === "TaskFailed" || event.type === "ModelCallFailed") return "failed";
  if (event.type === "CommandResultReceived") {
    const result = event.payload.result;
    if (result && typeof result === "object" && "status" in result) {
      return (result as { status?: unknown }).status === "failed" ? "failed" : "success";
    }
  }
  if (event.type === "VerificationProduced") {
    return event.payload.status === "failed" ? "failed" : "success";
  }
  if (event.type === "TaskCompleted") return "success";
  return undefined;
}

function activeElapsedMs(events: AgentEvent[]): number {
  const startedAt = events.find((event) => event.type === "TaskStarted")?.timestamp;
  if (typeof startedAt !== "number") return 0;
  const lastActive = [...events]
    .reverse()
    .find((event) => event.type !== "RuntimeSuspended" || event.payload.reason !== "background_recovered_without_controller");
  if (typeof lastActive?.timestamp !== "number") return 0;
  return Math.max(0, lastActive.timestamp - startedAt);
}

function consecutiveFailedSteps(events: AgentEvent[]): number {
  const stepStatuses = new Map<string, "failed" | "success">();
  for (const event of events) {
    const status = eventStatus(event);
    if (status) stepStatuses.set(event.stepId, status);
  }

  let count = 0;
  for (const status of Array.from(stepStatuses.values()).reverse()) {
    if (status !== "failed") break;
    count += 1;
  }
  return count;
}

function stepActionKeys(events: AgentEvent[]): string[] {
  const byStep = new Map<string, string[]>();
  for (const event of events) {
    if (event.type !== "CommandIssued" || event.payload.retry !== undefined) continue;
    const actionKey = commandActionKeyFromUnknown(event.payload.command);
    if (!actionKey) continue;
    const keys = byStep.get(event.stepId) ?? [];
    keys.push(actionKey);
    byStep.set(event.stepId, keys);
  }
  return Array.from(byStep.values())
    .map((keys) => keys.join(" -> "))
    .filter(Boolean);
}

function sameCommandRetryState(events: AgentEvent[]): Pick<RestoredExecutionCounters, "sameCommandRetries" | "lastActionKey"> {
  const actionKeys = stepActionKeys(events);
  const lastActionKey = actionKeys.at(-1);
  if (!lastActionKey) return { sameCommandRetries: 0 };

  let sameCommandRetries = 0;
  for (let index = actionKeys.length - 2; index >= 0; index -= 1) {
    if (actionKeys[index] !== lastActionKey) break;
    sameCommandRetries += 1;
  }
  return { sameCommandRetries, lastActionKey };
}

function isCachedObservationRequest(event: AgentEvent): boolean {
  return event.type === "ObservationRequested" && event.payload.cached === true;
}

export function restoreExecutionCounters(events: AgentEvent[]): RestoredExecutionCounters {
  const stepIds = new Set<string>();
  let modelCallCount = 0;
  let observationRoundCount = 0;

  for (const event of events) {
    if (STEP_EVENTS.has(event.type)) stepIds.add(event.stepId);
    if (event.type === "ModelCallStarted") modelCallCount += 1;
    if (event.type === "ObservationRequested" && !isCachedObservationRequest(event)) observationRoundCount += 1;
  }
  const retryState = sameCommandRetryState(events);

  return {
    stepCount: stepIds.size,
    modelCallCount,
    observationRoundCount,
    consecutiveFailures: consecutiveFailedSteps(events),
    ...retryState,
    activeElapsedMs: activeElapsedMs(events)
  };
}
