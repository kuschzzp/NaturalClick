import type { BrowserPrimitive } from "../core/commands/commands";
import type { RuntimeAbortReason } from "../core/architecture/boundaries";
import type { SerializableRecord } from "../core/architecture/serialization";
import type { FileAttachmentContext, GeneratedTextArtifact, GeneratedTextArtifactSummary } from "../core/capabilities/file-artifacts";
import type { ScratchpadRecord } from "../core/capabilities/scratchpad";
import type { ScheduledTaskRecord } from "../core/capabilities/schedule";
import type { CapabilitySettingsState } from "../core/capabilities/settings";
import type { SkillPackageDetail, SkillPackageSummary } from "../core/capabilities/skills";
import type { AgentEvent } from "../core/events/events";
import type { GlobalModelConfig, ModelRole } from "../core/model/config";
import type { ModelInstance, ModelRuntimeConfig, ModelSelection, RoleModelSelections, RoleRuntimeConfigs } from "../core/model/model-instance";
import type { NeedMoreObservationRequest } from "../core/model/contracts";
import type { PageModel } from "../core/observation/page-model";
import type { RuntimeSettingsInput } from "../core/runtime/execution-budget";
import type { ToolDefinition, ToolGroup } from "../core/tools/tool";

export type OverlayMode = "Off" | "Focus" | "All Targets" | "Evidence" | "Vision";

export interface OverlayTargetPayload {
  id: string;
  label: string;
  kind: "dom" | "evidence" | "vision";
  rect: { x: number; y: number; width: number; height: number };
  confidence?: number;
  state?: "candidate" | "current" | "failed" | "expired";
}

export interface RuntimeModelSettings {
  providerBaseUrl: string;
  apiKey: string;
  plannerModel: string;
  visionModel?: string;
}

export type StartTaskRequest = {
  type: "START_TASK";
  taskText: string;
  attachments?: FileAttachmentContext[];
  modelSettings?: RuntimeModelSettings;
  capabilitySettings?: CapabilitySettingsState;
  safetyMode?: "conservative" | "balanced" | "autonomous" | "experimental_full_auto";
  runtimeSettings?: RuntimeSettingsInput;
};

export type StopTaskRequest = {
  type: "STOP_TASK";
  reason?: RuntimeAbortReason | (string & {});
};

export type AppendInstructionRequest = {
  type: "APPEND_INSTRUCTION";
  text: string;
  modelSettings?: RuntimeModelSettings;
  capabilitySettings?: CapabilitySettingsState;
  safetyMode?: "conservative" | "balanced" | "autonomous" | "experimental_full_auto";
  runtimeSettings?: RuntimeSettingsInput;
};

export type ResumeTaskRequest = {
  type: "RESUME_TASK";
  modelSettings?: RuntimeModelSettings;
  capabilitySettings?: CapabilitySettingsState;
  safetyMode?: "conservative" | "balanced" | "autonomous" | "experimental_full_auto";
  runtimeSettings?: RuntimeSettingsInput;
};

export type GetSessionStateRequest = {
  type: "GET_SESSION_STATE";
  sessionId?: string;
  taskId?: string;
};

export type NewSessionRequest = {
  type: "NEW_SESSION";
  reason?: string;
};

export interface ObservePageOptions {
  observationRequest?: NeedMoreObservationRequest;
  observationRound?: number;
  candidateLimit?: number;
  mode?: "atlas" | "interactive" | "content" | "full";
}

export type ObservePageRequest = {
  type: "OBSERVE_PAGE";
} & ObservePageOptions;

export type ExecutePrimitiveRequest = {
  type: "EXECUTE_PRIMITIVE";
  primitive: BrowserPrimitive;
  pageModel?: PageModel;
};

export type CancelActivePrimitiveRequest = {
  type: "CANCEL_ACTIVE_PRIMITIVE";
  reason?: RuntimeAbortReason | (string & {});
};

export const MODEL_CONFIG_MESSAGE_TYPES = [
  "GET_MODEL_CONFIG",
  "SAVE_MODEL_INSTANCE",
  "DELETE_MODEL_INSTANCE",
  "SET_ACTIVE_MODEL_SELECTION",
  "SET_ROLE_MODEL_SELECTION",
  "CLEAR_ROLE_MODEL_SELECTION",
  "TEST_MODEL_INSTANCE"
] as const;

export const PAGE_ATLAS_MESSAGE_TYPES = ["READ_PAGE_ATLAS", "FIND_PAGE_TARGET", "READ_PAGE_TARGET"] as const;

export const TOOL_EXECUTION_MESSAGE_TYPES = ["GET_TOOL_DEFINITIONS", "EXECUTE_TOOL"] as const;
export const SKILL_MESSAGE_TYPES = ["GET_SKILLS", "GET_SKILL_DETAIL"] as const;
export const SCHEDULE_MESSAGE_TYPES = ["GET_SCHEDULES"] as const;
export const SCRATCHPAD_MESSAGE_TYPES = ["GET_SCRATCHPAD"] as const;
export const ARTIFACT_MESSAGE_TYPES = ["GET_ARTIFACTS", "GET_ARTIFACT_DETAIL"] as const;

