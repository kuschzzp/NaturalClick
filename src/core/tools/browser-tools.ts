import type { ToolDefinition } from "./tool";

export const browserTools: ToolDefinition[] = [
  {
    name: "click",
    group: "core",
    risk: "write",
    description: "Click an interactive element by frameId and hidden handle from the latest read_page interactive index.",
    parameters: {
      type: "object",
      properties: {
        frameId: { type: "number" },
        handle: { type: "string" }
      },
      required: ["frameId", "handle"],
      additionalProperties: false
    }
  },
  {
    name: "type",
    group: "core",
    risk: "write",
    description: "Type text into an editable element by frameId and hidden handle.",
    parameters: {
      type: "object",
      properties: {
        frameId: { type: "number" },
        handle: { type: "string" },
        text: { type: "string" },
        clear: { type: "boolean" }
      },
      required: ["frameId", "handle", "text"],
      additionalProperties: false
    }
  },
  {
    name: "select",
    group: "core",
    risk: "write",
    description: "Select an option in a native select or combobox by frameId and hidden handle.",
    parameters: {
      type: "object",
      properties: {
        frameId: { type: "number" },
        handle: { type: "string" },
        value: { type: "string" },
        label: { type: "string" }
      },
      required: ["frameId", "handle"],
      additionalProperties: false
    }
  },
  {
    name: "scroll",
    group: "core",
    risk: "write",
    description: "Scroll the page or a scrollable region to reveal more content.",
    parameters: {
      type: "object",
      properties: {
        direction: { type: "string", enum: ["up", "down", "left", "right"] },
        amount: { type: "number" },
        frameId: { type: "number" },
        handle: { type: "string" }
      },
      required: ["direction"],
      additionalProperties: false
    }
  },
  {
    name: "wait",
    group: "core",
    risk: "read",
    description: "Wait briefly for navigation, loading, animation, or async page updates.",
    parameters: {
      type: "object",
      properties: {
        milliseconds: { type: "number" },
        reason: { type: "string" }
      },
      required: ["milliseconds"],
      additionalProperties: false
    }
  },
  {
    name: "done",
    group: "core",
    risk: "read",
    description: "Signal successful task completion.",
    parameters: {
      type: "object",
      properties: { result: { type: "string" } },
      required: ["result"],
      additionalProperties: false
    }
  },
  {
    name: "fail",
    group: "core",
    risk: "read",
    description: "Signal that the task cannot be completed.",
    parameters: {
      type: "object",
      properties: { reason: { type: "string" } },
      required: ["reason"],
      additionalProperties: false
    }
  }
];
