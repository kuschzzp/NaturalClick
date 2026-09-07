import { describe, expect, it } from "vitest";
import type { AgentEvent, AgentEventType } from "../../../src/core/events/events";
import {
  deriveSessionTitle,
  applyModelDetectionSuccessState,
  applyModelSettingChangeState,
  applyPlannerQuickPickState,
  buildRunDigest,
  buildTimelineItems,
  currentProjectionSessionIds,
  deriveActiveTaskFromEvents,
  deriveLatestModelStream,
  deriveRuntimeFlow,
  deriveSidepanelMode,
  isTaskInProgress,
  mapEventToTimelineItem,
  mergeSuppressedSessionIds,
  mergeRuntimeEventForSession,
  needsModelGuidance,
  openModelConfigEditorState,
  resolveStoredGeneralSettings,
  serializeGeneralSettings,
  shouldClearConversationForRemovedSessions,
  shouldRefreshSessionOnChatReturn,
  shouldRefreshSessionOnPanelVisible,
  shouldSuppressIncomingSession,
  type SidepanelState
} from "../../../src/sidepanel/state";

const base: SidepanelState = {
  mode: "conversation",
  overlayMode: "Off",
  safetyMode: "balanced",
  modelConfigured: true,
  traceOpen: false
};

function makeEvent(type: AgentEventType, payload: Record<string, unknown> = {}, overrides: Partial<AgentEvent> = {}): AgentEvent {
  return {
    id: `event-${type}`,
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

describe("sidepanel state", () => {
  it("derives a stable 15-character title from the first user prompt", () => {
    expect(deriveSessionTitle("  帮我   打开设置页面并修改默认语言，然后保存  ", "新对话")).toBe("帮我 打开设置页面并修改默认语...");
    expect(deriveSessionTitle("\n打开设置\n", "新对话")).toBe("打开设置");
    expect(deriveSessionTitle("", "新对话")).toBe("新对话");
  });

  it("uses conversation mode when no task is active", () => {
    expect(deriveSidepanelMode(base)).toBe("conversation");
  });

  it("uses workbench mode when a task is running", () => {
    expect(deriveSidepanelMode({ ...base, activeTask: { taskId: "task-1", status: "running" } })).toBe("workbench");
  });

  it("returns to conversation mode after completion when trace is closed", () => {
    expect(deriveSidepanelMode({ ...base, activeTask: { taskId: "task-1", status: "completed" } })).toBe("conversation");
  });

  it("keeps workbench mode while trace is open", () => {
    expect(deriveSidepanelMode({ ...base, traceOpen: true })).toBe("workbench");
  });

  it("shows model guidance when planner model is missing", () => {
    expect(needsModelGuidance({ ...base, modelConfigured: false })).toBe(true);
  });

  it("opens the model config editor from transient composer surfaces", () => {
    const next = openModelConfigEditorState({
      ...base,
      view: "chat",
      settingsTab: "search",
      modelConfigWizardOpen: false,
      toolMenuOpen: true,
      modelPickerOpen: true
    });

    expect(next).toMatchObject({
      view: "settings",
      settingsOpen: true,
      settingsTab: "configs",
      modelConfigWizardOpen: true,
      toolMenuOpen: false,
      modelPickerOpen: false
    });
  });

  it("opens a specific saved model instance as the editable model draft", () => {
    const next = openModelConfigEditorState(
      {
        ...base,
        view: "chat",
        modelSettings: {
          providerBaseUrl: "https://legacy.example.com/v1",
          apiKey: "sk-live",
          plannerModel: "legacy-model",
          visionModel: "",
          apiKeyRef: "naturalclick:model-api-key"
        },
        modelConfigState: {
          instances: [
            {
              id: "provider_a",
              provider: "custom",
              label: "Provider A",
              baseUrl: "https://a.example.com/v1",
              apiKeyRef: "secret:a",
              endpointVariant: "openai_compatible",
              models: [{ id: "planner-a", vision: false, tools: true, maxContextTokens: 128000 }]
            },
            {
              id: "provider_b",
              provider: "custom",
              label: "Provider B",
              baseUrl: "https://b.example.com/v1",
              apiKeyRef: "secret:b",
              endpointVariant: "openai_compatible",
              models: [{ id: "vision-b", vision: true, tools: false, maxContextTokens: 128000 }]
            }
          ],
          activeSelection: { instanceId: "provider_a", model: "planner-a" },
          roleSelections: {
            planner: { instanceId: "provider_a", model: "planner-a" },
            vision: { instanceId: "provider_b", model: "vision-b" }
          }
        }
      },
      "provider_b"
    );

    expect(next).toMatchObject({
      view: "settings",
      settingsOpen: true,
      settingsTab: "configs",
      modelConfigWizardOpen: true,
      editingModelInstanceId: "provider_b",
      modelSettings: {
        providerBaseUrl: "https://b.example.com/v1",
        apiKey: "sk-live",
        plannerModel: "vision-b",
        visionModel: "vision-b",
        apiKeyRef: "secret:b"
      },
      detectedModels: ["vision-b"],
      modelDetectionStatus: "success",
      modelPickerQuery: ""
    });
  });

  it("clears stale model picker query after successful model detection", () => {
    const next = applyModelDetectionSuccessState(
      {
        ...base,
        modelPickerOpen: true,
        modelPickerQuery: "missing-model",
        modelSettings: {
          providerBaseUrl: "https://api.example.com/v1",
          apiKey: "sk-test",
          plannerModel: "old-model",
          visionModel: "",
          apiKeyRef: "naturalclick:model-api-key"
        }
      },
      {
        modelSettings: {
          providerBaseUrl: "https://api.example.com/v1",
          apiKey: "sk-test",
          plannerModel: "qwen-max",
          visionModel: "",
          apiKeyRef: "naturalclick:model-api-key"
        },
        detectedModels: ["qwen-max", "deepseek-chat"],
        message: "Detected 2 models. Selected qwen-max; save configuration to apply.",
        unsavedMessage: "Unsaved changes"
      }
    );

    expect(next).toMatchObject({
      modelPickerOpen: true,
      modelPickerQuery: "",
      modelConfigured: false,
      settingsDirty: true,
      settingsSaveStatus: "idle",
      settingsSaveMessage: "Unsaved changes",
      modelSettingsDirty: true,
      modelDetectionStatus: "success",
      modelDetectionMessage: "Detected 2 models. Selected qwen-max; save configuration to apply.",
      modelSaveStatus: "idle",
      modelSaveMessage: "Unsaved changes",
      detectedModels: ["qwen-max", "deepseek-chat"]
    });
  });

  it("clears stale detected models and selected models after provider changes", () => {
    const next = applyModelSettingChangeState(
      {
        ...base,
        modelPickerQuery: "qwen",
        modelDetectionStatus: "success",
        modelDetectionMessage: "Detected 2 models.",
        detectedModels: ["qwen-max", "deepseek-chat"],
        modelSettings: {
          providerBaseUrl: "https://old.example.com/v1",
          apiKey: "sk-old",
          plannerModel: "qwen-max",
          visionModel: "qwen-vl",
          apiKeyRef: "naturalclick:model-api-key"
        }
      },
      {
        field: "providerBaseUrl",
        value: "https://new.example.com/v1",
        defaultSettings: {
          providerBaseUrl: "https://api.openai.com/v1",
          apiKey: "",
          plannerModel: "",
          visionModel: "",
          apiKeyRef: "naturalclick:model-api-key"
        },
        unsavedMessage: "Unsaved changes"
      }
    );

    expect(next).toMatchObject({
      modelSettings: {
        providerBaseUrl: "https://new.example.com/v1",
        apiKey: "sk-old",
        plannerModel: "",
        visionModel: "",
        apiKeyRef: "naturalclick:model-api-key"
      },
      modelConfigured: false,
      settingsDirty: true,
      settingsSaveStatus: "idle",
      settingsSaveMessage: "Unsaved changes",
      modelSettingsDirty: true,
      modelSaveStatus: "idle",
      modelSaveMessage: "Unsaved changes",
      modelDetectionStatus: "idle",
      modelDetectionMessage: undefined,
      detectedModels: [],
      modelPickerQuery: ""
    });
  });

  it("preserves detection state when only the planner model changes", () => {
    const next = applyModelSettingChangeState(
      {
        ...base,
        modelPickerQuery: "qwen",
        modelDetectionStatus: "success",
        modelDetectionMessage: "Detected 2 models.",
        detectedModels: ["qwen-max", "deepseek-chat"],
        modelSettings: {
          providerBaseUrl: "https://api.example.com/v1",
          apiKey: "sk-test",
          plannerModel: "qwen-max",
          visionModel: "",
          apiKeyRef: "naturalclick:model-api-key"
        }
      },
      {
        field: "plannerModel",
        value: "deepseek-chat",
        defaultSettings: {
          providerBaseUrl: "https://api.openai.com/v1",
          apiKey: "",
          plannerModel: "",
          visionModel: "",
          apiKeyRef: "naturalclick:model-api-key"
        },
        unsavedMessage: "Unsaved changes"
      }
    );

    expect(next).toMatchObject({
      modelSettings: {
        providerBaseUrl: "https://api.example.com/v1",
        apiKey: "sk-test",
        plannerModel: "deepseek-chat",
        visionModel: "",
        apiKeyRef: "naturalclick:model-api-key"
      },
      modelConfigured: false,
      settingsDirty: true,
      modelSettingsDirty: true,
      modelDetectionStatus: "success",
      modelDetectionMessage: "Detected 2 models.",
      detectedModels: ["qwen-max", "deepseek-chat"],
      modelPickerQuery: "qwen"
    });
  });

  it("preserves detected models when only the API protocol changes", () => {
    const next = applyModelSettingChangeState(
      {
        ...base,
        modelDetectionStatus: "success",
        modelDetectionMessage: "Detected 2 models.",
        detectedModels: ["gpt-5", "gpt-4.1"],
        modelSettings: {
          providerBaseUrl: "https://api.openai.com/v1",
          apiKey: "sk-test",
          plannerModel: "gpt-5",
          visionModel: "",
          apiKeyRef: "naturalclick:model-api-key",
          protocol: "auto"
        }
      },
      {
        field: "protocol",
        value: "responses",
        defaultSettings: {
          providerBaseUrl: "https://api.openai.com/v1",
          apiKey: "",
          plannerModel: "",
          visionModel: "",
          apiKeyRef: "naturalclick:model-api-key",
          protocol: "auto"
        },
        unsavedMessage: "Unsaved changes"
      }
    );

    expect(next.modelSettings?.protocol).toBe("responses");
    expect(next.detectedModels).toEqual(["gpt-5", "gpt-4.1"]);
    expect(next.modelDetectionStatus).toBe("success");
    expect(next.modelDetectionMessage).toBe("Detected 2 models.");
  });

  it("keeps quick-picked planner dirty when any persistence step fails", () => {
    const next = applyPlannerQuickPickState(
      {
        ...base,
        settingsDirty: true,
        modelSettingsDirty: true,
        modelPickerOpen: true,
        modelPickerQuery: "qwen",
        detectedModels: ["qwen-max", "deepseek-chat"]
      },
      {
        modelSettings: {
          providerBaseUrl: "https://api.example.com/v1",
          apiKey: "sk-test",
          plannerModel: "qwen-max",
          visionModel: "",
          apiKeyRef: "naturalclick:model-api-key"
        },
        modelConfigured: true,
        saved: false,
        savedMessage: "Settings saved.",
        missingModelMessage: "Planner missing.",
        storageErrorMessage: "Storage unavailable."
      }
    );

    expect(next).toMatchObject({
      modelPickerOpen: false,
      modelPickerQuery: "",
      modelSettingsDirty: true,
      settingsDirty: true,
      modelSaveStatus: "error",
      settingsSaveStatus: "error",
      modelSaveMessage: "Storage unavailable.",
      settingsSaveMessage: "Storage unavailable."
    });
  });

  it("marks quick-picked planner saved only when settings and candidate cache persist", () => {
    const next = applyPlannerQuickPickState(
      {
        ...base,
        settingsDirty: true,
        modelSettingsDirty: true,
        settingsSaveStatus: "idle",
        settingsSaveMessage: "Unsaved"
      },
      {
        modelSettings: {
          providerBaseUrl: "https://api.example.com/v1",
          apiKey: "sk-test",
          plannerModel: "qwen-max",
          visionModel: "",
          apiKeyRef: "naturalclick:model-api-key"
        },
        modelConfigured: true,
        saved: true,
        savedMessage: "Settings saved.",
        missingModelMessage: "Planner missing.",
        storageErrorMessage: "Storage unavailable."
      }
    );

    expect(next).toMatchObject({
      modelSettingsDirty: false,
      settingsDirty: false,
      modelSaveStatus: "saved",
      settingsSaveStatus: "saved",
      modelSaveMessage: "Settings saved.",
      settingsSaveMessage: "Settings saved."
    });
  });

  it("derives active runtime flow node", () => {
    const flow = deriveRuntimeFlow({ ...base, activeTask: { taskId: "task-1", status: "running", activeNodeId: "plan" } });

    expect(flow.find((node) => node.id === "start")?.status).toBe("done");
    expect(flow.find((node) => node.id === "plan")?.status).toBe("active");
    expect(flow.find((node) => node.id === "act")?.status).toBe("waiting");
  });

  it("maps agent events to English timeline items by default", () => {
    const item = mapEventToTimelineItem(makeEvent("ObservationReceived", { summary: "发现 3 个候选按钮" }));

    expect(item.title).toBe("Page observation completed");
    expect(item.detail).toBe("发现 3 个候选按钮");
    expect(item.tone).toBe("info");
  });

  it("maps agent events to Chinese timeline items when requested", () => {
    const item = mapEventToTimelineItem(makeEvent("ObservationReceived", { summary: "发现 3 个候选按钮" }), "zh-CN");

    expect(item.title).toBe("页面观察完成");
    expect(item.detail).toBe("发现 3 个候选按钮");
  });

  it("explains how to resume when the bound task tab is closed", () => {
    const item = mapEventToTimelineItem(makeEvent("RuntimeSuspended", { reason: "task_tab_closed" }), "zh-CN");

    expect(item.title).toBe("运行时已挂起");
    expect(item.detail).toContain("任务页面已关闭");
    expect(item.detail).toContain("点击继续");
  });

  it("shows the applied continuation multiplier after resuming a budget-limited task", () => {
    const item = mapEventToTimelineItem(makeEvent("RuntimeResumed", { reason: "user_requested", budgetMultiplier: 4 }), "zh-CN");

    expect(item.detail).toContain("4×");
  });

  it("summarizes smart observation retrieval details in Chinese", () => {
    const item = mapEventToTimelineItem(
      makeEvent("ObservationReceived", {
        controls: 12,
        candidateLimit: 320,
        retrieval: {
          query: "订单 管理",
          scope: "sidebar",
          candidateLimit: 320,
          totalControls: 900,
          returnedControls: 12,
          omittedControls: 888,
          totalTextBlocks: 80,
          returnedTextBlocks: 6,
          omittedTextBlocks: 74,
          strategy: "request_ranked"
        }
      }),
      "zh-CN"
    );

    expect(item.detail).toContain("订单 管理");
    expect(item.detail).toContain("sidebar");
    expect(item.detail).toContain("12/900");
  });

  it("summarizes smart observation retrieval details in English", () => {
    const item = mapEventToTimelineItem(
      makeEvent("ObservationReceived", {
        controls: 12,
        candidateLimit: 320,
        retrieval: {
          query: "orders",
          scope: "sidebar",
          candidateLimit: 320,
          totalControls: 900,
          returnedControls: 12,
          omittedControls: 888,
          totalTextBlocks: 80,
          returnedTextBlocks: 6,
          omittedTextBlocks: 74,
          strategy: "request_ranked"
        }
      }),
      "en"
    );

    expect(item.detail).toContain("orders");
    expect(item.detail).toContain("sidebar");
    expect(item.detail).toContain("12/900");
  });

  it("compacts noisy evidence and model progress events in timeline", () => {
    const events = [
      makeEvent("TaskStarted", { taskText: "打开百度" }),
      makeEvent("EvidenceAdded", { evidence: { kind: "control_presence" } }),
      makeEvent("EvidenceAdded", { evidence: { kind: "control_presence" } }),
      makeEvent("EvidenceAdded", { evidence: { kind: "content_fact" } }),
      makeEvent("ModelCallProgress", { chunk: '{"type":"', chunkIndex: 1, receivedChars: 9 }),
      makeEvent("ModelCallProgress", { chunk: "FinishTask\"}", chunkIndex: 2, receivedChars: 21 }),
      makeEvent("ModelCallCompleted", { outputChars: 42 })
    ];

    const timeline = buildTimelineItems(events, "zh-CN");

    expect(timeline.map((item) => item.title)).toEqual(["任务开始", "证据已更新", "模型正在输出", "模型调用完成"]);
    expect(timeline[1].detail).toContain("3 条证据");
    expect(timeline[2].detail).toContain("2 个片段");
  });

  it("builds a human-readable run digest from noisy runtime events", () => {
    const events = [
      makeEvent("TaskStarted", { taskText: "打开客户管理" }, { id: "start", timestamp: 1 }),
      makeEvent("ModelCallStarted", { model: "glm-5.2" }, { id: "model-start-1", timestamp: 2 }),
      makeEvent("ModelCallProgress", { chunk: "{", chunkIndex: 1, receivedChars: 1 }, { id: "chunk-1", timestamp: 3 }),
      makeEvent("ModelCallProgress", { chunk: "}", chunkIndex: 2, receivedChars: 2 }, { id: "chunk-2", timestamp: 4 }),
      makeEvent("ModelCallCompleted", { durationMs: 22300, outputChars: 120 }, { id: "model-done-1", timestamp: 5 }),
      makeEvent("ObservationReceived", { controls: 130, durationMs: 2520 }, { id: "observe-1", timestamp: 6 }),
      makeEvent("EvidenceAdded", { evidence: { kind: "control_presence" } }, { id: "evidence-1", timestamp: 7 }),
      makeEvent("EvidenceAdded", { evidence: { kind: "content_fact" } }, { id: "evidence-2", timestamp: 8 }),
      makeEvent("CommandIssued", { commandName: "点击客户管理" }, { id: "command", timestamp: 9 }),
      makeEvent("TaskStopped", { reason: "user_requested" }, { id: "stopped", timestamp: 10 })
    ];

    const digest = buildRunDigest(events, buildTimelineItems(events, "zh-CN"), "zh-CN");

    expect(digest.metrics.map((metric) => [metric.id, metric.value])).toEqual([
      ["events", "10"],
      ["modelCalls", "1"],
      ["observations", "1"],
      ["slowCalls", "2"],
      ["hiddenNoise", "4"]
    ]);
    expect(digest.summary).toContain("user_requested");
    expect(digest.recentSteps.map((step) => step.title)).toEqual(["任务开始", "页面观察完成", "正在执行动作", "任务已停止"]);
  });

  it("derives the latest streamed model output from progress chunks", () => {
    const stream = deriveLatestModelStream(
      [
        makeEvent("ModelCallStarted", { role: "planner", model: "qwen3.7-max" }),
        makeEvent("ModelCallProgress", { role: "planner", model: "qwen3.7-max", chunk: "hello", chunkIndex: 1, receivedChars: 5 }),
        makeEvent("ModelCallProgress", { role: "planner", model: "qwen3.7-max", chunk: " world", chunkIndex: 2, receivedChars: 11 })
      ],
      "en"
    );

    expect(stream?.title).toBe("Model streaming");
    expect(stream?.text).toBe("hello world");
    expect(stream?.isStreaming).toBe(true);
    expect(stream?.chunkCount).toBe(2);
    expect(stream?.model).toBe("qwen3.7-max");
  });

  it("derives visible Planner stage, protocol, and elapsed time from heartbeat progress", () => {
    const stream = deriveLatestModelStream([
      makeEvent("ModelCallStarted", { role: "planner", model: "gpt-5", protocol: "responses", stage: "connecting" }),
      makeEvent("ModelCallProgress", {
        role: "planner",
        model: "gpt-5",
        protocol: "responses",
        stage: "waiting_model_output",
        elapsedMs: 12_000,
        chunkIndex: 0,
        receivedChars: 0
      })
    ], "zh-CN");

    expect(stream).toMatchObject({
      stage: "waiting_model_output",
      phase: "waiting",
      protocol: "responses",
      elapsedMs: 12_000,
      isStreaming: true
    });
  });

  it("keeps reasoning, answer content, and tool arguments in separate model streams", () => {
    const stream = deriveLatestModelStream([
      makeEvent("ModelCallStarted", { role: "planner", model: "deepseek-reasoner" }),
      makeEvent("ModelCallProgress", {
        role: "planner",
        reasoningChunk: "先理解用户目标。",
        contentChunk: "",
        toolArgumentsChunk: "",
        chunk: "先理解用户目标。",
        streamKinds: ["reasoning"],
        chunkIndex: 1,
        receivedChars: 8
      }),
      makeEvent("ModelCallProgress", {
        role: "planner",
        reasoningChunk: "",
        contentChunk: "我会先检查页面。",
        toolArgumentsChunk: '{"mode":"atlas"}',
        chunk: '我会先检查页面。{"mode":"atlas"}',
        streamKinds: ["content", "tool_arguments"],
        chunkIndex: 2,
        receivedChars: 32,
        toolCallNames: ["read_page"]
      })
    ]);

    expect(stream).toMatchObject({
      reasoningText: "先理解用户目标。",
      contentText: "我会先检查页面。",
      toolArgumentsText: '{"mode":"atlas"}',
      text: "我会先检查页面。",
      phase: "answering",
      toolNames: ["read_page"]
    });
  });

  it("uses completion preview when a provider does not stream progress chunks", () => {
    const stream = deriveLatestModelStream([makeEvent("ModelCallCompleted", { outputPreview: '{"type":"FinishTask"}', outputChars: 21 })], "en");

    expect(stream?.text).toBe('{"type":"FinishTask"}');
    expect(stream?.isStreaming).toBe(false);
  });

  it("caps long streamed output and keeps streamed tool names", () => {
    const stream = deriveLatestModelStream([
      makeEvent("ModelCallStarted", { role: "planner", model: "qwen3.7-max" }),
      makeEvent("ModelCallProgress", {
        role: "planner",
        model: "qwen3.7-max",
        chunk: `prefix-${"x".repeat(12_100)}`,
        chunkIndex: 1,
        receivedChars: 12_107,
        toolCallNames: ["read_page"]
      })
    ], "en");

    expect(stream?.text.length).toBe(12_000);
    expect(stream?.text.startsWith("x")).toBe(true);
    expect(stream?.truncated).toBe(true);
    expect(stream?.toolNames).toEqual(["read_page"]);
    expect(stream?.receivedChars).toBe(12_107);
  });

  it("derives active task projection from events", () => {
    const activeTask = deriveActiveTaskFromEvents([makeEvent("TaskStarted", { taskText: "打开设置" })]);

    expect(activeTask?.activeNodeId).toBe("start");
    expect(activeTask?.currentAction).toBe("打开设置");
    expect(activeTask?.status).toBe("interpreting");
  });

  it("keeps the latest meaningful phase across noisy model and evidence events", () => {
    const observing = deriveActiveTaskFromEvents([
      makeEvent("TaskStarted", { taskText: "打开设置" }, { id: "start" }),
      makeEvent("ObservationRequested", { instruction: "检查当前页面" }, { id: "observe" }),
      makeEvent("ModelCallProgress", { chunk: "{", chunkIndex: 1 }, { id: "chunk" })
    ]);
    const executing = deriveActiveTaskFromEvents([
      makeEvent("TaskStarted", { taskText: "打开设置" }, { id: "start" }),
      makeEvent("CommandIssued", { commandName: "点击设置" }, { id: "command" }),
      makeEvent("EvidenceAdded", { evidence: { kind: "control_presence" } }, { id: "evidence" }),
      makeEvent("ModelCallCompleted", { outputChars: 42 }, { id: "model-done" })
    ]);

    expect(observing?.status).toBe("observing");
    expect(observing?.currentAction).toBe("检查当前页面");
    expect(executing?.status).toBe("executing");
    expect(executing?.currentAction).toBe("点击设置");
  });

  it("shows recovered background interruptions as paused instead of running", () => {
    const activeTask = deriveActiveTaskFromEvents([
      makeEvent("TaskStarted", { taskText: "打开客户管理" }),
      makeEvent("RuntimeSuspended", {
        reason: "background_recovered_without_controller",
        lastEventType: "ModelCallStarted"
      })
    ]);

    expect(activeTask?.status).toBe("paused");
    expect(activeTask?.activeNodeId).toBe("reply");
    expect(isTaskInProgress(activeTask?.status)).toBe(true);
  });

  it("marks failed command results and failed verification as errors", () => {
    const commandResult = mapEventToTimelineItem(makeEvent("CommandResultReceived", { result: { status: "failed" } }), "zh-CN");
    const verification = mapEventToTimelineItem(makeEvent("VerificationProduced", { status: "failed", failureReason: "element_not_found" }), "zh-CN");

    expect(commandResult.tone).toBe("error");
    expect(commandResult.detail).toContain("执行/结果校验");
    expect(verification.tone).toBe("error");
    expect(verification.detail).toContain("执行/结果校验");
    expect(deriveActiveTaskFromEvents([makeEvent("VerificationProduced", { status: "failed" })])?.status).toBe("failed");
  });

  it("classifies model contract and binding failures with actionable details", () => {
    const contract = mapEventToTimelineItem(makeEvent("TaskFailed", { reason: "invalid_contract" }), "zh-CN");
    const binding = mapEventToTimelineItem(makeEvent("RecoverySuggested", { reason: "bind_failed_replan", bindingError: "target_not_found" }), "en");

    expect(contract.detail).toContain("Planner 结构不匹配");
    expect(contract.detail).toContain("Schema");
    expect(binding.detail).toContain("Observation / binding");
    expect(binding.detail).toContain("target_not_found");
  });

  it("uses command binding targetRef as the highlight target", () => {
    const activeTask = deriveActiveTaskFromEvents([makeEvent("CommandBound", { targetRef: "control_2_login", targetLabel: "登录" })]);

    expect(activeTask?.semanticTargetId).toBe("control_2_login");
    expect(activeTask?.targetLabel).toBe("登录");
  });

  it("starts a fresh runtime event list when a new session streams in", () => {
    const oldFailure = makeEvent("TaskFailed", { reason: "target_not_interactable" }, { id: "old-failure" });
    const newStart = makeEvent("TaskStarted", { taskText: "重新执行" }, { id: "new-start", sessionId: "session-2", taskId: "task-2" });

    const events = mergeRuntimeEventForSession([oldFailure], newStart);

    expect(events).toEqual([newStart]);
  });

  it("deduplicates runtime events within the same session", () => {
    const first = makeEvent("TaskStarted", { taskText: "打开页面" }, { id: "same-event" });
    const updated = makeEvent("TaskStarted", { taskText: "打开页面" }, { id: "same-event", timestamp: 2 });

    const events = mergeRuntimeEventForSession([first], updated);

    expect(events).toEqual([updated]);
  });

  it("detects when a removed history session should clear the chat projection", () => {
    const state: SidepanelState = {
      ...base,
      activeSessionId: "session-1",
      activeTask: { taskId: "task-1", status: "completed" },
      lastSessionEvents: [makeEvent("TaskCompleted")]
    };

    expect(shouldClearConversationForRemovedSessions(state, ["session-1"])).toBe(true);
    expect(shouldClearConversationForRemovedSessions(state, ["session-2"])).toBe(false);
  });

  it("detects removed history sessions from the last event stream when active id was cleared", () => {
    const state: SidepanelState = {
      ...base,
      activeTask: { taskId: "task-1", status: "completed" },
      lastSessionEvents: [
        makeEvent("TaskStarted", { taskText: "打开页面" }, { id: "start", sessionId: "session-1" }),
        makeEvent("TaskCompleted", { summary: "完成" }, { id: "done", sessionId: "session-1" })
      ]
    };

    expect(currentProjectionSessionIds(state)).toEqual(["session-1"]);
    expect(shouldClearConversationForRemovedSessions(state, ["session-1"])).toBe(true);
  });

  it("keeps running conversations visible even when their history summary is removed", () => {
    const state: SidepanelState = {
      ...base,
      activeSessionId: "session-1",
      activeTask: { taskId: "task-1", status: "running" }
    };

    expect(isTaskInProgress(state.activeTask?.status)).toBe(true);
    expect(shouldClearConversationForRemovedSessions(state, ["session-1"])).toBe(false);
  });

  it("suppresses stale runtime sessions after the user starts a blank new chat", () => {
    const suppressedSessionIds = mergeSuppressedSessionIds(undefined, ["session-1", "session-1", ""]);

    expect(suppressedSessionIds).toEqual(["session-1"]);
    expect(shouldSuppressIncomingSession({ ...base, suppressedSessionIds }, "session-1")).toBe(true);
    expect(shouldSuppressIncomingSession({ ...base, suppressedSessionIds }, "session-2")).toBe(false);
  });

  it("does not refresh an intentionally blank new chat from the previous runtime session", () => {
    expect(shouldRefreshSessionOnChatReturn({ ...base, activeSessionId: undefined, activeTask: undefined })).toBe(false);
    expect(shouldRefreshSessionOnChatReturn({ ...base, activeSessionId: "session-1" })).toBe(true);
    expect(shouldRefreshSessionOnChatReturn({ ...base, activeTask: { taskId: "task-1", status: "running" } })).toBe(true);
  });

  it("refreshes instead of creating a blank session when the panel becomes visible again", () => {
    expect(shouldRefreshSessionOnPanelVisible({ ...base, activeSessionId: undefined, activeTask: undefined })).toBe(false);
    expect(shouldRefreshSessionOnPanelVisible({ ...base, activeSessionId: "session-1" })).toBe(true);
    expect(shouldRefreshSessionOnPanelVisible({ ...base, activeTask: { taskId: "task-1", status: "running" } })).toBe(true);
  });

  it("preserves explicitly saved page marker settings across reloads", () => {
    const defaults = { overlayMode: "Focus" as const, safetyMode: "experimental_full_auto" as const, themeMode: "light" as const };
    const serialized = serializeGeneralSettings({ overlayMode: "All Targets", safetyMode: "balanced", themeMode: "dark" });

    expect(resolveStoredGeneralSettings(JSON.parse(serialized), defaults)).toEqual({
      overlayMode: "All Targets",
      safetyMode: "balanced",
      themeMode: "dark"
    });
  });

  it("uses the light theme only when no valid theme preference is stored", () => {
    const defaults = { overlayMode: "Focus" as const, safetyMode: "experimental_full_auto" as const, themeMode: "light" as const };

    expect(resolveStoredGeneralSettings(undefined, defaults).themeMode).toBe("light");
    expect(resolveStoredGeneralSettings({ themeMode: "dark" }, defaults).themeMode).toBe("dark");
    expect(resolveStoredGeneralSettings({ themeMode: "system" }, defaults).themeMode).toBe("system");
  });

  it("migrates only legacy all-target marker settings back to the safe default", () => {
    const defaults = { overlayMode: "Focus" as const, safetyMode: "experimental_full_auto" as const, themeMode: "system" as const };

    expect(resolveStoredGeneralSettings({ overlayMode: "All Targets", safetyMode: "balanced" }, defaults)).toEqual({
      overlayMode: "Focus",
      safetyMode: "balanced",
      themeMode: "system"
    });
    expect(resolveStoredGeneralSettings({ overlayMode: "Focus", safetyMode: "balanced", themeMode: "light" }, defaults)).toEqual({
      overlayMode: "Focus",
      safetyMode: "balanced",
      themeMode: "light"
    });
  });
});
