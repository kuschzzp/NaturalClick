import { describe, expect, it } from "vitest";
import { detectFastPath } from "../../../src/core/runtime/fast-paths";

describe("performance guardrails", () => {
  it("simple web search is eligible for no-model execution on browser pages", () => {
    const fast = detectFastPath({
      taskText: "搜索 南京天气",
      pageUrl: "chrome://newtab/",
      actionMemory: [],
      controls: []
    });

    expect(fast).toMatchObject({
      source: "web_search",
      command: {
        type: "NavigateTo",
        inputs: { url: "https://www.google.com/search?q=%E5%8D%97%E4%BA%AC%E5%A4%A9%E6%B0%94" }
      }
    });
  });

  it("simple unique field fill is eligible for no-model execution", () => {
    const fast = detectFastPath({
      taskText: "在邮箱输入 ada@example.test",
      pageUrl: "https://app.example.test/profile",
      actionMemory: [],
      controls: [
        {
          semanticId: "email_field",
          role: "textbox",
          label: "邮箱",
          accessibleName: "邮箱",
          elementTag: "input",
          visibility: "visible",
          disabled: false,
          required: false,
          confidence: 0.94,
          valueState: "empty",
          interactionHints: ["textbox"],
          locatorHints: []
        }
      ]
    });

    expect(fast).toMatchObject({
      source: "exact_visible_field",
      command: { type: "FillField", inputs: { semanticId: "email_field", value: "ada@example.test" } }
    });
  });

  it("simple unique selector choice is eligible for no-model execution", () => {
    const fast = detectFastPath({
      taskText: "把状态选择为启用",
      pageUrl: "https://app.example.test/settings",
      actionMemory: [],
      controls: [
        {
          semanticId: "status_select",
          role: "combobox",
          label: "状态",
          accessibleName: "状态",
          elementTag: "select",
          controlType: "select-one",
          visibility: "visible",
          disabled: false,
          required: false,
          confidence: 0.94,
          valueState: "empty",
          interactionHints: ["select-one"],
          locatorHints: []
        }
      ]
    });

    expect(fast).toMatchObject({
      source: "exact_visible_select",
      command: { type: "SelectOption", inputs: { semanticId: "status_select", value: "启用" } }
    });
  });

  it("simple unique state control change is eligible for no-model execution", () => {
    const fast = detectFastPath({
      taskText: "开启通知开关",
      pageUrl: "https://app.example.test/settings",
      actionMemory: [],
      controls: [
        {
          semanticId: "notifications_switch",
          role: "switch",
          label: "通知",
          accessibleName: "通知",
          elementTag: "button",
          valueState: "unchecked",
          checked: false,
          visibility: "visible",
          disabled: false,
          required: false,
          confidence: 0.94,
          interactionHints: ["switch"],
          locatorHints: []
        }
      ]
    });

    expect(fast).toMatchObject({
      source: "exact_visible_state_control",
      command: { type: "ActivateTarget", inputs: { semanticId: "notifications_switch", desiredChecked: true } }
    });
  });

  it("simple tab switch is eligible for no-model execution", () => {
    const fast = detectFastPath({
      taskText: "切换到已发起",
      pageUrl: "https://app.example.test/workflow",
      actionMemory: [],
      controls: [
        {
          semanticId: "tab_pending",
          role: "tab",
          label: "待办",
          accessibleName: "待办",
          elementTag: "button",
          valueState: "selected",
          visibility: "visible",
          disabled: false,
          required: false,
          confidence: 0.94,
          interactionHints: ["tab"],
          locatorHints: []
        },
        {
          semanticId: "tab_started",
          role: "tab",
          label: "已发起",
          accessibleName: "已发起",
          elementTag: "button",
          visibility: "visible",
          disabled: false,
          required: false,
          confidence: 0.94,
          interactionHints: ["tab"],
          locatorHints: []
        }
      ]
    });

    expect(fast).toMatchObject({
      source: "visible_tab_control",
      command: { type: "ActivateTarget", inputs: { semanticId: "tab_started", desiredState: "selected" } }
    });
  });

  it("simple content reading is eligible for no-model execution", () => {
    const fast = detectFastPath({
      taskText: "查看客户摘要内容",
      pageUrl: "https://app.example.test/dashboard",
      actionMemory: [],
      controls: []
    });

    expect(fast).toMatchObject({
      source: "explicit_read_content",
      command: { type: "ReadContent", targetGoal: "客户摘要", inputs: { query: "客户摘要" } }
    });
  });

  it("simple focused text entry is eligible for no-model execution", () => {
    const fast = detectFastPath({
      taskText: "输入 Ada Lovelace",
      pageUrl: "https://app.example.test/profile",
      actionMemory: [],
      controls: [
        {
          semanticId: "name_field",
          role: "textbox",
          label: "姓名",
          accessibleName: "姓名",
          elementTag: "input",
          visibility: "visible",
          disabled: false,
          focused: true,
          required: false,
          confidence: 0.94,
          valueState: "empty",
          interactionHints: ["textbox"],
          locatorHints: []
        }
      ]
    });

    expect(fast).toMatchObject({
      source: "focused_text_entry",
      command: { type: "FillField", inputs: { semanticId: "name_field", value: "Ada Lovelace" } }
    });
  });

  it("simple page-local search submit is eligible for no-model execution", () => {
    const fast = detectFastPath({
      taskText: "搜索 客户",
      pageUrl: "https://app.example.test/list",
      actionMemory: [],
      controls: [
        {
          semanticId: "keyword_field",
          role: "searchbox",
          label: "关键词",
          accessibleName: "关键词",
          elementTag: "input",
          controlType: "search",
          formRef: "search_form",
          visibility: "visible",
          disabled: false,
          required: false,
          confidence: 0.94,
          valueState: "empty",
          interactionHints: ["searchbox", "textbox"],
          locatorHints: []
        },
        {
          semanticId: "search_submit",
          role: "button",
          label: "搜索",
          accessibleName: "搜索",
          elementTag: "button",
          formRef: "search_form",
          visibility: "visible",
          disabled: false,
          required: false,
          confidence: 0.92,
          interactionHints: ["button", "submit"],
          locatorHints: []
        }
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
          confidence: 0.9
        }
      ]
    });

    expect(fast).toMatchObject({
      source: "exact_visible_search_form",
      commands: [
        { type: "FillField", inputs: { semanticId: "keyword_field", value: "客户" } },
        { type: "SubmitCurrentForm", inputs: { semanticId: "search_submit", intent: "search" } }
      ]
    });
  });

  it("simple bare-domain navigation is eligible for no-model execution", () => {
    const fast = detectFastPath({
      taskText: "打开 example.com",
      pageUrl: "chrome://newtab/",
      actionMemory: [],
      controls: []
    });

    expect(fast).toMatchObject({
      source: "explicit_url",
      command: { type: "NavigateTo", inputs: { url: "https://example.com/" } }
    });
  });

  it("simple page scroll is eligible for no-model execution", () => {
    const fast = detectFastPath({
      taskText: "scroll down",
      pageUrl: "https://app.example.test/list",
      actionMemory: [],
      controls: []
    });

    expect(fast).toMatchObject({
      source: "explicit_scroll",
      command: { type: "ScrollRegion", inputs: { direction: "down" } }
    });
  });

  it("simple wait is eligible for no-model execution", () => {
    const fast = detectFastPath({
      taskText: "wait 500ms",
      pageUrl: "https://app.example.test/list",
      actionMemory: [],
      controls: []
    });

    expect(fast).toMatchObject({
      source: "explicit_wait",
      command: { type: "WaitForChange", inputs: { milliseconds: 500 }, successCriteria: ["wait_completed"] }
    });
  });

  it("simple exact sidebar click is eligible for no-model execution", () => {
    const fast = detectFastPath({
      taskText: "点击客户管理",
      pageUrl: "https://crm.example.test/",
      actionMemory: [],
      controls: [
        {
          semanticId: "control_0_menuitem_customer",
          role: "menuitem",
          label: "客户管理",
          accessibleName: "客户管理",
          elementTag: "li",
          visibility: "visible",
          disabled: false,
          required: false,
          confidence: 0.95,
          interactionHints: ["menuitem"],
          locatorHints: [],
          bounds: { x: 10, y: 80, width: 120, height: 40 }
        }
      ]
    });

    expect(fast?.source).toBe("exact_visible_control");
  });

  it("simple semantic sidebar navigation is eligible for no-model execution", () => {
    const fast = detectFastPath({
      taskText: "进入客户列表页面",
      pageUrl: "https://crm.example.test/",
      actionMemory: [],
      controls: [
        {
          semanticId: "control_0_menu_customer",
          role: "button",
          label: "客户管理",
          accessibleName: "客户管理",
          elementTag: "div",
          visibility: "visible",
          disabled: false,
          required: false,
          confidence: 0.9,
          regionRef: "sidebar",
          expandedState: "collapsed",
          interactionHints: ["button", "pointer"],
          locatorHints: [],
          bounds: { x: 10, y: 80, width: 120, height: 40 }
        }
      ]
    });

    expect(fast).toMatchObject({
      source: "semantic_navigation_control",
      command: { successCriteria: ["menu_expanded", "child_target_visible"] }
    });
  });
});
