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
  it("does not create overlay root for Off mode when nothing is rendered", () => {
    setOverlayMode("Off", []);

    expect(document.querySelector("[data-naturalclick-overlay-root]")).toBeNull();
  });

  it("clears visual overlay in Off mode", () => {
    setOverlayMode("All Targets", targets);
    setOverlayMode("Off", targets);

    expect(document.querySelector("[data-naturalclick-overlay-root]")).toBeNull();
  });

  it("renders only current target in Focus mode", () => {
    setOverlayMode("Focus", targets);

    expect(document.querySelectorAll("[data-overlay-target]")).toHaveLength(1);
    expect(document.body.textContent).toBe("1");
    expect(document.querySelector("[data-overlay-badge='true']")?.getAttribute("title")).toBeNull();
  });

  it("renders all target badges without verbose labels in All Targets mode", () => {
    setOverlayMode("All Targets", targets);

    expect(document.querySelectorAll("[data-overlay-target]")).toHaveLength(2);
    expect(document.querySelector("[data-overlay-index='1']")?.textContent).toContain("1");
    expect(document.querySelector("[data-overlay-index='2']")?.textContent).toContain("2");
    expect(document.body.textContent).not.toContain("Settings");
    expect(document.body.textContent).not.toContain("0.91");
    expect(Array.from(document.querySelectorAll("[data-overlay-badge='true']")).every((node) => !node.hasAttribute("title"))).toBe(true);
  });

  it("cycles marker colors for ordinary DOM targets", () => {
    setOverlayMode("All Targets", [
      {
        id: "first",
        label: "button - First - 0.90",
        kind: "dom",
        rect: { x: 10, y: 20, width: 80, height: 32 },
        confidence: 0.9
      },
      {
        id: "second",
        label: "button - Second - 0.88",
        kind: "dom",
        rect: { x: 110, y: 20, width: 80, height: 32 },
        confidence: 0.88
      }
    ]);

    const badges = Array.from(document.querySelectorAll<HTMLElement>("[data-overlay-badge='true']"));
    expect(badges[0]?.style.background).not.toBe(badges[1]?.style.background);
  });

  it("renders visual candidates in Vision mode", () => {
    setOverlayMode("Vision", targets);

    expect(document.querySelector("[data-overlay-kind='vision']")).not.toBeNull();
  });

  it("keeps marker badges inside the viewport at the top-left edge", () => {
    setOverlayMode("All Targets", [
      {
        id: "edge",
        label: "button - Edge - 0.90",
        kind: "dom",
        rect: { x: 0, y: 0, width: 80, height: 32 },
        confidence: 0.9,
        state: "candidate"
      }
    ]);

    const label = document.querySelector<HTMLElement>("[data-overlay-label='true']");
    expect(label?.style.left).toBe("2px");
    expect(label?.style.top).toBe("2px");
    expect(document.querySelector("[data-overlay-badge='true']")?.textContent).toBe("1");
  });

  it("clearOverlay removes rendered targets", () => {
    setOverlayMode("All Targets", targets);
    clearOverlay();

    expect(document.querySelectorAll("[data-overlay-target]")).toHaveLength(0);
  });

  it("clearOverlay does not create an empty overlay root", () => {
    clearOverlay();

    expect(document.querySelector("[data-naturalclick-overlay-root]")).toBeNull();
  });
});
