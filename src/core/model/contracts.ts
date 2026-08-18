import { err, ok, type Result } from "../../shared/result";

const semanticCommands = new Set([
  "NavigateTo",
  "ActivateTarget",
  "FillField",
  "ScrollRegion",
  "ReadContent",
  "OpenTab",
  "SwitchTab",
  "PressKey",
  "WaitForChange",
  "AskUser",
  "FinishTask",
  "SelectOption",
  "SubmitCurrentForm"
]);

const directCommandTypes = new Set(["NavigateTo", "ActivateTarget", "FillField", "ScrollRegion", "ReadContent", "OpenTab", "SwitchTab", "PressKey", "WaitForChange", "SelectOption", "SubmitCurrentForm"]);
const commandTypeAliases = new Map<string, string>([
  ["click", "ActivateTarget"],
  ["tap", "ActivateTarget"],
  ["press", "ActivateTarget"],
  ["presskey", "PressKey"],
  ["key", "PressKey"],
  ["keypress", "PressKey"],
  ["hitkey", "PressKey"],
  ["activate", "ActivateTarget"],
  ["fill", "FillField"],
  ["input", "FillField"],
  ["type", "FillField"],
  ["typetext", "FillField"],
  ["select", "SelectOption"],
  ["submit", "SubmitCurrentForm"],
  ["go", "NavigateTo"],
  ["goto", "NavigateTo"],
  ["openurl", "NavigateTo"],
  ["navigate", "NavigateTo"],
  ["scroll", "ScrollRegion"],
  ["wait", "WaitForChange"],
  ["read", "ReadContent"]
]);

function commandTypeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const canonicalCommandTypes = new Map(Array.from(semanticCommands).map((type) => [commandTypeKey(type), type]));
const standardSuccessCriteria = [
  "page_changed",
  "target_visible",
  "control_value_matches",
  "control_state_matches",
  "content_read",
  "submission_feedback_or_validation",
  "menu_expanded",
  "menu_collapsed",
  "child_target_visible",
  "viewport_scrolled",
  "wait_completed",
  "key_pressed"
];
const canonicalSuccessCriteria = new Map(standardSuccessCriteria.map((criterion) => [commandTypeKey(criterion), criterion]));
const successCriterionAliases = new Map<string, string>([
  ["urlchanged", "page_changed"],
  ["routechanged", "page_changed"],
  ["navigation", "page_changed"],
  ["navigated", "page_changed"],
  ["pageloaded", "page_changed"],
  ["targetappears", "target_visible"],
  ["targetshown", "target_visible"],
  ["elementvisible", "target_visible"],
  ["controlvisible", "target_visible"],
  ["panelvisible", "target_visible"],
  ["screenvisible", "target_visible"],
  ["sectionvisible", "target_visible"],
  ["visible", "target_visible"],
  ["valuematches", "control_value_matches"],
  ["valueapplied", "control_value_matches"],
  ["fieldfilled", "control_value_matches"],
  ["inputfilled", "control_value_matches"],
  ["textentered", "control_value_matches"],
  ["filled", "control_value_matches"],
  ["statematches", "control_state_matches"],
  ["checkedmatches", "control_state_matches"],
  ["controlchecked", "control_state_matches"],
  ["switchstate", "control_state_matches"],
  ["togglestate", "control_state_matches"],
  ["contentread", "content_read"],
  ["contentreadable", "content_read"],
  ["readcontent", "content_read"],
  ["textread", "content_read"],
  ["pageread", "content_read"],
  ["readablecontent", "content_read"],
  ["formsubmitted", "submission_feedback_or_validation"],
  ["submitted", "submission_feedback_or_validation"],
  ["submissionfeedback", "submission_feedback_or_validation"],
  ["validationfeedback", "submission_feedback_or_validation"],
  ["validation", "submission_feedback_or_validation"],
  ["menuopened", "menu_expanded"],
  ["submenuopened", "menu_expanded"],
  ["dropdownopened", "menu_expanded"],
  ["expanded", "menu_expanded"],
  ["menuclosed", "menu_collapsed"],
  ["submenuclosed", "menu_collapsed"],
  ["submenuhidden", "menu_collapsed"],
  ["childhidden", "menu_collapsed"],
  ["dropdownclosed", "menu_collapsed"],
  ["menucollapsed", "menu_collapsed"],
  ["collapsed", "menu_collapsed"],
  ["submenuvisible", "child_target_visible"],
  ["childvisible", "child_target_visible"],
  ["childtargetshown", "child_target_visible"],
  ["scrolled", "viewport_scrolled"],
  ["scrollchanged", "viewport_scrolled"],
  ["viewportmoved", "viewport_scrolled"],
  ["waited", "wait_completed"],
  ["waitcomplete", "wait_completed"],
  ["waitcompleted", "wait_completed"],
  ["keypressed", "key_pressed"],
  ["keypress", "key_pressed"]
]);

