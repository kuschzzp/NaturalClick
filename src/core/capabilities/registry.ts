import type { ToolGroup } from "../tools/tool";
import { defaultCapabilitySettings, resolveCapabilitySettings, type CapabilitySettingsState } from "./settings";

export const initialCapabilities = [
  "BrowserBasicCapability",
  "PageReadingCapability",
  "FormBasicCapability",
  "FeedbackCapability",
  "RecoveryBasicCapability",
  "VisionCapability"
] as const;

export type CapabilityId = (typeof initialCapabilities)[number];

export const capabilityToolGroups: Record<CapabilityId, readonly string[]> = {
  BrowserBasicCapability: ["core"],
  PageReadingCapability: ["core"],
  FormBasicCapability: ["core"],
  FeedbackCapability: ["core"],
  RecoveryBasicCapability: ["core"],
  VisionCapability: ["vision"]
};

export interface CapabilityGroup {
  id: ToolGroup;
  enabledByDefault: boolean;
  description: string;
}

export const capabilityGroups: CapabilityGroup[] = [
  { id: "core", enabledByDefault: true, description: "Page observation and browser actions" },
  { id: "vision", enabledByDefault: false, description: "Screenshot and visual grounding" },
  { id: "skills", enabledByDefault: false, description: "Reusable user workflows" },
  { id: "search", enabledByDefault: false, description: "Search and browser-context lookup tools" },
  { id: "scratchpad", enabledByDefault: false, description: "Durable structured extraction memory" },
  { id: "files", enabledByDefault: false, description: "Local file request and output artifacts" },
  { id: "pdf", enabledByDefault: false, description: "PDF outline, search, and reading tools" },
  { id: "schedule", enabledByDefault: false, description: "Recurring browser Agent tasks" }
];

export function defaultCapabilityToolGroups(): Set<ToolGroup> {
  return new Set(capabilityGroups.filter((group) => group.enabledByDefault).map((group) => group.id));
}

export function toolGroupsForCapabilitySettings(settings: CapabilitySettingsState = defaultCapabilitySettings()): Set<ToolGroup> {
  const resolved = resolveCapabilitySettings(settings);
  const groups = defaultCapabilityToolGroups();
  if (resolved.search.provider !== "disabled") groups.add("search");
  if (resolved.skills.slashCommandsEnabled || resolved.skills.recordedWorkflowsEnabled) groups.add("skills");
  return groups;
}

export function toolRuntimeCapabilitiesForSettings(
  settings: CapabilitySettingsState = defaultCapabilitySettings(),
  modelCapabilities: { tools?: boolean; vision?: boolean } = {}
): { tools: boolean; vision: boolean; search: boolean; skills: boolean } {
  const resolved = resolveCapabilitySettings(settings);
  return {
    tools: modelCapabilities.tools ?? true,
    vision: modelCapabilities.vision ?? false,
    search: resolved.search.provider !== "disabled",
    skills: resolved.skills.slashCommandsEnabled || resolved.skills.recordedWorkflowsEnabled
  };
}
