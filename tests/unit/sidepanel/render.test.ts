import { describe, expect, it, vi } from "vitest";
import type { AgentEvent, AgentEventType } from "../../../src/core/events/events";
import { renderSidepanel } from "../../../src/sidepanel/render";
import type { SidepanelState } from "../../../src/sidepanel/state";

function baseState(overrides: Partial<SidepanelState> = {}): SidepanelState {
  return {
    mode: "conversation",
    view: "chat",
    overlayMode: "Off",
    safetyMode: "balanced",
    modelConfigured: true,
    traceOpen: false,
    ...overrides
  };
}

function event(type: AgentEventType, payload: Record<string, unknown> = {}, overrides: Partial<AgentEvent> = {}): AgentEvent {
  return {
    id: `event-${type}-${overrides.timestamp ?? 1}`,
    sessionId: "session-1",
    taskId: "task-1",
    stepId: "step-1",
    type,
    timestamp: 1,
    payload,
    visibility: "debug",
    correlationId: "step-1",
    ...overrides
  };
}

describe("sidepanel render", () => {
  it("renders the conversation home in English by default", () => {
    const root = document.createElement("main");

    renderSidepanel(root, baseState({ modelConfigured: false, activityText: "Waiting for a task..." }));

    expect(root.textContent).toContain("Task Chat");
    expect(root.textContent).toContain("Idle");
    expect(root.textContent).toContain("Ready for a browser task");
    expect(root.textContent).toContain("Model setup required");
    expect(root.querySelector(".nc-activity-bar")).toBeNull();
    expect(root.querySelector(".nc-app-header")).not.toBeNull();
    expect(root.querySelector(".nc-session-title__logo")).not.toBeNull();
    expect(root.querySelector(".nc-session-title__text")?.textContent).toBe("Task Chat");
    expect(root.querySelector(".nc-status-pill")).not.toBeNull();
    expect(root.querySelector(".nc-chat-surface")).not.toBeNull();
    expect(root.querySelector(".nc-chat-surface__header")?.textContent).toContain("Current session");
    expect(root.querySelector(".nc-chat-surface__header")?.textContent).toContain("Ready");
    expect(root.querySelector(".nc-chat-surface__status")?.textContent).toBe("Idle");
    expect(root.querySelector(".nc-empty-state h1")?.textContent).toBe("Ready for a browser task");
    expect(root.querySelector(".nc-empty-state p")?.textContent).toBe("Current page context, actions, and extracted results stay together in this session.");
    expect(root.querySelector(".nc-empty-state__logo")).toBeNull();
    expect(root.querySelector(".nc-empty-state__head")).toBeNull();
    expect(root.querySelector(".nc-empty-state__card")).toBeNull();
    expect(root.querySelector(".nc-empty-state__footer")).toBeNull();
    const newSessionButton = root.querySelector('button[aria-label="New session"]');
    expect(newSessionButton).not.toBeNull();
    expect(newSessionButton?.classList.contains("nc-top-icon")).toBe(true);
    expect(newSessionButton?.classList.contains("nc-top-icon--new-session")).toBe(true);
    expect(newSessionButton?.textContent).toBe("New");
    expect(newSessionButton?.innerHTML).toContain('d="M12 5v14"');
    expect(root.querySelector('button[aria-label="History"]')).not.toBeNull();
    expect(root.querySelector('button[aria-label="Settings"]')).not.toBeNull();
    expect((root.querySelector('button[aria-label="Schedules"]') as HTMLButtonElement).disabled).toBe(false);
    expect((root.querySelector('button[aria-label="Theme: system"]') as HTMLButtonElement).disabled).toBe(false);
    expect(root.querySelector(".nc-composer-frame")).not.toBeNull();
    expect(root.querySelector(".nc-composer-frame textarea")).not.toBeNull();
    expect(root.querySelector(".nc-composer__controls-left .nc-composer-toolbox")).not.toBeNull();
    expect(root.querySelector(".nc-composer__controls-right .nc-model-picker-wrap")).not.toBeNull();
    expect(root.querySelector(".nc-composer-meta")).not.toBeNull();
    expect(root.querySelector('button[aria-label="Open model settings"]')).not.toBeNull();
    expect(root.querySelector('button[aria-label="Tools"]')).not.toBeNull();
    expect(root.querySelector(".nc-composer__controls-right .nc-context-ring")).not.toBeNull();
    expect(root.querySelector("textarea")?.getAttribute("placeholder")).toBe("Tell NaturalClick what to do, or type / for skills...");
  });

  it("renders Pie-like composer popovers when opened", () => {
    const root = document.createElement("main");

    renderSidepanel(
      root,
      baseState({
        composerInput: "Open the account settings page",
        toolMenuOpen: true,
        modelPickerOpen: true,
        modelSettings: {
          providerBaseUrl: "https://api.openai.com/v1",
          apiKey: "sk-test",
          plannerModel: "gpt-4.1-mini",
          visionModel: "",
          apiKeyRef: "naturalclick:model-api-key"
        },
        detectedModels: ["gpt-4.1-mini", "gpt-4.1"]
      })
    );

    expect(root.querySelector(".nc-tools-menu")).not.toBeNull();
    expect((root.querySelector("textarea") as HTMLTextAreaElement)?.value).toBe("Open the account settings page");
    expect(root.textContent).toContain("Pick element");
    expect(root.textContent).toContain("Attach file");
    expect((Array.from(root.querySelectorAll(".nc-tools-menu__item")) as HTMLButtonElement[]).find((item) => item.textContent?.includes("Attach file"))?.disabled).toBe(
      false
    );
    expect(root.querySelector(".nc-model-popover")).not.toBeNull();
    expect(root.textContent).toContain("SELECT MODEL");
    expect(root.textContent).toContain("Model picker");
    expect(Array.from(root.querySelectorAll(".nc-model-popover__item")).map((node) => node.textContent)).toEqual(["gpt-4.1-mini", "gpt-4.1"]);
  });

  it("routes model picker management directly to the model config editor", () => {
    const root = document.createElement("main");
    const onOpenModelConfigEditor = vi.fn();
    const onOpenSettings = vi.fn();

    renderSidepanel(
      root,
      baseState({
        modelPickerOpen: true,
        modelSettings: {
          providerBaseUrl: "https://api.example.com/v1",
          apiKey: "sk-test",
          plannerModel: "qwen-max",
          visionModel: "",
          apiKeyRef: "naturalclick:model-api-key"
        },
        detectedModels: ["qwen-max"]
      }),
      { onOpenModelConfigEditor, onOpenSettings }
    );

    const manage = Array.from(root.querySelectorAll<HTMLButtonElement>(".nc-model-popover .nc-quiet-button")).find((button) => button.textContent === "Manage");
    manage?.click();

    expect(onOpenModelConfigEditor).toHaveBeenCalledTimes(1);
    expect(onOpenSettings).not.toHaveBeenCalled();
  });

  it("preserves settings scroll position and focused field across settings rerenders", () => {
    const root = document.createElement("main");
    document.body.append(root);
    const state = baseState({
      view: "settings",
      settingsTab: "configs",
      modelConfigWizardOpen: true,
      modelSettings: {
        providerBaseUrl: "https://api.example.com/v1",
        apiKey: "sk-test",
        plannerModel: "qwen-max",
        visionModel: "",
        apiKeyRef: "naturalclick:model-api-key"
      },
      detectedModels: ["qwen-max"]
    });

    renderSidepanel(root, state);
    const page = root.querySelector<HTMLElement>(".nc-page-view");
    const provider = root.querySelector<HTMLInputElement>('[data-nc-field-key="model-provider-base-url"]');
    expect(page).not.toBeNull();
    expect(provider).not.toBeNull();
    page!.scrollTop = 240;
    provider!.focus();
    provider!.setSelectionRange(8, 8);

    renderSidepanel(root, {
      ...state,
      modelSettings: {
        ...state.modelSettings!,
        providerBaseUrl: "https://new.example.com/v1"
      }
    });

    const nextPage = root.querySelector<HTMLElement>(".nc-page-view");
    const nextProvider = root.querySelector<HTMLInputElement>('[data-nc-field-key="model-provider-base-url"]');
    expect(nextPage?.scrollTop).toBe(240);
    expect(document.activeElement).toBe(nextProvider);
    expect(nextProvider?.selectionStart).toBe(8);
    root.remove();
  });

  it("falls back to opening settings from the model picker when no editor handler is provided", () => {
    const root = document.createElement("main");
    const onOpenSettings = vi.fn();

    renderSidepanel(
      root,
      baseState({
        modelPickerOpen: true,
        modelSettings: {
          providerBaseUrl: "https://api.example.com/v1",
          apiKey: "sk-test",
          plannerModel: "qwen-max",
          visionModel: "",
          apiKeyRef: "naturalclick:model-api-key"
        },
        detectedModels: ["qwen-max"]
      }),
      { onOpenSettings }
    );

    const manage = Array.from(root.querySelectorAll<HTMLButtonElement>(".nc-model-popover .nc-quiet-button")).find((button) => button.textContent === "Manage");
    manage?.click();

    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it("attaches files from the tools menu and renders removable pending attachments", () => {
    const root = document.createElement("main");
    const onAttachFiles = vi.fn();
    const onRemoveAttachment = vi.fn();

    renderSidepanel(
      root,
      baseState({
        toolMenuOpen: true,
        pendingAttachments: [
          {
            id: "attachment-1",
            filename: "brief.pdf",
            mime: "application/pdf",
            size: 2_400_000,
            createdAt: 1
          }
        ]
      }),
      { onAttachFiles, onRemoveAttachment }
    );

    const attach = (Array.from(root.querySelectorAll(".nc-tools-menu__item")) as HTMLButtonElement[]).find((item) => item.textContent?.includes("Attach file"));
    const fileInput = root.querySelector<HTMLInputElement>(".nc-file-input");
    expect(attach?.disabled).toBe(false);
    expect(attach?.textContent).toContain("1 files");
    expect(fileInput?.type).toBe("file");
    expect(fileInput?.multiple).toBe(true);

    const file = new File(["hello"], "notes.txt", { type: "text/plain" });
    Object.defineProperty(fileInput, "files", { configurable: true, value: [file] });
    fileInput?.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onAttachFiles).toHaveBeenCalledWith([file]);

    expect(root.querySelector(".nc-attachment-list")?.getAttribute("aria-label")).toBe("Attached files");
    expect(root.textContent).toContain("FILES · 1 files");
    expect(root.textContent).toContain("brief.pdf");
    expect(root.textContent).toContain("application/pdf · 2.3 MB");
    const remove = root.querySelector<HTMLButtonElement>('button[aria-label="Remove brief.pdf"]');
    expect(remove).not.toBeNull();
    remove?.click();
    expect(onRemoveAttachment).toHaveBeenCalledWith("attachment-1");
    expect(root.querySelector("textarea")?.value).toBe("");
  });

  it("renders generated artifacts above the composer with download actions", () => {
    const root = document.createElement("main");
    const onDownloadArtifact = vi.fn();

    renderSidepanel(
      root,
      baseState({
        generatedArtifacts: [
          {
            id: "artifact-1",
            filename: "report.md",
            mime: "text/markdown",
            size: 128,
            createdAt: 1,
            textPreview: "# Report",
            textTruncated: false,
            source: "browser summary"
          }
        ]
      }),
      { onDownloadArtifact }
    );

    expect(root.querySelector(".nc-composer")?.classList.contains("nc-composer--has-pending")).toBe(true);
    expect(root.querySelector(".nc-artifact-list")?.getAttribute("aria-label")).toBe("Generated artifacts");
    expect(root.textContent).toContain("ARTIFACTS · 1 files");
    expect(root.textContent).toContain("GENERATED BY AGENT");
    expect(root.textContent).toContain("report.md");
    expect(root.textContent).toContain("text/markdown · 128 B");

    const download = root.querySelector<HTMLButtonElement>('button[aria-label="Download report.md"]');
    expect(download).not.toBeNull();
    expect(download?.textContent).toBe("Download");
    download?.click();
    expect(onDownloadArtifact).toHaveBeenCalledWith("artifact-1");
  });

  it("keeps the composer model picker scrollable without truncating detected models", () => {
    const root = document.createElement("main");
    const detectedModels = Array.from({ length: 12 }, (_, index) => `provider-model-${index + 1}`);

    renderSidepanel(
      root,
      baseState({
        modelPickerOpen: true,
        modelSettings: {
          providerBaseUrl: "https://api.example.com/v1",
          apiKey: "sk-test",
          plannerModel: "provider-model-10",
          visionModel: "",
          apiKeyRef: "naturalclick:model-api-key"
        },
        detectedModels
      })
    );

    const list = root.querySelector(".nc-model-popover__list");
    const items = Array.from(root.querySelectorAll(".nc-model-popover__item"));
    expect(list?.getAttribute("role")).toBe("listbox");
    expect(items).toHaveLength(12);
    expect(items.map((node) => node.textContent)).toContain("provider-model-12");
    expect(root.querySelector('.nc-model-popover__item[aria-selected="true"]')?.textContent).toBe("provider-model-10");
  });

  it("filters non-agent detected models out of the composer model picker", () => {
    const root = document.createElement("main");

    renderSidepanel(
      root,
      baseState({
        modelPickerOpen: true,
        modelSettings: {
          providerBaseUrl: "https://api.example.com/v1",
          apiKey: "sk-test",
          plannerModel: "deepseek-chat",
          visionModel: "",
          apiKeyRef: "naturalclick:model-api-key"
        },
        detectedModels: ["cosyvoice-v3-flash", "qwen-image", "qwen3-asr-flash", "deepseek-chat", "qwen-max", "gpt-4o-mini"]
      })
    );

    const labels = Array.from(root.querySelectorAll(".nc-model-popover__item")).map((node) => node.textContent);
    expect(labels).toEqual(["deepseek-chat", "qwen-max", "gpt-4o-mini"]);
    expect(labels).not.toContain("cosyvoice-v3-flash");
    expect(labels).not.toContain("qwen-image");
    expect(labels).not.toContain("qwen3-asr-flash");
  });

  it("routes composer model choices through the quick-pick handler", () => {
    const root = document.createElement("main");
    const onPickPlannerModel = vi.fn();
    const onModelSettingChange = vi.fn();

    renderSidepanel(
      root,
      baseState({
        modelPickerOpen: true,
        modelSettings: {
          providerBaseUrl: "https://api.example.com/v1",
          apiKey: "sk-test",
          plannerModel: "provider-model-1",
          visionModel: "",
          apiKeyRef: "naturalclick:model-api-key"
        },
        detectedModels: ["provider-model-1", "provider-model-2"]
      }),
      {
        onPickPlannerModel,
        onModelSettingChange
      }
    );

    (root.querySelectorAll(".nc-model-popover__item")[1] as HTMLButtonElement).click();

    expect(onPickPlannerModel).toHaveBeenCalledWith("provider-model-2");
    expect(onModelSettingChange).not.toHaveBeenCalled();
  });

  it("filters composer model picker choices by query", () => {
    const root = document.createElement("main");

    renderSidepanel(
      root,
      baseState({
        modelPickerOpen: true,
        modelPickerQuery: "coder",
        modelSettings: {
          providerBaseUrl: "https://api.example.com/v1",
          apiKey: "sk-test",
          plannerModel: "qwen-max",
          visionModel: "",
          apiKeyRef: "naturalclick:model-api-key"
        },
        detectedModels: ["qwen-max", "qwen-coder-plus", "deepseek-chat"]
      })
    );

    expect((root.querySelector(".nc-model-popover__search-input") as HTMLInputElement).value).toBe("coder");
    expect(Array.from(root.querySelectorAll(".nc-model-popover__item")).map((node) => node.textContent)).toEqual(["qwen-coder-plus"]);
  });

  it("reports empty composer model picker search results", () => {
    const root = document.createElement("main");

    renderSidepanel(
      root,
      baseState({
        modelPickerOpen: true,
        modelPickerQuery: "vision-only",
        modelSettings: {
          providerBaseUrl: "https://api.example.com/v1",
          apiKey: "sk-test",
          plannerModel: "qwen-max",
          visionModel: "",
          apiKeyRef: "naturalclick:model-api-key"
        },
        detectedModels: ["qwen-max", "deepseek-chat"]
      })
    );

    expect(root.querySelectorAll(".nc-model-popover__item")).toHaveLength(0);
    expect(root.textContent).toContain("No matching models.");
  });

  it("updates composer model picker query from the search field", () => {
    const root = document.createElement("main");
    const onModelPickerQueryChange = vi.fn();

    renderSidepanel(
      root,
      baseState({
        modelPickerOpen: true,
        modelSettings: {
          providerBaseUrl: "https://api.example.com/v1",
          apiKey: "sk-test",
          plannerModel: "qwen-max",
          visionModel: "",
          apiKeyRef: "naturalclick:model-api-key"
        },
        detectedModels: ["qwen-max", "deepseek-chat"]
      }),
      {
        onModelPickerQueryChange
      }
    );

    const input = root.querySelector(".nc-model-popover__search-input") as HTMLInputElement;
    input.value = "deep";
    input.dispatchEvent(new Event("input", { bubbles: true }));

    expect(onModelPickerQueryChange).toHaveBeenCalledWith("deep");
  });

  it("reflects capability settings in the composer tools menu", () => {
    const root = document.createElement("main");
    const onUseSkill = vi.fn();

    renderSidepanel(
      root,
      baseState({
        toolMenuOpen: true,
        skills: [
          {
            id: "workflow_reports",
            name: "Open reports",
            description: "Open the reports page and summarize it.",
            enabled: true,
            source: "recorded_workflow"
          }
        ],
        capabilitySettings: {
          skills: {
            slashCommandsEnabled: false,
            recordedWorkflowsEnabled: true,
            requireConfirmation: true
          },
          search: {
            provider: "disabled",
            endpoint: "",
            apiKey: "",
            maxResults: 5
          }
        }
      }),
      { onUseSkill }
    );

    const items = Array.from(root.querySelectorAll(".nc-tools-menu__item")) as HTMLButtonElement[];
    const slash = items.find((item) => item.textContent?.includes("Slash skills"));
    const search = items.find((item) => item.textContent?.includes("Search context"));
    const record = items.find((item) => item.textContent?.includes("Record workflow"));
    expect(slash?.disabled).toBe(true);
    expect(search?.disabled).toBe(true);
    expect(record?.disabled).toBe(false);
    expect(record?.textContent).toContain("on");
    expect(root.querySelector(".nc-tools-menu__item--skill")).toBeNull();
  });

  it("shows reusable skills in the composer tools menu when slash skills are enabled", () => {
    const root = document.createElement("main");
    const onUseSkill = vi.fn();

    renderSidepanel(
      root,
      baseState({
        toolMenuOpen: true,
        skills: [
          {
            id: "workflow_reports",
            name: "Open reports",
            description: "Open the reports page and summarize it.",
            enabled: true,
            source: "recorded_workflow"
          }
        ],
        capabilitySettings: {
          skills: {
            slashCommandsEnabled: true,
            recordedWorkflowsEnabled: true,
            requireConfirmation: true
          },
          search: {
            provider: "browser_context",
            endpoint: "",
            apiKey: "",
            maxResults: 5
          }
        }
      }),
      { onUseSkill }
    );

    const skill = root.querySelector(".nc-tools-menu__item--skill") as HTMLButtonElement;
    expect(skill).not.toBeNull();
    expect(skill.textContent).toContain("Open reports");
    skill.click();
    expect(onUseSkill).toHaveBeenCalledWith("workflow_reports");
  });

  it("routes enabled search context from the composer tools menu", () => {
    const root = document.createElement("main");
    const onUseSearchContext = vi.fn();

    renderSidepanel(
      root,
      baseState({
        toolMenuOpen: true,
        capabilitySettings: {
          skills: {
            slashCommandsEnabled: true,
            recordedWorkflowsEnabled: true,
            requireConfirmation: true
          },
          search: {
            provider: "browser_context",
            endpoint: "",
            apiKey: "",
            maxResults: 5
          }
        }
      }),
      { onUseSearchContext }
    );

    const search = (Array.from(root.querySelectorAll(".nc-tools-menu__item")) as HTMLButtonElement[]).find((item) =>
      item.textContent?.includes("Search context")
    );
    expect(search).not.toBeNull();
    expect(search?.disabled).toBe(false);
    expect(search?.textContent).toContain("Browser context");
    search?.click();
    expect(onUseSearchContext).toHaveBeenCalledTimes(1);
  });

  it("renders Pie-like pending instruction queue above the composer field", () => {
    const root = document.createElement("main");

    renderSidepanel(
      root,
      baseState({
        pendingInstructions: [
          { id: "pending-1", text: "Open the matching customer after this run" },
          { id: "pending-2", text: "Summarize the visible table" }
        ]
      })
    );

    expect(root.querySelector(".nc-composer")?.classList.contains("nc-composer--has-pending")).toBe(true);
    expect(root.querySelector(".nc-pending-list")?.getAttribute("aria-label")).toBe("Pending instructions");
    expect(root.textContent).toContain("PENDING · 2 IN QUEUE");
    expect(root.textContent).toContain("SENT NEXT TURN");
    expect(Array.from(root.querySelectorAll(".nc-pending-item__text")).map((node) => node.textContent)).toEqual([
      "Open the matching customer after this run",
      "Summarize the visible table"
    ]);
  });

  it("keeps Pie-like stop and queue composer actions separate while a task is running", () => {
    const root = document.createElement("main");
    const onSubmitTask = vi.fn();
    const onStopTask = vi.fn();

    renderSidepanel(
      root,
      baseState({
        composerInput: "Read the next visible row",
        activeTask: {
          taskId: "task-1",
          status: "running",
          currentAction: "Scanning the current table"
        }
      }),
      { onSubmitTask, onStopTask }
    );

    const stop = root.querySelector('button[aria-label="Stop task"]') as HTMLButtonElement;
    const queue = root.querySelector('button[aria-label="Queue instruction"]') as HTMLButtonElement;
    const queueWrap = root.querySelector(".nc-queue-button-wrap") as HTMLElement;
    expect(root.querySelector(".nc-composer-frame")?.classList.contains("nc-composer-frame--running")).toBe(true);
    expect(root.querySelector(".nc-composer__controls-left")?.contains(root.querySelector(".nc-composer-toolbox"))).toBe(true);
    expect(root.querySelector(".nc-composer__controls-right")?.contains(stop)).toBe(true);
    expect(root.querySelector(".nc-composer__controls-right")?.contains(queueWrap)).toBe(true);
    expect(stop).not.toBeNull();
    expect(queue).not.toBeNull();
    expect(queue.disabled).toBe(false);
    expect(queueWrap.classList.contains("nc-queue-button-wrap--visible")).toBe(true);

    stop.click();
    expect(onStopTask).toHaveBeenCalledTimes(1);

    root.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(onSubmitTask).toHaveBeenCalledWith("Read the next visible row");
    expect(onStopTask).toHaveBeenCalledTimes(1);
  });

  it("reveals the running queue button only after the composer receives text", () => {
    const root = document.createElement("main");
    const onSubmitTask = vi.fn();

    renderSidepanel(
      root,
      baseState({
        activeTask: {
          taskId: "task-1",
          status: "running",
          currentAction: "Waiting for page update"
        }
      }),
      { onSubmitTask }
    );

    const textarea = root.querySelector("textarea") as HTMLTextAreaElement;
    const queue = root.querySelector('button[aria-label="Queue instruction"]') as HTMLButtonElement;
    const queueWrap = root.querySelector(".nc-queue-button-wrap") as HTMLElement;
    expect(queue.disabled).toBe(true);
    expect(queueWrap.getAttribute("aria-hidden")).toBe("true");
    expect(queueWrap.classList.contains("nc-queue-button-wrap--visible")).toBe(false);

    textarea.value = "Then export the result";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));

    expect(queue.disabled).toBe(false);
    expect(queueWrap.getAttribute("aria-hidden")).toBe("false");
    expect(queueWrap.classList.contains("nc-queue-button-wrap--visible")).toBe(true);

    root.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(onSubmitTask).toHaveBeenCalledWith("Then export the result");
  });

  it("renders a Pie-like model config workbench with provider and model pool sections", () => {
    const root = document.createElement("main");

    renderSidepanel(
      root,
      baseState({
        view: "settings",
        settingsTab: "configs",
        modelConfigWizardOpen: true,
        modelSettings: {
          providerBaseUrl: "https://api.openai.com/v1",
          apiKey: "sk-test",
          plannerModel: "gpt-4.1-mini",
          visionModel: "gpt-4.1",
          apiKeyRef: "naturalclick:model-api-key"
        },
        detectedModels: ["gpt-4.1-mini", "gpt-4.1", "o4-mini"]
      })
    );

    expect(root.querySelector(".nc-provider-summary")).not.toBeNull();
    expect(root.querySelector(".nc-provider-summary__trigger")?.textContent).toContain("OpenAI Compatible");
    expect(root.textContent).toContain("Edit configuration");
    expect(root.textContent).toContain("Update the endpoint, key, and active models.");
    const wizardModelPool = root.querySelector(".nc-config-wizard .nc-config-section--models") as HTMLElement;
    expect(wizardModelPool).not.toBeNull();
    expect(wizardModelPool.querySelector(".nc-model-pool-header")?.textContent).toContain("Model pool");
    expect(wizardModelPool.querySelector(".nc-model-pool-header")?.textContent).toContain("Detected candidates stay inside the dropdowns above");
    expect(Array.from(wizardModelPool.querySelectorAll(".nc-config-model-row__id")).map((node) => node.textContent)).toEqual([
      "gpt-4.1-mini",
      "gpt-4.1"
    ]);
    const selectors = Array.from(root.querySelectorAll<HTMLDetailsElement>(".nc-model-select"));
    expect(selectors).toHaveLength(2);
    expect(selectors[0]?.querySelector(".nc-model-select__trigger")?.textContent).toContain("gpt-4.1-mini");
    expect(root.querySelector(".nc-model-choice-list")).toBeNull();
    selectors[0].open = true;
    selectors[0].dispatchEvent(new Event("toggle"));
    expect(selectors[0]?.querySelector(".nc-model-choice-list")?.parentElement?.tagName).toBe("DETAILS");
    expect(root.querySelector("select")).toBeNull();
    expect(root.textContent).toContain("Planner");
    expect(root.textContent).toContain("Vision");
  });

  it("renders edit actions for an existing model configuration", () => {
    const root = document.createElement("main");

    renderSidepanel(
      root,
      baseState({
        view: "settings",
        settingsTab: "configs",
        modelConfigWizardOpen: false,
        modelSettings: {
          providerBaseUrl: "https://api.openai.com/v1",
          apiKey: "sk-test",
          plannerModel: "gpt-4.1-mini",
          visionModel: "",
          apiKeyRef: "naturalclick:model-api-key"
        },
        detectedModels: ["gpt-4.1-mini", "gpt-4.1"]
      })
    );

    expect(root.querySelector(".nc-config-wizard")).toBeNull();
    expect(root.querySelectorAll('button[aria-label="Edit Config"]')).toHaveLength(1);
    expect(root.querySelector('button[aria-label="Add Provider"]')).not.toBeNull();
    expect(root.querySelector(".nc-config-card__edit")?.textContent).toBe("Edit Config");
    expect(root.querySelector(".nc-config-card__badge")?.textContent).toBe("Active");
  });

  it("keeps model configuration as records until the add provider dialog opens", () => {
    const root = document.createElement("main");
    const onOpenNewModelConfig = vi.fn();

    renderSidepanel(
      root,
      baseState({
        view: "settings",
        settingsTab: "configs",
        modelSettings: {
          providerBaseUrl: "https://api.openai.com/v1",
          apiKey: "",
          plannerModel: "",
          visionModel: "",
          apiKeyRef: "naturalclick:model-api-key"
        }
      }),
      { onOpenNewModelConfig }
    );

    expect(root.querySelector(".nc-config-card")).toBeNull();
    expect(root.querySelector(".nc-config-wizard")).toBeNull();
    expect(root.querySelector(".nc-config-empty")?.textContent).toContain("No model Provider yet");
    const add = root.querySelector<HTMLButtonElement>('button[aria-label="Add Provider"]');
    expect(add).not.toBeNull();
    add?.click();
    expect(onOpenNewModelConfig).toHaveBeenCalledTimes(1);
  });

  it("prefers core model config state when rendering the saved config card", () => {
    const root = document.createElement("main");

    renderSidepanel(
      root,
      baseState({
        view: "settings",
        settingsTab: "configs",
        modelConfigWizardOpen: false,
        modelSettings: {
          providerBaseUrl: "https://stale.example.com/v1",
          apiKey: "sk-test",
          plannerModel: "stale-planner",
          visionModel: "",
          apiKeyRef: "naturalclick:model-api-key"
        },
        modelConfigState: {
          instances: [
            {
              id: "core_provider",
              provider: "custom",
              label: "Core Provider",
              baseUrl: "https://core.example.com/v1",
              apiKeyRef: "secret:core",
              endpointVariant: "openai_compatible",
              models: [
                { id: "core-planner", vision: false, tools: true, maxContextTokens: 128000 },
                { id: "core-vision", vision: true, tools: false, maxContextTokens: 128000 }
              ]
            }
          ],
          activeSelection: { instanceId: "core_provider", model: "core-planner" },
          roleSelections: {
            planner: { instanceId: "core_provider", model: "core-planner" },
            vision: { instanceId: "core_provider", model: "core-vision" }
          }
        }
      })
    );

    const card = root.querySelector(".nc-config-card") as HTMLElement;
    expect(card.textContent).toContain("Core Provider");
    expect(card.textContent).toContain("https://core.example.com/v1");
    expect(card.textContent).toContain("Planner model: core-planner");
    expect(card.textContent).toContain("Vision: core-vision");
    expect(card.textContent).not.toContain("stale-planner");
  });

  it("renders multiple core model config instances as separate cards", () => {
    const root = document.createElement("main");
    const onOpenModelConfigEditor = vi.fn();

    renderSidepanel(
      root,
      baseState({
        view: "settings",
        settingsTab: "configs",
        modelSettings: {
          providerBaseUrl: "https://legacy.example.com/v1",
          apiKey: "sk-test",
          plannerModel: "legacy-planner",
          visionModel: "",
          apiKeyRef: "naturalclick:model-api-key"
        },
        modelConfigState: {
          instances: [
            {
              id: "planner_provider",
              provider: "custom",
              label: "Planner Provider",
              baseUrl: "https://planner.example.com/v1",
              apiKeyRef: "secret:planner",
              endpointVariant: "openai_compatible",
              models: [{ id: "planner-model", vision: false, tools: true, maxContextTokens: 128000 }]
            },
            {
              id: "vision_provider",
              provider: "custom",
              label: "Vision Provider",
              baseUrl: "https://vision.example.com/v1",
              apiKeyRef: "secret:vision",
              endpointVariant: "openai_compatible",
              models: [{ id: "vision-model", vision: true, tools: false, maxContextTokens: 128000 }]
            }
          ],
          roleSelections: {
            planner: { instanceId: "planner_provider", model: "planner-model" },
            vision: { instanceId: "vision_provider", model: "vision-model" }
          }
        }
      }),
      { onOpenModelConfigEditor }
    );

    const cards = Array.from(root.querySelectorAll<HTMLElement>(".nc-config-card"));
    expect(cards).toHaveLength(2);
    expect(cards[0]?.textContent).toContain("Planner Provider");
    expect(cards[0]?.textContent).toContain("Planner model: planner-model");
    expect(cards[0]?.textContent).toContain("Vision: off");
    expect(cards[1]?.textContent).toContain("Vision Provider");
    expect(cards[1]?.textContent).toContain("Planner model: No planner selected");
    expect(cards[1]?.textContent).toContain("Vision: vision-model");

    cards[1]?.querySelector<HTMLButtonElement>(".nc-config-card__edit")?.click();
    expect(onOpenModelConfigEditor).toHaveBeenCalledWith("vision_provider");
  });

  it("keeps large detected model lists inside compact dropdown selectors", () => {
    const root = document.createElement("main");
    const detectedModels = Array.from({ length: 77 }, (_, index) => `provider-model-${index + 1}`);

    renderSidepanel(
      root,
      baseState({
        view: "settings",
        settingsTab: "configs",
        modelConfigWizardOpen: true,
        modelSettings: {
          providerBaseUrl: "https://api.example.com/v1",
          apiKey: "sk-test",
          plannerModel: "provider-model-1",
          visionModel: "",
          apiKeyRef: "naturalclick:model-api-key"
        },
        detectedModels
      })
    );

    expect(root.querySelectorAll(".nc-model-select")).toHaveLength(2);
    expect(root.querySelector(".nc-model-select__trigger")?.textContent).toContain("provider-model-1");
    expect(root.querySelectorAll(".nc-config-wizard .nc-config-model-row__id")).toHaveLength(1);
    expect(root.querySelector(".nc-model-pool-header")?.textContent).toContain("77 models");
    expect(root.textContent).not.toContain("provider-model-77");
    expect(root.querySelectorAll(".nc-model-select__option")).toHaveLength(0);
    const selectors = Array.from(root.querySelectorAll<HTMLDetailsElement>(".nc-model-select"));
    selectors[0].open = true;
    selectors[0].dispatchEvent(new Event("toggle"));
    selectors[1].open = true;
    selectors[1].dispatchEvent(new Event("toggle"));
    expect(selectors[0]?.querySelectorAll(".nc-model-choice")).toHaveLength(77);
    expect(selectors[1]?.querySelectorAll(".nc-model-choice")).toHaveLength(78);
    expect(selectors[0]?.querySelector(".nc-model-select__search-input")).not.toBeNull();
    const search = selectors[0]?.querySelector<HTMLInputElement>(".nc-model-select__search-input");
    if (!search) throw new Error("expected searchable model picker");
    search.value = "provider-model-77";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    expect(
      Array.from(selectors[0]?.querySelectorAll<HTMLButtonElement>(".nc-model-select__option") ?? [])
        .filter((node) => !node.hidden)
        .map((node) => node.textContent)
    ).toEqual(["provider-model-77"]);
    expect(selectors[0]?.querySelector(".nc-model-choice-empty--filtered")?.hasAttribute("hidden")).toBe(true);
    search.value = "not-a-model";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    expect(Array.from(selectors[0]?.querySelectorAll<HTMLButtonElement>(".nc-model-select__option") ?? []).filter((node) => !node.hidden)).toHaveLength(0);
    expect(selectors[0]?.querySelector(".nc-model-choice-empty--filtered")?.hasAttribute("hidden")).toBe(false);
    expect(root.querySelector("select")).toBeNull();
  });

  it("filters detected non-agent models out of the Planner selector", () => {
    const root = document.createElement("main");

    renderSidepanel(
      root,
      baseState({
        view: "settings",
        settingsTab: "configs",
        modelConfigWizardOpen: true,
        modelSettings: {
          providerBaseUrl: "https://api.example.com/v1",
          apiKey: "sk-test",
          plannerModel: "deepseek-chat",
          visionModel: "qwen-vl-max",
          apiKeyRef: "naturalclick:model-api-key"
        },
        detectedModels: ["cosyvoice-v3-flash", "qwen-image", "qwen3-asr-flash", "deepseek-chat", "qwen-max", "gpt-4o-mini", "qwen-vl-max"]
      })
    );

    const selectors = Array.from(root.querySelectorAll<HTMLDetailsElement>(".nc-model-select"));
    expect(selectors).toHaveLength(2);
    expect(selectors[0]?.querySelector(".nc-model-select__trigger")?.textContent).toContain("4 models");
    expect(selectors[1]?.querySelector(".nc-model-select__trigger")?.textContent).toContain("2 models");

    selectors[0].open = true;
    selectors[0].dispatchEvent(new Event("toggle"));
    selectors[1].open = true;
    selectors[1].dispatchEvent(new Event("toggle"));

    const plannerChoices = Array.from(selectors[0]?.querySelectorAll(".nc-model-choice") ?? []).map((node) => node.textContent);
    expect(plannerChoices).toEqual(["deepseek-chat", "qwen-max", "gpt-4o-mini", "qwen-vl-max"]);
    expect(plannerChoices).not.toContain("cosyvoice-v3-flash");
    expect(plannerChoices).not.toContain("qwen-image");
    expect(plannerChoices).not.toContain("qwen3-asr-flash");

    expect(Array.from(selectors[1]?.querySelectorAll(".nc-model-choice") ?? []).map((node) => node.textContent)).toEqual([
      "Do not use a vision model",
      "qwen-vl-max",
      "gpt-4o-mini"
    ]);
  });

  it("keeps detected model pool empty state compact before a planner is selected", () => {
    const root = document.createElement("main");

    renderSidepanel(
      root,
      baseState({
        view: "settings",
        settingsTab: "configs",
        modelConfigWizardOpen: true,
        modelSettings: {
          providerBaseUrl: "https://api.example.com/v1",
          apiKey: "sk-test",
          plannerModel: "",
          visionModel: "",
          apiKeyRef: "naturalclick:model-api-key"
        },
        detectedModels: ["provider-model-1", "provider-model-2"]
      })
    );

    expect(root.querySelectorAll(".nc-config-wizard .nc-config-model-row__id")).toHaveLength(0);
    expect(root.querySelector(".nc-config-wizard .nc-config-model-list")?.textContent).toContain(
      "Detected models are ready. Choose the active Planner from the dropdown above."
    );
    expect(root.querySelectorAll(".nc-model-select")).toHaveLength(2);
    expect(root.querySelectorAll(".nc-model-select__option")).toHaveLength(0);
  });

  it("closes settings model selectors on outside click and Escape", async () => {
    const root = document.createElement("main");
    document.body.append(root);
    const detectedModels = Array.from({ length: 12 }, (_, index) => `provider-model-${index + 1}`);

    renderSidepanel(
      root,
      baseState({
        view: "settings",
        settingsTab: "configs",
        modelConfigWizardOpen: true,
        modelSettings: {
          providerBaseUrl: "https://api.example.com/v1",
          apiKey: "sk-test",
          plannerModel: "provider-model-1",
          visionModel: "",
          apiKeyRef: "naturalclick:model-api-key"
        },
        detectedModels
      })
    );

    const selector = root.querySelector<HTMLDetailsElement>(".nc-model-select");
    const trigger = selector?.querySelector<HTMLElement>(".nc-model-select__trigger");
    if (!selector || !trigger) throw new Error("expected model selector");

    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(selector.querySelector(".nc-model-choice-list")).toBeNull();
    selector.open = true;
    selector.dispatchEvent(new Event("toggle"));
    await Promise.resolve();
    const search = selector.querySelector<HTMLInputElement>(".nc-model-select__search-input");
    if (!search) throw new Error("expected model selector search");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(search);
    expect(selector.querySelector(".nc-model-choice-list")).not.toBeNull();

    document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    expect(selector.open).toBe(false);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(selector.querySelector(".nc-model-choice-list")).toBeNull();

    selector.open = true;
    selector.dispatchEvent(new Event("toggle"));
    expect(selector.querySelector(".nc-model-choice-list")).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(selector.open).toBe(false);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
    expect(selector.querySelector(".nc-model-choice-list")).toBeNull();

    root.remove();
  });

  it("keeps the running task visible without turning the home into a flow board", () => {
    const root = document.createElement("main");
    const state = baseState({
      mode: "workbench",
      overlayMode: "Focus",
      activeTask: {
        taskId: "task-1",
        status: "running",
        currentAction: "点击个人版继续",
        activeNodeId: "plan",
        targetLabel: "#17 个人版继续",
        expectedOutcome: "进入个人版套餐页面",
        semanticTargetId: "target-17"
      },
      timeline: [
        { id: "event-1", title: "页面观察完成", detail: "找到套餐区域", tone: "success" },
        { id: "event-2", title: "计划已生成", detail: "点击个人版继续" }
      ]
    });

    renderSidepanel(root, state);

    expect(root.textContent).toContain("Running");
    expect(root.textContent).toContain("Agent is working");
    expect(root.textContent).toContain("Current step");
    expect(root.textContent).toContain("View execution details");
    expect(root.textContent).toContain("点击个人版继续");
    expect(root.textContent).toContain("Highlight target");
    expect(root.querySelector(".nc-chat-surface")).not.toBeNull();
    expect(root.querySelector(".nc-chat-surface__status")?.textContent).toBe("Running");
    expect(root.querySelector(".nc-chat-surface__header")?.textContent).toContain("2 events");
    expect(root.querySelector(".nc-run-report")).not.toBeNull();
    expect(root.querySelector(".nc-run-report__identity")).not.toBeNull();
    expect(root.querySelector(".nc-run-report__avatar")).not.toBeNull();
    expect(root.querySelector(".nc-run-digest")).not.toBeNull();
    expect(root.querySelector(".nc-run-digest")?.textContent).toContain("Run summary");
    expect(root.querySelector(".nc-run-digest")?.textContent).toContain("Recent steps");
    expect(root.querySelector(".nc-run-digest")?.textContent).toContain("计划已生成");
    expect(root.querySelector(".nc-agent-step-group")).toBeNull();
    expect(root.querySelector(".nc-run-trace")).not.toBeNull();
    expect(root.querySelector(".nc-run-trace__body")).not.toBeNull();
    expect((root.querySelector(".nc-run-trace") as HTMLDetailsElement)?.open).toBe(false);
    expect(root.querySelector(".nc-message")).toBeNull();
    expect(root.textContent).not.toContain("当前对话流");
    expect(root.querySelector(".nc-activity-bar")).toBeNull();
    expect(root.querySelector('button[aria-label="Stop task"]')).not.toBeNull();
  });

  it("summarizes noisy runtime events instead of exposing them as the main conversation", () => {
    const root = document.createElement("main");
    const lastSessionEvents = [
      event("TaskStarted", { taskText: "新建客户" }, { id: "start", timestamp: 1 }),
      event("ModelCallStarted", { model: "glm-5.2" }, { id: "model", timestamp: 2 }),
      event("ModelCallProgress", { chunk: "{", chunkIndex: 1, receivedChars: 1 }, { id: "chunk-1", timestamp: 3 }),
      event("ModelCallProgress", { chunk: "}", chunkIndex: 2, receivedChars: 2 }, { id: "chunk-2", timestamp: 4 }),
      event("EvidenceAdded", { evidence: { kind: "control_presence" } }, { id: "evidence-1", timestamp: 5 }),
      event("ObservationReceived", { controls: 130, durationMs: 2520 }, { id: "observe", timestamp: 6 }),
      event("TaskStopped", { reason: "user_requested" }, { id: "stop", timestamp: 7 })
    ];

    renderSidepanel(
      root,
      baseState({
        locale: "zh-CN",
        mode: "workbench",
        activeTask: { taskId: "task-1", status: "stopped", currentAction: "任务已停止" },
        lastSessionEvents,
        timeline: [
          { id: "event-1", title: "模型正在输出", detail: "2 个片段" },
          { id: "event-2", title: "证据已更新", detail: "1 条证据" },
          { id: "event-3", title: "任务已停止", detail: "user_requested", tone: "warning" }
        ]
      })
    );

    const digest = root.querySelector(".nc-run-digest");
    expect(digest).not.toBeNull();
    expect(digest?.textContent).toContain("执行摘要");
    expect(digest?.textContent).toContain("模型调用");
    expect(digest?.textContent).toContain("慢调用");
    expect(digest?.textContent).toContain("调试噪声");
    expect(digest?.textContent).toContain("已从主对话隐藏 3 条调试噪声");
    expect(root.querySelector(".nc-run-trace")).not.toBeNull();
    expect((root.querySelector(".nc-run-trace") as HTMLDetailsElement)?.open).toBe(false);
  });

  it("renders paused tasks with resume controls", () => {
    const root = document.createElement("main");

    renderSidepanel(
      root,
      baseState({
        activeTask: {
          taskId: "task-1",
          status: "paused",
          currentAction: "后台恢复后暂停"
        },
        timeline: [{ id: "event-1", title: "Runtime suspended", detail: "background restarted", tone: "warning" }]
      })
    );

    expect(root.textContent).toContain("Paused");
    expect(root.textContent).toContain("Resume task");
    expect(root.querySelector('button[aria-label="Resume task"]')).not.toBeNull();
    expect(root.querySelector('button[aria-label="Stop task"]')).not.toBeNull();
  });

  it("renders scoped consent actions for confirmation pauses", () => {
    const root = document.createElement("main");

    renderSidepanel(
      root,
      baseState({
        locale: "zh-CN",
        activeTask: {
          taskId: "task-1",
          status: "awaiting_confirmation",
          currentAction: "需要确认提交表单"
        },
        timeline: [{ id: "event-1", title: "需要用户确认", detail: "提交表单需要授权", tone: "warning" }]
      })
    );

    expect(root.querySelector('button[aria-label="允许一次"]')).not.toBeNull();
    expect(root.querySelector('button[aria-label="本任务允许"]')).not.toBeNull();
    expect(root.querySelector('button[aria-label="拒绝"]')).not.toBeNull();
  });

  it("renders streamed model output inside the running task card", () => {
    const root = document.createElement("main");

    renderSidepanel(
      root,
      baseState({
        locale: "zh-CN",
        activeTask: {
          taskId: "task-1",
          status: "running",
          currentAction: "模型正在输出"
        },
        timeline: [{ id: "event-1", title: "模型正在输出", detail: "2 个片段 · 33 字符" }],
        modelStream: {
          title: "模型正在输出",
          text: '{"type":"FinishTask","summary":"南京今天多云"}',
          isStreaming: true,
          model: "qwen3.7-max",
          chunkCount: 2,
          receivedChars: 33
        }
      })
    );

    expect(root.textContent).toContain("模型输出");
    expect(root.textContent).toContain("南京今天多云");
    expect(root.textContent).toContain("实时输出中");
    expect(root.querySelector(".nc-run-model-output__body")?.textContent).toContain('"summary"');
    expect(root.querySelectorAll(".nc-run-model-output")).toHaveLength(1);
    expect(root.querySelector(".nc-message")).toBeNull();
  });

  it("renders a failed run as one useful report instead of separate event cards", () => {
    const root = document.createElement("main");
    renderSidepanel(
      root,
      baseState({
        locale: "zh-CN",
        activeTask: {
          taskId: "task-1",
          status: "failed",
          currentAction: "Planner decision requires nextCommand.type"
        },
        timeline: [
          { id: "e1", title: "任务开始", detail: "打开百度搜索南京的天气" },
          { id: "e2", title: "页面观察完成", detail: "候选 120/301 · 上限 120" },
          { id: "e3", title: "模型输出契约异常", detail: "Planner decision requires nextCommand.type", tone: "error" },
          { id: "e4", title: "任务失败", detail: "invalid_contract", tone: "error" }
        ]
      })
    );

    expect(root.textContent).toContain("Agent 正在执行");
    expect(root.textContent).toContain("查看执行细节");
    expect(root.textContent).toContain("失败");
    expect(root.textContent).toContain("Planner decision requires nextCommand.type");
    expect(root.querySelectorAll(".nc-run-report")).toHaveLength(1);
    expect(root.querySelector(".nc-run-digest")?.textContent).toContain("执行摘要");
    expect(root.querySelector(".nc-run-digest")?.textContent).toContain("最近步骤");
    expect(root.querySelector(".nc-run-digest")?.textContent).toContain("任务失败");
    expect(root.querySelector(".nc-agent-step-group")).toBeNull();
    expect(root.querySelectorAll(".nc-run-step")).toHaveLength(4);
    expect((root.querySelector(".nc-run-trace") as HTMLDetailsElement)?.open).toBe(false);
    expect(root.querySelector(".nc-message")).toBeNull();
  });

  it("renders the history page from the top toolbar entry", () => {
    const root = document.createElement("main");
    renderSidepanel(
      root,
      baseState({
        view: "history",
        sessions: [
          {
            id: "s1",
            title: "打开定价页面",
            status: "completed",
            updatedAt: "2026/6/26 12:00:00",
            eventCount: 8,
            taskText: "打开定价页面"
          }
        ]
      })
    );

    expect(root.textContent).toContain("History");
    expect(root.textContent).toContain("1 sessions");
    expect(root.textContent).toContain("打开定价页面");
    expect(root.textContent).toContain("8 events");
    expect(root.querySelector(".nc-history-page")).not.toBeNull();
    expect(root.querySelector(".nc-drawer-overlay")).toBeNull();
    expect(root.querySelector(".nc-session-drawer")).toBeNull();
    expect(root.querySelector(".nc-chat-view")).toBeNull();
    expect(root.querySelector(".nc-composer")).toBeNull();
    expect(root.querySelector('.nc-session-list[role="list"]')).not.toBeNull();
    expect(root.querySelector(".nc-session-drawer__count")?.getAttribute("aria-label")).toBe("1 sessions");
    expect(root.querySelector(".nc-history-section-head__label")?.textContent).toContain("Active · 1");
    expect(root.querySelector(".nc-session-card__icon")).not.toBeNull();
    expect(root.querySelector(".nc-session-card__status")?.textContent).toBe("Completed");
    expect(root.querySelector(".nc-session-card__time")?.textContent).toBe("2026/6/26 12:00:00");
    expect(root.querySelector(".nc-session-card__events")?.textContent).toBe("8 events");
    expect(root.querySelector('button[aria-label="打开定价页面, Completed, 2026/6/26 12:00:00"]')).not.toBeNull();
    expect(root.querySelector('button[aria-label="View"]')).toBeNull();
    expect(root.querySelector('button[aria-label="Run again"]')).not.toBeNull();
    expect(root.querySelector('button[aria-label="Delete"]')).not.toBeNull();
    expect(root.querySelector('button[aria-label="Clear history"]')).not.toBeNull();
    expect(root.querySelector('button[aria-label="Back to chat"]')).not.toBeNull();
    expect(root.querySelector(".nc-history-footer")?.textContent).toContain("Local history");
  });

  it("renders history confirmation inline instead of relying on browser dialogs", () => {
    const root = document.createElement("main");
    renderSidepanel(
      root,
      baseState({
        view: "history",
        pendingConfirmation: {
          id: "clear-history",
          action: "clear-history",
          message: "Clear all history sessions?",
          confirmLabel: "Clear all",
          cancelLabel: "Cancel"
        }
      })
    );

    expect(root.querySelector(".nc-pending-confirmation")).not.toBeNull();
    expect(root.querySelector('button[aria-label="Clear all"]')).not.toBeNull();
    expect(root.querySelector('button[aria-label="Cancel"]')).not.toBeNull();
  });

  it("renders a history detail page with exported-session actions", () => {
    const root = document.createElement("main");
    renderSidepanel(
      root,
      baseState({
        view: "history-detail",
        selectedSessionId: "s1",
        sessions: [
          {
            id: "s1",
            title: "填写表单",
            status: "completed",
            updatedAt: "2026/6/26 12:30:00",
            eventCount: 2,
            taskText: "填写表单"
          }
        ],
        sessionRecords: {
          s1: {
            id: "s1",
            title: "填写表单",
            status: "completed",
            updatedAt: "2026/6/26 12:30:00",
            eventCount: 2,
            taskText: "填写表单",
            hasDetail: true,
            timeline: [
              { id: "e1", title: "Task started", detail: "填写表单" },
              { id: "e2", title: "Task completed", detail: "完成", tone: "success" }
            ]
          }
        }
      })
    );

    expect(root.textContent).toContain("Session details");
    expect(root.textContent).toContain("填写表单");
    expect(root.textContent).toContain("Task completed");
    expect(root.querySelector(".nc-history-detail-view")).not.toBeNull();
    expect(root.querySelector(".nc-session-detail-card__head")).not.toBeNull();
    expect(root.querySelector(".nc-session-detail-card__eyebrow")?.textContent).toBe("Summary");
    expect(root.querySelector(".nc-session-detail-card__count")?.textContent).toBe("2 events");
    expect(root.querySelector(".nc-history-detail-timeline-head")?.textContent).toContain("Run timeline");
    expect(root.querySelector(".nc-history-detail-timeline-head")?.textContent).toContain("2 events");
    expect(root.querySelector('button[aria-label="Back to history"]')).not.toBeNull();
    expect(root.querySelector('button[aria-label="Copy"]')).not.toBeNull();
    expect(root.querySelector('button[aria-label="Download"]')).not.toBeNull();
    expect(root.querySelector('button[aria-label="Run again"]')).not.toBeNull();
    expect(root.querySelector('button[aria-label="Delete"]')).not.toBeNull();
    expect(root.querySelector('button[aria-label="Clear history"]')).not.toBeNull();
  });

  it("renders settings as a full sidepanel page", () => {
    const root = document.createElement("main");

    renderSidepanel(
      root,
      baseState({
        view: "settings",
        overlayMode: "Vision",
        safetyMode: "autonomous",
        modelSettings: {
          providerBaseUrl: "https://api.openai.com/v1",
          apiKey: "sk-test",
          plannerModel: "gpt-4.1-mini",
          visionModel: "",
          apiKeyRef: "naturalclick:model-api-key"
        },
        detectedModels: ["gpt-4.1-mini", "gpt-4.1"],
        modelDetectionStatus: "success",
        modelDetectionMessage: "Detected 2 models. Selected gpt-4.1-mini; save configuration to apply.",
        modelConfigWizardOpen: true,
        modelSettingsDirty: true,
        settingsDirty: true
      })
    );

    expect(root.textContent).toContain("Settings");
    expect(root.textContent).toContain("My Configs");
    expect(root.textContent).toContain("OpenAI Compatible");
    expect(root.textContent).toContain("Active");
    expect(root.textContent).toContain("Model API");
    expect(root.querySelector(".nc-config-card")).not.toBeNull();
    expect(root.querySelector(".nc-config-wizard")).not.toBeNull();
    expect(root.querySelector(".nc-config-dialog-backdrop")).not.toBeNull();
    expect(root.querySelector('button[aria-label="Cancel"]')).not.toBeNull();
    const labels = Array.from(root.querySelectorAll(".nc-field__label")).map((node) => node.textContent);
    expect(labels).toEqual(expect.arrayContaining(["API", "API Key", "Planner model", "Vision model"]));
    expect(labels).toEqual(expect.arrayContaining(["Max steps", "Observation rounds", "Hard candidate limit"]));
    expect(root.querySelector('button[aria-label="Detect models"]')).not.toBeNull();
    expect(root.querySelector('button[aria-label="Save configuration"]')).not.toBeNull();
    expect(root.querySelector(".nc-config-dialog__footer button[aria-label='Save configuration']")).not.toBeNull();
    expect(root.textContent).toContain("Unsaved changes");
    expect(root.querySelector("select")).toBeNull();
    expect(root.querySelectorAll(".nc-model-select")).toHaveLength(2);
    expect(root.querySelector(".nc-model-select__trigger")?.textContent).toContain("gpt-4.1-mini");
    const plannerSelect = root.querySelector<HTMLDetailsElement>(".nc-model-select");
    if (!plannerSelect) throw new Error("expected planner select");
    expect(plannerSelect.querySelector(".nc-model-choice")).toBeNull();
    plannerSelect.open = true;
    plannerSelect.dispatchEvent(new Event("toggle"));
    expect(Array.from(plannerSelect.querySelectorAll(".nc-model-choice")).map((node) => node.textContent)).toContain("gpt-4.1-mini");
    expect(root.textContent).toContain("Execution Control");
    expect(root.querySelector(".nc-settings-workbench")).not.toBeNull();
    expect(root.querySelector(".nc-settings-rail")).toBeNull();
    expect(root.querySelector(".nc-settings-panel")).not.toBeNull();
    expect(root.querySelector(".nc-settings-center-header")).not.toBeNull();
    const settingsPanel = root.querySelector(".nc-settings-panel");
    expect(settingsPanel?.children[0]?.classList.contains("nc-settings-center-header")).toBe(true);
    expect(settingsPanel?.children[1]?.classList.contains("nc-settings-tabs")).toBe(true);
    expect(settingsPanel?.children[2]?.classList.contains("nc-settings-layout")).toBe(true);
    expect(root.querySelector(".nc-settings-tabs")?.parentElement?.classList.contains("nc-settings-panel")).toBe(true);
    expect(root.querySelector(".nc-settings-center-header h2")?.textContent).toBe("Configs");
    expect(root.querySelector(".nc-settings-center-status strong")?.textContent).toBe("Unsaved changes");
    expect(root.querySelector(".nc-settings-center-status__meta")?.textContent).toBe("4 sections");
    expect(root.querySelector(".nc-settings-tabs")?.getAttribute("role")).toBe("tablist");
    expect(Array.from(root.querySelectorAll(".nc-settings-tab__label")).map((node) => node.textContent)).toEqual(["Configs", "Skills", "Search", "General"]);
    expect(Array.from(root.querySelectorAll(".nc-settings-tab__detail")).map((node) => node.textContent)).toEqual([
      "Models and runtime",
      "Commands, workflows, and memory",
      "Lookup providers",
      "Language and safety"
    ]);
    expect(root.querySelector("#nc-settings-tab-configs")?.getAttribute("aria-selected")).toBe("true");
    expect(root.querySelector(".nc-settings-layout")).not.toBeNull();
    expect(root.querySelector(".nc-settings-pane--configs")?.getAttribute("aria-labelledby")).toBe("nc-settings-tab-configs");
    const saveBar = root.querySelector(".nc-settings-save-bar");
    expect(saveBar).not.toBeNull();
    expect(root.textContent).not.toContain("运行链路");
  });

  it("renders general settings in Chinese when the locale is zh-CN", () => {
    const root = document.createElement("main");

    renderSidepanel(
      root,
      baseState({
        locale: "zh-CN",
        view: "settings",
        settingsTab: "general",
        overlayMode: "Vision",
        safetyMode: "balanced",
        modelSettings: {
          providerBaseUrl: "https://api.openai.com/v1",
          apiKey: "sk-test",
          plannerModel: "gpt-4.1-mini",
          visionModel: "",
          apiKeyRef: "naturalclick:model-api-key"
        },
        detectedModels: ["gpt-4.1-mini"],
        modelSettingsDirty: true,
        settingsDirty: true
      })
    );

    expect(root.textContent).toContain("设置");
    expect(root.querySelector(".nc-settings-center-header h2")?.textContent).toBe("通用");
    expect(root.querySelector(".nc-settings-center-status strong")?.textContent).toBe("有未保存修改");
    expect(root.textContent).toContain("插件语言");
    expect(root.textContent).toContain("有未保存修改");
    expect(root.querySelector('button[aria-label="保存配置"]')).not.toBeNull();
    expect(Array.from(root.querySelectorAll(".nc-segment--active")).map((node) => node.textContent)).toEqual(
      expect.arrayContaining(["中文", "视觉", "平衡"])
    );
  });

  it("renders Pie-like skills settings as real capability controls", () => {
    const root = document.createElement("main");
    const onCapabilitySettingChange = vi.fn();
    const onUseSkill = vi.fn();
    const onUseScratchpad = vi.fn();

    renderSidepanel(
      root,
      baseState({
        view: "settings",
        settingsTab: "skills",
        capabilitySettings: {
          skills: {
            slashCommandsEnabled: true,
            recordedWorkflowsEnabled: false,
            requireConfirmation: true
          },
          search: {
            provider: "browser_context",
            endpoint: "",
            apiKey: "",
            maxResults: 5
          }
        },
        skills: [
          {
            id: "workflow_reports",
            name: "Open reports",
            description: "Open the reports page and summarize it.",
            enabled: true,
            source: "recorded_workflow"
          }
        ],
        scratchpadRecords: [
          {
            id: "customer_1",
            collection: "customers",
            fields: {
              name: "张三",
              amount: 1200,
              active: true
            },
            evidence: "text_1",
            createdAt: 100,
            updatedAt: 100
          }
        ]
      }),
      { onCapabilitySettingChange, onUseSkill, onUseScratchpad }
    );

    expect(root.querySelector(".nc-settings-pane--skills")?.getAttribute("aria-labelledby")).toBe("nc-settings-tab-skills");
    expect(root.querySelector(".nc-settings-group--placeholder")).toBeNull();
    expect(root.querySelector(".nc-capability-panel")).not.toBeNull();
    expect(root.textContent).toContain("Slash command helper");
    expect(root.textContent).toContain("Workflow recording");
    expect(root.textContent).toContain("Confirm skill execution");
    expect(root.textContent).toContain("Recorded workflows");
    expect(root.textContent).toContain("Session memory");
    expect(root.textContent).toContain("Open reports");
    expect(root.textContent).toContain("customer_1");
    expect(root.textContent).toContain("name: 张三");
    expect(root.querySelectorAll(".nc-capability-card")).toHaveLength(3);
    expect(root.querySelectorAll(".nc-skill-row:not(.nc-scratchpad-row)")).toHaveLength(1);
    expect(root.querySelectorAll(".nc-scratchpad-row")).toHaveLength(1);
    expect(root.querySelectorAll(".nc-capability-card--active")).toHaveLength(2);
    expect(root.querySelector(".nc-settings-save-bar")).not.toBeNull();

    (root.querySelector(".nc-skill-row__action") as HTMLButtonElement).click();
    expect(onUseSkill).toHaveBeenCalledWith("workflow_reports");
    (root.querySelector(".nc-scratchpad-row .nc-skill-row__action") as HTMLButtonElement).click();
    expect(onUseScratchpad).toHaveBeenCalledWith("customer_1");

    const slashToggle = root.querySelector(".nc-capability-toggle input") as HTMLInputElement;
    slashToggle.checked = false;
    slashToggle.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onCapabilitySettingChange).toHaveBeenCalledWith("skills", "slashCommandsEnabled", false);
  });

  it("renders search provider settings without native selects", () => {
    const root = document.createElement("main");
    const onCapabilitySettingChange = vi.fn();

    renderSidepanel(
      root,
      baseState({
        view: "settings",
        settingsTab: "search",
        capabilitySettings: {
          skills: {
            slashCommandsEnabled: true,
            recordedWorkflowsEnabled: true,
            requireConfirmation: true
          },
          search: {
            provider: "custom_endpoint",
            endpoint: "https://search.example.com/query",
            apiKey: "search-key",
            maxResults: 8
          }
        }
      }),
      { onCapabilitySettingChange }
    );

    expect(root.querySelector(".nc-settings-pane--search")?.getAttribute("aria-labelledby")).toBe("nc-settings-tab-search");
    expect(root.querySelector(".nc-settings-group--placeholder")).toBeNull();
    expect(root.querySelector("select")).toBeNull();
    expect(root.textContent).toContain("Search provider");
    expect(root.textContent).toContain("Browser context");
    expect(root.textContent).toContain("Custom endpoint");
    const inputs = Array.from(root.querySelectorAll("input")) as HTMLInputElement[];
    expect(inputs.find((input) => input.value === "https://search.example.com/query")?.disabled).toBe(false);
    expect(inputs.some((input) => input.value === "8")).toBe(true);

    const disabled = Array.from(root.querySelectorAll(".nc-segment")).find((node) => node.textContent === "Disabled") as HTMLButtonElement;
    disabled.click();
    expect(onCapabilitySettingChange).toHaveBeenCalledWith("search", "provider", "disabled");
  });

  it("renders schedules as a real top-bar view", () => {
    const root = document.createElement("main");
    const onUseSchedule = vi.fn();
    const onRunSchedule = vi.fn();

    renderSidepanel(
      root,
      baseState({
        view: "schedules",
        schedules: [
          {
            id: "daily_report",
            title: "Daily report",
            taskText: "Open dashboard and summarize visible metrics.",
            status: "ready",
            trigger: { type: "daily", timeOfDay: "09:30" },
            notes: "Use the current logged-in workspace.",
            createdAt: 100,
            updatedAt: 100
          },
          {
            id: "weekly_review",
            title: "Weekly review",
            taskText: "Review inbox and summarize unresolved items.",
            status: "draft",
            trigger: { type: "weekly", dayOfWeek: 1 },
            createdAt: 90,
            updatedAt: 90
          }
        ]
      }),
      { onUseSchedule, onRunSchedule }
    );

    expect(root.textContent).toContain("Schedules");
    expect(root.textContent).toContain("Scheduled runs");
    expect(root.textContent).toContain("Daily task");
    expect(root.querySelector(".nc-schedules-panel")).not.toBeNull();
    expect(root.querySelector(".nc-schedules-card__head")).not.toBeNull();
    expect(root.querySelector(".nc-schedules-card__badge")?.textContent).toBe("2 saved");
    expect(Array.from(root.querySelectorAll(".nc-schedules-stat__label")).map((node) => node.textContent)).toEqual(["Next run", "Ready", "Engine"]);
    expect(root.querySelector(".nc-schedules-queue__head")?.textContent).toContain("Schedule queue");
    expect(root.querySelector(".nc-schedules-queue__head")?.textContent).toContain("2 saved");
    expect(Array.from(root.querySelectorAll(".nc-schedule-row__status")).map((node) => node.textContent)).toEqual(["Ready", "Draft"]);
    expect(Array.from(root.querySelectorAll(".nc-schedule-row__meta")).map((node) => node.textContent)).toEqual(["Daily task · 09:30", "Weekly review"]);
    expect(root.textContent).toContain("Daily report");
    (root.querySelector('button[aria-label="Run"]') as HTMLButtonElement).click();
    expect(onRunSchedule).toHaveBeenCalledWith("daily_report");
    (root.querySelector('button[aria-label="Use"]') as HTMLButtonElement).click();
    expect(onUseSchedule).toHaveBeenCalledWith("daily_report");
    expect(root.querySelector('button[aria-label="Describe in chat"]')).not.toBeNull();
    expect(root.querySelector('button[aria-label="Schedules"]')?.getAttribute("aria-pressed")).toBe("true");
  });

  it("renders an empty schedules queue before schedule drafts exist", () => {
    const root = document.createElement("main");

    renderSidepanel(root, baseState({ view: "schedules", schedules: [] }));

    expect(root.querySelector(".nc-schedules-card__badge")?.textContent).toBe("0 saved");
    expect(root.textContent).toContain("No saved schedules yet.");
    expect(root.querySelectorAll(".nc-schedule-row")).toHaveLength(0);
  });

  it("hides model detection until an API key is entered", () => {
    const root = document.createElement("main");

    renderSidepanel(
      root,
      baseState({
        view: "settings",
        modelSettings: {
          providerBaseUrl: "https://api.openai.com/v1",
          apiKey: "",
          plannerModel: "",
          visionModel: "",
          apiKeyRef: "naturalclick:model-api-key"
        }
      })
    );

    expect(root.textContent).toContain("API Key");
    expect(root.querySelector('button[aria-label="Detect models"]')).toBeNull();
    expect(root.querySelector('button[aria-label="Save configuration"]')).not.toBeNull();
    expect((root.querySelector('button[aria-label="Save configuration"]') as HTMLButtonElement).disabled).toBe(true);
  });
});
