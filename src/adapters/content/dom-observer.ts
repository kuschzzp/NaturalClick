import type { NeedMoreObservationRequest } from "../../core/model/contracts";
import type { InteractiveElementRecord } from "../../core/observation/interactive-index";
import { renderInteractiveIndex } from "../../core/observation/interactive-index";
import type { AtlasControl, AtlasForm, AtlasTarget, PageAtlas } from "../../core/observation/page-atlas";
import { renderPageAtlas } from "../../core/observation/page-atlas";
import type {
  ControlCandidate,
  FormSnapshot,
  LocatorHint,
  PageIdentity,
  PageModel,
  RiskSignal,
  TextBlock,
  ViewportSnapshot,
  VisibilityState
} from "../../core/observation/page-model";
import { ensurePageNodeHandle, PAGE_NODE_HANDLE_ATTRIBUTE, retrieveObservationRecords, type PageNodeRecord, type PageRegion } from "./page-node-index";

interface ControlRecord {
  element: HTMLElement;
  control: ControlCandidate;
}

interface TextRecord {
  element: HTMLElement;
  block: TextBlock;
}

interface FormRecord {
  element: HTMLFormElement;
  form: FormSnapshot;
}

export interface ContentObservationOptions {
  request?: NeedMoreObservationRequest;
  observationRound?: number;
  candidateLimit?: number;
  mode?: "atlas" | "interactive" | "content" | "full";
}

function visibleTextOf(node: Node, root: Element): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (!(node instanceof Element)) return "";
  if (node !== root && node instanceof HTMLElement && visibilityFor(node) === "hidden") return "";
  return Array.from(node.childNodes).map((child) => visibleTextOf(child, root)).join(" ");
}

function textOf(element: Element): string {
  return visibleTextOf(element, element).replace(/\s+/g, " ").trim();
}

function attr(element: Element, name: string): string | undefined {
  const value = element.getAttribute(name);
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function classIdText(element: HTMLElement): string {
  const className = typeof element.className === "string" ? element.className : "";
  return `${element.id} ${className}`.toLowerCase();
}

function normalizedLabel(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function cssAttribute(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "").slice(0, 32);
}

function labelById(document: Document, idRefs: string): string | undefined {
  const labels = idRefs
    .split(/\s+/)
    .map((id) => document.getElementById(id))
    .filter((element): element is HTMLElement => Boolean(element))
    .map(textOf)
    .filter(Boolean);
  return labels.length > 0 ? labels.join(" ") : undefined;
}

function labelFor(element: HTMLElement): string {
  const explicitAria = attr(element, "aria-label");
  if (explicitAria) return explicitAria;

  const labelledBy = attr(element, "aria-labelledby");
  if (labelledBy) {
    const label = labelById(element.ownerDocument, labelledBy);
    if (label) return label;
  }

  if (element.id) {
    const label = element.ownerDocument.querySelector(`label[for="${cssAttribute(element.id)}"]`);
    if (label) return textOf(label);
  }

  const wrappingLabel = element.closest("label");
  if (wrappingLabel) return textOf(wrappingLabel);

  return (
    attr(element, "alt") ??
    attr(element, "placeholder") ??
    attr(element, "title") ??
    textOf(element) ??
    attr(element, "name") ??
    ""
  );
}

function descriptionFor(element: HTMLElement): string | undefined {
  const describedBy = attr(element, "aria-describedby");
  return describedBy ? labelById(element.ownerDocument, describedBy) : undefined;
}

function isNavigationListItem(element: HTMLElement): boolean {
  if (element.tagName.toLowerCase() !== "li") return false;
  return Boolean(
    element.closest(
      "nav,aside,[role='navigation'],[role='menu'],[role='menubar'],.el-menu,.ant-menu,.ivu-menu,.arco-menu,.sidebar,.side-menu,.nav-menu"
    )
  );
}

function isMenuTreeElement(element: HTMLElement): boolean {
  return Boolean(
    element.closest(
      "nav,aside,[role='navigation'],[role='menu'],[role='menubar'],.el-menu,.ant-menu,.ivu-menu,.arco-menu,.van-sidebar,.sidebar,.side-menu,.nav-menu"
    )
  );
}

function roleFor(element: HTMLElement): string {
  const explicitRole = attr(element, "role");
  if (explicitRole) return explicitRole;

  const tag = element.tagName.toLowerCase();
  if (tag === "a") return "link";
  if (tag === "button") return "button";
  if (tag === "textarea") return "textbox";
  if (tag === "select") return "combobox";
  if (tag !== "input") {
    const classes = classIdText(element);
    if (classes.includes("menu-item") || classes.includes("submenu") || classes.includes("sub-menu") || classes.includes("dropdown-item")) return "menuitem";
    if (isNavigationListItem(element)) return "menuitem";
    if (/\b(tab|tabs__item)\b/.test(classes)) return "tab";
    if (/\b(option|select-item)\b/.test(classes)) return "option";
    if (/\b(checkbox|radio|switch)\b/.test(classes)) return classes.includes("radio") ? "radio" : classes.includes("switch") ? "switch" : "checkbox";
    if (element.hasAttribute("onclick") || element.hasAttribute("aria-haspopup") || element.hasAttribute("aria-expanded")) return "button";
    if (element.ownerDocument.defaultView?.getComputedStyle(element).cursor === "pointer") return "button";
    return tag;
  }

  const type = (element as HTMLInputElement).type;
  if (type === "checkbox" || type === "radio") return type;
  if (type === "submit" || type === "button" || type === "reset") return "button";
  return "textbox";
}

function controlTypeFor(element: HTMLElement): string | undefined {
  if (element instanceof HTMLInputElement) return element.type;
  if (element instanceof HTMLButtonElement) return element.type || "button";
  if (element instanceof HTMLSelectElement) return element.multiple ? "select-multiple" : "select-one";
  return undefined;
}

function ariaCheckedFor(element: HTMLElement): boolean | "mixed" | undefined {
  const value = attr(element, "aria-checked")?.toLowerCase();
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "mixed") return "mixed";
  return undefined;
}

function isSelectedControl(element: HTMLElement): boolean {
  const ariaSelected = attr(element, "aria-selected")?.toLowerCase();
  if (ariaSelected === "true") return true;

  const ariaCurrent = attr(element, "aria-current")?.toLowerCase();
  if (ariaCurrent === "true" || ariaCurrent === "page" || ariaCurrent === "step" || ariaCurrent === "location") return true;

  const role = roleFor(element).toLowerCase();
  if (role !== "tab" && role !== "option") return false;
  return /\b(active|current|selected|is-active|is-selected)\b/iu.test(classIdText(element));
}

