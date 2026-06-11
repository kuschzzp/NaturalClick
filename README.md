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

Current extension version: `0.6.60`. The source of truth is `naturalclick-extension/manifest.json`.

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

## Runtime And Planning Settings

The side panel **Execution Parameters** section controls the task loop, model wait time, observation context size, and when NaturalClick switches to compact observation context.

| Setting | Default | Range | Description |
|---|---:|---:|---|
| Max steps | `100` | `1-200` | Maximum Observe-Plan-Act steps for one task |
| Text model round timeout (seconds) | `60` | `8-180` | Maximum wait time for each text-planning model round |
| Full observation max chars | `262144` | `7600-1048576` | Maximum size of the full observation context |
| Compact observation max chars | `4200` | `1000-65536` | Maximum size of the compact observation summary, never above the full limit |
| Compact element threshold | `120` | `20-10000` | Switch to compact context when observed fields, actions, popups, and related items reach this count |
| Compact raw-candidate threshold | `80` | `20-10000` | Switch to compact context when raw candidate count reaches this value |

`Full observation max chars` is not the only compaction trigger. Even when the observation text is below that character limit, NaturalClick may start with compact context if the page has too many observed elements or raw candidates. This keeps large pages from drowning the planner in noisy candidates.

When the side panel shows progress like this:

```text
Observation is large, using compact context for model planning (trigger: raw=140/80; full≈15587 chars, compact≈8409 chars; model=...; wait up to 60 seconds)...
```

the round was triggered by the raw-candidate threshold, not by the full character limit. Adjust the matching threshold in settings, or use **Restore planning defaults** to return to the recommended values.

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

While waiting for the text model, the side panel first updates a **Model streaming output** trace card with received content/reasoning counts and a short preview. After the model finishes, NaturalClick records the final model-call details, action, and verification result.

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
│   ├── login-workflow.js            # Deterministic login workflow
│   ├── planner.js                   # Planner orchestration
│   ├── planner-context.js           # Observation compaction and context requests
│   ├── planner-model-client.js      # OpenAI-compatible model client
│   ├── planner-prompt.js            # Full and compact planner prompts
│   ├── planner-validation.js        # Tool/action validation and replanning hints
│   ├── search-workflow*.js          # Deterministic search/filter workflow
│   ├── session-engine.js            # Observe-plan-act loop
│   ├── session-*.js                 # Session lifecycle, timing, recovery, records
│   ├── tools.js                     # Planner-visible tool registry
│   ├── utils.js                     # Chrome/runtime helpers
│   ├── verifier.js                  # Post-action verification
│   ├── workflows.js                 # Pre-model and timeout workflow decisions
│   └── vision.js                    # Screenshot and coordinate fallback
├── content.js                       # Page-side bridge
├── content/
│   ├── action-*.js                  # DOM, input, selection, scroll action helpers
│   ├── actions.js                   # Page action router
│   ├── observer.js                  # DOM observation and semantic extraction
│   ├── verification.js              # Hit-test and input verification
│   └── visual.js                    # Index highlights and click feedback
├── shared/
│   ├── action-contract.js           # Structured action outcome contract
│   ├── control-semantics.js         # Shared control and field semantics
│   └── protocol.js                  # Shared message types and statuses
├── sidepanel.html                   # Side panel UI shell and styles
├── sidepanel.js                     # UI state, settings, history, traces
└── assets/                          # Extension icons

