# General Web Agent Roadmap

This document tracks the near-term plan for evolving NaturalClick Agent into a non-site-specific, self-correcting browser operation agent. Changes should improve general web behavior and must not depend on a specific site, business system, menu name, or form field name.

## Round 1: Task Intent And Navigation Recovery

Goal: for chained tasks such as “go to X, then do Y”, enter the target page first and only then perform the page-level operation.

- Strip process connectors from navigation targets. For example, “enter X then create” should normalize the navigation target to `X`.
- When direct observation and context lookup cannot find the target menu, avoid repeating the same context request. Instead, perform bounded exploration of visible collapsed menus, navigation groups, or more menus.
- Empty context responses should explicitly tell the planner to switch to real page actions, navigation exploration, or a clear failure instead of looping on the same query.
- Keep safety boundaries: only expand visible elements with navigation-container semantics, never text fields, dropdown options, table row actions, or form controls.

Validation focus:

- Chinese chained tasks no longer merge “after” connectors into the navigation target.
- Admin-style sidebars can explore visible navigation containers when the target child item is not directly visible.
- `query_no_match` does not become repeated context requests until the internal limit is reached.

## Round 2: Single-Session Task Variables And Cross-Tab Return

Goal: let the agent reuse information acquired during the current session for later page operations, especially across tabs.

- Record externally acquired values as current-task variables, such as usernames, verification codes, email addresses, prices, and order numbers.
- When the main task is create, edit, or form fill, an external search page only supplies field values and should not complete the whole task as an information summary.
- When a form needs an external lookup value, open the explicit search/source in a new tab so the main form tab remains available for return and submission.
- After returning to the main-task tab, prefer confirmed task variables and avoid reopening or re-querying the external source.
- Confirmed form completions are promoted into current-conversation `record_fact` entries from successfully filled fields, helping later “just created / previously filled” references.
- For price, market, currency, and unit-like evidence, prefer numeric values near price/unit context and demote dates, years, and time fragments.
- Keep variables scoped to the current side-panel conversation; do not create global long-term memory.

Validation focus:

- “Use information from site A to register/fill site B” can work across tabs.
- When a current-task value is already available on an external source tab, the agent returns to the open main-task tab before filling.
- “The record/value just created/found” can be referenced in the same conversation.
- Failed, unconfirmed, or validation-error create results are not treated as successful facts.
- A plain `done(success=true)` response is not enough to prove a form task succeeded; completion still needs submit, dialog-close, success feedback, or equivalent page-change evidence.

## Round 3: Mainstream Page Pattern Adaptation

Goal: cover more real-world layouts and component libraries without relying on one DOM shape.

- Navigation: sidebars, top nav, tree menus, collapsed drawers, tabs, breadcrumbs, and more menus.
- Forms: drawer forms, modal forms, grouped forms, required validation, async selects, placeholder selections, cascaders, and date-range pickers.
- Lists: horizontally scrollable tables, virtual lists, pagination, network samples, hidden columns, and row actions.
- Feedback: toasts, alerts, field errors, global errors, submit success with the dialog still open, and submit failure after partial refresh.
- Planning: when evidence is insufficient, gather interface/table/region evidence first; when evidence is sufficient, converge on an action or result summary.

Validation focus:

- Admin panels, SaaS consoles, CMS pages, and ecommerce back offices can progress with the same generic strategy.
- Search testing derives test values from list/API samples first, then resets and verifies each field.
- When page re-renders change DOM indexes, search fields migrate completed state by stable label/type so the same field is not tested again.
- Create/edit tasks judge success from submit feedback, page changes, or current validation state.
- Required select/cascader fields treat visible placeholder values such as “please select” as empty, then open the real candidate panel instead of guessing.
- Required selection fields with multiple real candidates ask the user to choose; only a single safe candidate may be auto-selected.
- Date-range pickers support same-day ranges by selecting the same real date option twice when the requested start and end dates are equal.
