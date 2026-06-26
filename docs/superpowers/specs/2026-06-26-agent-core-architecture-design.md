# Agent Core Architecture Design

Status: proposed for the clean rewrite branch.

Date: 2026-06-26

Branch intent: this document starts a new architecture line for NaturalClick. The
new branch intentionally removes the previous extension implementation and old
design notes. The old codebase may explain what failed, but it is not the basis
for the new design.

## 1. Purpose

NaturalClick should be a Chrome browser operation Agent, not a pile of
site-specific workflows, debug-time names, and brittle DOM-index actions.

The new design starts with the Agent Core. Chrome extension code, side panel UI,
content scripts, model clients, storage, screenshots, and DOM operations are
runtime adapters around that core.

The first version must prove a general browser-operation loop:

1. Understand a user task.
2. Observe the current browser state.
3. Build task-relevant evidence.
4. Decide the next semantic command.
5. Bind the command to browser-executable primitives.
6. Apply safety policy.
7. Execute one action.
8. Re-observe and verify whether the task advanced.
9. Maintain session memory.
10. Produce clean user output and detailed developer trace.

The first version should also include one lightweight form scenario and a
first-stage visual recognition capability to prove that field filling,
task-scoped submit authorization, visual grounding, and evidence-driven
verification are not merely theoretical.

## 2. Non-goals

This design does not define:

- A migration path from the old source files.
- A rename-and-refactor plan for the old workflows.
- Site-specific rules, menu names, business terms, or debug-only vocabulary.
- A full UI design for the side panel.
- A backend Agent service, native messaging host, or local helper process.
- Long-term memory across unrelated browser sessions.
- CAPTCHA bypass, anti-bot evasion, unauthorized data extraction, payment
  automation, or other hard-blocked behaviors.

## 3. Chrome MV3 boundary

The first implementation target is a pure Chrome Manifest V3 extension:

- It may call a remote OpenAI-compatible LLM API.
- It must not depend on a local daemon, backend Agent runtime, or native
  messaging host.
- It must not assume the background service worker stays alive.
- It must not treat the side panel as the execution kernel.
- It must store recoverable task state outside volatile memory.
- It must respect extension permissions, page isolation, user gestures, and
  active tab access limits.

Relevant Chrome constraints, verified against official Chrome documentation on
2026-06-26:

- Extension service workers can be terminated after inactivity and should persist
  data instead of relying on global variables:
  <https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle>
- Content scripts run in isolated worlds and cannot freely share JavaScript
  state with the page:
  <https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts>
- `activeTab` grants temporary access after a user gesture and access can be
  revoked when the tab navigates or closes:
  <https://developer.chrome.com/docs/extensions/develop/concepts/activeTab>
- The Side Panel API is a browser UI surface for extension pages; it is useful
  as a companion UI but should not be the only runtime state holder:
  <https://developer.chrome.com/docs/extensions/reference/api/sidePanel>
- `chrome.tabs.captureVisibleTab()` can capture the visible area of the active
  tab when the extension has appropriate permission, but Chrome documents it as
  expensive and rate-limited:
  <https://developer.chrome.com/docs/extensions/reference/api/tabs#method-captureVisibleTab>

These constraints are not incidental implementation details. They shape the
Agent Core:

- Every meaningful runtime transition must be represented by an event.
- Runtime state must be recoverable from persisted events plus snapshots.
- DOM bindings are short-lived and must be revalidated after navigation,
  reloads, worker resumes, or content-script context loss.
- LLM calls, command execution, and user confirmations must survive suspension
  and resumption without inventing success or failure.

## 4. Architectural style

The core architecture is an event-driven hexagonal Agent Core.

```text
                    Sidepanel Adapter
                           |
Chrome Tabs Adapter -- Agent Core -- LLM Adapter
                           |
 DOM Observer Adapter -- Ports -- Storage Adapter
                           |
               Screenshot / Vision Adapter
```

The Agent Core owns domain concepts:

- `Task`
- `Goal`
- `Subgoal`
- `Observation`
- `PageModel`
- `FocusedObservation`
- `Evidence`
- `Decision`
- `SemanticCommand`
- `BoundCommand`
- `BrowserPrimitive`
- `Verification`
- `SessionMemory`
- `Policy`
- `TraceEvent`

The Agent Core must not directly call Chrome APIs, mutate DOM nodes, call
`chrome.storage`, write side panel UI text, or depend on a particular LLM SDK.
It expresses needs through ports, and adapters implement those ports.

Core ports:

```text
ObservePagePort
ExecutePrimitivePort
PlanWithModelPort
VerifyWithModelPort
AssembleModelContextPort
PersistEventPort
LoadEventsPort
PersistSnapshotPort
LoadSnapshotPort
ReadSessionMemoryPort
WriteSessionMemoryPort
AskUserPort
CaptureScreenshotPort
AnalyzeVisualContextPort
GroundVisualTargetPort
VerifyVisualStatePort
```

Chrome adapters:

- Background/service worker adapter: runtime entry point, Chrome API access,
  task wakeup, alarms if needed, model call orchestration, message routing.
- Content script adapter: DOM observation, page model extraction helpers,
  primitive DOM actions, page feedback collection.
