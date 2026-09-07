# Unit Suite Consolidation Design

## Goal

Reduce the unit-test suite from 58 files to at most 19 files without changing
production code, adding network access, or losing coverage for the extension's
high-risk behavior.

## Current Problems

- The suite contains 58 test files and approximately 18,175 lines.
- Many files contain one to three narrow assertions, while `agent-runtime`,
  `agent-speed-paths`, and the side-panel tests repeat the same behavior at
  several layers.
- Test data includes a real CRM login URL and CRM-specific labels. Neither is
  needed to prove generic browser navigation or sidebar recognition.

## Target Layout

The final suite contains these 19 test files:

1. `tests/unit/adapters/browser-actions.test.ts`
2. `tests/unit/adapters/chrome-persistence.test.ts`
3. `tests/unit/adapters/dom-observation.test.ts`
4. `tests/unit/adapters/model-client.test.ts`
5. `tests/unit/adapters/overlay.test.ts`
6. `tests/unit/build/manifest.test.ts`
7. `tests/unit/core/agent-runtime.test.ts`
8. `tests/unit/core/execution-lifecycle.test.ts`
9. `tests/unit/core/fast-paths.test.ts`
10. `tests/unit/core/model-configuration.test.ts`
11. `tests/unit/core/model-contracts.test.ts`
12. `tests/unit/core/model-streaming.test.ts`
13. `tests/unit/core/observation.test.ts`
14. `tests/unit/core/policy-security.test.ts`
15. `tests/unit/core/vision-tools.test.ts`
16. `tests/unit/sidepanel/configuration-state.test.ts`
17. `tests/unit/sidepanel/conversation-rendering.test.ts`
18. `tests/unit/sidepanel/runtime-feedback.test.ts`
19. `tests/unit/sidepanel/visual-preview.test.ts`

## Consolidation Rules

- Keep one representative test for each public behavior, error boundary, and
  security invariant. Preserve all recently added execution-budget and
  recovery coverage.
- Convert only near-identical fast-path and rendering cases into `test.each`
  tables. Keep distinct branching behavior as independent tests.
- Move small adapter and core test files into their named domain file. Remove
  their original files after the target test passes.
- Replace the real CRM login address with reserved `*.example.test` data.
  Remove the dedicated CRM fixture; the remaining DOM test uses inline generic
  business-navigation markup.
- Do not change source code under `src/`, extension behavior, manifests, or
  production build output as part of this work.

## Validation

- `rg` finds no public IP address or CRM product-specific URL in `tests/`.
- `find tests/unit -name '*.test.ts'` reports no more than 19 files.
- `npm run typecheck` and `npm run test:unit` pass.
- No test file imports another test file; all target files own their cases.

## Non-Goals

- Raising or measuring code-coverage percentages.
- Replacing Vitest or jsdom.
- Removing fixtures that still demonstrate a distinct DOM capability.
- Committing or pushing changes.
