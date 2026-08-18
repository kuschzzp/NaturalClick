import { isSerializableRecord, type SerializableRecord, type SerializableValue } from "../architecture/serialization";
import { parseLooseJson, type OpenAICompatibleToolCall } from "../model/openai-compatible";
import type { ToolDefinition, ToolResult } from "../tools/tool";

export const DEFAULT_MAX_PLANNER_NATIVE_TOOL_ROUNDS = 1;

const defaultReadToolBlocklist = new Set(["click", "type", "select", "scroll", "done", "fail"]);
const defaultPlannerNativeReadToolAllowlist = new Set([
  "read_page",
  "find_target",
  "read_target",
  "load_tools",
  "search_context",
  "list_skills",
  "use_skill",
  "list_scratchpad",
  "save_scratchpad",
  "list_attachments",
  "read_attachment",
  "list_schedules",
  "save_schedule"
]);

export interface PlannerNativeToolPolicy {
  allowWriteTools?: boolean;
  allowlist?: ReadonlySet<string>;
  blocklist?: ReadonlySet<string>;
}

export type ParsedPlannerToolArgs =
  | { ok: true; args: SerializableRecord }
  | { ok: false; error: "invalid_tool_arguments" };

export interface PlannerNativeToolCallExecution {
  call: OpenAICompatibleToolCall;
  result: ToolResult;
  reused: boolean;
}

export function selectPlannerNativeTools(tools: ToolDefinition[], policy: PlannerNativeToolPolicy = {}): ToolDefinition[] {
  const blocklist = policy.blocklist ?? defaultReadToolBlocklist;
  const allowlist = policy.allowlist ?? defaultPlannerNativeReadToolAllowlist;
  return tools.filter((tool) => {
    if (blocklist.has(tool.name)) return false;
    if (!policy.allowWriteTools && !allowlist.has(tool.name)) return false;
    return true;
  });
}

export function parsePlannerNativeToolArguments(call: OpenAICompatibleToolCall): ParsedPlannerToolArgs {
  const text = call.argumentsText.trim();
  if (!text) return { ok: true, args: {} };
  const parsed = parseLooseJson(text);
  if (!isSerializableRecord(parsed)) return { ok: false, error: "invalid_tool_arguments" };
  return { ok: true, args: parsed };
}

export function plannerNativeToolCallCacheKey(call: OpenAICompatibleToolCall): string {
  const parsed = parsePlannerNativeToolArguments(call);
  if (!parsed.ok) return `${call.name}:invalid:${call.argumentsText.trim()}`;
  return `${call.name}:${stableSerializableString(parsed.args)}`;
}

export async function executePlannerNativeToolCallsWithCache(
  calls: OpenAICompatibleToolCall[],
  execute: (call: OpenAICompatibleToolCall) => Promise<ToolResult>
): Promise<PlannerNativeToolCallExecution[]> {
  const cache = new Map<string, ToolResult>();
  const executions: PlannerNativeToolCallExecution[] = [];
  for (const call of calls) {
    const key = plannerNativeToolCallCacheKey(call);
    const cached = cache.get(key);
    if (cached) {
      executions.push({ call, result: cached, reused: true });
      continue;
    }
    const result = await execute(call);
    cache.set(key, result);
    executions.push({ call, result, reused: false });
  }
  return executions;
}

export function plannerNativeToolResultContent(result: ToolResult, observationLimit = 8000): string {
  return JSON.stringify(plannerNativeToolResultPayload(result, observationLimit));
}

export function plannerNativeToolResultPayload(result: ToolResult, observationLimit = 8000): SerializableRecord {
  return {
    success: result.success,
    observation: result.observation.slice(0, Math.max(0, observationLimit)),
    ...(result.error ? { error: result.error } : {}),
    ...(result.data ? { data: result.data } : {})
  };
}

export function plannerNativeToolBudgetInstruction(calls: OpenAICompatibleToolCall[], maxRounds = DEFAULT_MAX_PLANNER_NATIVE_TOOL_ROUNDS): string {
  return JSON.stringify({
    nativeToolBudget: "exhausted",
    maxRounds,
    requestedTools: calls.map((call) => call.name),
    instruction:
      "Do not call more tools. Use the original page context and previous tool results already in this conversation, then return exactly one valid NaturalClick planner JSON object."
  });
}

export function shouldRetryPlannerRequestWithoutTools(error: unknown): boolean {
  const reason = error instanceof Error ? error.message : String(error);
  return /^planner_http_(400|404|405|422)/.test(reason);
}

function stableSerializableString(value: SerializableValue): string {
  if (Array.isArray(value)) return `[${value.map(stableSerializableString).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerializableString(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
