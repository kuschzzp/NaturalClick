import { executePrimitive } from "../adapters/content/primitive-executor";
import { observePage } from "../adapters/content/dom-observer";
import type { NaturalClickRequest, NaturalClickResponse } from "../shared/protocol";

function okResponse<T>(data: T): NaturalClickResponse<T> {
  return { ok: true, data };
}

function errorResponse(error: string): NaturalClickResponse<never> {
  return { ok: false, error };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const request = message as Partial<NaturalClickRequest> | undefined;
  if (!request?.type) return false;

  if (request.type === "NATURALCLICK_PING") {
    sendResponse(okResponse({ source: "content" }));
    return true;
  }

  if (request.type === "OBSERVE_PAGE") {
    sendResponse(okResponse(observePage(document)));
    return true;
  }

  if (request.type === "EXECUTE_PRIMITIVE") {
    const executeRequest = request as Extract<NaturalClickRequest, { type: "EXECUTE_PRIMITIVE" }>;
    void executePrimitive(executeRequest.primitive, executeRequest.pageModel ?? observePage(document))
      .then((result) => sendResponse(okResponse(result)))
      .catch((error: unknown) => sendResponse(errorResponse(error instanceof Error ? error.message : "primitive_error")));
    return true;
  }

  if (request.type === "SET_OVERLAY_MODE") {
    document.documentElement.dataset.naturalclickOverlayMode = request.mode;
    sendResponse(okResponse({ mode: request.mode }));
    return true;
  }

  if (request.type === "HIGHLIGHT_TARGET") {
    document.documentElement.dataset.naturalclickHighlight = request.semanticId;
    sendResponse(okResponse({ semanticId: request.semanticId }));
    return true;
  }

  return false;
});