- Side panel adapter: user input, task controls, progress display, safety
  prompts, settings, trace viewer.
- Storage adapter: event log, derived snapshots, session memory, redaction.
- LLM adapter: OpenAI-compatible requests, streaming, timeout handling,
  context assembly, contract validation, and model capability diagnostics.
- Screenshot/vision adapter: screenshot capture, first-stage visual recognition,
  visual target grounding, and visual verification. It enhances observation,
  binding, and verification, but does not become the main planning model.

Guiding rule:

```text
Agent Core owns thinking and state.
Capabilities own domain-specific extension points.
Adapters own Chrome reality.
The event log owns recovery and explanation.
```

## 5. Core modules

The Agent Core is not a giant planner file. It is a set of small modules with
clear dependency direction.

```text
AgentRuntime
  -> TaskInterpreter
  -> StateReducer
  -> ObservationManager
  -> EvidenceManager
  -> PlannerRole
  -> CommandBinder
  -> PolicyEngine
  -> VerifierRole
  -> MemoryManager
  -> SummarizerRole
```

### AgentRuntime

The orchestration loop. It restores state, requests observation, invokes
planning, binds commands, applies policy, executes one primitive action,
re-observes, verifies, writes events, and decides whether to continue.

It must not contain site-specific workflow rules.

### TaskInterpreter

Converts a user task into an initial `TaskFrame`:

- User intent.
- Known inputs.
- Prohibited actions.
- Implied consent scope.
- Initial risk hints.
- Candidate scenario profile.

It may identify that a task resembles browsing, form filling, or research, but
it must not turn those categories into hard-coded workflows.

### StateReducer

Derives `TaskRuntimeState` from the event log and the latest snapshot. Other
modules read reducer output instead of relying on global mutable runtime state.

### ObservationManager

Chooses what to observe next based on the active subgoal and recent failures.
It does not read DOM directly. It calls `ObservePagePort`.

### EvidenceManager

Turns observations, model decisions, execution results, user input, and
verification output into traceable `Evidence`.

### PlannerRole

Produces a short-term plan and exactly one next semantic command.

### CommandBinder

Maps a semantic command to current page candidates, target references, locators,
and executable browser primitives.

### PolicyEngine

Classifies risk and decides whether a command is allowed, should ask the user,
should be blocked, or must be hard-blocked.

### VerifierRole

Checks whether the semantic command advanced the task according to expected
outcomes and success criteria.

### MemoryManager

Maintains session-level memory. It only stores facts supported by user input,
observation evidence, or verification results.

### SummarizerRole

Produces clean user-facing progress and final summaries from events and
evidence. It does not participate in action decisions.

## 6. Runtime loop

Each Agent step executes at most one semantic command.

```text
1. Load state
   Restore TaskRuntimeState from latest snapshot plus following events.

2. Observe
   Generate an observation request appropriate for the active subgoal. Start
   with DOM/PageModel observation; request visual observation only when the
   current task, page, or failure state needs it.

3. Update evidence
   Extract task-relevant evidence from the observation.

4. Plan
   Ask PlannerRole for task understanding, short plan, next command, expected
   outcome, success criteria, risk hint, and assumptions.

5. Bind
   Map the semantic command to current page targets and browser primitives.
   Use DOM/PageModel binding first; call visual grounding when binding is
   missing, ambiguous, obstructed, or low confidence.

6. Check policy
   Decide allow, ask_user, block, or hard_block.

7. Execute
   Execute one primitive through an adapter.

8. Re-observe
   Observe the relevant region or page after the action.

9. Verify
   Decide success, partial success, failure, or inconclusive. Use deterministic
   DOM verification first; call visual verification when the expected result is
   primarily visual or DOM evidence is inconclusive.

10. Reduce and continue
    Persist events, derive state, continue or summarize.
```

Important constraints:

- Short plans guide the next few steps but are not batch-executed.
- Every command must declare an expected outcome.
- Verification failure is new information, not a reason to blindly retry.
- DOM indexes, coordinates, and tab IDs are adapter-level bindings, not the
  primary language of planning.
- Capabilities can contribute observation, binding, verification, recovery, and
  prompt hints, but cannot take over the runtime loop.
- Scenario profiles can adjust preferences, not hard-code business flows.

## 7. Event log and snapshots

The event log is the source of truth for task state, recovery, debugging, and
explanation.

```text
AgentEvent
  id
  sessionId
  taskId
  stepId
  type
  timestamp
  payload
  visibility
  correlationId
```

Stable event types:

```text
TaskStarted
TaskInterpreted
ObservationRequested
ObservationReceived
EvidenceAdded
PlanRequested
PlanProduced
CommandBound
PolicyEvaluated
UserConsentRequested
UserConsentResolved
CommandIssued
CommandResultReceived
VerificationProduced
MemoryUpdated
RecoverySuggested
TaskCompleted
TaskFailed
TaskStopped
ModelCallStarted
ModelCallProgress
ModelCallCompleted
ModelCallFailed
RuntimeSuspended
RuntimeResumed
ModelContractViolation
ScreenshotCaptured
VisionRequested
VisionCompleted
VisualEvidenceAdded
```

