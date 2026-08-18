# Agent Execution Loop Detailed Design

Status: proposed for first usable runtime.

Date: 2026-06-26

Companion documents:

- `docs/superpowers/specs/2026-06-26-agent-core-architecture-design.md`
- `docs/superpowers/specs/2026-06-26-sidepanel-experience-design.md`

## 1. Purpose

This document specifies the first usable NaturalClick Agent runtime.

The current implementation has important building blocks: side panel, settings,
event model, page observation, command binding, primitive execution, and a
minimal `AgentRuntime`. That is not enough. A browser Agent becomes usable only
when it can keep moving through a task, ask for more page information when the
first observation is insufficient, stream progress to the side panel, pause for
policy or user input, and stop with a clear reason when the task cannot continue.

The first usable runtime must support this path:

```text
User task
  -> start task loop
  -> run one or more Agent steps
  -> each step may run one or more observation rounds
  -> plan exactly one semantic command
  -> bind, authorize, execute, re-observe, verify
  -> continue, complete, ask, confirm, fail, or stop
```

The runtime should handle simple real tasks such as:

- Open Baidu and search for Nanjing weather.
- Open a website, locate a named entry, click it, and verify navigation.
- Fill a simple form and stop before risky submit unless policy allows it.
- Read visible search results and produce a concise answer.
- Recover from sparse DOM observation by expanding candidates or calling vision.

## 2. Non-goals

This design does not attempt to solve:

- CAPTCHA solving, anti-bot evasion, or hidden scraping.
- Payment, transfer, destructive account deletion, or credential automation.
- Full Dify-like drag-and-drop flow editing in the Chrome side panel.
- Long-term memory across unrelated browsing sessions.
- Guaranteed success on every complex website.
- Unlimited autonomous execution without task, time, model, and risk budgets.

## 3. Runtime Principles

The runtime follows these rules.

```text
Agent Core decides from evidence.
Chrome adapters execute against browser reality.
The event log explains every meaningful transition.
The side panel observes runtime state; it does not become the kernel.
```

Important consequences:

- The model plans semantic commands, not DOM indexes or raw coordinates.
- Every Agent step executes at most one semantic command.
- Observation can be multi-round inside a step.
- The model can request more observation, but the runtime controls budgets.
- Policy can pause execution before a command.
- User confirmation resumes the same pending command instead of restarting the task.
- Stop, failure, and completion must be represented by persisted events.
- Side panel updates should be pushed by a runtime event bus, with polling as fallback.

## 4. Core Runtime Objects

### Task Loop

The task loop owns the whole browser task.

```ts
interface TaskLoop {
  sessionId: string;
  taskId: string;
  status: RuntimeStatus;
  budget: ExecutionBudget;
  observationBudget: ObservationBudget;
  currentStepIndex: number;
  failedStepCount: number;
  sameCommandRetryCount: number;
  startedAt: number;
}
```

### Agent Step

One Agent step decides and executes at most one semantic command.

```ts
interface AgentStep {
  stepId: string;
  stepIndex: number;
  status: AgentStepStatus;
  observationRounds: ObservationRound[];
  plannerDecision?: PlannerDecision;
  semanticCommand?: SemanticCommand;
  boundCommand?: BoundCommand;
  primitiveResult?: PrimitiveResult;
  verification?: VerificationResult;
}
```

### Observation Round

Observation is not a single call. It is a progressive information gathering
process.

```ts
interface ObservationRound {
  roundId: string;
  stepId: string;
  roundIndex: number;
  request: ObservationRequest;
  pageContext: PlannerPageContext;
  candidateCount: number;
  estimatedTokens: number;
  reason: string;
}
```

### Runtime Status

```ts
type RuntimeStatus =
  | "idle"
  | "running"
  | "awaiting_confirmation"
  | "awaiting_user_input"
  | "completed"
  | "failed"
  | "stopped";
```

The state reducer derives this status from events. Background memory can cache
it, but persisted events remain the source of truth.

## 5. Task Loop

The task loop starts from `START_TASK` and continues until a stop condition is
reached.

```text
startTask(taskText)
  create sessionId and taskId
  append TaskStarted
  append TaskInterpreted
  while runtime can continue:
    runAgentStep()
    reduce state from events
    if completed, failed, stopped, awaiting user, or awaiting confirmation:
      break
  return latest session state
```

The loop is not a fixed number of steps. It is adaptive with hard limits.

### Default Execution Budget

