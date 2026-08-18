import { describe, expect, it } from "vitest";
import { renderInteractiveIndex } from "../../../src/core/observation/interactive-index";

describe("interactive index", () => {
  it("prioritizes inputs before buttons and links", () => {
    const text = renderInteractiveIndex([
      { frameId: 0, handle: "h2", tag: "a", role: "link", label: "详情", text: "" },
      { frameId: 0, handle: "h1", tag: "input", role: "textbox", label: "搜索", text: "" },
      { frameId: 0, handle: "h3", tag: "button", role: "button", label: "提交", text: "" }
    ]);

    expect(text.indexOf('label="搜索"')).toBeLessThan(text.indexOf('label="提交"'));
    expect(text.indexOf('label="提交"')).toBeLessThan(text.indexOf('label="详情"'));
  });

  it("renders focused controls as explicit context", () => {
    const text = renderInteractiveIndex([
      { frameId: 0, handle: "h1", tag: "input", role: "textbox", label: "姓名", text: "", focused: true }
    ]);

    expect(text).toContain('focused="true"');
  });
});