Event visibility:

- `user`: clean progress or final output.
- `debug`: explainable decision, binding, policy, and verification details.
- `internal`: raw model summaries, raw observation summaries, adapter errors,
  stack traces, and redacted sensitive data references.

Snapshots are derived state, not facts:

```text
TaskSnapshot
  sessionId
  taskId
  lastEventId
  runtimeStatus
  activeGoal
  activeSubgoal
  shortPlan
  pageContext
  knownEvidenceRefs
  memoryRefs
  failedAttempts
  riskState
  tabBindings
  pendingConsent
```

Recovery algorithm:

```text
load latest snapshot
load events after snapshot.lastEventId
StateReducer.apply(snapshot, events)
return TaskRuntimeState
```

MV3 recovery rules:

- Persist after each meaningful runtime transition.
- Write `ModelCallStarted` before calling the model.
- Write throttled `ModelCallProgress` for long streaming responses.
- Write `ModelCallCompleted` or `ModelCallFailed` before using the result.
- Write `CommandIssued` before execution and `CommandResultReceived` after.
- On resume, unresolved model calls or commands must be reconciled before
  continuing.
- If the tab closed, navigated, or content-script context disappeared, mark the
  prior binding expired and re-observe.
- Never treat an unresolved action as success just because the worker resumed.

## 8. Observation and evidence

Observation is layered:

```text
RawObservation
  -> PageModel
    -> FocusedObservation
      -> EvidenceStore
```

### RawObservation

Raw material collected by content scripts and screenshot adapters:

- Visible text.
- Interactive DOM nodes.
- Roles, ARIA, labels, placeholders, names, types.
- Element bounds, visibility, disabled state.
- Form values and validation messages.
- Toasts, alerts, aria-live regions, and field errors.
- URL, title, navigation timing.
- Screenshot metadata and visual candidates.
- Scroll state and region boundaries.

Raw observation is not the normal Planner input.

### PageModel

Framework-independent semantic structure:

```text
PageModel
  pageIdentity
  regions
  navigation
  forms
  controls
  links
  buttons
  lists
  tables
  dialogs
  feedback
  readableContent
  visualHints
```

Control candidates:

```text
ControlCandidate
  semanticId
  role
  label
  accessibleName
  valueState
  required
  validation
  regionRef
  visibility
  interactionHints
  locatorHints
  confidence
```

`semanticId` should be derived from relatively stable semantics such as label,
role, region, accessible name, stable attributes, and nearby text. DOM index can
be a locator hint but must not be the identity.

### FocusedObservation

A task-specific slice:

- Navigation subgoal: page identity, navigation regions, links, selected state.
- Form subgoal: forms, fields, options, submit controls, feedback.
- Reading subgoal: headings, readable text, links, source context.
- Recovery subgoal: previous target, deltas, errors, alternatives.
- User-question subgoal: missing information, options, risk reasons.

### Evidence

Evidence is a traceable claim:

```text
Evidence
  id
  kind
  claim
  source
  confidence
  observedAt
  relatedGoalId
  relatedCommandId
  expiresAt
  visibility
```

Evidence kinds:

```text
page_identity
control_presence
control_value
validation_feedback
navigation_state
content_fact
action_effect
user_provided_value
permission_state
risk_signal
failure_reason
```

Evidence lifecycle:

- Page identity and control presence can expire after navigation, reload, tab
  switch, or runtime resume.
- User-provided values are valid within their consent scope.
- Verification results can support final summaries and session memory.
- Unverified plans and assumptions cannot become evidence.

Core principle:

```text
Planner decides from FocusedObservation + Evidence.
Summarizer speaks from Evidence.
Developer trace can drill into RawObservation.
```

## 9. Visual recognition and grounding

Visual recognition is a first-version capability. It is not a future-only
enhancement, and it is not a second planning brain.

Its role:

```text
Vision is the Agent's second sense.
It enhances observation, target grounding, and verification.
It does not own planning or bypass semantic commands.
```

The first version includes four visual capabilities only:

1. Capture the visible tab.
2. Summarize obvious visual structure.
3. Ground a requested semantic target to visual candidates.
4. Verify visual state changes after an action.

It does not include:

- A vision model that autonomously plans the next browser action.
- Screenshot capture on every step.
- Direct model-to-coordinate clicking.
- Full-page screenshot stitching.
- General OCR over long documents.
- CAPTCHA or anti-bot solving.
- Visual-only task completion without semantic verification.

### Position in the runtime loop

Vision can be called in three places.

Observation enhancement:

```text
DOM/PageModel observation
  -> if insufficient, capture screenshot
  -> visual page summary
  -> VisualEvidence
  -> EvidenceStore
```

Binding enhancement:

```text
Planner emits SemanticCommand
  -> DOM/PageModel binder ranks candidates
  -> if missing, ambiguous, obstructed, or low confidence:
       capture/crop screenshot
       ground semantic target visually
       fuse DOM and visual candidates
  -> BoundCommand
```

Verification enhancement:

```text
Primitive executes
  -> DOM verification
  -> if inconclusive or visual state matters:
       capture/crop screenshot
       verify expected visual change
  -> VerificationResult
```

