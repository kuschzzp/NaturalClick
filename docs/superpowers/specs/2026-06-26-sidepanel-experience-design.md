# Sidepanel Experience Design

Status: proposed for the clean rewrite branch.

Date: 2026-06-26

Companion document:
`docs/superpowers/specs/2026-06-26-agent-core-architecture-design.md`

## 1. Purpose

The side panel is the user's control surface for a Chrome browser operation
Agent. It should feel conversational when idle and operational when the Agent is
working.

The design direction is an adaptive conversational workbench:

```text
Idle / Conversation Mode
  conversation-first browser Agent assistant

Running / Workbench Mode
  status, current action, evidence, safety, overlay, and trace
```

The old extension's page element boxes and numeric labels were valuable. The new
side panel should preserve that trust-building idea, but separate it from the
Agent's actual observation capability:

```text
Observation is Agent sensing.
Overlay is user visualization.
Turning overlay off must not disable observation, binding, or execution.
```

## 2. Product principles

1. Chat is the entry point; the workbench is the execution surface.
2. The user should always know what the Agent is doing now.
3. The Agent should show what it is about to act on, especially before risky
   actions.
4. Normal output stays clean; detailed trace is available on demand.
5. Safety confirmation is scoped authorization, not repeated button-by-button
   interruption.
6. Page overlays are visible explanations, not required sensing.
7. The UI must support developer debugging without making normal users read raw
   logs, prompts, DOM indexes, or JSON.
8. The interface should be dense and calm, closer to an operational console than
   a marketing page.

## 3. Layout archetype

The side panel is an operational workbench with a data review console inside it.

Primary content object:

- Active browser task.
- Current semantic command.
- Page target candidates.
- Evidence and trace events.

Main action model:

- Start a task.
- Monitor progress.
- Intervene with additional instructions.
- Confirm scoped risk.
- Inspect evidence.
- Stop, retry, or continue.

Top-level regions:

```text
Top Status Bar
Conversation / Progress Timeline
Pinned Current Action Bar
Inspector Panel
Settings Drawer
Bottom Composer
Page Overlay
```

Density:

- Operational density while running.
- Normal conversational density while idle.

Visual tone:

- Technical, precise, calm, and compact.
- Avoid a hero layout, marketing cards, oversized decorative panels, and
  one-note colors.

## 4. Modes

### Idle / Conversation Mode

Default when there is no active task.

Structure:

```text
Top Status Bar
Conversation History
Configuration Guidance Card when needed
Recent Current-Session Result Cards
Bottom Composer
```

Characteristics:

- The user can start a new task in natural language.
- Current-session results remain visible.
- Overlay defaults to `Off`.
- If model configuration is incomplete, a guidance card explains what is
  missing.
- Settings opens as a drawer, not a page takeover.

Example empty or first-run card:

```text
Need model configuration before starting

Planner model is required for task understanding and next-action decisions.

Missing:
- API Base URL
- API Key
- Planner Model

[Open model settings]
```

### Running / Workbench Mode

Activated when a task is running, paused, awaiting confirmation, awaiting user
input, or being inspected.

Structure:

```text
Top Status Bar
Pinned Current Action Bar
Progress Timeline
Inspector Panel
Bottom Composer
```

Characteristics:

- The current action remains visible even as timeline items grow.
- The user can stop, pause, continue, or append instructions.
- Overlay defaults to `Focus`.
- Safety confirmations appear inline as scoped authorization cards.
- Developer trace is available but not dominant.

### Completion behavior

When a task completes, fails, or stops:

- Return to Conversation Mode.
- Add a result card to the timeline.
- Keep quick actions visible:

```text
[Continue asking]
[View trace]
[Export log]
[Run again]
```

If the developer trace is open, the side panel may remain in Workbench Mode until
the user closes the trace.

## 5. Top Status Bar

The top bar communicates global state without becoming a dashboard.

Content:

```text
Agent state: idle | running | paused | waiting | completed | failed | stopped
Safety mode
Model status
Vision status
Overlay mode
Stop button when active
Settings button
```

Examples:

```text
Running · balanced · Planner ready · Vision ready
Paused · autonomous · Vision disabled
Waiting for confirmation · conservative · DOM+Vision target
```

Rules:

- Status text must be short.
- High-risk modes such as `experimental_full_auto` need a persistent visual
  indicator.
