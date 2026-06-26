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

The first version should also include one lightweight form scenario to prove
that field filling, task-scoped submit authorization, and evidence-driven
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
PersistEventPort
LoadEventsPort
PersistSnapshotPort
LoadSnapshotPort
ReadSessionMemoryPort
WriteSessionMemoryPort
AskUserPort
CaptureScreenshotPort
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
  contract validation.
- Screenshot/vision adapter: screenshot capture and optional visual target
  candidates, used as a fallback for binding/execution rather than as the main
  decision model.

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
   Generate an observation request appropriate for the active subgoal.

3. Update evidence
   Extract task-relevant evidence from the observation.

4. Plan
   Ask PlannerRole for task understanding, short plan, next command, expected
   outcome, success criteria, risk hint, and assumptions.

5. Bind
   Map the semantic command to current page targets and browser primitives.

6. Check policy
   Decide allow, ask_user, block, or hard_block.

7. Execute
   Execute one primitive through an adapter.

8. Re-observe
   Observe the relevant region or page after the action.

9. Verify
   Decide success, partial success, failure, or inconclusive.

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

## 9. Layered action model

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

## 10. Lightweight roles

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

## 11. Capability packs and scenario profiles

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
```

Future capability packs:

```text
NavigationCapability
TableCapability
ResearchCapability
VisionCapability
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

## 12. Safety policy and configuration

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

## 13. Session memory

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

## 14. Output layers

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

## 15. First-version acceptance scenarios

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
- Successful result can enter SessionMemory.
- Missing required fields trigger evidence-driven recovery or `AskUser`.

## 16. Future enhancement direction

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

Vision enhancement:

- `VisionCapability`
- screenshot-based target candidates
- coordinate fallback after semantic binding uncertainty
- post-action semantic verification

Vision must remain a fallback or evidence contributor. It must not replace the
semantic command model.

## 17. Design invariants

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

