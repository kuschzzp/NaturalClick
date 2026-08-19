# Multi-Turn Conversation And Retry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve every turn in the current conversation, provide bounded prior-turn context to the planner, and replace only the failed current turn when retrying.

**Architecture:** Keep task event logs isolated by `sessionId:taskId`, add session-level log enumeration, and project those logs into ordered sidepanel turns. `START_TASK` creates a task inside the active session, `NEW_SESSION` alone changes the session, and `RETRY_TASK` clears/reuses one failed task identity.

**Tech Stack:** TypeScript, Chrome MV3 messaging/storage, Vitest, DOM rendering, Vite.

## Global Constraints

- Preserve a stable `sessionId` until `NEW_SESSION`.
- Limit planner history to 8 completed turns and 1,200 characters per message.
- Preserve legacy single-turn stored records.
- Raise all package and extension versions to `0.1.197`.
- Do not commit or push without user permission.

---

### Task 1: Session Event Storage

**Files:**
- Modify: `src/adapters/chrome/chrome-storage-event-store.ts`
- Modify: `src/core/events/memory-event-store.ts`
- Test: `tests/unit/adapters/chrome-storage-event-store.test.ts`

**Interfaces:**
- Produces: `loadSession(sessionId: string): Promise<Array<{ taskId: string; events: AgentEvent[] }>>`
- Produces: `clear(sessionId: string, taskId: string): Promise<void>`

- [ ] Add failing tests that store two task logs under one session, assert chronological grouping, clear one task, and assert the sibling remains.
- [ ] Implement prefix-based session enumeration for Chrome storage and equivalent Map filtering for memory storage.
- [ ] Run `npx vitest run tests/unit/adapters/chrome-storage-event-store.test.ts`.

### Task 2: Multi-Turn Protocol And Runtime Context

**Files:**
- Modify: `src/shared/protocol.ts`
- Modify: `src/core/runtime/agent-runtime.ts`
- Modify: `src/background/index.ts`
- Test: `tests/unit/core/agent-runtime.test.ts`
- Test: `tests/unit/core/architecture-boundaries.test.ts`

**Interfaces:**
- Produces: `SessionTurnState = { taskId: string; events: AgentEvent[] }`
- Produces: `ConversationHistoryItem = { taskId: string; role: "user" | "assistant"; content: string }`
- Produces: `RetryTaskRequest` with identity and runtime settings.

- [ ] Add failing protocol tests for `RETRY_TASK` and session responses containing ordered turns.
- [ ] Add `conversationHistory` to `StartTaskContext` and `PlannerInput`, retain it on `AgentRuntime`, and pass it to each planner request.
- [ ] Change `START_TASK` to reuse the active session and create only a new task ID after a terminal turn.
- [ ] Build bounded history from the latest 8 completed task logs and pass user/assistant pairs into the new runtime.
- [ ] Implement `RETRY_TASK` validation, exact event-log clearing, same-ID controller reconstruction, and original attachment reuse.
- [ ] Run protocol and runtime focused tests.

### Task 3: Sidepanel Turn Projection And Persistence

**Files:**
- Modify: `src/sidepanel/state.ts`
- Modify: `src/sidepanel/main.ts`
- Test: `tests/unit/sidepanel/state.test.ts`

**Interfaces:**
- Produces: `ConversationTurnState` and `SessionTurnRecord`.
- Consumes: `SessionStateResponse.turns` and task-scoped runtime events.

- [ ] Add failing tests for projecting two tasks into one ordered conversation and wrapping legacy records as one turn.
- [ ] Derive one turn from each task event group and keep top-level active fields synchronized to the latest turn.
- [ ] Merge runtime events by `taskId` without replacing sibling turns.
- [ ] Persist one aggregate session record with title from the first turn and status from the latest turn.
- [ ] Implement immediate retry projection and send `RETRY_TASK` without appending a turn.
- [ ] Run sidepanel state focused tests.

### Task 4: Multi-Turn Rendering And Retry Action

**Files:**
- Modify: `src/sidepanel/render.ts`
- Modify: `src/sidepanel/i18n.ts`
- Modify: `public/sidepanel.css`
- Test: `tests/unit/sidepanel/render.test.ts`

**Interfaces:**
- Consumes: `SidepanelState.conversationTurns`.
- Produces: `SidepanelHandlers.onRetryTask(taskId: string)`.

- [ ] Add failing render tests that show two user/assistant pairs and a Retry button only on the failed current turn.
- [ ] Render each turn with existing user-message and assistant-response primitives while limiting active controls to the latest turn.
- [ ] Add localized `Retry` / `重新执行` copy and a stable action row below the failed reply.
- [ ] Render every turn in history detail and keep the list as one row per session.
- [ ] Run the sidepanel render focused tests.

### Task 5: Release And Verification

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `public/manifest.json`
- Generated: `naturalclick-extension/*`

- [ ] Raise version sources to `0.1.197`.
- [ ] Run `npm run typecheck`.
- [ ] Run focused tests for event storage, runtime, protocol, state, and render.
- [ ] Run `npm run test:unit` because the protocol and session model affect shared behavior.
- [ ] Run `npm run build` and verify `naturalclick-extension/manifest.json` is `0.1.197`.
- [ ] Run `git diff --check` and the UI primitive anti-pattern scan.