- Stop must remain reachable during any active task.
- Settings should not hide Stop.

## 6. Bottom Composer

The bottom composer is always present.

Idle placeholder:

```text
Ask the Agent to operate the current page...
```

Running placeholder:

```text
Add instructions, provide info, or type "stop"...
```

Supported input purposes:

- Start a task.
- Ask a follow-up.
- Provide missing information.
- Add a constraint.
- Override a value.
- Deny an action category.
- Allow an action category.
- Pause, stop, continue, or clarify.

Runtime messages become events:

```text
UserMessageReceived
InstructionAppended
```

Handling rules:

- If no primitive action has been issued, appended instructions can trigger
  immediate replanning.
- If an action is already in progress, the Agent waits for the result,
  re-observes, then applies the new instruction.
- `stop` should move the task toward `TaskStopped` as quickly as the runtime can
  safely do so.
- "Do not submit" updates consent scope so future `SubmitCurrentForm` commands
  are blocked.

## 7. Pinned Current Action Bar

The current action is the trust anchor. It is always visible in Workbench Mode
as a compact fixed bar and can expand into a full card.

Compact form:

```text
Current: click "Settings" icon · low risk · DOM+Vision
[Expand] [Stop]
```

Expanded form:

```text
Current subgoal:
  Open the settings panel

Next command:
  ActivateTarget("Settings icon")

Bound target:
  #12 icon button · confidence 0.91 · DOM+Vision

Expected outcome:
  Settings panel opens

Verification:
  Check for the settings panel; use visual verification if DOM is inconclusive

Risk:
  Low, auto-allowed

Actions:
  [Highlight target] [Pause] [Skip this step] [Stop task]
```

States:

- Planning.
- Binding target.
- Waiting for policy.
- Executing.
- Verifying.
- Waiting for user input.
- Blocked.

Rules:

- The bar is not a log item. It represents the current or next semantic command.
- `Highlight target` should flash the related page overlay target.
- If a target has no overlay candidate, show that explicitly.
- Safety confirmation upgrades this bar into a scoped authorization card.

## 8. Progress Timeline

The timeline combines conversation and progress. It is not a raw log stream.

Item types:

```text
UserMessage
AgentProgress
Observation
Decision
Action
Verification
UserInputNeeded
SafetyConfirmation
Recovery
Result
Failure
Stopped
```

Default user-facing copy should be concise:

```text
Looking at the current page.
Found three possible settings entries and selected the strongest match.
Clicked the settings icon and checking whether the panel opened.
Settings panel is open.
```

Expandable details:

```text
subgoal
semantic command
bound target
risk decision
expected outcome
verification result
evidence refs
related event ids
```

Rules:

- Do not append raw model fragments as user messages.
- Do not show full JSON by default.
- Repeated low-value events should fold into one progress item.
- Long tasks should summarize older progress while preserving trace access.
- Recovery should explain what changed, not just say "retrying".

## 9. Inspector

The first version uses three inspector tabs:

```text
Decision
Evidence
Trace
```

The inspector can be collapsed. It opens automatically only for explicit user
debug actions or when the Agent needs a user decision with evidence.

### Decision tab

Answers: why is the Agent doing this next?

Shows:

```text
Active subgoal
Short plan
Next semantic command
Expected outcome
Risk decision
Model contract status
Assumptions
Missing information
```

Rules:

- Use semantic command names, not low-level DOM operations, in the primary view.
- Low-level primitive details can be nested.
- If model output was repaired, show a compact contract warning.

### Evidence tab

Answers: what does the Agent know, and where did that belief come from?

Sections:

```text
Page identity
Target candidates
Form and control evidence
Feedback and validation
Visual evidence
User-provided values
Session memory
Verification evidence
```

Interactions:

- Clicking an evidence item highlights the related overlay target.
- Evidence with expired page bindings should be marked expired.
- Visual evidence can show bounding box metadata without exposing raw screenshot
  images by default.

### Trace tab

Answers: what happened internally?

Shows folded event chains:

```text
ObservationReceived
EvidenceAdded
PlanProduced
CommandBound
PolicyEvaluated
CommandIssued
CommandResultReceived
VerificationProduced
ModelCall...
Vision...
```

Rules:

- Default collapsed.
- Raw prompts and responses require developer mode.
- Sensitive values are redacted.
- Trace should group events by step, not present one endless stream.

## 10. Settings Drawer

