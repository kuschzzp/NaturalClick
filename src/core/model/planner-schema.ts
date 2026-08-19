import type { ModelApiProtocol } from "./model-instance";

type JsonSchema = Record<string, unknown>;

const commandTypes = [
  "NavigateTo",
  "ActivateTarget",
  "FillField",
  "ScrollRegion",
  "ReadContent",
  "OpenTab",
  "SwitchTab",
  "PressKey",
  "WaitForChange",
  "SelectOption",
  "SubmitCurrentForm"
] as const;

const successCriteria = [
  "page_changed",
  "target_visible",
  "control_value_matches",
  "control_state_matches",
  "content_read",
  "submission_feedback_or_validation",
  "menu_expanded",
  "menu_collapsed",
  "child_target_visible",
  "viewport_scrolled",
  "wait_completed",
  "key_pressed"
] as const;

function nullable(schema: JsonSchema): JsonSchema {
  return { anyOf: [schema, { type: "null" }] };
}

function stringArray(items: JsonSchema = { type: "string" }): JsonSchema {
  return { type: "array", items };
}

function closedObject(properties: Record<string, JsonSchema>): JsonSchema {
  return {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false
  };
}

function commandInputsSchema(): JsonSchema {
  const nullableString = nullable({ type: "string" });
  const nullableNumber = nullable({ type: "number" });
  return closedObject({
    controlId: nullableString,
    semanticId: nullableString,
    controlRef: nullableString,
    targetRef: nullableString,
    targetId: nullableString,
    value: nullableString,
    text: nullableString,
    input: nullableString,
    url: nullableString,
    href: nullableString,
    direction: nullable({ type: "string", enum: ["up", "down", "left", "right"] }),
    amount: nullableNumber,
    milliseconds: nullableNumber,
    label: nullableString,
    targetLabel: nullableString,
    name: nullableString,
    title: nullableString,
    ariaLabel: nullableString,
    accessibleName: nullableString,
    placeholder: nullableString,
    option: nullableString,
    optionText: nullableString,
    optionValue: nullableString
  });
}

function commandSchema(): JsonSchema {
  return closedObject({
    type: { type: "string", enum: [...commandTypes] },
    targetGoal: { type: "string" },
    inputs: commandInputsSchema(),
    expectedOutcome: { type: "string" },
    successCriteria: stringArray({ type: "string", enum: [...successCriteria] }),
    riskHint: { type: "string", enum: ["low", "medium", "high"] }
  });
}

function commandTurnSchema(): JsonSchema {
  return closedObject({
    taskUnderstanding: { type: "string" },
    activeSubgoal: { type: "string" },
    shortPlan: stringArray(),
    nextCommand: commandSchema(),
    nextCommands: { type: "array", items: commandSchema() },
    expectedOutcome: { type: "string" },
    successCriteria: stringArray({ type: "string", enum: [...successCriteria] }),
    riskHint: { type: "string", enum: ["low", "medium", "high"] },
    missingInfo: stringArray(),
    assumptions: stringArray(),
    reasoningSummary: { type: "string" }
  });
}

function observationCandidateSchema(): JsonSchema {
  const nullableString = nullable({ type: "string" });
  const nullableNumber = nullable({ type: "number" });
  return closedObject({
    semanticId: nullableString,
    label: nullableString,
    accessibleName: nullableString,
    role: nullableString,
    regionRef: nullableString,
    visibility: nullableString,
    expandedState: nullableString,
    score: nullableNumber,
    confidence: nullableNumber
  });
}

function observationTurnSchema(): JsonSchema {
  return closedObject({
    type: { type: "string", enum: ["NeedMoreObservation"] },
    reason: { type: "string" },
    query: nullable({ type: "string" }),
    scope: {
      type: "string",
      enum: ["current_viewport", "full_page", "navigation", "sidebar", "main_content", "form", "dialog", "scroll_container", "visual"]
    },
    expand: stringArray({
      type: "string",
      enum: ["more_candidates", "nearby_text", "hidden_menus", "offscreen_links", "form_fields", "tables", "validation_feedback", "visual_labels"]
    }),
    preferredRoles: stringArray({
      type: "string",
      enum: ["button", "link", "textbox", "searchbox", "combobox", "menuitem", "listitem", "table", "grid", "tab", "checkbox", "radio", "switch"]
    }),
    targetTextHints: stringArray(),
    ambiguousCandidates: { type: "array", items: observationCandidateSchema() }
  });
}

export function plannerResponseJsonSchema(): JsonSchema {
  const commandTurn = commandTurnSchema();
  const needMoreObservationTurn = observationTurnSchema();
  const askUserTurn = closedObject({
      type: { type: "string", enum: ["AskUser"] },
      question: { type: "string" },
      options: stringArray(),
      reason: { type: "string" }
    });
  const finishTaskTurn = closedObject({
      type: { type: "string", enum: ["FinishTask"] },
      summary: { type: "string" },
      evidenceRefs: stringArray()
    });
  return {
    ...closedObject({
      commandTurn: nullable(commandTurn),
      needMoreObservationTurn: nullable(needMoreObservationTurn),
      askUserTurn: nullable(askUserTurn),
      finishTaskTurn: nullable(finishTaskTurn)
    }),
    anyOf: [
      closedObject({ commandTurn, needMoreObservationTurn: { type: "null" }, askUserTurn: { type: "null" }, finishTaskTurn: { type: "null" } }),
      closedObject({ commandTurn: { type: "null" }, needMoreObservationTurn, askUserTurn: { type: "null" }, finishTaskTurn: { type: "null" } }),
      closedObject({ commandTurn: { type: "null" }, needMoreObservationTurn: { type: "null" }, askUserTurn, finishTaskTurn: { type: "null" } }),
      closedObject({ commandTurn: { type: "null" }, needMoreObservationTurn: { type: "null" }, askUserTurn: { type: "null" }, finishTaskTurn })
    ]
  };
}

export function plannerResponseFormat(protocol: Extract<ModelApiProtocol, "responses" | "chat_completions">): JsonSchema {
  const schema = plannerResponseJsonSchema();
  if (protocol === "responses") {
    return {
      type: "json_schema",
      name: "naturalclick_planner_turn",
      description: "One NaturalClick browser-planning turn.",
      strict: true,
      schema
    };
  }
  return {
    type: "json_schema",
    json_schema: {
      name: "naturalclick_planner_turn",
      description: "One NaturalClick browser-planning turn.",
      strict: true,
      schema
    }
  };
}
