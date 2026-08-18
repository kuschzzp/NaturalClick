# Agent Execution Loop Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first usable NaturalClick runtime loop: multi-step execution, progressive observation, event streaming, model streaming hooks, policy pause/resume, and configurable budgets.

**Architecture:** Keep Agent Core framework-independent and move loop logic out of `src/background/index.ts`. Background remains the Chrome adapter; it wires Chrome ports, storage, model calls, and primitives into core controllers.

**Tech Stack:** TypeScript, Chrome MV3 APIs, Vite, Vitest, existing NaturalClick event and page model types.

## Global Constraints

- Do not depend on a local daemon, backend service, or native messaging host.
- Do not send raw full DOM to the model.
- Planner emits semantic commands only, not DOM indexes or raw coordinates.
- Every meaningful runtime transition writes an `AgentEvent`.
- Side panel receives runtime events in real time when possible, with polling fallback.
- Full auto never means infinite execution; hard budgets still apply.
- Vision is a fallback for insufficient DOM evidence, not a separate planning brain.
- Existing user changes in the working tree must not be reverted.

---

### Task 1: Runtime Budgets and Planner Contract

**Files:**
- Create: `src/core/runtime/execution-budget.ts`
- Modify: `src/core/model/contracts.ts`
- Test: `tests/unit/core/execution-budget.test.ts`
- Test: `tests/unit/core/model-contracts.test.ts`

**Interfaces:**
- Produces: `ExecutionBudget`, `ObservationBudget`, `RuntimeSettings`, `standardRuntimeSettings`, `resolveRuntimeSettings()`, `limitStatus()`.
- Produces: Planner validation support for `NeedMoreObservation`, `AskUser`, and `FinishTask`.

- [ ] **Step 1: Write failing budget tests**

```ts
import { describe, expect, it } from "vitest";
import { limitStatus, resolveRuntimeSettings } from "../../../src/core/runtime/execution-budget";

describe("execution budget", () => {
  it("uses standard defaults", () => {
    const settings = resolveRuntimeSettings();
    expect(settings.execution.maxStepsPerTask).toBe(8);
    expect(settings.observation.maxObservationRoundsPerStep).toBe(6);
    expect(settings.observation.hardCandidateLimit).toBe(600);
  });

  it("reports step budget exhaustion", () => {
    const settings = resolveRuntimeSettings({ executionBudget: { maxStepsPerTask: 2 } });
    expect(limitStatus({ stepCount: 2, modelCallCount: 0, consecutiveFailures: 0, sameCommandRetries: 0, startedAt: Date.now() }, settings)).toEqual({
      reached: true,
      reason: "max_steps"
    });
  });
});
```

- [ ] **Step 2: Run failing test**

Run: `npx vitest run tests/unit/core/execution-budget.test.ts`

Expected: fail because `execution-budget.ts` does not exist.

- [ ] **Step 3: Implement budget module**

Define preset defaults and validation in `src/core/runtime/execution-budget.ts`.

- [ ] **Step 4: Add Planner turn validation tests**

Validate normal commands, `NeedMoreObservation`, `AskUser`, and `FinishTask`.

- [ ] **Step 5: Implement Planner contract extensions**

