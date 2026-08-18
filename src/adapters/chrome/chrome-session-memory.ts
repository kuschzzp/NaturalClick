import type { MemoryFact } from "../../core/memory/session-memory";
import {
  sanitizeScratchpadRecord,
  scratchpadRecordMatches,
  type ScratchpadQuery,
  type ScratchpadRecord
} from "../../core/capabilities/scratchpad";
import type { TaskTombstone } from "../../core/session/session-store";

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

  async saveScratchpadRecord(sessionId: string, record: ScratchpadRecord): Promise<ScratchpadRecord> {
    const normalized = sanitizeScratchpadRecord(record);
    if (!normalized) throw new Error("invalid_scratchpad_record");
    await this.addFact(sessionId, {
      id: `scratchpad:${normalized.id}`,
      kind: "scratchpad",
      value: normalized,
      sourceEvidenceRefs: normalized.evidence ? [normalized.evidence] : [],
      confidence: 1,
      sensitivity: "public",
      scope: "current_session"
    });
    return normalized;
  }

  async listScratchpadRecords(sessionId: string, query: ScratchpadQuery = {}): Promise<ScratchpadRecord[]> {
    const facts = await this.findByKind(sessionId, "scratchpad");
    const records = facts.flatMap((fact) => {
      const record = scratchpadRecordFromFact(fact);
      return record ? [record] : [];
    });
    const limit = Number.isFinite(query.limit) && query.limit && query.limit > 0 ? Math.floor(query.limit) : 50;
    return records
      .filter((record) => scratchpadRecordMatches(record, query))
      .sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))
      .slice(0, limit);
  }

  async addTaskTombstone(tombstone: TaskTombstone): Promise<void> {
    await this.addFact(tombstone.sessionId, {
      id: `task_tombstone:${tombstone.taskId}`,
      kind: "task_tombstone",
      value: tombstone,
      sourceEvidenceRefs: tombstone.eventId ? [tombstone.eventId] : [],
      confidence: 1,
      sensitivity: "public",
      scope: "current_session"
    });
  }

  async clear(sessionId: string): Promise<void> {
    await chrome.storage.local.set({ [keyFor(sessionId)]: [] });
  }
}

function scratchpadRecordFromFact(fact: MemoryFact): ScratchpadRecord | undefined {
  if (fact.kind !== "scratchpad") return undefined;
  return sanitizeScratchpadRecord(fact.value as ScratchpadRecord);
}
