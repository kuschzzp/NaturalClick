import { describe, expect, it } from "vitest";
import { assemblePlannerContext } from "../../../src/core/context/assembler";
import { resolveRoleModel } from "../../../src/core/model/role-router";
import { validatePlannerDecision } from "../../../src/core/model/contracts";
import type { GlobalModelConfig } from "../../../src/core/model/config";

const config: GlobalModelConfig = {
  provider: {
    baseUrl: "https://api.example.com/v1",
    apiKeyRef: "key-1",
    compatibilityMode: "openai",
    defaultHeaders: {}
  },
  roleModels: { plannerModel: "planner-a", visionModel: "vision-a" },
  capabilities: {
    supportsStreaming: true,
    supportsJsonMode: true,
    supportsToolUse: false,
    supportsVisionInput: true,
    supportsReasoningSummary: false,
    maxContextTokens: 1200,
    maxOutputTokens: 200
  },
  runtime: {
    planner: { requestTimeoutMs: 60000, firstTokenTimeoutMs: 15000, maxRetries: 1, contractRepairAttempts: 1 },
    vision: { requestTimeoutMs: 45000, firstTokenTimeoutMs: 15000, maxRetries: 0, minIntervalMs: 750, maxCallsPerStep: 1 },
    verifier: { requestTimeoutMs: 15000, firstTokenTimeoutMs: 5000, maxRetries: 0 },
    summarizer: { requestTimeoutMs: 20000, firstTokenTimeoutMs: 8000, maxRetries: 0 }
  },
  contextBudget: {
    plannerMaxInputTokens: 400,
    visionMaxInputTokens: 300,
    verifierMaxInputTokens: 200,
    summarizerMaxInputTokens: 300,
    reservedOutputTokens: 120,
    evidenceLimit: 3,
    recentEventLimit: 2,
    observationCandidateLimit: 2,
    rawExcerptLimit: 120,
    compressionStrategy: "evidence_first"
  },
  logging: { level: "summary", storeRawModelRequests: false, storeRawModelResponses: false, storeScreenshotImages: false },
  privacy: { redactSensitiveValues: true, sendScreenshotsToRemoteVision: true }
};

describe("model role routing and context assembly", () => {
  it("uses planner model as optional verifier fallback", () => {
    expect(resolveRoleModel(config, "planner")?.model).toBe("planner-a");
    expect(resolveRoleModel(config, "verifier")?.model).toBe("planner-a");
    expect(resolveRoleModel(config, "vision")?.model).toBe("vision-a");
  });

  it("validates planner decisions and rejects primitive-only actions", () => {
    const result = validatePlannerDecision({
      taskUnderstanding: "open settings",
      activeSubgoal: "open panel",
      shortPlan: ["find settings", "open panel"],
      nextCommand: { type: "ActivateTarget", targetGoal: "settings icon", inputs: {} },
      expectedOutcome: "settings panel opens",
      successCriteria: ["panel_visible"],
      riskHint: "low",
      missingInfo: [],
      assumptions: [],
      reasoningSummary: "settings is visible"
    });
    expect(result.ok).toBe(true);

    const bad = validatePlannerDecision({
      nextCommand: { type: "coordinate_click", x: 10, y: 20 }
    });
    expect(bad.ok).toBe(false);
  });

  it("compresses planner context by preserving schema and limiting candidates", () => {
    const context = assemblePlannerContext({
      config,
      taskText: "Open settings",
      activeSubgoal: "Find settings icon",
      focusedObservation: {
        pageIdentity: "Fixture page",
        candidates: [
          { id: "c1", label: "Settings", role: "button", confidence: 0.9 },
          { id: "c2", label: "Help", role: "button", confidence: 0.8 },
          { id: "c3", label: "Footer", role: "button", confidence: 0.2 }
        ]
      },
      evidence: [
        { id: "e1", claim: "Settings button exists", confidence: 0.9 },
        { id: "e2", claim: "Help button exists", confidence: 0.7 },
        { id: "e3", claim: "Footer is unrelated", confidence: 0.2 },
        { id: "e4", claim: "Old expired item", confidence: 0.1 }
      ],
      recentEvents: ["observed page", "planned action", "old event"],
      schema: { type: "PlannerDecision" }
    });

    expect(context.candidates).toHaveLength(2);
    expect(context.evidence).toHaveLength(3);
    expect(context.schema.type).toBe("PlannerDecision");
  });
});
