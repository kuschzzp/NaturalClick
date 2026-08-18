import { describe, expect, it } from "vitest";
import type { NeedMoreObservationRequest } from "../../../src/core/model/contracts";
import type { ControlCandidate } from "../../../src/core/observation/page-model";
import { ensurePageNodeHandle, findElementByPageNodeHandle, PAGE_NODE_HANDLE_ATTRIBUTE, retrieveObservationRecords, type PageNodeRecord } from "../../../src/adapters/content/page-node-index";

function control(id: string, label: string, role = "link", region: PageNodeRecord["region"] = "main_content"): PageNodeRecord {
  return {
    id,
    kind: "control",
    text: label,
    role,
    region,
    visibility: "visible",
    bounds: { x: region === "sidebar" ? 10 : 500, y: 20, width: 120, height: 32 },
    confidence: 0.84,
    control: {
      semanticId: id,
      role,
      label,
      accessibleName: label,
      elementTag: "a",
      disabled: false,
      required: false,
      visibility: "visible",
      interactionHints: [role],
      locatorHints: [{ kind: "text", value: label }],
      confidence: 0.84
    } satisfies ControlCandidate
  };
}

const viewport = { width: 1280, height: 720, scrollX: 0, scrollY: 0, deviceScaleFactor: 1 };

describe("page node index retrieval", () => {
  it("assigns stable hidden handles without creating visual marker elements", () => {
    document.body.innerHTML = `<button id="save">保存</button>`;
    const button = document.querySelector<HTMLElement>("#save");
    expect(button).not.toBeNull();

    const first = ensurePageNodeHandle(button!, "save_button");
    const second = ensurePageNodeHandle(button!, "different_seed");

    expect(first).toBe(second);
    expect(button?.getAttribute(PAGE_NODE_HANDLE_ATTRIBUTE)).toBe(first);
    expect(findElementByPageNodeHandle(document, first)).toBe(button);
    expect(document.querySelector("[data-naturalclick-overlay],.naturalclick-overlay,.nc-overlay")).toBeNull();
  });

  it("ranks sidebar query matches before unrelated visible controls", () => {
    const records = [
      control("main_help", "帮助中心", "link", "main_content"),
      control("side_order", "订单管理", "menuitem", "sidebar"),
      control("side_customer", "客户管理", "menuitem", "sidebar")
    ];
    const request: NeedMoreObservationRequest = {
      reason: "Need order menu",
      query: "订单 管理",
      scope: "sidebar",
      preferredRoles: ["menuitem", "link"]
    };

    const selected = retrieveObservationRecords(records, {
      request,
      candidateLimit: 2,
      viewport
    });

    expect(selected.records.map((item) => item.id)).toEqual(["side_order", "side_customer"]);
    expect(selected.metadata.strategy).toBe("request_ranked");
    expect(selected.metadata.omittedControls).toBe(1);
  });

  it("can include hidden menu entries only when hidden_menus expansion is requested", () => {
    const baseHidden = control("hidden_invoice", "发票管理", "menuitem", "sidebar");
    const hidden: PageNodeRecord = {
      ...baseHidden,
      visibility: "hidden",
      control: { ...baseHidden.control!, visibility: "hidden" }
    };
    const visible = control("visible_home", "首页", "link", "sidebar");

    const withoutHidden = retrieveObservationRecords([visible, hidden], {
      request: { reason: "Need invoice", query: "发票", scope: "sidebar" },
      candidateLimit: 5,
      viewport
    });
    const withHidden = retrieveObservationRecords([visible, hidden], {
      request: { reason: "Need invoice", query: "发票", scope: "sidebar", expand: ["hidden_menus"] },
      candidateLimit: 5,
      viewport
    });

    expect(withoutHidden.records.map((item) => item.id)).not.toContain("hidden_invoice");
    expect(withHidden.records.map((item) => item.id)).toContain("hidden_invoice");
  });

  it("deduplicates expansion records by keeping the strongest score", () => {
    const ordinary = control("save_customer", "保存", "button", "form");
    const expanded: PageNodeRecord = {
      ...ordinary,
      text: "客户资料 保存",
      expansionSource: "form_fields"
    };

    const selected = retrieveObservationRecords([ordinary, expanded], {
      request: { reason: "Need customer form", query: "客户", scope: "form", expand: ["form_fields"] },
      candidateLimit: 5,
      viewport
    });

    expect(selected.records.map((item) => item.id)).toEqual(["save_customer"]);
    expect(selected.metadata.totalControls).toBe(1);
    expect(selected.metadata.returnedControls).toBe(1);
  });

  it("uses semantic id target hints to prioritize ambiguous controls", () => {
    const records = [
      control("save_top", "Save", "button", "main_content"),
      control("save_bottom", "Save", "button", "main_content")
    ];

    const selected = retrieveObservationRecords(records, {
      request: {
        reason: "Disambiguate save controls",
        query: "Save",
        scope: "full_page",
        preferredRoles: ["button"],
        targetTextHints: ["save_bottom"]
      },
      candidateLimit: 1,
      viewport
    });

    expect(selected.records.map((item) => item.id)).toEqual(["save_bottom"]);
  });
});
