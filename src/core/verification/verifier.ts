import type { PrimitiveResult, SemanticCommand } from "../commands/commands";
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

function inputString(command: SemanticCommand, key: string): string | undefined {
  const value = command.inputs[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function explicitTargetId(command: SemanticCommand): string | undefined {
  return (
    inputString(command, "semanticId") ??
    inputString(command, "controlId") ??
    inputString(command, "targetRef") ??
    inputString(command, "targetId") ??
    inputString(command, "controlRef")
  );
}

function matchesTarget(control: ControlCandidate, targetGoal: string): boolean {
  const target = normalize(targetGoal);
  const locatorText = control.locatorHints.map((hint) => hint.value).join(" ");
  const text = normalize(`${control.semanticId} ${control.label} ${control.accessibleName} ${control.role} ${locatorText}`);
  return Boolean(target && text.includes(target)) || Boolean(text && target.includes(normalize(control.label)));
}

function targetControls(page: PageModel, command: SemanticCommand): ControlCandidate[] {
  const explicit = explicitTargetId(command);
  if (explicit) {
    const exact = page.controls.find((control) => control.semanticId === explicit);
    if (exact) return [exact];
  }
  return page.controls.filter((control) => matchesTarget(control, command.targetGoal));
}

function primitiveValueMatches(input: VerifyOutcomeInput): boolean {
  if (input.command.type !== "FillField" && input.command.type !== "SelectOption") return false;
  return (
    (input.primitiveResult.details.primitive === "dom_input" || input.primitiveResult.details.primitive === "dom_select_option") &&
    input.primitiveResult.details.valueMatchesExpected === true
  );
}

function desiredCheckedState(command: SemanticCommand): boolean | undefined {
  if (typeof command.inputs.desiredChecked === "boolean") return command.inputs.desiredChecked;
  const desiredState = inputString(command, "desiredState") ?? inputString(command, "state") ?? inputString(command, "value");
  if (!desiredState) return undefined;
  const normalized = normalize(desiredState);
  if (["checked", "on", "open", "enabled", "true", "selected"].includes(normalized)) return true;
  if (["unchecked", "off", "closed", "disabled", "false", "unselected", "deselected"].includes(normalized)) return false;
  if (/(开启|打开|启用|选中|勾选)/u.test(desiredState)) return true;
  if (/(关闭|禁用|停用|取消选中|取消勾选)/u.test(desiredState)) return false;
  return undefined;
}

function observedCheckedState(control: ControlCandidate): boolean | undefined {
  if (typeof control.checked === "boolean") return control.checked;
  if (control.valueState === "checked" || control.valueState === "selected") return true;
  if (control.valueState === "unchecked") return false;
  return undefined;
}

function primitiveCheckedState(result: PrimitiveResult): boolean | undefined {
  if (typeof result.details.checkedStateAfter === "boolean") return result.details.checkedStateAfter;
  if (result.details.valueStateAfter === "checked" || result.details.valueStateAfter === "selected") return true;
  if (result.details.valueStateAfter === "unchecked") return false;
  return undefined;
}

function controlStateMatches(input: VerifyOutcomeInput): boolean {
  const desired = desiredCheckedState(input.command);
  if (desired === undefined) return false;

  const primitiveState = primitiveCheckedState(input.primitiveResult);
  if (primitiveState !== undefined) return primitiveState === desired;

  const afterControl = targetControls(input.after, input.command)[0];
  if (!afterControl) return false;
  return observedCheckedState(afterControl) === desired;
}

function controlValueMatches(input: VerifyOutcomeInput): boolean {
  if (primitiveValueMatches(input)) return true;
  const { command, after } = input;
  const afterControl = targetControls(after, command)[0];
  if (!afterControl) return false;

  if (command.type === "FillField" || command.type === "SelectOption") {
    return afterControl.valueState === "filled" || afterControl.valueState === "selected" || afterControl.valueState === "checked";
  }
  return afterControl.valueState === "filled" || afterControl.valueState === "checked" || afterControl.valueState === "selected";
}

function contentRead(input: VerifyOutcomeInput): boolean {
  if (input.command.type !== "ReadContent") return false;
  if (input.primitiveResult.status !== "success") return false;
  if (input.primitiveResult.details.primitive !== "read_content") return false;
  if (typeof input.primitiveResult.details.textLength === "number") return input.primitiveResult.details.textLength > 0;
  const text = input.primitiveResult.details.text;
  return typeof text === "string" && text.trim().length > 0;
}

function pageChanged(before: PageModel, after: PageModel): boolean {
  return before.pageIdentity.url !== after.pageIdentity.url || before.pageIdentity.title !== after.pageIdentity.title;
}

function primitiveScrollMoved(input: VerifyOutcomeInput): boolean {
  if (input.command.type !== "ScrollRegion") return false;
  if (input.primitiveResult.status !== "success") return false;
  if (input.primitiveResult.details.primitive !== "scroll") return false;
  if (input.primitiveResult.details.scrollMoved !== true) return false;
  const direction = input.command.inputs.direction === "up" ? "up" : "down";
  return !input.primitiveResult.details.direction || input.primitiveResult.details.direction === direction;
}

function viewportScrolled(input: VerifyOutcomeInput): boolean {
  if (primitiveScrollMoved(input)) return true;
  if (input.command.type !== "ScrollRegion") return false;
  const direction = input.command.inputs.direction === "up" ? "up" : "down";
  const beforeY = input.before.viewport.scrollY;
  const afterY = input.after.viewport.scrollY;
  return direction === "up" ? afterY < beforeY : afterY > beforeY;
}

function waitCompleted(input: VerifyOutcomeInput): boolean {
  return (
    input.command.type === "WaitForChange" &&
    input.primitiveResult.status === "success" &&
    input.primitiveResult.details.primitive === "wait"
  );
}

function browserNavigationCompleted(input: VerifyOutcomeInput): boolean {
  return (
    input.command.type === "BrowserNavigation" &&
    input.primitiveResult.status === "success" &&
    input.primitiveResult.details.primitive === "history"
  );
}

function targetVisible(command: SemanticCommand, after: PageModel): boolean {
  return targetControls(after, command).some((control) => control.visibility === "visible");
}

function targetNotVisible(command: SemanticCommand, after: PageModel): boolean {
  const controls = targetControls(after, command);
  return controls.length === 0 || controls.every((control) => control.visibility !== "visible");
}

function visibleChildControls(page: PageModel, control: ControlCandidate): ControlCandidate[] {
  const childRefs = new Set(control.childRefs ?? []);
  return page.controls.filter((candidate) => childRefs.has(candidate.semanticId) && candidate.visibility === "visible");
}

function menuExpanded(command: SemanticCommand, after: PageModel): boolean {
  return targetControls(after, command).some((control) => {
    if (control.expandedState === "expanded") return true;
    return visibleChildControls(after, control).length > 0;
  });
}

function menuCollapsed(command: SemanticCommand, after: PageModel): boolean {
  return targetControls(after, command).some((control) => {
    if (control.expandedState === "collapsed") return true;
    const childRefs = new Set(control.childRefs ?? []);
    if (childRefs.size === 0) return false;
    return after.controls.every((candidate) => !childRefs.has(candidate.semanticId) || candidate.visibility !== "visible");
  });
}

function childTargetVisible(command: SemanticCommand, after: PageModel): boolean {
  return targetControls(after, command).some((control) => visibleChildControls(after, control).length > 0);
}

function validationFeedback(after: PageModel): string[] {
  return classifiedFeedback(after.feedback).validation;
}

interface ClassifiedFeedback {
  positive: string[];
  validation: string[];
  unknown: string[];
}

const positiveFeedbackPattern =
  /(?:成功|已保存|保存成功|提交成功|已提交|完成|已完成|已更新|更新成功|应用成功|设置已保存|\bsuccess(?:ful)?\b|\bsaved\b|\bsubmitted\b|\bcompleted?\b|\bupdated\b|\bapplied\b|\bdone\b)/iu;
const validationFeedbackPattern =
  /(?:失败|错误|报错|无效|不正确|不能为空|必填|缺少|未填写|请选择|请输入|请填写|请补全|重试|\berror\b|\bfailed\b|\bfailure\b|\binvalid\b|\brequired\b|\bmissing\b|\bincorrect\b|\btry again\b|\bplease\s+(?:enter|fill|select|provide|complete)\b)/iu;

function classifiedFeedback(messages: string[]): ClassifiedFeedback {
  const classified: ClassifiedFeedback = { positive: [], validation: [], unknown: [] };
  for (const message of messages.map((item) => item.trim()).filter(Boolean)) {
    if (validationFeedbackPattern.test(message)) {
      classified.validation.push(message);
    } else if (positiveFeedbackPattern.test(message)) {
      classified.positive.push(message);
    } else {
      classified.unknown.push(message);
    }
  }
  return classified;
}

function submissionFeedbackEvidence(input: VerifyOutcomeInput): string | undefined {
  const feedback = classifiedFeedback(input.after.feedback);
  return feedback.positive[0] ?? feedback.validation[0] ?? feedback.unknown[0] ?? (pageChanged(input.before, input.after) ? "page changed after submission" : undefined);
}

function evaluateCriterion(input: VerifyOutcomeInput, criterion: string): { satisfied: boolean; evidence?: string } {
  if (criterion === "control_value_matches") {
    return {
      satisfied: controlValueMatches(input),
      evidence: "target control value was applied"
    };
  }
  if (criterion === "content_read") {
    const textLength = input.primitiveResult.details.textLength;
    return {
      satisfied: contentRead(input),
      evidence: `read ${typeof textLength === "number" ? textLength : "target"} characters of content`
    };
  }
  if (criterion === "control_state_matches") {
    return {
      satisfied: controlStateMatches(input),
      evidence: "target control state matches the requested state"
    };
  }
  if (criterion === "submission_feedback_or_validation") {
    const evidence = submissionFeedbackEvidence(input);
    return {
      satisfied: Boolean(evidence),
      evidence
    };
  }
  if (criterion === "page_changed") {
    return {
      satisfied: pageChanged(input.before, input.after),
      evidence: `page changed to ${input.after.pageIdentity.url}`
    };
  }
  if (criterion === "viewport_scrolled") {
    return {
      satisfied: viewportScrolled(input),
      evidence: `viewport scroll is now ${input.after.viewport.scrollX},${input.after.viewport.scrollY}`
    };
  }
  if (criterion === "wait_completed") {
    return {
      satisfied: waitCompleted(input),
      evidence: `wait completed for ${input.primitiveResult.details.milliseconds ?? input.command.inputs.milliseconds ?? "requested"}ms`
    };
  }
  if (criterion === "key_pressed") {
    return {
      satisfied: input.primitiveResult.details.primitive === "key_press" && input.primitiveResult.details.key === input.command.inputs.key,
      evidence: `pressed key ${input.command.inputs.key ?? input.primitiveResult.details.key ?? "requested"}`
    };
  }
  if (criterion === "navigation_completed") {
    return {
      satisfied: browserNavigationCompleted(input) || pageChanged(input.before, input.after),
      evidence: `browser navigation ${input.command.inputs.action ?? "action"} completed`
    };
  }
  if (criterion === "target_visible") {
    return {
      satisfied: targetVisible(input.command, input.after),
      evidence: `target "${input.command.targetGoal}" is visible`
    };
  }
  if (criterion === "target_not_visible") {
    return {
      satisfied: targetNotVisible(input.command, input.after),
      evidence: `target "${input.command.targetGoal}" is no longer visible`
    };
  }
  if (criterion === "menu_expanded") {
    return {
      satisfied: menuExpanded(input.command, input.after),
      evidence: `menu target "${input.command.targetGoal}" is expanded`
    };
  }
  if (criterion === "menu_collapsed") {
    return {
      satisfied: menuCollapsed(input.command, input.after),
      evidence: `menu target "${input.command.targetGoal}" is collapsed`
    };
  }
  if (criterion === "child_target_visible") {
    return {
      satisfied: childTargetVisible(input.command, input.after),
      evidence: `child target under "${input.command.targetGoal}" is visible`
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

  const submitFeedback = input.command.type === "SubmitCurrentForm" ? classifiedFeedback(input.after.feedback) : undefined;
  if (submitFeedback && submitFeedback.validation.length > 0) {
    return {
      status: "partial",
      confidence: 0.78,
      satisfiedCriteria,
      failedCriteria,
      newEvidence: [...newEvidence, ...submitFeedback.validation],
      failureReason: "validation_error",
      recoveryHints: submitFeedback.validation.map((message) => `Resolve validation feedback: ${message}`)
    };
  }

  if (
    submitFeedback &&
    submitFeedback.unknown.length > 0 &&
    submitFeedback.positive.length === 0 &&
    !pageChanged(input.before, input.after)
  ) {
    return {
      status: "partial",
      confidence: 0.58,
      satisfiedCriteria,
      failedCriteria,
      newEvidence: [...newEvidence, ...submitFeedback.unknown],
      failureReason: "submission_feedback_unclassified",
      recoveryHints: ["Observe the page again to determine whether the submission succeeded or needs recovery."]
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
