import type { BrowserPrimitive, PrimitiveResult } from "../../core/commands/commands";
import type { ControlCandidate, LocatorHint, PageModel, TextBlock } from "../../core/observation/page-model";
import { waitForActionSettle, type ActionSettleOptions } from "./action-settle";
import { findElementByPageNodeHandle, PAGE_NODE_HANDLE_ATTRIBUTE } from "./page-node-index";

export type { PrimitiveResult } from "../../core/commands/commands";

interface ElementLookupResult {
  element?: HTMLElement;
  attemptedHints: string[];
}

const textTargetSelector = [
  "button",
  "a",
  "input",
  "textarea",
  "select",
  "nav li",
  "aside li",
  "[role]",
  "[role='listitem']",
  "[role='navigation'] li",
  "[role='menu'] li",
  "[role='menubar'] li",
  "[tabindex]",
  "[onclick]",
  "[data-action]",
  "[data-click]",
  ".el-button",
  ".el-menu li",
  ".el-menu-item",
  ".el-sub-menu__title",
  ".el-tabs__item",
  ".ant-btn",
  ".ant-menu li",
  ".ant-menu-item",
  ".ant-menu-submenu-title",
  ".ant-tabs-tab",
  ".ivu-btn",
  ".ivu-menu li",
  ".ivu-menu-item",
  ".arco-btn",
  ".arco-menu li",
  ".arco-menu-item",
  ".van-button"
].join(",");

const optionTargetSelector = [
  "option",
  "[role='option']",
  "[role='menuitem']",
  "[role='listitem']",
  "[aria-selected]",
  "[data-value]",
  ".el-option",
  ".el-select-dropdown__item",
  ".ant-select-item-option",
  ".arco-select-option",
  ".ivu-select-item",
  ".van-dropdown-item",
  "li"
].join(",");

