import type { AgentEvent } from "../events/events";
import { commandActionKeyFromUnknown } from "./action-key";
import { isContinuableLimitReason } from "./execution-budget";

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

function isTerminalEvent(event: AgentEvent): boolean {
  return event.type === "TaskCompleted" || event.type === "TaskFailed" || event.type === "TaskStopped";
}

function activeElapsedMs(events: AgentEvent[]): number {
  let activeSince: number | undefined;
  let lastActiveTimestamp: number | undefined;
  let elapsedMs = 0;

  for (const event of events) {
    if (typeof event.timestamp !== "number") continue;
    if (event.type === "TaskStarted" && activeSince === undefined) {
      activeSince = event.timestamp;
      lastActiveTimestamp = event.timestamp;
      continue;
    }
    if (activeSince === undefined) {
      if (event.type === "RuntimeResumed") {
        activeSince = event.timestamp;
        lastActiveTimestamp = event.timestamp;
      }
      continue;
    }

    if (event.type === "RuntimeSuspended") {
      const suspendedAt =
        event.payload.reason === "background_recovered_without_controller" ? lastActiveTimestamp ?? event.timestamp : event.timestamp;
      elapsedMs += Math.max(0, suspendedAt - activeSince);
      activeSince = undefined;
      continue;
    }

    lastActiveTimestamp = event.timestamp;
    if (isTerminalEvent(event)) {
      elapsedMs += Math.max(0, event.timestamp - activeSince);
      activeSince = undefined;
    }
  }

  if (activeSince !== undefined && lastActiveTimestamp !== undefined) {
    elapsedMs += Math.max(0, lastActiveTimestamp - activeSince);
  }
  return elapsedMs;
}

function positiveMultiplier(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 1 ? Math.floor(value) : 1;
}

export function nextContinuationBudgetMultiplier(events: AgentEvent[]): number {
  const latest = events.at(-1);
  const reason = latest?.payload.reason;
  const currentMultiplier = positiveMultiplier(
    [...events]
      .reverse()
      .find(
        (event) =>
          (event.type === "RuntimeResumed" || event.type === "RuntimeSuspended") &&
          typeof event.payload.budgetMultiplier === "number"
      )?.payload.budgetMultiplier
  );
  if (latest?.type !== "RuntimeSuspended" || !isContinuableLimitReason(reason)) return currentMultiplier;
  return Math.min(Number.MAX_SAFE_INTEGER, currentMultiplier * 2);
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
