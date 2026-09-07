import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChromeStorageEventStore } from "../../../src/adapters/chrome/chrome-storage-event-store";
import type { AgentEvent } from "../../../src/core/events/events";

const backing = new Map<string, unknown>();
let failNextSetWithQuota = false;

vi.stubGlobal("chrome", {
  storage: {
    local: {
      async get(key: string | null) {
        if (key === null) return Object.fromEntries(backing.entries());
        return { [key]: backing.get(key) };
      },
      async set(value: Record<string, unknown>) {
        if (failNextSetWithQuota) {
          failNextSetWithQuota = false;
          throw new Error("Resource::kQuotaBytes quota exceeded");
        }
        Object.entries(value).forEach(([key, stored]) => backing.set(key, stored));
      },
      async remove(keys: string | string[]) {
        for (const key of Array.isArray(keys) ? keys : [keys]) {
          backing.delete(key);
        }
      }
    }
  }
});

function event(id: string, overrides: Partial<AgentEvent> = {}): AgentEvent {
  return {
    id,
    sessionId: "session-1",
    taskId: "task-1",
    stepId: "step-1",
    type: "TaskStarted",
    timestamp: 1,
    payload: {},
    visibility: "debug",
    correlationId: "corr-1",
    ...overrides
  };
}

describe("ChromeStorageEventStore", () => {
  beforeEach(() => {
    backing.clear();
    failNextSetWithQuota = false;
  });

  it("appends and loads task events", async () => {
    const store = new ChromeStorageEventStore();
    await store.append(event("evt_1"));
    await store.append(event("evt_2"));

    const events = await store.loadAfter("session-1", "task-1");

    expect(events.map((item) => item.id)).toEqual(["evt_1", "evt_2"]);
  });

  it("loads ordered task logs for one session and clears only the selected task", async () => {
    const store = new ChromeStorageEventStore();
    await store.append(event("task-2-start", { taskId: "task-2", timestamp: 20 }));
    await store.append(event("other-session", { sessionId: "session-2", taskId: "task-x", timestamp: 5 }));
    await store.append(event("task-1-start", { taskId: "task-1", timestamp: 10 }));
    await store.append(event("task-1-done", { taskId: "task-1", type: "TaskCompleted", timestamp: 15 }));

    const turns = await store.loadSession("session-1");
    expect(turns.map((turn) => turn.taskId)).toEqual(["task-1", "task-2"]);
    expect(turns[0].events.map((item) => item.id)).toEqual(["task-1-start", "task-1-done"]);

    await store.clear("session-1", "task-1");
    expect(await store.loadAfter("session-1", "task-1")).toEqual([]);
    expect((await store.loadAfter("session-1", "task-2")).map((item) => item.id)).toEqual(["task-2-start"]);
    expect((await store.loadAfter("session-2", "task-x")).map((item) => item.id)).toEqual(["other-session"]);
  });

  it("compacts long task logs before persisting", async () => {
    const store = new ChromeStorageEventStore();

    for (let index = 0; index < 260; index += 1) {
      await store.append(event(`evt_${index}`, { type: index === 0 ? "TaskStarted" : "EvidenceAdded", timestamp: index }));
    }

    const events = await store.loadAfter("session-1", "task-1");
    expect(events).toHaveLength(240);
    expect(events[0].id).toBe("evt_0");
    expect(events.at(-1)?.id).toBe("evt_259");
  });

  it("prunes old event logs and keeps running when Chrome storage quota is exceeded", async () => {
    const store = new ChromeStorageEventStore();
    for (let index = 0; index < 10; index += 1) {
      backing.set(`naturalclick:eventLog:old-${index}:task`, [
        event(`old-${index}`, { sessionId: `old-${index}`, taskId: "task", timestamp: index })
      ]);
    }

    failNextSetWithQuota = true;
    await expect(store.append(event("evt_quota", { timestamp: 99 }))).resolves.toBeUndefined();

    const events = await store.loadAfter("session-1", "task-1");
    expect(events.map((item) => item.id)).toContain("evt_quota");
    expect(Array.from(backing.keys()).filter((key) => key.startsWith("naturalclick:eventLog:old-")).length).toBeLessThan(10);
  });
});
