import type { SemanticCommand } from "../commands/commands";
import { scopeAllows, type ConsentScope } from "./consent";

export type SafetyMode = "guided" | "balanced" | "experimental_full_auto";
export type PolicyStatus = "allow" | "ask_user" | "block" | "hard_block";
export type PolicyRiskLevel = "low" | "medium" | "high" | "hard_block";

export interface PolicyContext {
  safetyMode: SafetyMode;
  consentScope?: ConsentScope;
  origin: string;
  pageIdentity: string;
  now?: number;
}

export interface PolicyDecision {
  status: PolicyStatus;
  riskLevel: PolicyRiskLevel;
  reasons: string[];
  consentScopeRef?: string;
  redactions: string[];
  requiredUserPrompt?: string;
}

const sensitiveInputKeys = ["password", "token", "secret", "apiKey", "creditCard", "cardNumber", "cvv", "cvc"];
const highRiskCommandTypes = new Set<SemanticCommand["type"]>(["NavigateTo", "OpenTab"]);
const hardBlockPatterns = [
  /\bpay\b/i,
  /\bpayment\b/i,
  /\bpurchase\b/i,
  /\bbuy\b/i,
  /\bdelete\s+(account|workspace|project|repository|repo)\b/i,
  /\bwire\s+transfer\b/i,
  /\btransfer\s+money\b/i,
  /\bpassword\b/i,
  /\bcredit\s*card\b/i,
  /\bcvv\b/i,
  /\bcvc\b/i
];

function redactionsFor(command: SemanticCommand): string[] {
  return Object.keys(command.inputs).filter((key) => sensitiveInputKeys.some((sensitive) => key.toLowerCase().includes(sensitive.toLowerCase())));
}

function hardBlockReason(command: SemanticCommand): string | undefined {
  const text = `${command.type} ${command.targetGoal} ${command.expectedOutcome}`.trim();
  return hardBlockPatterns.some((pattern) => pattern.test(text))
    ? "Command targets payment, credentials, irreversible deletion, or money movement."
    : undefined;
}

function classifyRisk(command: SemanticCommand): Exclude<PolicyRiskLevel, "hard_block"> {
  if (isLowRiskSearchSubmit(command)) return "low";
  if (command.riskHint === "high") return "high";
  if (command.riskHint === "medium") return "medium";
  if (command.type === "SubmitCurrentForm") return "medium";
  if (highRiskCommandTypes.has(command.type)) return "medium";
  if (command.type === "FillField" && redactionsFor(command).length > 0) return "high";
  return "low";
}

function isLowRiskSearchSubmit(command: SemanticCommand): boolean {
  return command.type === "SubmitCurrentForm" && command.inputs.intent === "search" && command.riskHint === "low";
}

function promptFor(command: SemanticCommand, reason: string): string {
  const target = command.targetGoal || command.type;
  return `Confirm ${target} before I ${command.type.toLowerCase()}: ${reason}`;
}

function decision(
  status: PolicyStatus,
  riskLevel: PolicyRiskLevel,
  reasons: string[],
  redactions: string[],
  extra: Pick<PolicyDecision, "consentScopeRef" | "requiredUserPrompt"> = {}
): PolicyDecision {
  return { status, riskLevel, reasons, redactions, ...extra };
}

export function evaluatePolicy(command: SemanticCommand, context: PolicyContext): PolicyDecision {
  const redactions = redactionsFor(command);
  const hardReason = hardBlockReason(command);
  if (hardReason) {
    return decision("hard_block", "hard_block", [hardReason], redactions);
  }

  const riskLevel = classifyRisk(command);
  const allowedByScope = scopeAllows(
    context.consentScope,
    command.type,
    { origin: context.origin, pageIdentity: context.pageIdentity },
    context.now ?? Date.now()
  );

  if (allowedByScope) {
    return decision("allow", riskLevel, ["Allowed by active task-scoped consent."], redactions, {
      consentScopeRef: context.consentScope?.id ?? context.consentScope?.taskId
    });
  }

  if (context.safetyMode === "guided") {
    const reason = "Guided mode asks before browser-changing actions.";
    return decision("ask_user", riskLevel, [reason], redactions, {
      requiredUserPrompt: promptFor(command, reason)
    });
  }

  if (context.safetyMode === "balanced") {
    if (riskLevel === "low" && (command.type !== "SubmitCurrentForm" || isLowRiskSearchSubmit(command))) {
      return decision("allow", riskLevel, ["Balanced mode allows low-risk commands without extra confirmation."], redactions);
    }
    const reason = "Balanced mode requires consent for submit, navigation, or medium-risk actions.";
    return decision("ask_user", riskLevel, [reason], redactions, {
      requiredUserPrompt: promptFor(command, reason)
    });
  }

  if (riskLevel === "high") {
    const reason = "Full-auto mode still asks before high-risk actions.";
    return decision("ask_user", riskLevel, [reason], redactions, {
      requiredUserPrompt: promptFor(command, reason)
    });
  }

  return decision("allow", riskLevel, ["Experimental full-auto mode allows non-hard-blocked low and medium risk commands."], redactions);
}
