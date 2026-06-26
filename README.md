# NaturalClick Agent

NaturalClick Agent is a clean-rewrite Chrome MV3 browser operation Agent.

## Status

This branch contains the first-version implementation line. It focuses on a DOM-first, vision-assisted Agent Core, adaptive side panel, page overlay, scoped safety, current-session memory, and traceable execution.

## Install

```bash
npm install
```

## Test

```bash
npm run typecheck
npm run test:unit
npm run build
```

## Build

```bash
npm run build
```

Load the committed `naturalclick-extension` folder in `chrome://extensions` using "Load unpacked".
Developers only need to run `npm run build` after changing source files to refresh that installable folder.

## First-Version Scope

- General browser operation.
- Lightweight form fill and submit with scoped consent.
- DOM-first observation and semantic command binding.
- First-stage vision grounding and visual verification.
- Adaptive conversational side panel.
- Overlay modes: Off, Focus, All Targets, Evidence, Vision.
- Current-session history and trace export.

## Safety And Privacy Defaults

- Safety mode defaults to `balanced`.
- Raw model requests and responses are not stored by default.
- Screenshot images are not stored by default.
- Sensitive values are redacted by default.
- Overlay Off does not disable Agent observation.
