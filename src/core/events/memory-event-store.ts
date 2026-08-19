import type { AgentEvent } from "./events";

export class MemoryEventStore {
  private readonly events: AgentEvent[] = [];

  async append(event: AgentEvent): Promise<void> {
    this.events.push(event);
  }

  async appendMany(events: AgentEvent[]): Promise<void> {
    this.events.push(...events);
  }

  async loadAfter(sessionId: string, taskId: string, eventId?: string): Promise<AgentEvent[]> {
    const taskEvents = this.events.filter((event) => event.sessionId === sessionId && event.taskId === taskId);
    if (!eventId) {
      return [...taskEvents];
    }
    const index = taskEvents.findIndex((event) => event.id === eventId);
    return index === -1 ? [...taskEvents] : taskEvents.slice(index + 1);
  }

  async loadSession(sessionId: string): Promise<Array<{ taskId: string; events: AgentEvent[] }>> {
    const taskIds = [...new Set(this.events.filter((event) => event.sessionId === sessionId).map((event) => event.taskId))];
    return taskIds
      .map((taskId) => ({ taskId, events: this.events.filter((event) => event.sessionId === sessionId && event.taskId === taskId) }))
      .sort((left, right) => (left.events[0]?.timestamp ?? 0) - (right.events[0]?.timestamp ?? 0));
  }

  async clear(sessionId: string, taskId: string): Promise<void> {
    for (let index = this.events.length - 1; index >= 0; index -= 1) {
      const event = this.events[index];
      if (event.sessionId === sessionId && event.taskId === taskId) this.events.splice(index, 1);
    }
  }
}
