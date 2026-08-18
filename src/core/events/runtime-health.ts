import type { AgentEvent } from "./events";

export type SessionExecutionHealth = "empty" | "running" | "waiting" | "suspended" | "terminal";

export type RuntimeHealthIssueKind =
  | "slow_observation"
  | "slow_model_call"
  | "too_many_model_calls_for_simple_task"
  | "overlay_active_during_vision";

export interface RuntimeHealthMetrics {
  modelCallMs: number;
  observeMs: number;
  toolMs: number;
  settleMs: number;
  modelCalls: number;
  observationRounds: number;
}

export interface RuntimeHealthIssue {
  kind: RuntimeHealthIssueKind;
  durationMs?: number;
  count?: number;
  eventId?: string;
  message: string;
}

export interface RuntimeHealthReport {
  health: SessionExecutionHealth;
  metrics: RuntimeHealthMetrics;
  issues: RuntimeHealthIssue[];
}

const RUNNING_EVENTS = new Set<AgentEvent["type"]>([
  "TaskStarted",
  "TaskInterpreted",
  "ObservationRequested",
  "ObservationReceived",
  "EvidenceAdded",
  "PlanRequested",
  "PlanProduced",
  "CommandBound",
  "PolicyEvaluated",
  "UserConsentResolved",
  "CommandIssued",
  "CommandResultReceived",
  "VerificationProduced",
  "MemoryUpdated",
  "RecoverySuggested",
  "ModelCallStarted",
  "ModelCallProgress",
  "ModelCallCompleted",
  "ModelCallFailed",
  "ToolCallStarted",
  "ToolCallCompleted",
  "ToolCallFailed",
  "RuntimeResumed",
  "ModelContractViolation",
  "ScreenshotCaptured",
  "VisionRequested",
  "VisionCompleted",
  "VisualEvidenceAdded"
]);

export function deriveSessionExecutionHealth(events: AgentEvent[]): SessionExecutionHealth {
  if (events.length === 0) return "empty";
  const latest = events.at(-1);
  if (!latest) return "empty";

  if (latest.type === "TaskCompleted" || latest.type === "TaskFailed" || latest.type === "TaskStopped") {
    return "terminal";
  }
  if (latest.type === "RuntimeSuspended") return "suspended";
  if (latest.type === "UserConsentRequested") return "waiting";
  if (RUNNING_EVENTS.has(latest.type)) return "running";
  return "running";
}

export function shouldSuspendRecoveredSession(events: AgentEvent[]): boolean {
  return deriveSessionExecutionHealth(events) === "running";
}

export function analyzeRuntimeHealth(events: AgentEvent[]): RuntimeHealthReport {
  const metrics: RuntimeHealthMetrics = {
    modelCallMs: 0,
    observeMs: 0,
    toolMs: 0,
    settleMs: 0,
    modelCalls: 0,
    observationRounds: 0
  };
  const issues: RuntimeHealthIssue[] = [];
  const starts = new Map<string, AgentEvent>();
  const taskText = events.map((event) => (typeof event.payload.taskText === "string" ? event.payload.taskText : "")).find(Boolean) ?? "";

  for (const event of events) {
    const settleMs = numericPayload(event.payload, "settleMs");
    if (settleMs) metrics.settleMs += settleMs;

    if (event.type === "ModelCallStarted" || event.type === "ObservationRequested" || event.type === "ToolCallStarted") {
      starts.set(startKey(event), event);
      if (event.type === "ModelCallStarted") metrics.modelCalls += 1;
      if (event.type === "ObservationRequested") metrics.observationRounds += 1;
      continue;
    }

    if (event.type === "ModelCallCompleted" || event.type === "ModelCallFailed") {
      const duration = durationSinceStart(starts, event);
      metrics.modelCallMs += duration;
      if (duration > 8000) {
        issues.push({
          kind: "slow_model_call",
          durationMs: duration,
          eventId: event.id,
          message: `Model call took ${duration}ms.`
        });
      }
      continue;
    }

    if (event.type === "ObservationReceived") {
      const duration = durationSinceStart(starts, event);
      metrics.observeMs += duration;
      if (duration > 1200) {
        issues.push({
          kind: "slow_observation",
          durationMs: duration,
          eventId: event.id,
          message: `Observation took ${duration}ms.`
        });
      }
      continue;
    }

    if (event.type === "ToolCallCompleted" || event.type === "ToolCallFailed") {
      const duration = durationSinceStart(starts, event);
      metrics.toolMs += duration;
      continue;
    }

    if ((event.type === "ScreenshotCaptured" || event.type === "VisionRequested") && overlayWasActive(event)) {
      issues.push({
        kind: "overlay_active_during_vision",
        eventId: event.id,
        message: "Debug overlay was active during a vision/screenshot step."
      });
    }

  }

  if (metrics.modelCalls > 0 && simpleTaskCouldUseFastPath(taskText)) {
    issues.push({
      kind: "too_many_model_calls_for_simple_task",
      count: metrics.modelCalls,
      message: "A simple task used model calls even though a deterministic fast path may apply."
    });
  }

  return {
    health: deriveSessionExecutionHealth(events),
    metrics,
    issues
  };
}

function startKey(event: AgentEvent): string {
  return `${event.type}:${event.correlationId || event.stepId}`;
}

function matchingStartTypes(event: AgentEvent): AgentEvent["type"][] {
  if (event.type === "ModelCallCompleted" || event.type === "ModelCallFailed") return ["ModelCallStarted"];
  if (event.type === "ObservationReceived") return ["ObservationRequested"];
  if (event.type === "ToolCallCompleted" || event.type === "ToolCallFailed") return ["ToolCallStarted"];
  return [];
}

function durationSinceStart(starts: Map<string, AgentEvent>, event: AgentEvent): number {
  const start = matchingStartTypes(event)
    .map((type) => starts.get(`${type}:${event.correlationId || event.stepId}`))
    .find(Boolean);
  return start ? Math.max(0, event.timestamp - start.timestamp) : 0;
}

function numericPayload(payload: Record<string, unknown>, key: string): number {
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function overlayWasActive(event: AgentEvent): boolean {
  const overlayMode = event.payload.overlayMode;
  return event.payload.overlayActive === true || event.payload.debugOverlayActive === true || (typeof overlayMode === "string" && overlayMode !== "Off");
}

function simpleTaskCouldUseFastPath(taskText: string): boolean {
  return /https?:\/\/[^\s，。；;]+/i.test(taskText) || /(?:点击|点开|打开|进入|选择|\bclick\b|\bselect\b)/iu.test(taskText);
}