```ts
const standardExecutionBudget = {
  maxStepsPerTask: 8,
  maxTaskDurationMs: 120000,
  maxModelCallsPerTask: 12,
  maxConsecutiveFailures: 2,
  maxSameCommandRetries: 1
};
```

### Continue Conditions

The runtime may continue to the next step when:

- The current action succeeded but the task goal is not complete.
- The page navigated and needs a fresh observation.
- A form field was filled and more fields remain.
- A search result page loaded and the task still needs reading or summarizing.
- Verification returned `partial`.
- The first binding failed but recovery or observation expansion is still within
  budget.

### Stop Conditions

The runtime must stop when:

- Planner emits `FinishTask`.
- Verifier proves the task goal is complete.
- Planner emits `AskUser`.
- Policy emits `ask_user`.
- The user clicks stop.
- Step, time, model call, or observation budget is exhausted.
- Consecutive failures exceed the configured threshold.
- The same command repeats without progress beyond retry budget.
- The model output violates the contract and repair fails.
- Chrome permissions, tab lifecycle, or page isolation prevent continuation.

## 6. Agent Step

Each step follows the same structure:

```text
1. Load reduced task state.
2. Run Progressive Observation Loop.
3. Ask Planner for either:
   - next semantic command
   - NeedMoreObservation
   - AskUser
   - FinishTask
4. Bind semantic command.
5. Evaluate policy.
6. Execute primitive.
7. Re-observe relevant page state.
8. Verify result.
9. Write events and return step result.
```

Planner must output one of these high-level decisions:

```ts
type PlannerTurn =
  | { type: "Command"; decision: PlannerDecision }
  | { type: "NeedMoreObservation"; request: NeedMoreObservationRequest }
  | { type: "AskUser"; question: string; options?: string[]; reason: string }
  | { type: "FinishTask"; summary: string; evidenceRefs: string[] };
```

`NeedMoreObservation` is valid only inside the observation loop. After a command
is executed, the next model call belongs to a new Agent step.

## 7. Progressive Observation Loop

The observation loop is the main design addition in this document.

The first observation often does not contain enough nodes for a reliable model
decision. The runtime should not force the model to guess. Instead, the model
can ask for more relevant page information. Each new round should expand or
change the observation, not repeat the same slice.

### Default Observation Budget

The first version intentionally starts with a wider budget. Real execution logs
will be used to tighten these values later.

```ts
const progressiveObservationDefaults = {
  maxObservationRoundsPerStep: 6,
  initialCandidateLimit: 120,
  expandedCandidateLimit: 320,
  hardCandidateLimit: 600,
  maxObservationTokensPerStep: 36000,
  allowVisionOnFinalRound: true
};

const taskObservationDefaults = {
  maxObservationRoundsPerTask: 24,
  maxObservationExpansionRetries: 4
};
```

Observation rounds are counted separately from Agent steps. A task may use six
observation rounds inside one step, but it still executed only one step if no
browser action occurred.

### Round Strategy

Round 1 gives a broad but compressed overview:

- Page identity.
- Current viewport.
- Main headings.
- Navigation regions.
- Visible forms.
- Visible and high-scoring controls.
- Top task-relevant text blocks.
- Up to `initialCandidateLimit` candidates.

Round 2 expands by query and region:

- Full-page candidate search for query terms.
- Sidebar, top navigation, dialogs, forms, and active region candidates.
- Similar labels and synonyms.
- Offscreen but semantically relevant controls.
- Up to `expandedCandidateLimit` candidates.

Round 3 and later can use heavier expansion:

- Larger candidate set.
- More nearby text around candidate nodes.
- More form and table context.
- Scrollable container probes.
- Previously hidden or collapsed menu candidates.
- Region-level DOM fragments.
- Up to `hardCandidateLimit` candidates.

The final round may call vision when DOM evidence is still insufficient.

### Need More Observation Contract

Planner asks for more information with a structured request:

```ts
interface NeedMoreObservationRequest {
  reason: string;
  query?: string;
  scope:
    | "current_viewport"
    | "full_page"
    | "navigation"
    | "sidebar"
    | "main_content"
    | "form"
    | "dialog"
    | "scroll_container"
    | "visual";
  expand?: Array<
    | "more_candidates"
    | "nearby_text"
    | "hidden_menus"
    | "offscreen_links"
    | "form_fields"
    | "tables"
    | "validation_feedback"
    | "visual_labels"
  >;
  preferredRoles?: Array<
    | "button"
    | "link"
    | "textbox"
    | "searchbox"
    | "combobox"
    | "menuitem"
    | "tab"
    | "checkbox"
    | "radio"
  >;
  targetTextHints?: string[];
}
```

