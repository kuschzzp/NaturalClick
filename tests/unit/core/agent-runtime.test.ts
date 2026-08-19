import { describe, expect, it } from "vitest";
import { MemoryEventStore } from "../../../src/core/events/memory-event-store";
import type { PageModel } from "../../../src/core/observation/page-model";
import { initialCapabilities } from "../../../src/core/capabilities/registry";
import { AgentRuntime } from "../../../src/core/runtime/agent-runtime";
import { ExecutionController } from "../../../src/core/runtime/execution-controller";

const page: PageModel = {
  pageIdentity: {
    url: "https://example.test",
    title: "Fixture",
    origin: "https://example.test",
    path: "/"
  },
  viewport: { width: 1280, height: 720, scrollX: 0, scrollY: 0, deviceScaleFactor: 1 },
  feedback: [],
  readableContent: [],
  textBlocks: [],
  forms: [],
  riskSignals: [],
  capturedAt: 1,
  controls: [
    {
      semanticId: "settings_button",
      role: "button",
      label: "Settings",
      accessibleName: "Settings",
      elementTag: "button",
      disabled: false,
      required: false,
      visibility: "visible",
      interactionHints: ["button"],
      locatorHints: [{ kind: "css", value: "#settings" }],
      confidence: 0.9
    }
  ]
};

