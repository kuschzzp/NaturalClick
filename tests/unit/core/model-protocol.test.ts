import { describe, expect, it } from "vitest";
import { plannerOutputBudget, protocolCandidates } from "../../../src/core/model/model-protocol";

describe("model protocol selection", () => {
  it("prefers Responses for official OpenAI auto configuration", () => {
    expect(protocolCandidates({ protocol: "auto", provider: "openai", baseUrl: "https://api.openai.com/v1" })).toEqual([
      "responses",
      "chat_completions",
      "completions"
    ]);
  });

  it("recognizes the official OpenAI URL even on migrated custom instances", () => {
    expect(protocolCandidates({ protocol: "auto", provider: "custom", baseUrl: "https://api.openai.com/v1/" })).toEqual([
      "responses",
      "chat_completions",
      "completions"
    ]);
  });

  it("keeps compatible providers on Chat Completions first", () => {
    expect(protocolCandidates({ protocol: "auto", provider: "custom", baseUrl: "https://gateway.example/v1" })).toEqual([
      "chat_completions",
      "completions"
    ]);
  });

  it("honors an explicitly selected legacy protocol", () => {
    expect(protocolCandidates({ protocol: "completions", provider: "openai", baseUrl: "https://api.openai.com/v1" })).toEqual(["completions"]);
  });

  it("uses a bounded reasoning-aware Planner output budget", () => {
    expect(plannerOutputBudget(undefined)).toBe(12000);
    expect(plannerOutputBudget(4096)).toBe(8000);
    expect(plannerOutputBudget(128000)).toBe(32000);
  });
});