### Trigger conditions

Vision should be requested only when it is useful enough to justify latency,
cost, privacy exposure, and Chrome screenshot limits.

Observation triggers:

- DOM observation is sparse, misleading, or lacks accessible names.
- The page uses canvas, SVG-heavy UI, image controls, or custom-rendered
  components.
- The user task asks about visual content.
- The page contains obvious overlays, dialogs, spinners, or visual feedback that
  DOM extraction did not explain.

Binding triggers:

- The semantic command has no reliable DOM candidate.
- Multiple DOM candidates are semantically similar.
- The target is an icon-only button or visually labeled control.
- A DOM candidate appears hidden, covered, disabled, or not clickable.
- A prior click used a high-confidence DOM target but had no effect.

Verification triggers:

- The expected outcome is visual, such as a modal closing, toast appearing,
  active tab changing, selected state changing, loading ending, or button state
  changing.
- DOM verification returns `inconclusive`.
- The page changed visually but the PageModel delta is weak.
- A failure recovery step needs to know whether the screen is blocked by an
  overlay, permission prompt, cookie banner, or validation message.

### Visual requests and outputs

```text
VisualObservationRequest
  taskId
  stepId
  reason
  screenshotScope: visible_tab | region
  focusHints
  redactionHints
  relatedEvidenceRefs
```

```text
GroundVisualTargetRequest
  semanticCommandId
  targetGoal
  expectedRole
  nearbyTextHints
  regionHints
  domCandidateRefs
  screenshotRef
```

```text
VisualStateVerificationRequest
  semanticCommandId
  expectedOutcome
  beforeScreenshotRef
  afterScreenshotRef
  focusRegion
  successCriteria
```

Visual output is evidence, not a final action:

```text
VisualEvidence
  id
  kind
  claim
  screenshotRef
  boundingBox
  label
  roleGuess
  nearbyText
  confidence
  sourceRequestId
  relatedCommandId
  expiresAt
```

Target grounding output:

```text
VisualTargetCandidate
  label
  roleGuess
  boundingBox
  nearbyText
  confidence
  screenshotRef
  reasoningSummary
```

The Binder fuses visual candidates with DOM candidates:

```text
DOM candidate
  + VisualTargetCandidate
  + related Evidence
  + policy context
  -> BoundCommand
```

Only after this fusion may the executor use a coordinate primitive, and only as
the last-mile primitive for a semantic command that passed policy.

### Privacy and policy

Screenshots can contain sensitive data. Vision is subject to `PolicyEngine`.

Rules:

- Remote visual model calls must be allowed by the current safety mode and site
  scope.
- Prefer cropped region screenshots when the target or verification area is
  known.
- Redact or avoid sensitive regions when possible.
- Store screenshot references and derived evidence; do not expose raw images in
  normal user output.
- Record `VisionRequested`, `VisionCompleted`, and `VisualEvidenceAdded` events.
- Respect Chrome screenshot rate limits and avoid repeated full-page captures.
- Disable or ask for confirmation on pages classified as highly sensitive unless
  the user explicitly enables visual analysis in that scope.

### First-version acceptance

The first implementation of `VisionCapability` is successful when:

- It can summarize obvious visual regions from the visible tab.
- It can locate an icon-only or weakly labeled target when DOM binding is
  ambiguous.
- It can help Binder produce a higher-confidence `BoundCommand`.
- It can verify at least one visual state change, such as modal closed, toast
  appeared, selected state changed, or loading ended.
- It writes traceable visual evidence instead of directly deciding browser
  actions.

## 10. Layered action model

The Agent uses three action layers:

```text
Goal / Subgoal
  -> SemanticCommand
    -> BrowserPrimitive
```

### Goal and Subgoal

Goals describe why an action is needed:

```text
Goal: complete the user's browser task
Subgoal: reach the destination page
Subgoal: identify the relevant control
Subgoal: fill user-provided values
Subgoal: submit and verify result
Subgoal: summarize final outcome
```

Every subgoal must be verifiable.

### SemanticCommand

Planner output is a semantic command:

```text
SemanticCommand
  id
  type
  targetGoal
  inputs
  expectedOutcome
  successCriteria
  riskHint
  fallbackHints
```

Initial command set:

```text
NavigateTo
ActivateTarget
FillField
ScrollRegion
ReadContent
OpenTab
SwitchTab
WaitForChange
AskUser
FinishTask
```

Light form scenario adds:

```text
SelectOption
SubmitCurrentForm
```

`SubmitCurrentForm` may be implemented as a specialized semantic alias of
`ActivateTarget`, but it should remain explicit for policy and verification.

### CommandBinder

Binding pipeline:

```text
SemanticCommand
  -> target candidate ranking
  -> BoundCommand
  -> BrowserPrimitive
```

```text
BoundCommand
  semanticCommandId
  targetRef
  primitive
  locator
  confidence
  alternatives
  bindingEvidenceRefs
  expiresOn
```

Binding failure reasons:

```text
target_not_found
ambiguous_target
target_not_interactable
needs_more_observation
requires_user_choice
```

### BrowserPrimitive

Adapter-level executable actions:

