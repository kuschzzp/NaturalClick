import type { SerializableRecord } from "../architecture/serialization";

export type ToolGroup = "core" | "vision" | "pdf" | "files" | "scratchpad" | "schedule" | "skills" | "search";

export type ToolRisk = "read" | "write" | "destructive";

export interface ToolDefinition {
  name: string;
  group: ToolGroup;
  risk: ToolRisk;
  description: string;
  parameters: SerializableRecord;
}

export interface ToolResult {
  success: boolean;
  observation: string;
  data?: SerializableRecord;
  error?: string;
}

export interface ToolRuntimeCapabilities {
  vision: boolean;
  tools: boolean;
  search?: boolean;
  skills?: boolean;
}
