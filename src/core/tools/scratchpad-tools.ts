import type { ToolDefinition } from "./tool";

export const scratchpadTools: ToolDefinition[] = [
  {
    name: "save_scratchpad",
    group: "scratchpad",
    risk: "write",
    description: "Save a compact structured extraction note for the current session scratchpad.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" },
        collection: { type: "string" },
        fields: {
          type: "object",
          additionalProperties: { type: ["string", "number", "boolean", "null"] }
        },
        evidence: { type: "string" }
      },
      required: ["collection", "fields"],
      additionalProperties: false
    }
  },
  {
    name: "list_scratchpad",
    group: "scratchpad",
    risk: "read",
    description: "Read compact structured extraction notes saved in the current session scratchpad.",
    parameters: {
      type: "object",
      properties: {
        collection: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" }
      },
      required: [],
      additionalProperties: false
    }
  }
];
