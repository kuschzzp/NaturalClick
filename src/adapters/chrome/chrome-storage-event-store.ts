import type { AgentEvent } from "../../core/events/events";

const EVENT_LOG_KEY_PREFIX = "naturalclick:eventLog:";
const MAX_EVENTS_PER_TASK_LOG = 240;
const QUOTA_RETRY_EVENTS_PER_TASK_LOG = 120;
const MAX_EVENT_LOG_TASKS = 8;

function keyFor(sessionId: string, taskId: string): string {
  return `${EVENT_LOG_KEY_PREFIX}${sessionId}:${taskId}`;
}

async function getStoredEvents(key: string): Promise<AgentEvent[]> {
  const stored = await chrome.storage.local.get(key);
  const value = stored[key];
  return Array.isArray(value) ? (value as AgentEvent[]) : [];
}

function compactEvents(events: AgentEvent[], limit: number): AgentEvent[] {
  if (events.length <= limit) return events;
  const first = events.find((event) => event.type === "TaskStarted") ?? events[0];
  const tailLimit = Math.max(0, limit - 1);
  const tail = events.slice(-tailLimit).filter((event) => event.id !== first.id);
  return [first, ...tail].slice(-limit);
}

function isQuotaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes("quota") || message.includes("QUOTA") || message.includes("kQuotaBytes");
}

function lastEventTimestamp(events: AgentEvent[]): number {
  return events.reduce((latest, event) => Math.max(latest, event.timestamp || 0), 0);
}

async function pruneStoredEventLogs(currentKey: string): Promise<void> {
  const stored = await chrome.storage.local.get(null);
  const eventLogEntries = Object.entries(stored)
    .filter(([key, value]) => key.startsWith(EVENT_LOG_KEY_PREFIX) && Array.isArray(value))
    .map(([key, value]) => ({ key, events: value as AgentEvent[], lastTimestamp: lastEventTimestamp(value as AgentEvent[]) }))
    .sort((left, right) => left.lastTimestamp - right.lastTimestamp);

  const removable = eventLogEntries
    .filter((entry) => entry.key !== currentKey)
    .slice(0, Math.max(0, eventLogEntries.length - MAX_EVENT_LOG_TASKS + 1))
    .map((entry) => entry.key);
  if (removable.length > 0) {
    await chrome.storage.local.remove(removable);
  }

  const compacted = Object.fromEntries(
    eventLogEntries
      .filter((entry) => entry.key === currentKey || !removable.includes(entry.key))
      .map((entry) => [entry.key, compactEvents(entry.events, QUOTA_RETRY_EVENTS_PER_TASK_LOG)])
  );
  if (Object.keys(compacted).length > 0) {
    await chrome.storage.local.set(compacted);
  }
}

export class ChromeStorageEventStore {
  async append(event: AgentEvent): Promise<void> {
    const key = keyFor(event.sessionId, event.taskId);
    const events = await getStoredEvents(key);
    const nextEvents = compactEvents([...events, event], MAX_EVENTS_PER_TASK_LOG);
    try {
      await chrome.storage.local.set({ [key]: nextEvents });
    } catch (error) {
      if (!isQuotaError(error)) throw error;
      try {
        await pruneStoredEventLogs(key);
        await chrome.storage.local.set({ [key]: compactEvents(nextEvents, QUOTA_RETRY_EVENTS_PER_TASK_LOG) });
      } catch {
        // Runtime event broadcasting is more important than persistence. Dropping one persisted event is preferable to
        // failing the whole browser operation when Chrome storage is already over quota.
      }
    }
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
