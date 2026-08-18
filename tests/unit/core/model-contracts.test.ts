import { describe, expect, it } from "vitest";
import { validatePlannerTurn } from "../../../src/core/model/contracts";

describe("planner turn contracts", () => {
  it("accepts a normal command decision", () => {
    const result = validatePlannerTurn({
      taskUnderstanding: "search weather",
      activeSubgoal: "open search results",
      shortPlan: ["navigate", "read result"],
      nextCommand: { type: "NavigateTo", targetGoal: "Baidu weather search", inputs: { url: "https://www.baidu.com/s?wd=南京天气" } },
      expectedOutcome: "search results loaded",
      successCriteria: ["page_changed"],
      riskHint: "low",
      missingInfo: [],
      assumptions: [],
      reasoningSummary: "Search can be opened directly."
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.type).toBe("Command");
      if (result.value.type === "Command") {
        expect(result.value.decision.nextCommand.type).toBe("NavigateTo");
      }
    }
  });

  it("accepts wrapped commandTurn output from the planner prompt schema", () => {
    const result = validatePlannerTurn({
      commandTurn: {
        taskUnderstanding: "search weather",
        activeSubgoal: "open search results",
        shortPlan: ["navigate", "read result"],
        nextCommand: { type: "NavigateTo", targetGoal: "Baidu weather search", inputs: { url: "https://www.baidu.com/s?wd=南京天气" } },
        expectedOutcome: "search results loaded",
        successCriteria: ["page_changed"],
        riskHint: "low",
        missingInfo: [],
        assumptions: [],
        reasoningSummary: "Search can be opened directly."
      }
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.type).toBe("Command");
      if (result.value.type === "Command") {
        expect(result.value.decision.nextCommand.type).toBe("NavigateTo");
      }
    }
  });

  it("accepts a bounded nextCommands batch", () => {
    const result = validatePlannerTurn({
      taskUnderstanding: "log in",
      activeSubgoal: "fill credentials",
      shortPlan: ["fill account", "fill password", "submit"],
      nextCommands: [
        {
          type: "FillField",
          targetGoal: "账号",
          inputs: { controlId: "control_3_textbox_", value: "admin" },
          expectedOutcome: "账号已填写",
          successCriteria: ["control_value_matches"],
          riskHint: "low"
        },
        {
          type: "FillField",
          targetGoal: "密码",
          inputs: { controlId: "control_4_textbox_", value: "123456" },
          expectedOutcome: "密码已填写",
          successCriteria: ["control_value_matches"],
          riskHint: "medium"
        }
      ],
      expectedOutcome: "login form is ready",
      successCriteria: ["control_value_matches"],
      riskHint: "medium",
      missingInfo: [],
      assumptions: [],
      reasoningSummary: "Fill both fields before submitting."
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.value.type === "Command") {
      expect(result.value.decision.nextCommand.type).toBe("FillField");
      expect(result.value.decision.nextCommands).toHaveLength(2);
    }
  });

  it("normalizes batchCommandTurn output when only command items include outcomes", () => {
    const result = validatePlannerTurn({
      type: "batchCommandTurn",
      taskUnderstanding: "进入客户管理",
      activeSubgoal: "打开客户管理菜单",
      shortPlan: ["点击客户管理"],
      nextCommands: [
        {
          type: "ActivateTarget",
          targetGoal: "客户管理",
          inputs: { controlId: "control_14_button_客户管理" },
          expectedOutcome: "页面跳转至客户管理列表页",
          successCriteria: ["page_changed"],
          riskHint: "low"
        }
      ],
      reasoningSummary: "候选控件中存在客户管理按钮，下一步点击它。"
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.value.type === "Command") {
      expect(result.value.decision.expectedOutcome).toBe("页面跳转至客户管理列表页");
      expect(result.value.decision.successCriteria).toEqual(["page_changed"]);
      expect(result.value.decision.nextCommand.targetGoal).toBe("客户管理");
    }
  });

  it("normalizes top-level command target fields into inputs", () => {
    const result = validatePlannerTurn({
      taskUnderstanding: "保存",
      activeSubgoal: "点击指定保存按钮",
      shortPlan: ["点击保存"],
      nextCommand: {
        type: "ActivateTarget",
        targetGoal: "Save",
        controlId: "save_bottom",
        semanticId: "save_bottom",
        expectedOutcome: "保存按钮被点击",
        successCriteria: ["target_visible"],
        riskHint: "low"
      },
      expectedOutcome: "保存按钮被点击",
      successCriteria: ["target_visible"],
      riskHint: "low",
      missingInfo: [],
      assumptions: [],
      reasoningSummary: "模型把控件 ID 放在命令顶层，也应被保留。"
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.value.type === "Command") {
      expect(result.value.decision.nextCommand.inputs).toEqual(
        expect.objectContaining({
          controlId: "save_bottom",
          semanticId: "save_bottom"
        })
      );
    }
  });

  it("fills missing command targetGoal from descriptive target fields", () => {
    const result = validatePlannerTurn({
      taskUnderstanding: "打开客户菜单",
      activeSubgoal: "点击客户管理",
      shortPlan: ["点击客户管理"],
      nextCommand: {
        type: "ActivateTarget",
        label: "客户管理",
        controlId: "control_14_button_客户管理",
        expectedOutcome: "客户菜单被打开",
        successCriteria: ["target_visible"],
        riskHint: "low"
      },
      expectedOutcome: "客户菜单被打开",
      successCriteria: ["target_visible"],
      riskHint: "low",
      missingInfo: [],
      assumptions: [],
      reasoningSummary: "模型可能只输出 label 和 controlId。"
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.value.type === "Command") {
      expect(result.value.decision.nextCommand.targetGoal).toBe("客户管理");
      expect(result.value.decision.nextCommand.inputs).toEqual(
        expect.objectContaining({
          label: "客户管理",
          controlId: "control_14_button_客户管理"
        })
      );
    }
  });

  it("accepts command aliases and target id aliases from model output", () => {
    const result = validatePlannerTurn({
      taskUnderstanding: "保存",
      activeSubgoal: "点击指定保存按钮",
      shortPlan: ["点击保存"],
      command: {
        type: "click",
        label: "Save",
        elementId: "save_bottom",
        expectedOutcome: "保存按钮被点击",
        successCriteria: ["target_visible"],
        riskHint: "low"
      },
      reasoningSummary: "模型可能输出 command/type=click/elementId。"
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.value.type === "Command") {
      expect(result.value.decision.nextCommand).toEqual(
        expect.objectContaining({
          type: "ActivateTarget",
          targetGoal: "Save",
          inputs: expect.objectContaining({ controlId: "save_bottom", label: "Save" })
        })
      );
      expect(result.value.decision.expectedOutcome).toBe("保存按钮被点击");
      expect(result.value.decision.successCriteria).toEqual(["target_visible"]);
    }
  });

  it("accepts commands batch aliases and snake_case input aliases", () => {
    const result = validatePlannerTurn({
      taskUnderstanding: "填写登录表单",
      activeSubgoal: "填账号密码",
      shortPlan: ["填账号", "填密码"],
      commands: [
        {
          type: "fill",
          targetLabel: "账号",
          control_id: "control_3_textbox_",
          inputValue: "admin",
          expectedOutcome: "账号已填写",
          successCriteria: ["control_value_matches"],
          riskHint: "low"
        },
        {
          type: "fill",
          targetLabel: "密码",
          semantic_id: "control_4_textbox_",
          input_value: "123456",
          expectedOutcome: "密码已填写",
          successCriteria: ["control_value_matches"],
          riskHint: "medium"
        }
      ],
      reasoningSummary: "模型可能输出 commands 和 snake_case 字段。"
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.value.type === "Command") {
      expect(result.value.decision.nextCommands).toEqual([
        expect.objectContaining({
          type: "FillField",
          targetGoal: "账号",
          inputs: expect.objectContaining({ controlId: "control_3_textbox_", value: "admin" })
        }),
        expect.objectContaining({
          type: "FillField",
          targetGoal: "密码",
          inputs: expect.objectContaining({ semanticId: "control_4_textbox_", value: "123456" })
        })
      ]);
      expect(result.value.decision.expectedOutcome).toBe("密码已填写");
    }
  });

  it("accepts formatted semantic command type variants", () => {
    const result = validatePlannerTurn({
      taskUnderstanding: "填写后打开页面",
      activeSubgoal: "处理两个格式化命令类型",
      shortPlan: ["填邮箱", "打开登录页"],
      commands: [
        {
          type: "Fill Field",
          targetLabel: "邮箱",
          element_id: "email_field",
          input_value: "ada@example.test",
          expectedOutcome: "邮箱已填写",
          successCriteria: ["control_value_matches"],
          riskHint: "low"
        },
        {
          type: "Navigate To",
          url: "https://example.test/login",
          expectedOutcome: "登录页打开",
          successCriteria: ["page_changed"],
          riskHint: "low"
        }
      ],
      reasoningSummary: "模型可能输出带空格的语义命令类型。"
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.value.type === "Command") {
      expect(result.value.decision.nextCommands).toEqual([
        expect.objectContaining({
          type: "FillField",
          targetGoal: "邮箱",
          inputs: expect.objectContaining({ controlId: "email_field", value: "ada@example.test" })
        }),
        expect.objectContaining({
          type: "NavigateTo",
          targetGoal: "https://example.test/login",
          inputs: expect.objectContaining({ url: "https://example.test/login" })
        })
      ]);
    }
  });

  it("accepts snake_case semantic command type variants", () => {
    const result = validatePlannerTurn({
      taskUnderstanding: "点击保存",
      activeSubgoal: "保存",
      shortPlan: ["点击保存"],
      command: {
        type: "activate_target",
        label: "Save",
        elementId: "save_bottom",
        expectedOutcome: "保存按钮被点击",
        successCriteria: ["target_visible"],
        riskHint: "low"
      },
      reasoningSummary: "模型可能输出 snake_case 语义命令类型。"
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.value.type === "Command") {
      expect(result.value.decision.nextCommand).toEqual(
        expect.objectContaining({
          type: "ActivateTarget",
          targetGoal: "Save",
          inputs: expect.objectContaining({ controlId: "save_bottom" })
        })
      );
    }
  });

  it("normalizes natural-language success criteria aliases", () => {
    const result = validatePlannerTurn({
      taskUnderstanding: "填写邮箱",
      activeSubgoal: "填写邮箱字段",
      shortPlan: ["输入邮箱"],
      command: {
        type: "fill",
        targetLabel: "邮箱",
        elementId: "email_field",
        inputValue: "ada@example.test",
        expectedOutcome: "邮箱已填写",
        successCriteria: ["field filled", "value matches", "field_filled"],
        riskHint: "low"
      },
      reasoningSummary: "模型可能输出自然语言成功标准。"
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.value.type === "Command") {
      expect(result.value.decision.nextCommand.successCriteria).toEqual(["control_value_matches"]);
      expect(result.value.decision.successCriteria).toEqual(["control_value_matches"]);
    }
  });

  it("accepts control state match success criteria", () => {
    const result = validatePlannerTurn({
      taskUnderstanding: "开启通知",
      activeSubgoal: "打开通知开关",
      shortPlan: ["点击通知开关"],
      command: {
        type: "activate_target",
        targetGoal: "通知",
        inputs: { controlId: "notifications_switch", desiredState: "checked" },
        expectedOutcome: "通知开关开启",
        successCriteria: ["switch state"],
        riskHint: "low"
      },
      reasoningSummary: "模型可能输出状态型控件成功标准。"
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.value.type === "Command") {
      expect(result.value.decision.nextCommand.successCriteria).toEqual(["control_state_matches"]);
      expect(result.value.decision.successCriteria).toEqual(["control_state_matches"]);
    }
  });

  it("normalizes page and menu success criteria aliases", () => {
    const result = validatePlannerTurn({
      taskUnderstanding: "打开菜单",
      activeSubgoal: "展开客户菜单",
      shortPlan: ["点击客户管理"],
      command: {
        type: "activate_target",
        label: "客户管理",
        elementId: "customer_menu",
        expectedOutcome: "客户菜单展开",
        successCriteria: ["menu opened", "child visible"],
        riskHint: "low"
      },
      reasoningSummary: "模型可能输出菜单自然语言成功标准。"
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.value.type === "Command") {
      expect(result.value.decision.nextCommand.successCriteria).toEqual(["menu_expanded", "child_target_visible"]);
      expect(result.value.decision.successCriteria).toEqual(["menu_expanded", "child_target_visible"]);
    }
  });

  it("normalizes collapsed menu success criteria aliases", () => {
    const result = validatePlannerTurn({
      taskUnderstanding: "收起菜单",
      activeSubgoal: "收起客户菜单",
      shortPlan: ["点击客户管理"],
      command: {
        type: "activate_target",
        label: "客户管理",
        elementId: "customer_menu",
        expectedOutcome: "客户菜单收起",
        successCriteria: ["menu closed", "collapsed"],
        riskHint: "low"
      },
      reasoningSummary: "模型可能输出收起菜单的自然语言成功标准。"
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.value.type === "Command") {
      expect(result.value.decision.nextCommand.successCriteria).toEqual(["menu_collapsed"]);
      expect(result.value.decision.successCriteria).toEqual(["menu_collapsed"]);
    }
  });

  it("normalizes read content success criteria aliases", () => {
    const result = validatePlannerTurn({
      taskUnderstanding: "读取页面摘要",
      activeSubgoal: "读取客户摘要",
      shortPlan: ["读取客户摘要区域"],
      command: {
        type: "read",
        targetGoal: "客户摘要",
        inputs: { semanticId: "summary_text" },
        expectedOutcome: "客户摘要内容已读取",
        successCriteria: ["read content", "text read"],
        riskHint: "low"
      },
      reasoningSummary: "模型可能输出读取内容的自然语言成功标准。"
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.value.type === "Command") {
      expect(result.value.decision.nextCommand.type).toBe("ReadContent");
      expect(result.value.decision.nextCommand.successCriteria).toEqual(["content_read"]);
      expect(result.value.decision.successCriteria).toEqual(["content_read"]);
    }
  });

  it("normalizes scroll and wait success criteria aliases", () => {
    const scroll = validatePlannerTurn({
      taskUnderstanding: "滚动页面",
      activeSubgoal: "下滚页面",
      shortPlan: ["scroll"],
      command: {
        type: "scroll",
        targetGoal: "Scroll down",
        inputs: { direction: "down", amount: 600 },
        expectedOutcome: "viewport moved",
        successCriteria: ["scrolled", "viewport moved"],
        riskHint: "low"
      },
      reasoningSummary: "模型可能输出滚动成功标准。"
    });
    const wait = validatePlannerTurn({
      taskUnderstanding: "等待页面稳定",
      activeSubgoal: "等待",
      shortPlan: ["wait"],
      command: {
        type: "wait",
        targetGoal: "Wait",
        inputs: { milliseconds: 500 },
        expectedOutcome: "waited",
        successCriteria: ["waited", "wait complete"],
        riskHint: "low"
      },
      reasoningSummary: "模型可能输出等待成功标准。"
    });

    expect(scroll.ok).toBe(true);
    if (scroll.ok && scroll.value.type === "Command") {
      expect(scroll.value.decision.nextCommand.successCriteria).toEqual(["viewport_scrolled"]);
    }
    expect(wait.ok).toBe(true);
    if (wait.ok && wait.value.type === "Command") {
      expect(wait.value.decision.nextCommand.successCriteria).toEqual(["wait_completed"]);
    }
  });

  it("falls back to command defaults when criteria aliases are unknown", () => {
    const result = validatePlannerTurn({
      taskUnderstanding: "点击保存",
      activeSubgoal: "保存",
      shortPlan: ["点击保存"],
      command: {
        type: "click",
        label: "Save",
        elementId: "save_bottom",
        expectedOutcome: "保存完成",
        successCriteria: ["save completed somehow"],
        riskHint: "low"
      },
      reasoningSummary: "未知成功标准应落回命令默认标准。"
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.value.type === "Command") {
      expect(result.value.decision.nextCommand.successCriteria).toBeUndefined();
      expect(result.value.decision.successCriteria).toEqual(["target_visible"]);
    }
  });

  it("rejects nextCommands batches over three actions", () => {
    const result = validatePlannerTurn({
      taskUnderstanding: "too many",
      activeSubgoal: "batch",
      shortPlan: ["1", "2", "3", "4"],
      nextCommands: [
        { type: "WaitForChange", targetGoal: "wait", inputs: { milliseconds: 1 } },
        { type: "WaitForChange", targetGoal: "wait", inputs: { milliseconds: 1 } },
        { type: "WaitForChange", targetGoal: "wait", inputs: { milliseconds: 1 } },
        { type: "WaitForChange", targetGoal: "wait", inputs: { milliseconds: 1 } }
      ],
      expectedOutcome: "waited",
      successCriteria: ["target_visible"],
      riskHint: "low",
      missingInfo: [],
      assumptions: [],
      reasoningSummary: "Too many actions."
    });

    expect(result.ok).toBe(false);
  });

  it("accepts direct semantic command turns from OpenAI-compatible planners", () => {
    const result = validatePlannerTurn({
      type: "NavigateTo",
      targetGoal: "Navigate to the login page of the target website",
      inputs: {
        url: "http://116.205.97.39:8201/#/login"
      },
      expectedOutcome: "The browser loads the login page.",
      successCriteria: ["page_changed"],
      riskHint: "low",
      reasoningSummary: "Open the target URL first."
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.type).toBe("Command");
      if (result.value.type === "Command") {
        expect(result.value.decision.nextCommand).toEqual({
          type: "NavigateTo",
          targetGoal: "Navigate to the login page of the target website",
          inputs: {
            url: "http://116.205.97.39:8201/#/login"
          }
        });
        expect(result.value.decision.reasoningSummary).toBe("Open the target URL first.");
      }
    }
  });

  it("still rejects primitive command types after alias normalization", () => {
    const result = validatePlannerTurn({
      taskUnderstanding: "bad primitive",
      activeSubgoal: "click",
      shortPlan: ["click"],
      command: {
        type: "dom_click",
        semanticId: "save_bottom"
      },
      expectedOutcome: "clicked",
      successCriteria: ["target_visible"],
      riskHint: "low",
      missingInfo: [],
      assumptions: [],
      reasoningSummary: "Primitive output must stay invalid."
    });

    expect(result.ok).toBe(false);
  });

  it("normalizes top-level fields on direct semantic command turns", () => {
    const result = validatePlannerTurn({
      type: "FillField",
      targetGoal: "邮箱",
      controlId: "email_field",
      value: "ada@example.test",
      expectedOutcome: "邮箱已填写",
      successCriteria: ["control_value_matches"],
      riskHint: "low",
      taskUnderstanding: "填写邮箱",
      activeSubgoal: "填写邮箱",
      shortPlan: ["输入邮箱"],
      missingInfo: [],
      assumptions: [],
      reasoningSummary: "直接语义命令也可能把输入字段放在顶层。"
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.value.type === "Command") {
      expect(result.value.decision.nextCommand.inputs).toEqual(
        expect.objectContaining({
          controlId: "email_field",
          value: "ada@example.test"
        })
      );
    }
  });

  it("fills missing direct semantic command targetGoal from inputs", () => {
    const result = validatePlannerTurn({
      type: "NavigateTo",
      url: "https://example.test/login",
      expectedOutcome: "登录页打开",
      successCriteria: ["page_changed"],
      riskHint: "low",
      reasoningSummary: "模型可能把 URL 放在顶层。"
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.value.type === "Command") {
      expect(result.value.decision.nextCommand).toEqual({
        type: "NavigateTo",
        targetGoal: "https://example.test/login",
        inputs: { url: "https://example.test/login" }
      });
    }
  });

  it("accepts wrapped non-command turn outputs from the planner prompt schema", () => {
    const observation = validatePlannerTurn({
      needMoreObservationTurn: {
        reason: "Need page content",
        query: "天气",
        scope: "main_content",
        expand: ["nearby_text"]
      }
    });
    const ask = validatePlannerTurn({
      askUserTurn: {
        question: "请选择搜索引擎",
        options: ["百度", "Google"],
        reason: "用户没有指定"
      }
    });
    const finish = validatePlannerTurn({
      finishTaskTurn: {
        summary: "任务完成",
        evidenceRefs: ["e1"]
      }
    });

    expect(observation.ok).toBe(true);
    expect(ask.ok).toBe(true);
    expect(finish.ok).toBe(true);
  });

  it("accepts a request for more observation", () => {
    const result = validatePlannerTurn({
      type: "NeedMoreObservation",
      reason: "Need sidebar candidates",
      query: "订单 管理",
      scope: "sidebar",
      expand: ["more_candidates", "nearby_text"],
      preferredRoles: ["link", "button"],
      targetTextHints: ["订单管理"]
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.type).toBe("NeedMoreObservation");
      if (result.value.type === "NeedMoreObservation") {
        expect(result.value.request.scope).toBe("sidebar");
      }
    }
  });

  it("accepts listitem as a preferred observation role", () => {
    const result = validatePlannerTurn({
      type: "NeedMoreObservation",
      reason: "Need submenu candidates",
      query: "客户",
      scope: "sidebar",
      expand: ["hidden_menus", "nearby_text"],
      preferredRoles: ["menuitem", "listitem"],
      targetTextHints: ["客户"]
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.value.type === "NeedMoreObservation") {
      expect(result.value.request.preferredRoles).toEqual(["menuitem", "listitem"]);
    }
  });

  it("accepts table and grid as preferred observation roles", () => {
    const result = validatePlannerTurn({
      type: "NeedMoreObservation",
      reason: "Need table candidates",
      query: "客户 列表",
      scope: "full_page",
      expand: ["tables", "more_candidates"],
      preferredRoles: ["table", "grid", "button"],
      targetTextHints: ["客户", "详情"]
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.value.type === "NeedMoreObservation") {
      expect(result.value.request.preferredRoles).toEqual(["table", "grid", "button"]);
    }
  });

  it("preserves ambiguous observation candidate hints", () => {
    const result = validatePlannerTurn({
      type: "NeedMoreObservation",
      reason: "Need disambiguation",
      query: "Save",
      scope: "full_page",
      expand: ["more_candidates"],
      preferredRoles: ["button"],
      targetTextHints: ["Save", "save_bottom"],
      ambiguousCandidates: [
        { semanticId: "save_top", label: "Save", role: "button", regionRef: "main_content", confidence: 0.9 },
        { semanticId: "save_bottom", label: "Save", role: "button", regionRef: "main_content", confidence: 0.88 }
      ]
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.value.type === "NeedMoreObservation") {
      expect(result.value.request.ambiguousCandidates).toEqual([
        expect.objectContaining({ semanticId: "save_top", label: "Save", role: "button" }),
        expect.objectContaining({ semanticId: "save_bottom", label: "Save", role: "button" })
      ]);
    }
  });

  it("accepts AskUser and FinishTask turns", () => {
    const ask = validatePlannerTurn({ type: "AskUser", question: "请选择账号", options: ["A", "B"], reason: "页面有多个账号" });
    const finish = validatePlannerTurn({ type: "FinishTask", summary: "南京今天有雨。", evidenceRefs: ["e1"] });

    expect(ask.ok).toBe(true);
    expect(finish.ok).toBe(true);
  });

  it("rejects invalid observation scope", () => {
    const result = validatePlannerTurn({
      type: "NeedMoreObservation",
      reason: "Need more",
      scope: "everything"
    });

    expect(result.ok).toBe(false);
  });
});
