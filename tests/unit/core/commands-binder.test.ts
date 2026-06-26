import { describe, expect, it, vi } from "vitest";
import { executePrimitive } from "../../../src/adapters/content/primitive-executor";
import { bindCommand } from "../../../src/core/commands/binder";
import type { SemanticCommand } from "../../../src/core/commands/commands";
import type { ControlCandidate, PageModel } from "../../../src/core/observation/page-model";
import { createEventId } from "../../../src/shared/ids";

function command(targetGoal: string, type: SemanticCommand["type"] = "ActivateTarget", inputs: Record<string, unknown> = {}): SemanticCommand {
  return {
    id: createEventId(),
    type,
    targetGoal,
    inputs,
    expectedOutcome: "target activates",
    successCriteria: ["target_activated"],
    riskHint: "low",
    fallbackHints: []
  };
}

function control(overrides: Partial<ControlCandidate>): ControlCandidate {
  return {
    semanticId: "settings_button",
    role: "button",
    label: "Settings",
    accessibleName: "Settings",
    elementTag: "button",
    disabled: false,
    required: false,
    visibility: "visible",
    bounds: { x: 10, y: 20, width: 100, height: 40 },
    interactionHints: ["button"],
    locatorHints: [
      { kind: "css", value: "#settings", confidence: 0.96 },
      { kind: "text", value: "Settings", confidence: 0.75 },
      { kind: "role", value: "button", confidence: 0.7 }
    ],
    confidence: 0.9,
    ...overrides
  };
}

function page(overrides: Partial<PageModel> = {}): PageModel {
  return {
    pageIdentity: {
      url: "https://example.test/settings",
      title: "Fixture",
      origin: "https://example.test",
      path: "/settings"
    },
    viewport: { width: 1280, height: 720, scrollX: 0, scrollY: 0, deviceScaleFactor: 1 },
    feedback: [],
    readableContent: ["Settings"],
    controls: [control({})],
    textBlocks: [],
    forms: [],
    riskSignals: [],
    capturedAt: 1,
    ...overrides
  };
}

describe("command binder", () => {
  it("binds a semantic target to a DOM click primitive", () => {
    const result = bindCommand(command("Settings icon"), page());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.primitive).toEqual({ type: "dom_click", semanticId: "settings_button" });
      expect(result.value.targetRef).toBe("settings_button");
      expect(result.value.confidence).toBeGreaterThan(0.7);
      expect(result.value.expiresOn).toBe("navigation");
    }
  });

  it("binds fill commands to DOM input primitives", () => {
    const result = bindCommand(
      command("Email field", "FillField", { value: "ada@example.test" }),
      page({
        controls: [
          control({
            semanticId: "email_field",
            role: "textbox",
            label: "Email",
            accessibleName: "Email address",
            elementTag: "input",
            locatorHints: [{ kind: "css", value: "#email", confidence: 0.96 }]
          })
        ]
      })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.primitive).toEqual({ type: "dom_input", semanticId: "email_field", value: "ada@example.test" });
    }
  });

  it("rejects ambiguous targets", () => {
    const ambiguous = page({
      controls: [
        control({ semanticId: "save_top", label: "Save", accessibleName: "Save", locatorHints: [{ kind: "css", value: "#save-top" }] }),
        control({ semanticId: "save_bottom", label: "Save", accessibleName: "Save", locatorHints: [{ kind: "css", value: "#save-bottom" }] })
      ]
    });

    const result = bindCommand(command("Save button", "SubmitCurrentForm"), ambiguous);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("ambiguous_target");
    }
  });

  it("rejects matched controls that are not interactable", () => {
    const result = bindCommand(
      command("Settings button"),
      page({ controls: [control({ disabled: true, label: "Settings", accessibleName: "Settings" })] })
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("target_not_interactable");
    }
  });

  it("uses high-confidence visual candidates only when no DOM target matches", () => {
    const result = bindCommand(command("Settings gear"), page({ controls: [control({ label: "Help", accessibleName: "Help" })] }), [
      { id: "visual_settings", label: "Settings", x: 44, y: 55, confidence: 0.91 }
    ]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.primitive).toEqual({ type: "coordinate_click", x: 44, y: 55 });
      expect(result.value.bindingEvidenceRefs).toEqual(["visual_settings"]);
    }
  });

  it("keeps DOM binding ahead of visual candidates", () => {
    const result = bindCommand(command("Settings"), page(), [{ id: "visual_settings", label: "Settings", x: 44, y: 55, confidence: 0.99 }]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.primitive).toEqual({ type: "dom_click", semanticId: "settings_button" });
    }
  });

  it("asks for more observation when the page model has no target evidence", () => {
    const result = bindCommand(command("Settings"), page({ controls: [], readableContent: [], textBlocks: [], feedback: [] }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("needs_more_observation");
    }
  });

  it("marks explicit user-choice commands as requiring user choice", () => {
    const result = bindCommand(command("Choose an account", "AskUser"), page());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("requires_user_choice");
    }
  });
});

describe("primitive executor", () => {
  it("clicks DOM targets by semantic id and locator hints", async () => {
    document.body.innerHTML = `<button id="settings">Settings</button>`;
    const clicked = vi.fn();
    document.querySelector("#settings")?.addEventListener("click", clicked);

    const result = await executePrimitive({ type: "dom_click", semanticId: "settings_button" }, page());

    expect(result.status).toBe("success");
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it("inputs values and dispatches input/change events", async () => {
    document.body.innerHTML = `<label for="email">Email</label><input id="email" />`;
    const input = document.querySelector<HTMLInputElement>("#email");
    const inputEvent = vi.fn();
    const changeEvent = vi.fn();
    input?.addEventListener("input", inputEvent);
    input?.addEventListener("change", changeEvent);

    const model = page({
      controls: [
        control({
          semanticId: "email_field",
          role: "textbox",
          label: "Email",
          accessibleName: "Email",
          elementTag: "input",
          locatorHints: [{ kind: "css", value: "#email", confidence: 0.96 }]
        })
      ]
    });

    const result = await executePrimitive({ type: "dom_input", semanticId: "email_field", value: "ada@example.test" }, model);

    expect(result.status).toBe("success");
    expect(input?.value).toBe("ada@example.test");
    expect(inputEvent).toHaveBeenCalledTimes(1);
    expect(changeEvent).toHaveBeenCalledTimes(1);
  });

  it("executes wait primitives asynchronously", async () => {
    vi.useFakeTimers();
    const result = executePrimitive({ type: "wait", milliseconds: 25 }, page());

    await vi.advanceTimersByTimeAsync(25);

    await expect(result).resolves.toEqual({ status: "success", details: { primitive: "wait", milliseconds: 25 } });
    vi.useRealTimers();
  });
});