Settings opens in a drawer over the side panel. It should not replace the task
workspace unless the user explicitly opens it.

Sections:

```text
Model
Safety
Overlay
Privacy / Logging
Developer
```

### Model settings

First version supports one global OpenAI-compatible provider.

Fields:

```text
Base URL
API Key
Compatibility Mode
Planner Model
Vision Model optional
Verifier Model optional
Summarizer Model optional
```

Capability declarations:

```text
Streaming
JSON mode
Vision input
Max context tokens
Max output tokens
```

Tests:

```text
Test connection
Test planner JSON
Test streaming
Test vision
```

Example result rows:

```text
Connection passed · 428ms
Planner JSON failed · schema mismatch
Vision skipped · no vision model
```

Rules:

- Planner model is required before tasks can run.
- Vision model is optional. If missing, `VisionCapability` is disabled.
- Failed tests should explain impact.
- Saving configuration must not write API keys to trace logs.

### Safety settings

Fields:

```text
Safety mode:
  conservative
  balanced
  autonomous
  experimental_full_auto

Submit behavior
Sensitive data handling
Remote vision permission
```

Rules:

- `balanced` is the recommended default.
- `experimental_full_auto` needs clear warning and persistent status.
- Hard blocks are not disabled by this drawer.

### Overlay settings

Controls default overlay behavior:

```text
Idle default: Off
Running default: Focus
Developer default: Evidence or All Targets
Show confidence
Show semantic labels
Show visual boxes
```

Reminder:

```text
Overlay controls visualization only. Agent observation still runs when overlay
is off.
```

### Privacy / Logging

Controls:

```text
Store raw model requests
Store raw model responses
Store screenshot references
Store screenshot images
Redact sensitive values
Export log
Clear current session
```

Defaults:

- Raw model payloads off.
- Screenshot references on.
- Screenshot images off.
- Sensitive value redaction on.

### Developer

Controls:

```text
Developer mode
Show raw event ids
Show command binding details
Show model context assembly decisions
Show contract repair attempts
```

Developer mode should increase transparency, not loosen hard safety blocks.

## 11. Page Overlay

The overlay renders what the Agent sees and reasons about. It is a visual layer
in the page, not the observation system itself.

Hard rule:

```text
OverlayMode controls visualization only.
It must not disable DOM observation, PageModel extraction, command binding, or
action execution.
```

Modes:

```text
Off
Focus
All Targets
Evidence
Vision
```

### Off

No visible boxes or labels. Agent observation continues.

Default in Idle / Conversation Mode.

### Focus

Shows only current subgoal candidates and the current bound target.

Default in Running / Workbench Mode.

### All Targets

Shows all current actionable candidates with compact labels.

Example labels:

```text
#12 button · Settings · 0.86
#18 input · Email · required
#23 submit · medium risk
```

Rules:

- Candidate numbers are observation candidate IDs, not stable DOM identities.
- Labels should be compact and not cover the target.
- Long labels should truncate.
- Hovering a label can reveal more detail if feasible.

### Evidence

Shows evidence sources:

- Page identity region.
- Field evidence.
- Feedback and validation messages.
- Target candidate groups.
- Verification source regions.

Used when the Evidence tab is open or the user selects an evidence item.

### Vision

Shows visual model output:

- Visual regions.
- Visual target candidates.
- Bounding boxes.
- Confidence.
- Screenshot reference.

Used during visual grounding or visual verification. It may temporarily overlay
DOM candidates for comparison.

### Overlay and side panel linking

Interactions:

- Hover current action -> flash page target.
- Click evidence -> highlight evidence region.
- Click trace binding -> highlight bound target.
- Safety confirmation -> offer `Highlight target`.
- Vision grounding -> show DOM and Vision candidates with distinct styles.

Visual distinction:

- Current target: strongest highlight.
- Candidate target: lighter outline.
- Vision candidate: distinct dashed or tinted outline.
- Failed target: temporary warning style.
- Expired target: muted style.

## 12. Safety confirmation

Safety confirmation is scoped authorization. It should not ask about every
button click.

Example card:

```text
Confirm submit action

The Agent is ready to submit the current test form. This may create or modify
data on this page.

Scope:
- Current task
- Current page
- SubmitCurrentForm
- Excludes delete, payment, publish, export

[Allow submit for this task] [Allow once] [Deny]
[Highlight target]
```

Rules:

