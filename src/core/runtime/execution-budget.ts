export type ExecutionPreset = "light" | "standard" | "deep" | "custom";
export type LimitReachedAction = "stop_and_summarize" | "ask_to_continue" | "auto_extend_once";

export interface ExecutionBudget {
  maxStepsPerTask: number;
  maxTaskDurationMs: number;
  maxModelCallsPerTask: number;
  maxConsecutiveFailures: number;
  maxSameCommandRetries: number;
}

export interface ObservationBudget {
  maxObservationRoundsPerStep: number;
  maxObservationRoundsPerTask: number;
  maxObservationExpansionRetries: number;
  initialCandidateLimit: number;
  expandedCandidateLimit: number;
  hardCandidateLimit: number;
  maxObservationTokensPerStep: number;
  allowVisionOnFinalRound: boolean;
}

export interface VisionFallbackSettings {
  onTargetNotFound: boolean;
  onVerificationInconclusive: boolean;
}

export interface StreamingSettings {
  runtimeEvents: boolean;
  assistantReplyTokens: boolean;
  showPlannerRawStream: boolean;
}

export interface RuntimeSettings {
  executionPreset: ExecutionPreset;
  execution: ExecutionBudget;
  observation: ObservationBudget;
  visionFallback: VisionFallbackSettings;
  streaming: StreamingSettings;
  limitReachedAction: LimitReachedAction;
}

export interface RuntimeSettingsInput {
  executionPreset?: ExecutionPreset;
  executionBudget?: Partial<ExecutionBudget>;
  observationBudget?: Partial<ObservationBudget>;
  visionFallback?: Partial<VisionFallbackSettings>;
  streaming?: Partial<StreamingSettings>;
  limitReachedAction?: LimitReachedAction;
}

export interface RuntimeCounters {
  stepCount: number;
  modelCallCount: number;
  observationRoundCount: number;
  consecutiveFailures: number;
  sameCommandRetries: number;
  startedAt: number;
  now?: number;
}

export type LimitReason =
  | "max_steps"
  | "max_task_duration"
  | "max_model_calls"
  | "max_consecutive_failures"
  | "max_same_command_retries"
  | "max_observation_rounds";

export interface LimitStatus {
  reached: boolean;
  reason?: LimitReason;
}

export const executionPresets: Record<Exclude<ExecutionPreset, "custom">, ExecutionBudget> = {
  light: {
    maxStepsPerTask: 4,
    maxTaskDurationMs: 60000,
    maxModelCallsPerTask: 6,
    maxConsecutiveFailures: 1,
    maxSameCommandRetries: 0
  },
  standard: {
    maxStepsPerTask: 8,
    maxTaskDurationMs: 120000,
    maxModelCallsPerTask: 12,
    maxConsecutiveFailures: 2,
    maxSameCommandRetries: 1
  },
  deep: {
    maxStepsPerTask: 16,
    maxTaskDurationMs: 300000,
    maxModelCallsPerTask: 24,
    maxConsecutiveFailures: 3,
    maxSameCommandRetries: 2
  }
};

export const standardObservationBudget: ObservationBudget = {
  maxObservationRoundsPerStep: 6,
  maxObservationRoundsPerTask: 24,
  maxObservationExpansionRetries: 4,
  initialCandidateLimit: 120,
  expandedCandidateLimit: 320,
  hardCandidateLimit: 600,
  maxObservationTokensPerStep: 36000,
  allowVisionOnFinalRound: true
};

export const standardRuntimeSettings: RuntimeSettings = {
  executionPreset: "standard",
  execution: executionPresets.standard,
  observation: standardObservationBudget,
  visionFallback: {
    onTargetNotFound: true,
    onVerificationInconclusive: true
  },
  streaming: {
    runtimeEvents: true,
    assistantReplyTokens: true,
    showPlannerRawStream: true
  },
  limitReachedAction: "ask_to_continue"
};