describe("AgentRuntime", () => {
  it("passes current-session conversation history to every planner call", async () => {
    const store = new MemoryEventStore();
    const plannerHistory: unknown[] = [];
    const runtime = new AgentRuntime({
      sessionId: "session-history",
      taskId: "task-current",
      appendEvent: (event) => store.append(event),
      observePage: async () => page,
      plan: async (input) => {
        plannerHistory.push(input.conversationHistory);
        return { type: "FinishTask", summary: "Continued from the earlier result.", evidenceRefs: [] };
      },
      execute: async () => ({ status: "success", details: {} })
    });

    const history = [
      { taskId: "task-previous", role: "user" as const, content: "Open the customer list" },
      { taskId: "task-previous", role: "assistant" as const, content: "The customer list is open." }
    ];
    await runtime.startTask("Continue with the first customer", { conversationHistory: history });
    await runtime.runNextStep();

    expect(plannerHistory).toEqual([history]);
  });

  it("records attached file metadata on task start without reading file contents", async () => {
    const store = new MemoryEventStore();
    const runtime = new AgentRuntime({
      sessionId: "session-attachments",
      taskId: "task-attachments",
      appendEvent: (event) => store.append(event),
      observePage: async () => page,
      plan: async () => {
        throw new Error("planner should not run during startTask");
      },
      execute: async () => ({ status: "success", details: {} })
    });

    await runtime.startTask("Summarize the attached brief", {
      attachments: [
        {
          id: "attachment-1",
          filename: "brief.pdf",
          mime: "application/pdf",
          size: 2400000,
          createdAt: 1,
          textPreview: "file content should not be logged",
          textPreviewChars: 33,
          textTruncated: false
        }
      ]
    });

    const events = await store.loadAfter("session-attachments", "task-attachments");
    expect(events.find((event) => event.type === "TaskStarted")?.payload).toEqual({
      taskText: "Summarize the attached brief",
      attachments: [{ id: "attachment-1", filename: "brief.pdf", mime: "application/pdf", size: 2400000, createdAt: 1 }]
    });
    expect(JSON.stringify(events)).not.toContain("file content");
  });

  it("passes sanitized attachment previews to the planner", async () => {
    const store = new MemoryEventStore();
    let plannerAttachments: unknown;
    const runtime = new AgentRuntime({
      sessionId: "session-attachment-preview",
      taskId: "task-attachment-preview",
      appendEvent: (event) => store.append(event),
      observePage: async () => page,
      plan: async (input) => {
        plannerAttachments = input.attachments;
        return {
          type: "FinishTask",
          summary: "Read the attachment preview.",
          evidenceRefs: []
        };
      },
      execute: async () => ({ status: "success", details: {} })
    });

    await runtime.startTask("Use the attached notes", {
      attachments: [
        {
          id: "notes-1",
          filename: "notes.md",
          mime: "text/markdown",
          size: 1200,
          createdAt: 1,
          textPreview: "alpha beta",
          textPreviewChars: 10,
          textTruncated: false
        }
      ]
    });
    const result = await runtime.runNextStep();

    const events = await store.loadAfter("session-attachment-preview", "task-attachment-preview");
    expect(result.status).toBe("completed");
    expect(plannerAttachments).toEqual([
      {
        id: "notes-1",
        filename: "notes.md",
        mime: "text/markdown",
        size: 1200,
        createdAt: 1,
        textPreview: "alpha beta",
        textPreviewChars: 10,
        textTruncated: false
      }
    ]);
    expect(JSON.stringify(events.find((event) => event.type === "TaskStarted")?.payload)).not.toContain("alpha beta");
  });

  it("runs one observe-plan-bind-policy-execute-verify step", async () => {
    const store = new MemoryEventStore();
    const runtime = new AgentRuntime({
      sessionId: "session-1",
      taskId: "task-1",
      appendEvent: (event) => store.append(event),
      observePage: async () => page,
      plan: async () => ({
        taskUnderstanding: "open settings",
        activeSubgoal: "open settings panel",
        shortPlan: ["find settings", "open settings"],
        nextCommand: {
          type: "ActivateTarget",
          targetGoal: "Settings",
          inputs: {}
        },
        expectedOutcome: "settings panel opens",
        successCriteria: ["target_visible"],
        riskHint: "low",
        missingInfo: [],
        assumptions: [],
        reasoningSummary: "Settings button is visible"
      }),
      execute: async () => ({ status: "success", details: { clicked: true } })
    });

    await runtime.startTask("Open settings");
    const result = await runtime.runNextStep();

    const events = await store.loadAfter("session-1", "task-1");
    expect(result.actionKey).toBe("activatetarget:settings");
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "TaskStarted",
        "TaskInterpreted",
        "ObservationRequested",
        "ObservationReceived",
        "EvidenceAdded",
        "PlanRequested",
        "PlanProduced",
        "CommandBound",
        "PolicyEvaluated",
        "CommandIssued",
        "CommandResultReceived",
        "VerificationProduced"
      ])
    );
    expect(events.find((event) => event.type === "VerificationProduced")?.payload.status).toBe("success");
  });

  it("stops before executing a command when the runtime abort signal fires after planning", async () => {
    const store = new MemoryEventStore();
    const abortController = new AbortController();
    let controller: ExecutionController | undefined;
    let executeCount = 0;
    const runtime = new AgentRuntime({
      sessionId: "session-abort-before-execute",
      taskId: "task-abort-before-execute",
      abortSignal: abortController.signal,
      appendEvent: (event) => store.append(event),
      observePage: async () => page,
      plan: async () => {
        controller?.stop("user_requested");
        abortController.abort();
        return {
          taskUnderstanding: "open settings",
          activeSubgoal: "open settings panel",
          shortPlan: ["find settings", "open settings"],
          nextCommand: {
            type: "ActivateTarget",
            targetGoal: "Settings",
            inputs: {}
          },
          expectedOutcome: "settings panel opens",
          successCriteria: ["target_visible"],
          riskHint: "low",
          missingInfo: [],
          assumptions: [],
          reasoningSummary: "Settings button is visible"
        };
      },
      execute: async () => {
        executeCount += 1;
        return { status: "success", details: { clicked: true } };
      }
    });
    controller = new ExecutionController({
      sessionId: "session-abort-before-execute",
      taskId: "task-abort-before-execute",
      runtime,
      appendEvent: (event) => store.append(event)
    });

    const result = await controller.startTask("Open settings");
    const events = await store.loadAfter("session-abort-before-execute", "task-abort-before-execute");

    expect(result).toMatchObject({ status: "stopped", reason: "user_requested" });
    expect(executeCount).toBe(0);
    expect(events.map((event) => event.type)).toContain("TaskStopped");
    expect(events.map((event) => event.type)).not.toContain("CommandIssued");
    expect(events.map((event) => event.type)).not.toContain("CommandResultReceived");
  });

  it("returns stopped when an in-flight primitive execution aborts", async () => {
    const store = new MemoryEventStore();
    const abortController = new AbortController();
    let controller: ExecutionController | undefined;
    const runtime = new AgentRuntime({
      sessionId: "session-abort-during-execute",
      taskId: "task-abort-during-execute",
      abortSignal: abortController.signal,
      appendEvent: (event) => store.append(event),
      observePage: async () => page,
      plan: async () => ({
        taskUnderstanding: "open settings",
        activeSubgoal: "open settings panel",
        shortPlan: ["open settings"],
        nextCommand: {
          type: "ActivateTarget",
          targetGoal: "Settings",
          inputs: {}
        },
        expectedOutcome: "settings panel opens",
        successCriteria: ["target_visible"],
        riskHint: "low",
        missingInfo: [],
        assumptions: [],
        reasoningSummary: "Settings button is visible"
      }),
      execute: async () => {
        controller?.stop("user_requested");
        abortController.abort();
        throw new Error("task_stopped");
      }
    });
    controller = new ExecutionController({
      sessionId: "session-abort-during-execute",
      taskId: "task-abort-during-execute",
      runtime,
      appendEvent: (event) => store.append(event)
    });

    const result = await controller.startTask("Open settings");
    const events = await store.loadAfter("session-abort-during-execute", "task-abort-during-execute");

    expect(result).toMatchObject({ status: "stopped", reason: "user_requested" });
    expect(events.map((event) => event.type)).toContain("CommandIssued");
    expect(events.map((event) => event.type)).toContain("TaskStopped");
    expect(events.map((event) => event.type)).not.toContain("CommandResultReceived");
    expect(events.map((event) => event.type)).not.toContain("TaskFailed");
  });

  it("reuses the after-command observation for the next planner turn", async () => {
    const store = new MemoryEventStore();
    let observeCount = 0;
    let planCount = 0;
    const afterPage: PageModel = {
      ...page,
      capturedAt: 2,
      pageIdentity: {
        ...page.pageIdentity,
        title: "Fixture after click"
      }
    };
    const runtime = new AgentRuntime({
      sessionId: "session-reuse-observation",
      taskId: "task-reuse-observation",
      appendEvent: (event) => store.append(event),
      observePage: async () => {
        observeCount += 1;
        return observeCount === 1 ? page : afterPage;
      },
      plan: async (input) => {
        planCount += 1;
        if (planCount === 2) {
          expect(input.page).toBe(afterPage);
          return {
            type: "FinishTask",
            summary: "Settings is visible.",
            evidenceRefs: []
          };
        }
        return {
          taskUnderstanding: "open settings",
          activeSubgoal: "open settings panel",
          shortPlan: ["find settings", "open settings"],
          nextCommand: {
            type: "ActivateTarget",
            targetGoal: "Settings",
            inputs: {}
          },
          expectedOutcome: "settings panel opens",
          successCriteria: ["target_visible"],
          riskHint: "low",
          missingInfo: [],
          assumptions: [],
          reasoningSummary: "Settings button is visible"
        };
      },
      execute: async () => ({ status: "success", details: { clicked: true } })
    });

    await runtime.startTask("Open settings");
    const firstResult = await runtime.runNextStep();
    const secondResult = await runtime.runNextStep();
    expect(firstResult.status).toBe("continue");
    expect(firstResult.metrics).toEqual({ modelCalls: 1, observationRounds: 2 });
    expect(secondResult.status).toBe("completed");
    expect(secondResult.metrics).toEqual({ modelCalls: 1, observationRounds: 0 });

    const events = await store.loadAfter("session-reuse-observation", "task-reuse-observation");
    expect(observeCount).toBe(2);
    expect(events.filter((event) => event.type === "ObservationRequested").map((event) => event.payload.reason)).toContain("before_step_reuse");
    expect(events.filter((event) => event.type === "ObservationReceived" && event.payload.cached === true)).toHaveLength(1);
  });

  it("counts planner port envelope metrics instead of assuming one model call", async () => {
    const store = new MemoryEventStore();
    const runtime = new AgentRuntime({
      sessionId: "session-planner-envelope",
      taskId: "task-planner-envelope",
      appendEvent: (event) => store.append(event),
      observePage: async () => page,
      plan: async () => ({
        turn: {
          type: "FinishTask",
          summary: "Settings is already visible.",
          evidenceRefs: []
        },
        metrics: {
          modelCalls: 3
        }
      }),
      execute: async () => ({ status: "success", details: {} })
    });

    await runtime.startTask("Open settings");
    const result = await runtime.runNextStep();

    expect(result).toMatchObject({
      status: "completed",
      metrics: { modelCalls: 3, observationRounds: 1 }
    });
  });

  it("re-observes and replans instead of failing immediately on ambiguous DOM targets", async () => {
    const store = new MemoryEventStore();
    let observeCount = 0;
    let planCount = 0;
    let executeCount = 0;
    const ambiguousPage: PageModel = {
      ...page,
      controls: [
        { ...page.controls[0], semanticId: "save_top", label: "Save", accessibleName: "Save", locatorHints: [{ kind: "css", value: "#save-top" }] },
        { ...page.controls[0], semanticId: "save_bottom", label: "Save", accessibleName: "Save", locatorHints: [{ kind: "css", value: "#save-bottom" }] }
      ]
    };
    const resolvedPage: PageModel = {
      ...page,
      capturedAt: 2,
      controls: [
        { ...page.controls[0], semanticId: "save_top", label: "Save", accessibleName: "Save", locatorHints: [{ kind: "css", value: "#save-top" }] }
      ]
    };
    const runtime = new AgentRuntime({
      sessionId: "session-ambiguous-recover",
      taskId: "task-ambiguous-recover",
      appendEvent: (event) => store.append(event),
      observePage: async () => {
        observeCount += 1;
        return observeCount === 1 ? ambiguousPage : resolvedPage;
      },
      plan: async (input) => {
        planCount += 1;
        if (planCount === 2) {
          expect(input.observationRequests?.at(-1)).toEqual(
            expect.objectContaining({
              reason: "ambiguous_target",
              targetTextHints: expect.arrayContaining(["Save", "save_top", "save_bottom"]),
              ambiguousCandidates: expect.arrayContaining([
                expect.objectContaining({ semanticId: "save_top", label: "Save", role: "button" }),
                expect.objectContaining({ semanticId: "save_bottom", label: "Save", role: "button" })
              ])
            })
          );
        }
        return {
          taskUnderstanding: "save changes",
          activeSubgoal: "activate the save button",
          shortPlan: ["click Save"],
          nextCommand: {
            type: "ActivateTarget",
            targetGoal: "Save",
            inputs: {}
          },
          expectedOutcome: "Save remains visible after activation",
          successCriteria: ["target_visible"],
          riskHint: "low",
          missingInfo: [],
          assumptions: [],
          reasoningSummary: "Save button should be activated."
        };
      },
      execute: async () => {
        executeCount += 1;
        return { status: "success", details: { primitive: "dom_click" } };
      }
    });

    await runtime.startTask("Save changes");
    const result = await runtime.runNextStep();
    const events = await store.loadAfter("session-ambiguous-recover", "task-ambiguous-recover");

    expect(result.status).toBe("continue");
    expect(result.metrics).toEqual({ modelCalls: 2, observationRounds: 3 });
    expect(observeCount).toBe(3);
    expect(executeCount).toBe(1);
    expect(events.filter((event) => event.type === "RecoverySuggested").map((event) => event.payload.bindingError)).toContain("ambiguous_target");
    expect(events.find((event) => event.type === "RecoverySuggested" && event.payload.bindingError === "ambiguous_target")?.payload.details).toEqual(
      expect.objectContaining({
        candidates: expect.arrayContaining([
          expect.objectContaining({ semanticId: "save_top" }),
          expect.objectContaining({ semanticId: "save_bottom" })
        ])
      })
    );
    expect(events.find((event) => event.type === "TaskFailed")).toBeUndefined();
  });

  it("stops repeating an identical recovery observation request when ambiguity persists", async () => {
    const store = new MemoryEventStore();
    let observeCount = 0;
    const ambiguousPage: PageModel = {
      ...page,
      controls: [
        { ...page.controls[0], semanticId: "save_top", label: "Save", accessibleName: "Save", locatorHints: [{ kind: "css", value: "#save-top" }] },
        { ...page.controls[0], semanticId: "save_bottom", label: "Save", accessibleName: "Save", locatorHints: [{ kind: "css", value: "#save-bottom" }] }
      ]
    };
    const runtime = new AgentRuntime({
      sessionId: "session-ambiguous-repeated",
      taskId: "task-ambiguous-repeated",
      appendEvent: (event) => store.append(event),
      observePage: async () => {
        observeCount += 1;
        return ambiguousPage;
      },
      plan: async () => ({
        taskUnderstanding: "save changes",
        activeSubgoal: "activate the save button",
        shortPlan: ["click Save"],
        nextCommand: {
          type: "ActivateTarget",
          targetGoal: "Save",
          inputs: {}
        },
        expectedOutcome: "Save remains visible after activation",
        successCriteria: ["target_visible"],
        riskHint: "low",
        missingInfo: [],
        assumptions: [],
        reasoningSummary: "Save button should be activated."
      }),
      execute: async () => ({ status: "success", details: { primitive: "dom_click" } })
    });

    await runtime.startTask("Save changes");
    const result = await runtime.runNextStep();
    const events = await store.loadAfter("session-ambiguous-repeated", "task-ambiguous-repeated");

    expect(result.status).toBe("awaiting_user_input");
    expect(result.reason).toBe("repeated_recovery_observation_request");
    expect(result.metrics).toEqual({ modelCalls: 2, observationRounds: 2 });
    expect(observeCount).toBe(2);
    expect(events.find((event) => event.type === "RuntimeSuspended")?.payload.reason).toBe("repeated_recovery_observation_request");
    expect(events.find((event) => event.type === "TaskFailed")).toBeUndefined();
  });

  it("resumes with restored action memory for the next planner turn", async () => {
    const store = new MemoryEventStore();
    let recentActions: unknown[] | undefined;
    const runtime = new AgentRuntime({
      sessionId: "session-resume",
      taskId: "task-resume",
      initialActionMemory: [
        {
          commandType: "ActivateTarget",
          targetGoal: "Settings",
          targetRef: "settings_button",
          status: "success",
          verificationStatus: "success"
        }
      ],
      appendEvent: (event) => store.append(event),
      observePage: async () => page,
      plan: async (input) => {
        recentActions = input.recentActions;
        return {
          type: "FinishTask",
          summary: "done",
          evidenceRefs: []
        };
      },
      execute: async () => ({ status: "success", details: {} })
    });

    await runtime.resumeTask("Open settings");
    const result = await runtime.runNextStep();
    const events = await store.loadAfter("session-resume", "task-resume");

    expect(result.status).toBe("completed");
    expect(recentActions).toEqual([
      expect.objectContaining({
        commandType: "ActivateTarget",
        targetGoal: "Settings",
        targetRef: "settings_button"
      })
    ]);
    expect(events.map((event) => event.type)).not.toContain("TaskStarted");
  });

  it("repairs one invalid planner contract before failing the task", async () => {
    const store = new MemoryEventStore();
    const plannerInputs: unknown[] = [];
    const runtime = new AgentRuntime({
      sessionId: "session-contract-repair",
      taskId: "task-contract-repair",
      appendEvent: (event) => store.append(event),
      observePage: async () => page,
      plan: async (input) => {
        plannerInputs.push(input);
        if (!input.contractRepair) {
          return {
            taskUnderstanding: "open settings",
            activeSubgoal: "open settings",
            shortPlan: ["open settings"]
          };
        }
        return {
          type: "FinishTask",
          summary: "Settings is already visible.",
          evidenceRefs: []
        };
      },
      execute: async () => ({ status: "success", details: {} })
    });

    await runtime.startTask("Open settings");
    const result = await runtime.runNextStep();
    const events = await store.loadAfter("session-contract-repair", "task-contract-repair");

    expect(result.status).toBe("completed");
    expect(result.metrics).toEqual({ modelCalls: 2, observationRounds: 1 });
    expect(plannerInputs).toHaveLength(2);
    expect((plannerInputs[1] as { contractRepair?: { attempt?: number; message?: string } }).contractRepair).toEqual(
      expect.objectContaining({
        attempt: 1,
        message: "Planner decision requires nextCommand.type or nextCommands[0].type"
      })
    );
    expect(events.filter((event) => event.type === "RecoverySuggested").map((event) => event.payload.reason)).toContain("model_contract_repair");
    expect(events.filter((event) => event.type === "ModelContractViolation")).toHaveLength(1);
    expect(events.find((event) => event.type === "TaskFailed")).toBeUndefined();
    expect(events.find((event) => event.type === "TaskCompleted")?.payload.summary).toBe("Settings is already visible.");
  });

  it("returns failed step metrics when the planner call throws", async () => {
    const store = new MemoryEventStore();
    const runtime = new AgentRuntime({
      sessionId: "session-planner-failed",
      taskId: "task-planner-failed",
      appendEvent: (event) => store.append(event),
      observePage: async () => page,
      plan: async () => {
        throw new Error("planner_http_502");
      },
      execute: async () => ({ status: "success", details: {} })
    });

    await runtime.startTask("Open settings");
    const result = await runtime.runNextStep();
    const events = await store.loadAfter("session-planner-failed", "task-planner-failed");

    expect(result).toMatchObject({
      status: "failed",
      reason: "planner_http_502",
      metrics: { modelCalls: 1, observationRounds: 1 }
    });
    expect(events.find((event) => event.type === "TaskFailed")?.payload).toMatchObject({
      reason: "planner_http_502",
      phase: "planner"
    });
  });

  it("uses planner error metrics when an internal planner loop fails", async () => {
    const store = new MemoryEventStore();
    const runtime = new AgentRuntime({
      sessionId: "session-planner-loop-failed",
      taskId: "task-planner-loop-failed",
      appendEvent: (event) => store.append(event),
      observePage: async () => page,
      plan: async () => {
        throw Object.assign(new Error("planner_returned_non_json"), {
          plannerMetrics: { modelCalls: 3 }
        });
      },
      execute: async () => ({ status: "success", details: {} })
    });

    await runtime.startTask("Open settings");
    const result = await runtime.runNextStep();

    expect(result).toMatchObject({
      status: "failed",
      reason: "planner_returned_non_json",
      metrics: { modelCalls: 3, observationRounds: 1 }
    });
  });

  it("returns failed step metrics when contract repair planner call throws", async () => {
    const store = new MemoryEventStore();
    const runtime = new AgentRuntime({
      sessionId: "session-repair-planner-failed",
      taskId: "task-repair-planner-failed",
      appendEvent: (event) => store.append(event),
      observePage: async () => page,
      plan: async (input) => {
        if (!input.contractRepair) {
          return {
            taskUnderstanding: "open settings",
            activeSubgoal: "open settings",
            shortPlan: ["open settings"]
          };
        }
        throw new Error("planner_timeout");
      },
      execute: async () => ({ status: "success", details: {} })
    });

    await runtime.startTask("Open settings");
    const result = await runtime.runNextStep();
    const events = await store.loadAfter("session-repair-planner-failed", "task-repair-planner-failed");

    expect(result).toMatchObject({
      status: "failed",
      reason: "planner_timeout",
      metrics: { modelCalls: 2, observationRounds: 1 }
    });
    expect(events.find((event) => event.type === "TaskFailed")?.payload).toMatchObject({
      reason: "planner_timeout",
      phase: "planner_contract_repair"
    });
  });

  it("returns structured failure when the primitive executor throws", async () => {
    const store = new MemoryEventStore();
    const runtime = new AgentRuntime({
      sessionId: "session-execute-throws",
      taskId: "task-execute-throws",
      appendEvent: (event) => store.append(event),
      observePage: async () => page,
      plan: async () => ({
        taskUnderstanding: "open settings",
        activeSubgoal: "open settings panel",
        shortPlan: ["open settings"],
        nextCommand: {
          type: "ActivateTarget",
          targetGoal: "Settings",
          inputs: {}
        },
        expectedOutcome: "settings opens",
        successCriteria: ["target_visible"],
        riskHint: "low",
        missingInfo: [],
        assumptions: [],
        reasoningSummary: "Settings is visible."
      }),
      execute: async () => {
        throw new Error("content_script_disconnected");
      }
    });

    await runtime.startTask("Open settings");
    const result = await runtime.runNextStep();
    const events = await store.loadAfter("session-execute-throws", "task-execute-throws");

    expect(result).toMatchObject({
      status: "failed",
      reason: "content_script_disconnected",
      metrics: { modelCalls: 1, observationRounds: 1 }
    });
    expect(events.find((event) => event.type === "CommandResultReceived")?.payload.result).toMatchObject({
      status: "failed",
      reason: "content_script_disconnected"
    });
    expect(events.find((event) => event.type === "TaskFailed")?.payload).toMatchObject({
      reason: "content_script_disconnected",
      phase: "execute"
    });
  });

  it("returns structured failure when initial observation throws", async () => {
    const store = new MemoryEventStore();
    const runtime = new AgentRuntime({
      sessionId: "session-observe-throws",
      taskId: "task-observe-throws",
      appendEvent: (event) => store.append(event),
      observePage: async () => {
        throw new Error("tab_disconnected");
      },
      plan: async () => ({ type: "FinishTask", summary: "unreachable", evidenceRefs: [] }),
      execute: async () => ({ status: "success", details: {} })
    });

    await runtime.startTask("Open settings");
    const result = await runtime.runNextStep();
    const events = await store.loadAfter("session-observe-throws", "task-observe-throws");

    expect(result).toMatchObject({
      status: "failed",
      reason: "tab_disconnected",
      metrics: { modelCalls: 0, observationRounds: 1 }
    });
    expect(events.find((event) => event.type === "TaskFailed")?.payload).toMatchObject({
      reason: "tab_disconnected",
      phase: "observe"
    });
  });

  it("returns structured failure when after-command observation throws", async () => {
    const store = new MemoryEventStore();
    let observeCount = 0;
    const runtime = new AgentRuntime({
      sessionId: "session-after-observe-throws",
      taskId: "task-after-observe-throws",
      appendEvent: (event) => store.append(event),
      observePage: async () => {
        observeCount += 1;
        if (observeCount === 1) return page;
        throw new Error("after_observe_channel_closed");
      },
      plan: async () => ({
        taskUnderstanding: "open settings",
        activeSubgoal: "open settings panel",
        shortPlan: ["open settings"],
        nextCommand: {
          type: "ActivateTarget",
          targetGoal: "Settings",
          inputs: {}
        },
        expectedOutcome: "settings opens",
        successCriteria: ["target_visible"],
        riskHint: "low",
        missingInfo: [],
        assumptions: [],
        reasoningSummary: "Settings is visible."
      }),
      execute: async () => ({ status: "success", details: { clicked: true } })
    });

    await runtime.startTask("Open settings");
    const result = await runtime.runNextStep();
    const events = await store.loadAfter("session-after-observe-throws", "task-after-observe-throws");

    expect(result).toMatchObject({
      status: "failed",
      reason: "after_observe_channel_closed",
      metrics: { modelCalls: 1, observationRounds: 2 }
    });
    expect(events.find((event) => event.type === "TaskFailed")?.payload).toMatchObject({
      reason: "after_observe_channel_closed",
      phase: "after_command_observe"
    });
  });

  it("executes direct semantic NavigateTo planner turns", async () => {
    const store = new MemoryEventStore();
    const executed: unknown[] = [];
    let observeCount = 0;
    const before: PageModel = {
      ...page,
      pageIdentity: {
        url: "https://www.qianwen.com/chat/demo",
        title: "千问-阿里 AI 助手",
        origin: "https://www.qianwen.com",
        path: "/chat/demo"
      }
    };
    const after: PageModel = {
      ...page,
      pageIdentity: {
        url: "http://116.205.97.39:8201/#/login",
        title: "登录-北方安防CRM管理系统",
        origin: "http://116.205.97.39:8201",
        path: "/#/login"
      }
    };
    const runtime = new AgentRuntime({
      sessionId: "session-direct-navigate",
      taskId: "task-direct-navigate",
      safetyMode: "experimental_full_auto",
      appendEvent: (event) => store.append(event),
      observePage: async () => {
        observeCount += 1;
        return observeCount === 1 ? before : after;
      },
      plan: async () => ({
        type: "NavigateTo",
        targetGoal: "Navigate to the login page of the target website",
        inputs: {
          url: "http://116.205.97.39:8201/#/login"
        },
        expectedOutcome: "The browser loads the login page.",
        successCriteria: ["page_changed"],
        riskHint: "low",
        reasoningSummary: "Open the target URL first."
      }),
      execute: async (primitive) => {
        executed.push(primitive);
        return { status: "success", details: { primitive } };
      }
    });

    await runtime.startTask("进入 CRM 登录页");
    const result = await runtime.runNextStep();

    const events = await store.loadAfter("session-direct-navigate", "task-direct-navigate");
    expect(result.status).toBe("continue");
    expect(executed).toEqual([{ type: "navigate", url: "http://116.205.97.39:8201/#/login" }]);
    expect(events.find((event) => event.type === "CommandIssued")?.payload.primitive).toEqual({
      type: "navigate",
      url: "http://116.205.97.39:8201/#/login"
    });
    expect(events.find((event) => event.type === "ModelContractViolation")).toBeUndefined();
  });

  it("uses a deterministic fast path for the first explicit URL navigation", async () => {
    const store = new MemoryEventStore();
    const executed: unknown[] = [];
    let observeCount = 0;
    const before: PageModel = {
      ...page,
      pageIdentity: {
        url: "chrome://extensions/",
        title: "Extensions",
        origin: "chrome://extensions",
        path: "/"
      },
      controls: []
    };
    const after: PageModel = {
      ...page,
      pageIdentity: {
        url: "https://example.test/app",
        title: "Example App",
        origin: "https://example.test",
        path: "/app"
      }
    };
    const runtime = new AgentRuntime({
      sessionId: "session-fast-url",
      taskId: "task-fast-url",
      safetyMode: "experimental_full_auto",
      appendEvent: (event) => store.append(event),
      observePage: async () => {
        observeCount += 1;
        return observeCount === 1 ? before : after;
      },
      plan: async () => {
        throw new Error("planner_should_not_be_called");
      },
      execute: async (primitive) => {
        executed.push(primitive);
        return { status: "success", details: { primitive } };
      }
    });

    await runtime.startTask("打开 https://example.test/app，然后查看页面");
    const result = await runtime.runNextStep();
    const events = await store.loadAfter("session-fast-url", "task-fast-url");

    expect(result.status).toBe("continue");
    expect(result.reason).toBe("fast_url_navigation");
    expect(result.metrics).toMatchObject({ modelCalls: 0, observationRounds: 2 });
    expect(executed).toEqual([{ type: "navigate", url: "https://example.test/app" }]);
    expect(events.find((event) => event.type === "PlanRequested")).toBeUndefined();
    expect(events.find((event) => event.type === "PlanProduced")?.payload).toMatchObject({
      plannerSource: "deterministic_fast_path",
      fastPathSource: "explicit_url"
    });
  });

  it("uses a deterministic fast path for bare-domain URL navigation", async () => {
    const store = new MemoryEventStore();
    const executed: unknown[] = [];
    let planCalls = 0;
    let observeCount = 0;
    const before: PageModel = {
      ...page,
      pageIdentity: {
        url: "chrome://newtab/",
        title: "New Tab",
        origin: "chrome://newtab",
        path: "/"
      },
      controls: []
    };
    const after: PageModel = {
      ...page,
      pageIdentity: {
        url: "https://example.com/",
        title: "Example Domain",
        origin: "https://example.com",
        path: "/"
      },
      controls: []
    };
    const runtime = new AgentRuntime({
      sessionId: "session-fast-bare-url",
      taskId: "task-fast-bare-url",
      safetyMode: "experimental_full_auto",
      appendEvent: (event) => store.append(event),
      observePage: async () => {
        observeCount += 1;
        return observeCount === 1 ? before : after;
      },
      plan: async () => {
        planCalls += 1;
        throw new Error("planner_should_not_be_called");
      },
      execute: async (primitive) => {
        executed.push(primitive);
        return { status: "success", details: { primitive } };
      }
    });

    await runtime.startTask("打开 example.com");
    const result = await runtime.runNextStep();
    const events = await store.loadAfter("session-fast-bare-url", "task-fast-bare-url");

    expect(result.status).toBe("continue");
    expect(result.reason).toBe("fast_url_navigation");
    expect(result.metrics).toMatchObject({ modelCalls: 0 });
    expect(planCalls).toBe(0);
    expect(executed).toEqual([{ type: "navigate", url: "https://example.com/" }]);
    expect(events.find((event) => event.type === "PlanRequested")).toBeUndefined();
    expect(events.find((event) => event.type === "PlanProduced")?.payload).toMatchObject({
      plannerSource: "deterministic_fast_path",
      fastPathSource: "explicit_url"
    });
  });

  it("uses a deterministic fast path for explicit new-tab URL navigation", async () => {
    const store = new MemoryEventStore();
    const executed: unknown[] = [];
    let planCalls = 0;
    let observeCount = 0;
    const before: PageModel = {
      ...page,
      pageIdentity: {
        url: "https://example.test/dashboard",
        title: "Dashboard",
        origin: "https://example.test",
        path: "/dashboard"
      },
      controls: []
    };
    const after: PageModel = {
      ...page,
      pageIdentity: {
        url: "https://example.com/docs",
        title: "Docs",
        origin: "https://example.com",
        path: "/docs"
      },
      controls: []
    };
    const runtime = new AgentRuntime({
      sessionId: "session-fast-new-tab-url",
      taskId: "task-fast-new-tab-url",
      safetyMode: "experimental_full_auto",
      appendEvent: (event) => store.append(event),
      observePage: async () => {
        observeCount += 1;
        return observeCount === 1 ? before : after;
      },
      plan: async () => {
        planCalls += 1;
        throw new Error("planner_should_not_be_called");
      },
      execute: async (primitive) => {
        executed.push(primitive);
        return { status: "success", details: { primitive: "open_tab", url: "https://example.com/docs", tabId: 19, active: true } };
      }
    });

    await runtime.startTask("在新标签页打开 https://example.com/docs");
    const result = await runtime.runNextStep();
    const events = await store.loadAfter("session-fast-new-tab-url", "task-fast-new-tab-url");

    expect(result.status).toBe("continue");
    expect(result.reason).toBe("fast_new_tab_navigation");
    expect(result.metrics).toEqual({ modelCalls: 0, observationRounds: 2 });
    expect(planCalls).toBe(0);
    expect(executed).toEqual([{ type: "open_tab", url: "https://example.com/docs", active: true }]);
    expect(events.find((event) => event.type === "PlanRequested")).toBeUndefined();
    expect(events.find((event) => event.type === "PlanProduced")?.payload).toMatchObject({
      plannerSource: "deterministic_fast_path",
      fastPathSource: "explicit_new_tab_url",
      shortPlan: ["Open the explicit URL in a new tab."]
    });
  });

  it("uses a deterministic fast path for browser history navigation", async () => {
    const store = new MemoryEventStore();
    const executed: unknown[] = [];
    let planCalls = 0;
    let observeCount = 0;
    const before: PageModel = {
      ...page,
      pageIdentity: {
        url: "https://example.test/detail",
        title: "Detail",
        origin: "https://example.test",
        path: "/detail"
      },
      controls: []
    };
    const after: PageModel = {
      ...page,
      pageIdentity: {
        url: "https://example.test/list",
        title: "List",
        origin: "https://example.test",
        path: "/list"
      },
      controls: []
    };
    const runtime = new AgentRuntime({
      sessionId: "session-fast-browser-nav",
      taskId: "task-fast-browser-nav",
      safetyMode: "experimental_full_auto",
      appendEvent: (event) => store.append(event),
      observePage: async () => {
        observeCount += 1;
        return observeCount === 1 ? before : after;
      },
      plan: async () => {
        planCalls += 1;
        throw new Error("planner_should_not_be_called");
      },
      execute: async (primitive) => {
        executed.push(primitive);
        return { status: "success", details: { primitive: "history", action: "back" } };
      }
    });

    await runtime.startTask("返回上一页");
    const result = await runtime.runNextStep();
    const events = await store.loadAfter("session-fast-browser-nav", "task-fast-browser-nav");

    expect(result.status).toBe("continue");
    expect(result.reason).toBe("fast_browser_navigation");
    expect(result.metrics).toEqual({ modelCalls: 0, observationRounds: 2 });
    expect(planCalls).toBe(0);
    expect(executed).toEqual([{ type: "history", action: "back" }]);
    expect(events.find((event) => event.type === "PlanRequested")).toBeUndefined();
    expect(events.find((event) => event.type === "PlanProduced")?.payload).toMatchObject({
      plannerSource: "deterministic_fast_path",
      fastPathSource: "browser_navigation",
      shortPlan: ["Run the browser navigation action."]
    });
    expect(events.find((event) => event.type === "VerificationProduced")?.payload).toMatchObject({
      status: "success",
      satisfiedCriteria: ["page_changed"]
    });
  });

  it("uses a deterministic fast path for explicit key presses", async () => {
    const store = new MemoryEventStore();
    const executed: unknown[] = [];
    let planCalls = 0;
    const runtime = new AgentRuntime({
      sessionId: "session-fast-key-press",
      taskId: "task-fast-key-press",
      safetyMode: "experimental_full_auto",
      appendEvent: (event) => store.append(event),
      observePage: async () => page,
      plan: async () => {
        planCalls += 1;
        throw new Error("planner_should_not_be_called");
      },
      execute: async (primitive) => {
        executed.push(primitive);
        return { status: "success", details: { primitive: "key_press", key: "Enter", targetTag: "input" } };
      }
    });

    await runtime.startTask("按回车");
    const result = await runtime.runNextStep();
    const events = await store.loadAfter("session-fast-key-press", "task-fast-key-press");

    expect(result.status).toBe("continue");
    expect(result.reason).toBe("fast_key_press");
    expect(result.metrics).toEqual({ modelCalls: 0, observationRounds: 1 });
    expect(planCalls).toBe(0);
    expect(executed).toEqual([{ type: "key_press", key: "Enter" }]);
    expect(events.find((event) => event.type === "PlanRequested")).toBeUndefined();
    expect(events.find((event) => event.type === "PlanProduced")?.payload).toMatchObject({
      plannerSource: "deterministic_fast_path",
      fastPathSource: "explicit_key_press",
      shortPlan: ["Press the requested key."]
    });
    expect(events.find((event) => event.type === "VerificationProduced")?.payload).toMatchObject({
      status: "success",
      satisfiedCriteria: ["key_pressed"]
    });
  });

  it("uses a deterministic fast path for simple web search from browser pages", async () => {
    const store = new MemoryEventStore();
    const executed: unknown[] = [];
    let planCalls = 0;
    let observeCount = 0;
    const before: PageModel = {
      ...page,
      pageIdentity: {
        url: "chrome://newtab/",
        title: "New Tab",
        origin: "chrome://newtab",
        path: "/"
      },
      controls: []
    };
    const after: PageModel = {
      ...page,
      pageIdentity: {
        url: "https://www.google.com/search?q=%E5%8D%97%E4%BA%AC%E5%A4%A9%E6%B0%94",
        title: "南京天气 - Google Search",
        origin: "https://www.google.com",
        path: "/search"
      },
      controls: []
    };
    const runtime = new AgentRuntime({
      sessionId: "session-fast-web-search",
      taskId: "task-fast-web-search",
      safetyMode: "experimental_full_auto",
      appendEvent: (event) => store.append(event),
      observePage: async () => {
        observeCount += 1;
        return observeCount === 1 ? before : after;
      },
      plan: async () => {
        planCalls += 1;
        throw new Error("planner_should_not_be_called");
      },
      execute: async (primitive) => {
        executed.push(primitive);
        return { status: "success", details: { primitive } };
      }
    });

    await runtime.startTask("搜索 南京天气");
    const result = await runtime.runNextStep();
    const events = await store.loadAfter("session-fast-web-search", "task-fast-web-search");

    expect(result.status).toBe("continue");
    expect(result.reason).toBe("fast_url_navigation");
    expect(result.metrics).toMatchObject({ modelCalls: 0 });
    expect(planCalls).toBe(0);
    expect(executed).toEqual([{ type: "navigate", url: "https://www.google.com/search?q=%E5%8D%97%E4%BA%AC%E5%A4%A9%E6%B0%94" }]);
    expect(events.find((event) => event.type === "PlanRequested")).toBeUndefined();
    expect(events.find((event) => event.type === "PlanProduced")?.payload).toMatchObject({
      plannerSource: "deterministic_fast_path",
      fastPathSource: "web_search",
      shortPlan: ["Navigate directly to search results."]
    });
  });

  it("uses a deterministic fast path for unique visible field input", async () => {
    const store = new MemoryEventStore();
    const executed: unknown[] = [];
    let planCalls = 0;
    let observeCount = 0;
    const before: PageModel = {
      ...page,
      controls: [
        {
          ...page.controls[0],
          semanticId: "email_field",
          role: "textbox",
          label: "邮箱",
          accessibleName: "邮箱",
          elementTag: "input",
          valueState: "empty",
          interactionHints: ["textbox"],
          confidence: 0.94
        }
      ]
    };
    const after: PageModel = {
      ...before,
      controls: [{ ...before.controls[0], valueState: "filled" }]
    };
    const runtime = new AgentRuntime({
      sessionId: "session-fast-field-fill",
      taskId: "task-fast-field-fill",
      safetyMode: "experimental_full_auto",
      appendEvent: (event) => store.append(event),
      observePage: async () => {
        observeCount += 1;
        return observeCount === 1 ? before : after;
      },
      plan: async () => {
        planCalls += 1;
        throw new Error("planner_should_not_be_called");
      },
      execute: async (primitive) => {
        executed.push(primitive);
        return { status: "success", details: { primitive, valueStateAfter: "filled" } };
      }
    });

    await runtime.startTask("在邮箱输入 ada@example.test");
    const result = await runtime.runNextStep();
    const events = await store.loadAfter("session-fast-field-fill", "task-fast-field-fill");

    expect(result.status).toBe("continue");
    expect(result.reason).toBe("fast_field_fill");
    expect(result.metrics).toMatchObject({ modelCalls: 0 });
    expect(planCalls).toBe(0);
    expect(executed).toEqual([{ type: "dom_input", semanticId: "email_field", value: "ada@example.test" }]);
    expect(events.find((event) => event.type === "PlanRequested")).toBeUndefined();
    expect(events.find((event) => event.type === "PlanProduced")?.payload).toMatchObject({
      plannerSource: "deterministic_fast_path",
      fastPathSource: "exact_visible_field",
      shortPlan: ["Fill the matched visible field."]
    });
  });

  it("uses a deterministic fast path for clearing a unique visible field", async () => {
    const store = new MemoryEventStore();
    const executed: unknown[] = [];
    let planCalls = 0;
    let observeCount = 0;
    const before: PageModel = {
      ...page,
      controls: [
        {
          ...page.controls[0],
          semanticId: "email_field",
          role: "textbox",
          label: "邮箱",
          accessibleName: "邮箱",
          elementTag: "input",
          valueState: "filled",
          interactionHints: ["textbox"],
          confidence: 0.94
        }
      ]
    };
    const runtime = new AgentRuntime({
      sessionId: "session-fast-field-clear",
      taskId: "task-fast-field-clear",
      safetyMode: "experimental_full_auto",
      appendEvent: (event) => store.append(event),
      observePage: async () => {
        observeCount += 1;
        return before;
      },
      plan: async () => {
        planCalls += 1;
        throw new Error("planner_should_not_be_called");
      },
      execute: async (primitive) => {
        executed.push(primitive);
        return {
          status: "success",
          details: {
            primitive: "dom_input",
            semanticId: "email_field",
            valueMatchesExpected: true,
            valueStateAfter: "empty"
          }
        };
      }
    });

    await runtime.startTask("清空邮箱输入框");
    const result = await runtime.runNextStep();
    const events = await store.loadAfter("session-fast-field-clear", "task-fast-field-clear");

    expect(result.status).toBe("continue");
    expect(result.reason).toBe("fast_field_clear");
    expect(result.metrics).toEqual({ modelCalls: 0, observationRounds: 1 });
    expect(observeCount).toBe(1);
    expect(planCalls).toBe(0);
    expect(executed).toEqual([{ type: "dom_input", semanticId: "email_field", value: "" }]);
    expect(events.find((event) => event.type === "PlanRequested")).toBeUndefined();
    expect(events.find((event) => event.type === "ObservationRequested" && event.payload.reason === "after_command")).toBeUndefined();
    expect(events.find((event) => event.type === "PlanProduced")?.payload).toMatchObject({
      plannerSource: "deterministic_fast_path",
      fastPathSource: "exact_visible_field_clear",
      shortPlan: ["Clear the matched visible field."]
    });
  });

  it("uses a deterministic fast path for clearing the focused field", async () => {
    const store = new MemoryEventStore();
    const executed: unknown[] = [];
    let planCalls = 0;
    let observeCount = 0;
    const before: PageModel = {
      ...page,
      controls: [
        {
          ...page.controls[0],
          semanticId: "name_field",
          role: "textbox",
          label: "姓名",
          accessibleName: "姓名",
          elementTag: "input",
          valueState: "filled",
          focused: true,
          interactionHints: ["textbox"],
          confidence: 0.94
        },
        {
          ...page.controls[0],
          semanticId: "email_field",
          role: "textbox",
          label: "邮箱",
          accessibleName: "邮箱",
          elementTag: "input",
          valueState: "filled",
          interactionHints: ["textbox"],
          confidence: 0.91
        }
      ]
    };
    const runtime = new AgentRuntime({
      sessionId: "session-fast-focused-clear",
      taskId: "task-fast-focused-clear",
      safetyMode: "experimental_full_auto",
      appendEvent: (event) => store.append(event),
      observePage: async () => {
        observeCount += 1;
        return before;
      },
      plan: async () => {
        planCalls += 1;
        throw new Error("planner_should_not_be_called");
      },
      execute: async (primitive) => {
        executed.push(primitive);
        return {
          status: "success",
          details: {
            primitive: "dom_input",
            semanticId: "name_field",
            valueMatchesExpected: true,
            valueStateAfter: "empty"
          }
        };
      }
    });

    await runtime.startTask("清空当前输入框");
    const result = await runtime.runNextStep();
    const events = await store.loadAfter("session-fast-focused-clear", "task-fast-focused-clear");

    expect(result.status).toBe("continue");
    expect(result.reason).toBe("fast_focused_field_clear");
    expect(result.metrics).toEqual({ modelCalls: 0, observationRounds: 1 });
    expect(observeCount).toBe(1);
    expect(planCalls).toBe(0);
    expect(executed).toEqual([{ type: "dom_input", semanticId: "name_field", value: "" }]);
    expect(events.find((event) => event.type === "PlanRequested")).toBeUndefined();
    expect(events.find((event) => event.type === "PlanProduced")?.payload).toMatchObject({
      plannerSource: "deterministic_fast_path",
      fastPathSource: "focused_field_clear",
      shortPlan: ["Clear the focused field."]
    });
  });

  it("uses a deterministic fast path for unique visible selector choices", async () => {
    const store = new MemoryEventStore();
    const executed: unknown[] = [];
    let planCalls = 0;
    const before: PageModel = {
      ...page,
      controls: [
        {
          ...page.controls[0],
          semanticId: "status_select",
          role: "combobox",
          label: "状态",
          accessibleName: "状态",
          elementTag: "select",
          controlType: "select-one",
          valueState: "empty",
          interactionHints: ["select-one"],
          confidence: 0.94
        }
      ]
    };
    const runtime = new AgentRuntime({
      sessionId: "session-fast-select-option",
      taskId: "task-fast-select-option",
      safetyMode: "experimental_full_auto",
      appendEvent: (event) => store.append(event),
      observePage: async () => before,
      plan: async () => {
        planCalls += 1;
        throw new Error("planner_should_not_be_called");
      },
      execute: async (primitive) => {
        executed.push(primitive);
        return { status: "success", details: { primitive: "dom_select_option", semanticId: "status_select", valueMatchesExpected: true, valueStateAfter: "selected" } };
      }
    });

    await runtime.startTask("把状态选择为启用");
    const result = await runtime.runNextStep();
    const events = await store.loadAfter("session-fast-select-option", "task-fast-select-option");

    expect(result.status).toBe("continue");
    expect(result.reason).toBe("fast_select_option");
    expect(result.metrics).toEqual({ modelCalls: 0, observationRounds: 1 });
    expect(planCalls).toBe(0);
    expect(executed).toEqual([{ type: "dom_select_option", semanticId: "status_select", value: "启用" }]);
    expect(events.find((event) => event.type === "PlanRequested")).toBeUndefined();
    expect(events.find((event) => event.type === "PlanProduced")?.payload).toMatchObject({
      plannerSource: "deterministic_fast_path",
      fastPathSource: "exact_visible_select",
      shortPlan: ["Select the matched option."]
    });
  });

  it("uses a deterministic fast path for unique visible state controls", async () => {
    const store = new MemoryEventStore();
    const executed: unknown[] = [];
    let planCalls = 0;
    const before: PageModel = {
      ...page,
      controls: [
        {
          ...page.controls[0],
          semanticId: "notifications_switch",
          role: "switch",
          label: "通知",
          accessibleName: "通知",
          elementTag: "button",
          valueState: "unchecked",
          checked: false,
          interactionHints: ["switch"],
          confidence: 0.94
        }
      ]
    };
    const runtime = new AgentRuntime({
      sessionId: "session-fast-control-state",
      taskId: "task-fast-control-state",
      safetyMode: "experimental_full_auto",
      appendEvent: (event) => store.append(event),
      observePage: async () => before,
      plan: async () => {
        planCalls += 1;
        throw new Error("planner_should_not_be_called");
      },
      execute: async (primitive) => {
        executed.push(primitive);
        return { status: "success", details: { primitive: "dom_click", semanticId: "notifications_switch", checkedStateAfter: true, valueStateAfter: "checked" } };
      }
    });

    await runtime.startTask("打开通知开关");
    const result = await runtime.runNextStep();
    const events = await store.loadAfter("session-fast-control-state", "task-fast-control-state");

    expect(result.status).toBe("continue");
    expect(result.reason).toBe("fast_control_state");
    expect(result.metrics).toEqual({ modelCalls: 0, observationRounds: 1 });
    expect(planCalls).toBe(0);
    expect(executed).toEqual([{ type: "dom_click", semanticId: "notifications_switch" }]);
    expect(events.find((event) => event.type === "PlanRequested")).toBeUndefined();
    expect(events.find((event) => event.type === "ObservationRequested" && event.payload.reason === "after_command")).toBeUndefined();
    expect(events.find((event) => event.type === "PlanProduced")?.payload).toMatchObject({
      plannerSource: "deterministic_fast_path",
      fastPathSource: "exact_visible_state_control",
      shortPlan: ["Set the matched state control."]
    });
  });

  it("uses a deterministic fast path for unique visible dismiss controls", async () => {
    const store = new MemoryEventStore();
    const executed: unknown[] = [];
    let planCalls = 0;
    let observeCount = 0;
    const before: PageModel = {
      ...page,
      controls: [
        {
          ...page.controls[0],
          semanticId: "modal_close",
          role: "button",
          label: "关闭",
          accessibleName: "关闭",
          elementTag: "button",
          interactionHints: ["button", "modal"],
          locatorHints: [{ kind: "css", value: ".modal-close" }],
          confidence: 0.94
        }
      ]
    };
    const after: PageModel = { ...before, controls: [], capturedAt: 2 };
    const runtime = new AgentRuntime({
      sessionId: "session-fast-dismiss",
      taskId: "task-fast-dismiss",
      safetyMode: "experimental_full_auto",
      appendEvent: (event) => store.append(event),
      observePage: async () => {
        observeCount += 1;
        return observeCount === 1 ? before : after;
      },
      plan: async () => {
        planCalls += 1;
        throw new Error("planner_should_not_be_called");
      },
      execute: async (primitive) => {
        executed.push(primitive);
        return { status: "success", details: { primitive: "dom_click" } };
      }
    });

    await runtime.startTask("关闭弹窗");
    const result = await runtime.runNextStep();
    const events = await store.loadAfter("session-fast-dismiss", "task-fast-dismiss");

    expect(result.status).toBe("continue");
    expect(result.reason).toBe("fast_dismiss_control");
    expect(result.metrics?.modelCalls).toBe(0);
    expect(planCalls).toBe(0);
    expect(executed).toEqual([{ type: "dom_click", semanticId: "modal_close" }]);
    expect(events.find((event) => event.type === "PlanRequested")).toBeUndefined();
    expect(events.find((event) => event.type === "PlanProduced")?.payload).toMatchObject({
      plannerSource: "deterministic_fast_path",
      fastPathSource: "visible_dismiss_control",
      shortPlan: ["Dismiss the visible surface."],
      nextCommand: {
        type: "ActivateTarget",
        inputs: { semanticId: "modal_close", intent: "dismiss" },
        successCriteria: ["target_not_visible"]
      }
    });
    expect(events.find((event) => event.type === "VerificationProduced")?.payload).toMatchObject({
      status: "success",
      satisfiedCriteria: ["target_not_visible"]
    });
  });

  it("skips after-command observation when input primitive confirms the exact value", async () => {
    const store = new MemoryEventStore();
    const executed: unknown[] = [];
    let planCalls = 0;
    let observeCount = 0;
    const before: PageModel = {
      ...page,
      controls: [
        {
          ...page.controls[0],
          semanticId: "email_field",
          role: "textbox",
          label: "邮箱",
          accessibleName: "邮箱",
          elementTag: "input",
          valueState: "empty",
          interactionHints: ["textbox"],
          confidence: 0.94
        }
      ]
    };
    const runtime = new AgentRuntime({
      sessionId: "session-fast-input-confirmed",
      taskId: "task-fast-input-confirmed",
      safetyMode: "experimental_full_auto",
      appendEvent: (event) => store.append(event),
      observePage: async () => {
        observeCount += 1;
        return before;
      },
      plan: async () => {
        planCalls += 1;
        return { type: "FinishTask", summary: "done", evidenceRefs: [] };
      },
      execute: async (primitive) => {
        executed.push(primitive);
        return {
          status: "success",
          details: {
            primitive: "dom_input",
            semanticId: "email_field",
            valueMatchesExpected: true,
            valueStateAfter: "filled"
          }
        };
      }
    });

    await runtime.startTask("在邮箱输入 ada@example.test");
    const first = await runtime.runNextStep();
    const second = await runtime.runNextStep();
    const events = await store.loadAfter("session-fast-input-confirmed", "task-fast-input-confirmed");

    expect(first.status).toBe("continue");
    expect(first.reason).toBe("fast_field_fill");
    expect(first.metrics).toEqual({ modelCalls: 0, observationRounds: 1 });
    expect(second.status).toBe("completed");
    expect(second.metrics).toEqual({ modelCalls: 1, observationRounds: 1 });
    expect(observeCount).toBe(2);
    expect(planCalls).toBe(1);
    expect(executed).toEqual([{ type: "dom_input", semanticId: "email_field", value: "ada@example.test" }]);
    expect(events.filter((event) => event.type === "ObservationRequested").map((event) => event.payload.reason)).not.toContain("after_command");
    expect(events.find((event) => event.type === "VerificationProduced")?.payload).toMatchObject({
      status: "success",
      satisfiedCriteria: ["control_value_matches"]
    });
  });

  it("uses a deterministic fast path for focused value-only text entry", async () => {
    const store = new MemoryEventStore();
    const executed: unknown[] = [];
    let planCalls = 0;
    let observeCount = 0;
    const before: PageModel = {
      ...page,
      controls: [
        {
          ...page.controls[0],
          semanticId: "name_field",
          role: "textbox",
          label: "姓名",
          accessibleName: "姓名",
          elementTag: "input",
          valueState: "empty",
          focused: true,
          interactionHints: ["textbox"],
          confidence: 0.94
        },
        {
          ...page.controls[0],
          semanticId: "email_field",
          role: "textbox",
          label: "邮箱",
          accessibleName: "邮箱",
          elementTag: "input",
          valueState: "empty",
          interactionHints: ["textbox"],
          confidence: 0.94
        }
      ]
    };
    const after: PageModel = {
      ...before,
      controls: [{ ...before.controls[0], valueState: "filled" }, before.controls[1]]
    };
    const runtime = new AgentRuntime({
      sessionId: "session-fast-focused-entry",
      taskId: "task-fast-focused-entry",
      safetyMode: "experimental_full_auto",
      appendEvent: (event) => store.append(event),
      observePage: async () => {
        observeCount += 1;
        return observeCount === 1 ? before : after;
      },
      plan: async () => {
        planCalls += 1;
        throw new Error("planner_should_not_be_called");
      },
      execute: async (primitive) => {
        executed.push(primitive);
        return { status: "success", details: { primitive, valueStateAfter: "filled" } };
      }
    });

    await runtime.startTask("输入 Ada Lovelace");
    const result = await runtime.runNextStep();
    const events = await store.loadAfter("session-fast-focused-entry", "task-fast-focused-entry");

    expect(result.status).toBe("continue");
    expect(result.reason).toBe("fast_focused_text_entry");
    expect(result.metrics).toMatchObject({ modelCalls: 0 });
    expect(planCalls).toBe(0);
    expect(executed).toEqual([{ type: "dom_input", semanticId: "name_field", value: "Ada Lovelace" }]);
    expect(events.find((event) => event.type === "PlanRequested")).toBeUndefined();
    expect(events.find((event) => event.type === "PlanProduced")?.payload).toMatchObject({
      plannerSource: "deterministic_fast_path",
      fastPathSource: "focused_text_entry",
      shortPlan: ["Fill the currently focused field."]
    });
  });

  it("uses a deterministic fast path for visible pagination controls before scrolling", async () => {
    const store = new MemoryEventStore();
    const executed: unknown[] = [];
    let planCalls = 0;
    let observeCount = 0;
    const before: PageModel = {
      ...page,
      pageIdentity: {
        url: "https://app.example.test/list?page=1",
        title: "List",
        origin: "https://app.example.test",
        path: "/list?page=1"
      },
      controls: [
        {
          ...page.controls[0],
          semanticId: "next_page",
          role: "button",
          label: "下一页",
          accessibleName: "下一页",
          elementTag: "button",
          interactionHints: ["button", "pagination"],
          locatorHints: [{ kind: "css", value: ".pager-next" }],
          confidence: 0.94
        }
      ]
    };
    const after: PageModel = {
      ...before,
      pageIdentity: { ...before.pageIdentity, url: "https://app.example.test/list?page=2", path: "/list?page=2" },
      capturedAt: 2
    };
    const runtime = new AgentRuntime({
      sessionId: "session-fast-pagination",
      taskId: "task-fast-pagination",
      safetyMode: "experimental_full_auto",
      appendEvent: (event) => store.append(event),
      observePage: async () => {
        observeCount += 1;
        return observeCount === 1 ? before : after;
      },
      plan: async () => {
        planCalls += 1;
        throw new Error("planner_should_not_be_called");
      },
      execute: async (primitive) => {
        executed.push(primitive);
        return { status: "success", details: { primitive: "dom_click" } };
      }
    });

    await runtime.startTask("下一页");
    const result = await runtime.runNextStep();
    const events = await store.loadAfter("session-fast-pagination", "task-fast-pagination");

    expect(result.status).toBe("continue");
    expect(result.reason).toBe("fast_pagination_control");
    expect(result.metrics?.modelCalls).toBe(0);
    expect(planCalls).toBe(0);
    expect(executed).toEqual([{ type: "dom_click", semanticId: "next_page" }]);
    expect(events.find((event) => event.type === "PlanRequested")).toBeUndefined();
    expect(events.find((event) => event.type === "PlanProduced")?.payload).toMatchObject({
      plannerSource: "deterministic_fast_path",
      fastPathSource: "visible_pagination_control",
      shortPlan: ["Activate the pagination control."],
      nextCommand: {
        type: "ActivateTarget",
        inputs: { semanticId: "next_page", intent: "pagination", direction: "next" }
      }
    });
  });

  it("uses a deterministic fast path for visible refresh controls", async () => {
    const store = new MemoryEventStore();
    const executed: unknown[] = [];
    let planCalls = 0;
    let observeCount = 0;
    const before: PageModel = {
      ...page,
      pageIdentity: {
        url: "https://app.example.test/list",
        title: "List",
        origin: "https://app.example.test",
        path: "/list"
      },
      controls: [
        {
          ...page.controls[0],
          semanticId: "refresh_list",
          role: "button",
          label: "刷新",
          accessibleName: "刷新",
          elementTag: "button",
          interactionHints: ["button", "refresh"],
          locatorHints: [{ kind: "css", value: ".list-refresh" }],
          confidence: 0.94
        }
      ]
    };
    const runtime = new AgentRuntime({
      sessionId: "session-fast-refresh-control",
      taskId: "task-fast-refresh-control",
      safetyMode: "experimental_full_auto",
      appendEvent: (event) => store.append(event),
      observePage: async () => {
        observeCount += 1;
        return before;
      },
      plan: async () => {
        planCalls += 1;
        throw new Error("planner_should_not_be_called");
      },
      execute: async (primitive) => {
        executed.push(primitive);
        return { status: "success", details: { primitive: "dom_click" } };
      }
    });

    await runtime.startTask("刷新列表");
    const result = await runtime.runNextStep();
    const events = await store.loadAfter("session-fast-refresh-control", "task-fast-refresh-control");

    expect(result.status).toBe("continue");
    expect(result.reason).toBe("fast_refresh_control");
    expect(result.metrics?.modelCalls).toBe(0);
    expect(planCalls).toBe(0);
    expect(executed).toEqual([{ type: "dom_click", semanticId: "refresh_list" }]);
    expect(events.find((event) => event.type === "PlanRequested")).toBeUndefined();
    expect(events.find((event) => event.type === "PlanProduced")?.payload).toMatchObject({
      plannerSource: "deterministic_fast_path",
      fastPathSource: "visible_refresh_control",
      shortPlan: ["Activate the refresh control."],
      nextCommand: {
        type: "ActivateTarget",
        inputs: { semanticId: "refresh_list", intent: "refresh_or_retry" }
      }
    });
  });

  it("uses a deterministic fast path for simple page scroll", async () => {
    const store = new MemoryEventStore();
    const executed: unknown[] = [];
    let planCalls = 0;
    let observeCount = 0;
    const before: PageModel = {
      ...page,
      pageIdentity: {
        url: "https://app.example.test/list",
        title: "List",
        origin: "https://app.example.test",
        path: "/list"
      },
      viewport: { ...page.viewport, scrollY: 0 },
      controls: []
    };
    const runtime = new AgentRuntime({
      sessionId: "session-fast-scroll",
      taskId: "task-fast-scroll",
      safetyMode: "experimental_full_auto",
      appendEvent: (event) => store.append(event),
      observePage: async () => {
        observeCount += 1;
        return before;
      },
      plan: async () => {
        planCalls += 1;
        throw new Error("planner_should_not_be_called");
      },
      execute: async (primitive) => {
        executed.push(primitive);
        return {
          status: "success",
          details: {
            primitive: "scroll",
            direction: "down",
            amount: 720,
            scrollBeforeY: 0,
            scrollAfterY: 720,
            scrollMoved: true
          }
        };
      }
    });

    await runtime.startTask("向下滚动页面");
    const result = await runtime.runNextStep();
    const events = await store.loadAfter("session-fast-scroll", "task-fast-scroll");

    expect(result.status).toBe("continue");
    expect(result.reason).toBe("fast_scroll");
    expect(result.metrics).toEqual({ modelCalls: 0, observationRounds: 1 });
    expect(planCalls).toBe(0);
    expect(observeCount).toBe(1);
    expect(executed).toEqual([{ type: "scroll", direction: "down", amount: 720 }]);
    expect(events.find((event) => event.type === "PlanRequested")).toBeUndefined();
    expect(events.filter((event) => event.type === "ObservationRequested").map((event) => event.payload.reason)).not.toContain("after_command");
    expect(events.find((event) => event.type === "PlanProduced")?.payload).toMatchObject({
      plannerSource: "deterministic_fast_path",
      fastPathSource: "explicit_scroll",
      shortPlan: ["Scroll the page."]
    });
    expect(events.find((event) => event.type === "CommandIssued")?.payload.primitive).toEqual({
      type: "scroll",
      direction: "down",
      amount: 720
    });
    expect(events.find((event) => event.type === "VerificationProduced")?.payload).toMatchObject({
      status: "success",
      satisfiedCriteria: ["viewport_scrolled"]
    });
  });

  it("uses a deterministic fast path for simple wait requests", async () => {
    const store = new MemoryEventStore();
    const executed: unknown[] = [];
    let planCalls = 0;
    let observeCount = 0;
    const runtime = new AgentRuntime({
      sessionId: "session-fast-wait",
      taskId: "task-fast-wait",
      safetyMode: "experimental_full_auto",
      appendEvent: (event) => store.append(event),
      observePage: async () => {
        observeCount += 1;
        return page;
      },
      plan: async () => {
        planCalls += 1;
        throw new Error("planner_should_not_be_called");
      },
      execute: async (primitive) => {
        executed.push(primitive);
        return { status: "success", details: { primitive: "wait", milliseconds: 500 } };
      }
    });

    await runtime.startTask("等待500毫秒");
    const result = await runtime.runNextStep();
    const events = await store.loadAfter("session-fast-wait", "task-fast-wait");

    expect(result.status).toBe("continue");
    expect(result.reason).toBe("fast_wait");
    expect(result.metrics).toEqual({ modelCalls: 0, observationRounds: 1 });
    expect(planCalls).toBe(0);
    expect(observeCount).toBe(1);
    expect(executed).toEqual([{ type: "wait", milliseconds: 500 }]);
    expect(events.find((event) => event.type === "PlanRequested")).toBeUndefined();
    expect(events.filter((event) => event.type === "ObservationRequested").map((event) => event.payload.reason)).not.toContain("after_command");
    expect(events.find((event) => event.type === "PlanProduced")?.payload).toMatchObject({
      plannerSource: "deterministic_fast_path",
      fastPathSource: "explicit_wait",
      shortPlan: ["Wait briefly."]
    });
    expect(events.find((event) => event.type === "VerificationProduced")?.payload).toMatchObject({
      status: "success",
      satisfiedCriteria: ["wait_completed"]
    });
  });

  it("uses a deterministic fast path for unique page-local search forms", async () => {
    const store = new MemoryEventStore();
    const executed: unknown[] = [];
    let planCalls = 0;
    let observeCount = 0;
    const before: PageModel = {
      ...page,
      pageIdentity: {
        url: "https://app.example.test/list",
        title: "List",
        origin: "https://app.example.test",
        path: "/list"
      },
      controls: [
        {
          ...page.controls[0],
          semanticId: "keyword_field",
          role: "searchbox",
          label: "关键词",
          accessibleName: "关键词",
          elementTag: "input",
          controlType: "search",
          formRef: "search_form",
          valueState: "empty",
          interactionHints: ["searchbox", "textbox"],
          confidence: 0.94
        },
        {
          ...page.controls[0],
          semanticId: "search_submit",
          role: "button",
          label: "搜索",
          accessibleName: "搜索",
          elementTag: "button",
          formRef: "search_form",
          interactionHints: ["button", "submit"],
          confidence: 0.92
        }
      ],
      forms: [
        {
          semanticId: "search_form",
          label: "列表搜索",
          controlRefs: ["keyword_field", "search_submit"],
          controlLabels: ["关键词", "搜索"],
          requiredControlRefs: [],
          requiredControlLabels: [],
          submitControlRefs: ["search_submit"],
          submitControlLabels: ["搜索"],
          locatorHints: [],
          confidence: 0.9
        }
      ]
    };
    const afterSubmit: PageModel = {
      ...before,
      capturedAt: 3,
      pageIdentity: {
        ...before.pageIdentity,
        url: "https://app.example.test/list?q=%E5%AE%A2%E6%88%B7",
        path: "/list?q=%E5%AE%A2%E6%88%B7"
      },
      controls: [{ ...before.controls[0], valueState: "filled" }, before.controls[1]]
    };
    const runtime = new AgentRuntime({
      sessionId: "session-fast-search-form",
      taskId: "task-fast-search-form",
      appendEvent: (event) => store.append(event),
      observePage: async () => {
        observeCount += 1;
        return observeCount === 1 ? before : afterSubmit;
      },
      plan: async () => {
        planCalls += 1;
        throw new Error("planner_should_not_be_called");
      },
      execute: async (primitive) => {
        executed.push(primitive);
        if (primitive.type === "dom_input") {
          return {
            status: "success",
            details: {
              primitive: "dom_input",
              semanticId: primitive.semanticId,
              valueMatchesExpected: true,
              valueStateAfter: "filled"
            }
          };
        }
        return { status: "success", details: { primitive: "dom_click", semanticId: "search_submit" } };
      }
    });

    await runtime.startTask("搜索客户");
    const result = await runtime.runNextStep();
    const events = await store.loadAfter("session-fast-search-form", "task-fast-search-form");

    expect(result.status).toBe("continue");
    expect(result.reason).toBe("fast_search_form");
    expect(result.metrics).toMatchObject({ modelCalls: 0, observationRounds: 2 });
    expect(planCalls).toBe(0);
    expect(executed).toEqual([
      { type: "dom_input", semanticId: "keyword_field", value: "客户" },
      { type: "dom_click", semanticId: "search_submit" }
    ]);
    expect(events.find((event) => event.type === "PlanRequested")).toBeUndefined();
    expect(events.find((event) => event.type === "PlanProduced")?.payload).toMatchObject({
      plannerSource: "deterministic_fast_path",
      fastPathSource: "exact_visible_search_form",
      shortPlan: ["Fill the search field and submit the page search."],
      nextCommands: [
        { type: "FillField", inputs: { semanticId: "keyword_field", value: "客户" } },
        { type: "SubmitCurrentForm", inputs: { semanticId: "search_submit", intent: "search" } }
      ]
    });
    expect(events.filter((event) => event.type === "CommandIssued").map((event) => event.payload.primitive)).toEqual(executed);
  });

  it("uses a deterministic fast path for single search fields submitted with Enter", async () => {
    const store = new MemoryEventStore();
    const executed: unknown[] = [];
    let planCalls = 0;
    let observeCount = 0;
    const before: PageModel = {
      ...page,
      pageIdentity: {
        url: "https://app.example.test/list",
        title: "List",
        origin: "https://app.example.test",
        path: "/list"
      },
      controls: [
        {
          ...page.controls[0],
          semanticId: "keyword_field",
          role: "searchbox",
          label: "搜索",
          accessibleName: "搜索",
          elementTag: "input",
          controlType: "search",
          valueState: "empty",
          interactionHints: ["searchbox", "textbox"],
          locatorHints: [{ kind: "css", value: "#keyword" }],
          confidence: 0.94
        }
      ],
      forms: []
    };
    const runtime = new AgentRuntime({
      sessionId: "session-fast-search-enter",
      taskId: "task-fast-search-enter",
      appendEvent: (event) => store.append(event),
      observePage: async () => {
        observeCount += 1;
        return before;
      },
      plan: async () => {
        planCalls += 1;
        throw new Error("planner_should_not_be_called");
      },
      execute: async (primitive) => {
        executed.push(primitive);
        if (primitive.type === "dom_input") {
          return {
            status: "success",
            details: {
              primitive: "dom_input",
              semanticId: primitive.semanticId,
              valueMatchesExpected: true,
              valueStateAfter: "filled"
            }
          };
        }
        return { status: "success", details: { primitive: "key_press", key: "Enter" } };
      }
    });

    await runtime.startTask("搜索客户");
    const result = await runtime.runNextStep();
    const events = await store.loadAfter("session-fast-search-enter", "task-fast-search-enter");

    expect(result.status).toBe("continue");
    expect(result.reason).toBe("fast_search_enter");
    expect(result.metrics).toMatchObject({ modelCalls: 0, observationRounds: 1 });
    expect(observeCount).toBe(1);
    expect(planCalls).toBe(0);
    expect(executed).toEqual([
      { type: "dom_input", semanticId: "keyword_field", value: "客户" },
      { type: "key_press", key: "Enter" }
    ]);
    expect(events.find((event) => event.type === "PlanRequested")).toBeUndefined();
    expect(events.find((event) => event.type === "PlanProduced")?.payload).toMatchObject({
      plannerSource: "deterministic_fast_path",
      fastPathSource: "single_search_field_enter",
      shortPlan: ["Fill the search field and press Enter."],
      nextCommands: [
        { type: "FillField", inputs: { semanticId: "keyword_field", value: "客户" } },
        { type: "PressKey", inputs: { key: "Enter", intent: "search", query: "客户" } }
      ]
    });
    expect(events.filter((event) => event.type === "CommandIssued").map((event) => event.payload.primitive)).toEqual(executed);
  });

  it("uses a deterministic fast path for a unique visible save submit in full-auto mode", async () => {
    const store = new MemoryEventStore();
    const executed: unknown[] = [];
    let planCalls = 0;
    let observeCount = 0;
    const before: PageModel = {
      ...page,
      pageIdentity: { ...page.pageIdentity, url: "https://example.test/settings", path: "/settings" },
      controls: [
        {
          ...page.controls[0],
          semanticId: "save_settings",
          role: "button",
          label: "保存",
          accessibleName: "保存",
          elementTag: "button",
          controlType: "submit",
          formRef: "settings_form",
          interactionHints: ["button", "submit"],
          locatorHints: [{ kind: "css", value: "#save-settings" }],
          confidence: 0.94
        }
      ],
      forms: [
        {
          semanticId: "settings_form",
          label: "设置",
          controlRefs: ["save_settings"],
          controlLabels: ["保存"],
          requiredControlRefs: [],
          requiredControlLabels: [],
          submitControlRefs: ["save_settings"],
          submitControlLabels: ["保存"],
          locatorHints: [],
          confidence: 0.94
        }
      ]
    };
    const after: PageModel = { ...before, feedback: ["保存成功"], capturedAt: 2 };
    const runtime = new AgentRuntime({
      sessionId: "session-fast-submit",
      taskId: "task-fast-submit",
      safetyMode: "experimental_full_auto",
      appendEvent: (event) => store.append(event),
      observePage: async () => {
        observeCount += 1;
        return observeCount === 1 ? before : after;
      },
      plan: async () => {
        planCalls += 1;
        throw new Error("planner_should_not_be_called");
      },
      execute: async (primitive) => {
        executed.push(primitive);
        return { status: "success", details: { primitive: "dom_click" } };
      }
    });

    await runtime.startTask("保存配置");
    const result = await runtime.runNextStep();
    const events = await store.loadAfter("session-fast-submit", "task-fast-submit");

    expect(result.status).toBe("continue");
    expect(result.reason).toBe("fast_submit_control");
    expect(result.metrics?.modelCalls).toBe(0);
    expect(planCalls).toBe(0);
    expect(executed).toEqual([{ type: "dom_click", semanticId: "save_settings" }]);
    expect(events.find((event) => event.type === "PlanRequested")).toBeUndefined();
    expect(events.find((event) => event.type === "PlanProduced")?.payload).toMatchObject({
      plannerSource: "deterministic_fast_path",
      fastPathSource: "exact_visible_submit_control",
      shortPlan: ["Submit the matched visible control."],
      nextCommand: {
        type: "SubmitCurrentForm",
        inputs: { semanticId: "save_settings", label: "保存", formRef: "settings_form", intent: "save_submit_confirm" },
        riskHint: "medium"
      }
    });
    expect(events.find((event) => event.type === "VerificationProduced")?.payload).toMatchObject({
      status: "success",
      satisfiedCriteria: ["submission_feedback_or_validation"]
    });
  });

  it("still asks for confirmation for submit fast paths in balanced mode", async () => {
    const store = new MemoryEventStore();
    let planCalls = 0;
    let executeCalls = 0;
    const before: PageModel = {
      ...page,
      controls: [
        {
          ...page.controls[0],
          semanticId: "save_settings",
          role: "button",
          label: "保存",
          accessibleName: "保存",
          elementTag: "button",
          controlType: "submit",
          interactionHints: ["button", "submit"],
          locatorHints: [{ kind: "css", value: "#save-settings" }],
          confidence: 0.94
        }
      ]
    };
    const runtime = new AgentRuntime({
      sessionId: "session-fast-submit-balanced",
      taskId: "task-fast-submit-balanced",
      appendEvent: (event) => store.append(event),
      observePage: async () => before,
      plan: async () => {
        planCalls += 1;
        throw new Error("planner_should_not_be_called");
      },
      execute: async () => {
        executeCalls += 1;
        return { status: "success", details: { primitive: "dom_click" } };
      }
    });

    await runtime.startTask("保存配置");
    const result = await runtime.runNextStep();
    const events = await store.loadAfter("session-fast-submit-balanced", "task-fast-submit-balanced");

    expect(result.status).toBe("awaiting_confirmation");
    expect(result.reason).toBe("policy_ask_user");
    expect(result.metrics?.modelCalls).toBe(0);
    expect(planCalls).toBe(0);
    expect(executeCalls).toBe(0);
    expect(events.find((event) => event.type === "PlanRequested")).toBeUndefined();
    expect(events.find((event) => event.type === "UserConsentRequested")).toBeDefined();
    expect(events.find((event) => event.type === "PolicyEvaluated")?.payload.decision).toMatchObject({
      status: "ask_user",
      riskLevel: "medium"
    });
  });

  it("uses a deterministic fast path for visible field entry followed by Enter", async () => {
    const store = new MemoryEventStore();
    const executed: unknown[] = [];
    let planCalls = 0;
    let observeCount = 0;
    const before: PageModel = {
      ...page,
      controls: [
        {
          ...page.controls[0],
          semanticId: "email_field",
          role: "textbox",
          label: "邮箱",
          accessibleName: "邮箱",
          elementTag: "input",
          valueState: "empty",
          interactionHints: ["textbox"],
          locatorHints: [{ kind: "css", value: "#email" }],
          confidence: 0.94
        }
      ]
    };
    const runtime = new AgentRuntime({
      sessionId: "session-fast-field-enter",
      taskId: "task-fast-field-enter",
      appendEvent: (event) => store.append(event),
      observePage: async () => {
        observeCount += 1;
        return before;
      },
      plan: async () => {
        planCalls += 1;
        throw new Error("planner_should_not_be_called");
      },
      execute: async (primitive) => {
        executed.push(primitive);
        if (primitive.type === "dom_input") {
          return {
            status: "success",
            details: {
              primitive: "dom_input",
              semanticId: primitive.semanticId,
              valueMatchesExpected: true,
              valueStateAfter: "filled"
            }
          };
        }
        return { status: "success", details: { primitive: "key_press", key: "Enter" } };
      }
    });

    await runtime.startTask("在邮箱输入 ada@example.test 并按回车");
    const result = await runtime.runNextStep();
    const events = await store.loadAfter("session-fast-field-enter", "task-fast-field-enter");

    expect(result.status).toBe("continue");
    expect(result.reason).toBe("fast_field_enter");
    expect(result.metrics).toMatchObject({ modelCalls: 0, observationRounds: 1 });
    expect(observeCount).toBe(1);
    expect(planCalls).toBe(0);
    expect(executed).toEqual([
      { type: "dom_input", semanticId: "email_field", value: "ada@example.test" },
      { type: "key_press", key: "Enter" }
    ]);
    expect(events.find((event) => event.type === "PlanRequested")).toBeUndefined();
    expect(events.find((event) => event.type === "PlanProduced")?.payload).toMatchObject({
      plannerSource: "deterministic_fast_path",
      fastPathSource: "exact_visible_field_enter",
      shortPlan: ["Fill the field and press Enter."],
      nextCommands: [
        { type: "FillField", inputs: { semanticId: "email_field", value: "ada@example.test" } },
        { type: "PressKey", inputs: { key: "Enter", intent: "submit_field", fieldSemanticId: "email_field" } }
      ]
    });
    expect(events.filter((event) => event.type === "CommandIssued").map((event) => event.payload.primitive)).toEqual(executed);
  });

  it("uses a deterministic fast path for focused field entry followed by Enter", async () => {
    const store = new MemoryEventStore();
    const executed: unknown[] = [];
    let planCalls = 0;
    let observeCount = 0;
    const before: PageModel = {
      ...page,
      controls: [
        {
          ...page.controls[0],
          semanticId: "name_field",
          role: "textbox",
          label: "姓名",
          accessibleName: "姓名",
          elementTag: "input",
          valueState: "empty",
          focused: true,
          interactionHints: ["textbox"],
          locatorHints: [{ kind: "css", value: "#name" }],
          confidence: 0.94
        },
        {
          ...page.controls[0],
          semanticId: "email_field",
          role: "textbox",
          label: "邮箱",
          accessibleName: "邮箱",
          elementTag: "input",
          valueState: "empty",
          interactionHints: ["textbox"],
          locatorHints: [{ kind: "css", value: "#email" }],
          confidence: 0.91
        }
      ]
    };
    const runtime = new AgentRuntime({
      sessionId: "session-fast-focused-enter",
      taskId: "task-fast-focused-enter",
      appendEvent: (event) => store.append(event),
      observePage: async () => {
        observeCount += 1;
        return before;
      },
      plan: async () => {
        planCalls += 1;
        throw new Error("planner_should_not_be_called");
      },
      execute: async (primitive) => {
        executed.push(primitive);
        if (primitive.type === "dom_input") {
          return {
            status: "success",
            details: {
              primitive: "dom_input",
              semanticId: primitive.semanticId,
              valueMatchesExpected: true,
              valueStateAfter: "filled"
            }
          };
        }
        return { status: "success", details: { primitive: "key_press", key: "Enter" } };
      }
    });

    await runtime.startTask("输入 Ada Lovelace 并按回车");
    const result = await runtime.runNextStep();
    const events = await store.loadAfter("session-fast-focused-enter", "task-fast-focused-enter");

    expect(result.status).toBe("continue");
    expect(result.reason).toBe("fast_focused_text_entry_enter");
    expect(result.metrics).toMatchObject({ modelCalls: 0, observationRounds: 1 });
    expect(observeCount).toBe(1);
    expect(planCalls).toBe(0);
    expect(executed).toEqual([
      { type: "dom_input", semanticId: "name_field", value: "Ada Lovelace" },
      { type: "key_press", key: "Enter" }
    ]);
    expect(events.find((event) => event.type === "PlanRequested")).toBeUndefined();
    expect(events.find((event) => event.type === "PlanProduced")?.payload).toMatchObject({
      plannerSource: "deterministic_fast_path",
      fastPathSource: "focused_text_entry_enter",
      shortPlan: ["Fill the focused field and press Enter."],
      nextCommands: [
        { type: "FillField", inputs: { semanticId: "name_field", value: "Ada Lovelace", intent: "focused_text_entry" } },
        { type: "PressKey", inputs: { key: "Enter", intent: "submit_focused_field", fieldSemanticId: "name_field" } }
      ]
    });
    expect(events.filter((event) => event.type === "CommandIssued").map((event) => event.payload.primitive)).toEqual(executed);
  });

  it("does not call planner for exact low-risk visible controls", async () => {
    const store = new MemoryEventStore();
    let planCalls = 0;
    const customerMenuPage: PageModel = {
      ...page,
      controls: [
        {
          ...page.controls[0],
          semanticId: "customer_menu",
          role: "menuitem",
          label: "客户管理",
          accessibleName: "客户管理",
          elementTag: "li",
          locatorHints: [{ kind: "css", value: "#customer-menu" }],
          confidence: 0.94
        }
      ]
    };
    const runtime = new AgentRuntime({
      sessionId: "session-fast-click",
      taskId: "task-fast-click",
      appendEvent: (event) => store.append(event),
      observePage: async () => customerMenuPage,
      plan: async () => {
        planCalls += 1;
        return { type: "FinishTask", summary: "unexpected", evidenceRefs: [] };
      },
      execute: async () => ({ status: "success", details: { primitive: "dom_click" } })
    });

    await runtime.startTask("点击客户管理");
    const result = await runtime.runNextStep();
    const events = await store.loadAfter("session-fast-click", "task-fast-click");

    expect(result.status).toBe("continue");
    expect(result.reason).toBe("fast_control_activation");
    expect(result.metrics?.modelCalls).toBe(0);
    expect(planCalls).toBe(0);
    expect(events.find((event) => event.type === "PlanRequested")).toBeUndefined();
    expect(events.find((event) => event.type === "PlanProduced")?.payload).toMatchObject({
      plannerSource: "deterministic_fast_path",
      fastPathSource: "exact_visible_control"
    });
    expect(events.find((event) => event.type === "CommandIssued")?.payload.primitive).toEqual({
      type: "dom_click",
      semanticId: "customer_menu"
    });
  });

  it("requires confirmation for exact destructive controls even in full-auto mode", async () => {
    const store = new MemoryEventStore();
    let planCalls = 0;
    let executeCalls = 0;
    const destructivePage: PageModel = {
      ...page,
      controls: [
        {
          ...page.controls[0],
          semanticId: "delete_button",
          role: "button",
          label: "删除",
          accessibleName: "删除",
          elementTag: "button",
          locatorHints: [{ kind: "css", value: "#delete" }],
          confidence: 0.94
        }
      ]
    };
    const runtime = new AgentRuntime({
      sessionId: "session-fast-destructive-click",
      taskId: "task-fast-destructive-click",
      safetyMode: "experimental_full_auto",
      appendEvent: (event) => store.append(event),
      observePage: async () => destructivePage,
      plan: async () => {
        planCalls += 1;
        throw new Error("planner_should_not_be_called");
      },
      execute: async () => {
        executeCalls += 1;
        return { status: "success", details: { primitive: "dom_click" } };
      }
    });

    await runtime.startTask("点击删除");
    const result = await runtime.runNextStep();
    const events = await store.loadAfter("session-fast-destructive-click", "task-fast-destructive-click");

    expect(result.status).toBe("awaiting_confirmation");
    expect(result.reason).toBe("policy_ask_user");
    expect(result.metrics?.modelCalls).toBe(0);
    expect(planCalls).toBe(0);
    expect(executeCalls).toBe(0);
    expect(events.find((event) => event.type === "PlanRequested")).toBeUndefined();
    expect(events.find((event) => event.type === "PlanProduced")?.payload).toMatchObject({
      plannerSource: "deterministic_fast_path",
      fastPathSource: "exact_visible_control",
      nextCommand: { type: "ActivateTarget", inputs: { semanticId: "delete_button" }, riskHint: "high" }
    });
    expect(events.find((event) => event.type === "PolicyEvaluated")?.payload.decision).toMatchObject({
      status: "ask_user",
      riskLevel: "high"
    });
  });

  it("requires fast-path expandable menus to reveal child targets", async () => {
    const store = new MemoryEventStore();
    let planCalls = 0;
    let observeCount = 0;
    const before: PageModel = {
      ...page,
      controls: [
        {
          ...page.controls[0],
          semanticId: "customer_menu",
          role: "menuitem",
          label: "客户管理",
          accessibleName: "客户管理",
          elementTag: "li",
          expandedState: "collapsed",
          childRefs: ["customer_list"],
          locatorHints: [{ kind: "css", value: "#customer-menu" }],
          confidence: 0.94
        },
        {
          ...page.controls[0],
          semanticId: "customer_list",
          role: "menuitem",
          label: "客户列表",
          accessibleName: "客户列表",
          elementTag: "li",
          visibility: "hidden",
          locatorHints: [{ kind: "css", value: "#customer-list" }],
          confidence: 0.9
        }
      ]
    };
    const after: PageModel = {
      ...before,
      controls: [
        { ...before.controls[0], expandedState: "expanded" },
        { ...before.controls[1], visibility: "visible" }
      ]
    };
    const runtime = new AgentRuntime({
      sessionId: "session-fast-expand-menu",
      taskId: "task-fast-expand-menu",
      appendEvent: (event) => store.append(event),
      observePage: async () => {
        observeCount += 1;
        return observeCount === 1 ? before : after;
      },
      plan: async () => {
        planCalls += 1;
        throw new Error("planner_should_not_be_called");
      },
      execute: async () => ({ status: "success", details: { primitive: "dom_click" } })
    });

    await runtime.startTask("点击客户管理");
    const result = await runtime.runNextStep();
    const events = await store.loadAfter("session-fast-expand-menu", "task-fast-expand-menu");

    expect(result.status).toBe("continue");
    expect(result.reason).toBe("fast_control_activation");
    expect(result.metrics?.modelCalls).toBe(0);
    expect(planCalls).toBe(0);
    expect(events.find((event) => event.type === "PlanRequested")).toBeUndefined();
    expect(events.find((event) => event.type === "PlanProduced")?.payload.nextCommand).toMatchObject({
      successCriteria: ["menu_expanded", "child_target_visible"]
    });
    expect(events.find((event) => event.type === "VerificationProduced")?.payload).toMatchObject({
      status: "success",
      satisfiedCriteria: ["menu_expanded", "child_target_visible"]
    });
  });

  it("uses explicit expansion fast path without planner call", async () => {
    const store = new MemoryEventStore();
    let planCalls = 0;
    let observeCount = 0;
    const before: PageModel = {
      ...page,
      controls: [
        {
          ...page.controls[0],
          semanticId: "customer_menu",
          role: "menuitem",
          label: "客户管理",
          accessibleName: "客户管理",
          elementTag: "li",
          expandedState: "collapsed",
          childRefs: ["customer_list"],
          locatorHints: [{ kind: "css", value: "#customer-menu" }],
          confidence: 0.94
        },
        {
          ...page.controls[0],
          semanticId: "customer_list",
          role: "menuitem",
          label: "客户列表",
          accessibleName: "客户列表",
          elementTag: "li",
          visibility: "hidden",
          locatorHints: [{ kind: "css", value: "#customer-list" }],
          confidence: 0.9
        }
      ]
    };
    const after: PageModel = {
      ...before,
      controls: [
        { ...before.controls[0], expandedState: "expanded" },
        { ...before.controls[1], visibility: "visible" }
      ]
    };
    const runtime = new AgentRuntime({
      sessionId: "session-fast-explicit-expand-menu",
      taskId: "task-fast-explicit-expand-menu",
      appendEvent: (event) => store.append(event),
      observePage: async () => {
        observeCount += 1;
        return observeCount === 1 ? before : after;
      },
      plan: async () => {
        planCalls += 1;
        throw new Error("planner_should_not_be_called");
      },
      execute: async () => ({ status: "success", details: { primitive: "dom_click" } })
    });

    await runtime.startTask("展开客户管理");
    const result = await runtime.runNextStep();
    const events = await store.loadAfter("session-fast-explicit-expand-menu", "task-fast-explicit-expand-menu");

    expect(result.status).toBe("continue");
    expect(result.reason).toBe("fast_expansion_control");
    expect(result.metrics?.modelCalls).toBe(0);
    expect(planCalls).toBe(0);
    expect(events.find((event) => event.type === "PlanRequested")).toBeUndefined();
    expect(events.find((event) => event.type === "PlanProduced")?.payload).toMatchObject({
      plannerSource: "deterministic_fast_path",
      fastPathSource: "exact_visible_expansion_control",
      nextCommand: {
        type: "ActivateTarget",
        inputs: { semanticId: "customer_menu", desiredState: "expanded", desiredExpanded: true },
        successCriteria: ["menu_expanded", "child_target_visible"]
      }
    });
  });

  it("uses tab switch fast path without planner call", async () => {
    const store = new MemoryEventStore();
    let planCalls = 0;
    let observeCount = 0;
    const before: PageModel = {
      ...page,
      controls: [
        {
          ...page.controls[0],
          semanticId: "tab_pending",
          role: "tab",
          label: "待办",
          accessibleName: "待办",
          elementTag: "button",
          valueState: "selected",
          interactionHints: ["tab"],
          locatorHints: [{ kind: "css", value: "#tab-pending" }],
          confidence: 0.94
        },
        {
          ...page.controls[0],
          semanticId: "tab_started",
          role: "tab",
          label: "已发起",
          accessibleName: "已发起",
          elementTag: "button",
          interactionHints: ["tab"],
          locatorHints: [{ kind: "css", value: "#tab-started" }],
          confidence: 0.94
        }
      ]
    };
    const after: PageModel = {
      ...before,
      controls: [
        { ...before.controls[0], valueState: undefined },
        { ...before.controls[1], valueState: "selected" }
      ]
    };
    const runtime = new AgentRuntime({
      sessionId: "session-fast-tab-switch",
      taskId: "task-fast-tab-switch",
      appendEvent: (event) => store.append(event),
      observePage: async () => {
        observeCount += 1;
        return observeCount === 1 ? before : after;
      },
      plan: async () => {
        planCalls += 1;
        throw new Error("planner_should_not_be_called");
      },
      execute: async () => ({ status: "success", details: { primitive: "dom_click" } })
    });

    await runtime.startTask("切换到已发起");
    const result = await runtime.runNextStep();
    const events = await store.loadAfter("session-fast-tab-switch", "task-fast-tab-switch");

    expect(result.status).toBe("continue");
    expect(result.reason).toBe("fast_tab_control");
    expect(result.metrics?.modelCalls).toBe(0);
    expect(planCalls).toBe(0);
    expect(events.find((event) => event.type === "PlanRequested")).toBeUndefined();
    expect(events.find((event) => event.type === "PlanProduced")?.payload).toMatchObject({
      plannerSource: "deterministic_fast_path",
      fastPathSource: "visible_tab_control",
      nextCommand: {
        type: "ActivateTarget",
        inputs: { semanticId: "tab_started", desiredState: "selected", desiredSelected: true },
        successCriteria: ["control_value_matches"]
      }
    });
    expect(events.find((event) => event.type === "VerificationProduced")?.payload).toMatchObject({
      status: "success",
      satisfiedCriteria: ["control_value_matches"]
    });
  });

  it("uses read content fast path without planner call", async () => {
    const store = new MemoryEventStore();
    const executed: unknown[] = [];
    let planCalls = 0;
    let observeCount = 0;
    const readablePage: PageModel = {
      ...page,
      controls: [],
      textBlocks: [
        {
          semanticId: "summary_text",
          kind: "paragraph",
          text: "客户摘要：本月新增 12 人",
          visibility: "visible",
          locatorHints: [{ kind: "text", value: "客户摘要", confidence: 0.8 }],
          confidence: 0.86
        }
      ],
      readableContent: ["客户摘要：本月新增 12 人"]
    };
    const runtime = new AgentRuntime({
      sessionId: "session-fast-read-content",
      taskId: "task-fast-read-content",
      appendEvent: (event) => store.append(event),
      observePage: async () => {
        observeCount += 1;
        return readablePage;
      },
      plan: async () => {
        planCalls += 1;
        throw new Error("planner_should_not_be_called");
      },
      execute: async (primitive) => {
        executed.push(primitive);
        return {
          status: "success",
          details: {
            primitive: "read_content",
            semanticId: "summary_text",
            source: "text_block",
            text: "客户摘要：本月新增 12 人",
            textLength: 16
          }
        };
      }
    });

    await runtime.startTask("查看客户摘要内容");
    const result = await runtime.runNextStep();
    const events = await store.loadAfter("session-fast-read-content", "task-fast-read-content");

    expect(result.status).toBe("continue");
    expect(result.reason).toBe("fast_read_content");
    expect(result.metrics).toEqual({ modelCalls: 0, observationRounds: 1 });
    expect(observeCount).toBe(1);
    expect(planCalls).toBe(0);
    expect(executed).toEqual([{ type: "read_content", semanticId: "summary_text", query: "客户摘要" }]);
    expect(events.find((event) => event.type === "PlanRequested")).toBeUndefined();
    expect(events.find((event) => event.type === "ObservationRequested" && event.payload.reason === "after_command")).toBeUndefined();
    expect(events.find((event) => event.type === "PlanProduced")?.payload).toMatchObject({
      plannerSource: "deterministic_fast_path",
      fastPathSource: "explicit_read_content",
      shortPlan: ["Read the requested page content."],
      nextCommand: {
        type: "ReadContent",
        targetGoal: "客户摘要",
        inputs: { query: "客户摘要", intent: "read_content" },
        successCriteria: ["content_read"]
      }
    });
    expect(events.find((event) => event.type === "VerificationProduced")?.payload).toMatchObject({
      status: "success",
      satisfiedCriteria: ["content_read"]
    });
  });

  it("executes ReadContent commands as read primitives without after-command observation", async () => {
    const store = new MemoryEventStore();
    let observeCount = 0;
    let executeCount = 0;
    const readablePage: PageModel = {
      ...page,
      controls: [],
      textBlocks: [
        {
          semanticId: "summary_text",
          kind: "paragraph",
          text: "客户摘要：本月新增 12 人",
          visibility: "visible",
          locatorHints: [{ kind: "text", value: "客户摘要", confidence: 0.8 }],
          confidence: 0.86
        }
      ],
      readableContent: ["客户摘要：本月新增 12 人"]
    };
    const runtime = new AgentRuntime({
      sessionId: "session-read-content",
      taskId: "task-read-content",
      appendEvent: (event) => store.append(event),
      observePage: async () => {
        observeCount += 1;
        return readablePage;
      },
      plan: async () => ({
        taskUnderstanding: "读取客户摘要",
        activeSubgoal: "读取客户摘要内容",
        shortPlan: ["读取客户摘要"],
        nextCommand: {
          type: "ReadContent",
          targetGoal: "客户摘要",
          inputs: {},
          expectedOutcome: "客户摘要内容已读取",
          successCriteria: ["content_read"],
          riskHint: "low"
        },
        expectedOutcome: "客户摘要内容已读取",
        successCriteria: ["content_read"],
        riskHint: "low",
        missingInfo: [],
        assumptions: [],
        reasoningSummary: "Visible summary text is available in the observation."
      }),
      execute: async (primitive) => {
        executeCount += 1;
        expect(primitive).toEqual({ type: "read_content", semanticId: "summary_text", query: "客户摘要" });
        return {
          status: "success",
          details: {
            primitive: "read_content",
            semanticId: "summary_text",
            source: "text_block",
            text: "客户摘要：本月新增 12 人",
            textLength: 16
          }
        };
      }
    });

    await runtime.startTask("汇总客户摘要");
    const result = await runtime.runNextStep();
    const events = await store.loadAfter("session-read-content", "task-read-content");

    expect(result.status).toBe("continue");
    expect(result.reason).toBe("success");
    expect(result.metrics).toEqual({ modelCalls: 1, observationRounds: 1 });
    expect(observeCount).toBe(1);
    expect(executeCount).toBe(1);
    expect(events.find((event) => event.type === "ObservationRequested" && event.payload.reason === "after_command")).toBeUndefined();
    expect(events.find((event) => event.type === "CommandIssued")?.payload.primitive).toEqual({
      type: "read_content",
      semanticId: "summary_text",
      query: "客户摘要"
    });
    expect(events.find((event) => event.type === "VerificationProduced")?.payload).toMatchObject({
      status: "success",
      satisfiedCriteria: ["content_read"]
    });
  });

  it("exposes initial capability ids", () => {
    expect(initialCapabilities).toContain("VisionCapability");
  });

  it("runs another observation round when planner asks for more information", async () => {
    const store = new MemoryEventStore();
    let observations = 0;
    let plans = 0;
    const runtime = new AgentRuntime({
      sessionId: "session-2",
      taskId: "task-2",
      observationBudget: { maxObservationRoundsPerStep: 3 },
      appendEvent: (event) => store.append(event),
      observePage: async () => {
        observations += 1;
        return page;
      },
      plan: async () => {
        plans += 1;
        if (plans === 1) {
          return {
            type: "NeedMoreObservation",
            reason: "Need more page nodes",
            scope: "full_page",
            query: "Settings"
          };
        }
        return {
          type: "FinishTask",
          summary: "Settings is visible.",
          evidenceRefs: []
        };
      },
      execute: async () => ({ status: "success", details: {} })
    });

    await runtime.startTask("Find settings");
    const result = await runtime.runNextStep();

    const events = await store.loadAfter("session-2", "task-2");
    expect(result.status).toBe("completed");
    expect(observations).toBe(2);
    expect(events.filter((event) => event.type === "ObservationRequested")).toHaveLength(2);
    expect(events.find((event) => event.type === "RecoverySuggested")?.payload.reason).toBe("need_more_observation");
    expect(events.find((event) => event.type === "TaskCompleted")?.payload.summary).toBe("Settings is visible.");
  });

  it("re-observes and replans when a planned target cannot be bound", async () => {
    const store = new MemoryEventStore();
    const sparsePage: PageModel = {
      ...page,
      controls: [],
      readableContent: ["Navigation is loading"],
      textBlocks: []
    };
    let observations = 0;
    let plans = 0;
    const planObservationRounds: Array<number | undefined> = [];
    const runtime = new AgentRuntime({
      sessionId: "session-bind-replan",
      taskId: "task-bind-replan",
      observationBudget: { maxObservationRoundsPerStep: 3, expandedCandidateLimit: 320 },
      safetyMode: "experimental_full_auto",
      appendEvent: (event) => store.append(event),
      observePage: async () => {
        observations += 1;
        return observations === 1 ? sparsePage : page;
      },
      plan: async (input) => {
        plans += 1;
        planObservationRounds.push(input.observationRound);
        return {
          taskUnderstanding: "open settings",
          activeSubgoal: "open settings panel",
          shortPlan: plans === 1 ? ["try stale observation"] : ["use expanded observation"],
          nextCommand: {
            type: "ActivateTarget",
            targetGoal: "Settings",
            inputs: {}
          },
          expectedOutcome: "settings panel opens",
          successCriteria: ["target_visible"],
          riskHint: "low",
          missingInfo: [],
          assumptions: [],
          reasoningSummary: "Settings should be available after a richer observation"
        };
      },
      execute: async () => ({ status: "success", details: { clicked: true } })
    });

    await runtime.startTask("Open settings");
    const result = await runtime.runNextStep();
    const events = await store.loadAfter("session-bind-replan", "task-bind-replan");

    expect(result.status).toBe("continue");
    expect(plans).toBe(2);
    expect(observations).toBe(3);
    expect(planObservationRounds).toEqual([1, 2]);
    expect(events.filter((event) => event.type === "RecoverySuggested").map((event) => event.payload.reason)).toContain("bind_failed_replan");
    expect(events.find((event) => event.type === "TaskFailed")).toBeUndefined();
    expect(events.find((event) => event.type === "CommandBound")?.payload.targetRef).toBe("settings_button");
  });

  it("passes smart observation request and candidate budget to the observe port", async () => {
    const store = new MemoryEventStore();
    const observeCalls: Array<{ request?: unknown; options?: unknown }> = [];
    let plans = 0;
    const runtime = new AgentRuntime({
      sessionId: "session-smart-observe",
      taskId: "task-smart-observe",
      observationBudget: {
        initialCandidateLimit: 120,
        expandedCandidateLimit: 320,
        hardCandidateLimit: 600,
        maxObservationRoundsPerStep: 3
      },
      appendEvent: (event) => store.append(event),
      observePage: async (request, options) => {
        observeCalls.push({ request, options });
        return page;
      },
      plan: async () => {
        plans += 1;
        if (plans === 1) {
          return {
            type: "NeedMoreObservation",
            reason: "Need sidebar order entry",
            query: "订单 管理",
            scope: "sidebar",
            expand: ["hidden_menus", "nearby_text"],
            preferredRoles: ["link", "menuitem"]
          };
        }
        return { type: "FinishTask", summary: "Found enough candidates.", evidenceRefs: [] };
      },
      execute: async () => ({ status: "success", details: {} })
    });

    await runtime.startTask("打开订单管理");
    await runtime.runNextStep();

    expect(observeCalls).toHaveLength(2);
    expect(observeCalls[0].options).toMatchObject({ observationRound: 1, candidateLimit: 120 });
    expect(observeCalls[1].request).toMatchObject({ query: "订单 管理", scope: "sidebar" });
    expect(observeCalls[1].options).toMatchObject({ observationRound: 2, candidateLimit: 320 });
  });

  it("requests menu discovery immediately after partial activation without page change", async () => {
    const store = new MemoryEventStore();
    const observeCalls: Array<{ request?: unknown; options?: unknown }> = [];
    let plans = 0;
    let executeCount = 0;
    const runtime = new AgentRuntime({
      sessionId: "session-partial-menu-discovery",
      taskId: "task-partial-menu-discovery",
      observationBudget: {
        initialCandidateLimit: 120,
        expandedCandidateLimit: 320,
        maxObservationRoundsPerStep: 3
      },
      appendEvent: (event) => store.append(event),
      observePage: async (request, options) => {
        observeCalls.push({ request, options });
        return page;
      },
      plan: async () => {
        plans += 1;
        if (plans === 1) {
          return {
            taskUnderstanding: "open settings",
            activeSubgoal: "open settings",
            shortPlan: ["click settings"],
            nextCommand: {
              type: "ActivateTarget",
              targetGoal: "Settings",
              inputs: {}
            },
            expectedOutcome: "settings page opens",
            successCriteria: ["target_visible", "page_changed"],
            riskHint: "low",
            missingInfo: [],
            assumptions: [],
            reasoningSummary: "Settings is visible but may be a collapsed menu."
          };
        }
        return { type: "FinishTask", summary: "Recovered with richer menu observation.", evidenceRefs: [] };
      },
      execute: async () => {
        executeCount += 1;
        return { status: "success", details: { primitive: "dom_click" } };
      }
    });

    await runtime.startTask("Open settings");
    const result = await runtime.runNextStep();
    const events = await store.loadAfter("session-partial-menu-discovery", "task-partial-menu-discovery");
    const recovery = observeCalls.find((call) =>
      (call.request as { reason?: string } | undefined)?.reason === "partial_activation_needs_menu_discovery"
    );

    expect(result.status).toBe("completed");
    expect(executeCount).toBe(1);
    expect(recovery?.request).toMatchObject({
      query: "Settings",
      expand: expect.arrayContaining(["hidden_menus", "offscreen_links", "nearby_text"])
    });
    expect(events.filter((event) => event.type === "RecoverySuggested").map((event) => event.payload.reason)).toContain(
      "partial_activation_needs_menu_discovery"
    );
  });

  it("does not request hidden menu discovery for partial NavigateTo verification", async () => {
    const store = new MemoryEventStore();
    let observeCount = 0;
    const runtime = new AgentRuntime({
      sessionId: "session-navigate-partial-no-menu",
      taskId: "task-navigate-partial-no-menu",
      safetyMode: "experimental_full_auto",
      appendEvent: (event) => store.append(event),
      observePage: async () => {
        observeCount += 1;
        return page;
      },
      plan: async () => ({
        taskUnderstanding: "open a URL",
        activeSubgoal: "navigate",
        shortPlan: ["navigate"],
        nextCommand: {
          type: "NavigateTo",
          targetGoal: "Settings",
          inputs: { url: "https://example.test/login" }
        },
        expectedOutcome: "page opens",
        successCriteria: ["target_visible", "page_changed"],
        riskHint: "low",
        missingInfo: [],
        assumptions: [],
        reasoningSummary: "Navigation may keep the same app shell visible."
      }),
      execute: async (primitive) => ({ status: "success", details: { primitive } })
    });

    await runtime.startTask("Open the login page");
    const result = await runtime.runNextStep();
    const events = await store.loadAfter("session-navigate-partial-no-menu", "task-navigate-partial-no-menu");

    expect(result.status).toBe("continue");
    expect(observeCount).toBe(2);
    expect(events.find((event) => event.type === "VerificationProduced")?.payload.status).toBe("partial");
    expect(events.filter((event) => event.type === "RecoverySuggested").map((event) => event.payload.reason)).not.toContain(
      "partial_activation_needs_menu_discovery"
    );
  });

  it("suspends quickly when the planner repeats the same observation request", async () => {
    const store = new MemoryEventStore();
    let plans = 0;
    let observations = 0;
    const repeatedRequest = {
      reason: "Need hidden menus",
      query: "客户",
      scope: "sidebar" as const,
      expand: ["hidden_menus", "nearby_text"] as const,
      preferredRoles: ["menuitem"] as const
    };
    const runtime = new AgentRuntime({
      sessionId: "session-repeat-observe",
      taskId: "task-repeat-observe",
      observationBudget: { maxObservationRoundsPerStep: 4 },
      appendEvent: (event) => store.append(event),
      observePage: async () => {
        observations += 1;
        return page;
      },
      plan: async () => {
        plans += 1;
        return {
          type: "NeedMoreObservation",
          ...repeatedRequest
        };
      },
      execute: async () => ({ status: "success", details: {} })
    });

    await runtime.startTask("Open customer menu");
    const result = await runtime.runNextStep();
    const events = await store.loadAfter("session-repeat-observe", "task-repeat-observe");

    expect(result.status).toBe("awaiting_user_input");
    expect(result.reason).toBe("repeated_observation_request");
    expect(plans).toBe(2);
    expect(observations).toBe(2);
    expect(events.find((event) => event.type === "RuntimeSuspended")?.payload.reason).toBe("repeated_observation_request");
  });

  it("re-observes and retries once when a bound DOM target is not found during execution", async () => {
    const store = new MemoryEventStore();
    const emptyField: PageModel = {
      ...page,
      controls: [
        {
          ...page.controls[0],
          semanticId: "email_field",
          role: "textbox",
          label: "Email",
          accessibleName: "Email",
          elementTag: "input",
          valueState: "empty",
          interactionHints: ["textbox"],
          locatorHints: [{ kind: "attribute", value: "data-testid=email" }]
        }
      ]
    };
    const filledField: PageModel = {
      ...emptyField,
      controls: [{ ...emptyField.controls[0], valueState: "filled" }]
    };
    let observeCount = 0;
    let executeCount = 0;
    const runtime = new AgentRuntime({
      sessionId: "session-retry",
      taskId: "task-retry",
      safetyMode: "experimental_full_auto",
      observationBudget: { expandedCandidateLimit: 320 },
      appendEvent: (event) => store.append(event),
      observePage: async () => {
        observeCount += 1;
        return observeCount === 4 ? filledField : emptyField;
      },
      plan: async () => ({
        taskUnderstanding: "fill email",
        activeSubgoal: "fill email field",
        shortPlan: ["fill email"],
        nextCommand: {
          type: "FillField",
          targetGoal: "Email",
          inputs: { controlId: "email_field", value: "ada@example.test" }
        },
        expectedOutcome: "email field is filled",
        successCriteria: ["control_value_matches"],
        riskHint: "low",
        missingInfo: [],
        assumptions: [],
        reasoningSummary: "Email field is visible"
      }),
      execute: async () => {
        executeCount += 1;
        if (executeCount === 1) return { status: "failed", reason: "element_not_found", details: { primitive: "dom_input" } };
        return { status: "success", details: { primitive: "dom_input" } };
      }
    });

    await runtime.startTask("填写邮箱");
    const result = await runtime.runNextStep();
    const events = await store.loadAfter("session-retry", "task-retry");

    expect(result.status).toBe("continue");
    expect(executeCount).toBe(2);
    expect(events.filter((event) => event.type === "RecoverySuggested").map((event) => event.payload.reason)).toContain("retry_after_reobserve");
    expect(events.filter((event) => event.type === "CommandIssued")).toHaveLength(2);
    expect(events.find((event) => event.type === "TaskFailed")).toBeUndefined();
  });

  it("executes a bounded nextCommands batch in order", async () => {
    const store = new MemoryEventStore();
    const executed: unknown[] = [];
    const loginPage: PageModel = {
      ...page,
      controls: [
        {
          ...page.controls[0],
          semanticId: "control_3_textbox_",
          role: "textbox",
          label: "账号",
          accessibleName: "账号",
          elementTag: "input",
          valueState: "empty",
          interactionHints: ["textbox"],
          locatorHints: [{ kind: "attribute", value: "data-testid=login-username" }]
        },
        {
          ...page.controls[0],
          semanticId: "control_4_textbox_",
          role: "textbox",
          label: "密码",
          accessibleName: "密码",
          elementTag: "input",
          valueState: "empty",
          interactionHints: ["textbox", "password"],
          locatorHints: [{ kind: "attribute", value: "data-testid=login-password" }]
        }
      ]
    };

    const runtime = new AgentRuntime({
      sessionId: "session-batch",
      taskId: "task-batch",
      safetyMode: "experimental_full_auto",
      appendEvent: (event) => store.append(event),
      observePage: async () => loginPage,
      plan: async () => ({
        taskUnderstanding: "login",
        activeSubgoal: "fill credentials",
        shortPlan: ["fill account", "fill password"],
        nextCommands: [
          {
            type: "FillField",
            targetGoal: "账号",
            inputs: { controlId: "control_3_textbox_", value: "admin" },
            expectedOutcome: "账号已填写",
            successCriteria: ["control_value_matches"],
            riskHint: "low"
          },
          {
            type: "FillField",
            targetGoal: "密码",
            inputs: { controlId: "control_4_textbox_", value: "123456" },
            expectedOutcome: "密码已填写",
            successCriteria: ["control_value_matches"],
            riskHint: "medium"
          }
        ],
        expectedOutcome: "credentials are filled",
        successCriteria: ["control_value_matches"],
        riskHint: "medium",
        missingInfo: [],
        assumptions: [],
        reasoningSummary: "Fill both credential fields in one batch."
      }),
      execute: async (primitive) => {
        executed.push(primitive);
        return {
          status: "success",
          details: {
            primitive: "dom_input",
            semanticId: "semanticId" in primitive ? primitive.semanticId : undefined,
            valueMatchesExpected: true,
            valueStateAfter: "filled"
          }
        };
      }
    });

    await runtime.startTask("登录系统");
    const result = await runtime.runNextStep();
    const events = await store.loadAfter("session-batch", "task-batch");

    expect(result.status).toBe("continue");
    expect(executed).toEqual([
      { type: "dom_input", semanticId: "control_3_textbox_", value: "admin" },
      { type: "dom_input", semanticId: "control_4_textbox_", value: "123456" }
    ]);
    expect(events.filter((event) => event.type === "CommandIssued")).toHaveLength(2);
    expect(events.filter((event) => event.type === "VerificationProduced").map((event) => event.payload.status)).toEqual([
      "success",
      "success"
    ]);
  });

  it("allows balanced submit commands when an active task consent scope matches", async () => {
    const store = new MemoryEventStore();
    const submitPage: PageModel = {
      ...page,
      controls: [
        {
          ...page.controls[0],
          semanticId: "submit_button",
          role: "button",
          label: "Submit",
          accessibleName: "Submit",
          interactionHints: ["button", "submit"],
          locatorHints: [{ kind: "css", value: "#submit" }]
        }
      ]
    };
    const runtime = new AgentRuntime({
      sessionId: "session-consent",
      taskId: "task-consent",
      safetyMode: "balanced",
      getConsentScope: () => ({
        id: "scope-1",
        taskId: "task-consent",
        origin: "https://example.test",
        pageIdentity: "Fixture",
        commandTypes: ["SubmitCurrentForm"],
        dataCategories: [],
        expiresAt: Date.now() + 60_000
      }),
      appendEvent: (event) => store.append(event),
      observePage: async () => submitPage,
      plan: async () => ({
        taskUnderstanding: "submit form",
        activeSubgoal: "submit form",
        shortPlan: ["submit"],
        nextCommand: {
          type: "SubmitCurrentForm",
          targetGoal: "Submit",
          inputs: {},
          expectedOutcome: "form submitted",
          successCriteria: ["target_visible"],
          riskHint: "medium"
        },
        expectedOutcome: "form submitted",
        successCriteria: ["target_visible"],
        riskHint: "medium",
        missingInfo: [],
        assumptions: [],
        reasoningSummary: "Task consent already allows this submit."
      }),
      execute: async () => ({ status: "success", details: { primitive: "dom_click" } })
    });

    await runtime.startTask("提交当前表单");
    const result = await runtime.runNextStep();
    const events = await store.loadAfter("session-consent", "task-consent");

    expect(result.status).toBe("continue");
    expect(events.find((event) => event.type === "UserConsentRequested")).toBeUndefined();
    expect(events.find((event) => event.type === "PolicyEvaluated")?.payload.decision).toMatchObject({
      status: "allow",
      consentScopeRef: "scope-1"
    });
    expect(events.find((event) => event.type === "CommandIssued")).toBeDefined();
  });
});
