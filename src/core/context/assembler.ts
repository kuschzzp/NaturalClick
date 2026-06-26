import type { GlobalModelConfig } from "../model/config";
import { takeTopByConfidence } from "./budget";

interface ContextCandidate {
  id: string;
  label: string;
  role: string;
  confidence: number;
}

interface ContextEvidence {
  id: string;
  claim: string;
  confidence: number;
}

export interface PlannerContextInput {
  config: GlobalModelConfig;
  taskText: string;
  activeSubgoal: string;
  focusedObservation: {
    pageIdentity: string;
    candidates: ContextCandidate[];
  };
  evidence: ContextEvidence[];
  recentEvents: string[];
  schema: Record<string, unknown>;
}

export interface PlannerContext {
  taskText: string;
  activeSubgoal: string;
  pageIdentity: string;
  candidates: ContextCandidate[];
  evidence: ContextEvidence[];
  recentEvents: string[];
  schema: Record<string, unknown>;
}

export function assemblePlannerContext(input: PlannerContextInput): PlannerContext {
  const budget = input.config.contextBudget;
  return {
    taskText: input.taskText,
    activeSubgoal: input.activeSubgoal,
    pageIdentity: input.focusedObservation.pageIdentity,
    candidates: takeTopByConfidence(input.focusedObservation.candidates, budget.observationCandidateLimit),
    evidence: takeTopByConfidence(input.evidence, budget.evidenceLimit),
    recentEvents: input.recentEvents.slice(-budget.recentEventLimit),
    schema: input.schema
  };
}
