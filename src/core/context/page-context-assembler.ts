import type { NeedMoreObservationRequest, PreferredRole } from "../model/contracts";
import type { ControlCandidate, FormSnapshot, PageIdentity, PageModel, TextBlock } from "../observation/page-model";
import { renderInteractiveIndex } from "../observation/interactive-index";
import { renderPageAtlas } from "../observation/page-atlas";

export interface ControlCandidateSummary {
  semanticId: string;
  role: string;
  label: string;
  accessibleName: string;
  valueState?: string;
  regionRef?: string;
  parentRef?: string;
  childRefs?: string[];
  clickablePoint?: { x: number; y: number };
  occlusion?: string;
  expandedState?: string;
  visibility: string;
  disabled: boolean;
  confidence: number;
}

export interface TextBlockSummary {
  semanticId: string;
  kind: string;
  text: string;
  visibility: string;
  confidence: number;
}

export interface FormSummary {
  semanticId: string;
  label: string;
  controlLabels: string[];
  requiredControlLabels: string[];
  submitControlLabels: string[];
  confidence: number;
}

export interface PlannerPageContext {
  pageIdentity: PageIdentity;
  viewportSummary: string;
  pageAtlas?: string;
  interactiveIndex?: string;
  outline: string[];
  candidates: ControlCandidateSummary[];
  textEvidence: TextBlockSummary[];
  formSummaries: FormSummary[];
  feedback: string[];
  omitted: {
    controls: number;
    textBlocks: number;
    forms: number;
    reason: string;
  };
}

export interface PlannerPageContextOptions {
  candidateLimit: number;
  textBlockLimit?: number;
  formLimit?: number;
  taskText?: string;
  activeSubgoal?: string;
  request?: NeedMoreObservationRequest;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function terms(value: string): string[] {
  return normalize(value)
    .split(/[\s,，。:：/|]+/)
    .map((term) => term.trim())
    .filter(Boolean);
}

function containsAny(text: string, queryTerms: string[]): boolean {
  const normalized = normalize(text);
  return queryTerms.some((term) => normalized.includes(term));
}

function roleMatches(role: string, preferredRoles?: PreferredRole[]): boolean {
  if (!preferredRoles?.length) return false;
  return preferredRoles.some((preferred) => role.toLowerCase().includes(preferred));
}

function scoreControl(control: ControlCandidate, queryTerms: string[], preferredRoles?: PreferredRole[]): number {
  const text = `${control.semanticId} ${control.label} ${control.accessibleName} ${control.description ?? ""} ${control.interactionHints.join(" ")}`;
  const textMatch = containsAny(text, queryTerms) ? 0.4 : 0;
  const semanticIdMatch = queryTerms.includes(normalize(control.semanticId)) ? 0.24 : 0;
  const roleMatch = roleMatches(control.role, preferredRoles) ? 0.18 : 0;
  const visible = control.visibility === "visible" ? 0.18 : 0;
  const enabled = control.disabled ? 0 : 0.08;
  return control.confidence * 0.16 + textMatch + semanticIdMatch + roleMatch + visible + enabled;
}

function summarizeControl(control: ControlCandidate): ControlCandidateSummary {
  return {
    semanticId: control.semanticId,
    role: control.role,
    label: control.label,
    accessibleName: control.accessibleName,
    valueState: control.valueState,
    regionRef: control.regionRef,
    parentRef: control.parentRef,
    childRefs: control.childRefs,
    clickablePoint: control.clickablePoint,
    occlusion: control.occlusion,
    expandedState: control.expandedState,
    visibility: control.visibility,
    disabled: control.disabled,
    confidence: control.confidence
  };
}

function summarizeText(block: TextBlock): TextBlockSummary {
  return {
    semanticId: block.semanticId,
    kind: block.kind,
    text: block.text,
    visibility: block.visibility,
    confidence: block.confidence
  };
}

function summarizeForm(form: FormSnapshot): FormSummary {
  return {
    semanticId: form.semanticId,
    label: form.label,
    controlLabels: form.controlLabels,
    requiredControlLabels: form.requiredControlLabels,
    submitControlLabels: form.submitControlLabels,
    confidence: form.confidence
  };
}

function outlineFrom(page: PageModel): string[] {
  const headings = page.textBlocks
    .filter((block) => block.kind === "heading" && block.visibility === "visible")
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 12)
    .map((block) => block.text);
  const forms = page.forms.slice(0, 6).map((form) => `Form: ${form.label || form.semanticId}`);
  return [...headings, ...forms];
}

export function assemblePlannerPageContext(page: PageModel, options: PlannerPageContextOptions): PlannerPageContext {
  const requestTerms = terms(`${options.taskText ?? ""} ${options.activeSubgoal ?? ""} ${options.request?.query ?? ""} ${(options.request?.targetTextHints ?? []).join(" ")}`);
  const candidateLimit = Math.max(1, Math.floor(options.candidateLimit));
  const textBlockLimit = Math.max(0, Math.floor(options.textBlockLimit ?? 40));
  const formLimit = Math.max(0, Math.floor(options.formLimit ?? 20));

  const candidates = page.controls
    .map((control) => ({ control, score: scoreControl(control, requestTerms, options.request?.preferredRoles) }))
    .sort((left, right) => right.score - left.score || right.control.confidence - left.control.confidence)
    .slice(0, candidateLimit)
    .map(({ control }) => summarizeControl(control));

  const textEvidence = page.textBlocks
    .filter((block) => block.visibility === "visible")
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, textBlockLimit)
    .map(summarizeText);

  const formSummaries = page.forms
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, formLimit)
    .map(summarizeForm);

  return {
    pageIdentity: page.pageIdentity,
    viewportSummary: `${page.viewport.width}x${page.viewport.height} scroll ${page.viewport.scrollX},${page.viewport.scrollY}`,
    pageAtlas: page.atlasText ?? (page.atlas ? renderPageAtlas(page.atlas) : undefined),
    interactiveIndex: page.interactiveIndexText ?? (page.interactiveIndex ? renderInteractiveIndex(page.interactiveIndex) : undefined),
    outline: outlineFrom(page),
    candidates,
    textEvidence,
    formSummaries,
    feedback: page.feedback,
    omitted: {
      controls: Math.max(0, page.controls.length - candidates.length),
      textBlocks: Math.max(0, page.textBlocks.length - textEvidence.length),
      forms: Math.max(0, page.forms.length - formSummaries.length),
      reason: page.controls.length > candidates.length ? "candidate_limit" : "within_budget"
    }
  };
}
