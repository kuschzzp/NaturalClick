import { describe, expect, it, vi } from "vitest";
import { createCdpSessionManager } from "../../../src/adapters/chrome/cdp-session";

describe("cdp session manager", () => {
  it("reuses a session for the same owner and detaches on abort", async () => {
    const attach = vi.fn((_: unknown, __: string, callback: () => void) => callback());
    const detach = vi.fn((_: unknown, callback: () => void) => callback());
    const sendCommand = vi.fn((_: unknown, __: string, ___: unknown, callback: (result?: unknown) => void) => callback({}));
    const manager = createCdpSessionManager({ attach, detach, sendCommand });
    const abort = new AbortController();

    const first = await manager.acquire(12, { ownerId: "task_1", signal: abort.signal });
    const second = await manager.acquire(12, { ownerId: "task_1", signal: abort.signal });

    expect(first).toBe(second);
    expect(attach).toHaveBeenCalledTimes(1);
    abort.abort();
    await Promise.resolve();
    expect(detach).toHaveBeenCalledTimes(1);
  });

  it("rejects a second owner for an attached tab", async () => {
    const attach = vi.fn((_: unknown, __: string, callback: () => void) => callback());
    const detach = vi.fn((_: unknown, callback: () => void) => callback());
    const sendCommand = vi.fn((_: unknown, __: string, ___: unknown, callback: (result?: unknown) => void) => callback({}));
    const manager = createCdpSessionManager({ attach, detach, sendCommand });

    await manager.acquire(12, { ownerId: "task_1", signal: new AbortController().signal });

    await expect(manager.acquire(12, { ownerId: "task_2", signal: new AbortController().signal })).rejects.toThrow("cdp_session_owned:task_1");
  });
});
