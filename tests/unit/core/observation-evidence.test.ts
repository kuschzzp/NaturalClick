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

  it("keeps readable text in default observation when controls fill the candidate budget", () => {
    document.body.innerHTML = `
      <main>
        <h1>南京天气搜索结果</h1>
        <p>南京今日多云，气温 22 到 29 度。</p>
        ${Array.from({ length: 20 }, (_, index) => `<button>候选按钮 ${index}</button>`).join("")}
      </main>
    `;

    const page = observePage(document, { candidateLimit: 5 });

    expect(page.controls).toHaveLength(5);
    expect(page.textBlocks.map((block) => block.text)).toEqual(expect.arrayContaining(["南京天气搜索结果", "南京今日多云，气温 22 到 29 度。"]));
    expect(page.observation).toMatchObject({
      returnedControls: 5,
      returnedTextBlocks: 2
    });
  });

  it("narrows observation results by query and sidebar scope while preserving bindable controls", () => {
    document.body.innerHTML = `
      <aside class="app-sidebar">
        <nav aria-label="主导航">
          <a href="/home">首页</a>
          <a href="/orders">订单管理</a>
          <a href="/customers">客户管理</a>
        </nav>
      </aside>
      <main>
        ${Array.from({ length: 40 }, (_, index) => `<button>无关按钮 ${index}</button>`).join("")}
      </main>
    `;

    const page = observePage(document, {
      request: {
        reason: "Need order menu",
        query: "订单 管理",
        scope: "sidebar",
        preferredRoles: ["link", "menuitem"]
      },
      candidateLimit: 2,
      observationRound: 2
    });

    expect(page.controls.map((control) => control.label)).toEqual(["订单管理", "客户管理"]);
    expect(page.controls[0]?.locatorHints.length).toBeGreaterThan(0);
    expect(page.observation).toMatchObject({
      query: "订单 管理",
      scope: "sidebar",
      candidateLimit: 2,
      returnedControls: 2
    });
  });

  it("includes form fields when form_fields expansion is requested", () => {
    document.body.innerHTML = `
      <main>
        <form aria-label="客户资料">
          <label for="name">客户名称</label>
          <input id="name" />
          <label for="phone">手机号</label>
          <input id="phone" />
          <button type="submit">保存客户</button>
        </form>
        <button>返回</button>
      </main>
    `;

    const page = observePage(document, {
      request: {
        reason: "Need customer form",
        query: "客户",
        scope: "form",
        expand: ["form_fields"],
        preferredRoles: ["textbox", "button"]
      },
      candidateLimit: 5,
      observationRound: 2
    });

    expect(page.controls.map((control) => control.label)).toEqual(["客户名称", "手机号", "保存客户"]);
    expect(page.forms[0]?.label).toBe("客户资料");
  });

  it("returns table row actions when tables expansion matches table text", () => {
    document.body.innerHTML = `
      <main>
        <table>
          <thead><tr><th>订单号</th><th>操作</th></tr></thead>
          <tbody>
            <tr><td>ORD-1001</td><td><button>查看</button></td></tr>
            <tr><td>ORD-1002</td><td><button>取消</button></td></tr>
          </tbody>
        </table>
        <button>刷新</button>
      </main>
    `;

    const page = observePage(document, {
      request: {
        reason: "Need order row action",
        query: "ORD-1002",
        scope: "main_content",
        expand: ["tables"],
        preferredRoles: ["button"]
      },
      candidateLimit: 4,
      observationRound: 2
    });

    expect(page.controls.map((control) => control.label)).toContain("取消");
  });

  it("returns validation feedback and invalid fields when validation expansion is requested", () => {
    document.body.innerHTML = `
      <main>
        <form aria-label="登录">
          <label for="email">邮箱</label>
          <input id="email" aria-invalid="true" />
          <div role="alert">邮箱不能为空</div>
          <button>登录</button>
        </form>
      </main>
    `;

    const page = observePage(document, {
      request: {
        reason: "Need validation detail",
        query: "邮箱",
        scope: "form",
        expand: ["validation_feedback", "form_fields"],
        preferredRoles: ["textbox", "button"]
      },
      candidateLimit: 5,
      observationRound: 2
    });

    expect(page.feedback).toContain("邮箱不能为空");
    expect(page.textBlocks.map((block) => block.text)).toContain("邮箱不能为空");
    expect(page.controls.map((control) => control.label)).toContain("邮箱");
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
