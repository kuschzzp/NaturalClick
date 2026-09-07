import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executePrimitive } from "../../../src/adapters/content/primitive-executor";
import { PAGE_NODE_HANDLE_ATTRIBUTE } from "../../../src/adapters/content/page-node-index";
import type { ControlCandidate, PageModel, TextBlock } from "../../../src/core/observation/page-model";

function control(overrides: Partial<ControlCandidate>): ControlCandidate {
  return {
    semanticId: "control_1",
    role: "button",
    label: "保存",
    accessibleName: "保存",
    elementTag: "button",
    disabled: false,
    required: false,
    visibility: "visible",
    interactionHints: ["button"],
    locatorHints: [],
    confidence: 0.9,
    ...overrides
  };
}

function page(controls: ControlCandidate[]): PageModel {
  return {
    pageIdentity: {
      url: "https://example.test",
      title: "Fixture",
      origin: "https://example.test",
      path: "/"
    },
    viewport: { width: 1280, height: 720, scrollX: 0, scrollY: 0, deviceScaleFactor: 1 },
    feedback: [],
    readableContent: [],
    textBlocks: [],
    forms: [],
    riskSignals: [],
    capturedAt: 1,
    controls
  };
}

function textBlock(overrides: Partial<TextBlock>): TextBlock {
  return {
    semanticId: "text_1_paragraph_summary",
    kind: "paragraph",
    text: "客户摘要：本月新增 12 人",
    visibility: "visible",
    locatorHints: [],
    confidence: 0.84,
    ...overrides
  };
}

