export type MemorySensitivity = "public" | "personal" | "secret";
export type MemoryScope = "current_step" | "current_task" | "current_session";

export interface MemoryFact {
  id: string;
  kind: string;
  value: unknown;
  sourceEvidenceRefs: string[];
  confidence: number;
  sensitivity: MemorySensitivity;
  scope: MemoryScope;
  expiresAt?: number;
}

export interface MemoryQuery {
  minConfidence?: number;
  includeExpired?: boolean;
  now?: number;
}

function normalizeConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function isExpired(fact: MemoryFact, now: number): boolean {
  return fact.expiresAt !== undefined && fact.expiresAt <= now;
}

export class SessionMemoryStore {
  private facts: MemoryFact[] = [];

  addFact(fact: MemoryFact): MemoryFact {
    const normalized = { ...fact, confidence: normalizeConfidence(fact.confidence) };
    const existingIndex = this.facts.findIndex((item) => item.id === normalized.id);
    if (existingIndex >= 0) {
      this.facts[existingIndex] = normalized;
    } else {
      this.facts.push(normalized);
    }
    return normalized;
  }

  findByKind(kind: string, query: MemoryQuery = {}): MemoryFact[] {
    const now = query.now ?? Date.now();
    return this.facts
      .filter((fact) => fact.kind === kind)
      .filter((fact) => query.includeExpired || !isExpired(fact, now))
      .filter((fact) => query.minConfidence === undefined || fact.confidence >= query.minConfidence)
      .sort((left, right) => right.confidence - left.confidence);
  }

  clear(): void {
    this.facts = [];
  }
}
