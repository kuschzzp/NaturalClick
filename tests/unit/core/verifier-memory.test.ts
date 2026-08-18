import { describe, expect, it } from "vitest";
import type { PrimitiveResult } from "../../../src/adapters/content/primitive-executor";
import type { SemanticCommand } from "../../../src/core/commands/commands";
import { SessionMemoryStore } from "../../../src/core/memory/session-memory";
import type { PageModel } from "../../../src/core/observation/page-model";
import { interpretTask } from "../../../src/core/runtime/task-interpreter";
import { verifyOutcome } from "../../../src/core/verification/verifier";

function fillCommand(): SemanticCommand {
  return {
    id: "cmd_fill",
    type: "FillField",
    targetGoal: "Email",
    inputs: { value: "alice@example.com" },
    expectedOutcome: "Email field contains alice@example.com",
    successCriteria: ["control_value_matches"],
    riskHint: "low",
    fallbackHints: []
  };
}

function fillCommandWithControlId(): SemanticCommand {
  return {
    ...fillCommand(),
    targetGoal: "Enter username 'admin' into the account textbox",
    inputs: { controlId: "control_3_textbox_", value: "admin" },
    expectedOutcome: "Username field contains admin"
  };
}

function primitive(status: PrimitiveResult["status"] = "success"): PrimitiveResult {
  return { status, details: {} };
}

function inputPrimitiveMatches(semanticId = "control_3_textbox_"): PrimitiveResult {
  return {
    status: "success",
    details: {
      primitive: "dom_input",
      semanticId,
      valueApplied: true,
      valueMatchesExpected: true,
      expectedValueLength: 5,
      actualValueLength: 5,
      valueStateAfter: "filled"
    }
  };
}

function pageWithEmail(value: string, feedback: string[] = []): PageModel {
  return {
    pageIdentity: {
      url: "https://example.test/form",
      title: "Form",
      origin: "https://example.test",
      path: "/form"
    },
    viewport: { width: 1280, height: 720, scrollX: 0, scrollY: 0, deviceScaleFactor: 1 },
    readableContent: [],
    feedback,
    textBlocks: [],
    forms: [],
    riskSignals: [],
    capturedAt: 1,
    controls: [
      {
        semanticId: "email",
        role: "textbox",
        label: "Email",
        accessibleName: "Email",
        elementTag: "input",
        valueState: value ? "filled" : "empty",
        required: true,
        disabled: false,
        visibility: "visible",
        interactionHints: ["input"],
        locatorHints: [{ kind: "css", value: "#email" }],
        confidence: 0.9
      }
    ]
  };
}

function loginPage(accountState: "empty" | "filled" = "empty"): PageModel {
  return {
    ...pageWithEmail(""),
    controls: [
      {
        semanticId: "control_3_textbox_",
        role: "textbox",
        label: "账号",
        accessibleName: "账号",
        elementTag: "input",
        valueState: accountState,
        required: true,
        disabled: false,
        visibility: "visible",
        interactionHints: ["input", "textbox"],
        locatorHints: [{ kind: "attribute", value: "data-testid=login-username" }],
        confidence: 0.9
      }
    ]
  };
}

function menuCommand(): SemanticCommand {
  return {
    id: "cmd_menu",
    type: "ActivateTarget",
    targetGoal: "客户管理",
    inputs: { controlId: "customer_menu" },
    expectedOutcome: "客户管理菜单展开",
    successCriteria: ["menu_expanded", "child_target_visible"],
    riskHint: "low",
    fallbackHints: []
  };
}

function collapsedMenuCommand(): SemanticCommand {
  return {
    id: "cmd_menu_collapse",
    type: "ActivateTarget",
    targetGoal: "客户管理",
    inputs: { controlId: "customer_menu" },
    expectedOutcome: "客户管理菜单收起",
    successCriteria: ["menu_collapsed"],
    riskHint: "low",
    fallbackHints: []
  };
}

function readContentCommand(): SemanticCommand {
  return {
    id: "cmd_read",
    type: "ReadContent",
    targetGoal: "客户摘要",
    inputs: { semanticId: "summary_text" },
    expectedOutcome: "客户摘要内容已读取",
    successCriteria: ["content_read"],
    riskHint: "low",
    fallbackHints: []
  };
}

