import { executePrimitive } from "../adapters/content/primitive-executor";
import { observePage } from "../adapters/content/dom-observer";
import { highlightTarget, setOverlayMode } from "../adapters/content/overlay-controller";
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
    const overlayRequest = request as Extract<NaturalClickRequest, { type: "SET_OVERLAY_MODE" }>;
    setOverlayMode(overlayRequest.mode, overlayRequest.targets ?? []);
    sendResponse(okResponse({ mode: overlayRequest.mode }));
    return true;
  }

  if (request.type === "HIGHLIGHT_TARGET") {
    const highlightRequest = request as Extract<NaturalClickRequest, { type: "HIGHLIGHT_TARGET" }>;
    highlightTarget(highlightRequest.semanticId);
    sendResponse(okResponse({ semanticId: highlightRequest.semanticId }));
    return true;
  }

  return false;
});
