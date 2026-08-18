import type { ToolDefinition } from "./tool";

export const pageTools: ToolDefinition[] = [
  {
    name: "read_page",
    group: "core",
    risk: "read",
    description: "Inspect the current tab. Default mode returns a compact Page Atlas; interactive mode returns handles for click/type/select.",
    parameters: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["atlas", "interactive", "content", "full"] },
        candidateLimit: { type: "number" },
        refresh: { type: "boolean" }
      },
      required: [],
      additionalProperties: false
    }
  },
  {
    name: "find_target",
    group: "core",
    risk: "read",
    description: "Search Page Atlas target metadata to find the right structured target.",
    parameters: {
      type: "object",
      properties: {
        atlasId: { type: "string" },
        query: { type: "string" },
        role: { type: "string" },
        candidateLimit: { type: "number" }
      },
      required: ["query"],
      additionalProperties: false
    }
  },
  {
    name: "read_target",
    group: "core",
    risk: "read",
    description: "Read context around one Page Atlas target or interactive handle.",
    parameters: {
      type: "object",
      properties: {
        targetId: { type: "string" },
        frameId: { type: "number" },
        handle: { type: "string" },
        includeContext: { type: "boolean" }
      },
      required: [],
      additionalProperties: false
    }
  }
];
