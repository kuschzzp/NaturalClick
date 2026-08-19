# Sidepanel Conversation Polish Implementation Plan

> **For agentic workers:** Execute these checkbox steps in order in the current workspace. Do not create commits or push changes without explicit user permission.

**Goal:** Deliver a compact, responsive side panel with stable prompt-derived session titles, visible live execution progress, a more usable composer, and correctly scoped scrolling.

**Architecture:** Keep the existing DOM renderer and event projection. Add small pure state helpers for title derivation and progress projection, then simplify `render.ts` and apply a final CSS override layer that preserves existing tokens and controls.

**Tech Stack:** TypeScript, DOM APIs, Vitest, JSDOM, Vite, Chrome MV3.

## Global Constraints

- Do not commit or push Git changes.
- Preserve existing stored user settings.
- Do not expose hidden reasoning or raw chain-of-thought.
- Use only the content region for vertical scrolling.
- Respect reduced-motion preferences.
- Set all package and extension version sources to `0.1.195`.

---

### Task 1: Stable Conversation Titles And Marker Default

**Files:**
- Modify: `src/sidepanel/main.ts`
- Modify: `src/sidepanel/state.ts`
- Modify: `src/sidepanel/view-model.ts`
- Test: `tests/unit/sidepanel/state.test.ts`
- Test: `tests/unit/sidepanel/view-model.test.ts`

- [ ] Add a pure `deriveSessionTitle(prompt, fallback, limit = 15)` helper that collapses whitespace and truncates by Unicode code points.
- [ ] Use the first task prompt as the immutable session/history title.
- [ ] Change only the fallback page-marker mode to `Focus`; keep valid stored modes unchanged.
- [ ] Change only the fallback theme mode to `light`; keep valid stored theme modes unchanged.
- [ ] Run the focused state and view-model tests.

### Task 2: Conversation Progress Surface

**Files:**
- Modify: `src/sidepanel/render.ts`
- Modify: `src/sidepanel/state.ts`
- Modify: `src/sidepanel/i18n.ts`
- Test: `tests/unit/sidepanel/render.test.ts`

- [ ] Add failing render expectations for the absence of `.nc-task-summary` and `.nc-run-report`.
- [ ] Add pure event-phase projection that retains the latest meaningful interpretation, observation, execution, or verification phase across noisy model-stream and evidence events.
- [ ] Project an active task into one assistant progress response with a current readable status and compact recent completed steps.
- [ ] Remove the standalone model-output surface while retaining model events in the collapsed runtime trace.
- [ ] Rename the collapsed trace to "Execution details" and place it above the formal assistant reply.
- [ ] Separate terminal reply extraction from progress text and hide transient progress after successful completion.
- [ ] Add localized progress labels and run focused render tests.

### Task 3: Composer And Picker Interaction

**Files:**
- Modify: `src/sidepanel/render.ts`
- Modify: `src/sidepanel/main.ts`
- Modify: `public/sidepanel.css`
- Test: `tests/unit/sidepanel/render.test.ts`

- [ ] Remove `.nc-context-ring` from the composer renderer.
- [ ] Install one document-level outside-pointer and Escape dismissal path for both composer popovers, with listener cleanup.
- [ ] Treat clicks inside either composer control as an atomic menu switch instead of an outside dismissal.
- [ ] Prevent rerenders from replaying entrance animations on existing conversation content.
- [ ] Increase the textarea's bounded auto-resize range and refine the focus-visible treatment.
- [ ] Verify send, stop, attachment, tool menu, and model-picker actions remain available.

### Task 4: Viewport Scrolling And Page Density

**Files:**
- Modify: `public/sidepanel.css`
- Test: `tests/unit/sidepanel/visual-preview.test.ts`

- [ ] Lock `html`, `body`, `#app`, and `.nc-shell` to the side-panel block size and hide document overflow.
- [ ] Assign `overflow-y: auto` only to the active chat/history/settings content region.
- [ ] Reduce the global top bar height and spacing without shrinking icon targets below 24px.
- [ ] Tighten history page header, toolbar, session rows, actions, and footer.
- [ ] Tighten settings center header and panel spacing while preserving save state visibility.
- [ ] Add narrow-width rules for title truncation, composer wrapping, and settings collapse.

### Task 5: Verification And Build Artifact

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `public/manifest.json`
- Generated: `naturalclick-extension/*`

- [x] Raise source package and manifest versions to `0.1.195`.
- [x] Run `npm run test:all` and fix regressions in scope.
- [x] Run `npm run build` and verify the extension artifact matches the current source.
- [x] Start the preview only for visual verification, inspect desktop and narrow screenshots, then shut it down.
- [x] Scan changed UI files for `outline: none`, `transition: all`, document-level overflow, and default-looking unstyled product controls.

### Task 6: History Confirmation Modal

**Files:**
- Modify: `src/sidepanel/state.ts`
- Modify: `src/sidepanel/main.ts`
- Modify: `src/sidepanel/render.ts`
- Modify: `src/sidepanel/i18n.ts`
- Modify: `public/sidepanel.css`
- Test: `tests/unit/sidepanel/render.test.ts`

- [x] Replace inline history confirmation placement with one shell-level semantic modal.
- [x] Include the affected session title and irreversible-action copy for single-session deletion.
- [x] Add backdrop, Escape, initial focus, and keyboard focus containment behavior.
- [x] Reuse the modal for clear-history confirmation.
- [x] Run focused render tests and browser-check desktop and narrow side-panel widths.
