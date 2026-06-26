import type { MemoryFact } from "../../core/memory/session-memory";

function keyFor(sessionId: string): string {
  return `naturalclick:sessionMemory:${sessionId}`;
}

async function loadFacts(sessionId: string): Promise<MemoryFact[]> {
  const key = keyFor(sessionId);
  const stored = await chrome.storage.local.get(key);
  const value = stored[key];
  return Array.isArray(value) ? (value as MemoryFact[]) : [];
}

export class ChromeSessionMemory {
  async addFact(sessionId: string, fact: MemoryFact): Promise<void> {
    const key = keyFor(sessionId);
    const facts = await loadFacts(sessionId);
    const index = facts.findIndex((item) => item.id === fact.id);
    const next = [...facts];
    if (index >= 0) {
      next[index] = fact;
    } else {
      next.push(fact);
    }
    await chrome.storage.local.set({ [key]: next });
  }

  async findByKind(sessionId: string, kind: string): Promise<MemoryFact[]> {
    return (await loadFacts(sessionId)).filter((fact) => fact.kind === kind);
  }

  async clear(sessionId: string): Promise<void> {
    await chrome.storage.local.set({ [keyFor(sessionId)]: [] });
  }
}
