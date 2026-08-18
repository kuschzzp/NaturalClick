import { describe, expect, it } from "vitest";
import { isSerializableRecord } from "../../../src/core/architecture/serialization";
import { toOpenAIChatTools } from "../../../src/core/tools/openai-tool-schema";
import type { ToolDefinition } from "../../../src/core/tools/tool";

describe("OpenAI tool schema adapter", () => {
  it("converts internal tool definitions into OpenAI-compatible function tools", () => {
    const tools: ToolDefinition[] = [
      {
        name: "read_page",
        group: "core",
        risk: "read",
        description: " Read page. ",
        parameters: {
          type: "object",
          properties: {
            mode: { type: "string", enum: ["atlas", "interactive"] }
          },
          required: [],
          additionalProperties: false
        }
      }
    ];

    expect(toOpenAIChatTools(tools)).toEqual([
      {
        type: "function",
        function: {
          name: "read_page",
          description: "Read page.",
          parameters: tools[0].parameters
        }
      }
    ]);
    expect(isSerializableRecord(toOpenAIChatTools(tools)[0])).toBe(true);
  });

  it("falls back to an empty object schema for malformed parameter roots", () => {
    const tools: ToolDefinition[] = [
      {
        name: "no_args",
        group: "core",
        risk: "read",
        description: "No args.",
        parameters: {
          type: "string"
        }
      }
    ];

    expect(toOpenAIChatTools(tools)[0].function.parameters).toEqual({
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false
    });
  });
});
