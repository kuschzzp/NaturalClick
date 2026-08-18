import type { ToolDefinition } from "./tool";

export const searchTools: ToolDefinition[] = [
  {
    name: "search_context",
    group: "search",
    risk: "read",
    description:
      "Request external or browser-context lookup results for information that is not available in the current page. Availability is controlled by Search settings.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        maxResults: { type: "number" }
      },
      required: ["query"],
      additionalProperties: false
    }
  }
];