function valueStateFor(element: HTMLElement): ControlCandidate["valueState"] {
  const ariaChecked = ariaCheckedFor(element);
  if (ariaChecked === true) return "checked";
  if (ariaChecked === false) return "unchecked";
  if (ariaChecked === "mixed") return "mixed";
  if (isSelectedControl(element)) return "selected";
  if (element instanceof HTMLInputElement) {
    if (element.type === "checkbox" || element.type === "radio") return element.checked ? "checked" : "unchecked";
    return element.value ? "filled" : "empty";
  }
  if (element instanceof HTMLTextAreaElement) return element.value ? "filled" : "empty";
  if (element instanceof HTMLSelectElement) return element.value ? "selected" : "empty";
  return undefined;
}

function isRequired(element: HTMLElement): boolean {
  return element.hasAttribute("required") || element.getAttribute("aria-required") === "true";
}

function validationFor(element: HTMLElement): string | undefined {
  if ("validationMessage" in element) {
    const message = String((element as HTMLInputElement).validationMessage ?? "");
    return message || undefined;
  }
  return undefined;
}

function visibilityFor(element: HTMLElement): VisibilityState {
  let current: HTMLElement | null = element;
  while (current) {
    const style = current.ownerDocument.defaultView?.getComputedStyle(current);
    const hidden =
      current.hidden ||
      current.getAttribute("aria-hidden") === "true" ||
      (current instanceof HTMLInputElement && current.type === "hidden") ||
      style?.display === "none" ||
      style?.visibility === "hidden" ||
      style?.opacity === "0";
    if (hidden) return "hidden";
    current = current.parentElement;
  }

  const bounds = boundsFor(element);
  if ((bounds.width < 1 || bounds.height < 1) && ancestorHasUsableBounds(element)) return "hidden";
  return "visible";
}

function boundsFor(element: HTMLElement): NonNullable<ControlCandidate["bounds"]> {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height
  };
}

function centerPointFor(bounds: NonNullable<ControlCandidate["bounds"]>): NonNullable<ControlCandidate["clickablePoint"]> {
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2
  };
}

function pointInViewport(point: NonNullable<ControlCandidate["clickablePoint"]>, element: HTMLElement): boolean {
  const view = element.ownerDocument.defaultView;
  const width = view?.innerWidth ?? element.ownerDocument.documentElement.clientWidth;
  const height = view?.innerHeight ?? element.ownerDocument.documentElement.clientHeight;
  return point.x >= 0 && point.y >= 0 && point.x <= width && point.y <= height;
}

function clickablePointFor(element: HTMLElement, bounds: NonNullable<ControlCandidate["bounds"]>): ControlCandidate["clickablePoint"] {
  if (bounds.width < 1 || bounds.height < 1) return undefined;
  const point = centerPointFor(bounds);
  return pointInViewport(point, element) ? point : undefined;
}

function occlusionFor(
  element: HTMLElement,
  point: ControlCandidate["clickablePoint"],
  bounds: NonNullable<ControlCandidate["bounds"]>
): ControlCandidate["occlusion"] {
  if (bounds.width < 1 || bounds.height < 1) return "offscreen";
  if (!point) return "offscreen";
  const hit = element.ownerDocument.elementFromPoint?.(point.x, point.y);
  if (!hit) return "unknown";
  return element === hit || element.contains(hit) ? "clear" : "covered";
}

function nearestExpandedElement(element: HTMLElement): HTMLElement | undefined {
  return element.closest<HTMLElement>("[aria-expanded]") ?? undefined;
}

function expandedStateFor(element: HTMLElement): ControlCandidate["expandedState"] {
  const expandedElement = nearestExpandedElement(element);
  const ariaExpanded = expandedElement?.getAttribute("aria-expanded") ?? element.getAttribute("aria-expanded");
  if (ariaExpanded === "true") return "expanded";
  if (ariaExpanded === "false") return "collapsed";

  const classes = classIdText(element);
  if (/\b(is-open|is-active|is-expanded|expanded|open)\b/.test(classes)) return "expanded";
  if (element.hasAttribute("aria-haspopup") || element.querySelector("ul,[role='menu'],[role='group']")) return "unknown";
  return undefined;
}

function ancestorHasUsableBounds(element: HTMLElement): boolean {
  let current = element.parentElement;
  while (current && current !== element.ownerDocument.body) {
    const bounds = boundsFor(current);
    if (bounds.width >= 2 && bounds.height >= 2) return true;
    current = current.parentElement;
  }
  return false;
}

function hasUsableElementBounds(element: HTMLElement): boolean {
  const bounds = boundsFor(element);
  if (!bounds) return false;
  if (bounds.width >= 2 && bounds.height >= 2) return true;
  const bodyBounds = element.ownerDocument.body?.getBoundingClientRect();
  const layoutUnavailable = !bodyBounds || (bodyBounds.width === 0 && bodyBounds.height === 0);
  return layoutUnavailable && Boolean(labelFor(element).trim() || isValueControl(element));
}

function isValueControl(element: HTMLElement): boolean {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement ||
    element.isContentEditable
  );
}

function hasExplicitControlSignal(element: HTMLElement): boolean {
  return Boolean(
    attr(element, "role") ||
      attr(element, "aria-label") ||
      attr(element, "aria-labelledby") ||
      attr(element, "title") ||
      attr(element, "data-testid") ||
      attr(element, "data-test") ||
      element.hasAttribute("onclick") ||
      element.hasAttribute("data-action") ||
      element.hasAttribute("data-click") ||
      element.hasAttribute("tabindex") ||
      classIdText(element).match(
        /\b(el-|ant-|ivu-|arco-|van-|menu-item|sub-menu|submenu|tabs__item|dropdown|select|checkbox|radio|button|btn)\b/
      )
  );
}

function isMeaningfulControlElement(element: HTMLElement): boolean {
  if (!hasUsableElementBounds(element)) return false;
  if (isValueControl(element)) return true;
  const label = labelFor(element);
  if (label.trim()) return true;
  return isUnlabeledActionShell(element) || (hasExplicitControlSignal(element) && Boolean(attr(element, "aria-label") || attr(element, "title")));
}

function isUnlabeledActionShell(element: HTMLElement): boolean {
  const role = roleFor(element).toLowerCase();
  const tag = element.tagName.toLowerCase();
  if (tag === "button" || (tag === "a" && element.hasAttribute("href"))) return true;
  if (["button", "link", "tab", "checkbox", "radio", "switch", "option"].includes(role)) return true;
  if (element.hasAttribute("onclick") || element.hasAttribute("data-action") || element.hasAttribute("data-click")) return true;
  return /\b(btn|button|icon-btn|icon-button|el-button|ant-btn|ivu-btn|arco-btn|van-button)\b/.test(classIdText(element));
}

function shouldCollectHiddenMenuCandidates(request?: NeedMoreObservationRequest): boolean {
  return Boolean(request?.expand?.includes("hidden_menus"));
}

