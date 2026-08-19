# Sidepanel Conversation Polish Design

## Goal

Make the NaturalClick side panel feel like a focused AI assistant: compact chrome, a stable conversation title, immediate readable progress during execution, and scrolling confined to the current page content.

## Conversation Header

- Before the first prompt, the title is the localized "New conversation" label.
- The first non-empty user prompt becomes the session title after whitespace is collapsed.
- Titles use the first 15 Unicode characters and append `...` only when truncated.
- The title remains stable for the rest of the session and is reused in history.
- Runtime status must never replace the conversation title.

## Conversation Body

- Remove the current-session status card and the execution-summary/report block.
- Render the user's prompt immediately.
- While a task is active, render one assistant progress response with subtle motion and a plain-language current step derived from runtime events.
- Preserve the most recent meaningful phase across noisy streaming and evidence events so progress does not fall back to a generic processing label.
- Map interpretation, observation, command, and verification events to natural-language phases such as understanding the request, checking the page, performing an action, and confirming the result.
- Keep recent completed steps compact while running; detailed runtime events remain available in a collapsed "Execution details" section.
- Remove the separate model-output section. Model events remain visible inside execution details.
- Place execution details above the formal assistant reply.
- On completion, collapse transient progress and render the final assistant reply as a separate content block.
- Do not expose hidden chain-of-thought or raw planner reasoning.

## Composer

- Increase the textarea's comfortable minimum height and keep auto-resize bounded.
- Replace the heavy focus treatment with a restrained border and shadow.
- Close either composer popover on outside pointer interaction and Escape.
- Switching between the tools menu and model picker must be atomic and must not trigger an intermediate close render.
- Composer popover updates must not replay entrance animations on existing conversation content.
- Remove the CTX ring from the composer; context budgeting remains internal.

## Layout And Density

- Fix the shell to the side-panel viewport and prevent document-level vertical scrolling.
- Give only the active content region vertical overflow; keep the header and composer fixed.
- Reduce global header height and padding while preserving 24px icon targets.
- Tighten history header, list rows, toolbar, and footer.
- Tighten the settings-center header and surrounding whitespace without removing settings or status feedback.

## History Confirmation

- Render single-session deletion and clear-history confirmation in one centered modal instead of an inline alert.
- Keep the history page in place behind a restrained backdrop and do not shift list content when confirmation opens.
- Show the affected session title for single-session deletion and explain that deletion cannot be undone.
- Close on Cancel, backdrop interaction, or Escape; keep keyboard focus inside the modal while it is open.
- Use semantic dialog attributes and project-styled buttons instead of browser confirmation primitives.

## Defaults And Persistence

- Change the default page-marker mode from `Off` to `Focus` (localized as "Smart focus").
- Preserve an existing user's explicitly stored marker mode.
- Use the light theme when no theme preference has been stored.
- Preserve an existing user's explicitly stored light, dark, or system theme.

## Accessibility And Motion

- Preserve semantic buttons, labels, focus-visible states, and Escape behavior.
- Progress motion must stop under `prefers-reduced-motion: reduce`.
- Text must truncate or wrap without moving fixed controls.

## Verification

- Unit-test title derivation, stable header rendering, removed regions, event-driven progress projection, execution-detail ordering, terminal progress collapse, model-picker dismissal, and default settings resolution.
- Run typecheck, all unit tests, and the production build.
- Inspect desktop and narrow side-panel screenshots for scrolling, overlap, density, focus, and open-menu behavior.

## Release

- Raise the extension and package patch version to `0.1.195` for the history confirmation modal.
