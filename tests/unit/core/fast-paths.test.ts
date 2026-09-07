import { describe, expect, it } from "vitest";
import type { ControlCandidate } from "../../../src/core/observation/page-model";
import { detectFastPath } from "../../../src/core/runtime/fast-paths";

function control(overrides: Partial<ControlCandidate>): ControlCandidate {
  return {
    semanticId: "control_1",
    role: "button",
    label: "Settings",
    accessibleName: "Settings",
    elementTag: "button",
    disabled: false,
    required: false,
    visibility: "visible",
    interactionHints: ["button"],
    locatorHints: [],
    confidence: 0.92,
    ...overrides
  };
}

describe("runtime fast paths", () => {
  it("navigates explicit URLs without planner call", () => {
    const decision = detectFastPath({
      taskText: "打开 https://example.com/customers",
      pageUrl: "chrome://newtab/",
      controls: [],
      actionMemory: []
    });

    expect(decision).toMatchObject({
      source: "explicit_url",
      command: { type: "NavigateTo", inputs: { url: "https://example.com/customers" } }
    });
  });

  it("normalizes bare domains into URL navigation without planner call", () => {
    const decision = detectFastPath({
      taskText: "访问 example.com/customers",
      pageUrl: "chrome://newtab/",
      controls: [],
      actionMemory: []
    });

    expect(decision).toMatchObject({
      source: "explicit_url",
      command: { type: "NavigateTo", inputs: { url: "https://example.com/customers" } }
    });
  });

  it("opens explicit URLs in a new tab without planner call when requested", () => {
    const decision = detectFastPath({
      taskText: "在新标签页打开 https://example.com/customers",
      pageUrl: "https://example.com/dashboard",
      controls: [],
      actionMemory: []
    });

    expect(decision).toMatchObject({
      source: "explicit_new_tab_url",
      command: {
        type: "OpenTab",
        inputs: { url: "https://example.com/customers", active: true },
        successCriteria: ["page_changed"]
      }
    });
  });

  it("presses explicit keyboard keys without planner call", () => {
    const decision = detectFastPath({
      taskText: "按回车",
      pageUrl: "https://example.com/form",
      controls: [],
      actionMemory: []
    });

    expect(decision).toMatchObject({
      source: "explicit_key_press",
      command: {
        type: "PressKey",
        inputs: { key: "Enter" },
        successCriteria: ["key_pressed"]
      }
    });
  });

  it("does not turn negative keyboard instructions into key fast paths", () => {
    const decision = detectFastPath({
      taskText: "不要按回车，先看一下页面",
      pageUrl: "https://example.com/form",
      controls: [],
      actionMemory: []
    });

    expect(decision).toBeUndefined();
  });

  it("navigates explicit same-origin URLs when the path changes", () => {
    const decision = detectFastPath({
      taskText: "打开 https://example.com/customers",
      pageUrl: "https://example.com/dashboard",
      controls: [],
      actionMemory: []
    });

    expect(decision).toMatchObject({
      source: "explicit_url",
      command: { type: "NavigateTo", inputs: { url: "https://example.com/customers" } }
    });
  });

  it("does not repeat URL navigation when already at the target URL", () => {
    const decision = detectFastPath({
      taskText: "打开 example.com/customers",
      pageUrl: "https://example.com/customers",
      controls: [],
      actionMemory: []
    });

    expect(decision).toBeUndefined();
  });

  it("does not treat a bare domain mention as navigation without open intent", () => {
    const decision = detectFastPath({
      taskText: "把 example.com 填入输入框",
      pageUrl: "https://workspace.example.test/",
      controls: [],
      actionMemory: []
    });

    expect(decision).toBeUndefined();
  });

  it("opens a web search results page without planner call on browser pages", () => {
    const decision = detectFastPath({
      taskText: "搜索 南京天气",
      pageUrl: "chrome://newtab/",
      controls: [],
      actionMemory: []
    });

    expect(decision).toMatchObject({
      source: "web_search",
      command: {
        type: "NavigateTo",
        targetGoal: "Search 南京天气",
        inputs: { url: "https://www.google.com/search?q=%E5%8D%97%E4%BA%AC%E5%A4%A9%E6%B0%94" }
      }
    });
  });

  it("selects a unique visible selector option without planner call", () => {
    const decision = detectFastPath({
      taskText: "把状态选择为启用",
      pageUrl: "https://app.example.test/settings",
      controls: [
        control({
          semanticId: "status_select",
          role: "combobox",
          label: "状态",
          accessibleName: "状态",
          elementTag: "select",
          controlType: "select-one",
          interactionHints: ["select-one"]
        })
      ],
      actionMemory: []
    });

    expect(decision).toMatchObject({
      source: "exact_visible_select",
      command: {
        type: "SelectOption",
        inputs: { semanticId: "status_select", value: "启用" },
        successCriteria: ["control_value_matches"]
      }
    });
  });

  it("does not select options from negative instructions", () => {
    const decision = detectFastPath({
      taskText: "不要把状态选择为启用",
      pageUrl: "https://app.example.test/settings",
      controls: [
        control({
          semanticId: "status_select",
          role: "combobox",
          label: "状态",
          accessibleName: "状态",
          elementTag: "select",
          controlType: "select-one",
          interactionHints: ["select-one"]
        })
      ],
      actionMemory: []
    });

    expect(decision).toBeUndefined();
  });

  it("sets a unique visible state control without planner call", () => {
    const decision = detectFastPath({
      taskText: "打开通知开关",
      pageUrl: "https://app.example.test/settings",
      controls: [
        control({
          semanticId: "notifications_switch",
          role: "switch",
          label: "通知",
          accessibleName: "通知",
          elementTag: "button",
          valueState: "unchecked",
          checked: false,
          interactionHints: ["switch"]
        })
      ],
      actionMemory: []
    });

    expect(decision).toMatchObject({
      source: "exact_visible_state_control",
      command: {
        type: "ActivateTarget",
        inputs: { semanticId: "notifications_switch", desiredState: "checked", desiredChecked: true },
        successCriteria: ["control_state_matches"]
      }
    });
  });

  it("does not click state controls when the observed state already matches", () => {
    const decision = detectFastPath({
      taskText: "打开通知开关",
      pageUrl: "https://app.example.test/settings",
      controls: [
        control({
          semanticId: "notifications_switch",
          role: "switch",
          label: "通知",
          accessibleName: "通知",
          elementTag: "button",
          valueState: "checked",
          checked: true,
          interactionHints: ["switch"]
        })
      ],
      actionMemory: []
    });

    expect(decision).toBeUndefined();
  });

  it("turns off a unique visible checked state control without planner call", () => {
    const decision = detectFastPath({
      taskText: "关闭通知开关",
      pageUrl: "https://app.example.test/settings",
      controls: [
        control({
          semanticId: "notifications_switch",
          role: "switch",
          label: "通知",
          accessibleName: "通知",
          elementTag: "button",
          valueState: "checked",
          checked: true,
          interactionHints: ["switch"]
        })
      ],
      actionMemory: []
    });

    expect(decision).toMatchObject({
      source: "exact_visible_state_control",
      command: {
        type: "ActivateTarget",
        inputs: { semanticId: "notifications_switch", desiredState: "unchecked", desiredChecked: false },
        successCriteria: ["control_state_matches"]
      }
    });
  });

  it("dismisses a unique visible close control without planner call", () => {
    const decision = detectFastPath({
      taskText: "关闭弹窗",
      pageUrl: "https://app.example.test/dashboard",
      controls: [
        control({
          semanticId: "modal_close",
          role: "button",
          label: "关闭",
          accessibleName: "关闭",
          elementTag: "button",
          interactionHints: ["button", "modal"]
        })
      ],
      actionMemory: []
    });

    expect(decision).toMatchObject({
      source: "visible_dismiss_control",
      command: {
        type: "ActivateTarget",
        inputs: { semanticId: "modal_close", intent: "dismiss" },
        successCriteria: ["target_not_visible"],
        riskHint: "low"
      }
    });
  });

  it("keeps close-state control requests ahead of dismiss controls", () => {
    const decision = detectFastPath({
      taskText: "关闭通知开关",
      pageUrl: "https://app.example.test/settings",
      controls: [
        control({
          semanticId: "notifications_switch",
          role: "switch",
          label: "通知",
          accessibleName: "通知",
          elementTag: "button",
          valueState: "checked",
          checked: true,
          interactionHints: ["switch"]
        }),
        control({
          semanticId: "modal_close",
          role: "button",
          label: "关闭",
          accessibleName: "关闭",
          elementTag: "button"
        })
      ],
      actionMemory: []
    });

    expect(decision).toMatchObject({
      source: "exact_visible_state_control",
      command: {
        inputs: { semanticId: "notifications_switch", desiredChecked: false }
      }
    });
  });

  it("does not dismiss when close or cancel controls are ambiguous", () => {
    const decision = detectFastPath({
      taskText: "取消",
      pageUrl: "https://app.example.test/settings",
      controls: [
        control({ semanticId: "cancel_top", role: "button", label: "取消", accessibleName: "取消", elementTag: "button" }),
        control({ semanticId: "cancel_bottom", role: "button", label: "取消", accessibleName: "取消", elementTag: "button" })
      ],
      actionMemory: []
    });

    expect(decision).toBeUndefined();
  });

  it("respects explicit search engine hints for web search fast paths", () => {
    const decision = detectFastPath({
      taskText: "百度搜索 南京天气",
      pageUrl: "about:blank",
      controls: [],
      actionMemory: []
    });

    expect(decision).toMatchObject({
      source: "web_search",
      command: {
        type: "NavigateTo",
        inputs: { url: "https://www.baidu.com/s?wd=%E5%8D%97%E4%BA%AC%E5%A4%A9%E6%B0%94" }
      }
    });
  });

  it("does not turn app-local search controls into web search navigation", () => {
    const decision = detectFastPath({
      taskText: "搜索客户",
      pageUrl: "https://workspace.example.test/",
      controls: [
        control({
          semanticId: "customer_search",
          role: "searchbox",
          label: "客户搜索",
          accessibleName: "客户搜索",
          interactionHints: ["searchbox"]
        })
      ],
      actionMemory: []
    });

    expect(decision?.source).not.toBe("web_search");
    expect(decision).toMatchObject({
      source: "single_search_field_enter",
      command: { type: "FillField", inputs: { semanticId: "customer_search", value: "客户" } }
    });
  });

  it("submits a unique visible page search form without planner call", () => {
    const decision = detectFastPath({
      taskText: "搜索客户",
      pageUrl: "https://app.example.test/list",
      controls: [
        control({
          semanticId: "keyword_field",
          role: "searchbox",
          label: "关键词",
          accessibleName: "关键词",
          elementTag: "input",
          controlType: "search",
          formRef: "search_form",
          valueState: "empty",
          interactionHints: ["searchbox", "textbox"]
        }),
        control({
          semanticId: "search_submit",
          role: "button",
          label: "搜索",
          accessibleName: "搜索",
          elementTag: "button",
          formRef: "search_form",
          interactionHints: ["button", "submit"]
        })
      ],
      forms: [
        {
          semanticId: "search_form",
          label: "列表搜索",
          controlRefs: ["keyword_field", "search_submit"],
          controlLabels: ["关键词", "搜索"],
          requiredControlRefs: [],
          requiredControlLabels: [],
          submitControlRefs: ["search_submit"],
          submitControlLabels: ["搜索"],
          locatorHints: [],
          confidence: 0.92
        }
      ],
      actionMemory: []
    });

    expect(decision).toMatchObject({
      source: "exact_visible_search_form",
      command: { type: "FillField", inputs: { semanticId: "keyword_field", value: "客户" } },
      commands: [
        { type: "FillField", inputs: { semanticId: "keyword_field", value: "客户" } },
        {
          type: "SubmitCurrentForm",
          inputs: { semanticId: "search_submit", intent: "search", query: "客户" },
          successCriteria: ["submission_feedback_or_validation"]
        }
      ]
    });
  });

  it("submits a single visible search field with Enter when no submit control is available", () => {
    const decision = detectFastPath({
      taskText: "搜索客户",
      pageUrl: "https://app.example.test/list",
      controls: [
        control({
          semanticId: "keyword_field",
          role: "searchbox",
          label: "搜索",
          accessibleName: "搜索",
          elementTag: "input",
          controlType: "search",
          valueState: "empty",
          interactionHints: ["searchbox", "textbox"]
        })
      ],
      actionMemory: []
    });

    expect(decision).toMatchObject({
      source: "single_search_field_enter",
      command: { type: "FillField", inputs: { semanticId: "keyword_field", value: "客户" } },
      commands: [
        { type: "FillField", inputs: { semanticId: "keyword_field", value: "客户" } },
        { type: "PressKey", inputs: { key: "Enter", intent: "search", query: "客户" } }
      ]
    });
  });

  it("does not submit ambiguous search fields with Enter", () => {
    const decision = detectFastPath({
      taskText: "搜索客户",
      pageUrl: "https://app.example.test/list",
      controls: [
        control({
          semanticId: "header_search",
          role: "searchbox",
          label: "搜索",
          accessibleName: "搜索",
          elementTag: "input",
          controlType: "search",
          interactionHints: ["searchbox", "textbox"]
        }),
        control({
          semanticId: "table_search",
          role: "searchbox",
          label: "搜索",
          accessibleName: "搜索",
          elementTag: "input",
          controlType: "search",
          interactionHints: ["searchbox", "textbox"]
        })
      ],
      actionMemory: []
    });

    expect(decision).toBeUndefined();
  });

  it("submits a unique visible save control without planner call", () => {
    const decision = detectFastPath({
      taskText: "保存配置",
      pageUrl: "https://app.example.test/settings",
      controls: [
        control({
          semanticId: "cancel_button",
          role: "button",
          label: "取消",
          accessibleName: "取消",
          elementTag: "button"
        }),
        control({
          semanticId: "save_settings",
          role: "button",
          label: "保存",
          accessibleName: "保存",
          elementTag: "button",
          controlType: "submit",
          formRef: "settings_form",
          interactionHints: ["button", "submit"]
        })
      ],
      forms: [
        {
          semanticId: "settings_form",
          label: "设置",
          controlRefs: ["save_settings"],
          controlLabels: ["保存"],
          requiredControlRefs: [],
          requiredControlLabels: [],
          submitControlRefs: ["save_settings"],
          submitControlLabels: ["保存"],
          locatorHints: [],
          confidence: 0.94
        }
      ],
      actionMemory: []
    });

    expect(decision).toMatchObject({
      source: "exact_visible_submit_control",
      command: {
        type: "SubmitCurrentForm",
        targetGoal: "保存",
        inputs: { semanticId: "save_settings", label: "保存", formRef: "settings_form", intent: "save_submit_confirm" },
        successCriteria: ["submission_feedback_or_validation"],
        riskHint: "medium"
      }
    });
  });

  it("does not submit save-like controls when the match is ambiguous", () => {
    const decision = detectFastPath({
      taskText: "保存",
      pageUrl: "https://app.example.test/settings",
      controls: [
        control({ semanticId: "save", role: "button", label: "保存", accessibleName: "保存", elementTag: "button" }),
        control({ semanticId: "save_and_continue", role: "button", label: "保存并继续", accessibleName: "保存并继续", elementTag: "button" })
      ],
      actionMemory: []
    });

    expect(decision).toBeUndefined();
  });

  it("does not turn negative save requests into submit fast paths", () => {
    const decision = detectFastPath({
      taskText: "不要保存配置，先检查一下",
      pageUrl: "https://app.example.test/settings",
      controls: [control({ semanticId: "save_settings", role: "button", label: "保存", accessibleName: "保存", elementTag: "button" })],
      actionMemory: []
    });

    expect(decision).toBeUndefined();
  });

  it("fills a unique visible text field without planner call", () => {
    const decision = detectFastPath({
      taskText: "在邮箱输入 ada@example.test",
      pageUrl: "https://app.example.test/profile",
      controls: [
        control({
          semanticId: "email_field",
          role: "textbox",
          label: "邮箱",
          accessibleName: "邮箱",
          elementTag: "input",
          valueState: "empty",
          interactionHints: ["textbox"]
        })
      ],
      actionMemory: []
    });

    expect(decision).toMatchObject({
      source: "exact_visible_field",
      command: {
        type: "FillField",
        targetGoal: "邮箱",
        inputs: { semanticId: "email_field", value: "ada@example.test" },
        successCriteria: ["control_value_matches"]
      }
    });
  });

  it("clears a unique visible text field without planner call", () => {
    const decision = detectFastPath({
      taskText: "清空邮箱输入框",
      pageUrl: "https://app.example.test/profile",
      controls: [
        control({
          semanticId: "email_field",
          role: "textbox",
          label: "邮箱",
          accessibleName: "邮箱",
          elementTag: "input",
          valueState: "filled",
          interactionHints: ["textbox"]
        })
      ],
      actionMemory: []
    });

    expect(decision).toMatchObject({
      source: "exact_visible_field_clear",
      command: {
        type: "FillField",
        targetGoal: "邮箱",
        inputs: { semanticId: "email_field", label: "邮箱", value: "", intent: "clear_field" },
        successCriteria: ["control_value_matches"]
      }
    });
  });

  it("clears the only visible editable field for generic clear requests", () => {
    const decision = detectFastPath({
      taskText: "清空输入框",
      pageUrl: "https://app.example.test/profile",
      controls: [
        control({
          semanticId: "name_field",
          role: "textbox",
          label: "姓名",
          accessibleName: "姓名",
          elementTag: "input",
          valueState: "filled",
          interactionHints: ["textbox"]
        })
      ],
      actionMemory: []
    });

    expect(decision).toMatchObject({
      source: "exact_visible_field_clear",
      command: {
        type: "FillField",
        inputs: { semanticId: "name_field", value: "", intent: "clear_field" }
      }
    });
  });

  it("clears the currently focused editable field when multiple fields are visible", () => {
    const decision = detectFastPath({
      taskText: "清空当前输入框",
      pageUrl: "https://app.example.test/profile",
      controls: [
        control({
          semanticId: "name_field",
          role: "textbox",
          label: "姓名",
          accessibleName: "姓名",
          elementTag: "input",
          valueState: "filled",
          focused: true,
          interactionHints: ["textbox"]
        }),
        control({
          semanticId: "email_field",
          role: "textbox",
          label: "邮箱",
          accessibleName: "邮箱",
          elementTag: "input",
          valueState: "filled",
          interactionHints: ["textbox"]
        })
      ],
      actionMemory: []
    });

    expect(decision).toMatchObject({
      source: "focused_field_clear",
      command: {
        type: "FillField",
        inputs: { semanticId: "name_field", value: "", intent: "clear_focused_field" }
      }
    });
  });

  it("does not fast-clear ambiguous or sensitive fields", () => {
    expect(
      detectFastPath({
        taskText: "清空输入框",
        pageUrl: "https://app.example.test/profile",
        controls: [
          control({ semanticId: "name_field", role: "textbox", label: "姓名", accessibleName: "姓名", interactionHints: ["textbox"] }),
          control({ semanticId: "email_field", role: "textbox", label: "邮箱", accessibleName: "邮箱", interactionHints: ["textbox"] })
        ],
        actionMemory: []
      })
    ).toBeUndefined();

    expect(
      detectFastPath({
        taskText: "清空密码输入框",
        pageUrl: "https://app.example.test/login",
        controls: [control({ semanticId: "password", role: "textbox", label: "密码", accessibleName: "密码", interactionHints: ["textbox", "password"] })],
        actionMemory: []
      })
    ).toBeUndefined();
  });

  it("does not clear sensitive focused fields", () => {
    const decision = detectFastPath({
      taskText: "清空当前输入框",
      pageUrl: "https://app.example.test/login",
      controls: [
        control({
          semanticId: "password",
          role: "textbox",
          label: "密码",
          accessibleName: "密码",
          elementTag: "input",
          controlType: "password",
          focused: true,
          interactionHints: ["textbox", "password"]
        })
      ],
      actionMemory: []
    });

    expect(decision).toBeUndefined();
  });

  it("fills a unique visible field and presses Enter without planner call", () => {
    const decision = detectFastPath({
      taskText: "在邮箱输入 ada@example.test 并按回车",
      pageUrl: "https://app.example.test/profile",
      controls: [
        control({
          semanticId: "email_field",
          role: "textbox",
          label: "邮箱",
          accessibleName: "邮箱",
          elementTag: "input",
          valueState: "empty",
          interactionHints: ["textbox"]
        })
      ],
      actionMemory: []
    });

    expect(decision).toMatchObject({
      source: "exact_visible_field_enter",
      command: {
        type: "FillField",
        inputs: { semanticId: "email_field", value: "ada@example.test" }
      },
      commands: [
        { type: "FillField", inputs: { semanticId: "email_field", value: "ada@example.test" } },
        { type: "PressKey", inputs: { key: "Enter", intent: "submit_field", fieldSemanticId: "email_field" } }
      ]
    });
  });

  it("does not turn field enter requests into key-only fast paths", () => {
    const decision = detectFastPath({
      taskText: "把南京天气输入到搜索框然后回车",
      pageUrl: "https://www.google.com/",
      controls: [
        control({
          semanticId: "search_box",
          role: "searchbox",
          label: "搜索框",
          accessibleName: "搜索框",
          elementTag: "textarea",
          valueState: "empty",
          interactionHints: ["searchbox", "textbox"]
        })
      ],
      actionMemory: []
    });

    expect(decision?.source).toBe("exact_visible_field_enter");
    expect(decision?.commands?.map((command) => command.type)).toEqual(["FillField", "PressKey"]);
  });

  it("does not fast-fill and press Enter for sensitive or ambiguous fields", () => {
    expect(
      detectFastPath({
        taskText: "在密码输入 123456 并按回车",
        pageUrl: "https://app.example.test/login",
        controls: [control({ semanticId: "password", role: "textbox", label: "密码", accessibleName: "密码", interactionHints: ["textbox", "password"] })],
        actionMemory: []
      })
    ).toBeUndefined();

    expect(
      detectFastPath({
        taskText: "在邮箱输入 ada@example.test 并按回车",
        pageUrl: "https://app.example.test/profile",
        controls: [
          control({ semanticId: "email_top", role: "textbox", label: "邮箱", accessibleName: "邮箱", interactionHints: ["textbox"] }),
          control({ semanticId: "email_bottom", role: "textbox", label: "邮箱", accessibleName: "邮箱", interactionHints: ["textbox"] })
        ],
        actionMemory: []
      })
    ).toBeUndefined();
  });

  it("fills the currently focused editable field for value-only input tasks", () => {
    const decision = detectFastPath({
      taskText: "输入 Ada Lovelace",
      pageUrl: "https://app.example.test/profile",
      controls: [
        control({
          semanticId: "name_field",
          role: "textbox",
          label: "姓名",
          accessibleName: "姓名",
          elementTag: "input",
          valueState: "empty",
          focused: true,
          interactionHints: ["textbox"]
        }),
        control({
          semanticId: "email_field",
          role: "textbox",
          label: "邮箱",
          accessibleName: "邮箱",
          elementTag: "input",
          valueState: "empty",
          interactionHints: ["textbox"]
        })
      ],
      actionMemory: []
    });

    expect(decision).toMatchObject({
      source: "focused_text_entry",
      command: {
        type: "FillField",
        targetGoal: "姓名",
        inputs: { semanticId: "name_field", value: "Ada Lovelace", intent: "focused_text_entry" },
        successCriteria: ["control_value_matches"]
      }
    });
  });

  it("fills the currently focused editable field and presses Enter for value-only input tasks", () => {
    const decision = detectFastPath({
      taskText: "输入 Ada Lovelace 并按回车",
      pageUrl: "https://app.example.test/profile",
      controls: [
        control({
          semanticId: "name_field",
          role: "textbox",
          label: "姓名",
          accessibleName: "姓名",
          elementTag: "input",
          valueState: "empty",
          focused: true,
          interactionHints: ["textbox"]
        }),
        control({
          semanticId: "email_field",
          role: "textbox",
          label: "邮箱",
          accessibleName: "邮箱",
          elementTag: "input",
          valueState: "empty",
          interactionHints: ["textbox"]
        })
      ],
      actionMemory: []
    });

    expect(decision).toMatchObject({
      source: "focused_text_entry_enter",
      command: {
        type: "FillField",
        inputs: { semanticId: "name_field", value: "Ada Lovelace", intent: "focused_text_entry" }
      },
      commands: [
        { type: "FillField", inputs: { semanticId: "name_field", value: "Ada Lovelace" } },
        { type: "PressKey", inputs: { key: "Enter", intent: "submit_focused_field", fieldSemanticId: "name_field" } }
      ]
    });
  });

  it("does not use focused text entry enter for sensitive or unfocused fields", () => {
    expect(
      detectFastPath({
        taskText: "输入 123456 并按回车",
        pageUrl: "https://app.example.test/login",
        controls: [
          control({
            semanticId: "password_field",
            role: "textbox",
            label: "密码",
            accessibleName: "密码",
            elementTag: "input",
            controlType: "password",
            focused: true,
            interactionHints: ["textbox", "password"]
          })
        ],
        actionMemory: []
      })
    ).toBeUndefined();

    expect(
      detectFastPath({
        taskText: "输入 Ada Lovelace 并按回车",
        pageUrl: "https://app.example.test/profile",
        controls: [
          control({
            semanticId: "name_field",
            role: "textbox",
            label: "姓名",
            accessibleName: "姓名",
            elementTag: "input",
            interactionHints: ["textbox"]
          })
        ],
        actionMemory: []
      })
    ).toBeUndefined();
  });

  it("does not use focused text entry for sensitive or unfocused value-only input tasks", () => {
    expect(
      detectFastPath({
        taskText: "输入 123456",
        pageUrl: "https://app.example.test/login",
        controls: [
          control({
            semanticId: "password_field",
            role: "textbox",
            label: "密码",
            accessibleName: "密码",
            elementTag: "input",
            controlType: "password",
            focused: true,
            interactionHints: ["textbox", "password"]
          })
        ],
        actionMemory: []
      })
    ).toBeUndefined();

    expect(
      detectFastPath({
        taskText: "输入 Ada Lovelace",
        pageUrl: "https://app.example.test/profile",
        controls: [
          control({
            semanticId: "name_field",
            role: "textbox",
            label: "姓名",
            accessibleName: "姓名",
            elementTag: "input",
            interactionHints: ["textbox"]
          })
        ],
        actionMemory: []
      })
    ).toBeUndefined();
  });

  it("fills value-first field requests without planner call", () => {
    const decision = detectFastPath({
      taskText: "把南京天气输入到搜索框",
      pageUrl: "https://www.google.com/",
      controls: [
        control({
          semanticId: "search_box",
          role: "searchbox",
          label: "搜索框",
          accessibleName: "搜索框",
          elementTag: "textarea",
          valueState: "empty",
          interactionHints: ["searchbox", "textbox"]
        })
      ],
      actionMemory: []
    });

    expect(decision).toMatchObject({
      source: "exact_visible_field",
      command: { type: "FillField", inputs: { semanticId: "search_box", value: "南京天气" } }
    });
  });

  it("does not fast-fill ambiguous or sensitive fields", () => {
    expect(
      detectFastPath({
        taskText: "不要在邮箱输入 ada@example.test",
        pageUrl: "https://app.example.test/profile",
        controls: [
          control({
            semanticId: "email_field",
            role: "textbox",
            label: "邮箱",
            accessibleName: "邮箱",
            elementTag: "input",
            interactionHints: ["textbox"]
          })
        ],
        actionMemory: []
      })
    ).toBeUndefined();

    expect(
      detectFastPath({
        taskText: "在邮箱输入 ada@example.test",
        pageUrl: "https://app.example.test/profile",
        controls: [
          control({ semanticId: "email_top", role: "textbox", label: "邮箱", accessibleName: "邮箱", interactionHints: ["textbox"] }),
          control({ semanticId: "email_bottom", role: "textbox", label: "邮箱", accessibleName: "邮箱", interactionHints: ["textbox"] })
        ],
        actionMemory: []
      })
    ).toBeUndefined();

    expect(
      detectFastPath({
        taskText: "在密码输入 123456",
        pageUrl: "https://app.example.test/login",
        controls: [control({ semanticId: "password", role: "textbox", label: "密码", accessibleName: "密码", interactionHints: ["textbox", "password"] })],
        actionMemory: []
      })
    ).toBeUndefined();
  });

  it("clicks an exact visible menu item without planner call", () => {
    const decision = detectFastPath({
      taskText: "点击客户管理",
      pageUrl: "https://workspace.example.test/",
      controls: [
        control({
          semanticId: "control_1_menuitem_customer",
          role: "menuitem",
          label: "客户管理",
          accessibleName: "客户管理",
          elementTag: "li",
          bounds: { x: 0, y: 0, width: 100, height: 32 }
        })
      ],
      actionMemory: []
    });

    expect(decision).toMatchObject({
      source: "exact_visible_control",
      command: {
        type: "ActivateTarget",
        targetGoal: "客户管理",
        inputs: { semanticId: "control_1_menuitem_customer" }
      }
    });
  });

  it("marks exact visible destructive controls as high risk", () => {
    const decision = detectFastPath({
      taskText: "点击删除",
      pageUrl: "https://app.example.test/settings",
      controls: [
        control({
          semanticId: "delete_button",
          role: "button",
          label: "删除",
          accessibleName: "删除",
          elementTag: "button"
        })
      ],
      actionMemory: []
    });

    expect(decision).toMatchObject({
      source: "exact_visible_control",
      command: {
        type: "ActivateTarget",
        inputs: { semanticId: "delete_button" },
        riskHint: "high"
      }
    });
  });

  it("activates a unique semantic navigation match without planner call", () => {
    const decision = detectFastPath({
      taskText: "进入客户列表页面",
      pageUrl: "https://workspace.example.test/",
      controls: [
        control({
          semanticId: "side_customer_management",
          role: "button",
          label: "客户管理",
          accessibleName: "客户管理",
          regionRef: "sidebar",
          interactionHints: ["button", "pointer"],
          expandedState: "collapsed"
        }),
        control({
          semanticId: "new_customer",
          role: "button",
          label: "新建客户",
          accessibleName: "新建客户",
          interactionHints: ["button"]
        })
      ],
      actionMemory: []
    });

    expect(decision).toMatchObject({
      source: "semantic_navigation_control",
      command: {
        type: "ActivateTarget",
        targetGoal: "客户管理",
        inputs: { semanticId: "side_customer_management" },
        successCriteria: ["menu_expanded", "child_target_visible"]
      }
    });
  });

  it("requires expandable menu targets to expand instead of accepting pre-click visibility", () => {
    const decision = detectFastPath({
      taskText: "点击客户管理",
      pageUrl: "https://workspace.example.test/",
      controls: [
        control({
          semanticId: "customer_menu",
          role: "menuitem",
          label: "客户管理",
          accessibleName: "客户管理",
          expandedState: "collapsed",
          childRefs: ["customer_list"],
          interactionHints: ["menuitem"]
        })
      ],
      actionMemory: []
    });

    expect(decision).toMatchObject({
      source: "exact_visible_control",
      command: {
        type: "ActivateTarget",
        inputs: { semanticId: "customer_menu" },
        expectedOutcome: "The target navigation menu is expanded and reveals its child targets.",
        successCriteria: ["menu_expanded", "child_target_visible"]
      }
    });
  });

  it("expands a unique visible expandable control without planner call", () => {
    const decision = detectFastPath({
      taskText: "展开客户管理",
      pageUrl: "https://workspace.example.test/",
      controls: [
        control({
          semanticId: "customer_menu",
          role: "menuitem",
          label: "客户管理",
          accessibleName: "客户管理",
          expandedState: "collapsed",
          childRefs: ["customer_list"],
          interactionHints: ["menuitem"]
        }),
        control({
          semanticId: "customer_list",
          role: "menuitem",
          label: "客户列表",
          accessibleName: "客户列表",
          visibility: "hidden",
          interactionHints: ["menuitem"]
        })
      ],
      actionMemory: []
    });

    expect(decision).toMatchObject({
      source: "exact_visible_expansion_control",
      command: {
        type: "ActivateTarget",
        inputs: {
          semanticId: "customer_menu",
          intent: "expand_or_collapse",
          desiredState: "expanded",
          desiredExpanded: true
        },
        successCriteria: ["menu_expanded", "child_target_visible"],
        riskHint: "low"
      }
    });
  });

  it("collapses a unique visible expandable control without planner call", () => {
    const decision = detectFastPath({
      taskText: "收起客户管理菜单",
      pageUrl: "https://workspace.example.test/",
      controls: [
        control({
          semanticId: "customer_menu",
          role: "menuitem",
          label: "客户管理",
          accessibleName: "客户管理",
          expandedState: "expanded",
          childRefs: ["customer_list"],
          interactionHints: ["menuitem"]
        }),
        control({
          semanticId: "customer_list",
          role: "menuitem",
          label: "客户列表",
          accessibleName: "客户列表",
          interactionHints: ["menuitem"]
        })
      ],
      actionMemory: []
    });

    expect(decision).toMatchObject({
      source: "exact_visible_expansion_control",
      command: {
        type: "ActivateTarget",
        inputs: {
          semanticId: "customer_menu",
          intent: "expand_or_collapse",
          desiredState: "collapsed",
          desiredExpanded: false
        },
        successCriteria: ["menu_collapsed"],
        riskHint: "low"
      }
    });
  });

  it("does not toggle expandable controls that already match the requested state", () => {
    expect(
      detectFastPath({
        taskText: "展开客户管理",
        pageUrl: "https://workspace.example.test/",
        controls: [
          control({
            semanticId: "customer_menu",
            role: "menuitem",
            label: "客户管理",
            accessibleName: "客户管理",
            expandedState: "expanded",
            interactionHints: ["menuitem"]
          })
        ],
        actionMemory: []
      })
    ).toBeUndefined();

    expect(
      detectFastPath({
        taskText: "收起客户管理",
        pageUrl: "https://workspace.example.test/",
        controls: [
          control({
            semanticId: "customer_menu",
            role: "menuitem",
            label: "客户管理",
            accessibleName: "客户管理",
            expandedState: "collapsed",
            interactionHints: ["menuitem"]
          })
        ],
        actionMemory: []
      })
    ).toBeUndefined();
  });

  it("does not expand controls when expansion matches are ambiguous or state is unknown", () => {
    expect(
      detectFastPath({
        taskText: "展开客户管理",
        pageUrl: "https://workspace.example.test/",
        controls: [
          control({ semanticId: "customer_menu_top", role: "menuitem", label: "客户管理", accessibleName: "客户管理", expandedState: "collapsed" }),
          control({ semanticId: "customer_menu_side", role: "menuitem", label: "客户管理", accessibleName: "客户管理", expandedState: "collapsed" })
        ],
        actionMemory: []
      })
    ).toBeUndefined();

    expect(
      detectFastPath({
        taskText: "展开客户管理",
        pageUrl: "https://workspace.example.test/",
        controls: [
          control({ semanticId: "customer_menu", role: "menuitem", label: "客户管理", accessibleName: "客户管理", expandedState: "unknown" })
        ],
        actionMemory: []
      })
    ).toBeUndefined();
  });

  it("switches a unique visible tab without planner call", () => {
    const decision = detectFastPath({
      taskText: "切换到已发起",
      pageUrl: "https://app.example.test/workflow",
      controls: [
        control({
          semanticId: "tab_pending",
          role: "tab",
          label: "待办",
          accessibleName: "待办",
          valueState: "selected",
          interactionHints: ["tab"]
        }),
        control({
          semanticId: "tab_started",
          role: "tab",
          label: "已发起",
          accessibleName: "已发起",
          interactionHints: ["tab"]
        })
      ],
      actionMemory: []
    });

    expect(decision).toMatchObject({
      source: "visible_tab_control",
      command: {
        type: "ActivateTarget",
        targetGoal: "已发起",
        inputs: {
          semanticId: "tab_started",
          intent: "tab_switch",
          desiredState: "selected",
          desiredSelected: true
        },
        successCriteria: ["control_value_matches"],
        riskHint: "low"
      }
    });
  });

  it("switches a unique visible segmented control without planner call", () => {
    const decision = detectFastPath({
      taskText: "选择近五年标签",
      pageUrl: "https://app.example.test/dashboard",
      controls: [
        control({
          semanticId: "range_this_year",
          role: "button",
          label: "今年",
          accessibleName: "今年",
          valueState: "selected",
          interactionHints: ["button", "segmented"]
        }),
        control({
          semanticId: "range_five_years",
          role: "button",
          label: "近五年",
          accessibleName: "近五年",
          interactionHints: ["button", "segmented"]
        })
      ],
      actionMemory: []
    });

    expect(decision).toMatchObject({
      source: "visible_tab_control",
      command: {
        type: "ActivateTarget",
        inputs: { semanticId: "range_five_years", intent: "tab_switch" }
      }
    });
  });

  it("does not switch tabs when the matched tab is already selected or ambiguous", () => {
    expect(
      detectFastPath({
        taskText: "切换到待办",
        pageUrl: "https://app.example.test/workflow",
        controls: [
          control({
            semanticId: "tab_pending",
            role: "tab",
            label: "待办",
            accessibleName: "待办",
            valueState: "selected",
            interactionHints: ["tab"]
          })
        ],
        actionMemory: []
      })
    ).toBeUndefined();

    expect(
      detectFastPath({
        taskText: "切换到待办",
        pageUrl: "https://app.example.test/workflow",
        controls: [
          control({ semanticId: "tab_pending_top", role: "tab", label: "待办", accessibleName: "待办", interactionHints: ["tab"] }),
          control({ semanticId: "tab_pending_bottom", role: "tab", label: "待办", accessibleName: "待办", interactionHints: ["tab"] })
        ],
        actionMemory: []
      })
    ).toBeUndefined();
  });

  it("reads the current page through a no-model content fast path", () => {
    const decision = detectFastPath({
      taskText: "读取当前页面内容",
      pageUrl: "https://app.example.test/dashboard",
      controls: [],
      actionMemory: []
    });

    expect(decision).toMatchObject({
      source: "explicit_read_content",
      command: {
        type: "ReadContent",
        targetGoal: "当前页面",
        inputs: { query: "当前页面", intent: "read_content" },
        successCriteria: ["content_read"],
        riskHint: "low"
      }
    });
  });

  it("keeps business read targets specific enough for text binding", () => {
    const decision = detectFastPath({
      taskText: "查看客户摘要内容",
      pageUrl: "https://app.example.test/dashboard",
      controls: [],
      actionMemory: []
    });

    expect(decision).toMatchObject({
      source: "explicit_read_content",
      command: {
        type: "ReadContent",
        targetGoal: "客户摘要",
        inputs: { query: "客户摘要" }
      }
    });
  });

  it("does not turn negative or generic inspect wording into read fast paths", () => {
    expect(
      detectFastPath({
        taskText: "不要读取当前页面内容",
        pageUrl: "https://app.example.test/dashboard",
        controls: [],
        actionMemory: []
      })
    ).toBeUndefined();

    expect(
      detectFastPath({
        taskText: "查看详情",
        pageUrl: "https://app.example.test/dashboard",
        controls: [],
        actionMemory: []
      })
    ).toBeUndefined();
  });

  it("does not use semantic navigation fast path when navigation matches are ambiguous", () => {
    const decision = detectFastPath({
      taskText: "进入客户页面",
      pageUrl: "https://workspace.example.test/",
      controls: [
        control({ semanticId: "side_customer_management", role: "menuitem", label: "客户管理", accessibleName: "客户管理" }),
        control({ semanticId: "top_customer_center", role: "menuitem", label: "客户中心", accessibleName: "客户中心" })
      ],
      actionMemory: []
    });

    expect(decision).toBeUndefined();
  });

  it("does not click when exact visible controls are duplicated", () => {
    const decision = detectFastPath({
      taskText: "点击保存",
      pageUrl: "https://app.example.test/",
      controls: [
        control({ semanticId: "save_top", label: "保存", accessibleName: "保存" }),
        control({ semanticId: "save_bottom", label: "保存", accessibleName: "保存" })
      ],
      actionMemory: []
    });

    expect(decision).toBeUndefined();
  });

  it("prefers a unique visible pagination control over viewport scrolling", () => {
    const decision = detectFastPath({
      taskText: "下一页",
      pageUrl: "https://app.example.test/list?page=1",
      controls: [
        control({
          semanticId: "previous_page",
          role: "button",
          label: "上一页",
          accessibleName: "上一页",
          elementTag: "button"
        }),
        control({
          semanticId: "next_page",
          role: "button",
          label: "下一页",
          accessibleName: "下一页",
          elementTag: "button",
          interactionHints: ["button", "pagination"]
        })
      ],
      actionMemory: []
    });

    expect(decision).toMatchObject({
      source: "visible_pagination_control",
      command: {
        type: "ActivateTarget",
        targetGoal: "下一页",
        inputs: { semanticId: "next_page", intent: "pagination", direction: "next" },
        riskHint: "low"
      }
    });
  });

  it("falls back to scroll when no visible pagination control is available", () => {
    const decision = detectFastPath({
      taskText: "下一页",
      pageUrl: "https://app.example.test/list",
      controls: [],
      actionMemory: []
    });

    expect(decision).toMatchObject({
      source: "explicit_scroll",
      command: {
        type: "ScrollRegion",
        inputs: { direction: "down", amount: 720 }
      }
    });
  });

  it("keeps browser history navigation ahead of pagination controls", () => {
    const decision = detectFastPath({
      taskText: "返回上一页",
      pageUrl: "https://app.example.test/detail",
      controls: [
        control({
          semanticId: "previous_page",
          role: "button",
          label: "上一页",
          accessibleName: "上一页",
          elementTag: "button"
        })
      ],
      actionMemory: []
    });

    expect(decision).toMatchObject({
      source: "browser_navigation",
      command: {
        type: "BrowserNavigation",
        inputs: { action: "back" }
      }
    });
  });

  it("scrolls the page without planner call for explicit scroll requests", () => {
    const decision = detectFastPath({
      taskText: "向下滚动一点",
      pageUrl: "https://app.example.test/list",
      controls: [],
      actionMemory: []
    });

    expect(decision).toMatchObject({
      source: "explicit_scroll",
      command: {
        type: "ScrollRegion",
        targetGoal: "Scroll down",
        inputs: { direction: "down", amount: 360 },
        successCriteria: ["viewport_scrolled"]
      }
    });
  });

  it("does not scroll on ambiguous or negated scroll requests", () => {
    expect(
      detectFastPath({
        taskText: "滚动一下",
        pageUrl: "https://app.example.test/list",
        controls: [],
        actionMemory: []
      })
    ).toBeUndefined();

    expect(
      detectFastPath({
        taskText: "不要滚动页面",
        pageUrl: "https://app.example.test/list",
        controls: [],
        actionMemory: []
      })
    ).toBeUndefined();

    expect(
      detectFastPath({
        taskText: "不要向下滚动页面",
        pageUrl: "https://app.example.test/list",
        controls: [],
        actionMemory: []
      })
    ).toBeUndefined();
  });

  it("waits without planner call for explicit wait requests", () => {
    const decision = detectFastPath({
      taskText: "等待3秒",
      pageUrl: "https://app.example.test/list",
      controls: [],
      actionMemory: []
    });

    expect(decision).toMatchObject({
      source: "explicit_wait",
      command: {
        type: "WaitForChange",
        targetGoal: "Wait",
        inputs: { milliseconds: 3000 },
        successCriteria: ["wait_completed"]
      }
    });
  });

  it("uses browser navigation fast paths for explicit history and reload requests", () => {
    expect(
      detectFastPath({
        taskText: "返回上一页",
        pageUrl: "https://app.example.test/detail",
        controls: [],
        actionMemory: []
      })
    ).toMatchObject({
      source: "browser_navigation",
      command: {
        type: "BrowserNavigation",
        inputs: { action: "back" },
        successCriteria: ["page_changed"]
      }
    });

    expect(
      detectFastPath({
        taskText: "refresh this page",
        pageUrl: "https://app.example.test/detail",
        controls: [],
        actionMemory: []
      })
    ).toMatchObject({
      source: "browser_navigation",
      command: {
        type: "BrowserNavigation",
        inputs: { action: "reload" },
        successCriteria: ["navigation_completed"]
      }
    });
  });

  it("activates a unique visible refresh control for app-level refresh requests", () => {
    const decision = detectFastPath({
      taskText: "刷新列表",
      pageUrl: "https://app.example.test/list",
      controls: [
        control({
          semanticId: "refresh_list",
          role: "button",
          label: "刷新",
          accessibleName: "刷新",
          elementTag: "button",
          interactionHints: ["button", "refresh"]
        })
      ],
      actionMemory: []
    });

    expect(decision).toMatchObject({
      source: "visible_refresh_control",
      command: {
        type: "ActivateTarget",
        inputs: { semanticId: "refresh_list", intent: "refresh_or_retry" },
        riskHint: "low"
      }
    });
  });

  it("keeps browser reload ahead of visible refresh controls for page reload requests", () => {
    const decision = detectFastPath({
      taskText: "刷新页面",
      pageUrl: "https://app.example.test/list",
      controls: [
        control({
          semanticId: "refresh_list",
          role: "button",
          label: "刷新",
          accessibleName: "刷新",
          elementTag: "button"
        })
      ],
      actionMemory: []
    });

    expect(decision).toMatchObject({
      source: "browser_navigation",
      command: { type: "BrowserNavigation", inputs: { action: "reload" } }
    });
  });

  it("does not activate refresh controls when refresh-like controls are ambiguous", () => {
    const decision = detectFastPath({
      taskText: "重试",
      pageUrl: "https://app.example.test/list",
      controls: [
        control({ semanticId: "retry_top", role: "button", label: "重试", accessibleName: "重试", elementTag: "button" }),
        control({ semanticId: "retry_bottom", role: "button", label: "重试", accessibleName: "重试", elementTag: "button" })
      ],
      actionMemory: []
    });

    expect(decision).toBeUndefined();
  });

  it("does not treat app-level refresh or negated navigation as browser history commands", () => {
    expect(
      detectFastPath({
        taskText: "refresh customer list",
        pageUrl: "https://app.example.test/list",
        controls: [],
        actionMemory: []
      })
    ).toBeUndefined();

    expect(
      detectFastPath({
        taskText: "不要返回上一页",
        pageUrl: "https://app.example.test/detail",
        controls: [],
        actionMemory: []
      })
    ).toBeUndefined();
  });

  it("does not wait on negated or compound action requests", () => {
    expect(
      detectFastPath({
        taskText: "不要等待页面",
        pageUrl: "https://app.example.test/list",
        controls: [],
        actionMemory: []
      })
    ).toBeUndefined();

    expect(
      detectFastPath({
        taskText: "点击保存后等待",
        pageUrl: "https://app.example.test/list",
        controls: [control({ semanticId: "save", label: "保存", accessibleName: "保存" })],
        actionMemory: []
      })
    ).toMatchObject({
      source: "exact_visible_control"
    });
  });

  it("keeps control fast paths available after unrelated action memory exists", () => {
    const decision = detectFastPath({
      taskText: "点击客户管理",
      pageUrl: "https://workspace.example.test/",
      controls: [control({ semanticId: "customer_menu", role: "menuitem", label: "客户管理", accessibleName: "客户管理" })],
      actionMemory: [
        {
          commandType: "ActivateTarget",
          targetGoal: "设置",
          targetRef: "settings_button",
          status: "success",
          verificationStatus: "success"
        }
      ]
    });

    expect(decision).toMatchObject({
      source: "exact_visible_control",
      command: {
        type: "ActivateTarget",
        inputs: { semanticId: "customer_menu" }
      }
    });
  });

  it("does not repeat the same successful fast-path control action", () => {
    const decision = detectFastPath({
      taskText: "点击客户管理",
      pageUrl: "https://workspace.example.test/",
      controls: [control({ semanticId: "customer_menu", role: "menuitem", label: "客户管理", accessibleName: "客户管理" })],
      actionMemory: [
        {
          commandType: "ActivateTarget",
          targetGoal: "客户管理",
          targetRef: "customer_menu",
          status: "success",
          verificationStatus: "success"
        }
      ]
    });

    expect(decision).toBeUndefined();
  });
});
