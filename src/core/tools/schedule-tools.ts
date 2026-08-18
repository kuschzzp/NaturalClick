import type { ToolDefinition } from "./tool";

export const scheduleTools: ToolDefinition[] = [
  {
    name: "save_schedule",
    group: "schedule",
    risk: "write",
    description: "Save a recurring browser-task schedule draft. This stores the plan only; it does not run the task automatically.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        taskText: { type: "string" },
        status: { type: "string", enum: ["draft", "ready", "paused"] },
        trigger: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["manual", "daily", "weekly", "page_change"] },
            timeOfDay: { type: "string" },
            timezone: { type: "string" },
            dayOfWeek: { type: "number" },
            urlPattern: { type: "string" }
          },
          required: ["type"],
          additionalProperties: false
        },
        notes: { type: "string" }
      },
      required: ["title", "taskText"],
      additionalProperties: false
    }
  },
  {
    name: "list_schedules",
    group: "schedule",
    risk: "read",
    description: "List saved browser-task schedule drafts.",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["draft", "ready", "paused"] },
        query: { type: "string" },
        limit: { type: "number" }
      },
      required: [],
      additionalProperties: false
    }
  }
];
