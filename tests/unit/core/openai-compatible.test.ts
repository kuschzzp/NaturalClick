import { describe, expect, it } from "vitest";
import {
  extractOpenAICompatibleReasoningText,
  extractOpenAICompatibleText,
  extractOpenAICompatibleToolCallDeltas,
  extractOpenAICompatibleToolCalls,
  parseLooseJson
} from "../../../src/core/model/openai-compatible";

describe("OpenAI-compatible response helpers", () => {
  it("extracts provider-compatible reasoning deltas", () => {
    expect(
      extractOpenAICompatibleReasoningText({
        choices: [{ delta: { reasoning_content: "正在分析页面" } }]
      })
    ).toBe("正在分析页面");

    expect(
      extractOpenAICompatibleReasoningText({
        choices: [{ delta: { reasoningContent: [{ text: "并确认目标" }] } }]
      })
    ).toBe("并确认目标");
  });

  it("extracts plain message content", () => {
    expect(
      extractOpenAICompatibleText({
        choices: [{ message: { content: '{"type":"FinishTask","summary":"done"}' } }]
      })
    ).toBe('{"type":"FinishTask","summary":"done"}');
  });

  it("extracts function call arguments when content is empty", () => {
    expect(
      extractOpenAICompatibleText({
        choices: [
          {
            message: {
              content: "",
              function_call: {
                arguments: '{"type":"NeedMoreObservation","scope":"navigation","reason":"find menu"}'
              }
            }
          }
        ]
      })
    ).toBe('{"type":"NeedMoreObservation","scope":"navigation","reason":"find menu"}');
  });

  it("extracts tool call function arguments", () => {
    expect(
      extractOpenAICompatibleText({
        choices: [
          {
            message: {
              tool_calls: [
                {
                  function: {
                    arguments: {
                      type: "FinishTask",
                      summary: "ok",
                      evidenceRefs: []
                    }
                  }
                }
              ]
            }
          }
        ]
      })
    ).toBe('{"type":"FinishTask","summary":"ok","evidenceRefs":[]}');
  });

  it("extracts structured tool calls with names and ids", () => {
    expect(
      extractOpenAICompatibleToolCalls({
        choices: [
          {
            message: {
              tool_calls: [
                {
                  id: "call_1",
                  function: {
                    name: "read_page",
                    arguments: { mode: "atlas" }
                  }
                }
              ]
            }
          }
        ]
      })
    ).toEqual([{ id: "call_1", name: "read_page", argumentsText: '{"mode":"atlas"}' }]);
  });

  it("extracts streamed tool call deltas with fallback ids", () => {
    expect(
      extractOpenAICompatibleToolCalls({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  function: {
                    name: "done",
                    arguments: '{"result":"ok"}'
                  }
                }
              ]
            }
          }
        ]
      })
    ).toEqual([{ id: "call_0", index: 0, name: "done", argumentsText: '{"result":"ok"}' }]);
  });

  it("keeps streamed argument-only tool deltas for aggregation", () => {
    expect(
      extractOpenAICompatibleToolCallDeltas({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  function: {
                    arguments: ',"summary":"done"}'
                  }
                }
              ]
            }
          }
        ]
      })
    ).toEqual([{ index: 0, argumentsText: ',"summary":"done"}' }]);
  });

  it("parses JSON from fenced or explanatory model text", () => {
    expect(parseLooseJson('```json\n{"type":"FinishTask","summary":"done"}\n```')).toEqual({
      type: "FinishTask",
      summary: "done"
    });
  });
});