Example:

```json
{
  "type": "NeedMoreObservation",
  "reason": "Current candidates do not include a weather result or search box.",
  "query": "南京 天气 搜索",
  "scope": "full_page",
  "expand": ["more_candidates", "nearby_text", "offscreen_links"],
  "preferredRoles": ["searchbox", "textbox", "button", "link"],
  "targetTextHints": ["南京天气", "搜索", "百度一下"]
}
```

### Page Node Index

The content script should collect more nodes than the model receives. The
background keeps or reconstructs a `PageNodeIndex` for filtering.

```ts
interface PageNodeIndex {
  pageIdentity: PageIdentity;
  capturedAt: number;
  controls: ControlCandidate[];
  textBlocks: TextBlock[];
  forms: FormCandidate[];
  regions: RegionCandidate[];
  feedback: string[];
}
```

The Planner receives only a compressed `PlannerPageContext`.

```ts
interface PlannerPageContext {
  pageIdentity: PageIdentity;
  viewportSummary: string;
  outline: string[];
  candidates: ControlCandidateSummary[];
  textEvidence: TextBlockSummary[];
  formSummaries: FormSummary[];
  feedback: string[];
  omitted: {
    controls: number;
    textBlocks: number;
    forms: number;
    reason: string;
  };
}
```

This keeps the full DOM out of the model context while still allowing later
rounds to reveal more nodes.

## 8. Context Compression

The runtime must never send raw full DOM to the model.

```text
Raw DOM / page data
  -> PageModel
  -> PageNodeIndex
  -> candidate scoring
  -> PlannerPageContext
```

Candidate scoring considers:

- Text similarity to task and active subgoal.
- Role match.
- Visibility.
- Viewport presence.
- Region importance.
- Form membership.
- Recent failure or retry relevance.
- Page marker number when overlay is on.
- DOM and visual confidence.

Default priority when trimming:

1. Active subgoal matches.
2. Current viewport visible controls.
3. Form fields and submit controls.
4. Navigation and sidebar items.
5. Dialog and overlay controls.
6. Candidates related to recent failures.
7. Relevant text blocks and headings.
8. Hidden, duplicate, disabled, or low-confidence nodes.

If the model asks for more information, the next round expands from the omitted
pool and records why those nodes were added.

## 9. Vision Position

Vision is part of the observation loop, but it is not the primary path.

Use vision when:

- DOM candidates are missing or ambiguous after expansion.
- The target is icon-only or visually labeled.
- The page uses canvas, SVG-heavy controls, or custom rendering.
- Verification is visually obvious but DOM deltas are weak.
- The final observation round still cannot decide.

Do not use vision:

- On every step by default.
- To bypass policy.
- To plan browser actions directly.
- To solve CAPTCHA or anti-bot challenges.

Vision output becomes visual evidence and candidate hints. The Binder still
produces the final `BoundCommand`.

## 10. Model Streaming

NaturalClick needs two kinds of streaming.

### Runtime Event Stream

Runtime events are the main user-facing stream. The side panel should see these
as soon as possible:

```text
ObservationRequested
ObservationReceived
ModelCallStarted
ModelCallProgress
PlanProduced
CommandBound
PolicyEvaluated
CommandIssued
CommandResultReceived
VerificationProduced
TaskCompleted / TaskFailed / TaskStopped
```

The first implementation should use `chrome.runtime.connect`:

```text
sidepanel opens RuntimeEventPort
background stores connected ports
event store appends AgentEvent
event bus broadcasts AgentEvent to all ports for that session
sidepanel applies event incrementally
```

Polling remains a fallback:

```text
if port disconnects:
  poll GET_SESSION_STATE every 1000ms while task is running
```

### Model Token Stream

OpenAI-compatible model calls should support SSE streaming.

Planner JSON streaming is consumed internally:

- Show `ModelCallStarted`.
- Emit throttled `ModelCallProgress` events with byte/token counters.
- Buffer chunks internally until JSON is complete.
- Validate the final JSON contract.
- Do not show half-written Planner JSON in normal UI.

User-facing reply streaming is visible:

- `AskUser` question text may stream into the conversation area.
- Final task summary may stream into the conversation area.
- Failure explanation may stream when it is generated for the user.

Default streaming settings:

```json
{
  "runtimeEvents": true,
  "assistantReplyTokens": true,
  "showPlannerRawStream": false
}
```

`showPlannerRawStream` is a developer option. It should not be enabled for
normal users because partial JSON is noisy and can contain implementation
details.

## 11. Policy Confirmation and Resume