export interface PlannerCommandSpec {
  type: string;
  targetGoal?: string;
  inputs?: Record<string, unknown>;
  expectedOutcome?: string;
  successCriteria?: string[];
  riskHint?: "low" | "medium" | "high";
}

export interface PlannerDecision {
  taskUnderstanding: string;
  activeSubgoal: string;
  shortPlan: string[];
  nextCommand: PlannerCommandSpec;
  nextCommands?: PlannerCommandSpec[];
  expectedOutcome: string;
  successCriteria: string[];
  riskHint: "low" | "medium" | "high";
  missingInfo: string[];
  assumptions: string[];
  reasoningSummary: string;
}

export type ObservationScope =
  | "current_viewport"
  | "full_page"
  | "navigation"
  | "sidebar"
  | "main_content"
  | "form"
  | "dialog"
  | "scroll_container"
  | "visual";

export type ObservationExpansion =
  | "more_candidates"
  | "nearby_text"
  | "hidden_menus"
  | "offscreen_links"
  | "form_fields"
  | "tables"
  | "validation_feedback"
  | "visual_labels";

export type PreferredRole =
  | "button"
  | "link"
  | "textbox"
  | "searchbox"
  | "combobox"
  | "menuitem"
  | "listitem"
  | "table"
  | "grid"
  | "tab"
  | "checkbox"
  | "radio"
  | "switch";

export interface NeedMoreObservationRequest {
  reason: string;
  query?: string;
  scope: ObservationScope;
  expand?: ObservationExpansion[];
  preferredRoles?: PreferredRole[];
  targetTextHints?: string[];
  ambiguousCandidates?: ObservationCandidateHint[];
}

export interface ObservationCandidateHint {
  semanticId?: string;
  label?: string;
  accessibleName?: string;
  role?: string;
  regionRef?: string;
  visibility?: string;
  expandedState?: string;
  score?: number;
  confidence?: number;
}

export type PlannerTurn =
  | { type: "Command"; decision: PlannerDecision }
  | { type: "NeedMoreObservation"; request: NeedMoreObservationRequest }
  | { type: "AskUser"; question: string; options?: string[]; reason: string }
  | { type: "FinishTask"; summary: string; evidenceRefs: string[] };

const observationScopes = new Set<ObservationScope>([
  "current_viewport",
  "full_page",
  "navigation",
  "sidebar",
  "main_content",
  "form",
  "dialog",
  "scroll_container",
  "visual"
]);

const observationExpansions = new Set<ObservationExpansion>([
  "more_candidates",
  "nearby_text",
  "hidden_menus",
  "offscreen_links",
  "form_fields",
  "tables",
  "validation_feedback",
  "visual_labels"
]);

const preferredRoles = new Set<PreferredRole>([
  "button",
  "link",
  "textbox",
  "searchbox",
  "combobox",
  "menuitem",
  "listitem",
  "table",
  "grid",
  "tab",
  "checkbox",
  "radio"
]);

function stringArray(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value.map(String).filter(Boolean) : undefined;
}

function enumArray<T extends string>(value: unknown, allowed: Set<T>): T[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return undefined;
  const items = value.map(String);
  return items.every((item): item is T => allowed.has(item as T)) ? items : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function observationCandidateHints(value: unknown): ObservationCandidateHint[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const candidates = value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      semanticId: optionalString(item.semanticId),
      label: optionalString(item.label),
      accessibleName: optionalString(item.accessibleName),
      role: optionalString(item.role),
      regionRef: optionalString(item.regionRef),
      visibility: optionalString(item.visibility),
      expandedState: optionalString(item.expandedState),
      score: optionalNumber(item.score),
      confidence: optionalNumber(item.confidence)
    }))
    .filter((item) => item.semanticId || item.label || item.accessibleName);
  return candidates.length ? candidates : undefined;
}

