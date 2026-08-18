import type { ElementBounds } from "./page-model";

export interface DebugOverlayTarget {
  id: string;
  label: string;
  bounds: ElementBounds;
  debugOnly: true;
  kind?: "dom" | "evidence" | "vision";
  confidence?: number;
  state?: "candidate" | "current" | "failed" | "expired";
}
