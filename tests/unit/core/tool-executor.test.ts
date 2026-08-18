import { describe, expect, it, vi } from "vitest";
import type { SerializableRecord } from "../../../src/core/architecture/serialization";
import type { BrowserPrimitive, PrimitiveResult } from "../../../src/core/commands/commands";
import { sanitizeGeneratedTextArtifact, type FileAttachmentContext, type GeneratedTextArtifact } from "../../../src/core/capabilities/file-artifacts";
import type { ScheduledTaskRecord } from "../../../src/core/capabilities/schedule";
import type { CapabilitySettingsState } from "../../../src/core/capabilities/settings";
import { sanitizeRecordedWorkflowDraft, type RecordedWorkflowDraft, type SkillPackageDetail } from "../../../src/core/capabilities/skills";
import type { ScratchpadRecord } from "../../../src/core/capabilities/scratchpad";
import type { ControlCandidate, PageModel } from "../../../src/core/observation/page-model";
import { executeRegisteredTool } from "../../../src/core/tools/tool-executor";
import { createDefaultToolRegistry } from "../../../src/core/tools/tool-registry";

const registry = createDefaultToolRegistry();

function tool(name: string) {
  const definition = registry.getTool(name);
  if (!definition) throw new Error(`missing fixture tool: ${name}`);
  return definition;
}

function control(overrides: Partial<ControlCandidate> = {}): ControlCandidate {
  return {
    semanticId: "control_1_button_save",
    role: "button",
    label: "保存",
    accessibleName: "保存",
    elementTag: "button",
    disabled: false,
    required: false,
    visibility: "visible",
    interactionHints: ["button"],
    locatorHints: [{ kind: "attribute", value: "data-naturalclick-handle=nc_save", confidence: 0.99 }],
    confidence: 0.92,
    ...overrides
  };
}

function page(overrides: Partial<PageModel> = {}): PageModel {
  return {
    pageIdentity: {
      url: "https://example.test/customers",
      title: "客户列表",
      origin: "https://example.test",
      path: "/customers"
    },
    viewport: { width: 1280, height: 720, scrollX: 0, scrollY: 0, deviceScaleFactor: 1 },
    controls: [control()],
    textBlocks: [
      {
        semanticId: "text_1_heading_customers",
        kind: "heading",
        text: "客户列表",
        visibility: "visible",
        locatorHints: [],
        confidence: 0.9
      }
    ],
    forms: [],
    feedback: [],
    readableContent: ["客户列表", "张三 详情", "李四 详情"],
    riskSignals: [],
    capturedAt: 100,
    atlas: {
      atlasId: "atlas_1",
      tabId: 1,
      url: "https://example.test/customers",
      title: "客户列表",
      fingerprint: { url: "https://example.test/customers", bodyTextLengthBucket: 100, interactiveCountBucket: 10, topSectionCount: 1 },
      controls: [],
      forms: [],
      targets: []
    },
    atlasText: '<page_atlas atlas_id="atlas_1"></page_atlas>',
    interactiveIndex: [{ frameId: 0, handle: "nc_save", tag: "button", role: "button", label: "保存", text: "保存" }],
    interactiveIndexText: '<interactive frame_id="0" handle="nc_save" role="button" label="保存">保存</interactive>',
    ...overrides
  };
}

function settings(overrides: Partial<CapabilitySettingsState> = {}): CapabilitySettingsState {
  return {
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
    },
    ...overrides
  };
}