```text
dom_click
dom_input
dom_select
keyboard
scroll
open_tab
switch_tab
close_tab
wait
capture_screenshot
coordinate_click
coordinate_input
```

Coordinates and DOM indexes are allowed only as primitive-level execution
details. They must not become the Planner's main action language.

## 11. Lightweight roles

The first version uses lightweight logical roles, not a heavyweight multi-agent
platform.

### PlannerRole

Input:

```text
TaskRuntimeState
FocusedObservation
EvidenceSummary
SessionMemory
CapabilityRegistry
ScenarioProfile
PolicyContext
```

Output:

```text
PlannerDecision
  taskUnderstanding
  activeSubgoal
  shortPlan
  nextCommand
  expectedOutcome
  successCriteria
  riskHint
  missingInfo
  assumptions
  reasoningSummary
```

Rules:

- Output one command per step.
- Include a short plan of 2-4 likely steps.
- Include expected outcome and success criteria.
- Ask the user when necessary information is missing.
- Do not output coordinates or DOM indexes as primary commands.
- Do not use old workflow names or debug vocabulary as domain concepts.

### VerifierRole

Input:

```text
SemanticCommand
BoundCommand
PrimitiveResult
BeforeObservation
AfterObservation
ExpectedOutcome
SuccessCriteria
RelevantEvidence
```

Output:

```text
VerificationResult
  status: success | partial | failed | inconclusive
  confidence
  satisfiedCriteria
  failedCriteria
  newEvidence
  failureReason
  recoveryHints
```

Structured failure reasons:

```text
target_not_found
ambiguous_target
action_had_no_effect
wrong_target_activated
validation_error
permission_denied
context_lost
page_changed_unexpectedly
missing_user_input
model_contract_violation
environment_unstable
```

Simple verification should be deterministic where possible. Use the model for
semantic ambiguity, not for checking every field value.

### SummarizerRole

Outputs:

```text
UserProgressSummary
FinalUserSummary
DebugSummary
FailureExplanation
```

Rules:

- Speak from events and evidence.
- Keep normal user output clean.
- Do not invent facts.
- Do not expose prompts, DOM indexes, model fragments, or internal names unless
  the developer trace layer is open.

### Model contract validation

All LLM role outputs must pass validation:

- JSON parses.
- Command type exists.
- Required fields exist.
- Risk hint is valid.
- Expected outcome is non-empty.
- Success criteria are verifiable.
- Forbidden primitive-only fields are absent from Planner output.
- `done(success=true)` or `FinishTask` is not accepted as proof of form success
  unless supporting evidence exists.

Contract failures write `ModelContractViolation` events and trigger repair or
stop policies.

## 12. Capability packs and scenario profiles

The extension mechanism is:

```text
Capability Pack provides ability.
Scenario Profile organizes preference.
Agent Core makes decisions.
```

### Capability Pack

```text
Capability
  id
  description
  supportedCommands
  observationContributors
  bindingStrategies
  verificationStrategies
  recoveryStrategies
  promptHints
  riskRules
  evidenceExtractors
```

Capabilities may:

- Improve PageModel extraction.
- Add binding strategies.
- Add verification strategies.
- Add evidence extractors.
- Suggest recovery strategies.
- Provide concise prompt hints.
- Add risk rules.

Capabilities may not:

- Own the main task loop.
- Bypass PolicyEngine.
- Write final user output directly.
- Promote unverified guesses to memory.
- Encode fixed business workflows.
- Depend on one specific site's menu names or DOM structure as a generic rule.

Initial capability packs:

```text
BrowserBasicCapability
PageReadingCapability
FormBasicCapability
FeedbackCapability
RecoveryBasicCapability
VisionCapability
```

Future capability packs:

```text
NavigationCapability
TableCapability
ResearchCapability
BackofficePatternsCapability
```

### Scenario Profile

```text
ScenarioProfile
  id
  applicability
  preferredCapabilities
  commandPriority
  observationFocus
  riskOverrides
  outputStyle
  completionCriteria
```

Initial profiles:

```text
GeneralBrowsingProfile
LightFormProfile
```

Future profiles:

```text
BackofficeProfile
ResearchProfile
DataEntryProfile
```

Profiles can adjust preference, not hard-code flow. For example:

- Allowed: when the task is form-like, prioritize form and feedback
  observation.
- Allowed: if the user explicitly asks to submit a test form, treat that submit
  as task-scoped consent.
- Not allowed: if a menu says "User Management", click "Create" and follow a
  fixed sequence.

Core extension rule:

```text
Add scenarios through Capability and Profile first.
Modify Agent Core only when the core vocabulary cannot express the need.
```

## 13. Model configuration and context assembly

Model configuration is part of the Agent capability system. It is not merely a
form with `baseUrl`, `apiKey`, and `model`.

The first version keeps this intentionally simple:

- One global OpenAI-compatible provider.
- One global extension-level configuration.
- Multiple role model names under that provider.
- Planner uses a model by default.
- Vision uses a model only when `VisionCapability` is triggered.
- Verifier is deterministic first and calls a model only when inconclusive.
- Summarizer is template/evidence-based first and calls a model only when
  requested or when the result is too complex for a template.

No first-version support for:

- Multiple provider profiles.
- Per-session model overrides.
- Provider marketplace.
- Automatic model list discovery.
- Routing Planner to one provider and Vision to another.

### Global provider configuration

```text
GlobalModelConfig
  provider
  roleModels
  capabilities
  runtime
  contextBudget
  logging
  privacy
```

```text
ProviderConfig
  baseUrl
  apiKeyRef
  compatibilityMode
  defaultHeaders
```

`apiKeyRef` refers to protected extension storage. API keys must not appear in
events, exported logs, model traces, screenshots, or user-visible summaries.

### Role model binding

```text
RoleModelConfig
  plannerModel
  visionModel
  verifierModel
  summarizerModel
```

Rules:

- `plannerModel` is required.
- `visionModel` is optional. If absent, `VisionCapability` is disabled and the
  Agent runs DOM-only.
- `verifierModel` is optional. If absent, optional model verification reuses
  `plannerModel`.
- `summarizerModel` is optional. If absent, optional model summarization reuses
  `plannerModel`.

Role defaults:

```text
planner:
  useModel: always

vision:
  useModel: when_visual_capability_triggered

verifier:
  useModel: only_when_deterministic_verification_is_inconclusive

summarizer:
  useModel: only_when_requested_or_complex
```

### Model capabilities

OpenAI-compatible providers differ. The Agent must not infer all behavior from
model names.

Capabilities are manually declared and optionally tested:

```text
ModelCapabilities
  supportsStreaming
  supportsJsonMode
  supportsToolUse
  supportsVisionInput
  supportsReasoningSummary
  maxContextTokens
  maxOutputTokens
```

Optional tests:

```text
Test connection
Test planner JSON
Test streaming
Test vision input
```

Test results are diagnostic evidence, not hidden magic:

```text
CapabilityTestResult
  capability
  status: passed | failed | skipped
  testedAt
  errorSummary
```

Capability implications:

- Planner requires text input and structured JSON output.
- Vision requires `supportsVisionInput`, a configured `visionModel`, screenshot
  permission, and policy permission to send screenshot data.
- Streaming is preferred but optional.
- If JSON mode is unavailable, the model call falls back to strict JSON prompt
  plus contract repair.

### JSON contract strategy

Planner and optional model verifier outputs use this order:

```text
if supportsJsonMode:
  request JSON mode / structured response format
else:
  request strict JSON through prompt contract
```

Every model result still passes the same validation:

- JSON parses.
- Schema is valid.
- Command type exists.
- Required fields exist.
- Risk hint is valid.
- Expected outcome is non-empty.
- Success criteria are verifiable.
- Planner did not output primitive-only actions such as direct coordinates.

Failure behavior:

```text
ModelContractViolation
  -> attempt contract repair
  -> retry within role repair limit
  -> fail safely if still invalid
```

The first version should default to one repair attempt for Planner. Verifier and
Summarizer should not loop on repeated repair attempts.

### Role-specific runtime behavior

Default runtime budget:

```text
planner:
  requestTimeoutMs: 60000
  firstTokenTimeoutMs: 15000
  maxRetries: 1
  contractRepairAttempts: 1

vision:
  requestTimeoutMs: 45000
  firstTokenTimeoutMs: 15000
  maxRetries: 0
  minIntervalMs: 750
  maxCallsPerStep: 1

verifier:
  requestTimeoutMs: 15000
  firstTokenTimeoutMs: 5000
  maxRetries: 0

summarizer:
  requestTimeoutMs: 20000
  firstTokenTimeoutMs: 8000
  maxRetries: 0
```

Timeout fallback:

- Planner timeout: compact context once, retry once, then fail safely.
- Vision timeout: mark visual recognition unavailable for this step and continue
  DOM-only when possible.
- Verifier timeout: use deterministic or `inconclusive` verification and let the
  next step replan from evidence.
- Summarizer timeout: use a template summary from events and evidence.

### Model logging and privacy

Model call logs use tiers:

```text
summary
debug
raw
sensitive
```

Default saved data:

```text
modelName
role
requestId
durationMs
streamingEnabled
tokenEstimate or provider usage
status
errorSummary
parsedContractResult
```

Default excluded data:

```text
raw prompt
raw response
API key
screenshot image
sensitive field values
```

Developer mode may enable:

```text
storeRawModelRequests
storeRawModelResponses
storePromptFragments
storeContractRepairPayloads
```

Always-on redaction:

```text
redactApiKeys
redactSensitiveValues by default
redactScreenshots by default
```

Screenshot logging is separate:

```text
storeScreenshotRefs: true
storeScreenshotImages: false by default
sendScreenshotsToRemoteVision: controlled by vision config and policy
```

### Context assembly

The Agent must not send full raw observations or full event logs directly to a
model. Every model call goes through `ContextAssembler`.

Role-specific model context:

```text
PlannerContext
  task frame
  active goal and subgoal
  focused observation
  evidence summary
  recent trace summary
  session memory summary
  capability summary
  scenario profile summary
  policy context
  response schema

VisionContext
  screenshot or cropped region
  target hints
  minimal task and subgoal context
  relevant DOM candidate refs
  relevant evidence refs

VerifierContext
  semantic command
  expected outcome
  success criteria
  before/after deltas
  relevant evidence
  primitive result summary

SummarizerContext
  completed goals
  final evidence set
  unresolved issues
  important failures
  user-facing output constraints
```

