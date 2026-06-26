export type EvidenceKind =
  | "page_identity"
  | "control_presence"
  | "control_value"
  | "validation_feedback"
  | "navigation_state"
  | "content_fact"
  | "action_effect"
  | "user_provided_value"
  | "permission_state"
  | "risk_signal"
  | "failure_reason"
  | "visual_target";

export type EvidenceVisibility = "user" | "debug" | "internal";

export type EvidenceSource =
  | {
      type: "dom";
      eventId?: string;
      pageUrl?: string;
      controlId?: string;
      textId?: string;
      formId?: string;
      locator?: string;
    }
  | {
      type: "visual";
      captureId?: string;
      targetId?: string;
      region?: { x: number; y: number; width: number; height: number };
    }
  | {
      type: "user";
      userActionId?: string;
      description?: string;
    }
  | {
      type: "execution";
      commandId?: string;
      resultId?: string;
      primitive?: string;
    }
  | {
      type: "system" | "model";
      eventId?: string;
      description?: string;
    };

export interface Evidence {
  id: string;
  kind: EvidenceKind;
  claim: string;
  source: EvidenceSource;
  confidence: number;
  observedAt: number;
  taskId?: string;
  goalId?: string;
  commandId?: string;
  relatedGoalId?: string;
  relatedCommandId?: string;
  expiresAt?: number;
  visibility: EvidenceVisibility;
  metadata?: Record<string, unknown>;
}