const plannerInputKeys = [
  "controlId",
  "semanticId",
  "controlRef",
  "targetRef",
  "targetId",
  "value",
  "text",
  "input",
  "url",
  "href",
  "direction",
  "amount",
  "milliseconds",
  "label",
  "targetLabel",
  "name",
  "title",
  "ariaLabel",
  "accessibleName",
  "placeholder",
  "option",
  "optionText",
  "optionValue"
];
const plannerInputAliases: Array<[string, string[]]> = [
  ["controlId", ["control_id", "elementId", "element_id", "nodeId", "node_id", "domId", "dom_id"]],
  ["semanticId", ["semantic_id", "semanticID"]],
  ["controlRef", ["control_ref"]],
  ["targetRef", ["target_ref"]],
  ["targetId", ["target_id"]],
  ["value", ["inputValue", "input_value", "fieldValue", "field_value"]],
  ["url", ["uri", "link"]],
  ["href", ["targetUrl", "target_url"]],
  ["milliseconds", ["ms", "timeoutMs", "timeout_ms"]],
  ["targetLabel", ["target_label"]],
  ["ariaLabel", ["aria_label"]],
  ["accessibleName", ["accessible_name"]],
  ["optionText", ["option_text"]],
  ["optionValue", ["option_value"]]
];

function recordInput(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
}

function inputValueFor(candidate: Record<string, unknown>, inputs: Record<string, unknown>, key: string): unknown {
  return inputs[key] !== undefined ? inputs[key] : candidate[key];
}

function plannerCommandInputs(candidate: Record<string, unknown>): Record<string, unknown> {
  const inputs = recordInput(candidate.inputs);
  for (const key of plannerInputKeys) {
    if (inputs[key] === undefined && candidate[key] !== undefined) {
      inputs[key] = candidate[key];
    }
  }
  for (const [canonical, aliases] of plannerInputAliases) {
    if (inputs[canonical] !== undefined) continue;
    const alias = aliases.find((key) => inputValueFor(candidate, inputs, key) !== undefined);
    if (alias) inputs[canonical] = inputValueFor(candidate, inputs, alias);
  }
  return inputs;
}

function normalizedCommandType(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const lowered = trimmed.toLowerCase();
  if (lowered.includes("coordinate") || lowered.startsWith("dom_")) return undefined;
  if (semanticCommands.has(trimmed)) return trimmed;
  const key = commandTypeKey(trimmed);
  return canonicalCommandTypes.get(key) ?? commandTypeAliases.get(key);
}

function plannerCommandTargetGoal(candidate: Record<string, unknown>, type: string, inputs: Record<string, unknown>): string | undefined {
  return (
    optionalString(candidate.targetGoal) ??
    optionalString(inputs.targetGoal) ??
    optionalString(candidate.targetLabel) ??
    optionalString(inputs.targetLabel) ??
    optionalString(candidate.label) ??
    optionalString(inputs.label) ??
    optionalString(candidate.accessibleName) ??
    optionalString(inputs.accessibleName) ??
    optionalString(candidate.ariaLabel) ??
    optionalString(inputs.ariaLabel) ??
    optionalString(candidate.name) ??
    optionalString(inputs.name) ??
    optionalString(candidate.title) ??
    optionalString(inputs.title) ??
    optionalString(candidate.placeholder) ??
    optionalString(inputs.placeholder) ??
    (type === "NavigateTo" || type === "OpenTab" ? optionalString(inputs.url) ?? optionalString(inputs.href) : undefined)
  );
}

function plannerCommandSpec(value: unknown): PlannerCommandSpec | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Record<string, unknown>;
  const type = normalizedCommandType(candidate.type);
  if (!type) return undefined;
  const inputs = plannerCommandInputs(candidate);
  return {
    type,
    targetGoal: plannerCommandTargetGoal(candidate, type, inputs),
    inputs,
    expectedOutcome: typeof candidate.expectedOutcome === "string" ? candidate.expectedOutcome : undefined,
    successCriteria: normalizedSuccessCriteriaArray(candidate.successCriteria),
    riskHint: candidate.riskHint === "high" || candidate.riskHint === "medium" ? candidate.riskHint : candidate.riskHint === "low" ? "low" : undefined
  };
}

