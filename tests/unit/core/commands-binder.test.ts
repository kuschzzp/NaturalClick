import { describe, expect, it, vi } from "vitest";
import { executePrimitive } from "../../../src/adapters/content/primitive-executor";
import { bindCommand } from "../../../src/core/commands/binder";
import type { SemanticCommand } from "../../../src/core/commands/commands";
import type { ControlCandidate, PageModel, TextBlock } from "../../../src/core/observation/page-model";
import { createEventId } from "../../../src/shared/ids";

function command(targetGoal: string, type: SemanticCommand["type"] = "ActivateTarget", inputs: Record<string, unknown> = {}): SemanticCommand {
  return {
    id: createEventId(),
    type,
    targetGoal,
    inputs,
    expectedOutcome: "target activates",
    successCriteria: ["target_activated"],
    riskHint: "low",
    fallbackHints: []
  };
}

function control(overrides: Partial<ControlCandidate>): ControlCandidate {
  return {
    semanticId: "settings_button",
    role: "button",
    label: "Settings",
    accessibleName: "Settings",
    elementTag: "button",
    disabled: false,
    required: false,
    visibility: "visible",
    bounds: { x: 10, y: 20, width: 100, height: 40 },
    interactionHints: ["button"],
    locatorHints: [
      { kind: "css", value: "#settings", confidence: 0.96 },
      { kind: "text", value: "Settings", confidence: 0.75 },
      { kind: "role", value: "button", confidence: 0.7 }
    ],
    confidence: 0.9,
    ...overrides
  };
}

function page(overrides: Partial<PageModel> = {}): PageModel {
  return {
    pageIdentity: {
      url: "https://example.test/settings",
      title: "Fixture",
      origin: "https://example.test",
      path: "/settings"
    },
    viewport: { width: 1280, height: 720, scrollX: 0, scrollY: 0, deviceScaleFactor: 1 },
    feedback: [],
    readableContent: ["Settings"],
    controls: [control({})],
    textBlocks: [],
    forms: [],
    riskSignals: [],
    capturedAt: 1,
    ...overrides
  };
}

function textBlock(overrides: Partial<TextBlock>): TextBlock {
  return {
    semanticId: "text_0_list_item_customer",
    kind: "list_item",
    text: "客户",
    visibility: "visible",
    locatorHints: [
      { kind: "text", value: "客户", confidence: 0.75 },
      { kind: "role", value: "list_item", confidence: 0.7 }
    ],
    confidence: 0.76,
    ...overrides
  };
}

function setRect(element: Element, rect: Partial<DOMRect> = {}): void {
  element.getBoundingClientRect = () =>
    ({
      x: rect.x ?? 0,
      y: rect.y ?? 0,
      width: rect.width ?? 120,
      height: rect.height ?? 32,
      top: rect.y ?? 0,
      left: rect.x ?? 0,
      right: (rect.x ?? 0) + (rect.width ?? 120),
      bottom: (rect.y ?? 0) + (rect.height ?? 32),
      toJSON: () => ({})
    }) as DOMRect;
}

