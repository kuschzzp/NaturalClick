import type { NaturalClickRequest, NaturalClickResponse } from "../../shared/protocol";

function errorResponse<T = never>(error: string): NaturalClickResponse<T> {
  return { ok: false, error };
}

export function sendRuntimeMessage<TResponse = unknown>(
  message: NaturalClickRequest
): Promise<NaturalClickResponse<TResponse>> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response: NaturalClickResponse<TResponse> | undefined) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        resolve(errorResponse(runtimeError.message ?? "runtime_message_failed"));
        return;
      }
      resolve(response ?? errorResponse("empty_runtime_response"));
    });
  });
}

export function sendTabMessage<TResponse = unknown>(
  tabId: number,
  message: NaturalClickRequest
): Promise<NaturalClickResponse<TResponse>> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response: NaturalClickResponse<TResponse> | undefined) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        resolve(errorResponse(runtimeError.message ?? "tab_message_failed"));
        return;
      }
      resolve(response ?? errorResponse("empty_tab_response"));
    });
  });
}
