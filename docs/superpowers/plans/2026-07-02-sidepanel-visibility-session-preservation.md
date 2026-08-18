# Sidepanel Visibility Session Preservation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the current sidepanel conversation when the user switches away from Chrome and returns, while keeping a fresh blank conversation for a newly opened sidepanel document.

**Architecture:** Keep session lifecycle decisions in sidepanel state helpers where they can be unit tested. The sidepanel entry point should create a blank session only on initial document load, and should refresh the current runtime session on visibility recovery.

**Tech Stack:** TypeScript, Chrome MV3 side panel, Vitest.

## Global Constraints

- Do not customize behavior for a specific website or task.
- Do not restore intentionally suppressed old sessions into a blank chat.
- Bump the package and manifest version after behavior changes.

---

### Task 1: Preserve Session On Visibility Recovery

**Files:**
- Modify: `src/sidepanel/state.ts`
- Modify: `src/sidepanel/main.ts`
- Test: `tests/unit/sidepanel/state.test.ts`

**Interfaces:**
- Consumes: `SidepanelState`, `isTaskInProgress`.
- Produces: `shouldRefreshSessionOnPanelVisible(state: SidepanelState): boolean`.

- [ ] **Step 1: Add a failing state test**

Add assertions that a visible sidepanel refreshes only when an active session or running task exists, and does not refresh an intentionally blank chat.

- [ ] **Step 2: Implement the state helper**

Add `shouldRefreshSessionOnPanelVisible` to `src/sidepanel/state.ts`, mirroring the safe refresh boundary used for returning to chat.

- [ ] **Step 3: Update sidepanel visibility handling**

In `src/sidepanel/main.ts`, replace `startBlankSessionForPanelOpen("sidepanel_reopened")` inside the `visibilitychange` visible branch with `refreshSession()` guarded by `shouldRefreshSessionOnPanelVisible(state)`.

- [ ] **Step 4: Bump version**

Update `package.json`, `package-lock.json`, `public/manifest.json`, and `naturalclick-extension/manifest.json` from `0.1.58` to `0.1.59`.

- [ ] **Step 5: Verify**

Run `npx vitest run tests/unit/sidepanel/state.test.ts` and `npm run test:all`; both must pass.