function isHiddenMenuCandidate(element: HTMLElement): boolean {
  if (!labelFor(element).trim()) return false;
  if (!isMenuTreeElement(element)) return false;
  const role = roleFor(element).toLowerCase();
  if (role === "menuitem" || role === "listitem" || role === "link" || role === "button") return true;
  return /\b(menu|submenu|sub-menu|dropdown|sidebar|side-menu|nav-menu)\b/.test(classIdText(element));
}

function locatorHintsFor(element: HTMLElement, label: string, role: string, index: number): LocatorHint[] {
  const hints: LocatorHint[] = [];
  if (element.id) hints.push({ kind: "css", value: `[id="${cssAttribute(element.id)}"]`, confidence: 0.96 });
  const dataTestId = attr(element, "data-testid") ?? attr(element, "data-test");
  if (dataTestId) hints.push({ kind: "attribute", value: `data-testid=${dataTestId}`, confidence: 0.9 });
  if (label) hints.push({ kind: "text", value: label, confidence: 0.75 });
  hints.push({ kind: "role", value: role, confidence: 0.7 });
  if (hints.length === 1) {
    hints.push({ kind: "css", value: `${element.tagName.toLowerCase()}:nth-of-type(${index + 1})`, confidence: 0.35 });
  }
  return hints;
}

function semanticIdFor(prefix: string, index: number, role: string, label: string): string {
  const labelSlug = slug(label || role || prefix);
  return `${prefix}_${index}_${role}_${labelSlug}`;
}

function confidenceFor(label: string, role: string, visibility: VisibilityState): number {
  let confidence = label ? 0.82 : 0.45;
  if (role === "button" || role === "textbox" || role === "link") confidence += 0.06;
  if (visibility === "hidden") confidence -= 0.2;
  return Math.max(0.1, Math.min(0.95, confidence));
}

function interactionHintsFor(element: HTMLElement, role: string): string[] {
  const hints = new Set<string>([element.tagName.toLowerCase(), role]);
  if (element instanceof HTMLInputElement) hints.add(element.type);
  if (element instanceof HTMLButtonElement) hints.add(element.type || "button");
  if (element.hasAttribute("contenteditable")) hints.add("editable");
  if (element.hasAttribute("onclick")) hints.add("onclick");
  if (element.ownerDocument.defaultView?.getComputedStyle(element).cursor === "pointer") hints.add("pointer");
  return Array.from(hints);
}

function collectControlElements(document: Document, request?: NeedMoreObservationRequest): HTMLElement[] {
  const includeHiddenMenuCandidates = shouldCollectHiddenMenuCandidates(request);
  const selector = [
    "button",
    "a[href]",
    "input:not([type='hidden'])",
    "textarea",
    "select",
    "[contenteditable='true']",
    "[onclick]",
    "[data-action]",
    "[data-click]",
    "[data-testid]",
    "[data-test]",
    "[aria-haspopup]",
    "[aria-expanded]",
    "[role='button']",
    "[role='link']",
    "[role='textbox']",
    "[role='searchbox']",
    "[role='checkbox']",
    "[role='radio']",
    "[role='combobox']",
    "[role='menuitem']",
    "[role='listitem']",
    "[role='tab']",
    "[role='option']",
    "[role='switch']",
    "nav li",
    "aside li",
    "[role='navigation'] li",
    "[role='menu'] li",
    "[role='menubar'] li",
    ".el-menu li",
    ".ant-menu li",
    ".ivu-menu li",
    ".arco-menu li",
    ".sidebar li",
    ".side-menu li",
    ".nav-menu li",
    "[tabindex]",
    ".el-button",
    ".el-menu-item",
    ".el-sub-menu__title",
    ".el-dropdown-link",
    ".el-tabs__item",
    ".el-select",
    ".el-option",
    ".el-checkbox",
    ".el-radio",
    ".ant-btn",
    ".ant-menu-item",
    ".ant-menu-submenu-title",
    ".ant-tabs-tab",
    ".ant-select-selector",
    ".ant-dropdown-trigger",
    ".ant-pagination-item",
    ".ivu-btn",
    ".ivu-menu-item",
    ".ivu-select-selection",
    ".arco-btn",
    ".arco-menu-item",
    ".arco-tabs-header-title",
    ".van-button",
    ".van-cell"
  ].join(",");
  const elements = new Set<HTMLElement>(document.querySelectorAll<HTMLElement>(selector));
  const view = document.defaultView;
  const isCollectable = (element: HTMLElement): boolean =>
    isMeaningfulControlElement(element) || (includeHiddenMenuCandidates && isHiddenMenuCandidate(element));
  if (!view) return filterNestedDuplicateControls(Array.from(elements).filter(isCollectable));

  for (const element of document.body?.querySelectorAll<HTMLElement>("*") ?? []) {
    const style = view.getComputedStyle(element);
    if (style.cursor !== "pointer") continue;
    if (!isCollectable(element)) continue;
    elements.add(element);
  }
  return filterNestedDuplicateControls(Array.from(elements).filter(isCollectable));
}

function isFocusedElement(element: HTMLElement): boolean {
  const active = element.ownerDocument.activeElement;
  if (!(active instanceof HTMLElement)) return false;
  return active === element || element.contains(active);
}

function filterNestedDuplicateControls(elements: HTMLElement[]): HTMLElement[] {
  return elements.filter((element) => {
    const label = normalizedLabel(labelFor(element));
    if (!label || isValueControl(element)) return true;

    const bounds = boundsFor(element);
    const area = bounds ? bounds.width * bounds.height : 0;
    return !elements.some((candidate) => {
      if (candidate === element || !element.contains(candidate)) return false;
      const candidateLabel = normalizedLabel(labelFor(candidate));
      if (!candidateLabel || candidateLabel !== label) return false;
      const candidateBounds = boundsFor(candidate);
      const candidateArea = candidateBounds ? candidateBounds.width * candidateBounds.height : 0;
      return candidateArea > 0 && area > 0 && candidateArea <= area * 0.85;
    }) && !elements.some((candidate) => {
      if (candidate === element || !element.contains(candidate)) return false;
      const candidateLabel = normalizedLabel(labelFor(candidate));
      if (!candidateLabel || candidateLabel.length >= label.length) return false;
      if (!label.startsWith(candidateLabel)) return false;
      const candidateBounds = boundsFor(candidate);
      const candidateArea = candidateBounds ? candidateBounds.width * candidateBounds.height : 0;
      const isMenuContainer =
        roleFor(element) === "menuitem" ||
        isNavigationListItem(element) ||
        /\b(menu|submenu|sub-menu|sidebar|side-menu|nav-menu)\b/.test(classIdText(element));
      return isMenuContainer && candidateArea > 0 && area > 0 && candidateArea <= area * 0.9;
    });
  });
}

