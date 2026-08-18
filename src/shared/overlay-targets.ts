import type { ControlCandidate, ElementBounds, PageModel, ViewportSnapshot } from "../core/observation/page-model";
import type { DebugOverlayTarget } from "../core/observation/debug-overlay-model";
import type { OverlayTargetPayload } from "./protocol";

export const DEFAULT_OVERLAY_TARGET_LIMIT = 600;

export interface OverlayTargetOptions {
  limit?: number;
  includeOffscreen?: boolean;
  currentTargetId?: string;
}

function hasUsableBounds(bounds?: ElementBounds): bounds is ElementBounds {
  return Boolean(
    bounds &&
      Number.isFinite(bounds.x) &&
      Number.isFinite(bounds.y) &&
      Number.isFinite(bounds.width) &&
      Number.isFinite(bounds.height) &&
      bounds.width >= 2 &&
      bounds.height >= 2
  );
}

function hasRenderableBounds(control: ControlCandidate): control is ControlCandidate & { bounds: ElementBounds } {
  return hasUsableBounds(control.bounds);
}

function intersectsViewport(bounds: ElementBounds, viewport: ViewportSnapshot): boolean {
  if (viewport.width <= 0 || viewport.height <= 0) return true;
  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;
  return right >= 0 && bottom >= 0 && bounds.x <= viewport.width && bounds.y <= viewport.height;
}

function compactLabel(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 48);
}

function controlLabel(control: ControlCandidate): string {
  return compactLabel(control.label || control.accessibleName || control.description || control.role || control.semanticId);
}

export function projectOverlayTargets(page: PageModel, options: OverlayTargetOptions = {}): Array<OverlayTargetPayload & DebugOverlayTarget> {
  const limit = Math.max(1, Math.floor(options.limit ?? DEFAULT_OVERLAY_TARGET_LIMIT));
  const controls = page.controls
    .filter((control) => control.visibility === "visible")
    .filter(hasRenderableBounds)
    .filter((control) => options.includeOffscreen || intersectsViewport(control.bounds, page.viewport))
    .sort((left, right) => {
      const leftBounds = left.bounds as ElementBounds;
      const rightBounds = right.bounds as ElementBounds;
      return leftBounds.y - rightBounds.y || leftBounds.x - rightBounds.x || left.semanticId.localeCompare(right.semanticId);
    })
    .slice(0, limit);

  return controls.map((control) => ({
    id: control.semanticId,
    label: controlLabel(control),
    debugOnly: true,
    kind: "dom",
    rect: control.bounds,
    bounds: control.bounds,
    confidence: control.confidence,
    state: control.semanticId === options.currentTargetId ? "current" : "candidate"
  }));
}

export function overlayTargetsFromPage(page: PageModel, options: OverlayTargetOptions = {}): OverlayTargetPayload[] {
  return projectOverlayTargets(page, options);
}