function cssAttribute(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function cssUnescapeIdentifier(value: string): string {
  const idMatch = value.match(/^\[id="(.+)"\]$/);
  if (idMatch) return `#${idMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\")}`;
  return value;
}

function parseAttributeHint(value: string): { name: string; value: string } | undefined {
  const match = value.match(/^([a-zA-Z_][\w:.-]*)=(.+)$/);
  if (!match) return undefined;
  return { name: match[1], value: match[2] };
}

function pageNodeHandleFromHint(hint: LocatorHint): string | undefined {
  if (hint.kind !== "attribute") return undefined;
  const parsed = parseAttributeHint(hint.value);
  return parsed?.name === PAGE_NODE_HANDLE_ATTRIBUTE ? parsed.value : undefined;
}

function normalizeSearchText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function searchableElementText(element: HTMLElement): string {
  return [
    element.textContent,
    element.getAttribute("aria-label"),
    element.getAttribute("placeholder"),
    element.getAttribute("title"),
    element.getAttribute("alt"),
    element.getAttribute("name"),
    "value" in element ? String((element as HTMLInputElement).value ?? "") : undefined
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function visibleRank(element: HTMLElement): number {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 ? 0 : 1;
}

function hitTestRank(element: HTMLElement): number {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return 1;
  const view = element.ownerDocument.defaultView;
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  if (!view || x < 0 || y < 0 || x > view.innerWidth || y > view.innerHeight) return 1;
  const hit = element.ownerDocument.elementFromPoint?.(x, y);
  if (!hit) return 0;
  return element === hit || element.contains(hit) || hit.contains(element) ? 0 : 1;
}

function bestTextMatch(document: Document, expected: string): HTMLElement | undefined {
  const normalizedExpected = normalizeSearchText(expected);
  if (!normalizedExpected) return undefined;

  return Array.from(document.querySelectorAll<HTMLElement>(textTargetSelector))
    .map((element, index) => ({ element, index, text: normalizeSearchText(searchableElementText(element)) }))
    .filter((item) => item.text.includes(normalizedExpected))
    .sort((left, right) => {
      const leftExact = left.text === normalizedExpected ? 0 : 1;
      const rightExact = right.text === normalizedExpected ? 0 : 1;
      return (
        hitTestRank(left.element) - hitTestRank(right.element) ||
        leftExact - rightExact ||
        visibleRank(left.element) - visibleRank(right.element) ||
        left.text.length - right.text.length ||
        left.index - right.index
      );
    })[0]?.element;
}

function selectorForRole(role: string): string | undefined {
  const normalized = role.toLowerCase();
  if (normalized === "button") {
    return [
      "button",
      "[role='button']",
      "input[type='button']",
      "input[type='submit']",
      "input[type='reset']",
      ".el-button",
      ".ant-btn",
      ".ivu-btn",
      ".arco-btn",
      ".van-button",
      "[onclick]",
      "[data-action]",
      "[data-click]"
    ].join(",");
  }
  if (normalized === "link") return "a[href],[role='link']";
  if (normalized === "textbox") {
    return [
      "textarea",
      "[role='textbox']",
      "input:not([type])",
      "input[type='text']",
      "input[type='email']",
      "input[type='password']",
      "input[type='search']",
      "input[type='tel']",
      "input[type='url']",
      "input[type='number']"
    ].join(",");
  }
  if (normalized === "combobox") return "select,[role='combobox']";
  if (normalized === "checkbox") return "input[type='checkbox'],[role='checkbox']";
  if (normalized === "radio") return "input[type='radio'],[role='radio']";
  if (normalized === "menuitem") return "[role='menuitem'],.el-menu-item,.el-sub-menu__title,.ant-menu-item,.ant-menu-submenu-title,.ivu-menu-item,.arco-menu-item";
  if (normalized === "listitem") return "[role='listitem'],nav li,aside li,[role='menu'] li,.el-menu li,.ant-menu li,.ivu-menu li,.arco-menu li";
  if (normalized === "tab") return "[role='tab'],.el-tabs__item,.ant-tabs-tab,.arco-tabs-header-title";
  if (normalized === "option") return "[role='option'],.el-option,.ant-select-item-option,.arco-select-option";
  if (normalized === "switch") return "[role='switch'],.el-switch,.ant-switch,.arco-switch";
  return `[role="${cssAttribute(role)}"]`;
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

  if (hint.kind === "attribute") {
    const parsed = parseAttributeHint(hint.value);
    if (!parsed) return undefined;
    try {
      return document.querySelector<HTMLElement>(`[${parsed.name}="${cssAttribute(parsed.value)}"]`) ?? undefined;
    } catch {
      return undefined;
    }
  }

  if (hint.kind === "text") {
    return bestTextMatch(document, hint.value);
  }

  if (hint.kind === "role") {
    const selector = selectorForRole(hint.value);
    if (!selector) return undefined;
    try {
      const matches = Array.from(document.querySelectorAll<HTMLElement>(selector)).filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      return matches.length === 1 ? matches[0] : undefined;
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function findControl(pageModel: PageModel, semanticId: string): ControlCandidate | undefined {
  return pageModel.controls.find((control) => control.semanticId === semanticId);
}

function findTextBlock(pageModel: PageModel, semanticId: string): TextBlock | undefined {
  return pageModel.textBlocks.find((block) => block.semanticId === semanticId);
}

function findElementForControl(control: ControlCandidate, document: Document): ElementLookupResult {
  const attemptedHints: string[] = [];
  for (const hint of control.locatorHints) {
    attemptedHints.push(`${hint.kind}:${hint.value}`);
    const handle = pageNodeHandleFromHint(hint);
    if (handle) {
      const element = findElementByPageNodeHandle(document, handle);
      if (element) return { element, attemptedHints };
    }
    const element = queryByHint(document, hint);
    if (element) return { element, attemptedHints };
  }
  return { attemptedHints };
}

function findElementForTextBlock(block: TextBlock, document: Document): ElementLookupResult {
  const attemptedHints: string[] = [];
  for (const hint of block.locatorHints) {
    attemptedHints.push(`${hint.kind}:${hint.value}`);
    const handle = pageNodeHandleFromHint(hint);
    if (handle) {
      const element = findElementByPageNodeHandle(document, handle);
      if (element) return { element, attemptedHints };
    }
    const element = queryByHint(document, hint);
    if (element) return { element, attemptedHints };
  }
  return { attemptedHints };
}

function dispatchValueEvents(element: HTMLElement): void {
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value");
  if (descriptor?.set) descriptor.set.call(element, value);
  else element.value = value;
}

function normalizedOptionText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function selectedOptionText(element: HTMLElement): string | undefined {
  if (!(element instanceof HTMLSelectElement)) return undefined;
  return element.selectedOptions[0]?.textContent?.trim() || undefined;
}

function optionMatchesValue(option: HTMLOptionElement, value: string): boolean {
  const expected = normalizedOptionText(value);
  if (!expected) return false;
  return [option.value, option.label, option.textContent ?? ""].some((item) => normalizedOptionText(item) === expected);
}

function setSelectValue(element: HTMLSelectElement, value: string): void {
  const option = Array.from(element.options).find((candidate) => optionMatchesValue(candidate, value));
  if (option) {
    element.selectedIndex = option.index;
    if (element.multiple) option.selected = true;
    return;
  }
  setNativeValue(element, value);
}

function isContentEditableElement(element: HTMLElement): boolean {
  const contentEditable = element.getAttribute("contenteditable");
  return element.isContentEditable || contentEditable === "" || contentEditable?.toLowerCase() === "true";
}

function setElementValue(element: HTMLElement, value: string): boolean {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    setNativeValue(element, value);
    dispatchValueEvents(element);
    return true;
  }
  if (element instanceof HTMLSelectElement) {
    setSelectValue(element, value);
    dispatchValueEvents(element);
    return true;
  }
  if (isContentEditableElement(element)) {
    element.focus?.();
    element.textContent = "";
    const inserted = element.ownerDocument.execCommand?.("insertText", false, value) ?? false;
    if (!inserted) element.textContent = value;
    dispatchValueEvents(element);
    return true;
  }
  return false;
}

function readableValue(element: HTMLElement): string | undefined {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    return element.value;
  }
  if (isContentEditableElement(element)) return element.textContent ?? "";
  return undefined;
}

function normalizeReadableText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function elementReadableText(element: HTMLElement): string {
  return normalizeReadableText(
    [
      readableValue(element),
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.getAttribute("alt"),
      element.textContent
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function controlReadableText(control: ControlCandidate, element?: HTMLElement): string {
  return normalizeReadableText(
    [
      control.label,
      control.accessibleName && control.accessibleName !== control.label ? control.accessibleName : undefined,
      control.description,
      element ? elementReadableText(element) : undefined,
      control.valueState && control.valueState !== "empty" ? control.valueState : undefined
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function isGenericReadQuery(query?: string): boolean {
  const normalized = normalizeSearchText(query ?? "");
  return !normalized || /^(?:当前页面|当前页|本页|页面|内容|page|current page|this page|content|page content|read content)$/iu.test(normalized);
}

function pageReadableText(pageModel: PageModel, query?: string): string {
  const normalizedQuery = isGenericReadQuery(query) ? "" : normalizeSearchText(query ?? "");
  const textBlockText = pageModel.textBlocks
    .filter((block) => block.visibility === "visible")
    .filter((block) => !normalizedQuery || normalizeSearchText(`${block.text} ${block.role ?? ""} ${block.kind}`).includes(normalizedQuery))
    .map((block) => block.text);
  const readable = pageModel.readableContent.filter((item) => !normalizedQuery || normalizeSearchText(item).includes(normalizedQuery));
  const feedback = pageModel.feedback.filter((item) => !normalizedQuery || normalizeSearchText(item).includes(normalizedQuery));
  const content = [...feedback, ...textBlockText, ...readable];
  return normalizeReadableText(content.join("\n"));
}

function optionElementText(element: HTMLElement): string {
  return [
    element.textContent,
    element.getAttribute("aria-label"),
    element.getAttribute("title"),
    element.getAttribute("data-value"),
    element.getAttribute("value")
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function optionTextMatchesValue(element: HTMLElement, value: string): boolean {
  const expected = normalizedOptionText(value);
  if (!expected) return false;
  return [
    element.textContent,
    element.getAttribute("aria-label"),
    element.getAttribute("title"),
    element.getAttribute("data-value"),
    element.getAttribute("value")
  ].some((item) => normalizedOptionText(item ?? "") === expected);
}

function findVisibleOptionElement(document: Document, owner: HTMLElement, value: string): HTMLElement | undefined {
  return Array.from(document.querySelectorAll<HTMLElement>(optionTargetSelector))
    .map((element, index) => ({ element, index, text: optionElementText(element) }))
    .filter((item) => item.element !== owner && !owner.contains(item.element))
    .filter((item) => domElementVisible(item.element))
    .filter((item) => optionTextMatchesValue(item.element, value))
    .sort((left, right) => {
      const leftSelected = left.element.getAttribute("aria-selected") === "true" ? 0 : 1;
      const rightSelected = right.element.getAttribute("aria-selected") === "true" ? 0 : 1;
      return leftSelected - rightSelected || left.text.length - right.text.length || left.index - right.index;
    })[0]?.element;
}

function checkedStateForElement(element: HTMLElement): boolean | "mixed" | undefined {
  if (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")) {
    return element.indeterminate ? "mixed" : element.checked;
  }
  const ariaChecked = element.getAttribute("aria-checked")?.toLowerCase();
  if (ariaChecked === "true") return true;
  if (ariaChecked === "false") return false;
  if (ariaChecked === "mixed") return "mixed";
  return undefined;
}

function valueStateAfter(element: HTMLElement): "empty" | "filled" | "selected" | "checked" | "unchecked" | "mixed" | undefined {
  const checkedState = checkedStateForElement(element);
  if (checkedState === true) return "checked";
  if (checkedState === false) return "unchecked";
  if (checkedState === "mixed") return "mixed";
  if (element instanceof HTMLInputElement) {
    if (element.type === "checkbox" || element.type === "radio") return element.checked ? "checked" : "unchecked";
    return element.value ? "filled" : "empty";
  }
  if (element instanceof HTMLTextAreaElement) return element.value ? "filled" : "empty";
  if (element instanceof HTMLSelectElement) return element.value ? "selected" : "empty";
  if (isContentEditableElement(element)) return element.textContent ? "filled" : "empty";
  return undefined;
}

function mouseEventInitFor(element: HTMLElement): MouseEventInit {
  const rect = element.getBoundingClientRect();
  const clientX = rect.width > 0 ? rect.left + rect.width / 2 : 0;
  const clientY = rect.height > 0 ? rect.top + rect.height / 2 : 0;
  return {
    bubbles: true,
    cancelable: true,
    composed: true,
    button: 0,
    buttons: 1,
    clientX,
    clientY
  };
}

function dispatchPointerLikeEvent(element: HTMLElement, type: string, init: MouseEventInit): boolean {
  const view = element.ownerDocument.defaultView;
  const PointerEventConstructor = view?.PointerEvent;
  if (PointerEventConstructor) {
    return element.dispatchEvent(
      new PointerEventConstructor(type, {
        ...init,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true
      } as PointerEventInit)
    );
  }
  return element.dispatchEvent(new MouseEvent(type, init));
}

function dispatchUserClick(element: HTMLElement): void {
  element.scrollIntoView?.({ block: "center", inline: "center" });
  element.focus?.({ preventScroll: true });
  const init = mouseEventInitFor(element);
  dispatchPointerLikeEvent(element, "pointerover", init);
  element.dispatchEvent(new MouseEvent("mouseover", init));
  dispatchPointerLikeEvent(element, "pointerenter", init);
  element.dispatchEvent(new MouseEvent("mouseenter", init));
  dispatchPointerLikeEvent(element, "pointerdown", init);
  element.dispatchEvent(new MouseEvent("mousedown", init));
  dispatchPointerLikeEvent(element, "pointerup", { ...init, buttons: 0 });
  element.dispatchEvent(new MouseEvent("mouseup", { ...init, buttons: 0 }));
  element.click();
}

function keyEventInit(key: string): KeyboardEventInit {
  return {
    key,
    code: key === " " ? "Space" : key,
    bubbles: true,
    cancelable: true,
    composed: true
  };
}

function activeKeyTarget(document: Document): HTMLElement {
  const active = document.activeElement;
  if (active instanceof HTMLElement) return active;
  return document.body ?? document.documentElement;
}

function submitFormForKeyTarget(target: HTMLElement): boolean {
  const form = target.closest("form");
  if (!(form instanceof HTMLFormElement)) return false;
  if (target instanceof HTMLTextAreaElement || isContentEditableElement(target)) return false;
  if (typeof form.requestSubmit === "function") {
    try {
      form.requestSubmit();
      return true;
    } catch {
      // Older DOM shims can expose requestSubmit but not implement it.
    }
  }
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  return true;
}

function keyDefaultAction(target: HTMLElement, key: string): string | undefined {
  const clickable = target.closest<HTMLElement>("button,a[href],[role='button'],[role='menuitem'],[role='option'],[role='tab']");
  if ((key === "Enter" || key === " ") && clickable) {
    dispatchUserClick(clickable);
    return "activate_focused_target";
  }
  if (key === "Enter" && submitFormForKeyTarget(target)) return "submit_form";
  return undefined;
}

function executeKeyPress(primitive: Extract<BrowserPrimitive, { type: "key_press" }>): PrimitiveResult {
  const target = activeKeyTarget(document);
  const init = keyEventInit(primitive.key);
  const keydownAllowed = target.dispatchEvent(new KeyboardEvent("keydown", init));
  const defaultAction = keydownAllowed ? keyDefaultAction(target, primitive.key) : undefined;
  target.dispatchEvent(new KeyboardEvent("keyup", init));
  return {
    status: "success",
    details: {
      primitive: "key_press",
      key: primitive.key,
      targetTag: target.tagName.toLowerCase(),
      defaultAction,
      defaultPrevented: !keydownAllowed
    }
  };
}

function expandedStateAround(element: HTMLElement): "expanded" | "collapsed" | "unknown" {
  const expandedElement = element.closest<HTMLElement>("[aria-expanded]");
  const ariaExpanded = expandedElement?.getAttribute("aria-expanded") ?? element.getAttribute("aria-expanded");
  if (ariaExpanded === "true") return "expanded";
  if (ariaExpanded === "false") return "collapsed";
  return "unknown";
}

function classIdText(element: HTMLElement): string {
  const className = typeof element.className === "string" ? element.className : "";
  return `${element.id} ${className}`.toLowerCase();
}

function isMenuTreeElement(element: HTMLElement): boolean {
  return Boolean(
    element.closest(
      "nav,aside,[role='navigation'],[role='menu'],[role='menubar'],.el-menu,.ant-menu,.ivu-menu,.arco-menu,.van-sidebar,.sidebar,.side-menu,.nav-menu"
    )
  );
}

function closestExpandableElement(element: HTMLElement): HTMLElement | undefined {
  return (
    element.closest<HTMLElement>(
      "[aria-expanded],[aria-haspopup],.el-sub-menu,.el-sub-menu__title,.ant-menu-submenu,.ant-menu-submenu-title,.ivu-menu-submenu,.arco-menu-submenu,.sub-menu,.submenu,.dropdown"
    ) ?? undefined
  );
}

function domLooksExpandable(element: HTMLElement): boolean {
  const expandable = closestExpandableElement(element);
  if (expandable) return true;
  if (element.querySelector("ul,[role='menu'],[role='group'],[role='tree']")) return true;
  return /\b(submenu|sub-menu|dropdown|expandable|has-children)\b/.test(classIdText(element));
}

function normalizeElementText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function directElementText(element: HTMLElement): string {
  return Array.from(element.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent ?? "")
    .join(" ");
}

function elementOwnLabel(element: HTMLElement): string {
  const directText = directElementText(element).trim();
  return normalizeElementText(
    [
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.getAttribute("alt"),
      directText,
      !directText && element.children.length === 0 ? element.textContent : undefined
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function elementOwnLabelMatchesControl(control: ControlCandidate, element: HTMLElement): boolean {
  const elementLabel = elementOwnLabel(element);
  const controlLabel = normalizeElementText(control.label || control.accessibleName);
  return Boolean(elementLabel && controlLabel && elementLabel === controlLabel);
}

function domElementVisible(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  return style?.display !== "none" && style?.visibility !== "hidden" && style?.opacity !== "0";
}

function domExpandedByClass(element: HTMLElement): boolean {
  const expandable = closestExpandableElement(element) ?? element;
  return /\b(is-open|is-active|is-expanded|expanded|open)\b/.test(classIdText(expandable));
}

function hasVisibleRelatedChild(control: ControlCandidate, pageModel: PageModel, document: Document): boolean {
  for (const childRef of control.childRefs ?? []) {
    const child = findControl(pageModel, childRef);
    const childLookup = child ? findElementForControl(child, document) : undefined;
    if (childLookup?.element && domElementVisible(childLookup.element)) return true;
  }
  return false;
}

function targetLooksExpanded(control: ControlCandidate, pageModel: PageModel, element: HTMLElement): boolean {
  return (
    expandedStateAround(element) === "expanded" ||
    domExpandedByClass(element) ||
    hasVisibleRelatedChild(control, pageModel, element.ownerDocument)
  );
}

function isPlainNavigationLink(control: ControlCandidate, element: HTMLElement): boolean {
  const anchor = element.closest("a[href]");
  return Boolean(anchor && control.role.toLowerCase() === "link" && !domLooksExpandable(element));
}

function shouldTryExpansionRecovery(control: ControlCandidate, element: HTMLElement): boolean {
  if (control.expandedState === "expanded") return false;
  if (isPlainNavigationLink(control, element)) return false;
  const role = control.role.toLowerCase();
  const menuLike =
    role === "menuitem" ||
    role === "listitem" ||
    control.regionRef === "sidebar" ||
    control.regionRef === "navigation" ||
    control.interactionHints.some((hint) => /menu|submenu|dropdown/.test(hint.toLowerCase())) ||
    isMenuTreeElement(element);
  if (!menuLike) return false;
  return (
    control.expandedState === "collapsed" ||
    control.expandedState === "unknown" ||
    expandedStateAround(element) === "collapsed" ||
    Boolean(control.childRefs?.length) ||
    (domLooksExpandable(element) && elementOwnLabelMatchesControl(control, element))
  );
}

function pointKey(point: { x: number; y: number }): string {
  return `${Math.round(point.x)}:${Math.round(point.y)}`;
}

function alternativeClickPoints(control: ControlCandidate): Array<{ x: number; y: number }> {
  if (!control.bounds || control.bounds.width <= 0 || control.bounds.height <= 0) return [];
  const { x, y, width, height } = control.bounds;
  const centerY = y + height / 2;
  const points = [
    control.clickablePoint,
    { x: x + width / 2, y: centerY },
    { x: x + Math.max(8, Math.min(width * 0.25, 32)), y: centerY },
    { x: x + Math.max(8, width - Math.max(8, Math.min(width * 0.12, 24))), y: centerY }
  ].filter((point): point is { x: number; y: number } => Boolean(point));
  const seen = new Set<string>();
  return points.filter((point) => {
    const key = pointKey(point);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function clickElementAtPoint(document: Document, point: { x: number; y: number }): HTMLElement | undefined {
  const element = document.elementFromPoint?.(point.x, point.y);
  if (!(element instanceof HTMLElement)) return undefined;
  dispatchUserClick(element);
  return element;
}

function tryExpandTarget(control: ControlCandidate, pageModel: PageModel, currentElement: HTMLElement): HTMLElement | undefined {
  if (!shouldTryExpansionRecovery(control, currentElement)) return undefined;
  if (targetLooksExpanded(control, pageModel, currentElement)) return undefined;

  for (const point of alternativeClickPoints(control)) {
    const clicked = clickElementAtPoint(currentElement.ownerDocument, point);
    if (!clicked) continue;
    if (targetLooksExpanded(control, pageModel, clicked) || targetLooksExpanded(control, pageModel, currentElement)) return clicked;
  }

  if (control.parentRef) {
    const parent = findControl(pageModel, control.parentRef);
    const parentLookup = parent ? findElementForControl(parent, currentElement.ownerDocument) : undefined;
    if (parent && parentLookup?.element) {
      dispatchUserClick(parentLookup.element);
      if (targetLooksExpanded(parent, pageModel, parentLookup.element) || targetLooksExpanded(control, pageModel, currentElement)) {
        return parentLookup.element;
      }
    }
  }

  return undefined;
}

function executeDomClick(primitive: Extract<BrowserPrimitive, { type: "dom_click" }>, pageModel: PageModel): PrimitiveResult {
  const control = findControl(pageModel, primitive.semanticId);
  const textBlock = control ? undefined : findTextBlock(pageModel, primitive.semanticId);
  const lookup = control ? findElementForControl(control, document) : textBlock ? findElementForTextBlock(textBlock, document) : undefined;
  if (!lookup) {
    return {
      status: "failed",
      reason: "target_not_found",
      details: { primitive: "dom_click", semanticId: primitive.semanticId }
    };
  }
  const element = lookup.element;
  if (!element) {
    return {
      status: "failed",
      reason: "element_not_found",
      details: { primitive: "dom_click", semanticId: primitive.semanticId, attemptedHints: lookup.attemptedHints }
    };
  }

  dispatchUserClick(element);
  const expandedBy = control ? tryExpandTarget(control, pageModel, element) : undefined;
  const checkedState = checkedStateForElement(element);
  return {
    status: "success",
    details: {
      primitive: "dom_click",
      semanticId: primitive.semanticId,
      label: control?.label ?? textBlock?.text,
      checkedStateAfter: checkedState,
      valueStateAfter: valueStateAfter(element),
      expandedRetry: Boolean(expandedBy),
      expandedRetryTag: expandedBy?.tagName.toLowerCase()
    }
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

  const lookup = findElementForControl(control, document);
  const element = lookup.element;
  if (!element) {
    return {
      status: "failed",
      reason: "element_not_found",
      details: { primitive: "dom_input", semanticId: primitive.semanticId, attemptedHints: lookup.attemptedHints }
    };
  }

  if (!setElementValue(element, primitive.value)) {
    return {
      status: "failed",
      reason: "element_not_input_capable",
      details: { primitive: "dom_input", semanticId: primitive.semanticId, tag: element.tagName.toLowerCase() }
    };
  }

  const actualValue = readableValue(element);
  const actualSelectedText = selectedOptionText(element);
  const selectedTextMatchesExpected =
    actualSelectedText !== undefined && normalizedOptionText(actualSelectedText) === normalizedOptionText(primitive.value);
  return {
    status: "success",
    details: {
      primitive: "dom_input",
      semanticId: primitive.semanticId,
      label: control.label,
      valueApplied: actualValue !== undefined,
      valueMatchesExpected: actualValue === primitive.value || selectedTextMatchesExpected,
      expectedValueLength: primitive.value.length,
      actualValueLength: actualValue?.length,
      selectedOptionText: actualSelectedText,
      valueStateAfter: valueStateAfter(element)
    }
  };
}

function nativeSelectResult(
  primitive: Extract<BrowserPrimitive, { type: "dom_select_option" }>,
  control: ControlCandidate,
  element: HTMLSelectElement
): PrimitiveResult {
  setSelectValue(element, primitive.value);
  dispatchValueEvents(element);
  const actualValue = readableValue(element);
  const actualSelectedText = selectedOptionText(element);
  const selectedTextMatchesExpected =
    actualSelectedText !== undefined && normalizedOptionText(actualSelectedText) === normalizedOptionText(primitive.value);
  return {
    status: "success",
    details: {
      primitive: "dom_select_option",
      semanticId: primitive.semanticId,
      label: control.label,
      valueMatchesExpected: actualValue === primitive.value || selectedTextMatchesExpected,
      expectedValueLength: primitive.value.length,
      actualValueLength: actualValue?.length,
      selectedOptionText: actualSelectedText,
      valueStateAfter: valueStateAfter(element)
    }
  };
}

function executeDomSelectOption(primitive: Extract<BrowserPrimitive, { type: "dom_select_option" }>, pageModel: PageModel): PrimitiveResult {
  const control = findControl(pageModel, primitive.semanticId);
  if (!control) {
    return {
      status: "failed",
      reason: "control_not_found",
      details: { primitive: "dom_select_option", semanticId: primitive.semanticId }
    };
  }

  const lookup = findElementForControl(control, document);
  const element = lookup.element;
  if (!element) {
    return {
      status: "failed",
      reason: "element_not_found",
      details: { primitive: "dom_select_option", semanticId: primitive.semanticId, attemptedHints: lookup.attemptedHints }
    };
  }

  if (element instanceof HTMLSelectElement) return nativeSelectResult(primitive, control, element);

  const alreadyExpanded = control.expandedState === "expanded" || expandedStateAround(element) === "expanded";
  if (!alreadyExpanded) dispatchUserClick(element);
  const option = findVisibleOptionElement(element.ownerDocument, element, primitive.value);
  if (!option) {
    return {
      status: "failed",
      reason: "option_not_found",
      details: {
        primitive: "dom_select_option",
        semanticId: primitive.semanticId,
        label: control.label,
        attemptedHints: lookup.attemptedHints,
        expectedValue: primitive.value,
        openedDropdown: !alreadyExpanded
      }
    };
  }

  const optionText = optionElementText(option);
  dispatchUserClick(option);
  return {
    status: "success",
    details: {
      primitive: "dom_select_option",
      semanticId: primitive.semanticId,
      label: control.label,
      valueMatchesExpected: true,
      expectedValueLength: primitive.value.length,
      selectedOptionText: optionText,
      valueStateAfter: "selected",
      openedDropdown: !alreadyExpanded,
      optionTag: option.tagName.toLowerCase()
    }
  };
}

function executeReadContent(primitive: Extract<BrowserPrimitive, { type: "read_content" }>, pageModel: PageModel): PrimitiveResult {
  const semanticId = primitive.semanticId;
  if (semanticId) {
    const control = findControl(pageModel, semanticId);
    if (control) {
      const lookup = findElementForControl(control, document);
      const text = controlReadableText(control, lookup.element);
      return text
        ? {
            status: "success",
            details: { primitive: "read_content", semanticId, source: "control", text, textLength: text.length }
          }
        : {
            status: "failed",
            reason: "content_empty",
            details: { primitive: "read_content", semanticId, source: "control" }
          };
    }

    const block = findTextBlock(pageModel, semanticId);
    if (block) {
      const lookup = findElementForTextBlock(block, document);
      const text = normalizeReadableText(lookup.element ? elementReadableText(lookup.element) || block.text : block.text);
      return text
        ? {
            status: "success",
            details: { primitive: "read_content", semanticId, source: "text_block", text, textLength: text.length }
          }
        : {
            status: "failed",
            reason: "content_empty",
            details: { primitive: "read_content", semanticId, source: "text_block" }
          };
    }

    return {
      status: "failed",
      reason: "target_not_found",
      details: { primitive: "read_content", semanticId }
    };
  }

  const text = pageReadableText(pageModel, primitive.query);
  return text
    ? {
        status: "success",
        details: { primitive: "read_content", query: primitive.query, source: "page", text, textLength: text.length }
      }
    : {
        status: "failed",
        reason: "content_empty",
        details: { primitive: "read_content", query: primitive.query, source: "page" }
      };
}

function executeCoordinateClick(primitive: Extract<BrowserPrimitive, { type: "coordinate_click" }>): PrimitiveResult {
  const element = document.elementFromPoint(primitive.x, primitive.y);
  if (!(element instanceof HTMLElement)) {
    return {
      status: "failed",
      reason: "element_not_found",
      details: { primitive: "coordinate_click", x: primitive.x, y: primitive.y }
    };
  }

  element.click();
  return {
    status: "success",
    details: {
      primitive: "coordinate_click",
      x: primitive.x,
      y: primitive.y,
      tag: element.tagName.toLowerCase(),
      text: (element.textContent ?? "").trim().slice(0, 80)
    }
  };
}

function executeScroll(primitive: Extract<BrowserPrimitive, { type: "scroll" }>): PrimitiveResult {
  const delta = primitive.direction === "up" ? -primitive.amount : primitive.amount;
  const beforeX = window.scrollX;
  const beforeY = window.scrollY;
  try {
    window.scrollBy({ top: delta, behavior: "auto" });
  } catch (error) {
    return {
      status: "failed",
      reason: error instanceof Error ? error.message : "scroll_failed",
      details: { primitive: "scroll", direction: primitive.direction, amount: primitive.amount, scrollBeforeX: beforeX, scrollBeforeY: beforeY }
    };
  }
  const afterX = window.scrollX;
  const afterY = window.scrollY;
  const scrollMoved = primitive.direction === "up" ? afterY < beforeY : afterY > beforeY;
  return {
    status: "success",
    details: {
      primitive: "scroll",
      direction: primitive.direction,
      amount: primitive.amount,
      scrollBeforeX: beforeX,
      scrollBeforeY: beforeY,
      scrollAfterX: afterX,
      scrollAfterY: afterY,
      scrollMoved
    }
  };
}

function executeHistoryNavigation(primitive: Extract<BrowserPrimitive, { type: "history" }>): PrimitiveResult {
  try {
    if (primitive.action === "back") {
      window.history.back();
    } else if (primitive.action === "forward") {
      window.history.forward();
    } else {
      window.location.reload();
    }
    return {
      status: "success",
      details: { primitive: "history", action: primitive.action }
    };
  } catch (error) {
    return {
      status: "failed",
      reason: error instanceof Error ? error.message : "history_navigation_failed",
      details: { primitive: "history", action: primitive.action }
    };
  }
}

export interface PrimitiveExecutionOptions {
  signal?: AbortSignal;
  settle?: false | ActionSettleOptions;
}

function abortedPrimitiveResult(primitive: BrowserPrimitive, reason = "primitive_aborted"): PrimitiveResult {
  return {
    status: "failed",
    reason,
    details: { primitive: primitive.type, aborted: true }
  };
}

function wait(milliseconds: number, signal?: AbortSignal): Promise<PrimitiveResult> {
  if (signal?.aborted) {
    return Promise.resolve({
      status: "failed",
      reason: "primitive_aborted",
      details: { primitive: "wait", milliseconds, aborted: true }
    });
  }

  return new Promise((resolve) => {
    let settled = false;
    let timeoutId = 0;
    const finish = (result: PrimitiveResult): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      signal?.removeEventListener("abort", onAbort);
      resolve(result);
    };
    const onAbort = (): void => {
      finish({
        status: "failed",
        reason: "primitive_aborted",
        details: { primitive: "wait", milliseconds, aborted: true }
      });
    };

    timeoutId = window.setTimeout(() => {
      finish({ status: "success", details: { primitive: "wait", milliseconds } });
    }, milliseconds);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

interface MutationActivityReader {
  readActivityAt(): Promise<number>;
  disconnect(): void;
}

function shouldWaitForSettle(primitive: BrowserPrimitive): boolean {
  return primitive.type === "dom_click" || primitive.type === "dom_input" || primitive.type === "dom_select_option" || primitive.type === "coordinate_click" || primitive.type === "scroll" || primitive.type === "key_press";
}

function createMutationActivityReader(): MutationActivityReader {
  let lastActivityAt = 0;
  if (typeof MutationObserver === "undefined" || !document.documentElement) {
    return {
      readActivityAt: async () => lastActivityAt,
      disconnect: () => undefined
    };
  }

  const observer = new MutationObserver(() => {
    lastActivityAt = Date.now();
  });
  observer.observe(document.documentElement, {
    attributes: true,
    characterData: true,
    childList: true,
    subtree: true
  });

  return {
    readActivityAt: async () => lastActivityAt,
    disconnect: () => observer.disconnect()
  };
}

async function maybeWaitForSettle(
  primitive: BrowserPrimitive,
  result: PrimitiveResult,
  reader: MutationActivityReader | undefined,
  options: PrimitiveExecutionOptions
): Promise<PrimitiveResult> {
  if (result.status !== "success" || !options.settle || !reader || !shouldWaitForSettle(primitive)) return result;

  try {
    await waitForActionSettle(reader.readActivityAt, {
      ...options.settle,
      signal: options.signal
    });
    return {
      ...result,
      details: {
        ...result.details,
        settle: { status: "settled" }
      }
    };
  } catch (error) {
    if (options.signal?.aborted || (error instanceof Error && error.message === "task_stopped")) {
      return {
        status: "failed",
        reason: "primitive_aborted",
        details: {
          ...result.details,
          aborted: true,
          settle: { status: "aborted" }
        }
      };
    }

    return {
      status: "failed",
      reason: error instanceof Error ? error.message : "action_settle_failed",
      details: {
        ...result.details,
        settle: { status: "failed" }
      }
    };
  }
}

export async function executePrimitive(primitive: BrowserPrimitive, pageModel: PageModel, options: PrimitiveExecutionOptions = {}): Promise<PrimitiveResult> {
  if (options.signal?.aborted) return abortedPrimitiveResult(primitive);

  const mutationActivity = options.settle && shouldWaitForSettle(primitive) ? createMutationActivityReader() : undefined;
  try {
    if (primitive.type === "dom_click") return await maybeWaitForSettle(primitive, executeDomClick(primitive, pageModel), mutationActivity, options);
    if (primitive.type === "dom_input") return await maybeWaitForSettle(primitive, executeDomInput(primitive, pageModel), mutationActivity, options);
    if (primitive.type === "dom_select_option") return await maybeWaitForSettle(primitive, executeDomSelectOption(primitive, pageModel), mutationActivity, options);
    if (primitive.type === "read_content") return executeReadContent(primitive, pageModel);
    if (primitive.type === "coordinate_click") return await maybeWaitForSettle(primitive, executeCoordinateClick(primitive), mutationActivity, options);
    if (primitive.type === "scroll") return await maybeWaitForSettle(primitive, executeScroll(primitive), mutationActivity, options);
    if (primitive.type === "key_press") return await maybeWaitForSettle(primitive, executeKeyPress(primitive), mutationActivity, options);
    if (primitive.type === "history") return executeHistoryNavigation(primitive);
  } finally {
    mutationActivity?.disconnect();
  }

  if (primitive.type === "wait") return wait(primitive.milliseconds, options.signal);

  return {
    status: "failed",
    reason: "unsupported_primitive",
    details: { primitive: primitive.type }
  };
}
