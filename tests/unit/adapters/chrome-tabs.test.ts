import { afterEach, describe, expect, it, vi } from "vitest";
import { sendActiveTabMessage } from "../../../src/adapters/chrome/tabs";

describe("chrome tabs adapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("injects the content script once when the active tab has no receiving end", async () => {
    const sendMessage = vi
      .fn()
      .mockImplementationOnce((_tabId: number, _message: unknown, callback: (response?: unknown) => void) => {
        chrome.runtime.lastError = { message: "Could not establish connection. Receiving end does not exist." };
        callback(undefined);
        chrome.runtime.lastError = undefined;
      })
      .mockImplementationOnce((_tabId: number, _message: unknown, callback: (response?: unknown) => void) => {
        callback({ ok: true, data: { mode: "Focus" } });
      });
    const executeScript = vi.fn().mockResolvedValue([]);

    vi.stubGlobal("chrome", {
      runtime: { lastError: undefined },
      scripting: { executeScript },
      tabs: {
        query: vi.fn().mockResolvedValue([{ id: 17, url: "https://example.test/app" }]),
        sendMessage
      }
    });

    const response = await sendActiveTabMessage({ type: "SET_OVERLAY_MODE", mode: "Focus" });

    expect(response).toEqual({ ok: true, data: { mode: "Focus" } });
    expect(executeScript).toHaveBeenCalledWith({ target: { tabId: 17 }, files: ["content-loader.js"] });
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it("does not inject content scripts into restricted extension pages", async () => {
    const executeScript = vi.fn().mockResolvedValue([]);
    const sendMessage = vi.fn();

    vi.stubGlobal("chrome", {
      runtime: { lastError: undefined },
      scripting: { executeScript },
      tabs: {
        query: vi.fn().mockResolvedValue([{ id: 18, url: "chrome-extension://other-extension/sidepanel.html" }]),
        sendMessage
      }
    });

    const response = await sendActiveTabMessage({ type: "SET_OVERLAY_MODE", mode: "All Targets" });

    expect(response).toEqual({ ok: false, error: "unsupported_tab_url: chrome-extension://other-extension/sidepanel.html" });
    expect(executeScript).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
