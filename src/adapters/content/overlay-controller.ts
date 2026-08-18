export type OverlayMode = "Off" | "Focus" | "All Targets" | "Evidence" | "Vision";

export interface OverlayTarget {
  id: string;
  label: string;
  kind: "dom" | "evidence" | "vision";
  rect: { x: number; y: number; width: number; height: number };
  confidence?: number;
  state?: "candidate" | "current" | "failed" | "expired";
}

const rootId = "naturalclick-overlay-root";
const markerPalette = ["#23846f", "#2563eb", "#7c3aed", "#db2777", "#d97706", "#0891b2", "#65a30d", "#c2410c"];

function currentOverlayRoot(): HTMLElement | undefined {
  return document.querySelector<HTMLElement>("[data-naturalclick-overlay-root]") ?? undefined;
}

function ensureOverlayRoot(): HTMLElement {
  let root = currentOverlayRoot();
  if (!root) {
    root = document.createElement("div");
    root.id = rootId;
    root.dataset.naturalclickOverlayRoot = "true";
    root.style.position = "fixed";
    root.style.inset = "0";
    root.style.zIndex = "2147483647";
    root.style.pointerEvents = "none";
    root.style.contain = "layout style paint";
    (document.body ?? document.documentElement).append(root);
  }
  return root;
}

function targetsForMode(mode: OverlayMode, targets: OverlayTarget[]): OverlayTarget[] {
  if (mode === "Off") return [];
  if (mode === "Focus") {
    const current = targets.filter((target) => target.state === "current");
    return current.length > 0 ? current : targets.slice(0, 1);
  }
  if (mode === "Evidence") return targets.filter((target) => target.kind === "evidence" || target.state === "current");
  if (mode === "Vision") return targets.filter((target) => target.kind === "vision");
  return targets;
}

function targetColor(target: OverlayTarget, index: number): string {
  if (target.state === "failed") return "#b43c3c";
  if (target.kind === "vision") return "#356ac3";
  if (target.kind === "evidence") return "#a06000";
  return markerPalette[index % markerPalette.length];
}

function colorWash(color: string, alpha: number): string {
  const match = color.match(/^#([0-9a-f]{6})$/i);
  if (!match) return `rgba(35,132,111,${alpha})`;
  const value = Number.parseInt(match[1], 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red},${green},${blue},${alpha})`;
}

function overlayLabelOffset(target: OverlayTarget): { left: string; top: string } {
  return {
    left: target.rect.x < 10 ? "2px" : "-7px",
    top: target.rect.y < 10 ? "2px" : "-7px"
  };
}

function renderTarget(target: OverlayTarget, index: number): HTMLElement {
  const color = targetColor(target, index);
  const isCurrent = target.state === "current";
  const labelOffset = overlayLabelOffset(target);
  const box = document.createElement("div");
  box.dataset.overlayTarget = target.id;
  box.dataset.overlayKind = target.kind;
  box.dataset.overlayState = target.state ?? "candidate";
  box.style.position = "absolute";
  box.style.left = `${target.rect.x}px`;
  box.style.top = `${target.rect.y}px`;
  box.style.width = `${target.rect.width}px`;
  box.style.height = `${target.rect.height}px`;
  box.style.border = `${isCurrent ? "2" : "1.25"}px solid ${color}`;
  box.style.borderRadius = "4px";
  box.style.background = isCurrent ? colorWash(color, 0.08) : colorWash(color, 0.03);
  box.style.boxShadow = isCurrent ? "0 0 0 2px rgba(255,255,255,0.9), 0 2px 10px rgba(17,24,39,0.16)" : "0 0 0 1px rgba(255,255,255,0.82)";
  box.dataset.overlayIndex = String(index + 1);

  const label = document.createElement("span");
  label.dataset.overlayLabel = "true";
  label.style.position = "absolute";
  label.style.left = labelOffset.left;
  label.style.top = labelOffset.top;
  label.style.width = "18px";
  label.style.height = "18px";
  label.style.display = "block";
  label.style.padding = "0";
  label.style.borderRadius = "999px";
  label.style.background = "transparent";
  label.style.color = "#ffffff";
  label.style.font = "600 11px/1.25 ui-sans-serif, system-ui, sans-serif";
  label.style.whiteSpace = "nowrap";
  label.style.overflow = "hidden";
  label.style.textOverflow = "ellipsis";

  const badge = document.createElement("strong");
  badge.dataset.overlayBadge = "true";
  badge.textContent = String(index + 1);
  badge.style.minWidth = "18px";
  badge.style.height = "18px";
  badge.style.display = "inline-grid";
  badge.style.placeItems = "center";
  badge.style.borderRadius = "50%";
  badge.style.background = color;
  badge.style.color = "#ffffff";
  badge.style.font = "700 11px/1 ui-sans-serif, system-ui, sans-serif";
  badge.style.border = "2px solid rgba(255,255,255,0.96)";
  badge.style.boxShadow = "0 1px 5px rgba(18,32,43,0.2)";

  label.append(badge);
  box.append(label);
  return box;
}

export function setOverlayMode(mode: OverlayMode, targets: OverlayTarget[] = []): void {
  if (mode === "Off") {
    currentOverlayRoot()?.remove();
    return;
  }
  const root = ensureOverlayRoot();
  root.replaceChildren();
  targetsForMode(mode, targets).forEach((target, index) => {
    root.append(renderTarget(target, index));
  });
}

export function highlightTarget(targetRef: string): void {
  const root = currentOverlayRoot();
  if (!root) return;
  root.querySelectorAll<HTMLElement>("[data-overlay-target]").forEach((node) => {
    const selected = node.dataset.overlayTarget === targetRef;
    node.dataset.overlayState = selected ? "current" : node.dataset.overlayState ?? "candidate";
    node.style.outline = selected ? "3px solid #ffffff" : "";
  });
}

export function clearOverlay(): void {
  currentOverlayRoot()?.remove();
}
