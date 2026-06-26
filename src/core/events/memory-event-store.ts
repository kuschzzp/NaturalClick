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
}