describe("tool executor", () => {
  it("loads optional tool groups through the injected disclosure port", async () => {
    const loadToolGroups = vi.fn(() => ({
      loaded: ["search" as const],
      alreadyActive: ["skills" as const],
      unavailable: ["pdf" as const],
      unknown: [],
      activeGroups: ["core" as const, "search" as const, "skills" as const]
    }));

    const result = await executeRegisteredTool(tool("load_tools"), { groups: ["search", "skills", "pdf", "bogus"] }, {
      observePage: async () => page(),
      executePrimitive: async () => ({ status: "success", details: {} }),
      loadToolGroups
    });

    expect(result.success).toBe(true);
    expect(loadToolGroups).toHaveBeenCalledWith(["search", "skills", "pdf"]);
    expect(result.observation).toContain("Loaded tool groups: search");
    expect(result.observation).toContain("Already active: skills");
    expect(result.observation).toContain("Unavailable or disabled: pdf");
    expect(result.observation).toContain("Unknown or not loadable: bogus");
  });

  it("executes read_page through the observe port with the requested mode", async () => {
    const observed = vi.fn(async () => page());

    const result = await executeRegisteredTool(tool("read_page"), { mode: "interactive", candidateLimit: 12 }, {
      observePage: observed,
      executePrimitive: async () => ({ status: "success", details: {} })
    });

    expect(result.success).toBe(true);
    expect(result.observation).toContain("<interactive");
    expect(observed).toHaveBeenCalledWith({ mode: "interactive", candidateLimit: 12 });
  });

  it("reuses the latest page snapshot for read_page by default", async () => {
    const observed = vi.fn(async () => page({ atlasText: "<page_atlas>fresh</page_atlas>" }));
    const cached = page({ atlasText: "<page_atlas>cached</page_atlas>" });

    const result = await executeRegisteredTool(tool("read_page"), { mode: "atlas", candidateLimit: 12 }, {
      observePage: observed,
      getLastPage: () => cached,
      executePrimitive: async () => ({ status: "success", details: {} })
    });

    expect(result.success).toBe(true);
    expect(result.observation).toContain("cached");
    expect((result.data as SerializableRecord).cached).toBe(true);
    expect(observed).not.toHaveBeenCalled();
  });

  it("refreshes read_page when requested or when cached interactive handles are missing", async () => {
    const observed = vi.fn(async () => page({ interactiveIndexText: "<interactive>fresh</interactive>" }));

    const refreshed = await executeRegisteredTool(tool("read_page"), { mode: "atlas", refresh: true }, {
      observePage: observed,
      getLastPage: () => page({ atlasText: "<page_atlas>cached</page_atlas>" }),
      executePrimitive: async () => ({ status: "success", details: {} })
    });

    const refreshedForHandles = await executeRegisteredTool(tool("read_page"), { mode: "interactive" }, {
      observePage: observed,
      getLastPage: () => page({ interactiveIndex: undefined, interactiveIndexText: undefined }),
      executePrimitive: async () => ({ status: "success", details: {} })
    });

    expect((refreshed.data as SerializableRecord).cached).toBe(false);
    expect((refreshedForHandles.data as SerializableRecord).cached).toBe(false);
    expect(observed).toHaveBeenCalledTimes(2);
  });

  it("reads an interactive target by frame-aware handle", async () => {
    const result = await executeRegisteredTool(tool("read_target"), { frameId: 0, handle: "nc_save" }, {
      observePage: async () => page(),
      getLastPage: () => page(),
      executePrimitive: async () => ({ status: "success", details: {} })
    });

    expect(result.success).toBe(true);
    expect(result.observation).toContain("handle=nc_save");
    expect((result.data as SerializableRecord).id).toBe("control_1_button_save");
  });

  it("does not read an interactive target when handle belongs to another frame", async () => {
    const iframePage = page({
      interactiveIndex: [{ frameId: 1, handle: "nc_save", tag: "button", role: "button", label: "保存", text: "保存" }],
      interactiveIndexText: '<interactive frame_id="1" handle="nc_save" role="button" label="保存">保存</interactive>'
    });

    const result = await executeRegisteredTool(tool("read_target"), { frameId: 0, handle: "nc_save" }, {
      observePage: async () => iframePage,
      getLastPage: () => iframePage,
      executePrimitive: async () => ({ status: "success", details: {} })
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("handle_frame_not_found");
  });

  it("maps browser tool handles back to semantic ids before executing primitives", async () => {
    const executed = vi.fn(async (_primitive: BrowserPrimitive): Promise<PrimitiveResult> => ({ status: "success", details: { primitive: "dom_click" } }));

    const result = await executeRegisteredTool(tool("click"), { frameId: 0, handle: "nc_save" }, {
      observePage: async () => page(),
      getLastPage: () => page(),
      executePrimitive: executed
    });

    expect(result.success).toBe(true);
    expect(executed).toHaveBeenCalledWith({ type: "dom_click", semanticId: "control_1_button_save" });
  });

  it("does not execute browser tools when handle belongs to another frame", async () => {
    const executed = vi.fn(async (_primitive: BrowserPrimitive): Promise<PrimitiveResult> => ({ status: "success", details: { primitive: "dom_click" } }));
    const iframePage = page({
      interactiveIndex: [{ frameId: 1, handle: "nc_save", tag: "button", role: "button", label: "保存", text: "保存" }],
      interactiveIndexText: '<interactive frame_id="1" handle="nc_save" role="button" label="保存">保存</interactive>'
    });

    const result = await executeRegisteredTool(tool("click"), { frameId: 0, handle: "nc_save" }, {
      observePage: async () => iframePage,
      getLastPage: () => iframePage,
      executePrimitive: executed
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("handle_frame_not_found");
    expect(result.observation).toContain("frameId=0");
    expect(executed).not.toHaveBeenCalled();
  });

  it("requires frameId for browser handle actions", async () => {
    const executed = vi.fn(async (_primitive: BrowserPrimitive): Promise<PrimitiveResult> => ({ status: "success", details: { primitive: "dom_click" } }));

    const result = await executeRegisteredTool(tool("click"), { handle: "nc_save" }, {
      observePage: async () => page(),
      getLastPage: () => page(),
      executePrimitive: executed
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("missing_frame_id");
    expect(executed).not.toHaveBeenCalled();
  });

  it("maps select tool handles to DOM select option primitives", async () => {
    const executed = vi.fn(async (_primitive: BrowserPrimitive): Promise<PrimitiveResult> => ({
      status: "success",
      details: { primitive: "dom_select_option", valueMatchesExpected: true, selectedOptionText: "启用" }
    }));
    const statusPage = page({
      controls: [
        control({
          semanticId: "status_select",
          role: "combobox",
          label: "状态",
          accessibleName: "状态",
          elementTag: "button",
          interactionHints: ["combobox"],
          locatorHints: [{ kind: "attribute", value: "data-naturalclick-handle=nc_status", confidence: 0.99 }]
        })
      ],
      interactiveIndex: [{ frameId: 0, handle: "nc_status", tag: "button", role: "combobox", label: "状态", text: "状态" }],
      interactiveIndexText: '<interactive frame_id="0" handle="nc_status" role="combobox" label="状态">状态</interactive>'
    });

    const result = await executeRegisteredTool(tool("select"), { frameId: 0, handle: "nc_status", label: "启用" }, {
      observePage: async () => statusPage,
      getLastPage: () => statusPage,
      executePrimitive: executed
    });

    expect(result.success).toBe(true);
    expect(executed).toHaveBeenCalledWith({ type: "dom_select_option", semanticId: "status_select", value: "启用" });
  });

  it("searches current browser context without requiring an external provider", async () => {
    const result = await executeRegisteredTool(tool("search_context"), { query: "张三", maxResults: 3 }, {
      observePage: async () => page(),
      getLastPage: () => page(),
      executePrimitive: async () => ({ status: "success", details: {} }),
      getCapabilitySettings: () => settings()
    });

    expect(result.success).toBe(true);
    expect(result.observation).toContain("张三");
    expect((result.data as SerializableRecord).results).toBeDefined();
  });

  it("delegates custom search to the injected endpoint executor", async () => {
    const customSearch = vi.fn(async () => ({ success: true, observation: "2 custom results" }));

    const result = await executeRegisteredTool(tool("search_context"), { query: "NaturalClick" }, {
      observePage: async () => page(),
      executePrimitive: async () => ({ status: "success", details: {} }),
      getCapabilitySettings: () =>
        settings({
          search: {
            provider: "custom_endpoint",
            endpoint: "https://search.example.test",
            apiKey: "key",
            maxResults: 7
          }
        }),
      customSearch
    });

    expect(result).toEqual({ success: true, observation: "2 custom results" });
    expect(customSearch).toHaveBeenCalledWith({
      endpoint: "https://search.example.test",
      apiKey: "key",
      query: "NaturalClick",
      maxResults: 7
    });
  });

  it("lists and loads skills through injected skill ports", async () => {
    const skill = { id: "skill_customer", name: "客户列表", description: "打开客户列表", enabled: true };
    const listed = await executeRegisteredTool(tool("list_skills"), {}, {
      observePage: async () => page(),
      executePrimitive: async () => ({ status: "success", details: {} }),
      getCapabilitySettings: () => settings(),
      listSkills: async () => [skill]
    });

    expect(listed.observation).toContain("skill_customer");

    const loaded = await executeRegisteredTool(tool("use_skill"), { skillId: "skill_customer" }, {
      observePage: async () => page(),
      executePrimitive: async () => ({ status: "success", details: {} }),
      getCapabilitySettings: () => settings(),
      listSkills: async () => [skill],
      loadSkill: async () => ({ ...skill, instructions: "先打开侧边栏，再点击客户管理。" })
    });

    expect(loaded.success).toBe(true);
    expect(loaded.observation).toContain("<untrusted_skill_content");
    expect(loaded.observation).toContain("客户管理");
  });

  it("records reusable workflow skills through the injected skill store", async () => {
    const skills: SkillPackageDetail[] = [];
    const skillSettings = settings({
      skills: {
        slashCommandsEnabled: true,
        recordedWorkflowsEnabled: true,
        requireConfirmation: true
      }
    });

    const store = {
      listSkills: async () => skills.filter((skill) => skill.enabled).map(({ instructions: _instructions, steps: _steps, ...summary }) => summary),
      loadSkill: async (skillId: string) => skills.find((skill) => skill.id === skillId),
      saveRecordedWorkflow: async (draft: RecordedWorkflowDraft) => {
        const saved = sanitizeRecordedWorkflowDraft(draft, 100);
        if (!saved) throw new Error("invalid_recorded_workflow");
        skills.push(saved);
        return saved;
      }
    };

    const saved = await executeRegisteredTool(
      tool("record_workflow"),
      {
        id: "workflow_reports",
        name: "打开报表",
        description: "进入报表页面并读取摘要",
        steps: ["点击报表入口", "读取页面摘要"]
      },
      {
        observePage: async () => page(),
        executePrimitive: async () => ({ status: "success", details: {} }),
        getCapabilitySettings: () => skillSettings,
        skills: store
      }
    );

    expect(saved.success).toBe(true);
    expect(saved.data).toMatchObject({
      id: "workflow_reports",
      name: "打开报表",
      stepCount: 2
    });

    const listed = await executeRegisteredTool(tool("list_skills"), {}, {
      observePage: async () => page(),
      executePrimitive: async () => ({ status: "success", details: {} }),
      getCapabilitySettings: () => skillSettings,
      skills: store
    });

    expect(listed.observation).toContain("workflow_reports");

    const loaded = await executeRegisteredTool(tool("use_skill"), { skillId: "workflow_reports" }, {
      observePage: async () => page(),
      executePrimitive: async () => ({ status: "success", details: {} }),
      getCapabilitySettings: () => skillSettings,
      skills: store
    });

    expect(loaded.success).toBe(true);
    expect(loaded.observation).toContain("<untrusted_skill_content");
    expect(loaded.observation).toContain("点击报表入口");
  });

  it("saves and lists structured scratchpad records through the injected store", async () => {
    const records: ScratchpadRecord[] = [];

    const saved = await executeRegisteredTool(
      tool("save_scratchpad"),
      {
        id: "customer_1",
        collection: "customers",
        fields: {
          name: "张三",
          amount: 1200,
          active: true,
          nested: { ignored: true }
        },
        evidence: "text_1"
      },
      {
        observePage: async () => page(),
        executePrimitive: async () => ({ status: "success", details: {} }),
        scratchpad: {
          saveRecord: async (record) => {
            records.push(record);
            return record;
          },
          listRecords: async () => records
        }
      }
    );

    expect(saved.success).toBe(true);
    expect(saved.observation).toContain("customer_1");
    expect(saved.data).toMatchObject({
      recordId: "customer_1",
      collection: "customers",
      fieldKeys: ["active", "amount", "name"]
    });
    expect(records[0]).toMatchObject({
      id: "customer_1",
      collection: "customers",
      fields: {
        name: "张三",
        amount: 1200,
        active: true
      },
      evidence: "text_1"
    });

    const listed = await executeRegisteredTool(
      tool("list_scratchpad"),
      { collection: "customers", query: "张三" },
      {
        observePage: async () => page(),
        executePrimitive: async () => ({ status: "success", details: {} }),
        scratchpad: {
          saveRecord: async (record) => record,
          listRecords: async () => records
        }
      }
    );

    expect(listed.success).toBe(true);
    expect(listed.observation).toContain("张三");
    expect((listed.data as SerializableRecord).records).toBeDefined();
  });

  it("lists attached files without leaking previews and reads a selected text preview", async () => {
    const attachments: FileAttachmentContext[] = [
      {
        id: "attachment-1",
        filename: "brief.md",
        mime: "text/markdown",
        size: 42,
        createdAt: 1,
        textPreview: "客户：张三\n金额：1200",
        textPreviewChars: 14,
        textTruncated: false
      },
      {
        id: "attachment-2",
        filename: "scan.pdf",
        mime: "application/pdf",
        size: 2048,
        createdAt: 2
      }
    ];

    const listed = await executeRegisteredTool(tool("list_attachments"), {}, {
      observePage: async () => page(),
      executePrimitive: async () => ({ status: "success", details: {} }),
      getAttachments: () => attachments
    });

    expect(listed.success).toBe(true);
    expect(listed.observation).toContain("brief.md");
    expect(listed.observation).not.toContain("张三");
    expect(((listed.data as SerializableRecord).attachments as SerializableRecord[])[0]).toMatchObject({
      id: "attachment-1",
      filename: "brief.md",
      hasTextPreview: true,
      textPreviewChars: 14
    });
    expect(JSON.stringify(listed.data)).not.toContain("金额");

    const read = await executeRegisteredTool(tool("read_attachment"), { id: "attachment-1" }, {
      observePage: async () => page(),
      executePrimitive: async () => ({ status: "success", details: {} }),
      getAttachments: () => attachments
    });

    expect(read.success).toBe(true);
    expect(read.observation).toContain("text preview is available");
    expect(read.observation).not.toContain("张三");
    expect(read.data).toMatchObject({
      id: "attachment-1",
      filename: "brief.md",
      textPreview: "客户：张三\n金额：1200"
    });

    const binary = await executeRegisteredTool(tool("read_attachment"), { filename: "scan.pdf" }, {
      observePage: async () => page(),
      executePrimitive: async () => ({ status: "success", details: {} }),
      getAttachments: () => attachments
    });

    expect(binary.success).toBe(false);
    expect(binary.error).toBe("attachment_preview_unavailable");
  });

  it("saves, lists, and reads generated text artifacts through the injected store", async () => {
    const artifacts: GeneratedTextArtifact[] = [];
    const artifactStore = {
      saveArtifact: async (draft: Parameters<NonNullable<Parameters<typeof executeRegisteredTool>[2]["artifacts"]>["saveArtifact"]>[0]) => {
        const saved = sanitizeGeneratedTextArtifact(draft, 1000);
        if (!saved) throw new Error("invalid_generated_artifact");
        artifacts.push(saved);
        return saved;
      },
      listArtifacts: async () => artifacts,
      loadArtifact: async (artifactId: string) => artifacts.find((artifact) => artifact.id === artifactId)
    };

    const saved = await executeRegisteredTool(
      tool("save_artifact"),
      {
        id: "report",
        filename: "report.md",
        mime: "text/markdown",
        textContent: "# Report\n客户：张三\nAuthorization: Bearer abcdefghijklmnop",
        source: "browser summary token: source-secret"
      },
      {
        observePage: async () => page(),
        executePrimitive: async () => ({ status: "success", details: {} }),
        artifacts: artifactStore
      }
    );

    expect(saved.success).toBe(true);
    expect(saved.observation).toContain("download it from the Artifacts list");
    expect(saved.data).toMatchObject({
      id: "report",
      filename: "report.md",
      mime: "text/markdown",
      textPreview: "# Report\n客户：张三\nAuthorization: Bearer [redacted]",
      source: "browser summary token: [redacted]"
    });
    expect(saved.data).not.toHaveProperty("textContent");
    expect(JSON.stringify(saved.data)).not.toContain("abcdefghijklmnop");
    expect(JSON.stringify(saved.data)).not.toContain("source-secret");

    const listed = await executeRegisteredTool(tool("list_artifacts"), { query: "report" }, {
      observePage: async () => page(),
      executePrimitive: async () => ({ status: "success", details: {} }),
      artifacts: artifactStore
    });

    expect(listed.success).toBe(true);
    expect(listed.observation).toContain("report.md");
    expect(((listed.data as SerializableRecord).artifacts as SerializableRecord[])[0]).toMatchObject({
      id: "report",
      filename: "report.md",
      textPreview: "# Report\n客户：张三\nAuthorization: Bearer [redacted]"
    });
    expect(JSON.stringify(listed.data)).not.toContain("textContent");
    expect(JSON.stringify(listed.data)).not.toContain("abcdefghijklmnop");

    const read = await executeRegisteredTool(tool("read_artifact"), { filename: "report" }, {
      observePage: async () => page(),
      executePrimitive: async () => ({ status: "success", details: {} }),
      artifacts: artifactStore
    });

    expect(read.success).toBe(true);
    expect(read.data).toMatchObject({
      id: "report",
      filename: "report.md",
      textContent: "# Report\n客户：张三\nAuthorization: Bearer [redacted]"
    });
    expect(JSON.stringify(read.data)).not.toContain("abcdefghijklmnop");
  });

  it("saves and lists browser task schedules through the injected store", async () => {
    const records: ScheduledTaskRecord[] = [];

    const saved = await executeRegisteredTool(
      tool("save_schedule"),
      {
        id: "daily_report",
        title: "每日巡检",
        taskText: "打开控制台检查异常并保存摘要",
        status: "ready",
        trigger: {
          type: "daily",
          timeOfDay: "09:30",
          timezone: "Asia/Shanghai"
        },
        notes: "只保存计划草稿，不自动执行"
      },
      {
        observePage: async () => page(),
        executePrimitive: async () => ({ status: "success", details: {} }),
        schedules: {
          saveSchedule: async (record) => {
            records.push(record);
            return record;
          },
          listSchedules: async () => records
        }
      }
    );

    expect(saved.success).toBe(true);
    expect(saved.observation).toContain("run manually from the Schedules view");
    expect(saved.observation).toContain("automatic trigger execution is not connected yet");
    expect(saved.data).toMatchObject({
      id: "daily_report",
      title: "每日巡检",
      status: "ready",
      trigger: {
        type: "daily",
        timeOfDay: "09:30"
      }
    });

    const listed = await executeRegisteredTool(
      tool("list_schedules"),
      { status: "ready", query: "控制台" },
      {
        observePage: async () => page(),
        executePrimitive: async () => ({ status: "success", details: {} }),
        schedules: {
          saveSchedule: async (record) => record,
          listSchedules: async () => records
        }
      }
    );

    expect(listed.success).toBe(true);
    expect(listed.observation).toContain("每日巡检");
    expect((listed.data as SerializableRecord).schedules).toBeDefined();
  });
});
