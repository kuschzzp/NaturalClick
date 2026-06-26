import { describe, expect, it, vi } from "vitest";
import { ChromeStorageEventStore } from "../../../src/adapters/chrome/chrome-storage-event-store";
import type { AgentEvent } from "../../../src/core/events/events";

const backing = new Map<string, unknown>();

vi.stubGlobal("chrome", {
  storage: {
    local: {
      async get(key: string) {
        return { [key]: backing.get(key) };
      },
      async set(value: Record<string, unknown>) {
        Object.entries(value).forEach(([key, stored]) => backing.set(key, stored));
      }
    }
  }
});

function event(id: string): AgentEvent {
  return {
    id,
    sessionId: "session-1",
    taskId: "task-1",
    stepId: "step-1",
    type: "TaskStarted",
    timestamp: 1,
    payload: {},
    visibility: "debug",
    correlationId: "corr-1"
  };
}

describe("ChromeStorageEventStore", () => {
  it("appends and loads task events", async () => {
    const store = new ChromeStorageEventStore();
    await store.append(event("evt_1"));
    await store.append(event("evt_2"));

    const events = await store.loadAfter("session-1", "task-1");

    expect(events.map((item) => item.id)).toEqual(["evt_1", "evt_2"]);
  });
});
