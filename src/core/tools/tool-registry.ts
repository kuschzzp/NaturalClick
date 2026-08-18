import { capabilityGroups } from "../capabilities/registry";
import { browserTools } from "./browser-tools";
import { disclosureTools } from "./disclosure-tools";
import { fileTools } from "./file-tools";
import { pageTools } from "./page-tools";
import { scheduleTools } from "./schedule-tools";
import { searchTools } from "./search-tools";
import { skillTools } from "./skill-tools";
import { scratchpadTools } from "./scratchpad-tools";
import type { ToolDefinition, ToolGroup, ToolRuntimeCapabilities } from "./tool";

export interface ToolRegistry {
  listTools(): ToolDefinition[];
  getTool(name: string): ToolDefinition | undefined;
  selectTools(activeGroups: ReadonlySet<ToolGroup | string>, capabilities: ToolRuntimeCapabilities): ToolDefinition[];
}

export function createToolRegistry(tools: ToolDefinition[]): ToolRegistry {
  const byName = new Map<string, ToolDefinition>();

  for (const tool of tools) {
    if (byName.has(tool.name)) {
      throw new Error(`duplicate_tool:${tool.name}`);
    }
    byName.set(tool.name, tool);
  }

  return {
    listTools() {
      return [...byName.values()];
    },
    getTool(name: string) {
      return byName.get(name);
    },
    selectTools(activeGroups: ReadonlySet<ToolGroup | string>, capabilities: ToolRuntimeCapabilities) {
      if (!capabilities.tools) return [];
      return [...byName.values()].filter((tool) => {
        if (!activeGroups.has(tool.group)) return false;
        if (tool.group === "vision" && !capabilities.vision) return false;
        if (tool.group === "search" && !capabilities.search) return false;
        if (tool.group === "skills" && !capabilities.skills) return false;
        return true;
      });
    }
  };
}

export function createDefaultToolRegistry(): ToolRegistry {
  return createToolRegistry([
    ...pageTools,
    ...browserTools,
    ...disclosureTools,
    ...searchTools,
    ...skillTools,
    ...scratchpadTools,
    ...fileTools,
    ...scheduleTools
  ]);
}

export function defaultActiveToolGroups(): Set<ToolGroup> {
  return new Set(capabilityGroups.filter((group) => group.enabledByDefault).map((group) => group.id));
}
