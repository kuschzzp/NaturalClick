export type VisibilityState = "visible" | "hidden";

export interface LocatorHint {
  kind: "css" | "text" | "role" | "attribute";
  value: string;
  confidence?: number;
}

export interface ElementBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageIdentity {
  url: string;
  title: string;
  origin: string;
  path: string;
  language?: string;
}

export interface ViewportSnapshot {
  width: number;
  height: number;
  scrollX: number;
  scrollY: number;
  deviceScaleFactor: number;
}

export interface ControlCandidate {
  semanticId: string;
  role: string;
  label: string;
  accessibleName: string;
  description?: string;
  elementTag: string;
  controlType?: string;
  valueState?: "empty" | "filled" | "checked" | "unchecked" | "mixed" | "selected";
  checked?: boolean;
  disabled: boolean;
  required: boolean;
  validation?: string;
  formRef?: string;
  regionRef?: string;
  visibility: VisibilityState;
  bounds?: ElementBounds;
  interactionHints: string[];
  locatorHints: LocatorHint[];
  confidence: number;
}

export interface TextBlock {
  semanticId: string;
  kind: "heading" | "paragraph" | "list_item" | "label" | "status" | "alert" | "other";
  text: string;
  role?: string;
  headingLevel?: number;
  regionRef?: string;
  visibility: VisibilityState;
  locatorHints: LocatorHint[];
  confidence: number;
}

export interface FormSnapshot {
  semanticId: string;
  label: string;
  controlRefs: string[];
  controlLabels: string[];
  requiredControlRefs: string[];
  requiredControlLabels: string[];
  submitControlRefs: string[];
  submitControlLabels: string[];
  locatorHints: LocatorHint[];
  confidence: number;
}

export interface RiskSignal {
  kind:
    | "destructive_action"
    | "credential_field"
    | "payment"
    | "personal_data"
    | "external_navigation"
    | "validation_feedback";
  severity: "low" | "medium" | "high";
  message: string;
  controlRef?: string;
  formRef?: string;
  textRef?: string;
  confidence: number;
}

export interface PageModel {
  pageIdentity: PageIdentity;
  viewport: ViewportSnapshot;
  controls: ControlCandidate[];
  textBlocks: TextBlock[];
  forms: FormSnapshot[];
  feedback: string[];
  readableContent: string[];
  riskSignals: RiskSignal[];
  capturedAt: number;
}
