import { describe, expect, it } from "vitest";
import type { PageModel } from "../../../src/core/observation/page-model";
import { overlayTargetsFromPage, projectOverlayTargets } from "../../../src/shared/overlay-targets";

function page(): PageModel {
  return {
    pageIdentity: {
      url: "https://example.test",
      title: "Fixture",
      origin: "https://example.test",
      path: "/"
    },
    viewport: { width: 320, height: 240, scrollX: 0, scrollY: 0, deviceScaleFactor: 1 },
    feedback: [],
    readableContent: [],
    textBlocks: [],
    forms: [],
    riskSignals: [],
    capturedAt: 1,
    controls: [
      {
        semanticId: "below_fold",
        role: "button",
        label: "Below fold",
        accessibleName: "Below fold",
        elementTag: "button",
        disabled: false,
        required: false,
        visibility: "visible",
        bounds: { x: 10, y: 400, width: 80, height: 32 },
        interactionHints: [],
        locatorHints: [],
        confidence: 0.82
      },
      {
        semanticId: "top_right",
        role: "link",
        label: "Docs",
        accessibleName: "Docs",
        elementTag: "a",
        disabled: false,
        required: false,
        visibility: "visible",
        bounds: { x: 120, y: 20, width: 60, height: 24 },
        interactionHints: [],
        locatorHints: [],
        confidence: 0.91
      },
      {
        semanticId: "top_left",
        role: "button",
        label: "Menu",
        accessibleName: "Menu",
        elementTag: "button",
        disabled: false,
        required: false,
        visibility: "visible",
        bounds: { x: 10, y: 20, width: 80, height: 32 },
        interactionHints: [],
        locatorHints: [],
        confidence: 0.9
      },
      {
        semanticId: "hidden",
        role: "button",
        label: "Hidden",
        accessibleName: "Hidden",
        elementTag: "button",
        disabled: false,
        required: false,
        visibility: "hidden",
        bounds: { x: 10, y: 80, width: 80, height: 32 },
        interactionHints: [],
        locatorHints: [],
        confidence: 0.8
      }
    ]
  };
}

describe("overlayTargetsFromPage", () => {
  it("returns visible viewport controls in visual order", () => {
    const targets = overlayTargetsFromPage(page());

    expect(targets.map((target) => target.id)).toEqual(["top_left", "top_right"]);
    expect(targets[0]).toMatchObject({
      label: "Menu",
      debugOnly: true,
      kind: "dom",
      rect: { x: 10, y: 20, width: 80, height: 32 }
    });
    expect(JSON.stringify(targets)).not.toContain("button - Menu - 0.90");
  });

  it("can include offscreen controls when requested", () => {
    const targets = overlayTargetsFromPage(page(), { includeOffscreen: true });

    expect(targets.map((target) => target.id)).toContain("below_fold");
  });

  it("marks the current bound target when provided", () => {
    const targets = overlayTargetsFromPage(page(), { currentTargetId: "top_right" });

    expect(targets.find((target) => target.id === "top_right")?.state).toBe("current");
    expect(targets.find((target) => target.id === "top_left")?.state).toBe("candidate");
  });

  it("keeps debug overlay labels out of model-facing handles", () => {
    const targets = projectOverlayTargets({
      ...page(),
      controls: [
        {
          ...page().controls[0],
          semanticId: "control_1",
          role: "button",
          label: "客户管理",
          accessibleName: "客户管理",
          bounds: { x: 1, y: 2, width: 80, height: 32 },
          confidence: 0.88
        }
      ]
    });

    expect(targets[0]).toMatchObject({ label: "客户管理", debugOnly: true });
    expect(JSON.stringify(targets)).not.toContain("button - 客户管理 - 0.88");
  });
});
