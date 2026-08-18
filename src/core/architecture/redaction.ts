export interface RedactionOptions {
  maxDepth?: number;
  maxStringLength?: number;
  redactionText?: string;
}

const DEFAULT_MAX_DEPTH = 8;
const DEFAULT_MAX_STRING_LENGTH = 4000;
const DEFAULT_REDACTION_TEXT = "[redacted]";

const SENSITIVE_KEY_PARTS = ["apikey", "authorization", "bearer", "token", "secret", "password", "credential", "cookie"];
const SECRET_QUERY_PARAM = /([?&](?:api_?key|access_?token|auth_?token|token|secret|password|key)=)([^&#\s]+)/gi;
const SECRET_ASSIGNMENT = /(\b(?:api[-_ ]?key|access[-_ ]?token|auth[-_ ]?token|token|secret|password)\b\s*[:=]\s*)(["']?)([^"'\s,;]+)/gi;
const AUTHORIZATION_BEARER = /(\bauthorization\b\s*[:=]\s*bearer\s+)([^\s"',;]+)/gi;
const BARE_BEARER = /\bbearer\s+([A-Za-z0-9._~+/=-]{8,})/gi;
const OPENAI_STYLE_KEY = /\bsk-[A-Za-z0-9._-]{8,}\b/g;

export function redactSensitiveValue(value: unknown, options: RedactionOptions = {}): unknown {
  return redactValue(value, normalizedOptions(options), 0, new WeakSet<object>());
}

export function redactSensitiveString(value: string, options: RedactionOptions = {}): string {
  const settings = normalizedOptions(options);
  return truncateString(redactString(value, settings.redactionText), settings.maxStringLength);
}

export function safeRedactedJson(value: unknown, options: RedactionOptions = {}): string {
  try {
    return JSON.stringify(redactSensitiveValue(value, options), null, 2);
  } catch (error) {
    return `JSON stringify failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export function isSensitiveKey(key: string, value?: unknown): boolean {
  const normalized = key.toLowerCase().replace(/[-_\s]/g, "");
  if (typeof value === "boolean" && (normalized.startsWith("has") || normalized.endsWith("configured"))) return false;
  return SENSITIVE_KEY_PARTS.some((part) => normalized.includes(part));
}

function redactValue(value: unknown, options: Required<RedactionOptions>, depth: number, seen: WeakSet<object>): unknown {
  if (depth > options.maxDepth) return "[max-depth]";
  if (typeof value === "string") return redactSensitiveString(value, options);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (typeof value === "undefined") return undefined;
  if (typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") return `[${typeof value}]`;

  if (Array.isArray(value)) {
    if (seen.has(value)) return "[circular]";
    seen.add(value);
    return value.map((item) => redactValue(item, options, depth + 1, seen));
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactSensitiveString(value.message, options),
      stack: value.stack ? redactSensitiveString(value.stack, options) : undefined
    };
  }

  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[circular]";
  seen.add(value);

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => {
      if (isSensitiveKey(key, item)) return [key, item ? options.redactionText : item];
      return [key, redactValue(item, options, depth + 1, seen)];
    })
  );
}

function redactString(value: string, redactionText: string): string {
  return value
    .replace(AUTHORIZATION_BEARER, (_match, prefix: string) => `${prefix}${redactionText}`)
    .replace(BARE_BEARER, `Bearer ${redactionText}`)
    .replace(SECRET_ASSIGNMENT, (_match, prefix: string, quote: string) => `${prefix}${quote}${redactionText}`)
    .replace(SECRET_QUERY_PARAM, (_match, prefix: string) => `${prefix}${redactionText}`)
    .replace(OPENAI_STYLE_KEY, redactionText);
}

function truncateString(value: string, maxStringLength: number): string {
  return value.length > maxStringLength ? `${value.slice(0, maxStringLength)}... [truncated ${value.length - maxStringLength} chars]` : value;
}

function normalizedOptions(options: RedactionOptions): Required<RedactionOptions> {
  return {
    maxDepth: positiveInteger(options.maxDepth, DEFAULT_MAX_DEPTH),
    maxStringLength: positiveInteger(options.maxStringLength, DEFAULT_MAX_STRING_LENGTH),
    redactionText: options.redactionText?.trim() || DEFAULT_REDACTION_TEXT
  };
}

function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}