function menuContainerFor(element: HTMLElement): HTMLElement | undefined {
  return (
    element.parentElement?.closest<HTMLElement>(
      "li,[role='menuitem'],[role='treeitem'],.el-sub-menu,.ant-menu-submenu,.ivu-menu-submenu,.arco-menu,.sub-menu,.submenu"
    ) ?? undefined
  );
}

function isLikelyMenuTitle(record: ControlRecord, container: HTMLElement, childElement: HTMLElement): boolean {
  if (!container.contains(record.element)) return false;
  if (record.element === childElement || childElement.contains(record.element) || record.element.contains(childElement)) return false;
  if (record.control.visibility !== "visible") return false;
  const role = record.control.role.toLowerCase();
  return role === "menuitem" || role === "button" || role === "link" || role === "listitem";
}

function decorateControlRelationships(records: ControlRecord[]): void {
  const byElement = new Map<HTMLElement, ControlRecord>(records.map((record) => [record.element, record]));

  for (const record of records) {
    let current = record.element.parentElement;
    while (current) {
      const parent = byElement.get(current);
      if (parent) {
        record.control.parentRef = parent.control.semanticId;
        break;
      }
      current = current.parentElement;
    }

    if (!record.control.parentRef) {
      const container = menuContainerFor(record.element);
      const parent = container
        ? records.find((candidate) => isLikelyMenuTitle(candidate, container, record.element))
        : undefined;
      if (parent) record.control.parentRef = parent.control.semanticId;
    }
  }

  const byId = new Map(records.map((record) => [record.control.semanticId, record.control]));
  for (const control of byId.values()) {
    const children = records
      .filter((record) => record.control.parentRef === control.semanticId)
      .map((record) => record.control.semanticId);
    if (children.length > 0) control.childRefs = children;
  }
}

function observeControls(document: Document, request?: NeedMoreObservationRequest): ControlRecord[] {
  const records = collectControlElements(document, request).map((element, index) => {
    const label = labelFor(element);
    const role = roleFor(element);
    const semanticId = semanticIdFor("control", index, role, label);
    const handle = ensurePageNodeHandle(element, semanticId);
    const visibility = visibilityFor(element);
    const region = regionFor(element);
    const bounds = boundsFor(element);
    const clickablePoint = clickablePointFor(element, bounds);
    const ariaChecked = ariaCheckedFor(element);
    return {
      element,
      control: {
        semanticId,
        role,
        label,
        accessibleName: label,
        description: descriptionFor(element),
        elementTag: element.tagName.toLowerCase(),
        controlType: controlTypeFor(element),
        valueState: valueStateFor(element),
        checked:
          element instanceof HTMLInputElement && ["checkbox", "radio"].includes(element.type)
            ? element.checked
            : ariaChecked === "mixed"
              ? undefined
              : ariaChecked,
        disabled:
          (element instanceof HTMLButtonElement ||
            element instanceof HTMLInputElement ||
            element instanceof HTMLSelectElement ||
            element instanceof HTMLTextAreaElement) &&
          element.disabled,
        focused: isFocusedElement(element) || undefined,
        required: isRequired(element),
        validation: validationFor(element),
        regionRef: region,
        visibility,
        bounds,
        clickablePoint,
        occlusion: occlusionFor(element, clickablePoint, bounds),
        expandedState: expandedStateFor(element),
        interactionHints: interactionHintsFor(element, role),
        locatorHints: [
          { kind: "attribute" as const, value: `${PAGE_NODE_HANDLE_ATTRIBUTE}=${handle}`, confidence: 0.99 },
          ...locatorHintsFor(element, label, role, index)
        ],
        confidence: confidenceFor(label, role, visibility)
      }
    };
  });
  decorateControlRelationships(records);
  return records;
}

function textKindFor(element: HTMLElement): TextBlock["kind"] {
  const tag = element.tagName.toLowerCase();
  const role = attr(element, "role");
  if (/^h[1-6]$/.test(tag)) return "heading";
  if (tag === "p") return "paragraph";
  if (tag === "li") return "list_item";
  if (tag === "label") return "label";
  if (role === "alert") return "alert";
  if (role === "status" || element.hasAttribute("aria-live")) return "status";
  return "other";
}

function headingLevelFor(element: HTMLElement): number | undefined {
  const tag = element.tagName.toLowerCase();
  return /^h[1-6]$/.test(tag) ? Number(tag.slice(1)) : undefined;
}

function observeTextBlocks(document: Document): TextRecord[] {
  const selector = "h1,h2,h3,h4,h5,h6,p,li,label,[role='alert'],[role='status'],[aria-live]";
  return Array.from(document.querySelectorAll<HTMLElement>(selector))
    .flatMap((element, index): TextRecord[] => {
      const text = textOf(element);
      if (!text) return [];
      const kind = textKindFor(element);
      const visibility = visibilityFor(element);
      return [
        {
          element,
          block: {
            semanticId: semanticIdFor("text", index, kind, text),
            kind,
            text,
            role: attr(element, "role"),
            headingLevel: headingLevelFor(element),
            regionRef: regionFor(element),
            visibility,
            locatorHints: locatorHintsFor(element, text, attr(element, "role") ?? kind, index),
            confidence: kind === "heading" ? 0.88 : 0.76
          }
        }
      ];
    });
}

function formLabel(form: HTMLFormElement): string {
  const labelledBy = attr(form, "aria-labelledby");
  return (
    attr(form, "aria-label") ??
    (labelledBy ? labelById(form.ownerDocument, labelledBy) : undefined) ??
    attr(form, "name") ??
    attr(form, "id") ??
    "Form"
  );
}

function isSubmitControl(element: HTMLElement, control: ControlCandidate): boolean {
  if (element instanceof HTMLButtonElement) return (element.type || "submit") === "submit";
  if (element instanceof HTMLInputElement) return element.type === "submit" || element.type === "button";
  return control.role === "button" && /submit|save|continue|next|confirm/i.test(control.label);
}

function observeForms(document: Document, controls: ControlRecord[]): FormRecord[] {
  return Array.from(document.querySelectorAll<HTMLFormElement>("form")).map((form, index) => {
    const formControls = controls.filter((record) => form.contains(record.element));
    const requiredControls = formControls.filter((record) => record.control.required);
    const submitControls = formControls.filter((record) => isSubmitControl(record.element, record.control));
    const label = formLabel(form);

    return {
      element: form,
      form: {
        semanticId: semanticIdFor("form", index, "form", label),
        label,
        controlRefs: formControls.map((record) => record.control.semanticId),
        controlLabels: formControls.map((record) => record.control.label).filter(Boolean),
        requiredControlRefs: requiredControls.map((record) => record.control.semanticId),
        requiredControlLabels: requiredControls.map((record) => record.control.label).filter(Boolean),
        submitControlRefs: submitControls.map((record) => record.control.semanticId),
        submitControlLabels: submitControls.map((record) => record.control.label).filter(Boolean),
        locatorHints: locatorHintsFor(form, label, "form", index),
        confidence: 0.84
      }
    };
  });
}

