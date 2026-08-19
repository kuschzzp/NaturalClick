import { describe, expect, it } from "vitest";
import { plannerResponseFormat, plannerResponseJsonSchema } from "../../../src/core/model/planner-schema";

describe("planner strict response schema", () => {
  it("uses a closed root object with four nullable turn branches", () => {
    const schema = plannerResponseJsonSchema();

    expect(schema).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["commandTurn", "needMoreObservationTurn", "askUserTurn", "finishTaskTurn"]
    });
    expect(Object.keys(schema.properties as object)).toEqual([
      "commandTurn",
      "needMoreObservationTurn",
      "askUserTurn",
      "finishTaskTurn"
    ]);
    expect(schema.anyOf).toHaveLength(4);
    expect((schema.anyOf as any[])[0].properties).toMatchObject({
      needMoreObservationTurn: { type: "null" },
      askUserTurn: { type: "null" },
      finishTaskTurn: { type: "null" }
    });
  });

  it("closes command inputs and constrains semantic commands", () => {
    const schema = plannerResponseJsonSchema() as any;
    const command = schema.properties.commandTurn.anyOf[0].properties.nextCommand;

    expect(command.additionalProperties).toBe(false);
    expect(command.properties.type.enum).toContain("ActivateTarget");
    expect(command.properties.type.enum).not.toContain("dom_click");
    expect(command.properties.inputs.additionalProperties).toBe(false);
    expect(command.properties.inputs.properties).toHaveProperty("controlId");
    expect(command.properties.inputs.properties).toHaveProperty("url");
  });

  it("maps the same schema to Responses and Chat Completions formats", () => {
    expect(plannerResponseFormat("responses")).toMatchObject({
      type: "json_schema",
      name: "naturalclick_planner_turn",
      strict: true
    });
    expect(plannerResponseFormat("chat_completions")).toMatchObject({
      type: "json_schema",
      json_schema: {
        name: "naturalclick_planner_turn",
        strict: true
      }
    });
  });
});