function validRiskHint(value: unknown): PlannerDecision["riskHint"] | undefined {
  return value === "high" || value === "medium" || value === "low" ? value : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function nonEmptyStringArray(value: unknown): string[] | undefined {
  const items = stringArray(value);
  return items?.length ? items : undefined;
}

function defaultSuccessCriteriaFor(command?: Record<string, unknown>): string[] {
  const type = normalizedCommandType(command?.type) ?? String(command?.type ?? "");
  if (type === "FillField" || type === "SelectOption") return ["control_value_matches"];
  if (type === "ReadContent") return ["content_read"];
  if (type === "NavigateTo") return ["page_changed"];
  if (type === "PressKey") return ["key_pressed"];
  if (type === "SubmitCurrentForm") return ["submission_feedback_or_validation"];
  return ["target_visible"];
}

function normalizedSuccessCriterion(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const key = commandTypeKey(value);
  return canonicalSuccessCriteria.get(key) ?? successCriterionAliases.get(key);
}

function normalizedSuccessCriteriaArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<string>();
  const criteria: string[] = [];
  for (const item of value) {
    const criterion = normalizedSuccessCriterion(item);
    if (!criterion || seen.has(criterion)) continue;
    seen.add(criterion);
    criteria.push(criterion);
  }
  return criteria.length ? criteria : undefined;
}

function commandFallbacks(candidate: Record<string, unknown>): Pick<PlannerDecision, "expectedOutcome" | "successCriteria" | "riskHint"> {
  const nextCommand = candidate.nextCommand && typeof candidate.nextCommand === "object" ? (candidate.nextCommand as Record<string, unknown>) : undefined;
  const rawCommands = Array.isArray(candidate.nextCommands) ? candidate.nextCommands.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object") : [];
  const fallbackCommand = rawCommands.at(-1) ?? rawCommands[0] ?? nextCommand;
  return {
    expectedOutcome:
      nonEmptyString(candidate.expectedOutcome) ??
      nonEmptyString(fallbackCommand?.expectedOutcome) ??
      nonEmptyString(candidate.activeSubgoal) ??
      nonEmptyString(candidate.reasoningSummary) ??
      "",
    successCriteria: normalizedSuccessCriteriaArray(candidate.successCriteria) ?? normalizedSuccessCriteriaArray(fallbackCommand?.successCriteria) ?? defaultSuccessCriteriaFor(fallbackCommand),
    riskHint: validRiskHint(candidate.riskHint) ?? validRiskHint(fallbackCommand?.riskHint) ?? "low"
  };
}

function normalizeCommandDecision(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const candidate = value as Record<string, unknown>;
  const singleCommand = candidate.nextCommand ?? candidate.command ?? candidate.action;
  const batchCommands = candidate.nextCommands ?? candidate.commands ?? candidate.actions;
  const normalizedCandidate = {
    ...candidate,
    ...(singleCommand ? { nextCommand: singleCommand } : {}),
    ...(batchCommands ? { nextCommands: batchCommands } : {})
  };
  return {
    ...normalizedCandidate,
    ...commandFallbacks(normalizedCandidate)
  };
}

function normalizePlannerTurnInput(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const candidate = value as Record<string, unknown>;
  if (candidate.commandTurn && typeof candidate.commandTurn === "object") return normalizeCommandDecision(candidate.commandTurn);
  if (candidate.batchCommandTurn && typeof candidate.batchCommandTurn === "object") return normalizeCommandDecision(candidate.batchCommandTurn);
  if (candidate.needMoreObservationTurn && typeof candidate.needMoreObservationTurn === "object") {
    return { type: "NeedMoreObservation", ...(candidate.needMoreObservationTurn as Record<string, unknown>) };
  }
  if (candidate.askUserTurn && typeof candidate.askUserTurn === "object") {
    return { type: "AskUser", ...(candidate.askUserTurn as Record<string, unknown>) };
  }
  if (candidate.finishTaskTurn && typeof candidate.finishTaskTurn === "object") {
    return { type: "FinishTask", ...(candidate.finishTaskTurn as Record<string, unknown>) };
  }
  if (candidate.type === "Command" && candidate.decision && typeof candidate.decision === "object") return normalizeCommandDecision(candidate.decision);
  if (
    candidate.type === "commandTurn" ||
    candidate.type === "batchCommandTurn" ||
    candidate.nextCommand ||
    candidate.nextCommands ||
    candidate.command ||
    candidate.commands ||
    candidate.action ||
    candidate.actions
  ) {
    return normalizeCommandDecision(candidate);
  }
  const directType = normalizedCommandType(candidate.type);
  if (directType && directCommandTypes.has(directType) && !candidate.nextCommand) {
    return normalizeCommandDecision({
      ...candidate,
      nextCommand: {
        type: directType,
        targetGoal: typeof candidate.targetGoal === "string" ? candidate.targetGoal : "",
        inputs: plannerCommandInputs(candidate)
      }
    });
  }
  return value;
}