function feedbackFromTextBlocks(blocks: TextBlock[]): string[] {
  return blocks.filter((block) => block.kind === "alert" || block.kind === "status").map((block) => block.text);
}

function identityFor(document: Document): PageIdentity {
  const href = document.location.href;
  try {
    const url = new URL(href);
    return {
      url: href,
      title: document.title,
      origin: url.origin,
      path: `${url.pathname}${url.search}${url.hash}`,
      language: document.documentElement.lang || undefined
    };
  } catch {
    return {
      url: href,
      title: document.title,
      origin: "",
      path: "",
      language: document.documentElement.lang || undefined
    };
  }
}

function viewportFor(document: Document): ViewportSnapshot {
  const view = document.defaultView;
  return {
    width: view?.innerWidth ?? document.documentElement.clientWidth,
    height: view?.innerHeight ?? document.documentElement.clientHeight,
    scrollX: view?.scrollX ?? 0,
    scrollY: view?.scrollY ?? 0,
    deviceScaleFactor: view?.devicePixelRatio ?? 1
  };
}

function scrollContainerFor(element: HTMLElement): HTMLElement | undefined {
  let current = element.parentElement;
  while (current) {
    const style = current.ownerDocument.defaultView?.getComputedStyle(current);
    const overflow = `${style?.overflow ?? ""} ${style?.overflowY ?? ""} ${style?.overflowX ?? ""}`;
    if (/(auto|scroll)/.test(overflow)) return current;
    current = current.parentElement;
  }
  return undefined;
}

function classOrIdIncludes(element: HTMLElement, pattern: RegExp): boolean {
  return pattern.test(classIdText(element));
}

function closestClassLike(element: HTMLElement, pattern: RegExp): HTMLElement | undefined {
  let current: HTMLElement | null = element;
  while (current) {
    if (classOrIdIncludes(current, pattern)) return current;
    current = current.parentElement;
  }
  return undefined;
}

function regionFor(element: HTMLElement): PageRegion {
  if (element.closest("dialog,[role='dialog'],[aria-modal='true']")) return "dialog";
  if (element.closest("form")) return "form";
  if (element.closest("aside") || closestClassLike(element, /\b(sidebar|side-menu|sider|menu|nav-menu)\b/)) return "sidebar";
  if (element.closest("nav,[role='navigation']")) return "navigation";
  if (element.closest("main,[role='main']")) return "main_content";
  if (scrollContainerFor(element)) return "scroll_container";
  return "other";
}

function actionHintTextFor(element: HTMLElement): string {
  const source = actionHintSourceFor(element);
  const hints: string[] = [];
  if (/detail|details|view|info|inspect|preview/.test(source)) hints.push("detail details view info 查看 详情 明细");
  if (/edit|modify|update/.test(source)) hints.push("edit modify update 编辑 修改");
  if (/delete|remove|trash|destroy/.test(source)) hints.push("delete remove trash 删除 移除");
  if (/add|create|new|plus/.test(source)) hints.push("add create new plus 新建 添加");
  if (/search|query|find/.test(source)) hints.push("search query find 搜索 查询");
  if (/save|submit|confirm|ok/.test(source)) hints.push("save submit confirm 保存 提交 确认");
  if (/download|export/.test(source)) hints.push("download export 下载 导出");
  if (/upload|import/.test(source)) hints.push("upload import 上传 导入");
  if (/more|menu|dropdown/.test(source)) hints.push("more menu dropdown 更多 菜单");
  return hints.join(" ");
}

function actionHintSourceFor(element: HTMLElement): string {
  const nodes = [
    element,
    ...Array.from(
      element.querySelectorAll<Element>(
        "i,svg,use,[id],[class],[aria-label],[title],[data-testid],[data-test],[data-action],[data-click],[name]"
      )
    )
  ];
  return nodes
    .flatMap((node) => [
      node.id,
      node.getAttribute("class"),
      attr(node, "data-testid"),
      attr(node, "data-test"),
      attr(node, "data-action"),
      attr(node, "data-click"),
      attr(node, "name"),
      attr(node, "aria-label"),
      attr(node, "title"),
      attr(node, "href"),
      attr(node, "xlink:href")
    ])
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function rowContextFor(element: HTMLElement): string {
  const tableContext = tableRowContextFor(element);
  if (tableContext) return tableContext;
  return listItemContextFor(element);
}

function tableRowContextFor(element: HTMLElement): string {
  if (!element.closest("table,[role='table'],[role='grid']")) return "";
  const row = element.closest("tr,[role='row']");
  if (!(row instanceof HTMLElement)) return "";
  return `${rowOrdinalContextFor(row)} ${textOf(row)}`;
}

function isTableRowElement(element: Element): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  return element.tagName.toLowerCase() === "tr" || element.getAttribute("role") === "row";
}

function isHeaderLikeRow(row: HTMLElement): boolean {
  const hasHeaderCell = Boolean(row.querySelector("th,[role='columnheader']"));
  const hasDataCell = Boolean(row.querySelector("td,[role='cell'],[role='gridcell']"));
  return hasHeaderCell && !hasDataCell;
}

function siblingRowsFor(row: HTMLElement): HTMLElement[] {
  const siblings = Array.from(row.parentElement?.children ?? []).filter(isTableRowElement);
  const rows = siblings.length ? siblings : [row];
  const dataRows = rows.filter((item) => !isHeaderLikeRow(item));
  return dataRows.length ? dataRows : rows;
}

function chineseOrdinal(index: number): string | undefined {
  return ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"][index];
}

function englishOrdinal(index: number): string | undefined {
  return ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"][index];
}

function rowOrdinalContextFor(row: HTMLElement): string {
  const rows = siblingRowsFor(row);
  const index = rows.indexOf(row);
  if (index < 0) return "";
  const oneBased = index + 1;
  const zh = chineseOrdinal(index);
  const en = englishOrdinal(index);
  return [
    `row ${oneBased}`,
    `item ${oneBased}`,
    `record ${oneBased}`,
    `第${oneBased}行`,
    `第${oneBased}条`,
    `第${oneBased}项`,
    zh ? `第${zh}行` : undefined,
    zh ? `第${zh}条` : undefined,
    zh ? `第${zh}项` : undefined,
    index === 0 ? "首行 首条 首项" : undefined,
    en ? `${en} row` : undefined,
    en ? `${en} item` : undefined,
    en ? `${en} record` : undefined
  ]
    .filter(Boolean)
    .join(" ");
}

