import { afterEach, describe, expect, it, vi } from "vitest";
import { waitForActionSettle } from "../../../src/adapters/content/action-settle";

describe("action settle", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves after the quiet window passes", async () => {
    vi.useFakeTimers();
    const readActivityAt = vi.fn(async () => 0);

    const promise = waitForActionSettle(readActivityAt, { quietMs: 100, pollMs: 50, maxMs: 500 });

    await vi.advanceTimersByTimeAsync(100);
    await expect(promise).resolves.toBeUndefined();
    expect(readActivityAt).toHaveBeenCalled();
  });

  it("keeps waiting when activity is reported", async () => {
    vi.useFakeTimers();
    let activityAt = 0;
    const readActivityAt = vi.fn(async () => activityAt);

    const promise = waitForActionSettle(readActivityAt, { quietMs: 100, pollMs: 50, maxMs: 500 });
    await vi.advanceTimersByTimeAsync(50);
    activityAt = Date.now();
    await vi.advanceTimersByTimeAsync(50);

    expect(readActivityAt).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(100);
    await expect(promise).resolves.toBeUndefined();
  });

  it("aborts pending settle waits without waiting for maxMs", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const readActivityAt = vi.fn(async () => Date.now());

    const promise = waitForActionSettle(readActivityAt, {
      quietMs: 100,
      pollMs: 50,
      maxMs: 5000,
      signal: controller.signal
    });

    await vi.advanceTimersByTimeAsync(50);
    controller.abort();

    await expect(promise).rejects.toThrow("task_stopped");
    const callsAfterAbort = readActivityAt.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(readActivityAt).toHaveBeenCalledTimes(callsAfterAbort);
  });
});