describe("command binder", () => {
  it("binds a semantic target to a DOM click primitive", () => {
    const result = bindCommand(command("Settings icon"), page());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.primitive).toEqual({ type: "dom_click", semanticId: "settings_button" });
      expect(result.value.targetRef).toBe("settings_button");
      expect(result.value.confidence).toBeGreaterThan(0.7);
      expect(result.value.expiresOn).toBe("navigation");
    }
  });

  it("binds fill commands to DOM input primitives", () => {
    const result = bindCommand(
      command("Email field", "FillField", { value: "ada@example.test" }),
      page({
        controls: [
          control({
            semanticId: "email_field",
            role: "textbox",
            label: "Email",
            accessibleName: "Email address",
            elementTag: "input",
            locatorHints: [{ kind: "css", value: "#email", confidence: 0.96 }]
          })
        ]
      })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.primitive).toEqual({ type: "dom_input", semanticId: "email_field", value: "ada@example.test" });
    }
  });

  it("binds select commands to DOM select option primitives", () => {
    const result = bindCommand(
      command("状态", "SelectOption", { value: "启用" }),
      page({
        controls: [
          control({
            semanticId: "status_select",
            role: "combobox",
            label: "状态",
            accessibleName: "状态",
            elementTag: "select",
            controlType: "select-one",
            interactionHints: ["select-one"],
            locatorHints: [{ kind: "css", value: "#status", confidence: 0.96 }]
          })
        ]
      })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.primitive).toEqual({ type: "dom_select_option", semanticId: "status_select", value: "启用" });
    }
  });

  it("binds explicit read commands to read content primitives instead of clicks", () => {
    const result = bindCommand(
      command("客户摘要", "ReadContent", { semanticId: "summary_text" }),
      page({
        controls: [],
        textBlocks: [
          textBlock({
            semanticId: "summary_text",
            kind: "paragraph",
            text: "客户摘要：本月新增 12 人",
            visibility: "visible"
          })
        ]
      })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.primitive).toEqual({ type: "read_content", semanticId: "summary_text", query: "客户摘要" });
      expect(result.value.expiresOn).toBe("step_end");
    }
  });

  it("binds fuzzy read commands to visible text blocks first", () => {
    const result = bindCommand(
      command("客户摘要", "ReadContent"),
      page({
        controls: [control({ semanticId: "summary_button", label: "客户摘要", accessibleName: "客户摘要" })],
        textBlocks: [
          textBlock({
            semanticId: "summary_text",
            kind: "paragraph",
            text: "客户摘要：本月新增 12 人",
            visibility: "visible"
          })
        ]
      })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.primitive).toEqual({ type: "read_content", semanticId: "summary_text", query: "客户摘要" });
    }
  });

  it("falls back to page-level read content when a read target is broad", () => {
    const result = bindCommand(
      command("当前页面", "ReadContent"),
      page({
        controls: [],
        textBlocks: [],
        readableContent: ["页面摘要", "客户数量 12"]
      })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.primitive).toEqual({ type: "read_content", query: "当前页面" });
    }
  });

  it("prefers explicit observed control ids from planner inputs over fuzzy text matching", () => {
    const result = bindCommand(
      command("Enter username 'admin' into the account textbox", "FillField", {
        controlId: "control_3_textbox_",
        value: "admin"
      }),
      page({
        controls: [
          control({
            semanticId: "control_3_textbox_",
            role: "textbox",
            label: "账号",
            accessibleName: "账号",
            elementTag: "input",
            interactionHints: ["textbox", "text"],
            locatorHints: [{ kind: "attribute", value: "data-testid=login-username", confidence: 0.9 }]
          }),
          control({
            semanticId: "control_4_textbox_",
            role: "textbox",
            label: "密码",
            accessibleName: "密码",
            elementTag: "input",
            interactionHints: ["textbox", "password"],
            locatorHints: [{ kind: "attribute", value: "data-testid=login-password", confidence: 0.9 }]
          })
        ]
      })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.targetRef).toBe("control_3_textbox_");
      expect(result.value.primitive).toEqual({ type: "dom_input", semanticId: "control_3_textbox_", value: "admin" });
      expect(result.value.confidence).toBe(0.98);
    }
  });

  it("falls back to text binding when an explicit planner target id is stale or unusable", () => {
    const result = bindCommand(
      command("客户管理", "ActivateTarget", {
        controlId: "stale_zero_bounds",
        semanticId: "stale_zero_bounds"
      }),
      page({
        controls: [
          control({
            semanticId: "stale_zero_bounds",
            role: "menuitem",
            label: "",
            accessibleName: "",
            bounds: { x: 0, y: 0, width: 0, height: 0 },
            interactionHints: ["menuitem"],
            locatorHints: []
          }),
          control({
            semanticId: "customer_menu",
            role: "menuitem",
            label: "客户管理",
            accessibleName: "客户管理",
            elementTag: "span",
            interactionHints: ["menuitem", "pointer"],
            locatorHints: [{ kind: "text", value: "客户管理", confidence: 0.75 }]
          })
        ]
      })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.targetRef).toBe("customer_menu");
      expect(result.value.primitive).toEqual({ type: "dom_click", semanticId: "customer_menu" });
    }
  });

  it("binds visible explicit DOM targets when only their bounds are unreliable", () => {
    const result = bindCommand(
      command("进入客户列表页面", "ActivateTarget", {
        controlId: "control_13_menuitem_",
        semanticId: "control_13_menuitem_"
      }),
      page({
        controls: [
          control({
            semanticId: "control_13_menuitem_",
            role: "menuitem",
            label: "客户",
            accessibleName: "客户",
            elementTag: "span",
            visibility: "visible",
            bounds: { x: 0, y: 0, width: 0, height: 0 },
            interactionHints: ["menuitem"],
            locatorHints: [
              { kind: "text", value: "客户", confidence: 0.75 },
              { kind: "role", value: "menuitem", confidence: 0.7 }
            ]
          })
        ]
      })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.targetRef).toBe("control_13_menuitem_");
      expect(result.value.primitive).toEqual({ type: "dom_click", semanticId: "control_13_menuitem_" });
    }
  });

  it("uses planner label inputs to bind exact Chinese submenu targets", () => {
    const result = bindCommand(
      command("点击左侧导航菜单中的'客户'进入客户列表页面", "ActivateTarget", { label: "客户" }),
      page({
        controls: [
          control({
            semanticId: "customer_group",
            role: "menuitem",
            label: "客户管理线索客户商机公海销售合同销售订单物料申请",
            accessibleName: "客户管理线索客户商机公海销售合同销售订单物料申请",
            elementTag: "li",
            interactionHints: ["menuitem"],
            locatorHints: [{ kind: "text", value: "客户管理线索客户商机公海销售合同销售订单物料申请", confidence: 0.75 }]
          }),
          control({
            semanticId: "customer_submenu",
            role: "menuitem",
            label: "客户",
            accessibleName: "客户",
            elementTag: "li",
            interactionHints: ["menuitem"],
            locatorHints: [{ kind: "text", value: "客户", confidence: 0.75 }]
          })
        ]
      })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.targetRef).toBe("customer_submenu");
      expect(result.value.primitive).toEqual({ type: "dom_click", semanticId: "customer_submenu" });
    }
  });

  it("uses visible explicit text refs as click targets when no DOM control owns the text", () => {
    const result = bindCommand(
      command("客户", "ActivateTarget", { controlRef: "text_7_list_item_客户" }),
      page({
        controls: [],
        textBlocks: [textBlock({ semanticId: "text_7_list_item_客户", text: "客户" })]
      })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.targetRef).toBe("text_7_list_item_客户");
      expect(result.value.primitive).toEqual({ type: "dom_click", semanticId: "text_7_list_item_客户" });
    }
  });

  it("falls back from hidden text refs to the sidebar parent menu instead of ambiguous short text matches", () => {
    const result = bindCommand(
      command("客户", "ActivateTarget", { controlRef: "text_7_list_item_客户" }),
      page({
        controls: [
          control({
            semanticId: "control_27_button_客户管理",
            role: "button",
            label: "客户管理",
            accessibleName: "客户管理",
            regionRef: "sidebar",
            locatorHints: [{ kind: "text", value: "客户管理", confidence: 0.75 }]
          }),
          control({
            semanticId: "control_41_button_新建客户",
            role: "button",
            label: "新建客户",
            accessibleName: "新建客户",
            regionRef: "main_content",
            locatorHints: [{ kind: "text", value: "新建客户", confidence: 0.75 }]
          })
        ],
        textBlocks: [
          textBlock({
            semanticId: "text_7_list_item_客户",
            text: "客户",
            visibility: "hidden",
            regionRef: "sidebar"
          })
        ]
      })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.targetRef).toBe("control_27_button_客户管理");
      expect(result.value.primitive).toEqual({ type: "dom_click", semanticId: "control_27_button_客户管理" });
    }
  });

  it("prefers sidebar navigation targets over main-content buttons for short generic labels", () => {
    const result = bindCommand(
      command("客户", "ActivateTarget"),
      page({
        controls: [
          control({
            semanticId: "customer_nav",
            role: "menuitem",
            label: "客户管理",
            accessibleName: "客户管理",
            regionRef: "sidebar",
            clickablePoint: { x: 120, y: 160 },
            occlusion: "clear",
            expandedState: "collapsed",
            interactionHints: ["menuitem", "pointer"],
            locatorHints: [{ kind: "text", value: "客户管理", confidence: 0.75 }]
          }),
          control({
            semanticId: "new_customer",
            role: "button",
            label: "新建客户",
            accessibleName: "新建客户",
            regionRef: "main_content",
            clickablePoint: { x: 300, y: 320 },
            occlusion: "clear",
            interactionHints: ["button", "pointer"],
            locatorHints: [{ kind: "text", value: "新建客户", confidence: 0.75 }]
          })
        ]
      })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.targetRef).toBe("customer_nav");
    }
  });

  it("prefers clear clickable targets over covered matches before declaring ambiguity", () => {
    const result = bindCommand(
      command("Save", "ActivateTarget"),
      page({
        controls: [
          control({
            semanticId: "save_clear",
            label: "Save",
            accessibleName: "Save",
            clickablePoint: { x: 40, y: 40 },
            occlusion: "clear",
            locatorHints: [{ kind: "css", value: "#save-clear", confidence: 0.96 }]
          }),
          control({
            semanticId: "save_covered",
            label: "Save",
            accessibleName: "Save",
            clickablePoint: { x: 40, y: 120 },
            occlusion: "covered",
            locatorHints: [{ kind: "css", value: "#save-covered", confidence: 0.96 }]
          })
        ]
      })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.targetRef).toBe("save_clear");
    }
  });

  it("binds navigation commands without page targets", () => {
    const result = bindCommand(
      command("Baidu weather search", "NavigateTo", { url: "https://www.baidu.com/s?wd=%E5%8D%97%E4%BA%AC%E5%A4%A9%E6%B0%94" }),
      page({ controls: [], readableContent: [], textBlocks: [], feedback: [] })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.primitive).toEqual({ type: "navigate", url: "https://www.baidu.com/s?wd=%E5%8D%97%E4%BA%AC%E5%A4%A9%E6%B0%94" });
      expect(result.value.expiresOn).toBe("navigation");
    }
  });

  it("binds open-tab commands to a new-tab primitive", () => {
    const result = bindCommand(
      command("Open docs in a new tab", "OpenTab", { url: "https://example.com/docs" }),
      page({ controls: [], readableContent: [], textBlocks: [], feedback: [] })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.primitive).toEqual({ type: "open_tab", url: "https://example.com/docs", active: true });
      expect(result.value.expiresOn).toBe("navigation");
    }
  });

  it("binds browser history commands without page targets", () => {
    const result = bindCommand(
      command("Go back", "BrowserNavigation", { action: "back" }),
      page({ controls: [], readableContent: [], textBlocks: [], feedback: [] })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.primitive).toEqual({ type: "history", action: "back" });
      expect(result.value.expiresOn).toBe("navigation");
    }
  });

  it("binds explicit key commands without page targets", () => {
    const result = bindCommand(
      command("Press Enter", "PressKey", { key: "Enter" }),
      page({ controls: [], readableContent: [], textBlocks: [], feedback: [] })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.primitive).toEqual({ type: "key_press", key: "Enter" });
      expect(result.value.expiresOn).toBe("step_end");
    }
  });

  it("rejects ambiguous targets", () => {
    const ambiguous = page({
      controls: [
        control({ semanticId: "save_top", label: "Save", accessibleName: "Save", locatorHints: [{ kind: "css", value: "#save-top" }] }),
        control({ semanticId: "save_bottom", label: "Save", accessibleName: "Save", locatorHints: [{ kind: "css", value: "#save-bottom" }] })
      ]
    });

    const result = bindCommand(command("Save button", "SubmitCurrentForm"), ambiguous);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("ambiguous_target");
      expect(result.details).toEqual({
        candidates: [
          expect.objectContaining({ semanticId: "save_top", label: "Save", role: "button" }),
          expect.objectContaining({ semanticId: "save_bottom", label: "Save", role: "button" })
        ]
      });
    }
  });

  it("rejects matched controls that are not interactable", () => {
    const result = bindCommand(
      command("Settings button"),
      page({ controls: [control({ disabled: true, label: "Settings", accessibleName: "Settings" })] })
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("target_not_interactable");
    }
  });

  it("uses high-confidence visual candidates only when no DOM target matches", () => {
    const result = bindCommand(command("Settings gear"), page({ controls: [control({ label: "Help", accessibleName: "Help" })] }), [
      { id: "visual_settings", label: "Settings", x: 44, y: 55, confidence: 0.91 }
    ]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.primitive).toEqual({ type: "coordinate_click", x: 44, y: 55 });
      expect(result.value.bindingEvidenceRefs).toEqual(["visual_settings"]);
    }
  });

  it("keeps DOM binding ahead of visual candidates", () => {
    const result = bindCommand(command("Settings"), page(), [{ id: "visual_settings", label: "Settings", x: 44, y: 55, confidence: 0.99 }]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.primitive).toEqual({ type: "dom_click", semanticId: "settings_button" });
    }
  });

  it("asks for more observation when the page model has no target evidence", () => {
    const result = bindCommand(command("Settings"), page({ controls: [], readableContent: [], textBlocks: [], feedback: [] }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("needs_more_observation");
    }
  });

  it("marks explicit user-choice commands as requiring user choice", () => {
    const result = bindCommand(command("Choose an account", "AskUser"), page());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("requires_user_choice");
    }
  });
});

