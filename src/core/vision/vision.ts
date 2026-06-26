import type { Evidence } from "../evidence/evidence";
import type { GlobalModelConfig } from "../model/config";
import type { ControlCandidate, ElementBounds, PageIdentity } from "../observation/page-model";

export interface VisualObservationRequest {
  requestId: string;
  taskId: string;
  reason: "dom_inconclusive" | "binding_failed" | "verification_inconclusive" | "user_requested";
  pageIdentity: PageIdentity;
  targetGoal?: string;
  screenshotRef?: string;
}

export interface GroundVisualTargetRequest {
  requestId: string;
  targetGoal: string;
  pageIdentity: PageIdentity;
  domCandidates: Pick<ControlCandidate, "semanticId" | "role" | "label" | "confidence">[];
  nearbyText: string[];
}

export interface VisualTargetCandidate {
  label: string;
  roleGuess: string;
  boundingBox: ElementBounds;
  nearbyText: string[];
  confidence: number;
  screenshotRef: string;
  reasoningSummary: string;
}

export type VisualEvidence = Evidence & {
  kind: "visual_target";
};

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function isVisionAvailable(config: GlobalModelConfig): boolean {
  return Boolean(
    config.roleModels.visionModel &&
      config.capabilities.supportsVisionInput &&
      config.privacy.sendScreenshotsToRemoteVision
  );
}

export function visualCandidateToEvidence(candidate: VisualTargetCandidate, sourceRequestId: string): VisualEvidence {
  return {
    id: `ev_visual_${sourceRequestId}_${candidate.label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")}`,
    kind: "visual_target",
    claim: `Visual target "${candidate.label}" appears as ${candidate.roleGuess}`,
    source: {
      type: "visual",
      captureId: candidate.screenshotRef,
      targetId: sourceRequestId,
      region: candidate.boundingBox
    },
    confidence: clampConfidence(candidate.confidence),
    observedAt: Date.now(),
    visibility: "debug",
    metadata: {
      nearbyText: candidate.nearbyText,
      reasoningSummary: candidate.reasoningSummary
    }
  };
}

export function parseVisualTargetCandidates(value: unknown): VisualTargetCandidate[] {
  const list =
    Array.isArray(value)
      ? value
      : value && typeof value === "object" && Array.isArray((value as { candidates?: unknown }).candidates)
        ? (value as { candidates: unknown[] }).candidates
        : [];

  return list.flatMap((item): VisualTargetCandidate[] => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Partial<VisualTargetCandidate>;
    const box = candidate.boundingBox as Partial<ElementBounds> | undefined;
    if (
      typeof candidate.label !== "string" ||
      typeof candidate.roleGuess !== "string" ||
      !box ||
      typeof box.x !== "number" ||
      typeof box.y !== "number" ||
      typeof box.width !== "number" ||
      typeof box.height !== "number" ||
      typeof candidate.confidence !== "number" ||
      typeof candidate.screenshotRef !== "string"
    ) {
      return [];
    }

    return [
      {
        label: candidate.label,
        roleGuess: candidate.roleGuess,
        boundingBox: { x: box.x, y: box.y, width: box.width, height: box.height },
        nearbyText: Array.isArray(candidate.nearbyText) ? candidate.nearbyText.map(String) : [],
        confidence: clampConfidence(candidate.confidence),
        screenshotRef: candidate.screenshotRef,
        reasoningSummary: String(candidate.reasoningSummary ?? "")
      }
    ];
  });
}
