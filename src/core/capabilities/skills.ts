export interface SkillPackageSummary {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  source?: SkillPackageSource;
  createdAt?: number;
  updatedAt?: number;
}

export type SkillPackageSource = "recorded_workflow" | "built_in" | "imported";

export interface SkillPackageDetail extends SkillPackageSummary {
  instructions?: string;
  steps?: string[];
}

export interface RecordedWorkflowDraft {
  id?: string;
  name: string;
  description: string;
  steps?: string[];
  enabled?: boolean;
}

export interface SkillStore {
  listSkills(): Promise<SkillPackageSummary[]>;
  loadSkill(skillId: string): Promise<SkillPackageDetail | undefined>;
  saveRecordedWorkflow(draft: RecordedWorkflowDraft): Promise<SkillPackageDetail>;
}

const SKILL_SOURCES = new Set<SkillPackageSource>(["recorded_workflow", "built_in", "imported"]);

export function sanitizeSkillId(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\p{L}\p{N}_.-]/gu, "")
    .slice(0, 120);
}

export function sanitizeSkillName(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 120) : "";
}

export function sanitizeSkillDescription(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 500) : "";
}

export function sanitizeWorkflowSteps(value: unknown, maxSteps = 30): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    .map((item) => item.trim().slice(0, 500))
    .slice(0, maxSteps);
}

export function sanitizeSkillPackage(value: unknown, now = Date.now()): SkillPackageDetail | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const name = sanitizeSkillName(record.name);
  const description = sanitizeSkillDescription(record.description);
  const id = sanitizeSkillId(record.id) || `workflow_${sanitizeSkillId(name).toLowerCase()}`;
  if (!id || !name || !description) return undefined;
  const source = sanitizeSkillSource(record.source);
  const steps = sanitizeWorkflowSteps(record.steps);
  const rawInstructions = typeof record.instructions === "string" ? record.instructions.trim().slice(0, 6000) : "";
  const instructions = rawInstructions || buildRecordedWorkflowInstructions({ name, description, steps });
  return {
    id,
    name,
    description,
    enabled: typeof record.enabled === "boolean" ? record.enabled : true,
    source,
    ...(instructions ? { instructions } : {}),
    ...(steps.length ? { steps } : {}),
    createdAt: timestampField(record.createdAt) ?? now,
    updatedAt: timestampField(record.updatedAt) ?? now
  };
}

export function sanitizeRecordedWorkflowDraft(draft: RecordedWorkflowDraft, now = Date.now()): SkillPackageDetail | undefined {
  const name = sanitizeSkillName(draft.name);
  const description = sanitizeSkillDescription(draft.description);
  const id = sanitizeSkillId(draft.id) || `workflow_${sanitizeSkillId(name).toLowerCase()}`;
  if (!id || !name || !description) return undefined;
  const steps = sanitizeWorkflowSteps(draft.steps);
  return sanitizeSkillPackage(
    {
      id,
      name,
      description,
      enabled: draft.enabled ?? true,
      source: "recorded_workflow",
      steps,
      instructions: buildRecordedWorkflowInstructions({ name, description, steps })
    },
    now
  );
}

export function skillSummary(detail: SkillPackageDetail): SkillPackageSummary {
  return {
    id: detail.id,
    name: detail.name,
    description: detail.description,
    enabled: detail.enabled,
    source: detail.source,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt
  };
}

function buildRecordedWorkflowInstructions(input: { name: string; description: string; steps: string[] }): string {
  const steps = input.steps.length
    ? input.steps.map((step, index) => `${index + 1}. ${step}`)
    : ["1. Recreate this browser workflow from the current page context, using observed controls and normal safety checks."];
  return [`Reusable browser workflow: ${input.name}`, `Purpose: ${input.description}`, "Steps:", ...steps].join("\n");
}

function sanitizeSkillSource(value: unknown): SkillPackageSource {
  const source = String(value ?? "").trim();
  return SKILL_SOURCES.has(source as SkillPackageSource) ? (source as SkillPackageSource) : "recorded_workflow";
}

function timestampField(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  return Math.round(value);
}