Context sources are prioritized:

```text
system contract and schema
user task and active subgoal
current command and expected outcome
relevant evidence
focused observation
recent trace summary
session memory summary
capability and policy summary
raw excerpts only when necessary
```

### Context budget

Each role has a budget derived from model capabilities and user configuration:

```text
ContextBudgetConfig
  plannerMaxInputTokens
  visionMaxInputTokens
  verifierMaxInputTokens
  summarizerMaxInputTokens
  reservedOutputTokens
  evidenceLimit
  recentEventLimit
  observationCandidateLimit
  rawExcerptLimit
  compressionStrategy
```

Defaults should be computed from `maxContextTokens` when possible, while keeping
reserved output space for valid JSON.

The first version may estimate tokens approximately, but the estimator must be
conservative. It should prefer underfilling the context to silently truncating
the response schema or required task state.

### Compression order

If assembled context is too large, reduce it in this order:

1. Keep system contract, role instructions, JSON schema, user task, and active
   subgoal.
2. Keep command-related evidence and current success criteria.
3. Keep recent failures and unresolved questions.
4. Keep high-confidence and non-expired evidence.
5. Summarize older trace events into `RecentTraceSummary`.
6. Reduce `FocusedObservation` to relevant regions and candidates.
7. Drop low-confidence, expired, duplicate, and unrelated candidates.
8. Replace verbose text blocks with evidence claims and excerpts.
9. Include raw excerpts only when the role cannot act from evidence.
10. Fail safely or request a narrower observation if still too large.

Hard rule:

```text
Never truncate JSON schema, safety policy, user task, active subgoal, or command
success criteria to fit raw page content.
```

### Over-budget behavior

Planner:

- Compact focused observation.
- Summarize older trace.
- Prefer evidence over raw DOM.
- Retry once with compact context.
- If still too large, request narrower observation, ask the user to clarify, or
  fail safely.

Vision:

- Prefer cropped region screenshots.
- Minimize text context.
- If still too large or disallowed, skip visual analysis for this step.

Verifier:

- Keep only the semantic command, expected outcome, before/after delta, and
  related evidence.
- If still inconclusive, return `inconclusive` instead of bloating context.

Summarizer:

- Summarize in chunks when needed.
- Final output must still cite or reference evidence IDs internally.

Events:

- Full event logs do not enter model context.
- Context assembly decisions write debug events when compression materially
  changes what the model sees.

## 14. Safety policy and configuration

Safety uses:

```text
RiskClassifier + ConsentScope + PolicyEngine + HardBlockPolicy
```

Risk is based on semantic command, task authorization, page context, data
sensitivity, and potential side effects. It is not decided by button text alone.

Safety modes:

```text
conservative
balanced
autonomous
experimental_full_auto
```

### conservative

Best for real accounts and production systems. Submit, save, delete, publish,
upload, download, and sensitive input actions tend to require confirmation.

### balanced

Default. Low-risk actions run automatically. Submit/save/create actions can run
automatically when the user's task clearly authorized them. High-risk actions
still require confirmation or are blocked.

### autonomous

Best for test environments. Most in-task actions, including creating, saving,
and submitting test data, run automatically. High-risk actions still require
confirmation or blocking.

### experimental_full_auto

Experimental. The Agent avoids interruptions and logs risk decisions instead of
asking frequently. It must have:

- Clear UI status.
- Session or site scope.
- Expiration or manual disable control.
- Risk trace events.
- A reliable stop control.
- Non-disableable hard blocks.

### Consent scope

User task text creates scoped consent:

```text
"Fill this form but do not submit"
  -> submit/save is blocked.

"Create a test record and save it"
  -> current task submit/save is authorized.

"Search and summarize"
  -> login, registration, payment, or posting is not authorized.
```

Consent scope includes:

```text
taskId
origin
pageIdentity
commandTypes
dataCategories
expiresAt
```

The Agent should not ask for confirmation on every submit button when the task
already clearly authorized submit/save inside the current scope.

### Sensitive data

Sensitivity levels:

```text
public
user_provided
session_sensitive
secret
regulated
```

Rules:

- Passwords, verification codes, API keys, card numbers, and identity numbers
  cannot be invented by the model.
- User-provided sensitive values can be used only within consent scope.
- Sensitive values are redacted from normal logs and summaries.
- Memory stores sensitive references, not plaintext, unless explicitly allowed
  under a scoped developer setting.

### Hard blocks

Even `experimental_full_auto` must not bypass:

- Chrome permission and browser security boundaries.
- CAPTCHA or anti-bot bypass.
- Payments, transfers, or financial transactions.
- Unauthorized data export or privacy-invasive collection.
- Large-scale destructive operations.
- Extension installation or browser security setting modification.
- Illegal, harmful, or security-evasion tasks.

Policy output:

```text
PolicyDecision
  status: allow | ask_user | block | hard_block
  riskLevel
  reasons
  consentScopeRef
  redactions
  requiredUserPrompt
```

