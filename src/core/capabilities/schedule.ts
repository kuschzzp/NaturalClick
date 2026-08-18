export type ScheduleStatus = "draft" | "ready" | "paused";
export type ScheduleTriggerType = "manual" | "daily" | "weekly" | "page_change";

export interface ScheduleTrigger {
  type: ScheduleTriggerType;
  timeOfDay?: string;
  timezone?: string;
  dayOfWeek?: number;
  urlPattern?: string;
}

export interface ScheduledTaskRecord {
  id: string;
  title: string;
  taskText: string;
  trigger: ScheduleTrigger;
  status: ScheduleStatus;
  notes?: string;
  createdAt?: number;
  updatedAt?: number;
  lastRunAt?: number;
  nextRunAt?: number;
}

export interface ScheduleQuery {
  status?: ScheduleStatus | string;
  query?: string;
  limit?: number;
}

export interface ScheduleStore {
  saveSchedule(record: ScheduledTaskRecord): Promise<ScheduledTaskRecord>;
  listSchedules(query?: ScheduleQuery): Promise<ScheduledTaskRecord[]>;
}

const SCHEDULE_STATUSES = new Set<ScheduleStatus>(["draft", "ready", "paused"]);
const TRIGGER_TYPES = new Set<ScheduleTriggerType>(["manual", "daily", "weekly", "page_change"]);

export function sanitizeScheduleId(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\w.-]/g, "")
    .slice(0, 120);
}

export function sanitizeScheduleStatus(value: unknown): ScheduleStatus {
  const status = String(value ?? "").trim().toLowerCase();
  return SCHEDULE_STATUSES.has(status as ScheduleStatus) ? (status as ScheduleStatus) : "draft";
}

function scheduleStatusFilter(value: unknown): ScheduleStatus | undefined {
  const status = String(value ?? "").trim().toLowerCase();
  return SCHEDULE_STATUSES.has(status as ScheduleStatus) ? (status as ScheduleStatus) : undefined;
}

export function sanitizeScheduleTrigger(value: unknown): ScheduleTrigger {
  const input = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const rawType = String(input.type ?? "").trim().toLowerCase();
  const type = TRIGGER_TYPES.has(rawType as ScheduleTriggerType) ? (rawType as ScheduleTriggerType) : "manual";
  const timeOfDay = sanitizeTimeOfDay(input.timeOfDay);
  const timezone = stringField(input.timezone, 80);
  const urlPattern = stringField(input.urlPattern, 500);
  const dayOfWeek = numberField(input.dayOfWeek, 0, 6);
  return {
    type,
    ...(timeOfDay ? { timeOfDay } : {}),
    ...(timezone ? { timezone } : {}),
    ...(dayOfWeek === undefined ? {} : { dayOfWeek }),
    ...(urlPattern ? { urlPattern } : {})
  };
}

export function sanitizeScheduledTaskRecord(record: ScheduledTaskRecord, now = Date.now()): ScheduledTaskRecord | undefined {
  const id = sanitizeScheduleId(record.id);
  const title = stringField(record.title, 160);
  const taskText = stringField(record.taskText, 4000);
  if (!id || !title || !taskText) return undefined;
  const notes = stringField(record.notes, 1000);
  const createdAt = timestampField(record.createdAt) ?? now;
  const updatedAt = timestampField(record.updatedAt) ?? now;
  const lastRunAt = timestampField(record.lastRunAt);
  const nextRunAt = timestampField(record.nextRunAt);
  return {
    id,
    title,
    taskText,
    trigger: sanitizeScheduleTrigger(record.trigger),
    status: sanitizeScheduleStatus(record.status),
    ...(notes ? { notes } : {}),
    createdAt,
    updatedAt,
    ...(lastRunAt === undefined ? {} : { lastRunAt }),
    ...(nextRunAt === undefined ? {} : { nextRunAt })
  };
}

export function scheduleRecordMatches(record: ScheduledTaskRecord, query: ScheduleQuery = {}): boolean {
  const status = scheduleStatusFilter(query.status);
  if (status && record.status !== status) return false;
  const needle = String(query.query ?? "").trim().toLowerCase();
  if (!needle) return true;
  return [
    record.id,
    record.title,
    record.taskText,
    record.status,
    record.trigger.type,
    record.trigger.timeOfDay,
    record.trigger.timezone,
    record.trigger.urlPattern,
    record.notes
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

function stringField(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function numberField(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function timestampField(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  return Math.round(value);
}

function sanitizeTimeOfDay(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(trimmed) ? trimmed : "";
}
