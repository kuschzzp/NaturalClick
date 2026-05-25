<div align="center">

# NaturalClick Agent

**A DOM-first, vision-assisted Chrome side-panel agent for local browser automation.**

Give your browser an inspectable automation agent that can observe pages, plan actions with an OpenAI-compatible model, execute local Chrome actions, and fall back to visual coordinates when DOM control is not enough.

[简体中文](./README.zh-CN.md) · [License](./LICENSE) · [Extension](./naturalclick-extension) · [Issues](https://github.com/kuschzzp/NaturalClick/issues)

[![Chrome MV3](https://img.shields.io/badge/Chrome-MV3-4285F4)](./naturalclick-extension/manifest.json)
[![Side Panel](https://img.shields.io/badge/UI-Side%20Panel-10B981)](./naturalclick-extension/sidepanel.html)
[![DOM First](https://img.shields.io/badge/Automation-DOM--first-111827)](./naturalclick-extension/content/observer.js)
[![Vision Fallback](https://img.shields.io/badge/Fallback-Vision-7C3AED)](./naturalclick-extension/background/vision.js)
[![License: MIT](https://img.shields.io/badge/license-MIT-10B981)](./LICENSE)

</div>

---

## What Is NaturalClick Agent?

NaturalClick Agent is a Chrome extension that turns the browser side panel into a local browser-agent workspace.

It observes the active page through structured DOM extraction, sends the current browser state to a text model, receives a strict JSON action, executes that action locally in Chrome, and records every step as an inspectable session trace. When DOM-index execution fails, NaturalClick can capture the visible tab and ask a multimodal model or vision service for candidate coordinates.

This is **not** a stealth automation toolkit or a CAPTCHA bypass project. The goal is transparent, debuggable, user-controlled browser automation for real web workflows.

## Install

Clone the repository:

```bash
git clone https://github.com/kuschzzp/NaturalClick.git
cd NaturalClick
```

Load the extension in Chrome:

1. Open `chrome://extensions/`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `naturalclick-extension` directory.
5. Click the NaturalClick toolbar icon to open the side panel.

There is no build step yet. Chrome loads the extension source files directly.

## Configure Models

Open the side panel settings and configure OpenAI-compatible endpoints.

| Endpoint | Used For | Required |
|---|---|:---:|
| Text LLM | Main planner that returns strict JSON actions | Yes |
| Multimodal LLM | First vision fallback for screenshot-based coordinate location | Recommended |
| Vision Service | Second vision fallback when the multimodal result is uncertain | Optional |

Endpoint format:

```text
Base URL: https://api.openai.com/v1
Model:    your-model-name
API Key:  your-api-key
```

Settings are stored locally with `chrome.storage.local`.

## Quick Start

After loading the extension, open a normal web page and ask for a task:

```text
Open github.com and search for NaturalClick.
Go to this login page and find the registration entry.
Fill this form with test data but stop before submitting.
Search for the latest gold price and summarize the result.
```

NaturalClick will:

1. Observe the current tab and extract structured page state.
2. Ask the text model for the next action.
3. Execute DOM-first actions in the page or browser.
4. Verify selected results such as text input and scrolling.
5. Use vision fallback when DOM execution fails.
6. Save traces for debugging and replay-style inspection.

## What Is Included?

```text
naturalclick-extension/
├── manifest.json                    # Chrome MV3 manifest
├── background.js                    # Service worker entry and task startup
├── background/
│   ├── config.js                    # Local config normalization
│   ├── confirmation.js              # Risky-action confirmation
│   ├── constants.js                 # Runtime constants
│   ├── executor.js                  # Tab tools and page-action dispatch
│   ├── planner.js                   # Prompt construction and model calls
│   ├── session-engine.js            # Observe-plan-act loop
│   ├── utils.js                     # Chrome/runtime helpers
│   ├── verifier.js                  # Post-action verification
│   └── vision.js                    # Screenshot and coordinate fallback
├── content.js                       # Page-side bridge
├── content/
│   ├── actions.js                   # DOM and coordinate action execution
│   ├── observer.js                  # DOM observation and semantic extraction
│   ├── verification.js              # Hit-test and input verification
│   └── visual.js                    # Index highlights and click feedback
├── shared/
│   └── protocol.js                  # Shared message types and statuses
├── sidepanel.html                   # Side panel UI shell and styles
├── sidepanel.js                     # UI state, settings, history, traces
└── assets/                          # Extension icons
```

## Automation Capabilities

| Capability | Current Support |
|---|---|
| DOM indexing | Interactive elements, fields, labels, roles, placeholders, value state |
| Form understanding | Username, password, confirm password, phone, OTP, invite code, nickname, email, department, role, platform, region, date |
| Selection controls | Selects, checkbox-like options, radio-like options, tree nodes, Element Plus-style dropdowns |
| Cascaders | Parent hover to reveal the next level, leaf click for final selection |
| Cross-tab actions | Open, switch, and close tabs |
| Vision fallback | Screenshot-based coordinate selection with hit-test validation |
| Trace inspection | Model IO, action inputs, outputs, verification failures, exported session logs |
| Stop handling | First-class `stopped` status instead of treating user stop as an error |

## Supported Actions

| Action | Description |
|---|---|
| `click_element_by_index` | Click an observed DOM element by index |
| `input_text` | Type text into an observed editable element |
| `scroll` | Scroll the page or a target container |
| `keypress` | Dispatch keyboard events to the active element |
| `open_new_tab` | Open a URL in a new Chrome tab |
| `switch_to_tab` | Switch to an existing tab |
| `close_tab` | Close an existing tab |
| `done` | End the task with a final message |

Coordinate click and coordinate input are used internally for vision fallback.

## Runtime Flow

```text
User task
  -> Side panel sends START_TASK
  -> Background prepares an automatable tab
  -> Content observer returns structured page state
  -> Planner calls the text model
  -> Executor runs a browser or page action
  -> Verifier checks selected outcomes
  -> Vision fallback retries failed click/input actions
  -> Session trace updates the side panel
```

## Development

Run syntax checks from the repository root:

```bash
node --check naturalclick-extension/background.js
node --check naturalclick-extension/content.js
node --check naturalclick-extension/sidepanel.js
node -e "JSON.parse(require('fs').readFileSync('naturalclick-extension/manifest.json','utf8')); console.log('manifest ok')"
```

After editing extension files:

1. Reload NaturalClick from `chrome://extensions/`.
2. Refresh target pages so the latest content scripts are injected.
3. Re-run the task and inspect the session trace.

## Safety And Privacy

NaturalClick runs locally in your Chrome profile, but configured model endpoints may receive page summaries and screenshots.

Data that may be sent to model endpoints:

- Task text
- Current URL and page title
- Structured DOM summaries
- Recent execution history
- Screenshots when vision fallback is used

The extension requests broad permissions because it is intended to automate arbitrary user-selected pages. Use trusted model endpoints, avoid sensitive pages unless you understand the data flow, and manually review high-impact operations.

NaturalClick includes heuristic confirmation for risky actions such as delete, payment, purchase, transfer, publish, and similar intents. This is a safety layer, not a formal security boundary.

## Current Limitations

- CAPTCHA, SMS verification, banking, payment, and identity verification usually require manual intervention.
- Complex custom components may still need site-specific or framework-specific heuristics.
- Vision fallback depends on screenshot quality and model reliability.
- There is no packaged release workflow yet.
- There is no automated regression test suite yet.

## Roadmap

| Area | Planned Improvements |
|---|---|
| DOM recognition | Better duplicate filtering, stronger label binding, richer custom component metadata |
| Select controls | More deterministic multi-select, tree-select, and cascader behavior |
| Verification | Better before/after observation diffs and click outcome validation |
| Debugging | Trace replay, compact failure reports, and fixture-based reproductions |
| Packaging | Release workflow for installable Chrome extension builds |
| Privacy | Optional domain allowlist and clearer storage/history controls |

## Contributing

Issues and pull requests are welcome.

Helpful contributions include:

- Reproducible automation failures with exported session traces
- DOM recognition improvements for specific component libraries
- Safer execution and verification policies
- UI/UX refinements for the side panel
- Documentation improvements and examples

Before submitting changes, run the syntax checks above and keep unrelated edits separate.

## License

NaturalClick Agent is released under the [MIT License](./LICENSE).
