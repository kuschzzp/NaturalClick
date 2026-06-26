import { describe, expect, it } from "vitest";
import type { PrimitiveResult } from "../../../src/adapters/content/primitive-executor";
import type { SemanticCommand } from "../../../src/core/commands/commands";
import { SessionMemoryStore } from "../../../src/core/memory/session-memory";
import type { PageModel } from "../../../src/core/observation/page-model";
import { interpretTask } from "../../../src/core/runtime/task-interpreter";
import { verifyOutcome } from "../../../src/core/verification/verifier";

function fillCommand(): SemanticCommand {
  return {
    id: "cmd_fill",
    type: "FillField",
    targetGoal: "Email",
    inputs: { value: "alice@example.com" },
    expectedOutcome: "Email field contains alice@example.com",
    successCriteria: ["control_value_matches"],
    riskHint: "low",
    fallbackHints: []
  };
}

function primitive(status: PrimitiveResult["status"] = "success"): PrimitiveResult {
  return { status, details: {} };
}

function pageWithEmail(value: string, feedback: string[] = []): PageModel {
  return {
    pageIdentity: {
      url: "https://example.test/form",
      title: "Form",
      origin: "https://example.test",
      path: "/form"
    },
    viewport: { width: 1280, height: 720, scrollX: 0, scrollY: 0, deviceScaleFactor: 1 },
    readableContent: [],
    feedback,
    textBlocks: [],
    forms: [],
    riskSignals: [],
    capturedAt: 1,
    controls: [
      {
        semanticId: "email",
        role: "textbox",
        label: "Email",
        accessibleName: "Email",
        elementTag: "input",
        valueState: value ? "filled" : "empty",
        required: true,
        disabled: false,
        visibility: "visible",
        interactionHints: ["input"],
        locatorHints: [{ kind: "css", value: "#email" }],
        confidence: 0.9
      }
    ]
  };
}

describe("verifier, memory, and task interpretation", () => {
  it("verifies field fill by matching control value", () => {
    const result = verifyOutcome({
      command: fillCommand(),
      before: pageWithEmail(""),
      after: pageWithEmail("alice@example.com"),
      primitiveResult: primitive()
    });

    expect(result.status).toBe("success");
    expect(result.satisfiedCriteria).toContain("control_value_matches");
  });

  it("treats validation feedback after submit as partial progress", () => {
    const submit: SemanticCommand = {
      ...fillCommand(),
      id: "cmd_submit",
      type: "SubmitCurrentForm",
      targetGoal: "current form submit",
      expectedOutcome: "form submitted or validation shown",
      successCriteria: ["submission_feedback_or_validation"],
      riskHint: "medium"
    };

    const result = verifyOutcome({
      command: submit,
      before: pageWithEmail("alice@example.com"),
      after: pageWithEmail("alice@example.com", ["Name is required"]),
      primitiveResult: primitive()
    });

    expect(result.status).toBe("partial");
    expect(result.failureReason).toBe("validation_error");
  });

  it("records submit prohibition from task text", () => {
    const frame = interpretTask("Fill this form but do not submit");

    expect(frame.deniedCommandTypes).toContain("SubmitCurrentForm");
    expect(frame.initialProfile).toBe("LightFormProfile");
  });

  it("extracts simple provided values from task text", () => {
    const frame = interpretTask("Set email to alice@example.com and save");

    expect(frame.allowedCommandTypes).toContain("SubmitCurrentForm");
    expect(frame.providedValues.email).toBe("alice@example.com");
  });

  it("stores verified facts and ignores missing kinds", () => {
    const memory = new SessionMemoryStore();
    memory.addFact({
      id: "mem_1",
      kind: "created_record",
      value: { label: "Alice" },
      sourceEvidenceRefs: ["ev_success"],
      confidence: 0.9,
      sensitivity: "public",
      scope: "current_session",
      expiresAt: Date.now() + 60_000
    });

    expect(memory.findByKind("created_record")).toHaveLength(1);
    expect(memory.findByKind("failed_record")).toHaveLength(0);
  });
});