function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function resolveRuntimeSettings(input: RuntimeSettingsInput = {}): RuntimeSettings {
  const preset = input.executionPreset && input.executionPreset !== "custom" ? input.executionPreset : "standard";
  const baseExecution = input.executionPreset === "custom" ? executionPresets.standard : executionPresets[preset];
  const execution: ExecutionBudget = {
    maxStepsPerTask: positiveInteger(input.executionBudget?.maxStepsPerTask, baseExecution.maxStepsPerTask),
    maxTaskDurationMs: positiveInteger(input.executionBudget?.maxTaskDurationMs, baseExecution.maxTaskDurationMs),
    maxModelCallsPerTask: positiveInteger(input.executionBudget?.maxModelCallsPerTask, baseExecution.maxModelCallsPerTask),
    maxConsecutiveFailures: positiveInteger(input.executionBudget?.maxConsecutiveFailures, baseExecution.maxConsecutiveFailures),
    maxSameCommandRetries: positiveInteger(input.executionBudget?.maxSameCommandRetries, baseExecution.maxSameCommandRetries)
  };

  const observation: ObservationBudget = {
    maxObservationRoundsPerStep: positiveInteger(
      input.observationBudget?.maxObservationRoundsPerStep,
      standardObservationBudget.maxObservationRoundsPerStep
    ),
    maxObservationRoundsPerTask: positiveInteger(
      input.observationBudget?.maxObservationRoundsPerTask,
      standardObservationBudget.maxObservationRoundsPerTask
    ),
    maxObservationExpansionRetries: positiveInteger(
      input.observationBudget?.maxObservationExpansionRetries,
      standardObservationBudget.maxObservationExpansionRetries
    ),
    initialCandidateLimit: positiveInteger(input.observationBudget?.initialCandidateLimit, standardObservationBudget.initialCandidateLimit),
    expandedCandidateLimit: positiveInteger(input.observationBudget?.expandedCandidateLimit, standardObservationBudget.expandedCandidateLimit),
    hardCandidateLimit: positiveInteger(input.observationBudget?.hardCandidateLimit, standardObservationBudget.hardCandidateLimit),
    maxObservationTokensPerStep: positiveInteger(
      input.observationBudget?.maxObservationTokensPerStep,
      standardObservationBudget.maxObservationTokensPerStep
    ),
    allowVisionOnFinalRound: bool(input.observationBudget?.allowVisionOnFinalRound, standardObservationBudget.allowVisionOnFinalRound)
  };

  return {
    executionPreset: input.executionPreset ?? "standard",
    execution,
    observation,
    visionFallback: {
      onTargetNotFound: bool(input.visionFallback?.onTargetNotFound, standardRuntimeSettings.visionFallback.onTargetNotFound),
      onVerificationInconclusive: bool(
        input.visionFallback?.onVerificationInconclusive,
        standardRuntimeSettings.visionFallback.onVerificationInconclusive
      )
    },
    streaming: {
      runtimeEvents: bool(input.streaming?.runtimeEvents, standardRuntimeSettings.streaming.runtimeEvents),
      assistantReplyTokens: bool(input.streaming?.assistantReplyTokens, standardRuntimeSettings.streaming.assistantReplyTokens),
      showPlannerRawStream: bool(input.streaming?.showPlannerRawStream, standardRuntimeSettings.streaming.showPlannerRawStream)
    },
    limitReachedAction: input.limitReachedAction ?? standardRuntimeSettings.limitReachedAction
  };
}

export function limitStatus(counters: RuntimeCounters, settings: RuntimeSettings): LimitStatus {
  const now = counters.now ?? Date.now();
  if (counters.stepCount >= settings.execution.maxStepsPerTask) return { reached: true, reason: "max_steps" };
  if (now - counters.startedAt >= settings.execution.maxTaskDurationMs) return { reached: true, reason: "max_task_duration" };
  if (counters.modelCallCount >= settings.execution.maxModelCallsPerTask) return { reached: true, reason: "max_model_calls" };
  if (counters.consecutiveFailures >= settings.execution.maxConsecutiveFailures) return { reached: true, reason: "max_consecutive_failures" };
  if (counters.sameCommandRetries > settings.execution.maxSameCommandRetries) return { reached: true, reason: "max_same_command_retries" };
  if (counters.observationRoundCount >= settings.observation.maxObservationRoundsPerTask) {
    return { reached: true, reason: "max_observation_rounds" };
  }
  return { reached: false };
}