Policy is not a repeated button-by-button annoyance. It is scoped authorization.

When policy returns `ask_user`, the runtime must persist:

```ts
interface PendingConsent {
  sessionId: string;
  taskId: string;
  stepId: string;
  command: SemanticCommand;
  boundCommand: BoundCommand;
  policyDecision: PolicyDecision;
  expiresAt: number;
}
```

Side panel displays a confirmation card with choices:

```text
Allow once
Allow for this task scope
Reject
Stop task
```

After user confirmation:

- Append `UserConsentResolved`.
- If allowed, execute the same pending bound command if still valid.
- If binding expired, re-observe and re-bind the same semantic command.
- If rejected, ask Planner for an alternative or stop with explanation.

Safety modes:

```text
Conservative -> ask before browser-changing actions.
Balanced -> allow low-risk actions; ask for navigation, submit, and medium risk.
Autonomous -> allow low and medium risk; ask for high risk.
Full auto -> same as autonomous for v1, with deeper execution budget allowed by settings.
```

Hard-blocked actions remain blocked in every mode.

## 12. Execution Control Settings

The side panel settings page should expose a compact "Execution Control" area.

```text
Execution Control

Execution intensity
[Light] [Standard] [Deep] [Custom]

Current budget
Max steps per task        8
Max task duration         120 seconds
Max model calls           12
Consecutive failure stop  2
Same action retry         1

Progressive observation
Max rounds per step       6
Initial candidates        120
Expanded candidates       320
Hard candidate limit      600
Observation token budget  36000

Vision fallback
[x] When target is not found
[x] When verification is inconclusive

Streaming
[x] Real-time runtime events
[x] Stream user-facing replies
[ ] Show raw Planner stream

When limit is reached
[Stop and summarize] [Ask to continue] [Auto-extend once]
```

Preset defaults:

```ts
const executionPresets = {
  light: {
    maxStepsPerTask: 4,
    maxTaskDurationMs: 60000,
    maxModelCallsPerTask: 6,
    maxConsecutiveFailures: 1,
    maxSameCommandRetries: 0
  },
  standard: {
    maxStepsPerTask: 8,
    maxTaskDurationMs: 120000,
    maxModelCallsPerTask: 12,
    maxConsecutiveFailures: 2,
    maxSameCommandRetries: 1
  },
  deep: {
    maxStepsPerTask: 16,
    maxTaskDurationMs: 300000,
    maxModelCallsPerTask: 24,
    maxConsecutiveFailures: 3,
    maxSameCommandRetries: 2
  }
};
```

Stored settings:

```json
{
  "executionPreset": "standard",
  "executionBudget": {
    "maxStepsPerTask": 8,
    "maxTaskDurationMs": 120000,
    "maxModelCallsPerTask": 12,
    "maxConsecutiveFailures": 2,
    "maxSameCommandRetries": 1
  },
  "observationBudget": {
    "maxObservationRoundsPerStep": 6,
    "maxObservationRoundsPerTask": 24,
    "initialCandidateLimit": 120,
    "expandedCandidateLimit": 320,
    "hardCandidateLimit": 600,
    "maxObservationTokensPerStep": 36000,
    "allowVisionOnFinalRound": true
  },
  "visionFallback": {
    "onTargetNotFound": true,
    "onVerificationInconclusive": true
  },
  "streaming": {
    "runtimeEvents": true,
    "assistantReplyTokens": true,
    "showPlannerRawStream": false
  },
  "limitReachedAction": "ask_to_continue"
}
```

Full auto does not mean infinite execution. It can select `deep` by default or
allow custom values, but the runtime still enforces hard limits.

## 13. Event and Log Requirements

Logs must be useful for debugging real failures.

Every task log should include:

- Extension version.
- Locale and UI mode.
- Model provider, planner model, vision model, and whether API key exists.
- Execution settings.
- Observation settings.
- Event stream.
- Raw event JSON with sensitive values redacted.
- Diagnostics.
- Model call timing.
- First token time when streaming is enabled.
- Planner contract failures.
- Observation round counts and candidate counts.
- Vision calls and reason.
- Stop reason.

Observation logs should look like:

```text
Step 2
  Observation round 1/6: 120 candidates, 8700 estimated tokens
  Observation round 2/6: 320 candidates, query="南京天气"
  Observation round 3/6: vision fallback, reason="DOM candidates ambiguous"
  Decision: ActivateTarget semanticId=...
```

This allows later tuning. If real logs show 600 candidates are rarely needed,
the default can be lowered. If logs show frequent `NeedMoreObservation` at 320
candidates, the default can be raised or candidate scoring should be improved.

