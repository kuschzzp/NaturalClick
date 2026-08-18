import type { SerializableRecord, SerializableValue } from "../architecture/serialization";
import type { BrowserPrimitive, PrimitiveResult } from "../commands/commands";
import {
  sanitizeGeneratedTextArtifact,
  stripFileArtifactPreviews,
  type FileAttachmentContext,
  type GeneratedArtifactStore,
  type GeneratedTextArtifact
} from "../capabilities/file-artifacts";
import type { NeedMoreObservationRequest } from "../model/contracts";
import type { ControlCandidate, FormSnapshot, PageModel, TextBlock } from "../observation/page-model";
import { defaultCapabilitySettings, resolveCapabilitySettings, type CapabilitySettingsState } from "../capabilities/settings";
import type { RecordedWorkflowDraft, SkillPackageDetail, SkillPackageSummary, SkillStore } from "../capabilities/skills";
import {
  sanitizeScheduledTaskRecord,
  sanitizeScheduleStatus,
  sanitizeScheduleTrigger,
  scheduleRecordMatches,
  type ScheduledTaskRecord,
  type ScheduleQuery,
  type ScheduleStore
} from "../capabilities/schedule";
import {
  sanitizeScratchpadCollection,
  sanitizeScratchpadFields,
  sanitizeScratchpadRecord,
  scratchpadRecordMatches,
  type ScratchpadQuery,
  type ScratchpadRecord,
  type ScratchpadStore
} from "../capabilities/scratchpad";
import type { InteractiveElementRecord } from "../observation/interactive-index";
import type { ToolDefinition, ToolGroup, ToolResult } from "./tool";

export interface ToolObserveOptions {
  observationRequest?: NeedMoreObservationRequest;
  observationRound?: number;
  candidateLimit?: number;
  mode?: "atlas" | "interactive" | "content" | "full";
}

export interface CustomSearchRequest {
  endpoint: string;
  apiKey: string;
  query: string;
  maxResults: number;
}

export type ToolSkillDetail = SkillPackageDetail;

export interface LoadToolGroupsResult {
  loaded: ToolGroup[];
  alreadyActive: ToolGroup[];
  unavailable: ToolGroup[];
  unknown: string[];
  activeGroups: ToolGroup[];
}

export interface ToolExecutorDeps {
  observePage(options?: ToolObserveOptions): Promise<PageModel>;
  executePrimitive(primitive: BrowserPrimitive): Promise<PrimitiveResult>;
  getLastPage?: () => PageModel | undefined;
  getCapabilitySettings?: () => CapabilitySettingsState;
  customSearch?: (request: CustomSearchRequest) => Promise<ToolResult>;
  listSkills?: () => Promise<SkillPackageSummary[]>;
  loadSkill?: (skillId: string) => Promise<ToolSkillDetail | undefined>;
  loadToolGroups?: (groups: ToolGroup[]) => LoadToolGroupsResult;
  skills?: SkillStore;
  scratchpad?: ScratchpadStore;
  schedules?: ScheduleStore;
  artifacts?: GeneratedArtifactStore;
  getAttachments?: () => readonly FileAttachmentContext[];
}

type PageEntity =
  | { kind: "control"; control: ControlCandidate }
  | { kind: "text"; text: TextBlock }
  | { kind: "form"; form: FormSnapshot };

const DEFAULT_CANDIDATE_LIMIT = 80;

export async function executeRegisteredTool(tool: ToolDefinition, args: SerializableRecord, deps: ToolExecutorDeps): Promise<ToolResult> {
  switch (tool.name) {
    case "load_tools":
      return loadTools(args, deps);
    case "read_page":
      return readPage(args, deps);
    case "find_target":
      return findTarget(args, deps);
    case "read_target":
      return readTarget(args, deps);
    case "click":
      return executeHandleAction("click", args, deps);
    case "type":
      return executeHandleAction("type", args, deps);
    case "select":
      return executeHandleAction("select", args, deps);
    case "scroll":
      return scroll(args, deps);
    case "wait":
      return wait(args, deps);
    case "done":
      return done(args);
    case "fail":
      return fail(args);
    case "search_context":
      return searchContext(args, deps);
    case "list_skills":
      return listSkills(deps);
    case "use_skill":
      return useSkill(args, deps);
    case "record_workflow":
      return recordWorkflow(args, deps);
    case "save_scratchpad":
      return saveScratchpad(args, deps);
    case "list_scratchpad":
      return listScratchpad(args, deps);
    case "list_attachments":
      return listAttachments(deps);
    case "read_attachment":
      return readAttachment(args, deps);
    case "save_artifact":
      return saveArtifact(args, deps);
    case "list_artifacts":
      return listArtifacts(args, deps);
    case "read_artifact":
      return readArtifact(args, deps);
    case "save_schedule":
      return saveSchedule(args, deps);
    case "list_schedules":
      return listSchedules(args, deps);
    default:
      return {
        success: false,
        observation: `Tool ${tool.name} is registered but has no executor.`,
        error: `executor_missing:${tool.name}`
      };
  }
}

