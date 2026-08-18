import type { CdpSession } from "./cdp-session";

export async function dispatchMouseClick(session: CdpSession, x: number, y: number): Promise<void> {
  await session.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none", clickCount: 0, pointerType: "mouse" });
  await session.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1, pointerType: "mouse" });
  await session.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1, pointerType: "mouse" });
}

export async function dispatchKeyboardText(session: CdpSession, text: string): Promise<void> {
  await session.send("Input.insertText", { text });
}

export async function pressKey(session: CdpSession, key: string): Promise<void> {
  await session.send("Input.dispatchKeyEvent", { type: "keyDown", key });
  await session.send("Input.dispatchKeyEvent", { type: "keyUp", key });
}
