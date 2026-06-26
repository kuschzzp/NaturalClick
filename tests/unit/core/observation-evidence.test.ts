import { describe, expect, it } from "vitest";
import { observePage } from "../../../src/adapters/content/dom-observer";
import type { Evidence } from "../../../src/core/evidence/evidence";
import { EvidenceManager } from "../../../src/core/evidence/manager";
import { focusObservation } from "../../../src/core/observation/focus";

function setViewport(width: number, height: number, deviceScaleFactor = 1): void {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
  Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: deviceScaleFactor });
}

function evidence(id: string, confidence: number, taskId: string, observedAt: number): Evidence {
  return {
    id,
    kind: "content_fact",
    claim: `${id} claim`,
    source: { type: "user", description: "fixture" },
    confidence,
    observedAt,
    taskId,
    visibility: "debug"
  };
}

describe("page observation and evidence", () => {
  it("extracts DOM-first page model details from semantic markup", () => {
    window.history.replaceState({}, "", "/settings");
    setViewport(1280, 720, 2);
    document.title = "Fixture Settings";
    document.documentElement.lang = "en";
    document.body.innerHTML = `
      <main>
        <h1>Account settings</h1>
        <p>Update your profile and billing preferences.</p>
        <form id="profile-form" aria-label="Profile form">
          <label for="email">Email</label>
          <input id="email" name="email" type="email" required value="ada@example.test" autocomplete="email" />
          <button id="save" type="submit" aria-label="Save changes">Save</button>
        </form>
        <a id="billing" href="/billing">Billing</a>
        <div role="alert">Email is required</div>
        <button id="delete-account" data-danger="true">Delete account</button>
      </main>
    `;

    const page = observePage(document);

    expect(page.pageIdentity).toMatchObject({
      url: `${window.location.origin}/settings`,
      title: "Fixture Settings",
      origin: window.location.origin,
      path: "/settings",
      language: "en"
    });
    expect(page.viewport).toEqual({ width: 1280, height: 720, scrollX: 0, scrollY: 0, deviceScaleFactor: 2 });
    expect(page.controls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Email", role: "textbox", required: true, valueState: "filled" }),
        expect.objectContaining({ label: "Save changes", role: "button" }),
        expect.objectContaining({ label: "Delete account", role: "button" })
      ])
    );
    expect(page.textBlocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: "Account settings", kind: "heading", headingLevel: 1 }),
        expect.objectContaining({ text: "Update your profile and billing preferences.", kind: "paragraph" })
      ])
    );
    expect(page.forms).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Profile form",
          requiredControlLabels: ["Email"],
          submitControlLabels: ["Save changes"]
        })
      ])
    );
    expect(page.feedback).toContain("Email is required");
    expect(page.riskSignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "destructive_action", severity: "high", message: expect.stringContaining("Delete account") }),
        expect.objectContaining({ kind: "personal_data", severity: "medium", message: expect.stringContaining("Email") })
      ])
    );
  });

  it("focuses controls and text deterministically for a target intent", () => {
    document.body.innerHTML = `
      <main>
        <h1>Security settings</h1>
        <button id="help">Help</button>
        <button id="settings" aria-label="Settings">Gear</button>
        <button id="save" aria-label="Save settings">Save</button>
      </main>
    `;

    const focused = focusObservation(observePage(document), "settings");

    expect(focused.pageIdentity).toContain(document.title);
    expect(focused.candidates.map((candidate) => candidate.label)).toEqual(["Settings", "Save settings"]);
    expect(focused.textBlocks.map((block) => block.text)).toContain("Security settings");
  });

  it("emits typed evidence from page models and supports explicit evidence shapes", () => {
    document.body.innerHTML = `<button id="settings" aria-label="Settings">Gear</button>`;
    const page = observePage(document);
    const manager = new EvidenceManager({ limit: 10, now: () => 1000 });
    const emitted = manager.fromPageModel(page, "evt_observed", { taskId: "task-1" });

    expect(emitted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "page_identity", source: expect.objectContaining({ type: "dom", eventId: "evt_observed" }) }),
        expect.objectContaining({ kind: "control_presence", claim: expect.stringContaining("Settings"), taskId: "task-1" })
      ])
    );
    expect(manager.byTask("task-1").length).toBe(emitted.length);

    const visualEvidence: Evidence = {
      id: "ev_visual",
      kind: "visual_target",
      claim: "Settings button is visible in screenshot",
      source: { type: "visual", captureId: "capture-1", targetId: "target-1" },
      confidence: 0.89,
      observedAt: 1001,
      visibility: "debug"
    };
    const executionEvidence: Evidence = {
      id: "ev_execution",
      kind: "action_effect",
      claim: "Click opened the settings panel",
      source: { type: "execution", commandId: "cmd-1", resultId: "result-1" },
      confidence: 0.91,
      observedAt: 1002,
      visibility: "user"
    };

    manager.addMany([visualEvidence, executionEvidence]);

    expect(manager.list({ limit: 2 }).map((item) => item.id)).toEqual(["ev_execution", "ev_visual"]);
  });

  it("keeps high-confidence evidence first when enforcing the manager limit", () => {
    const manager = new EvidenceManager({ limit: 3 });

    manager.addMany([
      evidence("low-task-a", 0.1, "task-a", 1),
      evidence("mid-task-a", 0.5, "task-a", 2),
      evidence("high-task-b", 0.9, "task-b", 3),
      evidence("top-task-a", 0.95, "task-a", 4)
    ]);

    expect(manager.list().map((item) => item.id)).toEqual(["top-task-a", "high-task-b", "mid-task-a"]);
    expect(manager.byTask("task-a").map((item) => item.id)).toEqual(["top-task-a", "mid-task-a"]);
  });
});
