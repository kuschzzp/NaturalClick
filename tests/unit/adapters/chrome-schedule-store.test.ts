import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChromeScheduleStore } from "../../../src/adapters/chrome/chrome-schedule-store";

const backing = new Map<string, unknown>();

describe("Chrome schedule store", () => {
  beforeEach(() => {
    backing.clear();
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          async get(key: string) {
            return { [key]: backing.get(key) };
          },
          async set(value: Record<string, unknown>) {
            Object.entries(value).forEach(([key, stored]) => backing.set(key, stored));
          }
        }
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores, filters, updates, and clears saved schedules", async () => {
    const store = new ChromeScheduleStore();

    await store.saveSchedule({
      id: "daily_report",
      title: "每日巡检",
      taskText: "打开控制台检查异常并保存摘要",
      status: "ready",
      trigger: { type: "daily", timeOfDay: "09:00" },
      createdAt: 100,
      updatedAt: 100
    });
    await store.saveSchedule({
      id: "weekly_cleanup",
      title: "每周整理",
      taskText: "整理本周记录",
      status: "paused",
      trigger: { type: "weekly", dayOfWeek: 5 },
      createdAt: 101,
      updatedAt: 101
    });

    await expect(store.listSchedules({ status: "ready", query: "控制台" })).resolves.toMatchObject([
      {
        id: "daily_report",
        title: "每日巡检",
        status: "ready",
        trigger: { type: "daily", timeOfDay: "09:00" },
        createdAt: 100
      }
    ]);

    const updated = await store.saveSchedule({
      id: "daily_report",
      title: "每日复盘",
      taskText: "重新检查控制台",
      status: "paused",
      trigger: { type: "manual" },
      createdAt: 999,
      updatedAt: 200
    });

    expect(updated).toMatchObject({
      id: "daily_report",
      title: "每日复盘",
      status: "paused",
      createdAt: 100,
      updatedAt: 200
    });
    await expect(store.listSchedules({ status: "paused" })).resolves.toHaveLength(2);

    await store.clear();
    await expect(store.listSchedules()).resolves.toEqual([]);
  });
});
