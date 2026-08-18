import { RUNTIME_EVENT_PORT, type RuntimeEventPortMessage } from "../adapters/chrome/runtime-event-bus";
import type { AgentEvent } from "../core/events/events";

export interface RuntimeSubscription {
  dispose(): void;
}

export interface RuntimeSubscriptionHandlers {
  onEvent(event: AgentEvent): void;
  onDisconnect?(): void;
}

export function subscribeRuntimeEvents(handlers: RuntimeSubscriptionHandlers): RuntimeSubscription {
  const runtime = globalThis.chrome?.runtime;
  if (!runtime?.connect) {
    return { dispose: () => {} };
  }

  const port = runtime.connect({ name: RUNTIME_EVENT_PORT });
  const messageListener = (message: RuntimeEventPortMessage) => {
    if (message.type === "RUNTIME_EVENT") handlers.onEvent(message.event);
  };
  const disconnectListener = () => {
    handlers.onDisconnect?.();
  };
  port.onMessage.addListener(messageListener);
  port.onDisconnect.addListener(disconnectListener);

  return {
    dispose: () => {
      port.onMessage.removeListener(messageListener);
      port.onDisconnect.removeListener(disconnectListener);
      port.disconnect();
    }
  };
}
