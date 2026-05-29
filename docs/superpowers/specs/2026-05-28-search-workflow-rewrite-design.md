# Search Workflow And Timeout Recovery Design

Status: implemented for the 0.4.x runtime, with the current source version tracked in `naturalclick-extension/manifest.json`.

## Goal

NaturalClick 0.4.x moves repeatable browser automation steps out of model-only planning and into deterministic workflows. The model remains useful for ambiguous pages, but routine search testing, form-field recovery, and model-timeout recovery should not depend on guessing the next field, inventing dropdown options, or clicking business navigation as a fallback.

## Architecture

- `background/workflows.js` owns workflow ordering.
- `background/search-workflow.js` owns deterministic search-test decisions.
- `background/search-workflow-state.js` owns persisted workflow state.
- `background/search-workflow-history.js` owns history classification.
- `background/planner.js` still handles model calls, ReAct context requests, validation, and compact retries.
- `background/verifier.js` rejects field actions that accidentally close an active dialog, even if the field value appears to have changed.
- `content/action-select.js` owns dropdown, checkbox, and cascader execution, including dialog-safe popup dismissal.

The pre-model order is target URL, login, task navigation, then search-field testing. Timeout recovery order is unresolved task navigation, then constrained form-fill recovery. Search testing only runs after named task navigation targets are reached or when the task has no named business target.

## Search State Machine

The search workflow uses this phase sequence:

`select_field -> fill/open/select -> awaiting_submit -> awaiting_reset -> select_field -> completed`

Collapsed search panels are expanded first. Text fields are filled with deterministic test values derived from task credentials and field semantics. Selection fields are opened first; the workflow chooses only real candidates returned by the content action outcome or exposed field option labels. After each field is submitted, the workflow resets filters before moving to the next field.

## Form Timeout Recovery

When the text model times out on a create/add form, the form-fill workflow may recover only if the current page/module target is already reached and the observed business form fields can be matched to explicit task assignments.

The workflow may:

- Fill a single empty text field when the task names that field and value.
- Open a single empty dropdown field when the task names that field and requested value.
- Choose a visible dropdown option only when the option text is already present in the observed candidates.
- Select a cascader path parsed from the task, with path text cleaned of trailing punctuation.
- Click one current-form submit button only when recent form-fill recovery succeeded or all task-assigned fields are already satisfied in the active form.

If multiple submit candidates are equivalent, such as duplicate `保存` buttons in the same dialog region, the workflow may choose one stable candidate. If no stable form submit candidate exists, recovery may use a constrained vision target for the active form footer, but it must not click create-entry, search, reset, cancel, or navigation buttons.

## Safety Rules

- Never invent dropdown options such as `WEB`, `全部`, or `默认`.
- Never test a generic search area while a named business module is still unresolved.
- Model timeout recovery may stop with a clear failure, but it must not click business navigation, reopen a create entry as a submit action, or continue search tests on the wrong page.
- Dialog-anchored selection controls must not use Escape or blank-page clicks to dismiss popups; they should blur the field instead so a successful cascader selection does not close the modal.
- A field action that makes the dialog disappear unexpectedly must fail verification instead of being accepted as a successful value change.
- Loop guard remains a protection layer only; it does not drive workflow progress.

## Verification

Runtime contracts must cover deterministic search expansion, text-field fill, dropdown open/choose, submit/reset, completion, unresolved navigation suppression, form-fill timeout recovery, dialog-safe cascader dismissal, dialog-close rejection, duplicate submit candidates, and the active manifest version.