Extend `src/core/model/contracts.ts` without breaking existing `PlannerDecision` callers.

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npx vitest run tests/unit/core/execution-budget.test.ts tests/unit/core/model-contracts.test.ts`

---

### Task 2: Runtime Event Bus

**Files:**
- Create: `src/adapters/chrome/runtime-event-bus.ts`
- Modify: `src/background/index.ts`
- Modify: `src/shared/protocol.ts`
- Test: `tests/unit/adapters/runtime-event-bus.test.ts`

**Interfaces:**
- Produces: `RuntimeEventBus`, `broadcastEvent(event)`, `handlePort(port)`.
- Consumes: existing `AgentEvent`.
- Protocol adds port messages: `RUNTIME_EVENT`, `SESSION_SYNC`.

- [ ] **Step 1: Write event bus tests**

Use fake Chrome ports with `postMessage`, `onDisconnect`, and session filtering.

- [ ] **Step 2: Implement event bus**

Track connected ports by session id. Broadcast appended events to matching ports and to unscoped ports.

- [ ] **Step 3: Wire background**

`appendEvent()` and background event helpers should append to storage and broadcast.

- [ ] **Step 4: Verify**

Run: `npx vitest run tests/unit/adapters/runtime-event-bus.test.ts`

---

### Task 3: Progressive Observation Core

**Files:**
- Create: `src/core/observation/progressive-observer.ts`
- Create: `src/core/context/page-context-assembler.ts`
- Modify: `src/core/runtime/agent-runtime.ts`
- Test: `tests/unit/core/progressive-observer.test.ts`

**Interfaces:**
- Produces: `ProgressiveObserver`, `ObservationRound`, `PlannerPageContext`, `NeedMoreObservationRequest`.
- Consumes: `PageModel`, `ObservationBudget`.

- [ ] **Step 1: Write tests for candidate expansion**

Round 1 returns 120 candidates, round 2 returns 320, later rounds cap at 600.

- [ ] **Step 2: Implement page context assembler**

Convert `PageModel` to trimmed `PlannerPageContext`, with `omitted` counts.

- [ ] **Step 3: Implement progressive observer**

Run observe rounds and append observation metadata events through injected callback.

- [ ] **Step 4: Verify**

Run: `npx vitest run tests/unit/core/progressive-observer.test.ts`

---

### Task 4: Execution Controller

**Files:**
- Create: `src/core/runtime/execution-controller.ts`
- Modify: `src/core/runtime/agent-runtime.ts`
- Modify: `src/background/index.ts`
- Test: `tests/unit/core/execution-controller.test.ts`

**Interfaces:**
- Produces: `ExecutionController.startTask()`, `appendInstruction()`, `stopTask()`, `continueAfterConsent()`.
- Consumes: `AgentRuntime`, budgets, event store ports, planner/model ports.

- [ ] **Step 1: Write fake-port tests**

Cover a task that runs two steps and finishes, a task that pauses on policy, and a task stopped by user.

- [ ] **Step 2: Make `AgentRuntime.runNextStep()` return a result**

Return `continue`, `completed`, `awaiting_confirmation`, `awaiting_user_input`, or `failed`.

- [ ] **Step 3: Implement controller loop**

Loop until result, stop flag, or budget limit. Append `TaskCompleted`, `TaskFailed`, or `RuntimeSuspended` as needed.

- [ ] **Step 4: Wire background `START_TASK`**

Background creates one controller per active session and delegates task execution.

- [ ] **Step 5: Verify**

Run: `npx vitest run tests/unit/core/execution-controller.test.ts tests/unit/core/agent-runtime.test.ts`

---

### Task 5: Streaming Model Client

**Files:**
- Create: `src/core/model/streaming-client.ts`
- Modify: `src/background/index.ts`
- Test: `tests/unit/core/streaming-client.test.ts`

**Interfaces:**
- Produces: `readOpenAICompatibleStream()`, `callChatCompletion()`.
- Emits: `ModelCallStarted`, throttled `ModelCallProgress`, `ModelCallCompleted`, `ModelCallFailed`.

- [ ] **Step 1: Write SSE parser tests**

Cover data chunks, `[DONE]`, content deltas, and malformed JSON chunk tolerance.

- [ ] **Step 2: Implement streaming parser**

Parse OpenAI-compatible SSE from a `ReadableStream`.

- [ ] **Step 3: Replace background planner fetch**

Use streaming when supported. Keep non-stream fallback for providers that do not support streaming.

- [ ] **Step 4: Verify**

Run: `npx vitest run tests/unit/core/streaming-client.test.ts`

---

### Task 6: Side Panel Runtime Subscription and Settings

**Files:**
- Create: `src/sidepanel/runtime-subscription.ts`
- Modify: `src/sidepanel/main.ts`
- Modify: `src/sidepanel/render.ts`
- Modify: `src/sidepanel/state.ts`
- Modify: `src/sidepanel/i18n.ts`
- Test: `tests/unit/sidepanel/render.test.ts`
- Test: `tests/unit/sidepanel/state.test.ts`

**Interfaces:**
- Produces: runtime event subscription with polling fallback.
- Produces: execution control settings in side panel settings.

- [ ] **Step 1: Write render tests**

Ensure execution control settings render, including preset and observation values.

- [ ] **Step 2: Implement subscription**

Use `chrome.runtime.connect`, apply incoming `RUNTIME_EVENT`, and fall back to polling.

- [ ] **Step 3: Implement settings UI**

Add preset selection, budget inputs, streaming toggles, and limit action.

- [ ] **Step 4: Send runtime settings on task start**

Include execution budget, observation budget, streaming settings, and vision fallback in `START_TASK`.

- [ ] **Step 5: Verify**

Run: `npx vitest run tests/unit/sidepanel`

---

### Task 7: Full Verification

**Files:**
- Modify: `naturalclick-extension/*` through `npm run build`.

**Interfaces:**
- Produces: loadable `naturalclick-extension` folder.

- [ ] **Step 1: Run complete test suite**

Run: `npm run test:all`

Expected: typecheck, unit tests, and build pass.

- [ ] **Step 2: Manual Chrome smoke test**

Reload extension, open side panel, configure model, run `打开百度搜索南京的天气`.

- [ ] **Step 3: Inspect exported log**

Confirm task events include runtime loop, model call events, observation rounds, and final status.

