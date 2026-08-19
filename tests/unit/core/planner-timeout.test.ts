import { afterEach, describe, expect, it, vi } from "vitest";
import {
  plannerTimeoutPolicy,
  withPlannerRequestTimeout,
  type PlannerRequestActivity,
  type PlannerTimeoutPolicy
} from "../../../src/core/model/planner-timeout";

const policy: PlannerTimeoutPolicy = {
  firstResponseTimeoutMs: 10,
  streamIdleTimeoutMs: 20,
  requestTimeoutMs: 100,
  totalTimeoutMs: 200
};

describe("Planner timeout control", () => {
  afterEach(() => vi.useRealTimers());

  it("uses wider hard and total budgets for reasoning models", () => {
    expect(plannerTimeoutPolicy({ model: "gpt-4.1", reasoning: false })).toEqual({
      firstResponseTimeoutMs: 30_000,
      streamIdleTimeoutMs: 30_000,
      requestTimeoutMs: 120_000,
      totalTimeoutMs: 180_000
    });
    expect(plannerTimeoutPolicy({ model: "gpt-5", reasoning: true })).toEqual({
      firstResponseTimeoutMs: 45_000,
      streamIdleTimeoutMs: 30_000,
      requestTimeoutMs: 150_000,
      totalTimeoutMs: 240_000
    });
  });

  it("fails when no first model activity arrives", async () => {
    vi.useFakeTimers();
    const promise = withPlannerRequestTimeout({
      policy,
      totalDeadlineAt: Date.now() + 200,
      run: () => new Promise<never>(() => undefined)
    });
    const assertion = expect(promise).rejects.toMatchObject({ reason: "planner_first_token_timeout", receivedResponse: false });

    await vi.advanceTimersByTimeAsync(10);
    await assertion;
  });

  it("refreshes the idle timeout whenever stream activity continues", async () => {
    vi.useFakeTimers();
    let activity: PlannerRequestActivity | undefined;
    let finish: ((value: string) => void) | undefined;
    const promise = withPlannerRequestTimeout({
      policy,
      totalDeadlineAt: Date.now() + 200,
      run: async (_signal, currentActivity) => {
        activity = currentActivity;
        return new Promise<string>((resolve) => {
          finish = resolve;
        });
      }
    });

    await vi.advanceTimersByTimeAsync(5);
    activity?.markActivity();
    await vi.advanceTimersByTimeAsync(19);
    activity?.markActivity();
    await vi.advanceTimersByTimeAsync(19);
    finish?.("completed");

    await expect(promise).resolves.toBe("completed");
  });

  it("distinguishes request and total budget exhaustion", async () => {
    vi.useFakeTimers();
    const requestPromise = withPlannerRequestTimeout({
      policy: { ...policy, firstResponseTimeoutMs: 200, streamIdleTimeoutMs: 200, requestTimeoutMs: 30 },
      totalDeadlineAt: Date.now() + 200,
      run: () => new Promise<never>(() => undefined)
    });
    const requestAssertion = expect(requestPromise).rejects.toMatchObject({ reason: "planner_request_timeout" });
    await vi.advanceTimersByTimeAsync(30);
    await requestAssertion;

    const totalPromise = withPlannerRequestTimeout({
      policy: { ...policy, firstResponseTimeoutMs: 200, streamIdleTimeoutMs: 200, requestTimeoutMs: 200 },
      totalDeadlineAt: Date.now() + 25,
      run: () => new Promise<never>(() => undefined)
    });
    const totalAssertion = expect(totalPromise).rejects.toMatchObject({ reason: "planner_total_budget_exhausted" });
    await vi.advanceTimersByTimeAsync(25);
    await totalAssertion;
  });
});