function loadTools(args: SerializableRecord, deps: ToolExecutorDeps): ToolResult {
  if (!deps.loadToolGroups) return toolError("load_tools is unavailable in this runtime.", "load_tools_unavailable");
  const requested = stringArrayArg(args.groups);
  if (!requested.length) {
    return toolError("load_tools requires a non-empty groups array.", "missing_groups");
  }

  const knownGroups = new Set<ToolGroup>(["search", "skills", "scratchpad", "files", "pdf", "schedule", "vision"]);
  const groups = requested.filter((group): group is ToolGroup => knownGroups.has(group as ToolGroup));
  const unknown = requested.filter((group) => !knownGroups.has(group as ToolGroup));
  const result = deps.loadToolGroups(groups);
  const allUnknown = [...result.unknown, ...unknown];
  const lines: string[] = [];
  if (result.loaded.length) lines.push(`Loaded tool groups: ${result.loaded.join(", ")}.`);
  if (result.alreadyActive.length) lines.push(`Already active: ${result.alreadyActive.join(", ")}.`);
  if (result.unavailable.length) lines.push(`Unavailable or disabled: ${result.unavailable.join(", ")}.`);
  if (allUnknown.length) lines.push(`Unknown or not loadable: ${allUnknown.join(", ")}.`);
  lines.push(`Active tool groups: ${result.activeGroups.join(", ")}.`);

  return {
    success: result.loaded.length > 0 || result.alreadyActive.length > 0,
    observation: lines.join("\n"),
    error: result.loaded.length > 0 || result.alreadyActive.length > 0 ? undefined : "no_tool_groups_loaded",
    data: {
      loaded: result.loaded,
      alreadyActive: result.alreadyActive,
      unavailable: result.unavailable,
      unknown: allUnknown,
      activeGroups: result.activeGroups
    }
  };
}

async function readPage(args: SerializableRecord, deps: ToolExecutorDeps): Promise<ToolResult> {
  const mode = enumArg(args.mode, ["atlas", "interactive", "content", "full"] as const, "atlas");
  const candidateLimit = numberArg(args.candidateLimit, DEFAULT_CANDIDATE_LIMIT, 1, 600);
  const refresh = booleanArg(args.refresh, false);
  const cachedPage = refresh ? undefined : cachedPageForReadPage(deps, mode, candidateLimit);
  const page = cachedPage ?? (await deps.observePage({ mode, candidateLimit }));
  const observation = pageObservationForMode(page, mode);
  return {
    success: true,
    observation,
    data: {
      ...pageSummaryData(page),
      cached: Boolean(cachedPage)
    }
  };
}

function cachedPageForReadPage(
  deps: ToolExecutorDeps,
  mode: "atlas" | "interactive" | "content" | "full",
  candidateLimit: number
): PageModel | undefined {
  const page = deps.getLastPage?.();
  if (!page) return undefined;
  if (mode === "interactive" && !page.interactiveIndexText && !page.interactiveIndex?.length) return undefined;
  const observationLimit = page.observation?.candidateLimit;
  if (
    typeof observationLimit === "number" &&
    candidateLimit > observationLimit &&
    ((page.observation?.omittedControls ?? 0) > 0 || (page.observation?.omittedTextBlocks ?? 0) > 0)
  ) {
    return undefined;
  }
  return page;
}

