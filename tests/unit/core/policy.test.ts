import { describe, expect, it } from "vitest";
import type { SemanticCommand } from "../../../src/core/commands/commands";
import type { ConsentScope } from "../../../src/core/policy/consent";
import { evaluatePolicy } from "../../../src/core/policy/policy";

function command(type: SemanticCommand["type"], targetGoal = "submit form"): SemanticCommand {
  return {
    id: "cmd_1",
    type,
    targetGoal,
    inputs: {},
    expectedOutcome: "done",
    successCriteria: ["done"],
    riskHint: type === "SubmitCurrentForm" ? "medium" : "low",
    fallbackHints: []
  };
}

const consent: ConsentScope = {
  id: "consent-1",
  taskId: "task-1",
  origin: "https://example.test",
  pageIdentity: "Fixture",
  commandTypes: ["SubmitCurrentForm"],
  dataCategories: ["test_data"],
  expiresAt: Date.now() + 60_000
};

describe("policy engine", () => {
  it("allows task-scoped submit consent in balanced mode", () => {
    const decision = evaluatePolicy(command("SubmitCurrentForm"), {
      safetyMode: "balanced",
      consentScope: consent,
      origin: "https://example.test",
      pageIdentity: "Fixture"
    });

    expect(decision.status).toBe("allow");
    expect(decision.consentScopeRef).toBe("consent-1");
  });

  it("asks for ambiguous submit without consent", () => {
    const decision = evaluatePolicy(command("SubmitCurrentForm"), {
      safetyMode: "balanced",
      origin: "https://example.test",
      pageIdentity: "Fixture"
    });

    expect(decision.status).toBe("ask_user");
    expect(decision.requiredUserPrompt).toContain("submit");
  });

  it("hard-blocks payment even in experimental full auto", () => {
    const decision = evaluatePolicy(command("ActivateTarget", "Pay now"), {
      safetyMode: "experimental_full_auto",
      origin: "https://example.test",
      pageIdentity: "Checkout"
    });

    expect(decision.status).toBe("hard_block");
  });

  it("allows low-risk commands in experimental full auto", () => {
    const decision = evaluatePolicy(command("ActivateTarget", "Settings"), {
      safetyMode: "experimental_full_auto",
      origin: "https://example.test",
      pageIdentity: "Fixture"
    });

    expect(decision.status).toBe("allow");
  });

  it("does not reuse expired or cross-origin consent", () => {
    const decision = evaluatePolicy(command("SubmitCurrentForm"), {
      safetyMode: "balanced",
      consentScope: { ...consent, origin: "https://other.test", expiresAt: Date.now() - 1 },
      origin: "https://example.test",
      pageIdentity: "Fixture"
    });

    expect(decision.status).toBe("ask_user");
  });
});
