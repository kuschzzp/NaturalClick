import type { AgentEvent } from "../../core/events/events";

function keyFor(sessionId: string, taskId: string): string {
  return `naturalclick:eventLog:${sessionId}:${taskId}`;
}

async function getStoredEvents(key: string): Promise<AgentEvent[]> {
  const stored = await chrome.storage.local.get(key);
  const value = stored[key];
  return Array.isArray(value) ? (value as AgentEvent[]) : [];
}

export class ChromeStorageEventStore {
  async append(event: AgentEvent): Promise<void> {
    const key = keyFor(event.sessionId, event.taskId);
    const events = await getStoredEvents(key);
    await chrome.storage.local.set({ [key]: [...events, event] });
  }

  async appendMany(events: AgentEvent[]): Promise<void> {
    for (const event of events) {
      await this.append(event);
    }
  }

  async loadAfter(sessionId: string, taskId: string, eventId?: string): Promise<AgentEvent[]> {
    const events = await getStoredEvents(keyFor(sessionId, taskId));
    if (!eventId) return events;
    const index = events.findIndex((event) => event.id === eventId);
    return index === -1 ? events : events.slice(index + 1);
  }
}
