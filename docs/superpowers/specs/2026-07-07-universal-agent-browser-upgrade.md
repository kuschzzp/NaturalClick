# Universal Agent Browser Upgrade

Date: 2026-07-07

This spec records the NaturalClick upgrade that moves the extension toward a general-purpose browser operation Agent. The goal is not to specialize for one CRM page. The goal is to make observation, model configuration, execution, lifecycle control, and diagnostics strong enough for many ordinary web applications.

## Architecture Summary

NaturalClick keeps a hexagonal Agent Core. Core modules own task interpretation, context assembly, fast-path decisions, tool disclosure, execution control, events, session state, and runtime health analysis. Chrome, DOM, content scripts, CDP helpers, storage, model clients, overlay rendering, and the side panel remain adapters.

The upgrade adds these boundaries:

- Page Atlas and Interactive Index provide compact page structure instead of raw DOM dumps.
- Hidden `data-naturalclick-handle` attributes are used for binding; visible overlay markers are not required for execution.
- Tool definitions are grouped by capability and disclosed progressively.
- Fast paths handle explicit URLs and one exact visible low-risk control before calling the planner model.
- Optional capability contracts exist for skills, scratchpad records, file artifacts, PDFs, and scheduled tasks, but heavyweight groups are disabled by default.

## User-Facing Behavior Changes

- Simple tasks such as clicking one exact visible menu item can run without a planner model call.
- The side panel is a workbench: it shows running state, issue hints, logs, settings, history, and task controls.
- Opening the side panel after focus changes or extension reload attempts to rehydrate the active session rather than silently losing state.
- Starting a new session creates a fresh current session instead of returning to the previous conversation after panel reopen.
- Stop requests create a durable stop marker and abort model streaming, controller loops, and pending work.

## Model Configuration Storage Migration

Model configuration is stored as structured runtime settings instead of a single loose provider tuple.

Stored configuration includes:

- Provider base URL and API key.
- Detected model list cache.
- Planner model selection.
- Optional vision model selection.
- Runtime capability flags derived from the selected model.

Configuration persistence must survive side panel refresh, extension panel close/open, and browser focus changes. API keys must not be copied into execution logs.

## Overlay Behavior Changes

Overlay is now debug visualization, not Agent sensing.

- Default marker mode is non-interfering.
- `Off` removes the overlay root from the page.
- Vision screenshots should be captured after visible debug overlays are cleared.
- Marker labels are short debug labels only; verbose labels such as `button - 客户管理 - 0.88` must not be drawn over the page.
- Observation and execution still work when markers are off because binding uses hidden handles and Page Atlas data.

## Stop And Resume Guarantees

Stop should be durable and observable.

- A stop request writes a task tombstone.
- Model streaming receives an abort signal.
- The execution controller stops issuing follow-up steps.
- Tool execution and action settling are checked through controller state.
- Reopening the panel rehydrates status from stored session events and tombstones.

Resume should never continue a task that was explicitly stopped unless the user starts a new task.

## Performance Expectations

The runtime should avoid model calls when deterministic execution is enough.

- Explicit URL navigation can bypass the planner model.
- One exact visible low-risk control can be activated by fast path.
- Repeated observations are compressed and stale snapshots are elided from model context.
- Runtime health metrics should flag slow observation, slow model calls, repeated simple-task model calls, and overlay interference during vision.

Regression tests include a CRM sidebar fixture to ensure menu controls are recognized as `menuitem`, plus a performance guardrail for exact sidebar clicks.

## Known Limitations

- CDP click/input helpers are available as adapters, but production wiring should remain conservative unless permissions and browser behavior are confirmed.
- PDF, file, scratchpad, skill, and schedule capabilities are contracts only in this upgrade; full UI and tool implementations are future work.
- Complex custom controls still need additional framework-independent fixture coverage.
- Vision remains assistive. It should not become a separate planner or depend on visible page markers.
- Provider-specific model quirks may still require compatibility profiles.
