# Search Workflow Rewrite Design

## Goal

NaturalClick 0.4.x moves search/filter-field testing out of model-only planning and into a deterministic workflow. The model remains useful for ambiguous pages, but routine search testing should no longer depend on guessing the next field, guessing dropdown options, or recovering from timeouts by clicking business navigation.

## Architecture

- `background/workflows.js` owns workflow ordering.
- `background/search-workflow.js` owns deterministic search-test decisions.
- `background/search-workflow-state.js` owns persisted workflow state.
- `background/search-workflow-history.js` owns history classification.
- `background/planner.js` still handles model calls, ReAct context requests, validation, and compact retries.

The pre-model order is target URL, login, task navigation, then search-field testing. Search testing only runs after named task navigation targets are reached or when the task has no named business target.

## Search State Machine

The search workflow uses this phase sequence:

`select_field -> fill/open/select -> awaiting_submit -> awaiting_reset -> select_field -> completed`

Collapsed search panels are expanded first. Text fields are filled with deterministic test values derived from task credentials and field semantics. Selection fields are opened first; the workflow chooses only real candidates returned by the content action outcome or exposed field option labels. After each field is submitted, the workflow resets filters before moving to the next field.

## Safety Rules

- Never invent dropdown options such as `WEB`, `全部`, or `默认`.
- Never test a generic search area while a named business module is still unresolved.
- Model timeout recovery may stop with a clear failure, but it must not click business navigation or continue search tests on the wrong page.
- Loop guard remains a protection layer only; it does not drive workflow progress.

## Verification

Runtime contracts must cover deterministic search expansion, text-field fill, dropdown open/choose, submit/reset, completion, unresolved navigation suppression, and the active manifest version.
