# Readable Chat And Fast Execution Design

Date: 2026-07-09

## Goal

Make NaturalClick's active conversation readable for humans and reduce unnecessary planner/model calls during ordinary browser operations. The design is generic: it improves how the Agent summarizes runtime events and how it decides between deterministic execution and model planning. It does not add CRM-specific rules.

## Evidence From The 2026-07-09 Session Log

The inspected session exported 240 raw runtime events. `ModelCallProgress` contributed 125 events and `EvidenceAdded` contributed 92 events, while the actual user-facing task flow was much smaller. The UI currently compresses some event bursts, but the active conversation still mixes business progress, model JSON, observation diagnostics, performance notices, and raw trace details.

The same log showed one step spanning 53.3 seconds. That step made three planner model calls: two completed calls took about 22.3 seconds and 29.3 seconds, and the third was stopped by the user. This happened after a successful page action had already navigated into the customer add page, which means the runtime was spending time in planner/tool loops where a deterministic action router should have handled simple follow-up work first.

## User Experience Design

The side panel remains an operational workbench. The active conversation should default to a concise run digest:

- Current status and current human-readable action.
- Last meaningful action or issue.
- A compact metric row for events, model calls, observation rounds, and slow calls.
- A small recent-step list using human labels such as "观察页面", "执行点击", "模型规划", and "完成/停止".
- Debug trace, raw model stream, evidence counts, and low-level tool events stay collapsed behind a details control.

History detail pages follow the same rule: human summary first, trace second. Downloaded logs remain complete for debugging.

## Execution Design

The runtime should route simple browser operations before planner calls on every step, not only at task start. Fast paths remain disabled for repeated identical successful actions, but a previous action must not disable all future deterministic actions.

The planner native-tool loop should be conservative for browser actions. If the model emits tool calls, the runtime may execute a bounded number of read-only/context tools, but simple page operations should not spend multiple full model turns unless the page is ambiguous or the task requires extra context.

## Boundaries

- No site-specific menu names, URL rules, or CRM workflows.
- No visible page markers are required for sensing or execution.
- Raw logs stay available for support and debugging.
- UI changes reuse the existing side panel component language: compact panels, details sections, status tones, icon buttons, and current CSS tokens.

## Acceptance Criteria

- Active conversation no longer exposes raw event noise as the primary content.
- A session with many `ModelCallProgress` and `EvidenceAdded` events renders a readable digest.
- Deterministic fast paths can run after earlier successful actions when the new target is different.
- Planner native-tool rounds are capped by a small runtime budget.
- Unit tests cover timeline digesting and post-action fast path availability.
- Package and extension manifest versions are bumped.
