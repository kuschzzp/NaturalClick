import type { ToolDefinition } from "./tool";

export const disclosureTools: ToolDefinition[] = [
  {
    name: "load_tools",
    group: "core",
    risk: "read",
    description:
      "Load an optional tool group so its tools become callable on the next tool-definition refresh. Use this when the task needs search, skills, or another enabled capability that is not currently visible.",
    parameters: {
      type: "object",
      properties: {
        groups: {
          type: "array",
          items: {
            type: "string",
            enum: ["search", "skills", "scratchpad", "files", "pdf", "schedule", "vision"]
          }
        }
      },
      required: ["groups"],
      additionalProperties: false
    }
  }
];
