import type { PrimitiveResult } from "../../adapters/content/primitive-executor";
import type { SemanticCommand } from "../commands/commands";
import type { ControlCandidate, PageModel } from "../observation/page-model";

export interface VerifyOutcomeInput {
  command: SemanticCommand;
  before: PageModel;
  after: PageModel;
  primitiveResult: PrimitiveResult;
}

export interface VerificationResult {
  status: "success" | "partial" | "failed" | "inconclusive";
  confidence: number;
  satisfiedCriteria: string[];
  failedCriteria: string[];
  newEvidence: string[];
  failureReason?: string;
  recoveryHints: string[];
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function matchesTarget(control: ControlCandidate, targetGoal: string): boolean {
  const target = normalize(targetGoal);
  const text = normalize(`${control.label} ${control.accessibleName} ${control.role}`);
  return Boolean(target && text.includes(target)) || Boolean(text && target.includes(normalize(control.label)));
}

function targetControls(page: PageModel, command: SemanticCommand): ControlCandidate[] {
  return page.controls.filter((control) => matchesTarget(control, command.targetGoal));
}

function controlValueMatches(command: SemanticCommand, before: PageModel, after: PageModel): boolean {
  const afterControl = targetControls(after, command)[0];
  if (!afterControl) return false;

  const beforeControl = targetControls(before, command)[0];
  if (command.type === "FillField") {
    return afterControl.valueState === "filled" && beforeControl?.valueState !== "filled";
  }
  return afterControl.valueState === "filled" || afterControl.valueState === "checked" || afterControl.valueState === "selected";
}

function pageChanged(before: PageModel, after: PageModel): boolean {
  return before.pageIdentity.url !== after.pageIdentity.url || before.pageIdentity.title !== after.pageIdentity.title;
}

function targetVisible(command: SemanticCommand, after: PageModel): boolean {
  return targetControls(after, command).some((control) => control.visibility === "visible");
}

function validationFeedback(after: PageModel): string[] {
  return after.feedback.filter(Boolean);
}

function evaluateCriterion(input: VerifyOutcomeInput, criterion: string): { satisfied: boolean; evidence?: string } {
  if (criterion === "control_value_matches") {
    return {
      satisfied: controlValueMatches(input.command, input.before, input.after),
      evidence: "target control value state changed to filled"
    };
  }
  if (criterion === "submission_feedback_or_validation") {
    const feedback = validationFeedback(input.after);
    return {
      satisfied: feedback.length > 0 || pageChanged(input.before, input.after),
      evidence: feedback[0] ?? "page changed after submission"
    };
  }
  if (criterion === "page_changed") {
    return {
      satisfied: pageChanged(input.before, input.after),
      evidence: `page changed to ${input.after.pageIdentity.url}`
    };
  }
  if (criterion === "target_visible") {
    return {
      satisfied: targetVisible(input.command, input.after),
      evidence: `target "${input.command.targetGoal}" is visible`
    };
  }
  return { satisfied: false };
}

export function verifyOutcome(input: VerifyOutcomeInput): VerificationResult {
  if (input.primitiveResult.status === "failed") {
    return {
      status: "failed",
      confidence: 0.9,
      satisfiedCriteria: [],
      failedCriteria: input.command.successCriteria,
      newEvidence: [],
      failureReason: input.primitiveResult.reason ?? "primitive_failed",
      recoveryHints: ["Re-observe the page before retrying the command."]
    };
  }

  const satisfiedCriteria: string[] = [];
  const failedCriteria: string[] = [];
  const newEvidence: string[] = [];

  for (const criterion of input.command.successCriteria) {
    const result = evaluateCriterion(input, criterion);
    if (result.satisfied) {
      satisfiedCriteria.push(criterion);
      if (result.evidence) newEvidence.push(result.evidence);
    } else {
      failedCriteria.push(criterion);
    }
  }

  const feedback = validationFeedback(input.after);
  if (input.command.type === "SubmitCurrentForm" && feedback.length > 0) {
    return {
      status: "partial",
      confidence: 0.78,
      satisfiedCriteria,
      failedCriteria,
      newEvidence: [...newEvidence, ...feedback],
      failureReason: "validation_error",
      recoveryHints: feedback.map((message) => `Resolve validation feedback: ${message}`)
    };
  }

  if (satisfiedCriteria.length === input.command.successCriteria.length && satisfiedCriteria.length > 0) {
    return {
      status: "success",
      confidence: 0.86,
      satisfiedCriteria,
      failedCriteria,
      newEvidence,
      recoveryHints: []
    };
  }

  if (satisfiedCriteria.length > 0) {
    return {
      status: "partial",
      confidence: 0.62,
      satisfiedCriteria,
      failedCriteria,
      newEvidence,
      recoveryHints: ["Use the remaining failed criteria to plan the next recovery step."]
    };
  }

  return {
    status: "inconclusive",
    confidence: 0.35,
    satisfiedCriteria,
    failedCriteria,
    newEvidence,
    failureReason: "criteria_not_observed",
    recoveryHints: ["Observe the page again or use visual grounding if DOM evidence is insufficient."]
  };
}
