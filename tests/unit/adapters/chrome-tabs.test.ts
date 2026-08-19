import { afterEach, describe, expect, it, vi } from "vitest";
import { captureTabScreenshot, selectNewTaskChildTab, sendActiveTabMessage, sendTabMessageTo } from "../../../src/adapters/chrome/tabs";

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

  it("routes task messages to the bound tab instead of the currently active tab", async () => {
    const sendMessage = vi.fn((_tabId: number, _message: unknown, callback: (response?: unknown) => void) => {
      callback({ ok: true, data: { page: "A" } });
    });
    const query = vi.fn().mockResolvedValue([{ id: 22, url: "https://b.example.test" }]);

    vi.stubGlobal("chrome", {
      runtime: { lastError: undefined },
      scripting: { executeScript: vi.fn() },
      tabs: {
        get: vi.fn().mockResolvedValue({ id: 17, url: "https://a.example.test" }),
        query,
        sendMessage
      }
    });

    await expect(sendTabMessageTo(17, { type: "OBSERVE_PAGE" })).resolves.toEqual({ ok: true, data: { page: "A" } });
    expect(sendMessage).toHaveBeenCalledWith(17, { type: "OBSERVE_PAGE" }, expect.any(Function));
    expect(query).not.toHaveBeenCalled();
  });

  it("temporarily activates a background task tab for screenshots and restores the previous tab", async () => {
    const update = vi.fn().mockResolvedValue({});
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ id: 22, windowId: 3, active: true }])
      .mockResolvedValueOnce([{ id: 17, windowId: 3, active: true }]);
    const captureVisibleTab = vi.fn().mockResolvedValue("data:image/png;base64,shot");

    vi.stubGlobal("chrome", {
      tabs: {
        get: vi.fn().mockResolvedValue({ id: 17, windowId: 3, active: false, url: "https://a.example.test" }),
        query,
        update,
        captureVisibleTab
      }
    });

    const screenshot = await captureTabScreenshot(17);

    expect(screenshot.dataUrl).toBe("data:image/png;base64,shot");
    expect(update.mock.calls).toEqual([[17, { active: true }], [22, { active: true }]]);
    expect(captureVisibleTab).toHaveBeenCalledWith(3, { format: "png" });
  });

  it("does not override a user tab switch that happens while a task screenshot is captured", async () => {
    const update = vi.fn().mockResolvedValue({});
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ id: 22, windowId: 3, active: true }])
      .mockResolvedValueOnce([{ id: 23, windowId: 3, active: true }]);

    vi.stubGlobal("chrome", {
      tabs: {
        get: vi.fn().mockResolvedValue({ id: 17, windowId: 3, active: false, url: "https://a.example.test" }),
        query,
        update,
        captureVisibleTab: vi.fn().mockResolvedValue("data:image/png;base64,shot")
      }
    });

    await captureTabScreenshot(17);

    expect(update.mock.calls).toEqual([[17, { active: true }]]);
  });

  it("adopts only a new tab opened by the bound task tab", () => {
    const selected = selectNewTaskChildTab(
      [
        { id: 23, openerTabId: 99, active: true, index: 3 },
        { id: 24, openerTabId: 17, active: false, index: 4 },
        { id: 22, active: true, index: 2 }
      ] as chrome.tabs.Tab[],
      new Set([17, 22]),
      17
    );

    expect(selected?.id).toBe(24);
  });
});