function stateCommand(desiredChecked: boolean): SemanticCommand {
  return {
    id: "cmd_state",
    type: "ActivateTarget",
    targetGoal: "通知",
    inputs: { controlId: "notifications_switch", desiredState: desiredChecked ? "checked" : "unchecked", desiredChecked },
    expectedOutcome: desiredChecked ? "通知开关开启" : "通知开关关闭",
    successCriteria: ["control_state_matches"],
    riskHint: "low",
    fallbackHints: []
  };
}

function scrollCommand(direction: "up" | "down"): SemanticCommand {
  return {
    id: `cmd_scroll_${direction}`,
    type: "ScrollRegion",
    targetGoal: direction === "up" ? "Scroll up" : "Scroll down",
    inputs: { direction, amount: 720 },
    expectedOutcome: "The viewport scroll position changes in the requested direction.",
    successCriteria: ["viewport_scrolled"],
    riskHint: "low",
    fallbackHints: []
  };
}

function waitCommand(milliseconds = 1000): SemanticCommand {
  return {
    id: "cmd_wait",
    type: "WaitForChange",
    targetGoal: "Wait",
    inputs: { milliseconds },
    expectedOutcome: "The browser waits for the requested duration.",
    successCriteria: ["wait_completed"],
    riskHint: "low",
    fallbackHints: []
  };
}

function dismissCommand(): SemanticCommand {
  return {
    id: "cmd_dismiss",
    type: "ActivateTarget",
    targetGoal: "关闭",
    inputs: { controlId: "modal_close" },
    expectedOutcome: "modal is closed",
    successCriteria: ["target_not_visible"],
    riskHint: "low",
    fallbackHints: []
  };
}

function pageAtScroll(scrollY: number): PageModel {
  return {
    ...pageWithEmail(""),
    viewport: { width: 1280, height: 720, scrollX: 0, scrollY, deviceScaleFactor: 1 }
  };
}

function menuPage(expanded: boolean): PageModel {
  return {
    ...pageWithEmail(""),
    controls: [
      {
        semanticId: "customer_menu",
        role: "menuitem",
        label: "客户管理",
        accessibleName: "客户管理",
        elementTag: "span",
        expandedState: expanded ? "expanded" : "collapsed",
        childRefs: expanded ? ["customer_child"] : [],
        required: false,
        disabled: false,
        visibility: "visible",
        interactionHints: ["menuitem", "pointer"],
        locatorHints: [{ kind: "css", value: "#customer-menu" }],
        confidence: 0.9
      },
      ...(expanded
        ? [
            {
              semanticId: "customer_child",
              role: "menuitem",
              label: "客户",
              accessibleName: "客户",
              elementTag: "li",
              parentRef: "customer_menu",
              required: false,
              disabled: false,
              visibility: "visible" as const,
              interactionHints: ["menuitem"],
              locatorHints: [{ kind: "css" as const, value: "#customer-child" }],
              confidence: 0.86
            }
          ]
        : [])
    ]
  };
}

function statePage(checked: boolean): PageModel {
  return {
    ...pageWithEmail(""),
    controls: [
      {
        semanticId: "notifications_switch",
        role: "switch",
        label: "通知",
        accessibleName: "通知",
        elementTag: "button",
        valueState: checked ? "checked" : "unchecked",
        checked,
        required: false,
        disabled: false,
        visibility: "visible",
        interactionHints: ["switch"],
        locatorHints: [{ kind: "css", value: "#notifications" }],
        confidence: 0.9
      }
    ]
  };
}

function modalClosePage(visible: boolean): PageModel {
  return {
    ...pageWithEmail(""),
    controls: visible
      ? [
          {
            semanticId: "modal_close",
            role: "button",
            label: "关闭",
            accessibleName: "关闭",
            elementTag: "button",
            required: false,
            disabled: false,
            visibility: "visible",
            interactionHints: ["button", "modal"],
            locatorHints: [{ kind: "css", value: ".modal-close" }],
            confidence: 0.9
          }
        ]
      : []
  };
}

