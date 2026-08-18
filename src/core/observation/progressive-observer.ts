import type { PlannerPageContext } from "../context/page-context-assembler";
import { assemblePlannerPageContext } from "../context/page-context-assembler";
import type { NeedMoreObservationRequest } from "../model/contracts";
import type { PageModel } from "./page-model";
import type { ObservationBudget } from "../runtime/execution-budget";
import { standardObservationBudget } from "../runtime/execution-budget";

export interface ObservationRound {
  roundId: string;
  stepId: string;
  roundIndex: number;
  request?: NeedMoreObservationRequest;
  pageContext: PlannerPageContext;
  candidateCount: number;
  estimatedTokens: number;
  reason: string;
}

export interface ProgressiveObservationInput {
  stepId: string;
  taskText: string;
  activeSubgoal: string;
  requests?: NeedMoreObservationRequest[];
}

export interface ProgressiveObservationResult {
  page: PageModel;
  pageContext: PlannerPageContext;
  rounds: ObservationRound[];
}

export interface ProgressiveObserverPorts {
  observePage(request?: NeedMoreObservationRequest): Promise<PageModel>;
  onRound?(round: ObservationRound): Promise<void> | void;
}

function candidateLimitForRound(roundIndex: number, budget: ObservationBudget): number {
  if (roundIndex <= 0) return budget.initialCandidateLimit;
  if (roundIndex === 1) return budget.expandedCandidateLimit;
  return budget.hardCandidateLimit;
}

function estimateTokens(context: PlannerPageContext): number {
  const chars = JSON.stringify(context).length;
  return Math.ceil(chars / 4);
}

export class ProgressiveObserver {
  private readonly ports: ProgressiveObserverPorts;
  private readonly budget: ObservationBudget;

  constructor(ports: ProgressiveObserverPorts, budget: Partial<ObservationBudget> = {}) {
    this.ports = ports;
    this.budget = { ...standardObservationBudget, ...budget };
  }

  async observe(input: ProgressiveObservationInput): Promise<ProgressiveObservationResult> {
    const requests = input.requests ?? [];
    const requestedRounds = Math.max(1, 1 + requests.length);
    const roundCount = Math.min(requestedRounds, this.budget.maxObservationRoundsPerStep);
    const rounds: ObservationRound[] = [];
    let latestPage: PageModel | undefined;
    let latestContext: PlannerPageContext | undefined;

    for (let roundIndex = 0; roundIndex < roundCount; roundIndex += 1) {
      const request = roundIndex === 0 ? undefined : requests[roundIndex - 1];
      const page = await this.ports.observePage(request);
      const pageContext = assemblePlannerPageContext(page, {
        candidateLimit: candidateLimitForRound(roundIndex, this.budget),
        taskText: input.taskText,
        activeSubgoal: input.activeSubgoal,
        request
      });
      const round: ObservationRound = {
        roundId: `${input.stepId}:observation:${roundIndex + 1}`,
        stepId: input.stepId,
        roundIndex,
        request,
        pageContext,
        candidateCount: pageContext.candidates.length,
        estimatedTokens: estimateTokens(pageContext),
        reason: request?.reason ?? "initial_observation"
      };
      rounds.push(round);
      latestPage = page;
      latestContext = pageContext;
      await this.ports.onRound?.(round);
    }

    if (!latestPage || !latestContext) {
      throw new Error("progressive_observation_failed");
    }

    return {
      page: latestPage,
      pageContext: latestContext,
      rounds
    };
  }
}
