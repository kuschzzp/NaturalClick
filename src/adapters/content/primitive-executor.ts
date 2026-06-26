import type { BrowserPrimitive, PrimitiveResult } from "../../core/commands/commands";
import type { ControlCandidate, LocatorHint, PageModel } from "../../core/observation/page-model";

export type { PrimitiveResult } from "../../core/commands/commands";

function cssUnescapeIdentifier(value: string): string {
  const idMatch = value.match(/^\[id="(.+)"\]$/);
  if (idMatch) return `#${idMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\")}`;
  return value;
}

function queryByHint(document: Document, hint: LocatorHint): HTMLElement | undefined {
  if (hint.kind === "css") {
    try {
      const selector = cssUnescapeIdentifier(hint.value);
      return document.querySelector<HTMLElement>(selector) ?? undefined;
    } catch {
      return undefined;
    }
  }

  if (hint.kind === "text") {
    const expected = hint.value.toLowerCase();
    return (
      Array.from(document.querySelectorAll<HTMLElement>("button,a,input,textarea,select,[role],[tabindex]")).find((element) =>
        (element.textContent ?? element.getAttribute("aria-label") ?? "").toLowerCase().includes(expected)
      ) ?? undefined
    );
  }

  return undefined;
}

function findControl(pageModel: PageModel, semanticId: string): ControlCandidate | undefined {
  return pageModel.controls.find((control) => control.semanticId === semanticId);
}

function findElementForControl(control: ControlCandidate, document: Document): HTMLElement | undefined {
  for (const hint of control.locatorHints) {
    const element = queryByHint(document, hint);
    if (element) return element;
  }
  return undefined;
}

function dispatchValueEvents(element: HTMLElement): void {
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function setElementValue(element: HTMLElement, value: string): boolean {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    element.value = value;
    dispatchValueEvents(element);
    return true;
  }
  if (element instanceof HTMLSelectElement) {
    element.value = value;
    dispatchValueEvents(element);
    return true;
  }
  if (element.isContentEditable) {
    element.textContent = value;
    dispatchValueEvents(element);
    return true;
  }
  return false;
}

function executeDomClick(primitive: Extract<BrowserPrimitive, { type: "dom_click" }>, pageModel: PageModel): PrimitiveResult {
  const control = findControl(pageModel, primitive.semanticId);
  if (!control) {
    return {
      status: "failed",
      reason: "control_not_found",
      details: { primitive: "dom_click", semanticId: primitive.semanticId }
    };
  }

  const element = findElementForControl(control, document);
  if (!element) {
    return {
      status: "failed",
      reason: "element_not_found",
      details: { primitive: "dom_click", semanticId: primitive.semanticId }
    };
  }

  element.click();
  return {
    status: "success",
    details: { primitive: "dom_click", semanticId: primitive.semanticId, label: control.label }
  };
}

function executeDomInput(primitive: Extract<BrowserPrimitive, { type: "dom_input" }>, pageModel: PageModel): PrimitiveResult {
  const control = findControl(pageModel, primitive.semanticId);
  if (!control) {
    return {
      status: "failed",
      reason: "control_not_found",
      details: { primitive: "dom_input", semanticId: primitive.semanticId }
    };
  }

  const element = findElementForControl(control, document);
  if (!element) {
    return {
      status: "failed",
      reason: "element_not_found",
      details: { primitive: "dom_input", semanticId: primitive.semanticId }
    };
  }

  if (!setElementValue(element, primitive.value)) {
    return {
      status: "failed",
      reason: "element_not_input_capable",
      details: { primitive: "dom_input", semanticId: primitive.semanticId, tag: element.tagName.toLowerCase() }
    };
  }

  return {
    status: "success",
    details: { primitive: "dom_input", semanticId: primitive.semanticId, label: control.label }
  };
}

function executeScroll(primitive: Extract<BrowserPrimitive, { type: "scroll" }>): PrimitiveResult {
  const delta = primitive.direction === "up" ? -primitive.amount : primitive.amount;
  window.scrollBy({ top: delta, behavior: "auto" });
  return {
    status: "success",
    details: { primitive: "scroll", direction: primitive.direction, amount: primitive.amount }
  };
}

function wait(milliseconds: number): Promise<PrimitiveResult> {
  return new Promise((resolve) => {
    window.setTimeout(() => {
      resolve({ status: "success", details: { primitive: "wait", milliseconds } });
    }, milliseconds);
  });
}

export async function executePrimitive(primitive: BrowserPrimitive, pageModel: PageModel): Promise<PrimitiveResult> {
  if (primitive.type === "dom_click") return executeDomClick(primitive, pageModel);
  if (primitive.type === "dom_input") return executeDomInput(primitive, pageModel);
  if (primitive.type === "scroll") return executeScroll(primitive);
  if (primitive.type === "wait") return wait(primitive.milliseconds);

  return {
    status: "failed",
    reason: "unsupported_primitive",
    details: { primitive: primitive.type }
  };
}
