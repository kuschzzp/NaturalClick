import type { NeedMoreObservationRequest, ObservationExpansion, ObservationScope } from "../model/contracts";
import type { InteractiveElementRecord } from "./interactive-index";
import type { PageAtlas } from "./page-atlas";

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

export interface ElementPoint {
  x: number;
  y: number;
}

export type OcclusionState = "clear" | "covered" | "offscreen" | "unknown";
export type ExpandedState = "expanded" | "collapsed" | "unknown";

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
  focused?: boolean;
  required: boolean;
  validation?: string;
  formRef?: string;
  regionRef?: string;
  parentRef?: string;
  childRefs?: string[];
  visibility: VisibilityState;
  bounds?: ElementBounds;
  clickablePoint?: ElementPoint;
  occlusion?: OcclusionState;
  expandedState?: ExpandedState;
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

export interface ObservationRetrievalMetadata {
  request?: NeedMoreObservationRequest;
  query?: string;
  scope?: ObservationScope;
  expand?: ObservationExpansion[];
  candidateLimit: number;
  totalControls: number;
  returnedControls: number;
  omittedControls: number;
  totalTextBlocks: number;
  returnedTextBlocks: number;
  omittedTextBlocks: number;
  strategy: "default_ranked" | "request_ranked" | "fallback_full_snapshot";
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
  observation?: ObservationRetrievalMetadata;
  atlas?: PageAtlas;
  atlasText?: string;
  interactiveIndex?: InteractiveElementRecord[];
  interactiveIndexText?: string;
}
