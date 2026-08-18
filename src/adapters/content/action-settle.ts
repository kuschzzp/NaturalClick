export interface ActionSettleOptions {
  quietMs?: number;
  maxMs?: number;
  pollMs?: number;
  signal?: AbortSignal;
}

export async function waitForActionSettle(readActivityAt: () => Promise<number>, options: ActionSettleOptions = {}): Promise<void> {
  const quietMs = options.quietMs ?? 400;
  const maxMs = options.maxMs ?? 2500;
  const pollMs = options.pollMs ?? 100;
  const signal = options.signal;
  const startedAt = Date.now();
  let lastActivityAt = startedAt;

  while (Date.now() - startedAt < maxMs) {
    throwIfAborted(signal);
    await delay(pollMs, signal);
    throwIfAborted(signal);
    lastActivityAt = Math.max(lastActivityAt, await readActivityAt());
    if (Date.now() - lastActivityAt >= quietMs) return;
  }
}

function taskStoppedError(): Error {
  return new Error("task_stopped");
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw taskStoppedError();
}

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(taskStoppedError());

  return new Promise((resolve, reject) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout>;

    function cleanup(): void {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    }

    function finish(done: () => void): void {
      if (settled) return;
      settled = true;
      cleanup();
      done();
    }

    function onAbort(): void {
      finish(() => reject(taskStoppedError()));
    }

    timeout = setTimeout(() => finish(resolve), milliseconds);
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}
