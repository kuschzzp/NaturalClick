import { executePrimitive } from "../adapters/content/primitive-executor";
import { observePage } from "../adapters/content/dom-observer";
import { clearOverlay, highlightTarget, setOverlayMode } from "../adapters/content/overlay-controller";
import { overlayTargetsFromPage } from "../shared/overlay-targets";
import type { NaturalClickRequest, NaturalClickResponse } from "../shared/protocol";

const OVERLAY_OBSERVATION_LIMIT = 600;
const PRIMITIVE_SETTLE_OPTIONS = {
  quietMs: 120,
  maxMs: 800,
  pollMs: 40
} as const;
let activePrimitiveController: AbortController | undefined;
let activePrimitiveExecutionId = 0;

function okResponse<T>(data: T): NaturalClickResponse<T> {
  return { ok: true, data };
}

function errorResponse(error: string): NaturalClickResponse<never> {
  return { ok: false, error };
}

function installRouteOverlayReset(): void {
  let lastHref = globalThis.location?.href ?? "";
  const maybeClear = (): void => {
    const currentHref = globalThis.location?.href ?? "";
    if (currentHref === lastHref) return;
    lastHref = currentHref;
    clearOverlay();
  };

  for (const method of ["pushState", "replaceState"] as const) {
    const original = history[method];
    history[method] = function patchedHistoryMethod(this: History, ...args: Parameters<History[typeof method]>): ReturnType<History[typeof method]> {
      const result = original.apply(this, args);
      queueMicrotask(maybeClear);
      return result;
    };
  }

  globalThis.addEventListener("hashchange", maybeClear, true);
  globalThis.addEventListener("popstate", maybeClear, true);
  globalThis.addEventListener("beforeunload", clearOverlay, true);
}

installRouteOverlayReset();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const request = message as Partial<NaturalClickRequest> | undefined;
  if (!request?.type) return false;

  if (request.type === "NATURALCLICK_PING") {
    sendResponse(okResponse({ source: "content" }));
    return true;
  }

  if (request.type === "OBSERVE_PAGE") {
    const observeRequest = request as Extract<NaturalClickRequest, { type: "OBSERVE_PAGE" }>;
    sendResponse(
      okResponse(
        observePage(document, {
          request: observeRequest.observationRequest,
          observationRound: observeRequest.observationRound,
          candidateLimit: observeRequest.candidateLimit,
          mode: observeRequest.mode
        })
      )
    );
    return true;
  }

  if (request.type === "EXECUTE_PRIMITIVE") {
    const executeRequest = request as Extract<NaturalClickRequest, { type: "EXECUTE_PRIMITIVE" }>;
    const controller = new AbortController();
    const executionId = activePrimitiveExecutionId + 1;
    activePrimitiveExecutionId = executionId;
    activePrimitiveController?.abort();
    activePrimitiveController = controller;
    void executePrimitive(executeRequest.primitive, executeRequest.pageModel ?? observePage(document), {
      signal: controller.signal,
      settle: PRIMITIVE_SETTLE_OPTIONS
    })
      .then((result) => sendResponse(okResponse(result)))
      .catch((error: unknown) => sendResponse(errorResponse(error instanceof Error ? error.message : "primitive_error")))
      .finally(() => {
        if (activePrimitiveExecutionId === executionId) {
          activePrimitiveController = undefined;
        }
      });
    return true;
  }

  if (request.type === "CANCEL_ACTIVE_PRIMITIVE") {
    const cancelRequest = request as Extract<NaturalClickRequest, { type: "CANCEL_ACTIVE_PRIMITIVE" }>;
    const hadActivePrimitive = Boolean(activePrimitiveController && !activePrimitiveController.signal.aborted);
    activePrimitiveController?.abort();
    sendResponse(okResponse({ aborted: hadActivePrimitive, reason: cancelRequest.reason ?? "user_requested" }));
    return true;
  }

  if (request.type === "SET_OVERLAY_MODE") {
    const overlayRequest = request as Extract<NaturalClickRequest, { type: "SET_OVERLAY_MODE" }>;
    const targets =
      overlayRequest.mode === "Off"
        ? []
        : overlayRequest.targets?.length
          ? overlayRequest.targets
          : overlayTargetsFromPage(observePage(document, { candidateLimit: OVERLAY_OBSERVATION_LIMIT }));
    setOverlayMode(overlayRequest.mode, targets);
    sendResponse(okResponse({ mode: overlayRequest.mode, targetCount: targets.length }));
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
