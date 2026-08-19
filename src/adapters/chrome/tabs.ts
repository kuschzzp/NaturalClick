import type { NaturalClickRequest, NaturalClickResponse } from "../../shared/protocol";
import { sendTabMessage } from "./messaging";

function errorResponse<T = never>(error: string): NaturalClickResponse<T> {
  return { ok: false, error };
}

export async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

export async function getTab(tabId: number): Promise<chrome.tabs.Tab | undefined> {
  try {
    return await chrome.tabs.get(tabId);
  } catch {
    return undefined;
  }
}

export function selectNewTaskChildTab(tabs: chrome.tabs.Tab[], tabsBefore: Set<number>, sourceTabId: number): chrome.tabs.Tab | undefined {
  return tabs
    .filter((tab) => tab.id !== undefined && !tabsBefore.has(tab.id) && tab.openerTabId === sourceTabId)
    .sort((left, right) => Number(right.active) - Number(left.active) || right.index - left.index)[0];
}

function isMissingReceivingEnd(error: string): boolean {
  return error.includes("Receiving end does not exist") || error.includes("Could not establish connection");
}

function isInjectableTabUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const protocol = new URL(url).protocol;
    return protocol === "http:" || protocol === "https:" || protocol === "file:";
  } catch {
    return false;
  }
}

async function ensureContentScript(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content-loader.js"]
  });
}

async function sendMessageToKnownTab<TResponse>(
  tab: chrome.tabs.Tab,
  message: NaturalClickRequest
): Promise<NaturalClickResponse<TResponse>> {
  if (!tab?.id) return errorResponse("active_tab_not_found");
  if (!isInjectableTabUrl(tab.url)) return errorResponse(`unsupported_tab_url: ${tab.url ?? "unknown"}`);
  const firstResponse = await sendTabMessage<TResponse>(tab.id, message);
  if (firstResponse.ok || !isMissingReceivingEnd(firstResponse.error)) return firstResponse;

  try {
    await ensureContentScript(tab.id);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return errorResponse(`content_script_unavailable: ${detail}`);
  }
  return sendTabMessage<TResponse>(tab.id, message);
}

export async function sendTabMessageTo<TResponse = unknown>(
  tabId: number,
  message: NaturalClickRequest
): Promise<NaturalClickResponse<TResponse>> {
  const tab = await getTab(tabId);
  if (!tab) return errorResponse("task_tab_not_found");
  return sendMessageToKnownTab<TResponse>(tab, message);
}

export async function sendActiveTabMessage<TResponse = unknown>(
  message: NaturalClickRequest
): Promise<NaturalClickResponse<TResponse>> {
  const tab = await getActiveTab();
  if (!tab) return errorResponse("active_tab_not_found");
  return sendMessageToKnownTab<TResponse>(tab, message);
}

export async function captureVisibleTab(windowId?: number): Promise<string> {
  if (windowId === undefined) {
    return chrome.tabs.captureVisibleTab({ format: "png" });
  }
  return chrome.tabs.captureVisibleTab(windowId, { format: "png" });
}

export async function captureVisibleTabScreenshot(windowId?: number): Promise<{ dataUrl: string; capturedAt: number }> {
  return {
    dataUrl: await captureVisibleTab(windowId),
    capturedAt: Date.now()
  };
}

export async function captureTabScreenshot(tabId: number): Promise<{ dataUrl: string; capturedAt: number }> {
  const target = await getTab(tabId);
  if (!target?.id || target.windowId === undefined) throw new Error("task_tab_not_found");
  const [previousActive] = await chrome.tabs.query({ active: true, windowId: target.windowId });
  const needsActivation = previousActive?.id !== target.id;

  if (needsActivation) await chrome.tabs.update(target.id, { active: true });
  try {
    return await captureVisibleTabScreenshot(target.windowId);
  } finally {
    if (needsActivation && previousActive?.id !== undefined) {
      const [currentActive] = await chrome.tabs.query({ active: true, windowId: target.windowId });
      if (currentActive?.id === target.id) {
        await chrome.tabs.update(previousActive.id, { active: true }).catch(() => undefined);
      }
    }
  }
}
