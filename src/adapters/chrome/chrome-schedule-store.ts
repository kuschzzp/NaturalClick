import {
  sanitizeScheduledTaskRecord,
  scheduleRecordMatches,
  type ScheduleQuery,
  type ScheduledTaskRecord
} from "../../core/capabilities/schedule";

const SCHEDULE_STORE_KEY = "naturalclick.schedules.v1";

async function loadSchedules(): Promise<ScheduledTaskRecord[]> {
  const stored = await chrome.storage.local.get(SCHEDULE_STORE_KEY);
  const value = stored[SCHEDULE_STORE_KEY];
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const record = sanitizeScheduledTaskRecord(item as ScheduledTaskRecord);
    return record ? [record] : [];
  });
}

export class ChromeScheduleStore {
  async saveSchedule(record: ScheduledTaskRecord): Promise<ScheduledTaskRecord> {
    const normalized = sanitizeScheduledTaskRecord(record);
    if (!normalized) throw new Error("invalid_schedule_record");
    const schedules = await loadSchedules();
    const index = schedules.findIndex((item) => item.id === normalized.id);
    const next = [...schedules];
    if (index >= 0) {
      next[index] = { ...normalized, createdAt: schedules[index].createdAt ?? normalized.createdAt };
    } else {
      next.push(normalized);
    }
    await chrome.storage.local.set({ [SCHEDULE_STORE_KEY]: next });
    return index >= 0 ? next[index] : normalized;
  }

  async listSchedules(query: ScheduleQuery = {}): Promise<ScheduledTaskRecord[]> {
    const limit = Number.isFinite(query.limit) && query.limit && query.limit > 0 ? Math.floor(query.limit) : 50;
    return (await loadSchedules())
      .filter((record) => scheduleRecordMatches(record, query))
      .sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))
      .slice(0, limit);
  }

  async clear(): Promise<void> {
    await chrome.storage.local.set({ [SCHEDULE_STORE_KEY]: [] });
  }
}
