# Planner Timeout Resilience Implementation Plan

**Goal:** Replace the single Planner timeout with layered, activity-aware limits and visible runtime stages while preserving Responses, Chat Completions, and legacy Completions.

**Architecture:** A focused timeout helper owns first-response, stream-idle, per-request, and total Planner budgets. Protocol parsers report transport activity; background orchestration translates that activity into bounded timers and existing model progress events, while the sidepanel derives localized stage and elapsed-time UI from those events.

**Tech Stack:** TypeScript, Fetch/SSE, Chrome MV3 events, Vitest, Vite.

## Constraints

- Preserve all existing uncommitted changes.
- Do not commit or push.
- Keep all three model API protocols working.
- Do not add runtime dependencies.
- Increase package and extension versions to `0.1.204`.

## Tasks

1. Add a tested timeout policy for standard and reasoning models, including total-budget accounting.
2. Add request activity callbacks to Responses, Chat Completions, and legacy Completions stream parsing.
3. Replace the shared 60-second abort controller with per-request first-response, idle, and hard timers constrained by one total Planner deadline.
4. Emit protocol fallback, contract repair, waiting, reasoning, content, and tool stages with elapsed timing through existing model events.
5. Derive localized execution-detail stages and precise timeout diagnostics in the sidepanel.
6. Add timeout, parser activity, state, render, and error-copy regression tests.
7. Raise the version to `0.1.204`, run typecheck, all unit tests, production build, and diff checks.
