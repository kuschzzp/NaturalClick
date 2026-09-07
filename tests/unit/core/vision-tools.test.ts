import { describe, expect, it } from "vitest";
import type { GlobalModelConfig } from "../../../src/core/model/config";
import { isVisionAvailable, visualCandidateToEvidence } from "../../../src/core/vision/vision";

const baseConfig: GlobalModelConfig = {
  provider: { baseUrl: "https://api.example.com/v1", apiKeyRef: "key", compatibilityMode: "openai", defaultHeaders: {} },
  roleModels: { plannerModel: "planner" },
  capabilities: {
    supportsStreaming: true,
    supportsJsonMode: true,
    supportsToolUse: false,
    supportsVisionInput: true,
    supportsReasoningSummary: false,
    maxContextTokens: 4000,
    maxOutputTokens: 800
  },
  runtime: {
    planner: { requestTimeoutMs: 60000, firstTokenTimeoutMs: 15000, maxRetries: 1, contractRepairAttempts: 1 },
    vision: { requestTimeoutMs: 45000, firstTokenTimeoutMs: 15000, maxRetries: 0, minIntervalMs: 750, maxCallsPerStep: 1 },
    verifier: { requestTimeoutMs: 15000, firstTokenTimeoutMs: 5000, maxRetries: 0 },
    summarizer: { requestTimeoutMs: 20000, firstTokenTimeoutMs: 8000, maxRetries: 0 }
  },
  contextBudget: {
    plannerMaxInputTokens: 3000,
    visionMaxInputTokens: 1000,
    verifierMaxInputTokens: 800,
    summarizerMaxInputTokens: 1000,
    reservedOutputTokens: 400,
    evidenceLimit: 10,
    recentEventLimit: 8,
    observationCandidateLimit: 20,
    rawExcerptLimit: 1000,
    compressionStrategy: "evidence_first"
  },
  logging: { level: "summary", storeRawModelRequests: false, storeRawModelResponses: false, storeScreenshotImages: false },
  privacy: { redactSensitiveValues: true, sendScreenshotsToRemoteVision: true }
};

describe("VisionCapability", () => {
  it("is disabled when no vision model is configured", () => {
    expect(isVisionAvailable(baseConfig)).toBe(false);
  });

  it("is enabled when a vision model, capability, and privacy gate are present", () => {
    expect(isVisionAvailable({ ...baseConfig, roleModels: { ...baseConfig.roleModels, visionModel: "vision" } })).toBe(true);
    expect(
      isVisionAvailable({
        ...baseConfig,
        roleModels: { ...baseConfig.roleModels, visionModel: "vision" },
        privacy: { ...baseConfig.privacy, sendScreenshotsToRemoteVision: false }
      })
    ).toBe(false);
  });

  it("converts visual candidates to evidence", () => {
    const evidence = visualCandidateToEvidence(
      {
        label: "Settings",
        roleGuess: "button",
        boundingBox: { x: 10, y: 20, width: 80, height: 32 },
        nearbyText: ["Profile"],
        confidence: 0.91,
        screenshotRef: "shot_1",
        reasoningSummary: "icon button near profile"
      },
      "vision_req_1"
    );

    expect(evidence.kind).toBe("visual_target");
    expect(evidence.claim).toContain("Settings");
    expect(evidence.confidence).toBe(0.91);
  });
});
