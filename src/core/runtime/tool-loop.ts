import type { SerializableRecord } from "../architecture/serialization";
import type { ToolDefinition, ToolResult } from "../tools/tool";

export interface ToolCall {
  id: string;
  name: string;
  args: SerializableRecord;
}

export type ModelToolTurn =
  | { type: "tool_calls"; calls: ToolCall[] }
  | { type: "text"; text: string };

export interface ToolLoopInput {
  tools: ToolDefinition[];
  limits?: ToolLoopLimits;
  abortSignal?: AbortSignal;
  eventSink?: ToolLoopEventSink;
  modelTurn(): Promise<ModelToolTurn>;
  executeTool(call: ToolCall): Promise<ToolResult>;
}

export interface ToolLoopLimits {
  maxCallsPerTurn?: number;
  maxConsecutiveFailures?: number;
  maxObservationRepeats?: number;
}

export interface ToolLoopEventSink {
  onToolStarted?: (call: ToolCall, tool: ToolDefinition) => Promise<void> | void;
  onToolFinished?: (call: ToolCall, result: ToolResult, tool: ToolDefinition) => Promise<void> | void;
}

export interface ToolLoopObservation {
  call: ToolCall;
  result: ToolResult;
}

export interface ToolLoopResult {
  observations: ToolLoopObservation[];
  terminal?: { success: boolean; summary: string };
  text?: string;
}

export async function runToolLoopStep(input: ToolLoopInput): Promise<ToolLoopResult> {
  if (input.abortSignal?.aborted) return abortedResult();

  const turn = await input.modelTurn();
  if (input.abortSignal?.aborted) return abortedResult();
  if (turn.type === "text") return { observations: [], text: turn.text };

  const observations: ToolLoopObservation[] = [];
  let terminal: ToolLoopResult["terminal"];
  const toolsByName = new Map(input.tools.map((tool) => [tool.name, tool]));
  const maxCallsPerTurn = normalizeLimit(input.limits?.maxCallsPerTurn);
  const maxConsecutiveFailures = normalizeLimit(input.limits?.maxConsecutiveFailures);
  const maxObservationRepeats = normalizeLimit(input.limits?.maxObservationRepeats);
  let executedCalls = 0;
  let consecutiveFailures = 0;
  let lastObservation = "";
  let repeatedObservations = 0;

  for (const call of turn.calls) {
    if (input.abortSignal?.aborted) {
      terminal = { success: false, summary: "Tool loop aborted." };
      break;
    }

    if (executedCalls >= maxCallsPerTurn) {
      terminal = { success: false, summary: "Tool call limit reached." };
      break;
    }

    const tool = toolsByName.get(call.name);
    if (!tool) {
      const result = failureResult(`Unknown tool ${call.name}`);
      observations.push({ call, result });
      consecutiveFailures += 1;
      if (consecutiveFailures >= maxConsecutiveFailures) {
        terminal = { success: false, summary: "Tool failure limit reached." };
        break;
      }
      continue;
    }

    await input.eventSink?.onToolStarted?.(call, tool);
    if (input.abortSignal?.aborted) {
      terminal = { success: false, summary: "Tool loop aborted." };
      break;
    }
    const result = await executeToolSafely(input, call);
    await input.eventSink?.onToolFinished?.(call, result, tool);
    observations.push({ call, result });
    executedCalls += 1;

    if (input.abortSignal?.aborted) {
      terminal = { success: false, summary: "Tool loop aborted." };
      break;
    }

    if (result.success) consecutiveFailures = 0;
    else consecutiveFailures += 1;

    if (result.observation === lastObservation) repeatedObservations += 1;
    else {
      lastObservation = result.observation;
      repeatedObservations = 1;
    }

    if (call.name === "done" && result.success) {
      terminal = { success: true, summary: result.observation };
      break;
    }
    if (call.name === "fail") {
      terminal = { success: false, summary: result.error ?? result.observation };
      break;
    }

    if (consecutiveFailures >= maxConsecutiveFailures) {
      terminal = { success: false, summary: "Tool failure limit reached." };
      break;
    }
    if (repeatedObservations >= maxObservationRepeats) {
      terminal = { success: false, summary: "Repeated tool observation limit reached." };
      break;
    }
  }

  return { observations, terminal };
}

async function executeToolSafely(input: ToolLoopInput, call: ToolCall): Promise<ToolResult> {
  try {
    return await input.executeTool(call);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return failureResult(`Tool ${call.name} failed: ${reason}`, reason);
  }
}

function abortedResult(): ToolLoopResult {
  return {
    observations: [],
    terminal: { success: false, summary: "Tool loop aborted." }
  };
}

function failureResult(observation: string, error = observation): ToolResult {
  return {
    success: false,
    observation,
    error
  };
}

function normalizeLimit(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor(value));
}
