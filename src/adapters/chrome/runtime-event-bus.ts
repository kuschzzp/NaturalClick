import type { AgentEvent } from "../../core/events/events";

export const RUNTIME_EVENT_PORT = "naturalclick-runtime-events";

export type RuntimeEventPortMessage =
  | { type: "RUNTIME_EVENT"; event: AgentEvent }
  | { type: "SESSION_SYNC"; sessionId?: string; taskId?: string };

interface RuntimePort {
  name: string;
  postMessage(message: RuntimeEventPortMessage): void;
  onDisconnect: {
    addListener(listener: () => void): void;
  };
}

interface PortRegistration {
  port: RuntimePort;
  sessionId?: string;
  taskId?: string;
}

export class RuntimeEventBus {
  private readonly ports = new Set<PortRegistration>();

  connect(port: RuntimePort, sessionId?: string, taskId?: string): boolean {
    if (port.name !== RUNTIME_EVENT_PORT) return false;
    const registration: PortRegistration = { port, sessionId, taskId };
    this.ports.add(registration);
    port.onDisconnect.addListener(() => {
      this.ports.delete(registration);
    });
    port.postMessage({ type: "SESSION_SYNC", sessionId, taskId });
    return true;
  }

  broadcast(event: AgentEvent): void {
    for (const registration of this.ports) {
      if (registration.sessionId && registration.sessionId !== event.sessionId) continue;
      if (registration.taskId && registration.taskId !== event.taskId) continue;
      registration.port.postMessage({ type: "RUNTIME_EVENT", event });
    }
  }

  size(): number {
    return this.ports.size;
  }
}

export const runtimeEventBus = new RuntimeEventBus();
