import type { ToolDefinition } from "./tool";

export const fileTools: ToolDefinition[] = [
  {
    name: "list_attachments",
    group: "files",
    risk: "read",
    description: "List files attached to the current task, including metadata and text-preview availability.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false
    }
  },
  {
    name: "read_attachment",
    group: "files",
    risk: "read",
    description: "Read the capped text preview for one attached file by id or filename.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" },
        filename: { type: "string" }
      },
      required: [],
      additionalProperties: false
    }
  },
  {
    name: "save_artifact",
    group: "files",
    risk: "write",
    description: "Save a generated text artifact such as Markdown, CSV, JSON, or plain text for the user to download later.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" },
        filename: { type: "string" },
        mime: { type: "string" },
        textContent: { type: "string" },
        source: { type: "string" }
      },
      required: ["filename", "textContent"],
      additionalProperties: false
    }
  },
  {
    name: "list_artifacts",
    group: "files",
    risk: "read",
    description: "List generated text artifacts available for download in the current session.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "number" }
      },
      required: [],
      additionalProperties: false
    }
  },
  {
    name: "read_artifact",
    group: "files",
    risk: "read",
    description: "Read one generated text artifact by id so it can be checked, summarized, or downloaded.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" },
        filename: { type: "string" }
      },
      required: [],
      additionalProperties: false
    }
  }
];
