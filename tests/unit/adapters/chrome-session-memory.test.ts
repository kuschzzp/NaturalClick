import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChromeSessionMemory } from "../../../src/adapters/chrome/chrome-session-memory";

const backing = new Map<string, unknown>();

describe("Chrome session memory", () => {
  beforeEach(() => {
    backing.clear();
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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores task tombstones as session memory facts", async () => {
    const memory = new ChromeSessionMemory();

    await memory.addTaskTombstone({
      sessionId: "session_1",
      taskId: "task_1",
      status: "stopped",
      reason: "user_stop",
      eventId: "event_1",
      createdAt: 100
    });

    const facts = await memory.findByKind("session_1", "task_tombstone");

    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({
      id: "task_tombstone:task_1",
      kind: "task_tombstone",
      sourceEvidenceRefs: ["event_1"],
      value: {
        sessionId: "session_1",
        taskId: "task_1",
        status: "stopped",
        reason: "user_stop"
      }
    });
  });

  it("stores and filters scratchpad records in session memory", async () => {
    const memory = new ChromeSessionMemory();

    await memory.saveScratchpadRecord("session_1", {
      id: "customer_1",
      collection: "customers",
      fields: {
        name: "张三",
        amount: 1200
      },
      evidence: "text_1",
      createdAt: 100,
      updatedAt: 100
    });
    await memory.saveScratchpadRecord("session_1", {
      id: "contract_1",
      collection: "contracts",
      fields: {
        title: "采购合同"
      },
      createdAt: 101,
      updatedAt: 101
    });

    await expect(memory.listScratchpadRecords("session_1", { collection: "customers", query: "张三" })).resolves.toEqual([
      {
        id: "customer_1",
        collection: "customers",
        fields: {
          name: "张三",
          amount: 1200
        },
        evidence: "text_1",
        createdAt: 100,
        updatedAt: 100
      }
    ]);
  });
});
