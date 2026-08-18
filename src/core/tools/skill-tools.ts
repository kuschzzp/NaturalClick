import type { ToolDefinition } from "./tool";

export const skillTools: ToolDefinition[] = [
  {
    name: "list_skills",
    group: "skills",
    risk: "read",
    description: "List reusable browser-operation skills that the user has enabled for this Agent session.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false
    }
  },
  {
    name: "use_skill",
    group: "skills",
    risk: "read",
    description: "Invoke a reusable skill by id or name. The skill returns task guidance before browser actions continue.",
    parameters: {
      type: "object",
      properties: {
        skillId: { type: "string" },
        name: { type: "string" },
        task: { type: "string" }
      },
      required: [],
      additionalProperties: false
    }
  },
  {
    name: "record_workflow",
    group: "skills",
    risk: "write",
    description: "Capture the current successful browser workflow as a reusable skill draft when workflow recording is enabled.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        description: { type: "string" },
        steps: { type: "array", items: { type: "string" } }
      },
      required: ["name", "description"],
      additionalProperties: false
    }
  }
];
