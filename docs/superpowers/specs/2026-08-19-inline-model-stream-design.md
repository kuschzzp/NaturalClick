# Inline Model Stream Design

## Goal

Remove the long silent period during planner calls by rendering the model's streamed output directly beneath the active model-call step inside Execution details.

## Behavior

- While a model call is streaming, Execution details opens automatically for the active turn.
- The current model-call step shows model identity, accumulated output, a streaming cursor, and received character count.
- The output stays inside Execution details and never becomes a separate conversation response.
- The stream viewport has a stable maximum height. It follows new output while pinned to the bottom and preserves manual upward scrolling across rerenders.
- Output is capped at 12,000 characters in the sidepanel projection.
- On model completion the cursor stops. On task completion Execution details returns to its collapsed state.
- Native tool calls with no text output show the called tool names when the model call completes.

## Runtime

- Merge small provider chunks before emitting `ModelCallProgress` events.
- Flush when at least 80 ms elapsed, a larger text batch accumulated, a tool name first appears, or the stream ends.
- Emit merged deltas instead of individual provider tokens so persistence and rendering remain bounded.
- Persist and broadcast the merged events through the existing event pipeline.

## Verification

- Unit tests cover accumulated stream derivation, inline rendering, automatic open/collapse behavior, output truncation, and tool-call fallback.
- Run typecheck, the full unit suite, production build, version checks, and the UI primitive anti-pattern scan.

## Release

- Raise package and extension versions from `0.1.197` to `0.1.198`.
