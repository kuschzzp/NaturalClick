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

function overlayRoot(): HTMLElement {
  let root = document.querySelector<HTMLElement>("[data-naturalclick-overlay-root]");
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

function targetColor(target: OverlayTarget): string {
  if (target.state === "failed") return "#b43c3c";
  if (target.kind === "vision") return "#356ac3";
  if (target.kind === "evidence") return "#a06000";
  return "#1f7a64";
}

function renderTarget(target: OverlayTarget, index: number): HTMLElement {
  const box = document.createElement("div");
  box.dataset.overlayTarget = target.id;
  box.dataset.overlayKind = target.kind;
  box.dataset.overlayState = target.state ?? "candidate";
  box.style.position = "absolute";
  box.style.left = `${target.rect.x}px`;
  box.style.top = `${target.rect.y}px`;
  box.style.width = `${target.rect.width}px`;
  box.style.height = `${target.rect.height}px`;
  box.style.border = `2px solid ${targetColor(target)}`;
  box.style.borderRadius = "6px";
  box.style.boxShadow = "0 0 0 2px rgba(255,255,255,0.9)";

  const label = document.createElement("span");
  label.textContent = target.label || `#${index + 1}`;
  label.style.position = "absolute";
  label.style.left = "0";
  label.style.top = "-24px";
  label.style.maxWidth = "260px";
  label.style.padding = "2px 6px";
  label.style.borderRadius = "6px";
  label.style.background = targetColor(target);
  label.style.color = "#ffffff";
  label.style.font = "12px/1.4 ui-sans-serif, system-ui, sans-serif";
  label.style.whiteSpace = "nowrap";
  label.style.overflow = "hidden";
  label.style.textOverflow = "ellipsis";
  box.append(label);
  return box;
}

export function setOverlayMode(mode: OverlayMode, targets: OverlayTarget[] = []): void {
  const root = overlayRoot();
  root.replaceChildren();
  targetsForMode(mode, targets).forEach((target, index) => {
    root.append(renderTarget(target, index));
  });
}

export function highlightTarget(targetRef: string): void {
  const root = overlayRoot();
  root.querySelectorAll<HTMLElement>("[data-overlay-target]").forEach((node) => {
    const selected = node.dataset.overlayTarget === targetRef;
    node.dataset.overlayState = selected ? "current" : node.dataset.overlayState ?? "candidate";
    node.style.outline = selected ? "3px solid #ffffff" : "";
  });
}

export function clearOverlay(): void {
  overlayRoot().replaceChildren();
}
