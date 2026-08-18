import type { SerializableRecord } from "../architecture/serialization";
import type { ToolDefinition } from "./tool";

export interface OpenAIChatFunctionTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: SerializableRecord;
  };
}

export function toOpenAIChatTools(tools: ToolDefinition[]): OpenAIChatFunctionTool[] {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description.trim(),
      parameters: normalizeParameters(tool.parameters)
    }
  }));
}

function normalizeParameters(parameters: SerializableRecord): SerializableRecord {
  if (parameters.type === "object") return parameters;
  return {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false
  };
}
