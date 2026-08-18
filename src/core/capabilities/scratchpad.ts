export type ScratchpadFieldValue = string | number | boolean | null;

export interface ScratchpadRecord {
  id: string;
  collection: string;
  fields: Record<string, ScratchpadFieldValue>;
  evidence?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface ScratchpadQuery {
  collection?: string;
  query?: string;
  limit?: number;
}

export interface ScratchpadStore {
  saveRecord(record: ScratchpadRecord): Promise<ScratchpadRecord>;
  listRecords(query?: ScratchpadQuery): Promise<ScratchpadRecord[]>;
}

export function sanitizeScratchpadCollection(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\w.-]/g, "")
    .slice(0, 64);
}

export function sanitizeScratchpadFields(value: unknown, limit = 20): Record<string, ScratchpadFieldValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const fields: Record<string, ScratchpadFieldValue> = {};
  for (const [rawKey, rawValue] of Object.entries(value).slice(0, limit)) {
    const key = rawKey.trim().slice(0, 80);
    if (!key) continue;
    if (typeof rawValue === "string") {
      fields[key] = rawValue.trim().slice(0, 1000);
      continue;
    }
    if (typeof rawValue === "number") {
      fields[key] = Number.isFinite(rawValue) ? rawValue : null;
      continue;
    }
    if (typeof rawValue === "boolean" || rawValue === null) {
      fields[key] = rawValue;
    }
  }
  return fields;
}

export function sanitizeScratchpadRecord(record: ScratchpadRecord, now = Date.now()): ScratchpadRecord | undefined {
  const collection = sanitizeScratchpadCollection(record.collection);
  const fields = sanitizeScratchpadFields(record.fields);
  const id = String(record.id ?? "").trim().slice(0, 120);
  if (!id || !collection || Object.keys(fields).length === 0) return undefined;
  const createdAt = Number.isFinite(record.createdAt) && record.createdAt && record.createdAt > 0 ? Math.round(record.createdAt) : now;
  const updatedAt = Number.isFinite(record.updatedAt) && record.updatedAt && record.updatedAt > 0 ? Math.round(record.updatedAt) : now;
  const evidence = typeof record.evidence === "string" && record.evidence.trim() ? record.evidence.trim().slice(0, 1000) : undefined;
  return {
    id,
    collection,
    fields,
    ...(evidence ? { evidence } : {}),
    createdAt,
    updatedAt
  };
}

export function scratchpadRecordMatches(record: ScratchpadRecord, query: ScratchpadQuery = {}): boolean {
  const collection = sanitizeScratchpadCollection(query.collection);
  if (collection && record.collection !== collection) return false;
  const needle = String(query.query ?? "").trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    record.id,
    record.collection,
    record.evidence,
    ...Object.entries(record.fields).flatMap(([key, value]) => [key, String(value ?? "")])
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}
