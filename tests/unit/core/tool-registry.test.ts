import { describe, expect, it } from "vitest";
import { isSerializableRecord } from "../../../src/core/architecture/serialization";
import { browserTools } from "../../../src/core/tools/browser-tools";
import { pageTools } from "../../../src/core/tools/page-tools";
import { createDefaultToolRegistry, createToolRegistry, defaultActiveToolGroups } from "../../../src/core/tools/tool-registry";
import type { ToolDefinition } from "../../../src/core/tools/tool";

describe("tool registry", () => {
  it("starts with core browser and page tools", () => {
    const registry = createToolRegistry([...browserTools, ...pageTools]);
    const names = registry.selectTools(new Set(["core"]), { vision: false, tools: true }).map((tool) => tool.name);

    expect(names).toContain("read_page");
    expect(names).toContain("find_target");
    expect(names).toContain("click");
    expect(names).toContain("type");
    expect(names).not.toContain("capture_visible_tab");
  });

  it("does not expose vision tools to non-vision models", () => {
    const registry = createToolRegistry([
      ...browserTools,
      ...pageTools,
      {
        name: "capture_visible_tab",
        group: "vision",
        risk: "read",
        description: "Capture the visible tab for visual reasoning.",
        parameters: { type: "object", properties: {} }
      }
    ]);

    expect(registry.selectTools(new Set(["core", "vision"]), { vision: false, tools: true }).some((tool) => tool.name === "capture_visible_tab")).toBe(false);
  });

  it("returns no tools when the active model does not support tool calling", () => {
    const registry = createToolRegistry([...browserTools, ...pageTools]);

    expect(registry.selectTools(new Set(["core"]), { vision: true, tools: false })).toEqual([]);
  });

  it("selects default tools from enabled capability groups", () => {
    const registry = createToolRegistry([...browserTools, ...pageTools]);
    const names = registry.selectTools(defaultActiveToolGroups(), { vision: true, tools: true }).map((tool) => tool.name);

    expect(names).toContain("click");
    expect(defaultActiveToolGroups().has("vision")).toBe(false);
  });

  it("keeps search and skill tools out until their capability groups are active", () => {
    const registry = createDefaultToolRegistry();

    expect(registry.listTools().map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        "load_tools",
        "search_context",
        "list_skills",
        "use_skill",
        "save_scratchpad",
        "list_scratchpad",
        "list_attachments",
        "read_attachment",
        "save_artifact",
        "list_artifacts",
        "read_artifact",
        "save_schedule",
        "list_schedules"
      ])
    );

    const coreOnly = registry.selectTools(new Set(["core"]), { vision: true, tools: true, search: true, skills: true }).map((tool) => tool.name);
    expect(coreOnly).toContain("load_tools");
    expect(coreOnly).not.toContain("search_context");
    expect(coreOnly).not.toContain("list_skills");
    expect(coreOnly).not.toContain("save_scratchpad");
    expect(coreOnly).not.toContain("list_attachments");
    expect(coreOnly).not.toContain("save_schedule");

    const withoutCapability = registry
      .selectTools(new Set(["core", "search", "skills"]), { vision: true, tools: true, search: false, skills: false })
      .map((tool) => tool.name);
    expect(withoutCapability).not.toContain("search_context");
    expect(withoutCapability).not.toContain("list_skills");

    const enabled = registry
      .selectTools(new Set(["core", "search", "skills"]), { vision: true, tools: true, search: true, skills: true })
      .map((tool) => tool.name);
    expect(enabled).toContain("search_context");
    expect(enabled).toContain("list_skills");
    expect(enabled).toContain("use_skill");
    expect(enabled).toContain("record_workflow");

    const scratchpad = registry.selectTools(new Set(["core", "scratchpad"]), { vision: true, tools: true }).map((tool) => tool.name);
    expect(scratchpad).toContain("save_scratchpad");
    expect(scratchpad).toContain("list_scratchpad");

    const files = registry.selectTools(new Set(["core", "files"]), { vision: true, tools: true }).map((tool) => tool.name);
    expect(files).toContain("list_attachments");
    expect(files).toContain("read_attachment");
    expect(files).toContain("save_artifact");
    expect(files).toContain("list_artifacts");
    expect(files).toContain("read_artifact");

    const schedule = registry.selectTools(new Set(["core", "schedule"]), { vision: true, tools: true }).map((tool) => tool.name);
    expect(schedule).toContain("save_schedule");
    expect(schedule).toContain("list_schedules");
  });

  it("keeps tool definitions serializable for model prompts and protocol responses", () => {
    const registry = createDefaultToolRegistry();

    expect(registry.listTools().every((tool) => isSerializableRecord(tool))).toBe(true);
  });

  it("rejects duplicate tool names", () => {
    const duplicate: ToolDefinition = {
      name: "read_page",
      group: "core",
      risk: "read",
      description: "Duplicate read page tool.",
      parameters: { type: "object", properties: {} }
    };

    expect(() => createToolRegistry([...pageTools, duplicate])).toThrow("duplicate_tool:read_page");
  });
});
