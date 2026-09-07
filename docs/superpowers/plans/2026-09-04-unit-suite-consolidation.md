# Unit Suite Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the unit suite from 58 files to 19 focused domain test files while retaining representative high-risk coverage and removing real CRM test data.

**Architecture:** Test code is regrouped by the behavior it verifies, not by the production file it imports. Small files are folded into their domain suite; repeated fast-path and rendering cases become data tables only when their assertions and setup are identical.

**Tech Stack:** TypeScript, Vitest 2, jsdom, Vite 5.

**Spec:** `docs/superpowers/specs/2026-09-04-unit-suite-consolidation-design.md`

## Global Constraints

- The final `tests/unit` tree contains exactly the 19 files listed in the spec.
- Do not modify `src/`, `public/`, `naturalclick-extension/`, dependency metadata, or manifests.
- Use only reserved `*.example.test` URLs in test data; no real public IPs or CRM-specific application labels.
- Do not commit or push changes.

---

## Execution Result

Completed on 2026-09-04:

- Reduced `tests/unit` from 58 files to the 19 target files listed in the
  spec, retaining the representative runtime, model, observation, policy,
  side-panel, adapter, and manifest suites.
- Preserved the recently added execution-budget continuation assertions in
  `execution-lifecycle.test.ts`, including resumed-budget and recovery cases.
- Deleted the CRM-specific fixture and replaced the real login URL with
  `https://workspace.example.test/#/login`.
- Removed CRM naming from retained test DOM data.
- Verified with `npm run typecheck` and `npm run test:unit`: 19 files and 376
  tests pass.

---

### Task 1: Remove CRM-Specific Test Data

**Files:**
- Delete: `tests/fixtures/pages/crm-sidebar.html`
- Modify: `tests/unit/adapters/dom-observation.test.ts`
- Modify: `tests/unit/core/agent-runtime.test.ts`
- Modify: `tests/unit/core/model-contracts.test.ts`
- Modify: `tests/unit/core/fast-paths.test.ts`

- [x] Remove the dedicated CRM fixture and rename retained DOM menu classes to
  generic business-navigation names.
- [x] Replace `http://116.205.97.39:8201/#/login` with
  `https://workspace.example.test/#/login` in the direct-navigation tests.
- [x] Scan `tests/` for `116.205.97.39` and `CRM`.

### Task 2: Consolidate Adapter Tests

**Files:**
- Create: `tests/unit/adapters/browser-actions.test.ts`
- Create: `tests/unit/adapters/chrome-persistence.test.ts`
- Create: `tests/unit/adapters/dom-observation.test.ts`
- Create: `tests/unit/adapters/model-client.test.ts`
- Create: `tests/unit/adapters/overlay.test.ts`
- Delete: all superseded files in `tests/unit/adapters/`
- Delete: `tests/unit/shared/overlay-targets.test.ts`

- [ ] Fold browser action, Chrome storage, DOM observation, model client, and
  overlay tests into the five target files.
- [ ] Retain adapter error handling, storage migration, cancellation, and DOM
  role-recognition assertions; remove only exact duplicate setup-and-assertion
  paths.
- [ ] Run each target adapter file before deleting its source files.

### Task 3: Consolidate Core Tests

**Files:**
- Keep or create the nine core files listed in the spec.
- Delete: superseded files in `tests/unit/core/`.

- [ ] Put command execution and task-loop tests in `agent-runtime.test.ts`.
- [ ] Put execution budgets, recovery, controller, session transitions, event
  derivation, and health tests in `execution-lifecycle.test.ts`.
- [ ] Reduce navigation, input, scrolling, and search fast paths to parameter
  tables in `fast-paths.test.ts`, retaining one test per distinct primitive and
  fallback path.
- [ ] Group provider selection, config persistence, protocol resolution, and
  capability validation in `model-configuration.test.ts`.
- [ ] Group contract validation, schemas, native tools, and verifier-memory
  outcomes in `model-contracts.test.ts`.
- [ ] Group Responses/Chat/Completions parsing and timeout classification in
  `model-streaming.test.ts`.
- [ ] Group Page Atlas, indexes, progressive observation, evidence, and
  generic fixtures in `observation.test.ts`.
- [ ] Group policy, redaction, and architecture-boundary assertions in
  `policy-security.test.ts`.
- [ ] Group vision normalization, tool registration, and tool execution loop
  tests in `vision-tools.test.ts`.
- [ ] Run every core target test file after its source files are removed.

### Task 4: Consolidate Side Panel Tests

**Files:**
- Create: `tests/unit/sidepanel/configuration-state.test.ts`
- Create: `tests/unit/sidepanel/conversation-rendering.test.ts`
- Create: `tests/unit/sidepanel/runtime-feedback.test.ts`
- Keep: `tests/unit/sidepanel/visual-preview.test.ts`
- Delete: superseded side-panel test files.

- [ ] Combine model settings, state transformations, and view-model tests in
  `configuration-state.test.ts`.
- [ ] Combine conversation rendering and DOM-preservation regressions in
  `conversation-rendering.test.ts`; parameterize only equivalent rendering
  inputs.
- [ ] Keep suspension/recovery presentation in `runtime-feedback.test.ts`.
- [ ] Run the four target files after removing the previous files.

### Task 5: Verify the Contract

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`

- [ ] Update the test description to state that unit tests are consolidated by
  behavior and contain no real third-party application addresses.
- [ ] Verify the test-file count is 19.
- [ ] Run `npm run typecheck` and `npm run test:unit`.
- [ ] Confirm the only changed files are tests, generic fixtures, and the two
  README files, then inspect `git diff --check`.
