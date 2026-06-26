import { err, ok, type Result } from "../../shared/result";

const semanticCommands = new Set([
  "NavigateTo",
  "ActivateTarget",
  "FillField",
  "ScrollRegion",
  "ReadContent",
  "OpenTab",
  "SwitchTab",
  "WaitForChange",
  "AskUser",
  "FinishTask",
  "SelectOption",
  "SubmitCurrentForm"
]);

export interface PlannerDecision {
  taskUnderstanding: string;
  activeSubgoal: string;
  shortPlan: string[];
  nextCommand: {
    type: string;
    targetGoal?: string;
    inputs?: Record<string, unknown>;
  };
  expectedOutcome: string;
  successCriteria: string[];
  riskHint: "low" | "medium" | "high";
  missingInfo: string[];
  assumptions: string[];
  reasoningSummary: string;
}

export function validatePlannerDecision(value: unknown): Result<PlannerDecision, "invalid_contract"> {
  if (!value || typeof value !== "object") {
    return err("invalid_contract", "Planner decision must be an object");
  }
  const candidate = value as Partial<PlannerDecision>;
  if (!candidate.nextCommand || typeof candidate.nextCommand.type !== "string") {
    return err("invalid_contract", "Planner decision requires nextCommand.type");
  }
  if (candidate.nextCommand.type.includes("coordinate") || candidate.nextCommand.type.startsWith("dom_")) {
    return err("invalid_contract", "Planner must output semantic commands, not primitive actions");
  }
  if (!semanticCommands.has(candidate.nextCommand.type)) {
    return err("invalid_contract", `Unsupported semantic command: ${candidate.nextCommand.type}`);
  }
  if (typeof candidate.expectedOutcome !== "string" || candidate.expectedOutcome.length === 0) {
    return err("invalid_contract", "Planner decision requires expectedOutcome");
  }
  if (!Array.isArray(candidate.successCriteria) || candidate.successCriteria.length === 0) {
    return err("invalid_contract", "Planner decision requires successCriteria");
  }
  return ok({
    taskUnderstanding: String(candidate.taskUnderstanding ?? ""),
    activeSubgoal: String(candidate.activeSubgoal ?? ""),
    shortPlan: Array.isArray(candidate.shortPlan) ? candidate.shortPlan.map(String) : [],
    nextCommand: candidate.nextCommand,
    expectedOutcome: candidate.expectedOutcome,
    successCriteria: candidate.successCriteria.map(String),
    riskHint: candidate.riskHint === "high" || candidate.riskHint === "medium" ? candidate.riskHint : "low",
    missingInfo: Array.isArray(candidate.missingInfo) ? candidate.missingInfo.map(String) : [],
    assumptions: Array.isArray(candidate.assumptions) ? candidate.assumptions.map(String) : [],
    reasoningSummary: String(candidate.reasoningSummary ?? "")
  });
}
