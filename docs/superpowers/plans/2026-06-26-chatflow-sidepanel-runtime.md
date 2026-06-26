# Chatflow Sidepanel Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the selected B direction: a Chinese Chrome Side Panel runtime that shows a compact Chatflow path, active node, current action, evidence, trace, and a future-ready builder entry.

**Architecture:** Keep the first implementation native TypeScript and DOM/CSS. Add a sidepanel runtime projection layer that derives Chatflow node state from `SidepanelState` and `AgentEvent[]`, then render that projection without turning the side panel into a full canvas editor.

**Tech Stack:** Chrome Manifest V3, TypeScript, Vite, Vitest, jsdom, native DOM/CSS, no React.

## Global Constraints

- Pure Chrome MV3 extension; no backend Agent service, native messaging host, or local daemon.
- The side panel is the primary first-version user experience.
- Full flow editing belongs in an advanced builder surface; the side panel shows the current flow path, active node, and runtime evidence.
- Builder view and side panel view must read from the same Agent event model, not from two separate UI-only workflow abstractions.
- Overlay controls visualization only. Agent observation still runs when overlay is off.
- Default safety mode is `balanced`.
- User-facing side panel copy is Chinese.
- Stop remains reachable during any active task.
- Raw prompts and JSON are not shown by default.
- First version exposes the Chatflow Builder as an extensible product surface, but does not block on full drag-and-drop flow editing.

---

## Scope Check

This plan implements the Side Panel runtime surface only. It does not implement a full drag-and-drop Chatflow Builder, persisted editable workflows, or real node graph authoring. It does make the UI and state model ready for those later enhancements by using stable node identifiers and event-derived runtime projection.

## File Structure

Modify this structure:

```text
src/sidepanel/state.ts
  Runtime flow node types, event-to-timeline mapping, active-node derivation.

src/sidepanel/render.ts
  Chinese B-direction side panel UI: top status, flow map, current action,
  builder entry, timeline, inspector, settings drawer, controls.

src/sidepanel/main.ts
  Wire stop, overlay mode, highlight target, and richer event projection.

public/sidepanel.css
  Compact operational Chatflow styling for a Chrome Side Panel.

public/sidepanel.html
  Chinese language metadata and accessible label.

tests/unit/sidepanel/state.test.ts
  Unit tests for flow projection and event mapping.

tests/unit/sidepanel/render.test.ts
  Unit tests for Chinese runtime UI, compact flow map, builder entry, and actions.
```

---

### Task 1: Runtime Flow Projection

**Files:**
- Modify: `src/sidepanel/state.ts`
- Modify: `tests/unit/sidepanel/state.test.ts`

**Interfaces:**
- Produces: `FlowNodeId`, `RuntimeFlowNode`, `deriveRuntimeFlow(state)`, `mapEventToTimelineItem(event)`, `deriveActiveTaskFromEvents(events)`.
- Consumes: existing `SidepanelState`, `ActiveTaskState`, `TimelineItem`, and `AgentEvent`.

- [ ] **Step 1: Write failing state tests**

Add tests that assert:

```ts
expect(deriveRuntimeFlow({ ...base, activeTask: { taskId: "task-1", status: "running", activeNodeId: "plan" } })
  .find((node) => node.id === "plan")?.status).toBe("active");

expect(mapEventToTimelineItem(makeEvent("ObservationReceived", { summary: "发现 3 个候选按钮" })).title)
  .toBe("页面观察完成");

expect(deriveActiveTaskFromEvents([makeEvent("TaskStarted", { taskText: "打开设置" })])?.activeNodeId)
  .toBe("start");
```

- [ ] **Step 2: Run the state test to verify failure**

Run: `npm test -- tests/unit/sidepanel/state.test.ts`

Expected: FAIL because the runtime flow helpers do not exist.

- [ ] **Step 3: Implement flow projection**

Add stable flow nodes:

```ts
export type FlowNodeId = "start" | "intent" | "observe" | "route" | "plan" | "act" | "verify" | "reply";

export interface RuntimeFlowNode {
  id: FlowNodeId;
  label: string;
  shortLabel: string;
  description: string;
  status: "done" | "active" | "waiting" | "blocked";
}
```

