export type EventVisibility = "user" | "debug" | "internal";

export type AgentEventType =
  | "TaskStarted"
  | "TaskInterpreted"
  | "ObservationRequested"
  | "ObservationReceived"
  | "EvidenceAdded"
  | "PlanRequested"
  | "PlanProduced"
  | "CommandBound"
  | "PolicyEvaluated"
  | "UserConsentRequested"
  | "UserConsentResolved"
  | "CommandIssued"
  | "CommandResultReceived"
  | "VerificationProduced"
  | "MemoryUpdated"
  | "RecoverySuggested"
  | "TaskCompleted"
  | "TaskFailed"
  | "TaskStopped"
  | "ModelCallStarted"
  | "ModelCallProgress"
  | "ModelCallCompleted"
  | "ModelCallFailed"
  | "RuntimeSuspended"
  | "RuntimeResumed"
  | "ModelContractViolation"
  | "ScreenshotCaptured"
  | "VisionRequested"
  | "VisionCompleted"
  | "VisualEvidenceAdded";

export interface AgentEvent<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  sessionId: string;
  taskId: string;
  stepId: string;
  type: AgentEventType;
  timestamp: number;
  payload: TPayload;
  visibility: EventVisibility;
  correlationId: string;
}
