import { describe, expect, it } from "vitest";
import { observePage } from "../../../src/adapters/content/dom-observer";

function setRect(element: Element, rect: Partial<DOMRect> = {}): void {
  element.getBoundingClientRect = () =>
    ({
      x: rect.x ?? 0,
      y: rect.y ?? 0,
      width: rect.width ?? 120,
      height: rect.height ?? 32,
      top: rect.y ?? 0,
      left: rect.x ?? 0,
      right: (rect.x ?? 0) + (rect.width ?? 120),
      bottom: (rect.y ?? 0) + (rect.height ?? 32),
      toJSON: () => ({})
    }) as DOMRect;
}

describe("dom observer", () => {
  it("returns a compact page atlas and hidden handles without drawing visual markers", () => {
    document.body.innerHTML = `
      <main>
        <h1>客户列表</h1>
        <button id="new-customer">新建客户</button>
        <table aria-label="客户表">
          <tbody>
            <tr><td>张三</td><td><button>详情</button></td></tr>
            <tr><td>李四</td><td><button>详情</button></td></tr>
          </tbody>
        </table>
      </main>
    `;
    document.querySelectorAll("*").forEach((element, index) => setRect(element, { y: index * 36 }));

    const page = observePage(document, { mode: "atlas", candidateLimit: 20 });

    expect(page.controls.some((control) => control.label === "新建客户")).toBe(true);
    expect(page.atlasText).toContain("<page_atlas");
    expect(page.atlasText).toContain("客户表");
    expect(page.interactiveIndexText).toContain('label="新建客户"');
    expect(document.querySelector("[data-naturalclick-handle]")).not.toBeNull();
    expect(document.querySelector("[data-naturalclick-overlay],.naturalclick-overlay,.nc-overlay")).toBeNull();
  });

  it("detects common admin component controls and pointer-click targets", () => {
    document.body.innerHTML = `
      <nav>
        <div class="el-menu-item">客户管理</div>
        <div class="ant-menu-submenu-title">系统工具</div>
      </nav>
      <main>
        <div id="detail" style="cursor: pointer">查看详情</div>
        <div>普通文本</div>
      </main>
    `;
    document.querySelectorAll("*").forEach((element, index) => setRect(element, { y: index * 40 }));

    const page = observePage(document, { candidateLimit: 20 });
    const controls = page.controls.map((control) => ({ label: control.label, role: control.role }));

    expect(controls).toEqual(
      expect.arrayContaining([
        { label: "客户管理", role: "menuitem" },
        { label: "系统工具", role: "menuitem" },
        { label: "查看详情", role: "button" }
      ])
    );
    expect(controls.some((control) => control.label === "普通文本")).toBe(false);
  });

  it("marks the active editable control as focused without drawing overlays", () => {
    document.body.innerHTML = `
      <main>
        <label for="query">查询</label>
        <input id="query" value="" />
        <label for="note">备注</label>
        <textarea id="note"></textarea>
      </main>
    `;
    document.querySelectorAll("*").forEach((element, index) => setRect(element, { y: index * 36 }));
    document.querySelector<HTMLInputElement>("#query")?.focus();

    const page = observePage(document, { candidateLimit: 10 });

    expect(page.controls.find((control) => control.label === "查询")).toMatchObject({
      focused: true,
      role: "textbox"
    });
    expect(page.controls.find((control) => control.label === "备注")?.focused).toBeUndefined();
    expect(document.querySelector("[data-naturalclick-overlay],.naturalclick-overlay,.nc-overlay")).toBeNull();
  });

  it("captures aria-checked state for custom switch controls", () => {
    document.body.innerHTML = `
      <main>
        <button id="notify" role="switch" aria-checked="false">通知</button>
      </main>
    `;
    const notify = document.querySelector<HTMLElement>("#notify");
    if (notify) setRect(notify, { x: 20, y: 20, width: 120, height: 32 });

    const page = observePage(document, { candidateLimit: 5 });

    expect(page.controls.find((control) => control.label === "通知")).toMatchObject({
      role: "switch",
      valueState: "unchecked",
      checked: false
    });
  });

  it("captures selected state for tabs and current navigation controls", () => {
    document.body.innerHTML = `
      <main>
        <div role="tablist">
          <button id="pending" role="tab" aria-selected="true">待办</button>
          <button id="started" role="tab" aria-selected="false">已发起</button>
        </div>
        <nav>
          <a id="settings" aria-current="page" href="/settings">设置</a>
        </nav>
      </main>
    `;
    document.querySelectorAll("*").forEach((element, index) => setRect(element, { y: index * 36 }));

    const page = observePage(document, { candidateLimit: 10 });

    expect(page.controls.find((control) => control.label === "待办")).toMatchObject({
      role: "tab",
      valueState: "selected"
    });
    expect(page.controls.find((control) => control.label === "已发起")?.valueState).toBeUndefined();
    expect(page.controls.find((control) => control.label === "设置")).toMatchObject({
      role: "link",
      valueState: "selected"
    });
  });

  it("filters empty unusable controls and removes nested duplicate menu containers", () => {
    document.body.innerHTML = `
      <nav>
        <div role="menuitem" class="el-sub-menu">
          <span class="el-sub-menu__title" style="cursor: pointer">客户管理</span>
        </div>
        <div role="menuitem" class="el-menu-item"></div>
      </nav>
    `;
    const parent = document.querySelector<HTMLElement>(".el-sub-menu");
    const title = document.querySelector<HTMLElement>(".el-sub-menu__title");
    const empty = document.querySelector<HTMLElement>(".el-menu-item");
    if (parent) setRect(parent, { x: 0, y: 0, width: 260, height: 64 });
    if (title) setRect(title, { x: 56, y: 18, width: 90, height: 28 });
    if (empty) setRect(empty, { x: 0, y: 80, width: 0, height: 0 });

    const page = observePage(document, { candidateLimit: 20 });
    const customerControls = page.controls.filter((control) => control.label === "客户管理");

    expect(customerControls).toHaveLength(1);
    expect(customerControls[0]).toMatchObject({
      role: "menuitem",
      bounds: { x: 56, y: 18, width: 90, height: 28 }
    });
    expect(page.controls.some((control) => !control.label.trim())).toBe(false);
  });

  it("uses visible submenu titles instead of aggregate hidden descendant text", () => {
    document.body.innerHTML = `
      <aside class="app-sidebar">
        <ul class="el-menu">
          <li id="customer-group" class="el-sub-menu">客户管理
            <span id="customer-title" class="el-sub-menu__title" style="cursor: pointer">客户管理</span>
            <ul>
              <li id="lead-menu">线索</li>
              <li id="customer-menu">客户</li>
            </ul>
          </li>
        </ul>
      </aside>
    `;
    const group = document.querySelector<HTMLElement>("#customer-group");
    const title = document.querySelector<HTMLElement>("#customer-title");
    const lead = document.querySelector<HTMLElement>("#lead-menu");
    const customer = document.querySelector<HTMLElement>("#customer-menu");
    if (group) setRect(group, { x: 0, y: 120, width: 260, height: 56 });
    if (title) setRect(title, { x: 56, y: 132, width: 90, height: 28 });
    if (lead) setRect(lead, { x: 0, y: 0, width: 0, height: 0 });
    if (customer) setRect(customer, { x: 0, y: 0, width: 0, height: 0 });

    const page = observePage(document, { candidateLimit: 20 });

    expect(page.controls.some((control) => control.label.includes("线索") || control.label.includes("客户管理客户"))).toBe(false);
    expect(page.controls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "客户管理",
          role: "menuitem",
          regionRef: "sidebar"
        })
      ])
    );
    expect(page.textBlocks.some((block) => block.text === "客户" && block.visibility === "visible")).toBe(false);
    expect(page.textBlocks.some((block) => block.text.includes("线索客户"))).toBe(false);
  });

  it("promotes sidebar list submenu items to bindable controls", () => {
    document.body.innerHTML = `
      <aside class="app-sidebar">
        <ul class="business-menu">
          <li id="customer-group">客户管理
            <ul>
              <li id="lead-menu">线索</li>
              <li id="customer-menu">客户</li>
              <li id="opportunity-menu">商机</li>
            </ul>
          </li>
        </ul>
      </aside>
    `;
    document.querySelectorAll("*").forEach((element, index) => setRect(element, { y: index * 36 }));

    const page = observePage(document, {
      request: {
        reason: "Need customer submenu",
        query: "客户",
        scope: "sidebar",
        preferredRoles: ["menuitem", "listitem"]
      },
      candidateLimit: 10
    });

    expect(page.controls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "客户", role: "menuitem", elementTag: "li" }),
        expect.objectContaining({ label: "线索", role: "menuitem", elementTag: "li" })
      ])
    );
    expect(page.controls.find((control) => control.label === "客户")?.locatorHints).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "text", value: "客户" })])
    );
  });

  it("annotates generic controls with clickability, expansion state, and menu hierarchy", () => {
    document.body.innerHTML = `
      <aside class="app-sidebar">
        <ul class="el-menu">
          <li id="customer-group" class="el-sub-menu" aria-expanded="true">
            <span id="customer-title" class="el-sub-menu__title" style="cursor: pointer">客户管理</span>
            <ul>
              <li id="customer-menu">客户</li>
            </ul>
          </li>
        </ul>
      </aside>
    `;
    const title = document.querySelector<HTMLElement>("#customer-title");
    const child = document.querySelector<HTMLElement>("#customer-menu");
    if (title) setRect(title, { x: 10, y: 20, width: 180, height: 40 });
    if (child) setRect(child, { x: 28, y: 70, width: 160, height: 36 });
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: (x: number, y: number) => {
        if (x >= 10 && x <= 190 && y >= 20 && y <= 60) return title;
        if (x >= 28 && x <= 188 && y >= 70 && y <= 106) return child;
        return document.body;
      }
    });

    const page = observePage(document, {
      request: {
        reason: "Need menu hierarchy",
        query: "客户",
        scope: "sidebar",
        preferredRoles: ["menuitem"]
      },
      candidateLimit: 4
    });
    const parent = page.controls.find((control) => control.label === "客户管理");
    const submenu = page.controls.find((control) => control.label === "客户");

    expect(parent).toMatchObject({
      expandedState: "expanded",
      clickablePoint: { x: 100, y: 40 },
      occlusion: "clear"
    });
    expect(submenu?.parentRef).toBe(parent?.semanticId);
    expect(parent?.childRefs).toContain(submenu?.semanticId);
  });

  it("marks controls as covered when their center point is hit by another element", () => {
    document.body.innerHTML = `
      <main>
        <button id="covered">保存</button>
        <div id="overlay">遮罩</div>
      </main>
    `;
    const covered = document.querySelector<HTMLElement>("#covered");
    const overlay = document.querySelector<HTMLElement>("#overlay");
    if (covered) setRect(covered, { x: 20, y: 20, width: 120, height: 40 });
    if (overlay) setRect(overlay, { x: 0, y: 0, width: 200, height: 100 });
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => overlay
    });

    const page = observePage(document, { candidateLimit: 5 });

    expect(page.controls.find((control) => control.label === "保存")).toMatchObject({
      clickablePoint: { x: 80, y: 40 },
      occlusion: "covered"
    });
  });

  it("omits collapsed zero-size sidebar submenu items from default controls", () => {
    document.body.innerHTML = `
      <aside class="app-sidebar">
        <ul class="business-menu">
          <li id="customer-group">客户管理
            <ul>
              <li id="customer-menu">客户</li>
            </ul>
          </li>
        </ul>
      </aside>
    `;
    const group = document.querySelector<HTMLElement>("#customer-group");
    const submenu = document.querySelector<HTMLElement>("#customer-menu");
    if (group) setRect(group, { x: 0, y: 120, width: 260, height: 56 });
    if (submenu) setRect(submenu, { x: 0, y: 0, width: 0, height: 0 });

    const page = observePage(document, { candidateLimit: 10 });

    expect(page.controls.map((control) => control.semanticId)).not.toContain("control_1_menuitem_客户");
    expect(page.controls.some((control) => control.label === "客户" && control.bounds?.width === 0)).toBe(false);
    expect(page.textBlocks.some((block) => block.text === "客户" && block.visibility === "visible")).toBe(false);
  });

  it("returns hidden sidebar submenu controls only when hidden_menus expansion is requested", () => {
    document.body.innerHTML = `
      <aside class="app-sidebar">
        <ul class="el-menu">
          <li id="customer-group" class="el-sub-menu">客户管理
            <span id="customer-title" class="el-sub-menu__title" style="cursor: pointer">客户管理</span>
            <ul>
              <li id="customer-menu">客户</li>
            </ul>
          </li>
        </ul>
      </aside>
    `;
    const group = document.querySelector<HTMLElement>("#customer-group");
    const title = document.querySelector<HTMLElement>("#customer-title");
    const submenu = document.querySelector<HTMLElement>("#customer-menu");
    if (group) setRect(group, { x: 0, y: 120, width: 260, height: 56 });
    if (title) setRect(title, { x: 56, y: 132, width: 90, height: 28 });
    if (submenu) setRect(submenu, { x: 0, y: 0, width: 0, height: 0 });

    const page = observePage(document, {
      request: {
        reason: "Need hidden customer submenu",
        query: "客户",
        scope: "sidebar",
        expand: ["hidden_menus"],
        preferredRoles: ["menuitem", "listitem"]
      },
      candidateLimit: 10
    });
    const parent = page.controls.find((control) => control.label === "客户管理");
    const child = page.controls.find((control) => control.label === "客户");

    expect(child).toMatchObject({
      role: "menuitem",
      visibility: "hidden",
      bounds: { x: 0, y: 0, width: 0, height: 0 },
      parentRef: parent?.semanticId
    });
    expect(parent?.childRefs).toContain(child?.semanticId);
  });

  it("returns offscreen links when offscreen_links expansion is requested from current viewport", () => {
    document.body.innerHTML = `
      <main>
        <a id="archive-link" href="/archive">历史记录</a>
      </main>
    `;
    const link = document.querySelector<HTMLElement>("#archive-link");
    if (link) setRect(link, { x: 1800, y: 40, width: 120, height: 32 });

    const page = observePage(document, {
      request: {
        reason: "Need offscreen archive link",
        query: "历史记录",
        scope: "current_viewport",
        expand: ["offscreen_links"],
        preferredRoles: ["link"]
      },
      candidateLimit: 5
    });

    expect(page.controls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "历史记录",
          role: "link",
          bounds: { x: 1800, y: 40, width: 120, height: 32 }
        })
      ])
    );
  });

  it("includes table row text in default control retrieval for row actions", () => {
    document.body.innerHTML = `
      <main>
        <table>
          <tbody>
            <tr id="row-a">
              <td>张三</td>
              <td>13800000000</td>
              <td><button id="detail-a">详情</button></td>
            </tr>
            <tr id="row-b">
              <td>李四</td>
              <td>13900000000</td>
              <td><button id="detail-b">详情</button></td>
            </tr>
          </tbody>
        </table>
        <button id="outside-detail">详情</button>
      </main>
    `;
    document.querySelectorAll("*").forEach((element, index) => setRect(element, { y: index * 36 }));

    const page = observePage(document, {
      request: {
        reason: "Need first matching customer row action",
        query: "张三 详情",
        scope: "full_page",
        preferredRoles: ["button"]
      },
      candidateLimit: 1
    });

    expect(page.controls).toHaveLength(1);
    expect(page.controls[0]).toMatchObject({
      label: "详情",
      locatorHints: expect.arrayContaining([expect.objectContaining({ kind: "css", value: '[id="detail-a"]' })])
    });
  });

  it("includes table row ordinal text for first-row action requests", () => {
    document.body.innerHTML = `
      <main>
        <table>
          <thead>
            <tr><th>客户</th><th>电话</th><th>操作</th></tr>
          </thead>
          <tbody>
            <tr id="row-a">
              <td>张三</td>
              <td>13800000000</td>
              <td><button id="detail-a">详情</button></td>
            </tr>
            <tr id="row-b">
              <td>李四</td>
              <td>13900000000</td>
              <td><button id="detail-b">详情</button></td>
            </tr>
          </tbody>
        </table>
        <button id="outside-detail">详情</button>
      </main>
    `;
    document.querySelectorAll("*").forEach((element, index) => setRect(element, { y: index * 36 }));

    const page = observePage(document, {
      request: {
        reason: "Need first row detail action",
        query: "第一条 详情",
        scope: "full_page",
        preferredRoles: ["button"]
      },
      candidateLimit: 1
    });

    expect(page.controls).toHaveLength(1);
    expect(page.controls[0].locatorHints).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "css", value: '[id="detail-a"]' })]));
  });

  it("includes generic list item ordinal text for card-style first item actions", () => {
    document.body.innerHTML = `
      <main>
        <section class="customer-list">
          <article class="record-card">
            <h3>张三</h3>
            <button id="detail-a">详情</button>
          </article>
          <article class="record-card">
            <h3>李四</h3>
            <button id="detail-b">详情</button>
          </article>
        </section>
        <button id="outside-detail">详情</button>
      </main>
    `;
    document.querySelectorAll("*").forEach((element, index) => setRect(element, { y: index * 36 }));

    const page = observePage(document, {
      request: {
        reason: "Need first card detail action",
        query: "第一条 详情",
        scope: "full_page",
        preferredRoles: ["button"]
      },
      candidateLimit: 1
    });

    expect(page.controls).toHaveLength(1);
    expect(page.controls[0].locatorHints).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "css", value: '[id="detail-a"]' })]));
  });

  it("keeps unlabeled row action buttons discoverable through action hints", () => {
    document.body.innerHTML = `
      <main>
        <section class="customer-list">
          <article class="record-card">
            <h3>张三</h3>
            <button id="detail-a" class="icon-detail"></button>
          </article>
          <article class="record-card">
            <h3>李四</h3>
            <button id="detail-b" class="icon-detail"></button>
          </article>
        </section>
        <button id="outside-detail" class="icon-detail"></button>
      </main>
    `;
    document.querySelectorAll("*").forEach((element, index) => setRect(element, { y: index * 36 }));

    const page = observePage(document, {
      request: {
        reason: "Need first item detail icon action",
        query: "第一条 详情",
        scope: "full_page",
        preferredRoles: ["button"]
      },
      candidateLimit: 1
    });

    expect(page.controls).toHaveLength(1);
    expect(page.controls[0]).toMatchObject({
      label: "",
      role: "button",
      locatorHints: expect.arrayContaining([expect.objectContaining({ kind: "css", value: '[id="detail-a"]' })])
    });
  });

  it("uses child icon classes to disambiguate unlabeled row actions", () => {
    document.body.innerHTML = `
      <main>
        <section class="customer-list">
          <article class="record-card">
            <h3>张三</h3>
            <button id="action-a-edit"><i class="el-icon-edit"></i></button>
            <button id="action-a-view"><i class="el-icon-view"></i></button>
          </article>
          <article class="record-card">
            <h3>李四</h3>
            <button id="action-b-edit"><i class="el-icon-edit"></i></button>
            <button id="action-b-view"><i class="el-icon-view"></i></button>
          </article>
        </section>
      </main>
    `;
    document.querySelectorAll("*").forEach((element, index) => setRect(element, { y: index * 36 }));

    const page = observePage(document, {
      request: {
        reason: "Need first item detail icon action",
        query: "第一条 详情",
        scope: "full_page",
        preferredRoles: ["button"]
      },
      candidateLimit: 1
    });

    expect(page.controls).toHaveLength(1);
    expect(page.controls[0].locatorHints).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "css", value: '[id="action-a-view"]' })]));
  });
});