describe("verifier, memory, and task interpretation", () => {
  it("verifies field fill by matching control value", () => {
    const result = verifyOutcome({
      command: fillCommand(),
      before: pageWithEmail(""),
      after: pageWithEmail("alice@example.com"),
      primitiveResult: primitive()
    });

    expect(result.status).toBe("success");
    expect(result.satisfiedCriteria).toContain("control_value_matches");
  });

  it("verifies field fill by explicit observed control id across languages", () => {
    const result = verifyOutcome({
      command: fillCommandWithControlId(),
      before: loginPage("empty"),
      after: loginPage("filled"),
      primitiveResult: primitive()
    });

    expect(result.status).toBe("success");
    expect(result.satisfiedCriteria).toContain("control_value_matches");
  });

  it("verifies field fill from primitive value confirmation when observation is not enough", () => {
    const result = verifyOutcome({
      command: fillCommandWithControlId(),
      before: loginPage("empty"),
      after: loginPage("empty"),
      primitiveResult: inputPrimitiveMatches()
    });

    expect(result.status).toBe("success");
    expect(result.satisfiedCriteria).toContain("control_value_matches");
  });

  it("verifies expandable menu state and visible child targets", () => {
    const result = verifyOutcome({
      command: menuCommand(),
      before: menuPage(false),
      after: menuPage(true),
      primitiveResult: primitive()
    });

    expect(result.status).toBe("success");
    expect(result.satisfiedCriteria).toEqual(["menu_expanded", "child_target_visible"]);
  });

  it("verifies collapsed menu state", () => {
    const result = verifyOutcome({
      command: collapsedMenuCommand(),
      before: menuPage(true),
      after: menuPage(false),
      primitiveResult: primitive()
    });

    expect(result.status).toBe("success");
    expect(result.satisfiedCriteria).toEqual(["menu_collapsed"]);
  });

  it("verifies read content from primitive results", () => {
    const result = verifyOutcome({
      command: readContentCommand(),
      before: pageWithEmail(""),
      after: pageWithEmail(""),
      primitiveResult: {
        status: "success",
        details: {
          primitive: "read_content",
          semanticId: "summary_text",
          text: "客户摘要：本月新增 12 人",
          textLength: 16
        }
      }
    });

    expect(result.status).toBe("success");
    expect(result.satisfiedCriteria).toEqual(["content_read"]);
  });

  it("verifies requested state controls from primitive or observation state", () => {
    const primitiveResult = verifyOutcome({
      command: stateCommand(true),
      before: statePage(false),
      after: statePage(false),
      primitiveResult: {
        status: "success",
        details: { primitive: "dom_click", checkedStateAfter: true, valueStateAfter: "checked" }
      }
    });
    expect(primitiveResult.status).toBe("success");
    expect(primitiveResult.satisfiedCriteria).toContain("control_state_matches");

    const observedResult = verifyOutcome({
      command: stateCommand(false),
      before: statePage(true),
      after: statePage(false),
      primitiveResult: primitive()
    });
    expect(observedResult.status).toBe("success");
    expect(observedResult.satisfiedCriteria).toContain("control_state_matches");
  });

  it("verifies dismissed targets when the target is no longer visible", () => {
    const result = verifyOutcome({
      command: dismissCommand(),
      before: modalClosePage(true),
      after: modalClosePage(false),
      primitiveResult: primitive()
    });

    expect(result.status).toBe("success");
    expect(result.satisfiedCriteria).toEqual(["target_not_visible"]);
  });

  it("verifies scroll movement by viewport direction", () => {
    const down = verifyOutcome({
      command: scrollCommand("down"),
      before: pageAtScroll(0),
      after: pageAtScroll(720),
      primitiveResult: primitive()
    });
    const up = verifyOutcome({
      command: scrollCommand("up"),
      before: pageAtScroll(720),
      after: pageAtScroll(120),
      primitiveResult: primitive()
    });

    expect(down.status).toBe("success");
    expect(down.satisfiedCriteria).toEqual(["viewport_scrolled"]);
    expect(up.status).toBe("success");
    expect(up.satisfiedCriteria).toEqual(["viewport_scrolled"]);
  });

  it("verifies scroll and wait from primitive confirmation without a second observation", () => {
    const scroll = verifyOutcome({
      command: scrollCommand("down"),
      before: pageAtScroll(0),
      after: pageAtScroll(0),
      primitiveResult: {
        status: "success",
        details: {
          primitive: "scroll",
          direction: "down",
          amount: 720,
          scrollBeforeY: 0,
          scrollAfterY: 720,
          scrollMoved: true
        }
      }
    });
    const wait = verifyOutcome({
      command: waitCommand(500),
      before: pageWithEmail(""),
      after: pageWithEmail(""),
      primitiveResult: { status: "success", details: { primitive: "wait", milliseconds: 500 } }
    });

    expect(scroll.status).toBe("success");
    expect(scroll.satisfiedCriteria).toEqual(["viewport_scrolled"]);
    expect(wait.status).toBe("success");
    expect(wait.satisfiedCriteria).toEqual(["wait_completed"]);
  });

  it("treats validation feedback after submit as partial progress", () => {
    const submit: SemanticCommand = {
      ...fillCommand(),
      id: "cmd_submit",
      type: "SubmitCurrentForm",
      targetGoal: "current form submit",
      expectedOutcome: "form submitted or validation shown",
      successCriteria: ["submission_feedback_or_validation"],
      riskHint: "medium"
    };

    const result = verifyOutcome({
      command: submit,
      before: pageWithEmail("alice@example.com"),
      after: pageWithEmail("alice@example.com", ["Name is required"]),
      primitiveResult: primitive()
    });

    expect(result.status).toBe("partial");
    expect(result.failureReason).toBe("validation_error");
  });

  it("treats positive submit feedback as success", () => {
    const submit: SemanticCommand = {
      ...fillCommand(),
      id: "cmd_submit_success",
      type: "SubmitCurrentForm",
      targetGoal: "save settings",
      expectedOutcome: "settings saved",
      successCriteria: ["submission_feedback_or_validation"],
      riskHint: "medium"
    };

    const result = verifyOutcome({
      command: submit,
      before: pageWithEmail("alice@example.com"),
      after: pageWithEmail("alice@example.com", ["保存成功"]),
      primitiveResult: primitive()
    });

    expect(result.status).toBe("success");
    expect(result.satisfiedCriteria).toEqual(["submission_feedback_or_validation"]);
    expect(result.newEvidence).toContain("保存成功");
  });

  it("keeps unclassified submit feedback as partial progress", () => {
    const submit: SemanticCommand = {
      ...fillCommand(),
      id: "cmd_submit_unknown",
      type: "SubmitCurrentForm",
      targetGoal: "save settings",
      expectedOutcome: "settings saved",
      successCriteria: ["submission_feedback_or_validation"],
      riskHint: "medium"
    };

    const result = verifyOutcome({
      command: submit,
      before: pageWithEmail("alice@example.com"),
      after: pageWithEmail("alice@example.com", ["处理中"]),
      primitiveResult: primitive()
    });

    expect(result.status).toBe("partial");
    expect(result.failureReason).toBe("submission_feedback_unclassified");
  });

  it("records submit prohibition from task text", () => {
    const frame = interpretTask("Fill this form but do not submit");

    expect(frame.deniedCommandTypes).toContain("SubmitCurrentForm");
    expect(frame.initialProfile).toBe("LightFormProfile");
  });

  it("extracts simple provided values from task text", () => {
    const frame = interpretTask("Set email to alice@example.com and save");

    expect(frame.allowedCommandTypes).toContain("SubmitCurrentForm");
    expect(frame.providedValues.email).toBe("alice@example.com");
  });

  it("stores verified facts and ignores missing kinds", () => {
    const memory = new SessionMemoryStore();
    memory.addFact({
      id: "mem_1",
      kind: "created_record",
      value: { label: "Alice" },
      sourceEvidenceRefs: ["ev_success"],
      confidence: 0.9,
      sensitivity: "public",
      scope: "current_session",
      expiresAt: Date.now() + 60_000
    });

    expect(memory.findByKind("created_record")).toHaveLength(1);
    expect(memory.findByKind("failed_record")).toHaveLength(0);
  });
});
