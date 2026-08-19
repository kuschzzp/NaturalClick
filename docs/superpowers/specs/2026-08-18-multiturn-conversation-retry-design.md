# Multi-Turn Conversation And Retry Design

## Goal

Restore the intended conversation model: one session contains an ordered sequence of user/assistant turns, each turn owns one task execution, and retry replaces only the failed execution attempt for that turn.

## Domain Model

- A conversation session has one stable `sessionId` from creation until the user clicks New session.
- A turn has one `taskId`, one user prompt, one execution event log, and one assistant result/progress projection.
- `NEW_SESSION` is the only user action that detaches the current session.
- `START_TASK` starts a new turn: it reuses the active `sessionId` and creates a new `taskId`. If no active session exists, it creates both IDs for the first turn.
- `RETRY_TASK` addresses the current failed turn and preserves both IDs while replacing that turn's event log.

## Conversation UI

- Render every turn in chronological order as a user message followed by its assistant response.
- Keep completed, stopped, and failed earlier turns visible when a later turn starts.
- Only the latest active turn shows live progress and active controls.
- A failed turn shows `重新执行` below its formal reply. Clicking it immediately replaces that turn's failed projection with fresh live progress.
- Retry does not append another user message or assistant card and does not affect sibling turns.
- The conversation title remains derived from the first non-empty user prompt.

## Runtime And Protocol

- Extend `SessionStateResponse` with ordered turn logs while retaining `events` as the current-turn compatibility field.
- Add `RETRY_TASK` with expected `sessionId`, expected `taskId`, and current runtime/model/capability settings.
- `GET_SESSION_STATE` returns all task logs for the requested or active session, ordered by each task's first event timestamp.
- Runtime event broadcasts remain task-scoped; the side panel merges them into the matching turn.
- Retry validates identity and failed status, captures the original prompt and attachments, clears only the addressed task log, rebuilds its controller, and starts it again.

## Event Storage

- Add `loadSession(sessionId)` to return ordered task event groups.
- Add `clear(sessionId, taskId)` to remove exactly one task log.
- Keep per-task keys so retry and debugging remain isolated.
- Do not create a second task key during retry.

## Current-Session Context

- Add a bounded `conversationHistory` field to planner input.
- Before a new turn starts, derive history from the same session's completed prior turns.
- Include at most the latest 8 completed turns, each represented by one user prompt and one assistant summary.
- Cap each history message at 1,200 characters and omit raw events, debug traces, model output, failed attempts, and stopped attempts.
- Send this history with every planner call in the new turn so follow-up requests can resolve references such as “继续处理上一条结果”.
- Current-session context never crosses a `NEW_SESSION` boundary.

## Sidepanel State And Persistence

- Add an ordered `conversationTurns` projection to `SidepanelState`.
- Each turn stores `taskId`, task text, status, timeline, runtime events, active task projection, model stream, and update time.
- Keep the existing top-level active fields as compatibility projections of the latest turn while migration is in progress.
- Persist one `SessionRecord` per conversation with a `turns` array; title comes from the first turn, status comes from the latest turn, and event count is the sum of all turns.
- Read legacy single-turn records by wrapping their existing task/timeline/events fields into one turn.
- History list remains one row per session; history detail renders every turn in order.

## Retry Semantics

- Retry is available only for a failed turn and only when it is the current active task identity.
- Old failure events and trace are deleted before the replacement run starts.
- The original user prompt and attachments are reused.
- Browser-side effects from the discarded attempt are not rolled back; retry starts from the current page state.
- If the replacement run fails, only the new failure remains and Retry becomes available again.

## Error Handling

- A stale retry identity, non-failed status, or missing task prompt returns an error without clearing data.
- Starting a new turn while another turn is active continues to use `APPEND_INSTRUCTION`; it does not create a parallel turn.
- Failure to load older turn logs must not prevent the current turn from rendering or running.

## Verification

- Event-store tests cover session grouping, ordering, and exact task clearing.
- Protocol/background tests cover stable session identity, new task identity per turn, all-turn session responses, bounded history projection, and retry replacement.
- Runtime tests verify planner input receives bounded completed-turn history.
- Sidepanel tests verify two prompts remain visible, current runtime events update only their turn, legacy records migrate, and history aggregates turns.
- Render tests verify Retry appears only on failed turns and replaces rather than appends.
- Run typecheck, focused tests, the complete unit suite, and the production build.

## Release

- Raise package and extension versions from `0.1.196` to `0.1.197`.
