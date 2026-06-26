import type { GlobalModelConfig, ModelRole } from "./config";

export interface ResolvedRoleModel {
  role: ModelRole;
  model: string;
  useModel: "always" | "when_triggered" | "only_when_inconclusive" | "only_when_requested_or_complex";
}

export function resolveRoleModel(config: GlobalModelConfig, role: ModelRole): ResolvedRoleModel | undefined {
  if (role === "planner") {
    return { role, model: config.roleModels.plannerModel, useModel: "always" };
  }
  if (role === "vision") {
    return config.roleModels.visionModel
      ? { role, model: config.roleModels.visionModel, useModel: "when_triggered" }
      : undefined;
  }
  if (role === "verifier") {
    return {
      role,
      model: config.roleModels.verifierModel ?? config.roleModels.plannerModel,
      useModel: "only_when_inconclusive"
    };
  }
  return {
    role,
    model: config.roleModels.summarizerModel ?? config.roleModels.plannerModel,
    useModel: "only_when_requested_or_complex"
  };
}
