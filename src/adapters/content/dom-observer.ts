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

interface ControlRecord {
  element: HTMLElement;
  control: ControlCandidate;
}

function textOf(element: Element): string {
  return (element.textContent ?? "").replace(/\s+/g, " ").trim();
}

function attr(element: Element, name: string): string | undefined {
  const value = element.getAttribute(name);
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function cssAttribute(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").slice(0, 32);
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

function roleFor(element: HTMLElement): string {
  const explicitRole = attr(element, "role");
  if (explicitRole) return explicitRole;

  const tag = element.tagName.toLowerCase();
  if (tag === "a") return "link";
  if (tag === "button") return "button";
  if (tag === "textarea") return "textbox";
  if (tag === "select") return "combobox";
  if (tag !== "input") return tag;

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

function valueStateFor(element: HTMLElement): ControlCandidate["valueState"] {
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
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  const hidden =
    element.hidden ||
    element.getAttribute("aria-hidden") === "true" ||
    (element instanceof HTMLInputElement && element.type === "hidden") ||
    style?.display === "none" ||
    style?.visibility === "hidden" ||
    style?.opacity === "0";
  return hidden ? "hidden" : "visible";
}

function boundsFor(element: HTMLElement): ControlCandidate["bounds"] {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height
  };
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
  return Array.from(hints);
}

function observeControls(document: Document): ControlRecord[] {
  const selector = [
    "button",
    "a[href]",
    "input:not([type='hidden'])",
    "textarea",
    "select",
    "[role='button']",
    "[role='link']",
    "[role='textbox']",
    "[role='checkbox']",
    "[role='radio']",
    "[role='combobox']",
    "[tabindex]"
  ].join(",");

  return Array.from(document.querySelectorAll<HTMLElement>(selector)).map((element, index) => {
    const label = labelFor(element);
    const role = roleFor(element);
    const visibility = visibilityFor(element);
    return {
      element,
      control: {
        semanticId: semanticIdFor("control", index, role, label),
        role,
        label,
        accessibleName: label,
        description: descriptionFor(element),
        elementTag: element.tagName.toLowerCase(),
        controlType: controlTypeFor(element),
        valueState: valueStateFor(element),
        checked: element instanceof HTMLInputElement && ["checkbox", "radio"].includes(element.type) ? element.checked : undefined,
        disabled:
          (element instanceof HTMLButtonElement ||
            element instanceof HTMLInputElement ||
            element instanceof HTMLSelectElement ||
            element instanceof HTMLTextAreaElement) &&
          element.disabled,
        required: isRequired(element),
        validation: validationFor(element),
        visibility,
        bounds: boundsFor(element),
        interactionHints: interactionHintsFor(element, role),
        locatorHints: locatorHintsFor(element, label, role, index),
        confidence: confidenceFor(label, role, visibility)
      }
    };
  });
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

function observeTextBlocks(document: Document): TextBlock[] {
  const selector = "h1,h2,h3,h4,h5,h6,p,li,label,[role='alert'],[role='status'],[aria-live]";
  return Array.from(document.querySelectorAll<HTMLElement>(selector))
    .flatMap((element, index): TextBlock[] => {
      const text = textOf(element);
      if (!text) return [];
      const kind = textKindFor(element);
      return [
        {
          semanticId: semanticIdFor("text", index, kind, text),
          kind,
          text,
          role: attr(element, "role"),
          headingLevel: headingLevelFor(element),
          visibility: visibilityFor(element),
          locatorHints: locatorHintsFor(element, text, attr(element, "role") ?? kind, index),
          confidence: kind === "heading" ? 0.88 : 0.76
        }
      ];
    })
    .slice(0, 100);
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

function observeForms(document: Document, controls: ControlRecord[]): FormSnapshot[] {
  return Array.from(document.querySelectorAll<HTMLFormElement>("form")).map((form, index) => {
    const formControls = controls.filter((record) => form.contains(record.element));
    const requiredControls = formControls.filter((record) => record.control.required);
    const submitControls = formControls.filter((record) => isSubmitControl(record.element, record.control));
    const label = formLabel(form);

    return {
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

export function observePage(document: Document): PageModel {
  const controlRecords = observeControls(document);
  const textBlocks = observeTextBlocks(document);
  const forms = observeForms(document, controlRecords);
  const feedback = feedbackFromTextBlocks(textBlocks);
  const identity = identityFor(document);

  return {
    pageIdentity: identity,
    viewport: viewportFor(document),
    controls: controlRecords.map((record) => record.control),
    textBlocks,
    forms,
    feedback,
    readableContent: textBlocks.map((block) => block.text).slice(0, 80),
    riskSignals: riskSignalsFor(identity.url, controlRecords, forms, feedback),
    capturedAt: Date.now()
  };
}
