import { describe, expect, it } from "vitest";
import { limitStatus, resolveRuntimeSettings } from "../../../src/core/runtime/execution-budget";

describe("execution budget", () => {
  it("uses standard defaults", () => {
    const settings = resolveRuntimeSettings();

    expect(settings.executionPreset).toBe("standard");
    expect(settings.execution.maxStepsPerTask).toBe(8);
    expect(settings.execution.maxTaskDurationMs).toBe(120000);
    expect(settings.execution.maxModelCallsPerTask).toBe(12);
    expect(settings.observation.maxObservationRoundsPerStep).toBe(6);
    expect(settings.observation.initialCandidateLimit).toBe(120);
    expect(settings.observation.expandedCandidateLimit).toBe(320);
    expect(settings.observation.hardCandidateLimit).toBe(600);
    expect(settings.observation.maxObservationTokensPerStep).toBe(36000);
    expect(settings.streaming.runtimeEvents).toBe(true);
    expect(settings.streaming.assistantReplyTokens).toBe(true);
    expect(settings.streaming.showPlannerRawStream).toBe(true);
  });

  it("merges custom budget overrides", () => {
    const settings = resolveRuntimeSettings({
      executionPreset: "custom",
      executionBudget: { maxStepsPerTask: 20 },
      observationBudget: { hardCandidateLimit: 900 },
      streaming: { showPlannerRawStream: true }
    });

    expect(settings.executionPreset).toBe("custom");
    expect(settings.execution.maxStepsPerTask).toBe(20);
    expect(settings.execution.maxModelCallsPerTask).toBe(12);
    expect(settings.observation.hardCandidateLimit).toBe(900);
    expect(settings.observation.maxObservationRoundsPerStep).toBe(6);
    expect(settings.streaming.showPlannerRawStream).toBe(true);
  });

  it("reports step budget exhaustion", () => {
    const settings = resolveRuntimeSettings({ executionBudget: { maxStepsPerTask: 2 } });

    expect(
      limitStatus(
        {
          stepCount: 2,
          modelCallCount: 0,
          consecutiveFailures: 0,
          sameCommandRetries: 0,
          observationRoundCount: 0,
          startedAt: Date.now()
        },
        settings
      )
    ).toEqual({ reached: true, reason: "max_steps" });
  });

  it("reports task observation budget exhaustion", () => {
    const settings = resolveRuntimeSettings({ observationBudget: { maxObservationRoundsPerTask: 3 } });

    expect(
      limitStatus(
        {
          stepCount: 1,
          modelCallCount: 1,
          consecutiveFailures: 0,
          sameCommandRetries: 0,
          observationRoundCount: 3,
          startedAt: Date.now()
        },
        settings
      )
    ).toEqual({ reached: true, reason: "max_observation_rounds" });
  });
});