export const SESSION_LIFECYCLE_MESSAGE_TYPES = ["GET_SESSION_STATE", "NEW_SESSION", "RESUME_TASK", "STOP_TASK"] as const;

export type ModelConfigProtocolRequest =
  | { type: "GET_MODEL_CONFIG" }
  | { type: "SAVE_MODEL_INSTANCE"; instance: ModelInstance }
  | { type: "DELETE_MODEL_INSTANCE"; instanceId: string }
  | { type: "SET_ACTIVE_MODEL_SELECTION"; selection: ModelSelection }
  | { type: "SET_ROLE_MODEL_SELECTION"; role: ModelRole; selection: ModelSelection }
  | { type: "CLEAR_ROLE_MODEL_SELECTION"; role: ModelRole }
  | { type: "TEST_MODEL_INSTANCE"; instance: ModelInstance; model?: string };

export interface ModelConfigProtocolState {
  instances: ModelInstance[];
  activeSelection?: ModelSelection;
  roleSelections?: RoleModelSelections;
  roleRuntimeConfigs?: RoleRuntimeConfigs;
  activeRuntimeConfig?: ModelRuntimeConfig;
  globalModelConfig?: GlobalModelConfig;
}

export type PageAtlasProtocolRequest =
  | { type: "READ_PAGE_ATLAS"; mode?: "atlas" | "interactive" | "content" | "full"; query?: string; candidateLimit?: number }
  | { type: "FIND_PAGE_TARGET"; query: string; role?: string; candidateLimit?: number }
  | { type: "READ_PAGE_TARGET"; targetId: string; includeContext?: boolean };

export type ToolExecutionProtocolRequest =
  | { type: "GET_TOOL_DEFINITIONS"; groups?: ToolGroup[]; capabilitySettings?: CapabilitySettingsState }
  | { type: "EXECUTE_TOOL"; toolName: string; args: SerializableRecord; callId?: string };

export interface ToolDefinitionsProtocolState {
  tools: ToolDefinition[];
  activeGroups: ToolGroup[];
  availableGroups: ToolGroup[];
  loadableGroups: ToolGroup[];
}

export type SkillProtocolRequest = { type: "GET_SKILLS" } | { type: "GET_SKILL_DETAIL"; skillId: string };

export interface SkillProtocolState {
  skills: SkillPackageSummary[];
}

export interface SkillDetailProtocolState {
  skill?: SkillPackageDetail;
}

export type ScheduleProtocolRequest = { type: "GET_SCHEDULES" };

export interface ScheduleProtocolState {
  schedules: ScheduledTaskRecord[];
}

export type ScratchpadProtocolRequest = { type: "GET_SCRATCHPAD"; query?: string; collection?: string };

export interface ScratchpadProtocolState {
  records: ScratchpadRecord[];
}

export type ArtifactProtocolRequest = { type: "GET_ARTIFACTS"; query?: string } | { type: "GET_ARTIFACT_DETAIL"; artifactId: string };

export interface ArtifactProtocolState {
  artifacts: GeneratedTextArtifactSummary[];
}

export interface ArtifactDetailProtocolState {
  artifact?: GeneratedTextArtifact;
}

export type SetOverlayModeRequest = {
  type: "SET_OVERLAY_MODE";
  mode: OverlayMode;
  targets?: OverlayTargetPayload[];
};

export type HighlightTargetRequest = {
  type: "HIGHLIGHT_TARGET";
  semanticId: string;
};

export type OpenSettingsRequest = {
  type: "OPEN_SETTINGS";
};

export type ResolveUserConsentRequest = {
  type: "RESOLVE_USER_CONSENT";
  approved: boolean;
  scope?: "once" | "task";
};

export type NaturalClickRequest =
  | StartTaskRequest
  | StopTaskRequest
  | AppendInstructionRequest
  | ResumeTaskRequest
  | NewSessionRequest
  | GetSessionStateRequest
  | ModelConfigProtocolRequest
  | PageAtlasProtocolRequest
  | ToolExecutionProtocolRequest
  | SkillProtocolRequest
  | ScheduleProtocolRequest
  | ScratchpadProtocolRequest
  | ArtifactProtocolRequest
  | ObservePageRequest
  | ExecutePrimitiveRequest
  | CancelActivePrimitiveRequest
  | SetOverlayModeRequest
  | HighlightTargetRequest
  | OpenSettingsRequest
  | ResolveUserConsentRequest
  | { type: "NATURALCLICK_PING" };

export type SessionStateResponse = {
  sessionId?: string;
  taskId?: string;
  events: AgentEvent[];
};

export type NaturalClickResponse<T = unknown> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: string;
    };