describe("primitive executor handle resolution", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("prefers hidden NaturalClick handles before stale text hints", async () => {
    document.body.innerHTML = `
      <button id="actual" ${PAGE_NODE_HANDLE_ATTRIBUTE}="nc_actual">提交</button>
      <button id="stale">保存</button>
    `;
    const actualClick = vi.fn();
    const staleClick = vi.fn();
    document.querySelector("#actual")?.addEventListener("click", actualClick);
    document.querySelector("#stale")?.addEventListener("click", staleClick);

    const result = await executePrimitive(
      { type: "dom_click", semanticId: "save_button" },
      page([
        control({
          semanticId: "save_button",
          locatorHints: [
            { kind: "attribute", value: `${PAGE_NODE_HANDLE_ATTRIBUTE}=nc_actual`, confidence: 0.99 },
            { kind: "text", value: "保存", confidence: 0.75 }
          ]
        })
      ])
    );

    expect(result.status).toBe("success");
    expect(actualClick).toHaveBeenCalledTimes(1);
    expect(staleClick).not.toHaveBeenCalled();
  });

  it("inputs into contenteditable targets resolved by hidden handle", async () => {
    document.body.innerHTML = `<div id="editor" contenteditable="true" ${PAGE_NODE_HANDLE_ATTRIBUTE}="nc_editor"></div>`;
    const editor = document.querySelector<HTMLElement>("#editor");
    const input = vi.fn();
    editor?.addEventListener("input", input);

    const result = await executePrimitive(
      { type: "dom_input", semanticId: "editor", value: "hello editor" },
      page([
        control({
          semanticId: "editor",
          role: "textbox",
          label: "编辑器",
          accessibleName: "编辑器",
          elementTag: "div",
          interactionHints: ["editable"],
          locatorHints: [{ kind: "attribute", value: `${PAGE_NODE_HANDLE_ATTRIBUTE}=nc_editor`, confidence: 0.99 }]
        })
      ])
    );

    expect(result.status).toBe("success");
    expect(editor?.textContent).toBe("hello editor");
    expect(input).toHaveBeenCalledTimes(1);
  });

  it("clears native input targets with empty DOM input values", async () => {
    document.body.innerHTML = `<input id="email" value="ada@example.test" ${PAGE_NODE_HANDLE_ATTRIBUTE}="nc_email" />`;
    const email = document.querySelector<HTMLInputElement>("#email");
    const input = vi.fn();
    const change = vi.fn();
    email?.addEventListener("input", input);
    email?.addEventListener("change", change);

    const result = await executePrimitive(
      { type: "dom_input", semanticId: "email_field", value: "" },
      page([
        control({
          semanticId: "email_field",
          role: "textbox",
          label: "邮箱",
          accessibleName: "邮箱",
          elementTag: "input",
          valueState: "filled",
          interactionHints: ["textbox"],
          locatorHints: [{ kind: "attribute", value: `${PAGE_NODE_HANDLE_ATTRIBUTE}=nc_email`, confidence: 0.99 }]
        })
      ])
    );

    expect(result).toMatchObject({
      status: "success",
      details: {
        primitive: "dom_input",
        semanticId: "email_field",
        valueMatchesExpected: true,
        expectedValueLength: 0,
        actualValueLength: 0,
        valueStateAfter: "empty"
      }
    });
    expect(email?.value).toBe("");
    expect(input).toHaveBeenCalledTimes(1);
    expect(change).toHaveBeenCalledTimes(1);
  });

  it("reads content from text blocks without clicking the page", async () => {
    document.body.innerHTML = `<p id="summary" ${PAGE_NODE_HANDLE_ATTRIBUTE}="nc_summary">客户摘要：本月新增 12 人</p>`;
    const summary = document.querySelector<HTMLElement>("#summary");
    const click = vi.fn();
    summary?.addEventListener("click", click);

    const model = page([]);
    model.textBlocks = [
      textBlock({
        semanticId: "summary_text",
        locatorHints: [{ kind: "attribute", value: `${PAGE_NODE_HANDLE_ATTRIBUTE}=nc_summary`, confidence: 0.99 }]
      })
    ];

    const result = await executePrimitive({ type: "read_content", semanticId: "summary_text" }, model);

    expect(result.status).toBe("success");
    expect(result.details).toMatchObject({
      primitive: "read_content",
      semanticId: "summary_text",
      source: "text_block",
      text: "客户摘要：本月新增 12 人"
    });
    expect(click).not.toHaveBeenCalled();
  });

  it("reads page-level content for broad read requests", async () => {
    const model = page([]);
    model.readableContent = ["页面摘要", "客户数量 12"];

    const result = await executePrimitive({ type: "read_content", query: "当前页面" }, model);

    expect(result.status).toBe("success");
    expect(result.details).toMatchObject({
      primitive: "read_content",
      source: "page",
      text: expect.stringContaining("客户数量 12")
    });
  });

  it("selects native select options by visible text", async () => {
    document.body.innerHTML = `
      <label for="status">状态</label>
      <select id="status" ${PAGE_NODE_HANDLE_ATTRIBUTE}="nc_status">
        <option value="">请选择</option>
        <option value="enabled">启用</option>
        <option value="disabled">停用</option>
      </select>
    `;
    const select = document.querySelector<HTMLSelectElement>("#status");
    const change = vi.fn();
    select?.addEventListener("change", change);

    const result = await executePrimitive(
      { type: "dom_select_option", semanticId: "status_select", value: "启用" },
      page([
        control({
          semanticId: "status_select",
          role: "combobox",
          label: "状态",
          accessibleName: "状态",
          elementTag: "select",
          controlType: "select-one",
          valueState: "empty",
          interactionHints: ["select-one"],
          locatorHints: [{ kind: "attribute", value: `${PAGE_NODE_HANDLE_ATTRIBUTE}=nc_status`, confidence: 0.99 }]
        })
      ])
    );

    expect(result).toMatchObject({
      status: "success",
      details: {
        primitive: "dom_select_option",
        semanticId: "status_select",
        valueMatchesExpected: true,
        selectedOptionText: "启用",
        valueStateAfter: "selected"
      }
    });
    expect(select?.value).toBe("enabled");
    expect(change).toHaveBeenCalledTimes(1);
  });

  it("selects custom combobox options by visible text", async () => {
    document.body.innerHTML = `
      <button id="status-combo" role="combobox" aria-expanded="false" ${PAGE_NODE_HANDLE_ATTRIBUTE}="nc_status_combo">状态</button>
      <div id="status-list" role="listbox" hidden>
        <div id="enabled-option" role="option">启用</div>
        <div id="disabled-option" role="option">停用</div>
      </div>
    `;
    const combo = document.querySelector<HTMLButtonElement>("#status-combo");
    const list = document.querySelector<HTMLElement>("#status-list");
    const enabled = document.querySelector<HTMLElement>("#enabled-option");
    combo?.addEventListener("click", () => {
      combo.setAttribute("aria-expanded", "true");
      list?.removeAttribute("hidden");
    });
    enabled?.addEventListener("click", () => {
      if (combo) combo.textContent = "启用";
      enabled.setAttribute("aria-selected", "true");
      list?.setAttribute("hidden", "");
      combo?.setAttribute("aria-expanded", "false");
    });
    [combo, enabled, document.querySelector<HTMLElement>("#disabled-option")].forEach((element, index) => {
      if (!element) return;
      element.getBoundingClientRect = () =>
        ({
          x: 0,
          y: index * 36,
          width: 120,
          height: 32,
          top: index * 36,
          left: 0,
          right: 120,
          bottom: index * 36 + 32,
          toJSON: () => ({})
        }) as DOMRect;
    });

    const result = await executePrimitive(
      { type: "dom_select_option", semanticId: "status_combo", value: "启用" },
      page([
        control({
          semanticId: "status_combo",
          role: "combobox",
          label: "状态",
          accessibleName: "状态",
          elementTag: "button",
          expandedState: "collapsed",
          interactionHints: ["combobox"],
          locatorHints: [{ kind: "attribute", value: `${PAGE_NODE_HANDLE_ATTRIBUTE}=nc_status_combo`, confidence: 0.99 }]
        })
      ])
    );

    expect(result).toMatchObject({
      status: "success",
      details: {
        primitive: "dom_select_option",
        semanticId: "status_combo",
        valueMatchesExpected: true,
        selectedOptionText: "启用",
        valueStateAfter: "selected",
        openedDropdown: true
      }
    });
    expect(combo?.textContent).toBe("启用");
    expect(enabled?.getAttribute("aria-selected")).toBe("true");
  });

  it("reports checked state after clicking native checkbox controls", async () => {
    document.body.innerHTML = `
      <label><input id="newsletter" type="checkbox" ${PAGE_NODE_HANDLE_ATTRIBUTE}="nc_newsletter" /> 通知</label>
    `;
    const checkbox = document.querySelector<HTMLInputElement>("#newsletter");
    const result = await executePrimitive(
      { type: "dom_click", semanticId: "notifications_checkbox" },
      page([
        control({
          semanticId: "notifications_checkbox",
          role: "checkbox",
          label: "通知",
          accessibleName: "通知",
          elementTag: "input",
          controlType: "checkbox",
          valueState: "unchecked",
          checked: false,
          interactionHints: ["checkbox"],
          locatorHints: [{ kind: "attribute", value: `${PAGE_NODE_HANDLE_ATTRIBUTE}=nc_newsletter`, confidence: 0.99 }]
        })
      ])
    );

    expect(result).toMatchObject({
      status: "success",
      details: {
        primitive: "dom_click",
        semanticId: "notifications_checkbox",
        checkedStateAfter: true,
        valueStateAfter: "checked"
      }
    });
    expect(checkbox?.checked).toBe(true);
  });

  it("reports viewport movement details for scroll primitives", async () => {
    let scrollY = 0;
    Object.defineProperty(window, "scrollX", { configurable: true, get: () => 0 });
    Object.defineProperty(window, "scrollY", { configurable: true, get: () => scrollY });
    Object.defineProperty(window, "scrollBy", {
      configurable: true,
      value: vi.fn((options: ScrollToOptions) => {
        scrollY += Number(options.top ?? 0);
      })
    });

    const result = await executePrimitive({ type: "scroll", direction: "down", amount: 240 }, page([]));

    expect(result).toMatchObject({
      status: "success",
      details: {
        primitive: "scroll",
        direction: "down",
        amount: 240,
        scrollBeforeY: 0,
        scrollAfterY: 240,
        scrollMoved: true
      }
    });
  });

  it("presses the active key target and submits forms on Enter", async () => {
    document.body.innerHTML = `
      <form id="search">
        <input id="query" name="q" />
        <button type="submit">Search</button>
      </form>
    `;
    const form = document.querySelector<HTMLFormElement>("#search");
    const input = document.querySelector<HTMLInputElement>("#query");
    const keydown = vi.fn();
    const submit = vi.fn((event: Event) => event.preventDefault());
    input?.addEventListener("keydown", keydown);
    form?.addEventListener("submit", submit);
    input?.focus();

    const result = await executePrimitive({ type: "key_press", key: "Enter" }, page([]));

    expect(result).toMatchObject({
      status: "success",
      details: {
        primitive: "key_press",
        key: "Enter",
        targetTag: "input",
        defaultAction: "submit_form",
        defaultPrevented: false
      }
    });
    expect(keydown).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("executes browser history primitives in the content fallback", async () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => undefined);

    const result = await executePrimitive({ type: "history", action: "back" }, page([]));

    expect(back).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      status: "success",
      details: { primitive: "history", action: "back" }
    });
  });

  it("waits for a short settle window after mutating primitives when enabled", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<button id="settings">Settings</button>`;
    const clicked = vi.fn();
    document.querySelector("#settings")?.addEventListener("click", clicked);

    const result = executePrimitive(
      { type: "dom_click", semanticId: "settings_button" },
      page([control({ semanticId: "settings_button", label: "Settings", accessibleName: "Settings", locatorHints: [{ kind: "text", value: "Settings", confidence: 0.9 }] })]),
      { settle: { quietMs: 20, pollMs: 5, maxMs: 100 } }
    );

    expect(clicked).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(20);

    await expect(result).resolves.toMatchObject({
      status: "success",
      details: {
        primitive: "dom_click",
        settle: { status: "settled" }
      }
    });
  });

  it("aborts action settle after a successful primitive", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<button id="settings">Settings</button>`;
    const clicked = vi.fn();
    document.querySelector("#settings")?.addEventListener("click", clicked);
    const controller = new AbortController();

    const result = executePrimitive(
      { type: "dom_click", semanticId: "settings_button" },
      page([control({ semanticId: "settings_button", label: "Settings", accessibleName: "Settings", locatorHints: [{ kind: "text", value: "Settings", confidence: 0.9 }] })]),
      { signal: controller.signal, settle: { quietMs: 200, pollMs: 50, maxMs: 1000 } }
    );

    expect(clicked).toHaveBeenCalledTimes(1);
    controller.abort();

    await expect(result).resolves.toMatchObject({
      status: "failed",
      reason: "primitive_aborted",
      details: {
        primitive: "dom_click",
        aborted: true,
        settle: { status: "aborted" }
      }
    });
  });

  it("aborts pending wait primitives", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const result = executePrimitive({ type: "wait", milliseconds: 1000 }, page([]), { signal: controller.signal });

    controller.abort();

    await expect(result).resolves.toMatchObject({
      status: "failed",
      reason: "primitive_aborted",
      details: { primitive: "wait", milliseconds: 1000, aborted: true }
    });
    vi.useRealTimers();
  });
});
