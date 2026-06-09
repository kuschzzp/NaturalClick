# Runtime Configuration And Diagnostics

This guide documents NaturalClick Agent 0.6.15 runtime settings, observation compaction, model streaming traces, and common troubleshooting workflows.

## Where Settings Live

Open the NaturalClick side-panel settings page and find **Execution Parameters**. Settings are stored locally in `chrome.storage.local` and survive extension reloads.

## Execution Parameters

| Setting | Default | Range | Effect |
|---|---:|---:|---|
| Max steps | `100` | `1-200` | Maximum task steps, used as a loop guard |
| Text model round timeout (seconds) | `60` | `8-180` | Maximum wait time for each text-planning model request |
| Full observation max chars | `262144` | `7600-1048576` | Maximum size of the full page observation context |
| Compact observation max chars | `4200` | `1000-65536` | Maximum size of the compact observation context |
| Compact element threshold | `120` | `20-10000` | Start with compact context when structured page items reach this count |
| Compact raw-candidate threshold | `80` | `20-10000` | Start with compact context when raw candidates reach this count |

Click **Restore planning defaults** to reset the text-model timeout and all observation-context thresholds.

## How Observation Compaction Starts

NaturalClick first observes the page and builds structured context. The planner may use full context or compact context.

Compact context can start for three independent reasons:

- Observation text reaches `Full observation max chars`.
- Structured fields, actions, popups, panels, and candidates reach `Compact element threshold`.
- Raw candidates reach `Compact raw-candidate threshold`.

This means a large `Full observation max chars` value does not disable compaction by itself. For example, if progress shows `raw=140/80`, the trigger was raw-candidate count, not text length.

## Reading Progress Messages

```text
Observation is large, using compact context for model planning (trigger: raw=140/80; full≈15587 chars, compact≈8409 chars; elements=93, raw=140; model=...; wait up to 60 seconds)...
```

The details mean:

- `raw=140/80`: 140 raw candidates, threshold 80.
- `full≈15587 chars`: full observation text length.
- `compact≈8409 chars`: compact observation text length.
- `elements=93, raw=140`: observed page scale.
- `wait up to 60 seconds`: current text-model round timeout.

```text
First model round timed out, retrying with compact context (reason: full-context timeout; full≈...; compact≈...; model=...; wait up to 60 seconds)...
```

This means the full-context request timed out and the planner is retrying once with compact context.

## Model Streaming Traces

Text planning uses OpenAI-compatible SSE streaming by default. The side panel keeps one **Model streaming output** card updated instead of appending one card per chunk.

The card shows:

- Received content character count.
- Received reasoning-summary character count, when provided by the model.
- Chunk count.
- A short current preview.

After the model finishes, NaturalClick still records the final model-call card with request summary, response summary, model thought/reasoning, action, and verification result.

If a provider does not support streaming but returns a normal JSON response, NaturalClick falls back to non-streaming response handling.

## Form Validation And Duplicate Feedback

The observer collects generic field-level validation and page feedback, including:

- Native HTML `validationMessage`.
- `aria-invalid`, `aria-errormessage`, and `aria-describedby`.
- Common form error nodes from Element, Ant Design, Naive UI, Bootstrap-style forms, and similar UI libraries.
- Toast, alert, and aria-live global feedback.

After form submission, the verifier prioritizes this feedback. If a dialog stays open and there is no success feedback, page change, dialog close, or clear error, NaturalClick will not treat the submit as successful.

For duplicate, already-exists, and unique-constraint feedback:

- If the conflicting field is identifiable, the agent may correct that field.
- If the task allows arbitrary or test values, the agent may generate a non-conflicting replacement.
- If the user explicitly specified the value and replacement is unsafe, the agent asks the user.
- If the next error changes to a format, required, or other validation error, the agent should replan from the new feedback instead of repeating the previous duplicate-value strategy.

## Common Issues

| Issue | Likely Cause | Suggested Check |
|---|---|---|
| Large max observation chars is configured, but compact context still starts | Element or raw-candidate threshold was hit | Check progress details for `elements=.../...` or `raw=.../...` |
| Planning appears stuck while waiting for the model | Slow model response, slow first token, or very large context | Increase round timeout and check whether the streaming card receives content |
| A form saved successfully but verification failed | The page did not expose clear success feedback or observable dialog/list changes | Export logs and inspect post-submit `feedback`, field `error`, and DOM summaries |
| A record was created but the agent tries to create again | Success evidence was insufficient or the history did not identify completion | Inspect verifier evidence and consider adding more observable success feedback to logs |
| First error is duplicate, second error is a format validation error | The latest feedback must drive a fresh plan | Inspect the newest `feedback` and confirm the agent read the changed error |

## Useful Log Contents

For difficult pages, exported logs should include:

- Current task text.
- Observation summary for each step.
- The `feedback` section.
- Field `invalid` and `error` attributes.
- Model request diagnostics.
- Model streaming output card.
- Action result and verifier decision.

If this is not enough to debug a case, prefer improving generic observer or verifier diagnostics over adding site-specific logic. NaturalClick is intended to remain a generic browser web-operation agent.
