import { describe, expect, it } from "vitest";
import {
  capabilityGroups,
  defaultCapabilityToolGroups,
  toolGroupsForCapabilitySettings,
  toolRuntimeCapabilitiesForSettings
} from "../../../src/core/capabilities/registry";
import {
  canPreviewTextAttachment,
  generatedArtifactMatches,
  sanitizeFileAttachmentContexts,
  sanitizeFileArtifacts,
  sanitizeGeneratedTextArtifact,
  stripGeneratedArtifactContent,
  stripFileArtifactPreviews
} from "../../../src/core/capabilities/file-artifacts";
import { sanitizeScheduledTaskRecord, scheduleRecordMatches, type ScheduledTaskRecord } from "../../../src/core/capabilities/schedule";
import { sanitizeRecordedWorkflowDraft, sanitizeSkillPackage } from "../../../src/core/capabilities/skills";
import { sanitizeScratchpadFields, sanitizeScratchpadRecord, scratchpadRecordMatches } from "../../../src/core/capabilities/scratchpad";
import type { ScratchpadRecord } from "../../../src/core/capabilities/scratchpad";

describe("capability registry", () => {
  it("declares optional capability groups without enabling them by default", () => {
    expect(capabilityGroups.map((group) => group.id)).toEqual(expect.arrayContaining(["skills", "scratchpad", "files", "pdf", "schedule"]));
    expect(capabilityGroups.filter((group) => group.enabledByDefault).map((group) => group.id)).not.toContain("pdf");
  });

  it("keeps heavyweight capabilities out of the default tool groups", () => {
    const groups = defaultCapabilityToolGroups();

    expect(groups.has("core")).toBe(true);
    expect(groups.has("vision")).toBe(false);
    expect(groups.has("skills")).toBe(false);
    expect(groups.has("scratchpad")).toBe(false);
    expect(groups.has("files")).toBe(false);
    expect(groups.has("pdf")).toBe(false);
    expect(groups.has("schedule")).toBe(false);
  });

  it("derives active tool groups from user capability settings", () => {
    const enabled = toolGroupsForCapabilitySettings({
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
    });

    expect(enabled.has("core")).toBe(true);
    expect(enabled.has("skills")).toBe(true);
    expect(enabled.has("search")).toBe(true);

    const disabled = toolGroupsForCapabilitySettings({
      skills: {
        slashCommandsEnabled: false,
        recordedWorkflowsEnabled: false,
        requireConfirmation: true
      },
      search: {
        provider: "disabled",
        endpoint: "",
        apiKey: "",
        maxResults: 5
      }
    });

    expect(disabled.has("core")).toBe(true);
    expect(disabled.has("skills")).toBe(false);
    expect(disabled.has("search")).toBe(false);
  });

  it("combines model tool support with capability settings", () => {
    const capabilities = toolRuntimeCapabilitiesForSettings(
      {
        skills: {
          slashCommandsEnabled: true,
          recordedWorkflowsEnabled: false,
          requireConfirmation: true
        },
        search: {
          provider: "custom_endpoint",
          endpoint: "https://search.example.com",
          apiKey: "search-key",
          maxResults: 8
        }
      },
      { tools: false, vision: true }
    );

    expect(capabilities).toEqual({
      tools: false,
      vision: true,
      search: true,
      skills: true
    });
  });

  it("sanitizes file artifact metadata before it crosses runtime boundaries", () => {
    expect(
      sanitizeFileArtifacts([
        { id: " file-1 ", filename: " brief.pdf ", mime: "", size: 1200.4, createdAt: 99.8 },
        { id: "", filename: "missing-id.txt", mime: "text/plain", size: 12, createdAt: 1 },
        { id: "file-2", filename: "", mime: "text/plain", size: 12, createdAt: 1 }
      ])
    ).toEqual([{ id: "file-1", filename: "brief.pdf", mime: "application/octet-stream", size: 1200, createdAt: 100 }]);
  });

  it("recognizes small text-like attachments for planner previews", () => {
    expect(canPreviewTextAttachment({ filename: "notes.md", mime: "", size: 1024 })).toBe(true);
    expect(canPreviewTextAttachment({ filename: "data.bin", mime: "application/json", size: 1024 })).toBe(true);
    expect(canPreviewTextAttachment({ filename: "large.log", mime: "text/plain", size: 200000 })).toBe(false);
    expect(canPreviewTextAttachment({ filename: "scan.pdf", mime: "application/pdf", size: 1024 })).toBe(false);
  });

  it("sanitizes attachment contexts and caps planner previews", () => {
    const contexts = sanitizeFileAttachmentContexts(
      [
        {
          id: " file-1 ",
          filename: " brief.md ",
          mime: "text/markdown",
          size: 1200,
          createdAt: 99,
          textPreview: "abc\u0000defghi",
          textTruncated: false
        }
      ],
      10,
      6
    );

    expect(contexts).toEqual([
      {
        id: "file-1",
        filename: "brief.md",
        mime: "text/markdown",
        size: 1200,
        createdAt: 99,
        textPreview: "abcdef",
        textPreviewChars: 6,
        textTruncated: true
      }
    ]);
  });

  it("strips planner previews from attachment metadata", () => {
    expect(
      stripFileArtifactPreviews([
        {
          id: "file-1",
          filename: "brief.md",
          mime: "text/markdown",
          size: 1200,
          createdAt: 99,
          textPreview: "private content",
          textPreviewChars: 15,
          textTruncated: false
        }
      ])
    ).toEqual([{ id: "file-1", filename: "brief.md", mime: "text/markdown", size: 1200, createdAt: 99 }]);
  });

  it("sanitizes generated text artifacts into downloadable summaries", () => {
    const artifact = sanitizeGeneratedTextArtifact(
      {
        id: " report 1!* ",
        filename: " bad:name?.md ",
        mime: "application/octet-stream",
        textContent: "hello\u0000 world extra",
        source: " model summary "
      },
      42,
      8
    );

    expect(artifact).toEqual({
      id: "report_1",
      filename: "bad-name-.md",
      mime: "text/markdown",
      size: 8,
      createdAt: 42,
      textContent: "hello wo",
      textPreview: "hello wo",
      textTruncated: true,
      source: "model summary"
    });
    expect(artifact && generatedArtifactMatches(artifact, "summary")).toBe(true);
    expect(artifact && generatedArtifactMatches(artifact, "missing")).toBe(false);
    expect(artifact && stripGeneratedArtifactContent([artifact])).toEqual([
      {
        id: "report_1",
        filename: "bad-name-.md",
        mime: "text/markdown",
        size: 8,
        createdAt: 42,
        textPreview: "hello wo",
        textTruncated: true,
        source: "model summary"
      }
    ]);
    expect(stripGeneratedArtifactContent(artifact ? [artifact] : [])[0]).not.toHaveProperty("textContent");
  });

  it("redacts generated artifact content before storage or download", () => {
    const artifact = sanitizeGeneratedTextArtifact(
      {
        id: "secrets",
        filename: "secrets.md",
        mime: "text/markdown",
        textContent: "Authorization: Bearer abcdefghijklmnop\napiKey=sk-1234567890abcdef",
        source: "token: source-secret"
      },
      55
    );

    expect(artifact?.textContent).toContain("Authorization: Bearer [redacted]");
    expect(artifact?.textContent).toContain("apiKey=[redacted]");
    expect(artifact?.textPreview).toBe(artifact?.textContent);
    expect(artifact?.source).toBe("token: [redacted]");
    expect(JSON.stringify(artifact)).not.toContain("abcdefghijklmnop");
    expect(JSON.stringify(artifact)).not.toContain("sk-1234567890abcdef");
    expect(JSON.stringify(artifact)).not.toContain("source-secret");
  });

  it("sanitizes scratchpad records into compact primitive fields", () => {
    expect(
      sanitizeScratchpadFields({
        name: " 张三 ",
        amount: 1200,
        active: true,
        empty: null,
        nested: { ignored: true },
        list: ["ignored"]
      })
    ).toEqual({
      name: "张三",
      amount: 1200,
      active: true,
      empty: null
    });

    const dirtyRecord = {
      id: " customer-1 ",
      collection: " customer list ",
      fields: { name: "张三", nested: { ignored: true } },
      evidence: " text_1 "
    } as unknown as ScratchpadRecord;
    const record = sanitizeScratchpadRecord(dirtyRecord, 100);

    expect(record).toEqual({
      id: "customer-1",
      collection: "customer_list",
      fields: { name: "张三" },
      evidence: "text_1",
      createdAt: 100,
      updatedAt: 100
    });
    expect(record && scratchpadRecordMatches(record, { collection: "customer_list", query: "张三" })).toBe(true);
    expect(record && scratchpadRecordMatches(record, { collection: "contracts" })).toBe(false);
  });

  it("sanitizes schedule records and matches by status or task text", () => {
    const record = sanitizeScheduledTaskRecord(
      {
        id: " weekly report ",
        title: " 每周巡检 ",
        taskText: "打开控制台检查异常并记录结果",
        status: "READY",
        trigger: {
          type: "weekly",
          dayOfWeek: 9,
          timeOfDay: "25:99",
          timezone: " Asia/Shanghai ",
          urlPattern: " https://example.test/* "
        },
        notes: " 记得截图 "
      } as unknown as ScheduledTaskRecord,
      200
    );

    expect(record).toEqual({
      id: "weekly_report",
      title: "每周巡检",
      taskText: "打开控制台检查异常并记录结果",
      trigger: {
        type: "weekly",
        timezone: "Asia/Shanghai",
        dayOfWeek: 6,
        urlPattern: "https://example.test/*"
      },
      status: "ready",
      notes: "记得截图",
      createdAt: 200,
      updatedAt: 200
    });
    expect(record && scheduleRecordMatches(record, { status: "ready", query: "控制台" })).toBe(true);
    expect(record && scheduleRecordMatches(record, { status: "paused" })).toBe(false);
    expect(record && scheduleRecordMatches(record, { status: "invalid", query: "巡检" })).toBe(true);
    expect(sanitizeScheduledTaskRecord({ id: "x", title: "", taskText: "run", trigger: { type: "manual" }, status: "draft" }, 200)).toBeUndefined();
  });

  it("sanitizes recorded workflow skills into reusable instruction packages", () => {
    const skill = sanitizeRecordedWorkflowDraft(
      {
        name: " 打开报表 ",
        description: " 进入报表页面并读取摘要 ",
        steps: [" 点击报表入口 ", "", "读取页面摘要"]
      },
      300
    );

    expect(skill).toMatchObject({
      id: "workflow_打开报表",
      name: "打开报表",
      description: "进入报表页面并读取摘要",
      enabled: true,
      source: "recorded_workflow",
      steps: ["点击报表入口", "读取页面摘要"],
      createdAt: 300,
      updatedAt: 300
    });
    expect(skill?.instructions).toContain("Reusable browser workflow: 打开报表");
    expect(skill?.instructions).toContain("1. 点击报表入口");
    expect(sanitizeSkillPackage({ id: "", name: "", description: "missing" }, 300)).toBeUndefined();
  });
});