- `Allow submit for this task` creates or updates consent scope.
- `Allow once` allows only the current semantic command.
- `Deny` updates task state and may stop before submission.
- Confirmation must show the command's semantic meaning, not just the button
  text.
- The card should explain what is excluded from the authorization.
- Risk trace events are written whether confirmation is shown or skipped.

## 13. Current-session history

The first version supports current-session history only, not long-term task
history.

In the same side panel session:

- Previous user tasks remain visible.
- Results remain visible.
- Follow-up questions can reference current-session memory.
- Trace can be inspected or exported.
- Logs can be cleared.

No first-version promise:

- Cross-browser-restart memory.
- Long-term user preference memory.
- Past task search across sessions.

Result card actions:

```text
[Continue asking]
[View trace]
[Export log]
[Run again]
```

Session memory appears inside Evidence, not as a primary tab in the first
version.

## 14. Empty, loading, error, and stopped states

### Empty

Show a compact prompt and configuration status.

No marketing hero or feature grid.

### Loading

Keep layout stable. Use inline loading state in:

- Current action bar.
- Timeline item.
- Model test row.
- Trace step.

Avoid replacing the whole side panel with a spinner.

### Error

Errors should say:

- What failed.
- Whether the task is stopped or can continue.
- What the user can do next.

Examples:

```text
Planner model timed out after compacting context once.
[Try again] [Open model settings] [View trace]
```

```text
Vision is unavailable for this step, so the Agent will continue with DOM-only
binding.
[View details]
```

### Stopped

Stopping is not an error.

Stopped card:

```text
Task stopped

Stopped before submitting the form. Filled fields remain visible on the page.

[Continue from here] [Clear task] [View trace]
```

## 15. Accessibility and keyboard

Requirements:

- Bottom composer is keyboard reachable.
- Stop is keyboard reachable during active tasks.
- Overlay labels must not trap focus.
- Icon-only controls need accessible labels.
- Inspector tabs use proper tab semantics.
- Settings drawer traps focus while open and returns focus on close.
- Safety confirmation buttons are real buttons with visible focus states.
- Reduced motion should disable flashing and replace it with a stable highlight.
- Color must not be the only indicator for risk, selection, error, or success.

## 16. First-version acceptance scenarios

### Conversation start

Given no configured planner model:

- User opens side panel.
- Conversation Mode appears.
- Configuration guidance card explains missing fields.
- User can open Settings Drawer.
- Starting a task shows a clear blocked state instead of failing silently.

### General browser task

- User enters a task.
- Sidepanel switches to Workbench Mode.
- Current Action Bar appears.
- Overlay switches to Focus.
- Timeline shows clean progress cards.
- Decision/Evidence/Trace are available but not dominant.
- On completion, sidepanel returns to Conversation Mode with a result card.

### Safety submit task

- User asks to fill and submit a test form.
- If the task wording clearly authorizes submit, no repeated submit
  confirmation appears in balanced mode.
- If the submit is ambiguous, a scoped confirmation card appears.
- `Highlight target` flashes the submit button overlay.
- Allowing task-scoped submit prevents repeated confirmation for equivalent
  submit commands in the same task.

### User intervention

- While running, user types "do not submit".
- The message enters the timeline.
- Consent scope updates.
- Future submit command is blocked or asks for clarification.

### Overlay modes

- Idle defaults to Off.
- Running defaults to Focus.
- All Targets shows candidates and numeric labels.
- Evidence highlights selected evidence sources.
- Vision shows visual bounding boxes during visual grounding.
- Turning overlay Off does not stop observation or execution.

### Developer trace

- User opens Trace.
- Events are grouped by step.
- Raw prompts are hidden unless developer mode is enabled.
- Sensitive values are redacted.
- Exported log follows the same redaction rules.

## 17. Design invariants

1. Sidepanel is a control surface, not the Agent kernel.
2. Conversation is the entry point, Workbench is the runtime surface.
3. Current action remains visible during active tasks.
4. Overlay is visualization only; observation remains independent.
5. User output is clean by default.
6. Decision, Evidence, and Trace are available on demand.
7. Safety confirmation grants scoped consent, not repeated button approval.
8. Stop is always reachable during active tasks.
9. Settings do not hide active task controls.
10. Current-session memory is available; long-term history is out of scope.
11. Developer mode increases visibility, not permission.
12. The UI avoids marketing-page structure and stays operational.

