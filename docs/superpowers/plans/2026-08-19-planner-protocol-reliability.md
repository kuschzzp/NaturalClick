# Planner Protocol Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one reliable Planner model layer supporting Responses, Chat Completions, and legacy Completions with strict contracts, normalized streaming, recovery, and precise errors.

**Architecture:** Provider-specific request and stream parsing lives behind focused model protocol helpers. Background orchestration selects a protocol and capability mode, executes bounded native-tool rounds, validates terminal output, and emits protocol-neutral runtime events.

**Tech Stack:** TypeScript, Chrome MV3 service worker, Fetch/SSE, Vitest, Vite.

## Global Constraints

- Preserve existing uncommitted task-tab and icon changes.
- Do not commit or push without explicit user permission.
- Keep Chat Completions and legacy Completions as supported protocols.
- Increase all four extension version declarations together.
- Use no new runtime dependency.

---

### Task 1: Protocol Types And Persisted Capabilities

**Files:**
- Modify: `src/core/model/model-instance.ts`
- Modify: `src/core/model/model-config-service.ts`
- Modify: `src/adapters/chrome/model-config-store.ts`
- Test: `tests/unit/core/model-config-service.test.ts`
- Test: `tests/unit/adapters/model-config-store.test.ts`

**Interfaces:**
- Produces: `ModelApiProtocol`, protocol and structured-output capability fields on model instances and runtime configs.

- [ ] Add failing persistence and runtime-resolution tests for `auto`, `responses`, `chat_completions`, and `completions`.
- [ ] Implement backward-compatible sanitization and defaults.
- [ ] Run the two focused test files.

### Task 2: Strict Planner Schema

**Files:**
- Create: `src/core/model/planner-schema.ts`
- Test: `tests/unit/core/planner-schema.test.ts`

**Interfaces:**
- Produces: `plannerResponseJsonSchema()` and `plannerResponseFormat()`.

- [ ] Add tests proving root object shape, closed properties, command enums, and nullable branch fields.
- [ ] Implement a strict-provider-compatible schema matching existing `validatePlannerTurn` inputs.
- [ ] Run the focused schema tests.

### Task 3: Unified Protocol Response And Stream Parsers

**Files:**
- Create: `src/core/model/model-protocol.ts`
- Create: `src/core/model/responses-streaming-client.ts`
- Modify: `src/core/model/openai-compatible.ts`
- Modify: `src/core/model/streaming-client.ts`
- Test: `tests/unit/core/model-protocol.test.ts`
- Test: `tests/unit/core/responses-streaming-client.test.ts`
- Test: `tests/unit/core/streaming-client.test.ts`

**Interfaces:**
- Produces: `ModelTurnResult`, `ModelStreamProgress`, Responses parser, Chat parser, and Completions text parser.

- [ ] Add SSE fixtures for reasoning summaries, output text, tool calls, usage, completed, incomplete, refusal, Chat finish reasons, and `choices[].text`.
- [ ] Implement terminal metadata and normalized progress without mixing reasoning into final content.
- [ ] Run focused parser tests.

### Task 4: Planner Protocol Orchestration

**Files:**
- Modify: `src/background/index.ts`
- Test: `tests/unit/background-planner-protocol.test.ts`

**Interfaces:**
- Consumes: protocol metadata, strict schema, normalized parser results.
- Produces: protocol selection, capability fallback, bounded output retry, empty-output retry, contract repair, and precise Planner errors.

- [ ] Add mocked-fetch tests for all three endpoints and request bodies.
- [ ] Add tests that fallback occurs only for explicit unsupported protocol/features.
- [ ] Add tests for truncation retry, refusal, empty output, tool rounds, and repair exhaustion.
- [ ] Replace the monolithic Chat-only request path with protocol-aware orchestration.
- [ ] Run focused background and Agent Runtime tests.

### Task 5: Runtime Events And User-Facing Diagnostics

**Files:**
- Modify: `src/sidepanel/state.ts`
- Modify: `src/sidepanel/runtime-issue.ts`
- Modify: `src/sidepanel/i18n.ts`
- Test: `tests/unit/sidepanel/state.test.ts`
- Test: `tests/unit/sidepanel/runtime-issue.test.ts`

**Interfaces:**
- Consumes: normalized model event payloads and specific Planner errors.
- Produces: reasoning-summary/content/tool display and actionable Chinese/English failure copy.

- [ ] Add tests for normalized progress and every new Planner failure reason.
- [ ] Update stream derivation and diagnostic classification.
- [ ] Run focused sidepanel tests.

### Task 6: Version, Build, And Full Verification

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `public/manifest.json`
- Generated: `naturalclick-extension/manifest.json`
- Generated: `naturalclick-extension/background.js`
- Generated: `naturalclick-extension/sidepanel.js`

**Interfaces:**
- Produces: installable extension version `0.1.203`.

- [ ] Raise all source version declarations to `0.1.203`.
- [ ] Run focused tests, `npm run typecheck`, and `npm run test:all`.
- [ ] Run `git diff --check` and inspect generated bundles for protocol/error markers.
- [ ] Confirm no temporary server or folder remains and report uncommitted status.