## 14. Error Handling

Common failures should map to stable events.

```text
Model timeout
  -> ModelCallFailed
  -> RecoverySuggested or TaskFailed

Planner invalid JSON
  -> ModelContractViolation
  -> one repair attempt if budget allows
  -> TaskFailed if repair fails

Content script unavailable
  -> try chrome.scripting.executeScript
  -> if chrome:// or restricted page, use fallback PageModel
  -> Planner may navigate away or ask user

Target not found
  -> NeedMoreObservation if observation budget remains
  -> Vision fallback if enabled
  -> TaskFailed or AskUser if still unresolved

Policy asks user
  -> UserConsentRequested
  -> pause loop
  -> resume on UserConsentResolved

User stops
  -> TaskStopped
  -> loop checks cancellation before next async phase
```

The runtime must not hide a failed model call behind "no response". A failed
model call should be visible in timeline and exportable logs.

## 15. Implementation Shape

The implementation should add small modules instead of growing
`src/background/index.ts` indefinitely.

Proposed files:

```text
src/core/runtime/execution-controller.ts
  Owns task loop, step loop, stop checks, resume decisions.

src/core/runtime/execution-budget.ts
  Presets, budget validation, counters, limit decisions.

src/core/observation/progressive-observer.ts
  Runs observation rounds, applies NeedMoreObservation, tracks candidate budgets.

src/core/context/page-context-assembler.ts
  Builds PlannerPageContext from PageModel/PageNodeIndex.

src/core/model/streaming-client.ts
  OpenAI-compatible SSE parser and model call events.

src/adapters/chrome/runtime-event-bus.ts
  chrome.runtime.connect ports, broadcast, disconnect handling.

src/sidepanel/runtime-subscription.ts
  Side panel event subscription and polling fallback.
```

Background remains the Chrome entry point, but it should delegate to the
controller.

## 16. Acceptance Criteria

The first usable runtime is accepted when these cases pass in tests or manual
verification:

1. Starting a task emits events in real time and the side panel updates without
   waiting for the whole task to finish.
2. A navigation task runs more than one step and completes or summarizes.
3. A search task can navigate, observe results, and finish with a user-facing
   answer.
4. Planner can request `NeedMoreObservation` multiple times inside one step.
5. Observation rounds expand candidate count and log the reason for expansion.
6. The runtime stops at budget limits and asks whether to continue when
   `limitReachedAction` is `ask_to_continue`.
7. Policy confirmation pauses the loop and resumes the pending command after
   approval.
8. User stop cancels the task before the next async phase.
9. Model streaming writes `ModelCallStarted`, throttled `ModelCallProgress`,
   and `ModelCallCompleted` or `ModelCallFailed`.
10. Planner raw stream is hidden from normal UI by default.
11. Final user-facing reply can stream into the conversation area.
12. Vision is called only when configured trigger conditions are met.
13. Downloaded logs contain enough information to identify whether failure came
   from observation, model call, model contract, binding, policy, execution, or
   verification.

## 17. Test Strategy

Unit tests:

- Budget limit decisions.
- Execution loop continue and stop conditions.
- Progressive observation expansion.
- NeedMoreObservation contract validation.
- Candidate trimming and omitted counts.
- Policy confirmation resume.
- Streaming SSE parser.
- Event bus broadcast and disconnect handling.

Integration-style tests with fake ports:

- Search task: navigate -> observe -> read -> finish.
- Form task: fill field -> policy asks before submit.
- Sparse page: first observation insufficient -> second and third observation
  provide target -> command executes.
- Invalid model output -> contract violation -> failure event.
- User stop during model call -> task stops before command execution.

Manual Chrome checks:

- Start from `chrome://extensions`; observe fallback and navigate to a normal
  page.
- Run with Chinese and English side panel language.
- Switch execution preset and confirm stored settings affect runtime budget.
- Export log after success and failure.

## 18. First Implementation Order

Build in this order:

1. Execution budget types and presets.
2. Runtime event bus with side panel subscription.
3. Execution controller that runs multiple steps with fake ports in tests.
4. Progressive observation loop with fake PageModel data.
5. Planner contract extension for `NeedMoreObservation`, `AskUser`, and
   `FinishTask`.
6. OpenAI-compatible streaming client.
7. Policy confirmation resume path.
8. Side panel execution control settings.
9. Vision fallback wiring inside observation and verification.
10. Log enrichment and acceptance tests.

This order makes the plugin usable before the advanced vision path is complete,
while still keeping vision in the first-version design.

