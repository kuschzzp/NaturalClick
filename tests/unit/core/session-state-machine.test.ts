import { describe, expect, it } from "vitest";
import { createMemorySessionStore } from "../../../src/core/session/session-store";
import { transitionSession } from "../../../src/core/session/session-state-machine";

describe("session state machine", () => {
  it("keeps session active after normal task completion", () => {
    expect(transitionSession({ status: "active" }, { type: "task_done" })).toEqual({ status: "active", taskStatus: "idle" });
  });

  it("marks running task as stopped after user stop", () => {
    expect(transitionSession({ status: "active", taskStatus: "running" }, { type: "task_stopped", reason: "user_stop" })).toEqual({
      status: "active",
      taskStatus: "stopped",
      lastStopReason: "user_stop"
    });
  });

  it("marks restart-interrupted task as paused", () => {
    expect(transitionSession({ status: "active", taskStatus: "running" }, { type: "worker_restarted" })).toEqual({
      status: "paused",
      taskStatus: "paused"
    });
  });

  it("stores terminal task tombstones in memory store", async () => {
    const store = createMemorySessionStore();

    await store.saveState("session_1", { status: "active", taskStatus: "running" });
    await store.saveTombstone({
      sessionId: "session_1",
      taskId: "task_1",
      status: "stopped",
      reason: "user_stop",
      createdAt: 100
    });

    await expect(store.loadState("session_1")).resolves.toEqual({ status: "active", taskStatus: "running" });
    await expect(store.listTombstones("session_1")).resolves.toEqual([
      { sessionId: "session_1", taskId: "task_1", status: "stopped", reason: "user_stop", createdAt: 100 }
    ]);
  });
});
