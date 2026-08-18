import { describe, expect, it } from "vitest";
import { assemblePlannerPageContext } from "../../../src/core/context/page-context-assembler";
import type { PageModel } from "../../../src/core/observation/page-model";
import { ProgressiveObserver } from "../../../src/core/observation/progressive-observer";

function page(controlCount: number): PageModel {
  return {
    pageIdentity: {
      url: "https://example.test/orders",
      title: "Orders",
      origin: "https://example.test",
      path: "/orders"
    },
    viewport: { width: 1280, height: 720, scrollX: 0, scrollY: 0, deviceScaleFactor: 1 },
    feedback: [],
    readableContent: [],
    textBlocks: [
      {
        semanticId: "heading_orders",
        kind: "heading",
        text: "订单管理",
        visibility: "visible",
        locatorHints: [],
        confidence: 0.9
      }
    ],
    forms: [],
    riskSignals: [],
    capturedAt: 1,
    controls: Array.from({ length: controlCount }, (_, index) => ({
      semanticId: `control_${index}`,
      role: index % 3 === 0 ? "link" : "button",
      label: index === controlCount - 1 ? "订单管理" : `Control ${index}`,
      accessibleName: index === controlCount - 1 ? "订单管理" : `Control ${index}`,
      elementTag: "button",
      disabled: false,
      required: false,
      visibility: "visible" as const,
      interactionHints: ["clickable"],
      locatorHints: [],
      confidence: index === controlCount - 1 ? 0.95 : 0.5
    }))
  };
}

describe("planner page context assembler", () => {
  it("trims candidates and keeps omitted counts", () => {
    const context = assemblePlannerPageContext(page(10), {
      candidateLimit: 4,
      taskText: "打开订单管理",
      activeSubgoal: "找到订单入口"
    });

    expect(context.candidates).toHaveLength(4);
    expect(context.omitted.controls).toBe(6);
    expect(context.outline).toContain("订单管理");
  });

  it("keeps planner context free of raw DOM locator and readable content payloads", () => {
    const source = page(2);
    source.controls[0] = {
      ...source.controls[0],
      locatorHints: [{ kind: "css", value: "#internal-debug-id", confidence: 0.9 }],
      bounds: { x: 1, y: 2, width: 300, height: 40 },
      description: "internal description"
    };
    source.readableContent = ["A long raw page excerpt that should not be sent directly."];

    const context = assemblePlannerPageContext(source, {
      candidateLimit: 2,
      taskText: "打开订单管理"
    });
    const serialized = JSON.stringify(context);

    expect(serialized).not.toContain("locatorHints");
    expect(serialized).not.toContain("#internal-debug-id");
    expect(serialized).not.toContain("bounds");
    expect(serialized).not.toContain("readableContent");
    expect(context.candidates[0]).toEqual(
      expect.objectContaining({
        semanticId: expect.any(String),
        role: expect.any(String),
        label: expect.any(String)
      })
    );
  });

  it("includes compact page atlas text when available", () => {
    const source = page(1);
    source.atlasText = '<page_atlas atlas_id="atlas_1"><action_surfaces><control id="c1" handle="h1" label="订单管理" /></action_surfaces></page_atlas>';
    source.interactiveIndexText = '<interactive handle="h1" label="订单管理"></interactive>';

    const context = assemblePlannerPageContext(source, {
      candidateLimit: 1,
      taskText: "打开订单管理"
    });

    expect(context.pageAtlas).toContain("<page_atlas");
    expect(context.interactiveIndex).toContain("<interactive");
    expect(JSON.stringify(context)).not.toContain("<body");
  });

  it("uses semantic id target hints when ranking planner candidates", () => {
    const source = page(3);
    source.controls = [
      {
        ...source.controls[0],
        semanticId: "save_top",
        label: "Save",
        accessibleName: "Save",
        confidence: 0.9
      },
      {
        ...source.controls[1],
        semanticId: "save_bottom",
        label: "Save",
        accessibleName: "Save",
        confidence: 0.9
      },
      {
        ...source.controls[2],
        semanticId: "cancel_button",
        label: "Cancel",
        accessibleName: "Cancel",
        confidence: 0.95
      }
    ];

    const context = assemblePlannerPageContext(source, {
      candidateLimit: 1,
      taskText: "Click save",
      request: {
        reason: "ambiguous_target",
        query: "Save",
        scope: "full_page",
        preferredRoles: ["button"],
        targetTextHints: ["save_bottom"],
        ambiguousCandidates: [
          { semanticId: "save_top", label: "Save", role: "button" },
          { semanticId: "save_bottom", label: "Save", role: "button" }
        ]
      }
    });

    expect(context.candidates.map((candidate) => candidate.semanticId)).toEqual(["save_bottom"]);
  });
});

describe("progressive observer", () => {
  it("expands candidate limits by observation round", async () => {
    const rounds: number[] = [];
    const observer = new ProgressiveObserver(
      {
        observePage: async () => page(700),
        onRound: (round) => {
          rounds.push(round.candidateCount);
        }
      },
      {
        maxObservationRoundsPerStep: 6,
        initialCandidateLimit: 120,
        expandedCandidateLimit: 320,
        hardCandidateLimit: 600
      }
    );

    const result = await observer.observe({
      stepId: "step-1",
      taskText: "打开订单管理",
      activeSubgoal: "找到订单入口",
      requests: [
        { reason: "Need sidebar", scope: "sidebar", query: "订单" },
        { reason: "Need full page", scope: "full_page", query: "订单管理" }
      ]
    });

    expect(result.rounds).toHaveLength(3);
    expect(rounds).toEqual([120, 320, 600]);
    expect(result.pageContext.candidates).toHaveLength(600);
    expect(result.rounds[1].reason).toBe("Need sidebar");
  });
});
