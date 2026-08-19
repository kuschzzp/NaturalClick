export type PlannerTimeoutReason =
  | "planner_first_token_timeout"
  | "planner_stream_idle_timeout"
  | "planner_request_timeout"
  | "planner_total_budget_exhausted";

export interface PlannerTimeoutPolicy {
  firstResponseTimeoutMs: number;
  streamIdleTimeoutMs: number;
  requestTimeoutMs: number;
  totalTimeoutMs: number;
}

export interface PlannerRequestActivity {
  markResponse(): void;
  markActivity(): void;
}

export class PlannerTimeoutError extends Error {
  constructor(
    readonly reason: PlannerTimeoutReason,
    readonly elapsedMs: number,
    readonly receivedResponse: boolean
  ) {
    super(reason);
    this.name = "PlannerTimeoutError";
  }
}

export function plannerTimeoutPolicy(input: { model: string; reasoning: boolean }): PlannerTimeoutPolicy {
  const reasoningModel = input.reasoning || /^(gpt-5|o\d)/i.test(input.model.trim());
  return reasoningModel
    ? {
        firstResponseTimeoutMs: 45_000,
        streamIdleTimeoutMs: 30_000,
        requestTimeoutMs: 150_000,
        totalTimeoutMs: 240_000
      }
    : {
        firstResponseTimeoutMs: 30_000,
        streamIdleTimeoutMs: 30_000,
        requestTimeoutMs: 120_000,
        totalTimeoutMs: 180_000
      };
}

export function remainingPlannerBudget(deadlineAt: number, now = Date.now()): number {
  return Math.max(0, deadlineAt - now);
}

export async function withPlannerRequestTimeout<T>(input: {
  policy: PlannerTimeoutPolicy;
  totalDeadlineAt: number;
  parentSignal?: AbortSignal;
  run: (signal: AbortSignal, activity: PlannerRequestActivity) => Promise<T>;
  now?: () => number;
}): Promise<T> {
  const now = input.now ?? Date.now;
  const startedAt = now();
  const remainingTotalMs = remainingPlannerBudget(input.totalDeadlineAt, startedAt);
  if (remainingTotalMs <= 0) throw new PlannerTimeoutError("planner_total_budget_exhausted", 0, false);

  const controller = new AbortController();
  let receivedResponse = false;
  let settled = false;
  let firstResponseTimer: ReturnType<typeof setTimeout> | undefined;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let requestTimer: ReturnType<typeof setTimeout> | undefined;
  let totalTimer: ReturnType<typeof setTimeout> | undefined;
  let rejectTimeout: ((error: PlannerTimeoutError) => void) | undefined;

  const clearTimer = (timer: ReturnType<typeof setTimeout> | undefined): void => {
    if (timer !== undefined) clearTimeout(timer);
  };
  const clearTimers = (): void => {
    clearTimer(firstResponseTimer);
    clearTimer(idleTimer);
    clearTimer(requestTimer);
    clearTimer(totalTimer);
  };
  const fail = (reason: PlannerTimeoutReason): void => {
    if (settled) return;
    settled = true;
    clearTimers();
    const error = new PlannerTimeoutError(reason, Math.max(0, now() - startedAt), receivedResponse);
    rejectTimeout?.(error);
    controller.abort(error);
  };
  const resetIdleTimer = (): void => {
    clearTimer(idleTimer);
    idleTimer = setTimeout(() => fail("planner_stream_idle_timeout"), input.policy.streamIdleTimeoutMs);
  };
  const markResponse = (): void => {
    if (settled) return;
    receivedResponse = true;
    clearTimer(firstResponseTimer);
    firstResponseTimer = undefined;
    resetIdleTimer();
  };
  const activity: PlannerRequestActivity = {
    markResponse,
    markActivity: markResponse
  };
  const onParentAbort = (): void => controller.abort(input.parentSignal?.reason);
  if (input.parentSignal?.aborted) onParentAbort();
  else input.parentSignal?.addEventListener("abort", onParentAbort, { once: true });

  if (input.policy.firstResponseTimeoutMs < remainingTotalMs) {
    firstResponseTimer = setTimeout(() => fail("planner_first_token_timeout"), input.policy.firstResponseTimeoutMs);
  }
  if (input.policy.requestTimeoutMs < remainingTotalMs) {
    requestTimer = setTimeout(() => fail("planner_request_timeout"), input.policy.requestTimeoutMs);
  }
  totalTimer = setTimeout(() => fail("planner_total_budget_exhausted"), remainingTotalMs);

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    rejectTimeout = reject;
  });
  try {
    const result = await Promise.race([input.run(controller.signal, activity), timeoutPromise]);
    settled = true;
    return result;
  } finally {
    settled = true;
    clearTimers();
    input.parentSignal?.removeEventListener("abort", onParentAbort);
  }
}
