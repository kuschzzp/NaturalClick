import { describe, expect, it } from "vitest";
import { MemoryEventStore } from "../../../src/core/events/memory-event-store";
import type { PageModel } from "../../../src/core/observation/page-model";
import { initialCapabilities } from "../../../src/core/capabilities/registry";
import { AgentRuntime } from "../../../src/core/runtime/agent-runtime";

const page: PageModel = {
  pageIdentity: {
    url: "https://example.test",
    title: "Fixture",
    origin: "https://example.test",
    path: "/"
  },
  viewport: { width: 1280, height: 720, scrollX: 0, scrollY: 0, deviceScaleFactor: 1 },
  feedback: [],
  readableContent: [],
  textBlocks: [],
  forms: [],
  riskSignals: [],
  capturedAt: 1,
  controls: [
    {
      semanticId: "settings_button",
      role: "button",
      label: "Settings",
      accessibleName: "Settings",
      elementTag: "button",
      disabled: false,
      required: false,
      visibility: "visible",
      interactionHints: ["button"],
      locatorHints: [{ kind: "css", value: "#settings" }],
      confidence: 0.9
    }
  ]
};

describe("AgentRuntime", () => {
  it("runs one observe-plan-bind-policy-execute-verify step", async () => {
    const store = new MemoryEventStore();
    const runtime = new AgentRuntime({
      sessionId: "session-1",
      taskId: "task-1",
      appendEvent: (event) => store.append(event),
      observePage: async () => page,
      plan: async () => ({
        taskUnderstanding: "open settings",
        activeSubgoal: "open settings panel",
        shortPlan: ["find settings", "open settings"],
        nextCommand: {
          type: "ActivateTarget",
          targetGoal: "Settings",
          inputs: {}
        },
        expectedOutcome: "settings panel opens",
        successCriteria: ["target_visible"],
        riskHint: "low",
        missingInfo: [],
        assumptions: [],
        reasoningSummary: "Settings button is visible"
      }),
      execute: async () => ({ status: "success", details: { clicked: true } })
    });

    await runtime.startTask("Open settings");
    await runtime.runNextStep();

    const events = await store.loadAfter("session-1", "task-1");
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "TaskStarted",
        "TaskInterpreted",
        "ObservationRequested",
        "ObservationReceived",
        "EvidenceAdded",
        "PlanRequested",
        "PlanProduced",
        "CommandBound",
        "PolicyEvaluated",
        "CommandIssued",
        "CommandResultReceived",
        "VerificationProduced"
      ])
    );
    expect(events.find((event) => event.type === "VerificationProduced")?.payload.status).toBe("success");
  });

  it("exposes initial capability ids", () => {
    expect(initialCapabilities).toContain("VisionCapability");
  });
});