Derive active node from task status and event type. Completed, failed, and stopped tasks resolve to `reply`; active unknown running tasks resolve to `plan`.

- [ ] **Step 4: Run the state test to verify pass**

Run: `npm test -- tests/unit/sidepanel/state.test.ts`

Expected: PASS.

---

### Task 2: Chinese Chatflow Runtime UI

**Files:**
- Modify: `src/sidepanel/render.ts`
- Modify: `tests/unit/sidepanel/render.test.ts`

**Interfaces:**
- Consumes: `deriveRuntimeFlow(state)` and expanded `ActiveTaskState`.
- Produces: Side panel DOM sections `.nc-flow-map`, `.nc-current-action`, `.nc-builder-entry`, `.nc-inspector`, `.nc-composer`.

- [ ] **Step 1: Write failing render tests**

Add tests that assert:

```ts
expect(root.textContent).toContain("当前对话流");
expect(root.textContent).toContain("计划动作");
expect(root.textContent).toContain("Chatflow 编排");
expect(root.textContent).toContain("高级配置");
expect(root.querySelector(".nc-flow-node--active")?.textContent).toContain("计划动作");
```

- [ ] **Step 2: Run the render test to verify failure**

Run: `npm test -- tests/unit/sidepanel/render.test.ts`

Expected: FAIL because these UI regions do not exist yet.

- [ ] **Step 3: Implement B-direction render structure**

Render these regions:

```text
Top Status Bar
Builder Entry
Compact Flow Map
Pinned Current Action
Conversation / Progress Timeline
Decision / Evidence / Trace Inspector
Bottom Composer
Settings Drawer
```

Use Chinese copy. Keep the full node canvas out of the side panel; describe it as an advanced builder surface.

- [ ] **Step 4: Run the render test to verify pass**

Run: `npm test -- tests/unit/sidepanel/render.test.ts`

Expected: PASS.

---

### Task 3: Runtime Controls And Chrome Messages

**Files:**
- Modify: `src/sidepanel/main.ts`
- Modify: `src/sidepanel/render.ts`

**Interfaces:**
- Produces handler props `onStopTask`, `onHighlightTarget`, `onOverlayModeChange`.
- Consumes existing runtime messages `STOP_TASK`, `HIGHLIGHT_TARGET`, and `SET_OVERLAY_MODE`.

- [ ] **Step 1: Add controls**

Add user-facing controls:

```text
Stop button in top bar when active.
Highlight target button in current action bar.
Overlay segmented buttons: Off, Focus, All Targets, Evidence, Vision.
```

- [ ] **Step 2: Wire Chrome messages**

In `main.ts`, send:

```ts
{ type: "STOP_TASK", reason: "user_requested" }
{ type: "HIGHLIGHT_TARGET", semanticId }
{ type: "SET_OVERLAY_MODE", mode }
```

When Chrome runtime is unavailable, keep the UI responsive and add a warning timeline card.

- [ ] **Step 3: Run sidepanel unit tests**

Run: `npm test -- tests/unit/sidepanel`

Expected: PASS.

---

### Task 4: CSS Polish And Verification

**Files:**
- Modify: `public/sidepanel.css`
- Modify: `public/sidepanel.html`

**Interfaces:**
- Consumes class names from Task 2.
- Produces compact, Chinese, operational Side Panel styling.

- [ ] **Step 1: Implement CSS**

Add styling for:

```text
compact topbar
builder entry card
vertical flow map
active/done/waiting/blocked flow states
current action bar
timeline cards
inspector panels
overlay segmented controls
settings drawer
focus-visible states
small-width layout
```

- [ ] **Step 2: Update HTML metadata**

Set `lang="zh-CN"`, Chinese title, and Chinese app label.

- [ ] **Step 3: Run full verification**

Run:

```bash
npm run typecheck
npm run test:unit
npm run build
```

Expected: all commands pass.

---

## Self-Review

- Spec coverage: B direction, side panel runtime, compact flow map, current action, evidence, trace, settings, overlay control, stop reachability, and builder extensibility are covered.
- Placeholder scan: no `TBD`, `TODO`, or unspecified implementation steps.
- Type consistency: `FlowNodeId`, `RuntimeFlowNode`, handler names, and CSS class names are defined before use.
