import { describe, expect, it, vi } from "vitest";
import type { CdpSession } from "../../../src/adapters/chrome/cdp-session";
import { dispatchKeyboardText, dispatchMouseClick, pressKey } from "../../../src/adapters/chrome/cdp-input";

function session(): CdpSession & { send: ReturnType<typeof vi.fn> } {
  return {
    tabId: 7,
    ownerId: "task_1",
    send: vi.fn(async () => ({})),
    detach: async () => undefined
  };
}

describe("cdp input helpers", () => {
  it("dispatches mouse click as move, press, release", async () => {
    const cdp = session();

    await dispatchMouseClick(cdp, 30, 40);

    expect(cdp.send.mock.calls.map((call) => call[0])).toEqual([
      "Input.dispatchMouseEvent",
      "Input.dispatchMouseEvent",
      "Input.dispatchMouseEvent"
    ]);
    expect(cdp.send.mock.calls.map((call) => (call[1] as { type: string }).type)).toEqual(["mouseMoved", "mousePressed", "mouseReleased"]);
  });

  it("inserts text through CDP", async () => {
    const cdp = session();

    await dispatchKeyboardText(cdp, "hello");

    expect(cdp.send).toHaveBeenCalledWith("Input.insertText", { text: "hello" });
  });

  it("presses a key with keyDown and keyUp", async () => {
    const cdp = session();

    await pressKey(cdp, "Enter");

    expect(cdp.send.mock.calls).toEqual([
      ["Input.dispatchKeyEvent", { type: "keyDown", key: "Enter" }],
      ["Input.dispatchKeyEvent", { type: "keyUp", key: "Enter" }]
    ]);
  });
});
