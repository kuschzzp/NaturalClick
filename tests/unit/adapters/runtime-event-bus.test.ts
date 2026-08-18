import { describe, expect, it, vi } from "vitest";
import type { AgentEvent } from "../../../src/core/events/events";
import { RUNTIME_EVENT_PORT, RuntimeEventBus } from "../../../src/adapters/chrome/runtime-event-bus";

function event(overrides: Partial<AgentEvent> = {}): AgentEvent {
  return {
    id: "evt-1",
    sessionId: "session-1",
    taskId: "task-1",
    stepId: "step-1",
    type: "TaskStarted",
    timestamp: 1,
    payload: {},
    visibility: "user",
    correlationId: "step-1",
    ...overrides
  };
}

function port(name = RUNTIME_EVENT_PORT) {
  let disconnect: (() => void) | undefined;
  return {
    name,
    postMessage: vi.fn(),
    onDisconnect: {
      addListener: vi.fn((listener: () => void) => {
        disconnect = listener;
      })
    },
    disconnect: () => disconnect?.()
  };
}

describe("RuntimeEventBus", () => {
  it("connects runtime ports and broadcasts matching events", () => {
    const bus = new RuntimeEventBus();
    const first = port();
    const second = port();

    expect(bus.connect(first, "session-1")).toBe(true);
    expect(bus.connect(second, "session-2")).toBe(true);
    bus.broadcast(event());

    expect(first.postMessage).toHaveBeenCalledWith({ type: "RUNTIME_EVENT", event: event() });
    expect(second.postMessage).not.toHaveBeenCalledWith({ type: "RUNTIME_EVENT", event: event() });
  });

  it("removes disconnected ports", () => {
    const bus = new RuntimeEventBus();
    const connected = port();

    bus.connect(connected);
    expect(bus.size()).toBe(1);
    connected.disconnect();
    expect(bus.size()).toBe(0);
  });

  it("ignores unrelated ports", () => {
    const bus = new RuntimeEventBus();

    expect(bus.connect(port("other-port"))).toBe(false);
    expect(bus.size()).toBe(0);
  });
});