docs/
├── runtime-configuration-and-diagnostics.md        # Runtime and troubleshooting guide
├── runtime-configuration-and-diagnostics.zh-CN.md  # Chinese runtime and troubleshooting guide
└── superpowers/specs/                              # Design notes and historical specs
```

## Automation Capabilities

| Capability | Current Support |
|---|---|
| DOM indexing | Interactive elements, fields, labels, roles, placeholders, value state |
| Form understanding | Login fields, contact fields, structured selects, date/picker controls, native options, validation state, and labels |
| Selection controls | Explicit open/choose tools for selects, checkbox-like options, radio-like options, tree nodes, and Element-style dropdowns |
| Cascaders | Full-path cascader selection with parent hover, leaf click, and dialog-safe popup dismissal |
| Deterministic workflows | Target URL, login, task navigation, search/filter testing, and constrained form-fill timeout recovery |
| Cross-tab actions | Open, switch, and close tabs |
| Vision fallback | Screenshot-based coordinate selection with hit-test validation |
| Trace inspection | Model IO, streaming output, action inputs, outputs, verification failures, candidate diagnostics, exported session logs |
| Verification | Structured outcomes, loop guard, input/dropdown/cascader checks, form feedback recognition, and dialog-disappearance detection |
| Form feedback | Field validation, toast/alert/aria-live messages, submit success, duplicate, required, and format-error feedback |
| Stop handling | First-class `stopped` status instead of treating user stop as an error |

## Supported Actions

| Action | Description |
|---|---|
| `click_element_by_index` | Click an observed DOM element by index |
| `input_text` | Type text into an observed editable element |
| `open_dropdown` | Open a dropdown by field index and return visible real candidates |
| `choose_dropdown_option` | Choose a real visible dropdown option scoped to a field index |
| `select_checkbox_option` | Select a checkbox-like option by visible text |
| `select_cascader_path` | Select a cascader by full path, such as province/city/district |
| `hover_element_by_index` | Hover an observed element, mainly for menus and cascaders |
| `scroll` | Scroll the page or a target container vertically |
| `scroll_horizontally` | Scroll the page or a target container horizontally |
| `keypress` | Dispatch keyboard events to the active element with a declared target or purpose |
| `open_new_tab` | Open a URL in a new Chrome tab with declared target context |
| `switch_to_tab` | Switch to an existing tab with declared target context |
| `close_tab` | Close an existing tab with declared target and reason |
| `wait` | Wait briefly for async page, dialog, or dropdown changes with a declared reason |
| `ask_user` | Ask the user for missing information with a declared reason |
| `locate_by_vision` | Trigger semantic screenshot-based targeting for a click or input |
| `done` | End the task with a final message |

`select_dropdown_option` remains as a compatibility alias, but new planning prefers `open_dropdown` plus `choose_dropdown_option`. Coordinate click and coordinate input are used internally for vision fallback.

## Runtime Flow

```text
User task
  -> Side panel sends START_TASK
  -> Background prepares an automatable tab
  -> Content observer returns structured page state, field validation, and page feedback
  -> Deterministic workflows may handle URL, login, navigation, search, or safe form recovery
  -> Planner selects full or compact observation context and streams the text-model call
  -> Executor runs a browser or page action
  -> Verifier checks action outcomes, form feedback, and dialog state
  -> Timeout recovery may fill known form fields, resolve duplicate conflicts, or submit only a satisfied active form
  -> Vision fallback retries failed click/input actions
  -> Session trace updates the side panel
```

## Diagnostics And Troubleshooting

Session traces and exported logs are the primary debugging surface.

| Symptom | Meaning | What To Check |
|---|---|---|
| `Observation is large, using compact context...` | The current observation hit the text, element-count, or raw-candidate threshold | Check the progress details for `text=...`, `elements=...`, or `raw=...`, then adjust the matching setting |
| `First model round timed out, retrying with compact context...` | The full-context model call exceeded the per-round timeout | Increase the text model timeout, or lower observation context size |
| The streaming card shows counts but no final action | The model is still returning, or the final JSON has not completed | Wait for the round to finish; on timeout, inspect received content/reasoning counts |
| A form stays open after submit | The verifier did not observe success feedback, dialog close, page change, or a clear error | Inspect field `error`, `feedback`, toast/alert messages, and exported logs |
| Duplicate/already-exists feedback appears | Page feedback indicates a value conflict | NaturalClick tries to identify the conflicting field; if it cannot, it asks the user for a replacement value |

See [Runtime Configuration And Diagnostics](./docs/runtime-configuration-and-diagnostics.md) for a more detailed operating guide.

## Development

Run syntax checks from the repository root:

```bash
node --check naturalclick-extension/background.js
node --check naturalclick-extension/content.js
node --check naturalclick-extension/sidepanel.js
node -e "JSON.parse(require('fs').readFileSync('naturalclick-extension/manifest.json','utf8')); console.log('manifest ok')"
```

Run the runtime contract checks:

```bash
node scripts/validate-runtime-contracts.js
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
- Streaming model traces require an OpenAI-compatible endpoint that supports SSE streaming; unsupported providers fall back to normal JSON responses.
- There is no packaged release workflow yet.
- Runtime contract checks exist, but there is no full browser end-to-end regression suite yet.

## Roadmap

| Area | Planned Improvements |
|---|---|
| DOM recognition | Better duplicate filtering, stronger label binding, richer custom component metadata |
| Select controls | Broader custom multi-select and tree-select coverage |
| Verification | Browser fixture coverage for before/after observation diffs and click outcomes |
| Debugging | Trace replay, compact failure reports, and fixture-based reproductions |
| Packaging | Release workflow for installable Chrome extension builds |
| Privacy | Optional domain allowlist, clearer storage/history controls, and model-request redaction options |

## Contributing

Issues and pull requests are welcome.

Helpful contributions include:

- Reproducible automation failures with exported session traces
- DOM recognition improvements for specific component libraries
- Safer execution and verification policies
- UI/UX refinements for the side panel
- Documentation improvements and examples

Before submitting changes, run the syntax checks and runtime contract checks above, and keep unrelated edits separate.

## License

NaturalClick Agent is released under the [MIT License](./LICENSE).