function isGenericListItemElement(element: Element): boolean {
  if (!(element instanceof HTMLElement)) return false;
  const role = element.getAttribute("role");
  if (role === "listitem") return true;
  const tag = element.tagName.toLowerCase();
  if (tag === "li" || tag === "article") return true;
  return /\b(list-item|list-row|record-row|data-row|table-row|result-item|search-result|card|el-card|ant-list-item|van-cell)\b/.test(classIdText(element));
}

function closestGenericListItem(element: HTMLElement): HTMLElement | undefined {
  let current: HTMLElement | null = element;
  while (current) {
    if (isGenericListItemElement(current)) return current;
    current = current.parentElement;
  }
  return undefined;
}

function listItemContextFor(element: HTMLElement): string {
  const item = closestGenericListItem(element);
  if (!item || isMenuTreeElement(item) || regionFor(item) === "sidebar" || regionFor(item) === "navigation") return "";
  const siblings = Array.from(item.parentElement?.children ?? []).filter(
    (candidate): candidate is HTMLElement => candidate instanceof HTMLElement && isGenericListItemElement(candidate)
  );
  const items = siblings.length ? siblings : [item];
  const index = items.indexOf(item);
  if (index < 0) return "";
  return `${ordinalContextForIndex(index)} ${textOf(item)}`;
}

function ordinalContextForIndex(index: number): string {
  const oneBased = index + 1;
  const zh = chineseOrdinal(index);
  const en = englishOrdinal(index);
  return [
    `item ${oneBased}`,
    `record ${oneBased}`,
    `row ${oneBased}`,
    `第${oneBased}项`,
    `第${oneBased}条`,
    `第${oneBased}行`,
    zh ? `第${zh}项` : undefined,
    zh ? `第${zh}条` : undefined,
    zh ? `第${zh}行` : undefined,
    index === 0 ? "首项 首条 首行" : undefined,
    en ? `${en} item` : undefined,
    en ? `${en} record` : undefined,
    en ? `${en} row` : undefined
  ]
    .filter(Boolean)
    .join(" ");
}

function controlRecordText(record: ControlRecord): string {
  return `${rowContextFor(record.element)} ${actionHintTextFor(record.element)} ${record.control.label} ${record.control.accessibleName} ${record.control.description ?? ""}`;
}

function nodeRecordsFor(controls: ControlRecord[], texts: TextRecord[], forms: FormRecord[]): PageNodeRecord[] {
  return [
    ...controls.map(
      (record): PageNodeRecord => ({
        id: record.control.semanticId,
        kind: "control",
        text: controlRecordText(record),
        role: record.control.role,
        region: regionFor(record.element),
        visibility: record.control.visibility,
        bounds: record.control.bounds,
        confidence: record.control.confidence,
        control: record.control
      })
    ),
    ...texts.map(
      (record): PageNodeRecord => ({
        id: record.block.semanticId,
        kind: "text",
        text: record.block.text,
        role: record.block.role ?? record.block.kind,
        region: regionFor(record.element),
        visibility: record.block.visibility,
        bounds: boundsFor(record.element),
        confidence: record.block.confidence,
        textBlock: record.block
      })
    ),
    ...forms.map(
      (record): PageNodeRecord => ({
        id: record.form.semanticId,
        kind: "form",
        text: `${record.form.label} ${record.form.controlLabels.join(" ")}`,
        role: "form",
        region: "form",
        visibility: visibilityFor(record.element),
        bounds: boundsFor(record.element),
        confidence: record.form.confidence,
        form: record.form
      })
    )
  ];
}

function handleFor(element: HTMLElement, seed: string): string {
  return ensurePageNodeHandle(element, seed);
}

function expandedBoolean(control: ControlCandidate): boolean | undefined {
  if (control.expandedState === "expanded") return true;
  if (control.expandedState === "collapsed") return false;
  return undefined;
}

function interactiveRecordsFor(controls: ControlRecord[], limit = 240): InteractiveElementRecord[] {
  return controls
    .slice(0, limit)
    .map((record) => ({
      frameId: 0,
      handle: handleFor(record.element, record.control.semanticId),
      tag: record.control.elementTag,
      role: record.control.role,
      label: record.control.label,
      text: controlRecordText(record).replace(/\s+/g, " ").trim().slice(0, 240),
      region: record.control.regionRef,
      visibility: record.control.visibility,
      disabled: record.control.disabled,
      focused: record.control.focused,
      expanded: expandedBoolean(record.control),
      confidence: record.control.confidence
    }));
}

function bucket(value: number, size: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.ceil(value / size) * size;
}

function atlasControlsFor(controls: ControlRecord[], limit = 240): AtlasControl[] {
  return controls.slice(0, limit).map((record) => ({
    id: record.control.semanticId,
    frameId: 0,
    handle: handleFor(record.element, record.control.semanticId),
    role: record.control.role,
    label: record.control.label,
    value: record.control.valueState,
    expanded: expandedBoolean(record.control),
    disabled: record.control.disabled,
    focused: record.control.focused
  }));
}

function atlasFormsFor(forms: FormRecord[]): AtlasForm[] {
  return forms.map((record) => ({
    id: record.form.semanticId,
    frameId: 0,
    label: record.form.label,
    fields: record.form.controlRefs,
    submitControlId: record.form.submitControlRefs[0]
  }));
}

function targetLabelFor(element: HTMLElement, fallback: string): string {
  const labelled = attr(element, "aria-label") ?? attr(element, "title");
  if (labelled) return labelled;
  const heading = element.querySelector<HTMLElement>("h1,h2,h3,h4,h5,h6,[role='heading']");
  const headingText = heading ? textOf(heading) : "";
  return headingText || attr(element, "id") || fallback;
}

function dataTargetsFor(document: Document): AtlasTarget[] {
  const targets: AtlasTarget[] = [];
  const seen = new Set<Element>();
  const addTarget = (element: HTMLElement, type: AtlasTarget["type"], label: string, summary: string, confidence: AtlasTarget["confidence"], visibleCount?: number) => {
    if (seen.has(element)) return;
    seen.add(element);
    targets.push({
      id: `target_${targets.length}_${type}`,
      frameId: 0,
      type,
      label,
      confidence,
      summary,
      visibleCount
    });
  };

  Array.from(document.querySelectorAll<HTMLElement>("table,[role='table'],[role='grid']")).forEach((element, index) => {
    const rows = element.querySelectorAll("tbody tr,[role='row']").length;
    addTarget(element, "table", targetLabelFor(element, `table ${index + 1}`), `${rows} rows`, "high", rows);
  });

  Array.from(document.querySelectorAll<HTMLElement>("[role='list'],ul,ol,.list,.record-list,.customer-list,.result-list")).forEach((element, index) => {
    const items = element.querySelectorAll(":scope > li,:scope > article,:scope > [role='listitem'],.record-card,.list-item").length;
    if (items < 2) return;
    addTarget(element, "collection", targetLabelFor(element, `collection ${index + 1}`), `${items} visible items`, "medium", items);
  });

  Array.from(document.querySelectorAll<HTMLElement>("main,aside,nav,section,[role='main'],[role='navigation']")).slice(0, 8).forEach((element, index) => {
    const summary = textOf(element).slice(0, 160);
    if (!summary) return;
    addTarget(element, element.tagName.toLowerCase() === "main" || element.getAttribute("role") === "main" ? "detail_region" : "region", targetLabelFor(element, `region ${index + 1}`), summary, "low");
  });

  return targets.slice(0, 40);
}

