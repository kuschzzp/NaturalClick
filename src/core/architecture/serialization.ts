export type SerializablePrimitive = string | number | boolean | null;
export type SerializableValue = SerializablePrimitive | SerializableValue[] | { [key: string]: SerializableValue };
export type SerializableRecord = { [key: string]: SerializableValue };

export function isSerializableRecord(value: unknown): value is SerializableRecord {
  return isSerializableValue(value, new WeakSet()) && value !== null && !Array.isArray(value) && typeof value === "object";
}

function isSerializableValue(value: unknown, seen: WeakSet<object>): value is SerializableValue {
  if (value === null) return true;
  if (typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) {
    if (seen.has(value)) return false;
    seen.add(value);
    return value.every((item) => isSerializableValue(item, seen));
  }
  if (!isPlainRecord(value)) return false;
  if (seen.has(value)) return false;
  seen.add(value);
  return Object.values(value).every((item) => isSerializableValue(item, seen));
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function assertNever(value: never): never {
  throw new Error(`Unhandled case: ${String(value)}`);
}