export function validatePlannerDecision(value: unknown): Result<PlannerDecision, "invalid_contract"> {
  if (!value || typeof value !== "object") {
    return err("invalid_contract", "Planner decision must be an object");
  }
  const candidate = value as Partial<PlannerDecision>;
  const batchCommands = Array.isArray(candidate.nextCommands) ? candidate.nextCommands.map(plannerCommandSpec) : undefined;
  if (batchCommands?.some((command) => !command)) {
    return err("invalid_contract", "Planner decision nextCommands contains unsupported semantic commands");
  }
  if (batchCommands && batchCommands.length > 3) {
    return err("invalid_contract", "Planner decision nextCommands supports at most 3 commands");
  }
  const nextCommand = plannerCommandSpec(candidate.nextCommand) ?? batchCommands?.[0];
  if (!nextCommand) {
    return err("invalid_contract", "Planner decision requires nextCommand.type or nextCommands[0].type");
  }
  if (candidate.nextCommand && !plannerCommandSpec(candidate.nextCommand)) {
    return err("invalid_contract", "Planner must output semantic commands, not primitive actions");
  }
  if (typeof candidate.expectedOutcome !== "string" || candidate.expectedOutcome.length === 0) {
    return err("invalid_contract", "Planner decision requires expectedOutcome");
  }
  const successCriteria = normalizedSuccessCriteriaArray(candidate.successCriteria);
  if (!successCriteria?.length) {
    return err("invalid_contract", "Planner decision requires successCriteria");
  }
  return ok({
    taskUnderstanding: String(candidate.taskUnderstanding ?? ""),
    activeSubgoal: String(candidate.activeSubgoal ?? ""),
    shortPlan: Array.isArray(candidate.shortPlan) ? candidate.shortPlan.map(String) : [],
    nextCommand,
    nextCommands: batchCommands?.filter((command): command is PlannerCommandSpec => Boolean(command)),
    expectedOutcome: candidate.expectedOutcome,
    successCriteria,
    riskHint: candidate.riskHint === "high" || candidate.riskHint === "medium" ? candidate.riskHint : "low",
    missingInfo: Array.isArray(candidate.missingInfo) ? candidate.missingInfo.map(String) : [],
    assumptions: Array.isArray(candidate.assumptions) ? candidate.assumptions.map(String) : [],
    reasoningSummary: String(candidate.reasoningSummary ?? "")
  });
}

export function validatePlannerTurn(value: unknown): Result<PlannerTurn, "invalid_contract"> {
  const normalized = normalizePlannerTurnInput(value);
  if (!normalized || typeof normalized !== "object") {
    return err("invalid_contract", "Planner turn must be an object");
  }

  const candidate = normalized as Record<string, unknown>;
  if (candidate.type === "NeedMoreObservation") {
    const scope = String(candidate.scope ?? "");
    if (!observationScopes.has(scope as ObservationScope)) {
      return err("invalid_contract", `Unsupported observation scope: ${scope}`);
    }
    const expand = enumArray(candidate.expand, observationExpansions);
    if (candidate.expand !== undefined && !expand) {
      return err("invalid_contract", "NeedMoreObservation.expand contains unsupported values");
    }
    const roles = enumArray(candidate.preferredRoles, preferredRoles);
    if (candidate.preferredRoles !== undefined && !roles) {
      return err("invalid_contract", "NeedMoreObservation.preferredRoles contains unsupported values");
    }
    return ok({
      type: "NeedMoreObservation",
      request: {
        reason: String(candidate.reason ?? ""),
        query: typeof candidate.query === "string" ? candidate.query : undefined,
        scope: scope as ObservationScope,
        expand,
        preferredRoles: roles,
        targetTextHints: stringArray(candidate.targetTextHints),
        ambiguousCandidates: observationCandidateHints(candidate.ambiguousCandidates)
      }
    });
  }

  if (candidate.type === "AskUser") {
    const question = String(candidate.question ?? "").trim();
    if (!question) return err("invalid_contract", "AskUser requires question");
    return ok({
      type: "AskUser",
      question,
      options: stringArray(candidate.options),
      reason: String(candidate.reason ?? "")
    });
  }

  if (candidate.type === "FinishTask") {
    const summary = String(candidate.summary ?? "").trim();
    if (!summary) return err("invalid_contract", "FinishTask requires summary");
    return ok({
      type: "FinishTask",
      summary,
      evidenceRefs: stringArray(candidate.evidenceRefs) ?? []
    });
  }

  const decision = validatePlannerDecision(normalized);
  if (!decision.ok) return decision;
  return ok({ type: "Command", decision: decision.value });
}