function pageAtlasFor(document: Document, identity: PageIdentity, controls: ControlRecord[], forms: FormRecord[], textBlocks: TextBlock[]): PageAtlas {
  return {
    atlasId: `atlas_${Date.now().toString(36)}`,
    tabId: 0,
    url: identity.url,
    title: identity.title,
    fingerprint: {
      url: identity.url,
      bodyTextLengthBucket: bucket(textOf(document.body ?? document.documentElement).length, 500),
      interactiveCountBucket: bucket(controls.length, 20),
      topSectionCount: Math.min(99, document.querySelectorAll("main,aside,nav,section,[role='main'],[role='navigation']").length)
    },
    controls: atlasControlsFor(controls),
    forms: atlasFormsFor(forms),
    targets: dataTargetsFor(document)
  };
}

function menuRecordText(record: ControlRecord): string {
  const parent = record.control.parentRef ? `parent:${record.control.parentRef}` : "";
  const children = record.control.childRefs?.length ? `children:${record.control.childRefs.join(" ")}` : "";
  return `${record.control.label} ${record.control.accessibleName} ${record.control.description ?? ""} ${parent} ${children}`;
}

function isMenuControlRecord(record: ControlRecord): boolean {
  const role = record.control.role.toLowerCase();
  if (role === "menuitem" || role === "listitem") return true;
  if (record.control.regionRef === "sidebar" || record.control.regionRef === "navigation") return isMenuTreeElement(record.element);
  return isMenuTreeElement(record.element) && (role === "button" || role === "link");
}

function isMenuTextRecord(record: TextRecord): boolean {
  const region = regionFor(record.element);
  return (region === "sidebar" || region === "navigation") && isMenuTreeElement(record.element);
}

function isOffscreenBounds(
  bounds: NonNullable<ControlCandidate["bounds"]>,
  document: Document
): boolean {
  const view = document.defaultView;
  const width = view?.innerWidth ?? document.documentElement.clientWidth;
  const height = view?.innerHeight ?? document.documentElement.clientHeight;
  return bounds.x + bounds.width < 0 || bounds.y + bounds.height < 0 || bounds.x > width || bounds.y > height;
}

function expansionRecordsFor(
  baseRecords: PageNodeRecord[],
  controls: ControlRecord[],
  texts: TextRecord[],
  request?: NeedMoreObservationRequest
): PageNodeRecord[] {
  if (!request?.expand?.length) return baseRecords;
  const expanded = [...baseRecords];

  if (request.expand.includes("form_fields")) {
    for (const record of controls.filter((item) => item.element.closest("form"))) {
      expanded.push({
        id: record.control.semanticId,
        kind: "control",
        text: `${record.control.label} ${record.control.accessibleName}`,
        role: record.control.role,
        region: "form",
        visibility: record.control.visibility,
        bounds: record.control.bounds,
        confidence: record.control.confidence,
        control: record.control,
        expansionSource: "form_fields"
      });
    }
  }

  if (request.expand.includes("tables")) {
    for (const record of controls.filter((item) => item.element.closest("table,[role='table'],[role='grid']"))) {
      const rowText = textOf(record.element.closest("tr,[role='row']") ?? record.element);
      expanded.push({
        id: record.control.semanticId,
        kind: "control",
        text: `${rowText} ${record.control.label}`,
        role: record.control.role,
        region: regionFor(record.element),
        visibility: record.control.visibility,
        bounds: record.control.bounds,
        confidence: record.control.confidence,
        control: record.control,
        expansionSource: "tables"
      });
    }
  }

  if (request.expand.includes("hidden_menus")) {
    for (const record of controls.filter(isMenuControlRecord)) {
      expanded.push({
        id: record.control.semanticId,
        kind: "control",
        text: menuRecordText(record),
        role: record.control.role,
        region: regionFor(record.element),
        visibility: record.control.visibility,
        bounds: record.control.bounds,
        confidence: record.control.confidence,
        control: record.control,
        expansionSource: "hidden_menus"
      });
    }

    for (const record of texts.filter(isMenuTextRecord)) {
      expanded.push({
        id: record.block.semanticId,
        kind: "text",
        text: record.block.text,
        role: record.block.role ?? record.block.kind,
        region: regionFor(record.element),
        visibility: record.block.visibility,
        bounds: boundsFor(record.element),
        confidence: record.block.confidence,
        textBlock: record.block,
        expansionSource: "hidden_menus"
      });
    }
  }

  if (request.expand.includes("offscreen_links")) {
    const offscreenLinks = controls.filter(
      (item) =>
        item.control.role.toLowerCase() === "link" &&
        item.control.bounds &&
        isOffscreenBounds(item.control.bounds, item.element.ownerDocument)
    );
    for (const record of offscreenLinks) {
      expanded.push({
        id: record.control.semanticId,
        kind: "control",
        text: `${record.control.label} ${record.control.accessibleName} ${record.control.description ?? ""}`,
        role: record.control.role,
        region: regionFor(record.element),
        visibility: record.control.visibility,
        bounds: record.control.bounds,
        confidence: record.control.confidence,
        control: record.control,
        expansionSource: "offscreen_links"
      });
    }
  }

  if (request.expand.includes("validation_feedback")) {
    for (const record of texts.filter((item) => item.block.kind === "alert" || item.block.kind === "status")) {
      expanded.push({
        id: record.block.semanticId,
        kind: "text",
        text: record.block.text,
        role: record.block.role ?? record.block.kind,
        region: regionFor(record.element),
        visibility: record.block.visibility,
        bounds: boundsFor(record.element),
        confidence: record.block.confidence,
        textBlock: record.block,
        expansionSource: "validation_feedback"
      });
    }
  }

  if (request.expand.includes("nearby_text")) {
    for (const record of texts) {
      expanded.push({
        id: record.block.semanticId,
        kind: "text",
        text: record.block.text,
        role: record.block.role ?? record.block.kind,
        region: regionFor(record.element),
        visibility: record.block.visibility,
        bounds: boundsFor(record.element),
        confidence: record.block.confidence,
        textBlock: record.block,
        expansionSource: "nearby_text"
      });
    }
  }

  return expanded;
}

function uniqueTextBlocks(blocks: TextBlock[]): TextBlock[] {
  const seen = new Set<string>();
  const unique: TextBlock[] = [];
  for (const block of blocks) {
    if (seen.has(block.semanticId)) continue;
    seen.add(block.semanticId);
    unique.push(block);
  }
  return unique;
}

