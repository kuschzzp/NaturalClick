import {
  sanitizeRecordedWorkflowDraft,
  sanitizeSkillId,
  sanitizeSkillPackage,
  skillSummary,
  type RecordedWorkflowDraft,
  type SkillPackageDetail,
  type SkillPackageSummary
} from "../../core/capabilities/skills";

const SKILL_STORE_KEY = "naturalclick.skills.v1";

async function loadSkills(): Promise<SkillPackageDetail[]> {
  const stored = await chrome.storage.local.get(SKILL_STORE_KEY);
  const value = stored[SKILL_STORE_KEY];
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const skill = sanitizeSkillPackage(item);
    return skill ? [skill] : [];
  });
}

export class ChromeSkillStore {
  async listSkills(): Promise<SkillPackageSummary[]> {
    return (await loadSkills())
      .filter((skill) => skill.enabled)
      .sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))
      .map(skillSummary);
  }

  async loadSkill(skillId: string): Promise<SkillPackageDetail | undefined> {
    const id = sanitizeSkillId(skillId);
    if (!id) return undefined;
    return (await loadSkills()).find((skill) => skill.id === id && skill.enabled);
  }

  async saveRecordedWorkflow(draft: RecordedWorkflowDraft): Promise<SkillPackageDetail> {
    const normalized = sanitizeRecordedWorkflowDraft(draft);
    if (!normalized) throw new Error("invalid_recorded_workflow");
    const skills = await loadSkills();
    const index = skills.findIndex((skill) => skill.id === normalized.id);
    const next = [...skills];
    if (index >= 0) {
      next[index] = { ...normalized, createdAt: skills[index].createdAt ?? normalized.createdAt };
    } else {
      next.push(normalized);
    }
    await chrome.storage.local.set({ [SKILL_STORE_KEY]: next });
    return index >= 0 ? next[index] : normalized;
  }

  async clear(): Promise<void> {
    await chrome.storage.local.set({ [SKILL_STORE_KEY]: [] });
  }
}