## 15. Session memory

The first version supports session-level memory, not long-term memory.

```text
SessionMemory
  facts
  variables
  userProvidedValues
  completedTaskRefs
  failureHistory
  consentScopes
```

Memory facts:

```text
MemoryFact
  id
  kind
  value
  sourceEvidenceRefs
  confidence
  sensitivity
  scope
  expiresAt
```

May enter memory:

- User-provided values.
- Observed facts with evidence.
- Verification-confirmed results.
- Derived variables with traceable sources.
- Consent scopes.
- Failure history.

Must not enter memory:

- Planner guesses.
- Unverified short plans.
- Model-invented values.
- Expired page bindings.
- Failed creation results.
- Plaintext sensitive data without explicit scoped permission.

## 16. Output layers

Output is derived from events and evidence, not ad hoc strings from modules.

### User Progress Layer

Default, clean progress:

```text
正在查看当前页面结构。
找到了可能的邮箱字段，正在填写。
提交后出现必填错误，需要补充部门字段。
任务已完成，已创建测试记录。
```

### Decision Explanation Layer

Expandable:

```text
active subgoal
short plan
next semantic command
expected outcome
risk decision
key evidence
verification result
```

### Developer Trace Layer

Full debugging:

```text
event stream
model call summaries
observation summaries
binding details
primitive results
policy decisions
verification details
recovery hints
exported logs
```

Normal users should not see prompts, raw model fragments, raw DOM indexes,
coordinates, or internal debug labels unless they open the developer trace.

## 17. First-version acceptance scenarios

### Primary: general browser operation

Example task:

```text
Open a webpage, find a relevant entry, click into it, read the resulting page,
and summarize the result.
```

Must demonstrate:

- Page identity and interactive targets are observed.
- Planner produces a short plan and one semantic command.
- Binder maps the command to current page targets.
- Policy allows low-risk actions.
- Executor performs click, scroll, navigation, tab, or wait primitives.
- Verifier detects page changes or semantic progress.
- VisionCapability can be triggered when DOM binding or verification is
  insufficient, and its output appears as visual evidence.
- Event log reconstructs the full task.
- User output stays clean while developer trace remains available.

### Secondary: lightweight form task

Example task:

```text
Fill this test form: name is Alice, email is alice@example.com, then submit it.
```

Must demonstrate:

- TaskInterpreter recognizes task-scoped submit consent.
- FormBasicCapability detects fields and feedback.
- Planner outputs `FillField` and `SubmitCurrentForm`.
- Binder binds fields and submit control semantically.
- PolicyEngine does not ask for every submit when scoped consent exists.
- Verifier checks field values, validation feedback, and submission outcome.
- VisionCapability can help locate weakly labeled controls or verify visual
  feedback such as a modal closing or toast appearing.
- Successful result can enter SessionMemory.
- Missing required fields trigger evidence-driven recovery or `AskUser`.

### Tertiary: vision-assisted grounding

Example task:

```text
Click the settings icon in this page and tell me whether the settings panel
opened.
```

Must demonstrate:

- DOM observation alone is insufficient or ambiguous.
- VisionCapability captures the visible tab or a relevant region.
- Visual target candidates are written as `VisualEvidence`.
- Binder fuses DOM and visual candidates before execution.
- PolicyEngine evaluates the resulting semantic command.
- Verifier uses visual evidence to confirm whether the settings panel opened.
- No visual model output directly becomes an unreviewed coordinate click.

## 18. Future enhancement direction

Backoffice enhancement:

- `BackofficeProfile`
- `NavigationCapability`
- `TableCapability`
- stronger form and feedback handling
- create/edit/search/list workflows expressed as capabilities and profiles, not
  fixed core flows

Research enhancement:

- `ResearchProfile`
- `ResearchCapability`
- source quality evidence
- quoted/cited content facts
- multi-tab search and reading

Later vision expansion:

- full-page or region-stitch screenshot strategies
- stronger visual OCR for reading-heavy pages
- local or on-device visual model adapters when available
- visual comparison across before/after screenshots
- richer image and canvas understanding

Vision must remain an evidence contributor for observation, binding, and
verification. It must not replace the semantic command model.

## 19. Design invariants

These rules should stay true even as the implementation grows:

1. Agent Core does not import Chrome APIs.
2. Planner outputs semantic commands, not DOM indexes.
3. Every command has an expected outcome.
4. Every execution is followed by observation and verification.
5. Event log is the source of truth.
6. Snapshots are rebuildable derived state.
7. Session memory requires evidence.
8. Capabilities extend ability, not control flow.
9. Profiles express preference, not business scripts.
10. Safety decisions are centralized and traceable.
11. User output is separated from developer trace.
12. Chrome MV3 suspension is a normal condition, not an exceptional edge case.
13. Vision enhances observation, binding, and verification; it does not plan.
14. Coordinate primitives are last-mile execution details after semantic
    binding and policy.
15. Model configuration is global in the first version, but role behavior is
    still explicit.
16. Models receive assembled role context, not raw event logs or full raw page
    dumps.
17. Context compression preserves task, schema, policy, active subgoal, and
    success criteria before raw content.
