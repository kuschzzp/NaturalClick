# Readable Chat Fast Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Convert noisy runtime events into a human-readable conversation digest and reduce model-first behavior for simple browser operations.

**Architecture:** Keep the existing event-driven runtime. Add pure sidepanel selectors for readable digest data, render the digest above the debug trace, and adjust fast-path gating so deterministic actions are available after prior non-identical actions. Keep planner native tools on a bounded budget.

**Tech Stack:** TypeScript, Chrome MV3 side panel, existing NaturalClick runtime events, Vitest, existing CSS tokens.

## Global Constraints

- Do not add CRM-specific behavior.
- Do not remove raw log export or debug trace access.
- Do not introduce a new UI library.
- Do not use visible page markers for sensing or execution.
- Bump `package.json` and `public/manifest.json` when code changes land.

---

### Task 1: Human-Readable Run Digest

**Files:**
- Modify: `src/sidepanel/state.ts`
- Modify: `src/sidepanel/render.ts`
- Modify: `src/sidepanel/i18n.ts`
- Modify: `public/sidepanel.css`
- Test: `tests/unit/sidepanel/state.test.ts`
- Test: `tests/unit/sidepanel/render.test.ts`

**Interfaces:**
- Produces: `buildRunDigest(events: AgentEvent[], timeline: TimelineItem[], locale?: SidepanelLocale): RunDigest`
- Consumes: existing `TimelineItem`, `AgentEvent`, and `SidepanelState.timeline`

- [x] Add `RunDigest` types in `src/sidepanel/state.ts`.
- [x] Write tests that feed a log-like event mix with many model/evidence events and expect compact counts.
- [x] Implement `buildRunDigest`.
- [x] Render a digest summary above the trace in `renderRunReport`.
- [x] Keep `renderRunTrace` collapsed and complete for debugging.
- [x] Add i18n strings and CSS classes for the digest.

### Task 2: Fast Path After Prior Actions

**Files:**
- Modify: `src/core/runtime/fast-paths.ts`
- Test: `tests/unit/core/agent-speed-paths.test.ts`

**Interfaces:**
- Consumes: `actionMemory` from `AgentRuntime`
- Produces: fast-path decisions when the matched command is not a repeat of a prior successful command.

- [x] Replace the blanket `actionMemory.length > 0` fast-path block with a repeated-action check.
- [x] Compare candidate fast command keys against recent successful action keys.
- [x] Add tests showing prior unrelated action memory does not block a later exact visible button click.
- [x] Add tests showing the same exact action is still not repeated indefinitely.

### Task 3: Planner Native Tool Budget

**Files:**
- Modify: `src/core/runtime/planner-native-tools.ts`
- Test: `tests/unit/core/planner-native-tools.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_MAX_PLANNER_NATIVE_TOOL_ROUNDS`
- Produces: stricter browser-operation native tool turn limit.

- [x] Set a small default native-tool round budget for planner calls.
- [x] Cap default planner native-tool rounds after the first read/tool turn.
- [x] Ensure aborted model requests still emit failed/stopped events.
- [x] Add or adjust a test for bounded model/tool loop behavior.

### Task 4: Version And Verification

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `public/manifest.json`
- Modify generated extension outputs only if the existing build flow updates them.

- [x] Bump version from `0.1.190` to the next patch version.
- [x] Run focused unit tests for sidepanel state/render and runtime fast paths.
- [x] Run the UI primitive anti-pattern scan on changed UI files.
- [x] Run the project test command if time and environment permit.