async function findTarget(args: SerializableRecord, deps: ToolExecutorDeps): Promise<ToolResult> {
  const query = stringArg(args.query).trim();
  if (!query) return toolError("find_target requires query.", "missing_query");
  const role = stringArg(args.role).trim().toLowerCase();
  const candidateLimit = numberArg(args.candidateLimit, 8, 1, 50);
  const page = await latestPage(deps, { mode: "interactive", candidateLimit: Math.max(candidateLimit, DEFAULT_CANDIDATE_LIMIT) });
  const terms = tokenize(query);
  const matches = pageEntities(page)
    .map((entity, index) => ({ entity, index, score: entityScore(entity, terms, role) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, candidateLimit);

  if (!matches.length) {
    return {
      success: false,
      observation: `No target matched "${query}" on the current page.`,
      error: "target_not_found",
      data: pageSummaryData(page)
    };
  }

  return {
    success: true,
    observation: [
      `${matches.length} target candidate(s) for "${query}":`,
      ...matches.map((item, index) => `${index + 1}. ${entityLine(item.entity)}`)
    ].join("\n"),
    data: {
      candidates: matches.map((item) => entityData(item.entity))
    }
  };
}

async function readTarget(args: SerializableRecord, deps: ToolExecutorDeps): Promise<ToolResult> {
  const targetId = stringArg(args.targetId).trim();
  const handle = stringArg(args.handle).trim();
  if (!targetId && !handle) return toolError("read_target requires targetId or handle.", "missing_target");
  const page = await latestPage(deps, { mode: "interactive", candidateLimit: DEFAULT_CANDIDATE_LIMIT });
  const frameId = args.frameId === undefined ? undefined : frameIdArg(args.frameId);
  if (handle && args.frameId !== undefined && frameId === undefined) {
    return toolError("read_target frameId must be a non-negative number from the latest interactive index.", "invalid_frame_id");
  }
  const resolvedByFrame = handle && frameId !== undefined ? resolveHandleControl(page, frameId, handle) : undefined;
  if (resolvedByFrame && !resolvedByFrame.success) return resolvedByFrame.result;
  const entity = resolvedByFrame?.success ? { kind: "control" as const, control: resolvedByFrame.control } : findEntity(page, targetId, handle);
  if (!entity) {
    return {
      success: false,
      observation: `No current-page target matched ${targetId ? `targetId=${targetId}` : `handle=${handle}`}.`,
      error: "target_not_found",
      data: pageSummaryData(page)
    };
  }

  const includeContext = booleanArg(args.includeContext, true);
  const lines = [entityLine(entity)];
  if (includeContext) lines.push(...nearbyContext(page, entity));
  return {
    success: true,
    observation: lines.join("\n"),
    data: entityData(entity)
  };
}

async function executeHandleAction(
  action: "click" | "type" | "select",
  args: SerializableRecord,
  deps: ToolExecutorDeps
): Promise<ToolResult> {
  const handle = stringArg(args.handle).trim();
  if (!handle) return toolError(`${action} requires handle.`, "missing_handle");
  const frameId = frameIdArg(args.frameId);
  if (frameId === undefined) return toolError(`${action} requires frameId from the latest interactive index.`, "missing_frame_id");
  const page = await latestPage(deps, { mode: "interactive", candidateLimit: DEFAULT_CANDIDATE_LIMIT });
  const resolved = resolveHandleControl(page, frameId, handle);
  if (!resolved.success) return resolved.result;
  const control = resolved.control;
  if (control.disabled) {
    return {
      success: false,
      observation: `Target ${control.semanticId} (${control.label || control.role}) is disabled.`,
      error: "target_disabled",
      data: entityData({ kind: "control", control })
    };
  }

  if (action === "click") {
    return primitiveToolResult(await deps.executePrimitive({ type: "dom_click", semanticId: control.semanticId }), control);
  }

  const value = action === "type" ? stringArg(args.text) : stringArg(args.value) || stringArg(args.label);
  if (!value) return toolError(`${action} requires ${action === "type" ? "text" : "value or label"}.`, "missing_value");
  const primitive: BrowserPrimitive =
    action === "select"
      ? { type: "dom_select_option", semanticId: control.semanticId, value }
      : { type: "dom_input", semanticId: control.semanticId, value };
  return primitiveToolResult(await deps.executePrimitive(primitive), control);
}

type HandleControlResolution = { success: true; control: ControlCandidate } | { success: false; result: ToolResult };

function resolveHandleControl(page: PageModel, frameId: number, handle: string): HandleControlResolution {
  if (!page.interactiveIndex?.length) {
    return {
      success: false,
      result: {
        success: false,
        observation: `No current interactive index is available for frameId=${frameId} handle=${handle}. Call read_page with mode="interactive" again.`,
        error: "interactive_index_missing",
        data: pageSummaryData(page)
      }
    };
  }

  const record = page.interactiveIndex.find((candidate) => candidate.frameId === frameId && candidate.handle === handle);
  if (!record) {
    const matchingFrames = page.interactiveIndex.filter((candidate) => candidate.handle === handle).map((candidate) => candidate.frameId);
    const suffix = matchingFrames.length ? ` The handle exists in frame(s): ${Array.from(new Set(matchingFrames)).join(", ")}.` : "";
    return {
      success: false,
      result: {
        success: false,
        observation: `No current interactive element matched frameId=${frameId} handle=${handle}.${suffix} Call read_page with mode="interactive" again.`,
        error: "handle_frame_not_found",
        data: pageSummaryData(page)
      }
    };
  }

  const candidates = page.controls.filter((candidate) => controlHandle(candidate) === handle);
  if (!candidates.length) {
    return {
      success: false,
      result: {
        success: false,
        observation: `Interactive element frameId=${frameId} handle=${handle} exists, but no executable control matched it. Call read_page with mode="interactive" again.`,
        error: "handle_not_found",
        data: pageSummaryData(page)
      }
    };
  }
  if (candidates.length === 1) return { success: true, control: candidates[0] };

  const exactMatches = candidates.filter((candidate) => controlMatchesInteractiveRecord(candidate, record));
  if (exactMatches.length === 1) return { success: true, control: exactMatches[0] };

  return {
    success: false,
    result: {
      success: false,
      observation: `Multiple executable controls matched frameId=${frameId} handle=${handle}. Call read_page with mode="interactive" again before acting.`,
      error: "ambiguous_handle",
      data: pageSummaryData(page)
    }
  };
}

function controlMatchesInteractiveRecord(control: ControlCandidate, record: InteractiveElementRecord): boolean {
  const roleMatches = !record.role || normalizeText(control.role) === normalizeText(record.role);
  const tagMatches = !record.tag || normalizeText(control.elementTag) === normalizeText(record.tag);
  const recordLabel = normalizeText(record.label || record.text);
  const controlLabel = normalizeText(control.label || control.accessibleName);
  const labelMatches = !recordLabel || controlLabel === recordLabel;
  return roleMatches && tagMatches && labelMatches;
}

async function scroll(args: SerializableRecord, deps: ToolExecutorDeps): Promise<ToolResult> {
  const direction = enumArg(args.direction, ["up", "down", "left", "right"] as const, "down");
  if (direction === "left" || direction === "right") {
    return toolError(`scroll direction "${direction}" is not supported by the current primitive layer.`, "unsupported_scroll_direction");
  }
  const amount = numberArg(args.amount, 650, 40, 3000);
  const result = await deps.executePrimitive({ type: "scroll", direction, amount });
  return primitiveToolResult(result);
}

async function wait(args: SerializableRecord, deps: ToolExecutorDeps): Promise<ToolResult> {
  const milliseconds = numberArg(args.milliseconds, 500, 50, 10000);
  const result = await deps.executePrimitive({ type: "wait", milliseconds });
  return primitiveToolResult(result);
}

function done(args: SerializableRecord): ToolResult {
  const result = stringArg(args.result).trim() || "Task completed.";
  return { success: true, observation: result };
}

function fail(args: SerializableRecord): ToolResult {
  const reason = stringArg(args.reason).trim() || "Task failed.";
  return { success: false, observation: reason, error: reason };
}

async function searchContext(args: SerializableRecord, deps: ToolExecutorDeps): Promise<ToolResult> {
  const query = stringArg(args.query).trim();
  if (!query) return toolError("search_context requires query.", "missing_query");
  const settings = resolveCapabilitySettings(deps.getCapabilitySettings?.() ?? defaultCapabilitySettings());
  if (settings.search.provider === "disabled") {
    return toolError("Search is disabled in capability settings.", "search_disabled");
  }
  const maxResults = numberArg(args.maxResults, settings.search.maxResults, 1, 20);

  if (settings.search.provider === "custom_endpoint") {
    if (!settings.search.endpoint.trim()) return toolError("Custom search endpoint is not configured.", "search_endpoint_missing");
    if (!deps.customSearch) return toolError("Custom search executor is unavailable in this runtime.", "search_executor_missing");
    return deps.customSearch({
      endpoint: settings.search.endpoint.trim(),
      apiKey: settings.search.apiKey.trim(),
      query,
      maxResults
    });
  }

  const page = await latestPage(deps, {
    mode: "content",
    candidateLimit: Math.max(maxResults * 4, 20),
    observationRequest: {
      reason: "search_context",
      query,
      scope: "full_page",
      expand: ["nearby_text", "tables", "form_fields"],
      preferredRoles: ["button", "link", "textbox", "tab", "menuitem"],
      targetTextHints: [query]
    }
  });
  const terms = tokenize(query);
  const rows = [
    ...page.controls.map((control) => ({ kind: "control", id: control.semanticId, text: `${control.label} ${control.accessibleName} ${control.role}` })),
    ...page.textBlocks.map((block) => ({ kind: "text", id: block.semanticId, text: block.text })),
    ...page.readableContent.map((text, index) => ({ kind: "content", id: `content_${index + 1}`, text }))
  ]
    .map((row, index) => ({ row, index, score: textScore(row.text, terms) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, maxResults);

  if (!rows.length) {
    return {
      success: false,
      observation: `0 browser-context matches for "${query}".`,
      error: "browser_context_no_results",
      data: pageSummaryData(page)
    };
  }

  return {
    success: true,
    observation: [
      `${rows.length} browser-context result(s) for "${query}" on ${page.pageIdentity.title || page.pageIdentity.url}:`,
      ...rows.map((item, index) => `${index + 1}. [${item.row.kind}] ${item.row.id}: ${clip(item.row.text, 240)}`)
    ].join("\n"),
    data: {
      results: rows.map((item) => ({
        kind: item.row.kind,
        id: item.row.id,
        text: clip(item.row.text, 500)
      }))
    }
  };
}

async function listSkills(deps: ToolExecutorDeps): Promise<ToolResult> {
  const settings = resolveCapabilitySettings(deps.getCapabilitySettings?.() ?? defaultCapabilitySettings());
  if (!settings.skills.slashCommandsEnabled && !settings.skills.recordedWorkflowsEnabled) {
    return toolError("Skills are disabled in capability settings.", "skills_disabled");
  }
  const skills = await listSkillSummaries(deps);
  if (!skills.length) {
    return {
      success: true,
      observation: "No reusable skills are currently installed or enabled for this NaturalClick runtime.",
      data: { skills: [] }
    };
  }
  return {
    success: true,
    observation: ["Enabled skills:", ...skills.map((skill) => `- ${skill.id}: ${skill.name} — ${skill.description}`)].join("\n"),
    data: {
      skills: skills.map((skill) => ({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        enabled: skill.enabled
      }))
    }
  };
}

async function useSkill(args: SerializableRecord, deps: ToolExecutorDeps): Promise<ToolResult> {
  const skillId = stringArg(args.skillId).trim();
  const name = stringArg(args.name).trim();
  if (!skillId && !name) return toolError("use_skill requires skillId or name.", "missing_skill_id");
  const skills = await listSkillSummaries(deps);
  const summary = skillId ? skills.find((skill) => skill.id === skillId) : skills.find((skill) => skill.name.toLowerCase() === name.toLowerCase());
  if (!summary) return toolError(`Unknown skill: ${skillId || name}.`, "skill_not_found");
  const detail = await loadSkillDetail(deps, summary.id);
  const instructions = detail?.instructions?.trim();
  if (!instructions) {
    return {
      success: true,
      observation: `Skill ${summary.id} (${summary.name}) is available, but no instruction body is connected yet. Use its description as guidance: ${summary.description}`,
      data: {
        id: summary.id,
        name: summary.name,
        description: summary.description,
        enabled: summary.enabled
      }
    };
  }
  return {
    success: true,
    observation: `<untrusted_skill_content skill_id="${escapeAttribute(summary.id)}">\n${escapeUntrusted(instructions)}\n</untrusted_skill_content>`,
    data: {
      id: summary.id,
      name: summary.name,
      description: summary.description,
      enabled: summary.enabled
    }
  };
}

async function recordWorkflow(args: SerializableRecord, deps: ToolExecutorDeps): Promise<ToolResult> {
  const settings = resolveCapabilitySettings(deps.getCapabilitySettings?.() ?? defaultCapabilitySettings());
  if (!settings.skills.recordedWorkflowsEnabled) {
    return toolError("Workflow recording is disabled in capability settings.", "workflow_recording_disabled");
  }
  if (!deps.skills) {
    return toolError("Workflow recording is enabled, but durable skill storage is not connected in this runtime yet.", "workflow_storage_missing");
  }
  const name = stringArg(args.name).trim();
  const description = stringArg(args.description).trim();
  if (!name || !description) return toolError("record_workflow requires name and description.", "missing_workflow_metadata");
  const steps = stringArrayArg(args.steps);
  const draft: RecordedWorkflowDraft = {
    id: stringArg(args.id).trim(),
    name,
    description,
    steps,
    enabled: true
  };
  const saved = await deps.skills.saveRecordedWorkflow(draft);
  return {
    success: true,
    observation: `Recorded workflow skill ${saved.id} (${saved.name}) with ${saved.steps?.length ?? 0} step(s).`,
    data: compactRecord({
      id: saved.id,
      name: saved.name,
      description: saved.description,
      enabled: saved.enabled,
      source: saved.source,
      stepCount: saved.steps?.length ?? 0,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt
    })
  };
}

async function listSkillSummaries(deps: ToolExecutorDeps): Promise<SkillPackageSummary[]> {
  return deps.skills ? deps.skills.listSkills() : deps.listSkills ? deps.listSkills() : [];
}

async function loadSkillDetail(deps: ToolExecutorDeps, skillId: string): Promise<ToolSkillDetail | undefined> {
  return deps.skills ? deps.skills.loadSkill(skillId) : deps.loadSkill ? deps.loadSkill(skillId) : undefined;
}

async function saveScratchpad(args: SerializableRecord, deps: ToolExecutorDeps): Promise<ToolResult> {
  if (!deps.scratchpad) return toolError("Scratchpad storage is unavailable in this runtime.", "scratchpad_unavailable");
  const collection = sanitizeScratchpadCollection(args.collection);
  const fields = sanitizeScratchpadFields(args.fields);
  if (!collection) return toolError("save_scratchpad requires collection.", "missing_collection");
  if (Object.keys(fields).length === 0) return toolError("save_scratchpad requires primitive fields.", "missing_fields");
  const id = stringArg(args.id).trim() || `scratchpad_${collection}_${Date.now().toString(36)}`;
  const evidence = stringArg(args.evidence).trim();
  const record = sanitizeScratchpadRecord({
    id,
    collection,
    fields,
    ...(evidence ? { evidence } : {})
  });
  if (!record) return toolError("save_scratchpad could not create a valid record.", "invalid_scratchpad_record");
  const saved = await deps.scratchpad.saveRecord(record);
  const fieldKeys = Object.keys(saved.fields).sort();
  return {
    success: true,
    observation: `Saved scratchpad record ${saved.id} in ${saved.collection} with fields: ${fieldKeys.join(", ")}.`,
    data: {
      recordId: saved.id,
      collection: saved.collection,
      fieldKeys,
      evidence: saved.evidence ?? ""
    }
  };
}

async function listScratchpad(args: SerializableRecord, deps: ToolExecutorDeps): Promise<ToolResult> {
  if (!deps.scratchpad) return toolError("Scratchpad storage is unavailable in this runtime.", "scratchpad_unavailable");
  const query: ScratchpadQuery = {
    collection: sanitizeScratchpadCollection(args.collection),
    query: stringArg(args.query).trim(),
    limit: numberArg(args.limit, 10, 1, 50)
  };
  const records = (await deps.scratchpad.listRecords(query)).filter((record) => scratchpadRecordMatches(record, query)).slice(0, query.limit);
  if (!records.length) {
    return {
      success: true,
      observation: "No scratchpad records matched the request.",
      data: { records: [] }
    };
  }
  return {
    success: true,
    observation: [
      `${records.length} scratchpad record(s):`,
      ...records.map((record, index) => `${index + 1}. ${record.collection}/${record.id}: ${scratchpadFieldSummary(record)}`)
    ].join("\n"),
    data: {
      records: records.map((record) => scratchpadRecordData(record))
    }
  };
}

function listAttachments(deps: ToolExecutorDeps): ToolResult {
  const attachments = [...(deps.getAttachments?.() ?? [])];
  const metadata = stripFileArtifactPreviews(attachments).map((attachment) => {
    const original = attachments.find((item) => item.id === attachment.id);
    return compactRecord({
      ...attachmentMetadataRecord(attachment),
      hasTextPreview: Boolean(original?.textPreview),
      textPreviewChars: original?.textPreviewChars ?? 0,
      textTruncated: original?.textTruncated ?? false
    });
  });
  if (!metadata.length) {
    return {
      success: true,
      observation: "No files are attached to the current task.",
      data: { attachments: [] }
    };
  }
  return {
    success: true,
    observation: [
      `${metadata.length} attached file(s):`,
      ...metadata.map((attachment, index) =>
        `${index + 1}. ${String(attachment.filename)} (${String(attachment.mime)}, ${String(attachment.size)} bytes)${
          attachment.hasTextPreview ? " with text preview" : " without text preview"
        }`
      )
    ].join("\n"),
    data: { attachments: metadata }
  };
}

function readAttachment(args: SerializableRecord, deps: ToolExecutorDeps): ToolResult {
  const attachments = [...(deps.getAttachments?.() ?? [])];
  if (!attachments.length) return toolError("No files are attached to the current task.", "no_attachments");
  const id = stringArg(args.id).trim();
  const filename = stringArg(args.filename).trim();
  if (!id && !filename) return toolError("read_attachment requires id or filename.", "missing_attachment_ref");
  const attachment = id
    ? attachments.find((item) => item.id === id)
    : attachments.find((item) => item.filename === filename) ?? attachments.find((item) => item.filename.toLowerCase().includes(filename.toLowerCase()));
  if (!attachment) {
    return {
      success: false,
      observation: `No attached file matched ${id ? `id=${id}` : `filename=${filename}`}.`,
      error: "attachment_not_found",
      data: { attachments: stripFileArtifactPreviews(attachments).map(attachmentMetadataRecord) }
    };
  }
  const metadata = stripFileArtifactPreviews([attachment])[0];
  if (!attachment.textPreview) {
    return {
      success: false,
      observation: `Attachment ${attachment.filename} has no text preview available. Only metadata can be used.`,
      error: "attachment_preview_unavailable",
      data: metadata ? attachmentMetadataRecord(metadata) : {}
    };
  }
  return {
    success: true,
    observation: `Attachment ${attachment.filename} text preview is available (${attachment.textPreviewChars ?? attachment.textPreview.length} chars${
      attachment.textTruncated ? ", truncated" : ""
    }).`,
    data: compactRecord({
      ...(metadata ? attachmentMetadataRecord(metadata) : {}),
      textPreview: attachment.textPreview,
      textPreviewChars: attachment.textPreviewChars ?? attachment.textPreview.length,
      textTruncated: attachment.textTruncated ?? false
    })
  };
}

async function saveArtifact(args: SerializableRecord, deps: ToolExecutorDeps): Promise<ToolResult> {
  if (!deps.artifacts) return toolError("Artifact storage is unavailable in this runtime.", "artifact_storage_unavailable");
  const filename = stringArg(args.filename).trim();
  const textContent = stringArg(args.textContent);
  if (!filename) return toolError("save_artifact requires filename.", "missing_filename");
  if (!textContent.trim()) return toolError("save_artifact requires textContent.", "missing_text_content");
  const draft = sanitizeGeneratedTextArtifact({
    id: stringArg(args.id),
    filename,
    mime: stringArg(args.mime),
    textContent,
    source: stringArg(args.source)
  });
  if (!draft) return toolError("save_artifact could not create a valid text artifact.", "invalid_artifact");
  const saved = await deps.artifacts.saveArtifact(draft);
  return {
    success: true,
    observation: `Saved artifact ${saved.id} as ${saved.filename} (${saved.mime}, ${saved.size} bytes). The user can download it from the Artifacts list.`,
    data: artifactSummaryData(saved)
  };
}

async function listArtifacts(args: SerializableRecord, deps: ToolExecutorDeps): Promise<ToolResult> {
  if (!deps.artifacts) return toolError("Artifact storage is unavailable in this runtime.", "artifact_storage_unavailable");
  const query = stringArg(args.query).trim();
  const limit = numberArg(args.limit, 10, 1, 50);
  const artifacts = await deps.artifacts.listArtifacts({ query, limit });
  if (!artifacts.length) {
    return {
      success: true,
      observation: "No generated artifacts matched the request.",
      data: { artifacts: [] }
    };
  }
  return {
    success: true,
    observation: [
      `${artifacts.length} generated artifact(s):`,
      ...artifacts.map((artifact, index) => `${index + 1}. ${artifact.filename} (${artifact.mime}, ${artifact.size} bytes)`)
    ].join("\n"),
    data: {
      artifacts: artifacts.map(artifactSummaryData)
    }
  };
}

async function readArtifact(args: SerializableRecord, deps: ToolExecutorDeps): Promise<ToolResult> {
  if (!deps.artifacts) return toolError("Artifact storage is unavailable in this runtime.", "artifact_storage_unavailable");
  const id = stringArg(args.id).trim();
  const filename = stringArg(args.filename).trim();
  if (!id && !filename) return toolError("read_artifact requires id or filename.", "missing_artifact_ref");
  const artifacts = await deps.artifacts.listArtifacts({ limit: 50 });
  const summary = id
    ? artifacts.find((artifact) => artifact.id === id)
    : artifacts.find((artifact) => artifact.filename === filename) ?? artifacts.find((artifact) => artifact.filename.toLowerCase().includes(filename.toLowerCase()));
  const artifact = summary ? await deps.artifacts.loadArtifact(summary.id) : undefined;
  if (!artifact) {
    return {
      success: false,
      observation: `No generated artifact matched ${id ? `id=${id}` : `filename=${filename}`}.`,
      error: "artifact_not_found",
      data: { artifacts: artifacts.map(artifactSummaryData) }
    };
  }
  return {
    success: true,
    observation: `Artifact ${artifact.filename} is available (${artifact.textContent.length} chars).`,
    data: {
      ...artifactSummaryData(artifact),
      textContent: artifact.textContent
    }
  };
}

async function saveSchedule(args: SerializableRecord, deps: ToolExecutorDeps): Promise<ToolResult> {
  if (!deps.schedules) return toolError("Schedule storage is unavailable in this runtime.", "schedule_unavailable");
  const title = stringArg(args.title).trim();
  const taskText = stringArg(args.taskText).trim();
  if (!title) return toolError("save_schedule requires title.", "missing_title");
  if (!taskText) return toolError("save_schedule requires taskText.", "missing_task_text");
  const id = stringArg(args.id).trim() || `schedule_${Date.now().toString(36)}`;
  const record = sanitizeScheduledTaskRecord({
    id,
    title,
    taskText,
    status: sanitizeScheduleStatus(args.status),
    trigger: sanitizeScheduleTrigger(args.trigger),
    notes: stringArg(args.notes)
  });
  if (!record) return toolError("save_schedule could not create a valid schedule record.", "invalid_schedule_record");
  const saved = await deps.schedules.saveSchedule(record);
  return {
    success: true,
    observation: `Saved schedule ${saved.id} (${saved.status}) with ${saved.trigger.type} trigger. It can be run manually from the Schedules view; automatic trigger execution is not connected yet.`,
    data: scheduleRecordData(saved)
  };
}

async function listSchedules(args: SerializableRecord, deps: ToolExecutorDeps): Promise<ToolResult> {
  if (!deps.schedules) return toolError("Schedule storage is unavailable in this runtime.", "schedule_unavailable");
  const query: ScheduleQuery = {
    status: stringArg(args.status),
    query: stringArg(args.query).trim(),
    limit: numberArg(args.limit, 10, 1, 50)
  };
  const records = (await deps.schedules.listSchedules(query)).filter((record) => scheduleRecordMatches(record, query)).slice(0, query.limit);
  if (!records.length) {
    return {
      success: true,
      observation: "No saved schedules matched the request.",
      data: { schedules: [] }
    };
  }
  return {
    success: true,
    observation: [
      `${records.length} saved schedule(s):`,
      ...records.map((record, index) => `${index + 1}. ${record.title} [${record.status}] ${scheduleTriggerSummary(record)}`)
    ].join("\n"),
    data: {
      schedules: records.map((record) => scheduleRecordData(record))
    }
  };
}

function attachmentMetadataRecord(attachment: Pick<FileAttachmentContext, "id" | "filename" | "mime" | "size" | "createdAt">): SerializableRecord {
  return compactRecord({
    id: attachment.id,
    filename: attachment.filename,
    mime: attachment.mime,
    size: attachment.size,
    createdAt: attachment.createdAt
  });
}

async function latestPage(deps: ToolExecutorDeps, options: ToolObserveOptions): Promise<PageModel> {
  const existing = deps.getLastPage?.();
  if (existing) return existing;
  return deps.observePage(options);
}

function pageObservationForMode(page: PageModel, mode: "atlas" | "interactive" | "content" | "full"): string {
  if (mode === "interactive") return page.interactiveIndexText || page.atlasText || pageReadableSummary(page);
  if (mode === "content") return page.readableContent.length ? page.readableContent.slice(0, 40).join("\n") : pageReadableSummary(page);
  if (mode === "full") {
    return [page.atlasText, page.interactiveIndexText, page.readableContent.slice(0, 80).join("\n")].filter(Boolean).join("\n\n");
  }
  return page.atlasText || pageReadableSummary(page);
}

function pageReadableSummary(page: PageModel): string {
  return [
    `Page: ${page.pageIdentity.title || page.pageIdentity.url}`,
    `URL: ${page.pageIdentity.url}`,
    `Controls: ${page.controls.length}; text blocks: ${page.textBlocks.length}; forms: ${page.forms.length}.`,
    ...page.feedback
  ].join("\n");
}

function pageSummaryData(page: PageModel): SerializableRecord {
  return {
    url: page.pageIdentity.url,
    title: page.pageIdentity.title,
    atlasId: page.atlas?.atlasId ?? "",
    controls: page.controls.length,
    textBlocks: page.textBlocks.length,
    forms: page.forms.length,
    capturedAt: page.capturedAt
  };
}

function pageEntities(page: PageModel): PageEntity[] {
  return [
    ...page.controls.map((control): PageEntity => ({ kind: "control", control })),
    ...page.textBlocks.map((text): PageEntity => ({ kind: "text", text })),
    ...page.forms.map((form): PageEntity => ({ kind: "form", form }))
  ];
}

function findEntity(page: PageModel, targetId: string, handle: string): PageEntity | undefined {
  if (handle) {
    const control = page.controls.find((candidate) => controlHandle(candidate) === handle);
    if (control) return { kind: "control", control };
  }
  if (!targetId) return undefined;
  const control = page.controls.find((candidate) => candidate.semanticId === targetId);
  if (control) return { kind: "control", control };
  const text = page.textBlocks.find((candidate) => candidate.semanticId === targetId);
  if (text) return { kind: "text", text };
  const form = page.forms.find((candidate) => candidate.semanticId === targetId);
  if (form) return { kind: "form", form };
  return undefined;
}

function nearbyContext(page: PageModel, entity: PageEntity): string[] {
  const region = entity.kind === "control" ? entity.control.regionRef : entity.kind === "text" ? entity.text.regionRef : undefined;
  if (!region) return [];
  const text = page.textBlocks.filter((block) => block.regionRef === region).slice(0, 6);
  if (!text.length) return [];
  return ["Nearby text:", ...text.map((block) => `- ${clip(block.text, 180)}`)];
}

function entityScore(entity: PageEntity, terms: string[], role: string): number {
  const text = entitySearchText(entity);
  const base = textScore(text, terms);
  if (base <= 0) return 0;
  if (!role) return base;
  const entityRole = entity.kind === "control" ? entity.control.role.toLowerCase() : entity.kind === "text" ? (entity.text.role ?? entity.text.kind).toLowerCase() : "form";
  return entityRole.includes(role) ? base + 0.25 : base * 0.35;
}

function textScore(text: string, terms: string[]): number {
  if (!terms.length) return 0;
  const normalized = normalizeText(text);
  const hits = terms.filter((term) => normalized.includes(term)).length;
  if (!hits) return 0;
  return hits / terms.length + Math.min(0.2, normalized.length ? 80 / normalized.length : 0);
}

function entitySearchText(entity: PageEntity): string {
  if (entity.kind === "control") {
    return [
      entity.control.semanticId,
      entity.control.role,
      entity.control.label,
      entity.control.accessibleName,
      entity.control.description,
      entity.control.regionRef,
      entity.control.valueState
    ]
      .filter(Boolean)
      .join(" ");
  }
  if (entity.kind === "text") return `${entity.text.semanticId} ${entity.text.kind} ${entity.text.role ?? ""} ${entity.text.text}`;
  return `${entity.form.semanticId} ${entity.form.label} ${entity.form.controlLabels.join(" ")}`;
}

function entityLine(entity: PageEntity): string {
  if (entity.kind === "control") {
    const handle = controlHandle(entity.control);
    return `control id=${entity.control.semanticId}${handle ? ` handle=${handle}` : ""} role=${entity.control.role} label="${entity.control.label}" visible=${entity.control.visibility}`;
  }
  if (entity.kind === "text") return `text id=${entity.text.semanticId} kind=${entity.text.kind} text="${clip(entity.text.text, 160)}"`;
  return `form id=${entity.form.semanticId} label="${entity.form.label}" fields="${entity.form.controlLabels.join(", ")}"`;
}

function entityData(entity: PageEntity): SerializableRecord {
  if (entity.kind === "control") {
    return compactRecord({
      kind: "control",
      id: entity.control.semanticId,
      handle: controlHandle(entity.control),
      role: entity.control.role,
      label: entity.control.label,
      accessibleName: entity.control.accessibleName,
      visibility: entity.control.visibility,
      disabled: entity.control.disabled,
      expandedState: entity.control.expandedState,
      valueState: entity.control.valueState,
      regionRef: entity.control.regionRef
    });
  }
  if (entity.kind === "text") {
    return compactRecord({
      kind: "text",
      id: entity.text.semanticId,
      text: entity.text.text,
      role: entity.text.role,
      visibility: entity.text.visibility,
      regionRef: entity.text.regionRef
    });
  }
  return compactRecord({
    kind: "form",
    id: entity.form.semanticId,
    label: entity.form.label,
    fields: entity.form.controlLabels,
    submitControlRefs: entity.form.submitControlRefs
  });
}

function controlHandle(control: ControlCandidate): string | undefined {
  const hint = control.locatorHints.find((candidate) => candidate.kind === "attribute" && candidate.value.startsWith("data-naturalclick-handle="));
  return hint?.value.slice("data-naturalclick-handle=".length);
}

function primitiveToolResult(result: PrimitiveResult, control?: ControlCandidate): ToolResult {
  const success = result.status === "success";
  return {
    success,
    observation: success
      ? `Primitive ${String(result.details.primitive ?? "action")} succeeded${control?.label ? ` on "${control.label}"` : ""}.`
      : `Primitive ${String(result.details.primitive ?? "action")} failed: ${result.reason ?? "unknown"}.`,
    error: success ? undefined : result.reason ?? "primitive_failed",
    data: compactRecord({
      status: result.status,
      reason: result.reason,
      details: sanitizeSerializable(result.details),
      target: control ? entityData({ kind: "control", control }) : undefined
    })
  };
}

function scratchpadFieldSummary(record: ScratchpadRecord): string {
  return Object.entries(record.fields)
    .map(([key, value]) => `${key}=${clip(String(value ?? ""), 80)}`)
    .join("; ");
}

function scratchpadRecordData(record: ScratchpadRecord): SerializableRecord {
  return compactRecord({
    id: record.id,
    collection: record.collection,
    fields: record.fields,
    evidence: record.evidence,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  });
}

function artifactSummaryData(artifact: GeneratedTextArtifact): SerializableRecord {
  return compactRecord({
    id: artifact.id,
    filename: artifact.filename,
    mime: artifact.mime,
    size: artifact.size,
    createdAt: artifact.createdAt,
    textPreview: artifact.textPreview,
    textTruncated: artifact.textTruncated ?? false,
    source: artifact.source ?? ""
  });
}

function scheduleTriggerSummary(record: ScheduledTaskRecord): string {
  const trigger = record.trigger;
  if (trigger.type === "daily" && trigger.timeOfDay) return `daily at ${trigger.timeOfDay}`;
  if (trigger.type === "weekly") return `weekly${trigger.dayOfWeek === undefined ? "" : ` day ${trigger.dayOfWeek}`}${trigger.timeOfDay ? ` at ${trigger.timeOfDay}` : ""}`;
  if (trigger.type === "page_change") return `page change${trigger.urlPattern ? ` ${trigger.urlPattern}` : ""}`;
  return trigger.type;
}

function scheduleRecordData(record: ScheduledTaskRecord): SerializableRecord {
  return compactRecord({
    id: record.id,
    title: record.title,
    taskText: record.taskText,
    trigger: record.trigger,
    status: record.status,
    notes: record.notes,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastRunAt: record.lastRunAt,
    nextRunAt: record.nextRunAt
  });
}

function toolError(observation: string, error: string): ToolResult {
  return { success: false, observation, error };
}

function stringArg(value: SerializableValue | undefined): string {
  return typeof value === "string" ? value : "";
}

function booleanArg(value: SerializableValue | undefined, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function numberArg(value: SerializableValue | undefined, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function frameIdArg(value: SerializableValue | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
  return Math.round(value);
}

function enumArg<T extends readonly string[]>(value: SerializableValue | undefined, allowed: T, fallback: T[number]): T[number] {
  return typeof value === "string" && allowed.includes(value) ? value : fallback;
}

function stringArrayArg(value: SerializableValue | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()) : [];
}

function tokenize(value: string): string[] {
  return Array.from(new Set(normalizeText(value).split(/[\s,，。:：/|()[\]{}"'`]+/).filter(Boolean)));
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function clip(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function compactRecord(value: Record<string, unknown>): SerializableRecord {
  const out: SerializableRecord = {};
  for (const [key, item] of Object.entries(value)) {
    const sanitized = sanitizeSerializable(item);
    if (sanitized !== undefined) out[key] = sanitized;
  }
  return out;
}

function sanitizeSerializable(value: unknown): SerializableValue | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (Array.isArray(value)) return value.map(sanitizeSerializable).filter((item): item is SerializableValue => item !== undefined);
  if (value && typeof value === "object") return compactRecord(value as Record<string, unknown>);
  return String(value);
}

function escapeUntrusted(value: string): string {
  return value.replace(/<\/?untrusted_[^>]*>/g, "");
}

function escapeAttribute(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char] ?? char);
}
