import { describe, expect, it } from "vitest";
import { clearOverlay, setOverlayMode } from "../../../src/adapters/content/overlay-controller";

const targets = [
  {
    id: "settings",
    label: "#12 button - Settings - 0.91",
    kind: "dom" as const,
    rect: { x: 10, y: 20, width: 80, height: 32 },
    confidence: 0.91,
    state: "current" as const
  },
  {
    id: "vision-settings",
    label: "Vision - Settings - 0.88",
    kind: "vision" as const,
    rect: { x: 12, y: 22, width: 76, height: 30 },
    confidence: 0.88,
    state: "candidate" as const
  }
];

describe("overlay controller", () => {
  it("clears visual overlay in Off mode", () => {
    setOverlayMode("All Targets", targets);
    setOverlayMode("Off", targets);

    expect(document.querySelector("[data-naturalclick-overlay-root]")?.textContent).toBe("");
  });

  it("renders only current target in Focus mode", () => {
    setOverlayMode("Focus", targets);

    expect(document.body.textContent).toContain("Settings");
    expect(document.querySelectorAll("[data-overlay-target]")).toHaveLength(1);
  });

  it("renders all target labels in All Targets mode", () => {
    setOverlayMode("All Targets", targets);

    expect(document.querySelectorAll("[data-overlay-target]")).toHaveLength(2);
  });

  it("renders visual candidates in Vision mode", () => {
    setOverlayMode("Vision", targets);

    expect(document.querySelector("[data-overlay-kind='vision']")).not.toBeNull();
  });

  it("clearOverlay removes rendered targets", () => {
    setOverlayMode("All Targets", targets);
    clearOverlay();

    expect(document.querySelectorAll("[data-overlay-target]")).toHaveLength(0);
  });
});
