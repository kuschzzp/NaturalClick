# Planner Protocol Reliability Design

## Goal

Replace prompt-only Planner JSON generation with a provider-aware protocol layer that supports OpenAI Responses, Chat Completions, and legacy Completions while producing one validated internal Planner result.

## Protocols

- `responses`: `/responses`, strict JSON Schema, native function tools, typed stream events, explicit incomplete/refusal handling.
- `chat_completions`: `/chat/completions`, JSON Schema or JSON mode when supported, native tools, OpenAI-compatible SSE parsing, finish-reason handling.
- `completions`: `/completions`, compiled prompt, streamed `choices[].text`, local schema validation, no native tool assumption.
- `auto`: prefer Responses for OpenAI, otherwise Chat Completions, and fall back only on explicit unsupported-endpoint or unsupported-parameter responses. Cache the resolved protocol in memory for subsequent calls.

## Internal Contract

All adapters return a common model turn containing content, reasoning summary, tool calls, usage, response status, finish reason, and protocol metadata. Streaming progress is normalized before it reaches runtime events. A model result is accepted only after the protocol emits a terminal completion and the Planner contract validator accepts the parsed value.

The strict Planner schema remains compatible with the existing runtime contract. It constrains command types, risk, success criteria, observation requests, user questions, and completion responses. Dynamic command inputs are represented by a finite set of supported properties with `additionalProperties: false` for strict providers.

## Recovery

- Output-limit termination retries once with a larger bounded output budget.
- Empty output retries once without streaming.
- Parse or schema failure performs one isolated contract-repair request.
- Refusal and authentication failures are terminal.
- Native read-tool calls may continue for bounded rounds; browser mutations never happen inside model retries.
- Unsupported protocol features fall back within the selected adapter capability ladder, not on rate limits, authentication errors, timeouts, or server failures.

## Error Taxonomy

Use specific runtime reasons: `planner_output_truncated`, `planner_empty_output`, `planner_schema_violation`, `planner_refused`, `planner_tool_arguments_invalid`, `planner_provider_protocol_error`, `planner_transport_timeout`, and `planner_repair_exhausted`.

## Observability

Model events record protocol, response ID, completion status, finish reason, output/reasoning token usage, output size, tool rounds, and recovery attempt. Raw API keys and hidden reasoning are never persisted. User-visible reasoning is limited to provider-supported summaries.

## Compatibility

Existing stored model instances without protocol metadata resolve to `auto`. Existing `/chat/completions` behavior remains available. Legacy `/completions` providers retain text streaming and local contract repair but do not receive unsupported tools or structured-output parameters.

## Verification

Unit fixtures cover all three protocols, strict schema generation, stream normalization, truncation, refusal, empty output, tool calls, capability fallback, model-config persistence, runtime issue copy, and contract repair. Final verification runs typecheck, the complete unit suite, production build, and generated-extension inspection.
