import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { observePage } from "../../../src/adapters/content/dom-observer";

function loadFixture(path: string): void {
  document.open();
  document.write(readFileSync(path, "utf8"));
  document.close();
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

describe("page atlas fixtures", () => {
  it("classifies CRM sidebar customer management as a navigation control", () => {
    loadFixture("tests/fixtures/pages/crm-sidebar.html");
    document.querySelectorAll("aside *, main *").forEach((element, index) => setRect(element, { x: index < 6 ? 0 : 320, y: 40 + index * 36 }));

    const page = observePage(document, { mode: "atlas", candidateLimit: 20 });
    const serialized = JSON.stringify(page);

    expect(page.controls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "客户管理",
          role: "menuitem",
          regionRef: "sidebar"
        })
      ])
    );
    expect(serialized).toContain("客户管理");
    expect(serialized).toContain("menuitem");
    expect(serialized).not.toContain("button - 客户管理 - 0.88");
  });
});
