import type { NeedMoreObservationRequest } from "../../core/model/contracts";
import type {
  ControlCandidate,
  ElementBounds,
  FormSnapshot,
  ObservationRetrievalMetadata,
  TextBlock,
  ViewportSnapshot,
  VisibilityState
} from "../../core/observation/page-model";

export const PAGE_NODE_HANDLE_ATTRIBUTE = "data-naturalclick-handle";

export type PageRegion =
  | "navigation"
  | "sidebar"
  | "main_content"
  | "form"
  | "dialog"
  | "scroll_container"
  | "other";

export interface PageNodeRecord {
  id: string;
  kind: "control" | "text" | "form";
  text: string;
  role?: string;
  region: PageRegion;
  visibility: VisibilityState;
  bounds?: ElementBounds;
  confidence: number;
  control?: ControlCandidate;
  textBlock?: TextBlock;
  form?: FormSnapshot;
  expansionSource?: "nearby_text" | "hidden_menus" | "offscreen_links" | "form_fields" | "tables" | "validation_feedback";
}

export interface RetrieveObservationOptions {
  request?: NeedMoreObservationRequest;
  candidateLimit: number;
  viewport: ViewportSnapshot;
}

export interface RetrievalResult {
  records: PageNodeRecord[];
  metadata: ObservationRetrievalMetadata;
}

const documentCounters = new WeakMap<Document, number>();
const elementHandles = new WeakMap<Element, string>();

export function ensurePageNodeHandle(element: Element, preferredSeed = "node"): string {
  const existing = element.getAttribute(PAGE_NODE_HANDLE_ATTRIBUTE) ?? elementHandles.get(element);
  if (existing) {
    elementHandles.set(element, existing);
    return existing;
  }
  const next = (documentCounters.get(element.ownerDocument) ?? 0) + 1;
  documentCounters.set(element.ownerDocument, next);
  const handle = `nc_${safeHandleSeed(preferredSeed)}_${next.toString(36)}`;
  element.setAttribute(PAGE_NODE_HANDLE_ATTRIBUTE, handle);
  elementHandles.set(element, handle);
  return handle;
}

export function findElementByPageNodeHandle(document: Document, handle: string): HTMLElement | undefined {
  const escaped = handle.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return document.querySelector<HTMLElement>(`[${PAGE_NODE_HANDLE_ATTRIBUTE}="${escaped}"]`) ?? undefined;
}

function safeHandleSeed(value: string): string {
  const safe = value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "").slice(0, 32);
  return safe || "node";
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function tokenize(value: string): string[] {
  const normalized = normalizeText(value);
  const splitTerms = normalized.split(/[\s,，。:：/|()[\]{}"'`]+/).filter(Boolean);
  return Array.from(new Set(splitTerms.flatMap((term) => (term.length > 12 ? [term, term.slice(0, 12)] : [term]))));
}

function textScore(text: string, terms: string[]): number {
  if (terms.length === 0) return 0;
  const normalized = normalizeText(text);
  const hits = terms.filter((term) => normalized.includes(term)).length;
  if (hits === terms.length) return 0.46;
  if (hits > 0) return 0.22 + Math.min(0.18, hits * 0.06);
  return 0;
}

function isInViewport(record: PageNodeRecord, viewport: ViewportSnapshot): boolean {
  if (!record.bounds) return record.visibility === "visible";
  const bottom = record.bounds.y + record.bounds.height;
  const right = record.bounds.x + record.bounds.width;
  return record.visibility === "visible" && bottom >= 0 && right >= 0 && record.bounds.x <= viewport.width && record.bounds.y <= viewport.height;
}

function scopeMatches(record: PageNodeRecord, options: RetrieveObservationOptions): boolean {
  const request = options.request;
  if (!request || request.scope === "full_page" || request.scope === "visual") return true;
  if (request.expand?.includes("offscreen_links") && record.expansionSource === "offscreen_links") return true;
  if (request.scope === "current_viewport") return isInViewport(record, options.viewport);
  return record.region === request.scope;
}

function hiddenAllowed(record: PageNodeRecord, request?: NeedMoreObservationRequest): boolean {
  if (record.visibility === "visible") return true;
  if (request?.expand?.includes("hidden_menus") && record.region === "sidebar") return true;
  return Boolean(request?.expand?.includes("offscreen_links") && record.role === "link");
}

function preferredRoleScore(record: PageNodeRecord, request?: NeedMoreObservationRequest): number {
  if (!request?.preferredRoles?.length || !record.role) return 0;
  const role = record.role.toLowerCase();
  return request.preferredRoles.some((preferred) => role.includes(preferred)) ? 0.18 : 0;
}

function expansionScore(record: PageNodeRecord, request?: NeedMoreObservationRequest): number {
  if (!record.expansionSource || !request?.expand?.includes(record.expansionSource)) return 0;
  return 0.08;
}

function scoreRecord(record: PageNodeRecord, options: RetrieveObservationOptions): number {
  const request = options.request;
  const terms = tokenize(`${request?.query ?? ""} ${(request?.targetTextHints ?? []).join(" ")}`);
  const base = record.confidence * 0.12;
  const query = textScore(`${record.id} ${record.text} ${record.role ?? ""}`, terms);
  const role = preferredRoleScore(record, request);
  const scope = scopeMatches(record, options) ? 0.14 : 0;
  const visible = record.visibility === "visible" ? 0.1 : -0.08;
  const expansion = expansionScore(record, request);
  const controlBoost = record.kind === "control" ? 0.05 : 0;
  return base + query + role + scope + visible + expansion + controlBoost;
}

function uniqueBest(scored: Array<{ record: PageNodeRecord; score: number; index: number }>): Array<{
  record: PageNodeRecord;
  score: number;
  index: number;
}> {
  const byId = new Map<string, { record: PageNodeRecord; score: number; index: number }>();
  for (const item of scored) {
    const existing = byId.get(item.record.id);
    if (!existing || item.score > existing.score) byId.set(item.record.id, item);
  }
  return Array.from(byId.values());
}

function countUnique(records: PageNodeRecord[], kind: PageNodeRecord["kind"]): number {
  return new Set(records.filter((record) => record.kind === kind).map((record) => record.id)).size;
}

export function retrieveObservationRecords(records: PageNodeRecord[], options: RetrieveObservationOptions): RetrievalResult {
  const candidateLimit = Math.max(1, Math.floor(options.candidateLimit));
  const filtered = records.filter((record) => scopeMatches(record, options) && hiddenAllowed(record, options.request));
  const scored = filtered.map((record, index) => ({ record, score: scoreRecord(record, options), index }));
  const ranked = uniqueBest(scored)
    .sort((left, right) => right.score - left.score || right.record.confidence - left.record.confidence || left.index - right.index)
    .slice(0, candidateLimit)
    .map((item) => item.record);
  const returnedControls = countUnique(ranked, "control");
  const totalControls = countUnique(records, "control");
  const returnedTextBlocks = countUnique(ranked, "text");
  const totalTextBlocks = countUnique(records, "text");
  return {
    records: ranked,
    metadata: {
      request: options.request,
      query: options.request?.query,
      scope: options.request?.scope,
      expand: options.request?.expand,
      candidateLimit,
      totalControls,
      returnedControls,
      omittedControls: Math.max(0, totalControls - returnedControls),
      totalTextBlocks,
      returnedTextBlocks,
      omittedTextBlocks: Math.max(0, totalTextBlocks - returnedTextBlocks),
      strategy: options.request ? "request_ranked" : "default_ranked"
    }
  };
}