describe("primitive executor", () => {
  it("clicks DOM targets by semantic id and locator hints", async () => {
    document.body.innerHTML = `<button id="settings">Settings</button>`;
    const clicked = vi.fn();
    document.querySelector("#settings")?.addEventListener("click", clicked);

    const result = await executePrimitive({ type: "dom_click", semanticId: "settings_button" }, page());

    expect(result.status).toBe("success");
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it("clicks component menu titles through observed Chinese text hints", async () => {
    document.body.innerHTML = `<span class="el-sub-menu__title">客户管理</span>`;
    const menuTitle = document.querySelector<HTMLElement>(".el-sub-menu__title");
    const clicked = vi.fn();
    const mouseDown = vi.fn();
    menuTitle?.addEventListener("click", clicked);
    menuTitle?.addEventListener("mousedown", mouseDown);

    const model = page({
      controls: [
        control({
          semanticId: "customer_menu",
          role: "menuitem",
          label: "客户管理",
          accessibleName: "客户管理",
          elementTag: "span",
          interactionHints: ["menuitem", "pointer"],
          locatorHints: [
            { kind: "text", value: "客户管理", confidence: 0.75 },
            { kind: "role", value: "menuitem", confidence: 0.7 }
          ]
        })
      ]
    });

    const result = await executePrimitive({ type: "dom_click", semanticId: "customer_menu" }, model);

    expect(result.status).toBe("success");
    expect(mouseDown).toHaveBeenCalledTimes(1);
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it("prefers exact submenu text over parent menu text when clicking by text hint", async () => {
    document.body.innerHTML = `
      <aside>
        <ul class="el-menu">
          <li id="customer-group">客户管理
            <ul>
              <li id="customer-submenu">客户</li>
            </ul>
          </li>
        </ul>
      </aside>
    `;
    const parent = document.querySelector<HTMLElement>("#customer-group");
    const child = document.querySelector<HTMLElement>("#customer-submenu");
    const parentDirectClick = vi.fn();
    const childClick = vi.fn();
    parent?.addEventListener("click", (event) => {
      if (event.target === parent) parentDirectClick();
    });
    child?.addEventListener("click", childClick);

    const model = page({
      controls: [
        control({
          semanticId: "customer_submenu",
          role: "menuitem",
          label: "客户",
          accessibleName: "客户",
          elementTag: "li",
          interactionHints: ["menuitem"],
          locatorHints: [
            { kind: "text", value: "客户", confidence: 0.75 },
            { kind: "role", value: "menuitem", confidence: 0.7 }
          ]
        })
      ]
    });

    const result = await executePrimitive({ type: "dom_click", semanticId: "customer_submenu" }, model);

    expect(result.status).toBe("success");
    expect(childClick).toHaveBeenCalledTimes(1);
    expect(parentDirectClick).not.toHaveBeenCalled();
  });

  it("clicks visible text block targets by semantic id and locator hints", async () => {
    document.body.innerHTML = `<aside><ul class="el-menu"><li id="customer-menu">客户</li></ul></aside>`;
    const child = document.querySelector<HTMLElement>("#customer-menu");
    const childClick = vi.fn();
    child?.addEventListener("click", childClick);

    const model = page({
      controls: [],
      textBlocks: [textBlock({ semanticId: "text_7_list_item_客户", text: "客户" })]
    });

    const result = await executePrimitive({ type: "dom_click", semanticId: "text_7_list_item_客户" }, model);

    expect(result.status).toBe("success");
    expect(childClick).toHaveBeenCalledTimes(1);
  });

  it("falls back to the visible parent menu when an exact submenu text is collapsed", async () => {
    document.body.innerHTML = `
      <aside>
        <ul class="el-menu">
          <li id="customer-group">客户管理
            <ul>
              <li id="customer-submenu">客户</li>
            </ul>
          </li>
        </ul>
      </aside>
    `;
    const parent = document.querySelector<HTMLElement>("#customer-group");
    const child = document.querySelector<HTMLElement>("#customer-submenu");
    if (parent) setRect(parent, { x: 16, y: 160, width: 260, height: 56 });
    if (child) setRect(child, { x: 0, y: 0, width: 0, height: 0 });
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => parent)
    });
    const parentClick = vi.fn();
    const childClick = vi.fn();
    parent?.addEventListener("click", parentClick);
    child?.addEventListener("click", childClick);

    const model = page({
      controls: [
        control({
          semanticId: "customer_submenu",
          role: "menuitem",
          label: "客户",
          accessibleName: "客户",
          elementTag: "li",
          interactionHints: ["menuitem"],
          locatorHints: [
            { kind: "text", value: "客户", confidence: 0.75 },
            { kind: "role", value: "menuitem", confidence: 0.7 }
          ]
        })
      ]
    });

    const result = await executePrimitive({ type: "dom_click", semanticId: "customer_submenu" }, model);

    expect(result.status).toBe("success");
    expect(parentClick).toHaveBeenCalledTimes(1);
    expect(childClick).not.toHaveBeenCalled();
  });

  it("tries alternate row click points when a collapsed menu title does not expand", async () => {
    document.body.innerHTML = `
      <div id="menu-row" aria-expanded="false">
        <span id="menu-title">客户管理</span>
        <button id="menu-arrow" type="button">⌄</button>
      </div>
    `;
    const row = document.querySelector<HTMLElement>("#menu-row");
    const title = document.querySelector<HTMLElement>("#menu-title");
    const arrow = document.querySelector<HTMLElement>("#menu-arrow");
    if (title) setRect(title, { x: 0, y: 0, width: 200, height: 40 });
    if (arrow) setRect(arrow, { x: 170, y: 0, width: 30, height: 40 });
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: (x: number) => (x >= 170 ? arrow : title)
    });
    const titleClick = vi.fn();
    title?.addEventListener("click", titleClick);
    arrow?.addEventListener("click", () => row?.setAttribute("aria-expanded", "true"));

    const model = page({
      controls: [
        control({
          semanticId: "customer_menu",
          role: "menuitem",
          label: "客户管理",
          accessibleName: "客户管理",
          elementTag: "span",
          expandedState: "collapsed",
          bounds: { x: 0, y: 0, width: 200, height: 40 },
          clickablePoint: { x: 100, y: 20 },
          interactionHints: ["menuitem", "pointer"],
          locatorHints: [{ kind: "css", value: "#menu-title", confidence: 0.96 }]
        })
      ]
    });

    const result = await executePrimitive({ type: "dom_click", semanticId: "customer_menu" }, model);

    expect(result.status).toBe("success");
    expect(row?.getAttribute("aria-expanded")).toBe("true");
    expect(titleClick).toHaveBeenCalled();
    expect(result.details.expandedRetry).toBe(true);
  });

  it("tries submenu arrow points for menu-like unknown expansion controls", async () => {
    document.body.innerHTML = `
      <div id="menu-row" class="el-sub-menu">
        <span id="menu-title" class="el-sub-menu__title">客户管理</span>
        <button id="menu-arrow" type="button">⌄</button>
      </div>
    `;
    const row = document.querySelector<HTMLElement>("#menu-row");
    const title = document.querySelector<HTMLElement>("#menu-title");
    const arrow = document.querySelector<HTMLElement>("#menu-arrow");
    if (title) setRect(title, { x: 0, y: 0, width: 200, height: 40 });
    if (arrow) setRect(arrow, { x: 170, y: 0, width: 30, height: 40 });
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: (x: number) => (x >= 170 ? arrow : title)
    });
    const arrowClick = vi.fn(() => row?.classList.add("is-open"));
    arrow?.addEventListener("click", arrowClick);

    const model = page({
      controls: [
        control({
          semanticId: "customer_menu",
          role: "menuitem",
          label: "客户管理",
          accessibleName: "客户管理",
          elementTag: "span",
          regionRef: "sidebar",
          bounds: { x: 0, y: 0, width: 200, height: 40 },
          clickablePoint: { x: 100, y: 20 },
          interactionHints: ["menuitem", "pointer"],
          locatorHints: [{ kind: "css", value: "#menu-title", confidence: 0.96 }]
        })
      ]
    });

    const result = await executePrimitive({ type: "dom_click", semanticId: "customer_menu" }, model);

    expect(result.status).toBe("success");
    expect(arrowClick).toHaveBeenCalledTimes(1);
    expect(row?.classList.contains("is-open")).toBe(true);
    expect(result.details.expandedRetry).toBe(true);
  });

  it("binds an explicit hidden submenu target to its visible parent for activation", () => {
    const model = page({
      controls: [
        control({
          semanticId: "customer_parent",
          role: "menuitem",
          label: "客户管理",
          accessibleName: "客户管理",
          elementTag: "span",
          regionRef: "sidebar",
          childRefs: ["customer_child"],
          locatorHints: [{ kind: "css", value: "#customer-parent", confidence: 0.96 }]
        }),
        control({
          semanticId: "customer_child",
          role: "menuitem",
          label: "客户",
          accessibleName: "客户",
          elementTag: "li",
          regionRef: "sidebar",
          parentRef: "customer_parent",
          visibility: "hidden",
          bounds: { x: 0, y: 0, width: 0, height: 0 },
          locatorHints: [{ kind: "css", value: "#customer-child", confidence: 0.96 }]
        })
      ]
    });

    const result = bindCommand(command("客户", "ActivateTarget", { controlId: "customer_child" }), model);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.primitive).toEqual({ type: "dom_click", semanticId: "customer_parent" });
      expect(result.value.alternatives).toEqual(["customer_child"]);
    }
  });

  it("inputs values and dispatches input/change events", async () => {
    document.body.innerHTML = `<label for="email">Email</label><input id="email" />`;
    const input = document.querySelector<HTMLInputElement>("#email");
    const inputEvent = vi.fn();
    const changeEvent = vi.fn();
    input?.addEventListener("input", inputEvent);
    input?.addEventListener("change", changeEvent);

    const model = page({
      controls: [
        control({
          semanticId: "email_field",
          role: "textbox",
          label: "Email",
          accessibleName: "Email",
          elementTag: "input",
          locatorHints: [{ kind: "css", value: "#email", confidence: 0.96 }]
        })
      ]
    });

    const result = await executePrimitive({ type: "dom_input", semanticId: "email_field", value: "ada@example.test" }, model);

    expect(result.status).toBe("success");
    expect(input?.value).toBe("ada@example.test");
    expect(inputEvent).toHaveBeenCalledTimes(1);
    expect(changeEvent).toHaveBeenCalledTimes(1);
  });

  it("inputs values through observed attribute locator hints", async () => {
    document.body.innerHTML = `<input data-testid="login-username" placeholder="账号" />`;
    const input = document.querySelector<HTMLInputElement>("[data-testid='login-username']");

    const model = page({
      controls: [
        control({
          semanticId: "control_3_textbox_",
          role: "textbox",
          label: "账号",
          accessibleName: "账号",
          elementTag: "input",
          locatorHints: [
            { kind: "attribute", value: "data-testid=login-username", confidence: 0.9 },
            { kind: "text", value: "账号", confidence: 0.75 },
            { kind: "role", value: "textbox", confidence: 0.7 }
          ]
        })
      ]
    });

    const result = await executePrimitive({ type: "dom_input", semanticId: "control_3_textbox_", value: "admin" }, model);

    expect(result.status).toBe("success");
    expect(input?.value).toBe("admin");
  });

  it("reports attempted locator hints when a DOM target cannot be found", async () => {
    document.body.innerHTML = `<input data-testid="login-password" />`;
    const model = page({
      controls: [
        control({
          semanticId: "control_3_textbox_",
          role: "textbox",
          label: "账号",
          accessibleName: "账号",
          elementTag: "input",
          locatorHints: [{ kind: "attribute", value: "data-testid=login-username", confidence: 0.9 }]
        })
      ]
    });

    const result = await executePrimitive({ type: "dom_input", semanticId: "control_3_textbox_", value: "admin" }, model);

    expect(result.status).toBe("failed");
    expect(result.reason).toBe("element_not_found");
    expect(result.details.attemptedHints).toEqual(["attribute:data-testid=login-username"]);
  });

  it("executes wait primitives asynchronously", async () => {
    vi.useFakeTimers();
    const result = executePrimitive({ type: "wait", milliseconds: 25 }, page());

    await vi.advanceTimersByTimeAsync(25);

    await expect(result).resolves.toEqual({ status: "success", details: { primitive: "wait", milliseconds: 25 } });
    vi.useRealTimers();
  });
});
