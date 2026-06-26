import { createEventId } from "../../shared/ids";
import type { PageModel } from "../observation/page-model";
import type { Evidence, EvidenceKind, EvidenceVisibility } from "./evidence";

export interface EvidenceManagerOptions {
  limit?: number;
  now?: () => number;
}

export interface EvidenceQuery {
  taskId?: string;
  kind?: EvidenceKind;
  minConfidence?: number;
  includeExpired?: boolean;
  limit?: number;
}

export interface PageEvidenceOptions {
  taskId?: string;
  goalId?: string;
  commandId?: string;
  visibility?: EvidenceVisibility;
}

const DEFAULT_LIMIT = 200;

function createEvidenceId(): string {
  return createEventId().replace(/^evt_/, "ev_");
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function sortByConfidence(a: Evidence, b: Evidence): number {
  const confidenceDelta = b.confidence - a.confidence;
  if (confidenceDelta !== 0) return confidenceDelta;
  const timeDelta = b.observedAt - a.observedAt;
  if (timeDelta !== 0) return timeDelta;
  return a.id.localeCompare(b.id);
}

export class EvidenceManager {
  private readonly limit: number;
  private readonly now: () => number;
  private items: Evidence[] = [];

  constructor(options: EvidenceManagerOptions = {}) {
    this.limit = Math.max(1, Math.floor(options.limit ?? DEFAULT_LIMIT));
    this.now = options.now ?? (() => Date.now());
  }

  add(evidence: Evidence): Evidence {
    const normalized = { ...evidence, confidence: clampConfidence(evidence.confidence) };
    const existingIndex = this.items.findIndex((item) => item.id === normalized.id);
    if (existingIndex >= 0) {
      this.items[existingIndex] = normalized;
    } else {
      this.items.push(normalized);
    }
    this.enforceLimit();
    return normalized;
  }

  addMany(evidence: Evidence[]): Evidence[] {
    const ids = new Set(evidence.map((item) => item.id));
    for (const item of evidence) {
      this.add(item);
    }
    return this.list({ includeExpired: true }).filter((item) => ids.has(item.id));
  }

  list(query: EvidenceQuery = {}): Evidence[] {
    const now = this.now();
    const filtered = this.items.filter((item) => {
      if (!query.includeExpired && item.expiresAt !== undefined && item.expiresAt <= now) return false;
      if (query.taskId !== undefined && item.taskId !== query.taskId) return false;
      if (query.kind !== undefined && item.kind !== query.kind) return false;
      if (query.minConfidence !== undefined && item.confidence < query.minConfidence) return false;
      return true;
    });

    return filtered.sort(sortByConfidence).slice(0, query.limit ?? filtered.length);
  }

  byTask(taskId: string, query: Omit<EvidenceQuery, "taskId"> = {}): Evidence[] {
    return this.list({ ...query, taskId });
  }

  clear(): void {
    this.items = [];
  }

  fromPageModel(page: PageModel, sourceEventId: string, options: PageEvidenceOptions = {}): Evidence[] {
    const observedAt = this.now();
    const visibility = options.visibility ?? "debug";
    const common = {
      observedAt,
      taskId: options.taskId,
      goalId: options.goalId,
      commandId: options.commandId,
      visibility
    };

    const evidence: Evidence[] = [
      {
        id: createEvidenceId(),
        kind: "page_identity",
        claim: `Current page is "${page.pageIdentity.title || page.pageIdentity.url}" at ${page.pageIdentity.url}`,
        source: { type: "dom", eventId: sourceEventId, pageUrl: page.pageIdentity.url },
        confidence: 0.86,
        ...common
      },
      {
        id: createEvidenceId(),
        kind: "navigation_state",
        claim: `Viewport is ${page.viewport.width}x${page.viewport.height} at scroll ${page.viewport.scrollX},${page.viewport.scrollY}`,
        source: { type: "dom", eventId: sourceEventId, pageUrl: page.pageIdentity.url },
        confidence: 0.8,
        ...common
      },
      ...page.controls.map<Evidence>((control) => ({
        id: createEvidenceId(),
        kind: "control_presence",
        claim: `${control.visibility === "visible" ? "Visible" : "Hidden"} ${control.role} "${
          control.label || control.accessibleName || control.semanticId
        }" exists`,
        source: {
          type: "dom",
          eventId: sourceEventId,
          pageUrl: page.pageIdentity.url,
          controlId: control.semanticId,
          locator: control.locatorHints[0]?.value
        },
        confidence: control.confidence,
        ...common
      })),
      ...page.feedback.map<Evidence>((message) => ({
        id: createEvidenceId(),
        kind: "validation_feedback",
        claim: `Page feedback says "${message}"`,
        source: { type: "dom", eventId: sourceEventId, pageUrl: page.pageIdentity.url },
        confidence: 0.84,
        ...common
      })),
      ...page.textBlocks.slice(0, 20).map<Evidence>((block) => ({
        id: createEvidenceId(),
        kind: "content_fact",
        claim: `Page text includes "${block.text}"`,
        source: {
          type: "dom",
          eventId: sourceEventId,
          pageUrl: page.pageIdentity.url,
          textId: block.semanticId,
          locator: block.locatorHints[0]?.value
        },
        confidence: block.confidence,
        ...common
      })),
      ...page.riskSignals.map<Evidence>((risk) => ({
        id: createEvidenceId(),
        kind: "risk_signal",
        claim: `${risk.severity} risk: ${risk.message}`,
        source: {
          type: "dom",
          eventId: sourceEventId,
          pageUrl: page.pageIdentity.url,
          controlId: risk.controlRef,
          textId: risk.textRef,
          formId: risk.formRef
        },
        confidence: risk.confidence,
        ...common
      }))
    ];

    return this.addMany(evidence);
  }

  private enforceLimit(): void {
    this.items = this.items.sort(sortByConfidence).slice(0, this.limit);
  }
}
