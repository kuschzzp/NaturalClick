import type { NaturalClickRequest, NaturalClickResponse } from "../../shared/protocol";
import { sendTabMessage } from "./messaging";

function errorResponse<T = never>(error: string): NaturalClickResponse<T> {
  return { ok: false, error };
}

export async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

export async function sendActiveTabMessage<TResponse = unknown>(
  message: NaturalClickRequest
): Promise<NaturalClickResponse<TResponse>> {
  const tab = await getActiveTab();
  if (!tab?.id) return errorResponse("active_tab_not_found");
  return sendTabMessage<TResponse>(tab.id, message);
}

export async function captureVisibleTab(windowId?: number): Promise<string> {
  if (windowId === undefined) {
    return chrome.tabs.captureVisibleTab({ format: "png" });
  }
  return chrome.tabs.captureVisibleTab(windowId, { format: "png" });
}