function returnedTextBlocksFor(textBlocks: TextBlock[], selectedIds: Set<string>, request?: NeedMoreObservationRequest): TextBlock[] {
  const selected = textBlocks.filter((block) => selectedIds.has(block.semanticId));
  if (request) return uniqueTextBlocks(selected);
  const defaultVisible = textBlocks.filter((block) => block.visibility === "visible").slice(0, 40);
  return uniqueTextBlocks([...selected, ...defaultVisible]);
}

function riskSignalsFor(pageUrl: string, controls: ControlRecord[], forms: FormSnapshot[], feedback: string[]): RiskSignal[] {
  const risks: RiskSignal[] = [];

  for (const { element, control } of controls) {
    const label = `${control.label} ${control.accessibleName} ${attr(element, "name") ?? ""} ${
      attr(element, "autocomplete") ?? ""
    }`.toLowerCase();

    if (/delete|remove|destroy|erase|cancel account|close account/.test(label) || element.dataset.danger === "true") {
      risks.push({
        kind: "destructive_action",
        severity: "high",
        message: `Destructive control detected: ${control.label || control.semanticId}`,
        controlRef: control.semanticId,
        confidence: 0.88
      });
    }

    if (element instanceof HTMLInputElement && element.type === "password") {
      risks.push({
        kind: "credential_field",
        severity: "high",
        message: `Credential field detected: ${control.label || control.semanticId}`,
        controlRef: control.semanticId,
        confidence: 0.9
      });
    }

    if (/card|credit|cvc|cvv|expiry|payment|billing/.test(label)) {
      risks.push({
        kind: "payment",
        severity: "high",
        message: `Payment-related field or control detected: ${control.label || control.semanticId}`,
        controlRef: control.semanticId,
        confidence: 0.78
      });
    }

    if (
      element instanceof HTMLInputElement &&
      (/email|tel|name|address|postal|phone/.test(element.type) ||
        /email|tel|name|address|postal|phone/.test(attr(element, "autocomplete") ?? "") ||
        /email|phone|address|name/.test(label))
    ) {
      risks.push({
        kind: "personal_data",
        severity: "medium",
        message: `Personal data field detected: ${control.label || control.semanticId}`,
        controlRef: control.semanticId,
        confidence: 0.82
      });
    }

    if (element instanceof HTMLAnchorElement) {
      try {
        const target = new URL(element.href);
        const current = new URL(pageUrl);
        if (target.origin !== current.origin) {
          risks.push({
            kind: "external_navigation",
            severity: "medium",
            message: `External navigation target detected: ${control.label || target.href}`,
            controlRef: control.semanticId,
            confidence: 0.74
          });
        }
      } catch {
        // Ignore malformed href values; they are still represented as link controls.
      }
    }
  }

  for (const form of forms) {
    if (form.requiredControlRefs.length > 0) {
      risks.push({
        kind: "validation_feedback",
        severity: "low",
        message: `Form "${form.label}" contains required fields`,
        formRef: form.semanticId,
        confidence: 0.68
      });
    }
  }

  for (const message of feedback) {
    risks.push({
      kind: "validation_feedback",
      severity: "medium",
      message,
      confidence: 0.84
    });
  }

  return risks;
}

export function observePage(document: Document, options: ContentObservationOptions = {}): PageModel {
  const controlRecords = observeControls(document, options.request);
  const textRecords = observeTextBlocks(document);
  const formRecords = observeForms(document, controlRecords);
  const textBlocks = textRecords.map((record) => record.block);
  const forms = formRecords.map((record) => record.form);
  const feedback = feedbackFromTextBlocks(textBlocks);
  const identity = identityFor(document);
  const viewport = viewportFor(document);
  const baseRecords = nodeRecordsFor(controlRecords, textRecords, formRecords);
  const allRecords = expansionRecordsFor(baseRecords, controlRecords, textRecords, options.request);
  const retrieval = retrieveObservationRecords(allRecords, {
    request: options.request,
    candidateLimit: options.candidateLimit ?? 120,
    viewport
  });
  const selectedIds = new Set(retrieval.records.map((record) => record.id));
  const selectedControlIds = new Set(retrieval.records.filter((record) => record.control).map((record) => record.id));
  let relatedControlAdded = true;
  while (relatedControlAdded) {
    relatedControlAdded = false;
    for (const record of controlRecords) {
      if (!selectedControlIds.has(record.control.semanticId)) continue;
      const relatedRefs = [
        record.control.parentRef,
        ...(record.control.childRefs ?? [])
      ].filter((ref): ref is string => Boolean(ref));
      for (const ref of relatedRefs) {
        if (selectedControlIds.has(ref)) continue;
        selectedControlIds.add(ref);
        selectedIds.add(ref);
        relatedControlAdded = true;
      }
    }
  }
  const selectedFormIds = new Set<string>();
  for (const form of forms) {
    if (form.controlRefs.some((ref) => selectedControlIds.has(ref)) || selectedIds.has(form.semanticId)) {
      selectedFormIds.add(form.semanticId);
    }
  }
  const controls = controlRecords
    .map((record) => record.control)
    .filter((control) => selectedIds.has(control.semanticId))
    .map((control) => ({
      ...control,
      childRefs: control.childRefs?.filter((ref) => selectedControlIds.has(ref))
    }));
  const returnedTextBlocks = returnedTextBlocksFor(textBlocks, selectedIds, options.request);
  const returnedForms = forms.filter((form) => selectedFormIds.has(form.semanticId));
  const atlas = pageAtlasFor(document, identity, controlRecords, formRecords, textBlocks);
  const interactiveIndex = interactiveRecordsFor(controlRecords);
  const observation = {
    ...retrieval.metadata,
    returnedTextBlocks: returnedTextBlocks.length,
    omittedTextBlocks: Math.max(0, textBlocks.length - returnedTextBlocks.length)
  };

  return {
    pageIdentity: identity,
    viewport,
    controls,
    textBlocks: returnedTextBlocks,
    forms: returnedForms,
    feedback,
    readableContent: returnedTextBlocks.map((block) => block.text).slice(0, 80),
    riskSignals: riskSignalsFor(identity.url, controlRecords, forms, feedback).filter((signal) => {
      if (signal.controlRef && !selectedControlIds.has(signal.controlRef)) return false;
      if (signal.formRef && !selectedFormIds.has(signal.formRef)) return false;
      if (signal.textRef && !selectedIds.has(signal.textRef)) return false;
      return true;
    }),
    capturedAt: Date.now(),
    observation,
    atlas,
    atlasText: renderPageAtlas(atlas),
    interactiveIndex,
    interactiveIndexText: renderInteractiveIndex(interactiveIndex)
  };
}
