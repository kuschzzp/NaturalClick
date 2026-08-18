import type { AgentEvent } from "../core/events/events";
import type { SidepanelLocale } from "./i18n";

export type RuntimeIssueKind =
  | "model_contract"
  | "model_api"
  | "observation_binding"
  | "execution_verification"
  | "permission_policy"
  | "runtime_budget"
  | "runtime_performance"
  | "overlay_interference";

export interface RuntimeIssue {
  kind: RuntimeIssueKind;
  label: string;
  suggestion: string;
  reason?: string;
}

function stringPayload(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function nestedString(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = (value as Record<string, unknown>)[key];
  return typeof item === "string" && item.trim() ? item : undefined;
}

function issueCopy(kind: RuntimeIssueKind, locale?: SidepanelLocale): Pick<RuntimeIssue, "label" | "suggestion"> {
  const zh = locale === "zh-CN";
  const copy: Record<RuntimeIssueKind, Pick<RuntimeIssue, "label" | "suggestion">> = zh
    ? {
        model_contract: {
          label: "模型契约",
          suggestion: "模型输出不符合 Agent JSON 契约，优先检查 Planner 提示词、schema 兼容性和契约修复日志。"
        },
        model_api: {
          label: "模型调用",
          suggestion: "模型接口调用失败，优先检查 API、模型名、Key、网络和 provider 返回内容。"
        },
        observation_binding: {
          label: "页面观察/目标绑定",
          suggestion: "页面候选目标不足或目标已变化，优先扩大观察范围、检查元素标记和目标文本。"
        },
        execution_verification: {
          label: "执行/结果校验",
          suggestion: "动作已下发但页面结果未达预期，优先检查执行器、目标是否可交互和校验条件。"
        },
        permission_policy: {
          label: "权限策略",
          suggestion: "动作被安全策略拦截，优先检查执行权限配置或让用户确认高风险动作。"
        },
        runtime_budget: {
          label: "运行预算",
          suggestion: "任务达到步数、时长、观察或模型调用预算，可调整执行控制参数后继续。"
        },
        runtime_performance: {
          label: "运行速度",
          suggestion: "模型调用或页面观察较慢，请检查 provider、切换模型，或下载日志定位慢步骤。"
        },
        overlay_interference: {
          label: "页面标记干扰",
          suggestion: "关闭页面标记后重试视觉任务，避免调试标记进入截图。"
        }
      }
    : {
        model_contract: {
          label: "Model contract",
          suggestion: "Planner output did not match the Agent JSON contract. Check the planner prompt, schema compatibility, and contract repair trace."
        },
        model_api: {
          label: "Model call",
          suggestion: "The model API call failed. Check the API URL, model name, key, network, and provider response."
        },
        observation_binding: {
          label: "Observation / binding",
          suggestion: "The page candidates were insufficient or the target changed. Expand observation and inspect markers or target text."
        },
        execution_verification: {
          label: "Execution / verification",
          suggestion: "The action ran but the page did not reach the expected state. Check executor behavior, interactability, and success criteria."
        },
        permission_policy: {
          label: "Permission policy",
          suggestion: "The safety policy blocked the action. Check permission mode or ask the user to confirm risky actions."
        },
        runtime_budget: {
          label: "Runtime budget",
          suggestion: "The task hit a step, duration, observation, or model-call budget. Tune execution controls before continuing."
        },
        runtime_performance: {
          label: "Runtime speed",
          suggestion: "Model calls or page observation are slow. Check the provider, switch models, or download the log to inspect slow steps."
        },
        overlay_interference: {
          label: "Page marker interference",
          suggestion: "Turn off page markers and retry the vision task so debug overlays do not enter screenshots."
        }
      };
  return copy[kind];
}

function kindFromReason(reason?: string): RuntimeIssueKind | undefined {
  if (!reason) return undefined;
  if (reason === "invalid_contract" || reason.includes("contract")) return "model_contract";
  if (reason.startsWith("planner_") || reason === "model_settings_missing") return "model_api";
  if (["target_not_found", "target_not_interactable", "needs_more_observation", "ambiguous_target"].includes(reason)) {
    return "observation_binding";
  }
  if (["element_not_found", "control_not_found", "verification_failed"].includes(reason) || reason.includes("verification")) {
    return "execution_verification";
  }
  if (reason === "block" || reason === "hard_block" || reason === "policy_ask_user" || reason.includes("policy")) {
    return "permission_policy";
  }
  if (reason.startsWith("max_")) return "runtime_budget";
  if (reason === "slow_model_call" || reason === "slow_observation" || reason.includes("slow_")) return "runtime_performance";
  if (reason === "overlay_active_during_vision") return "overlay_interference";
  return undefined;
}

export function classifyRuntimeIssue(event: AgentEvent, locale?: SidepanelLocale): RuntimeIssue | undefined {
  let kind: RuntimeIssueKind | undefined;
  let reason = stringPayload(event.payload, "reason") ?? stringPayload(event.payload, "failureReason") ?? stringPayload(event.payload, "bindingError");

  if (event.type === "ModelContractViolation") {
    kind = "model_contract";
    reason ??= "invalid_contract";
  } else if (event.type === "ModelCallFailed") {
    kind = "model_api";
  } else if (event.type === "RuntimeSuspended") {
    kind = "runtime_budget";
  } else if (
    (event.type === "ModelCallCompleted" && typeof event.payload.durationMs === "number" && event.payload.durationMs > 8000) ||
    (event.type === "ObservationReceived" && typeof event.payload.durationMs === "number" && event.payload.durationMs > 1200)
  ) {
    kind = "runtime_performance";
    reason ??= event.type === "ModelCallCompleted" ? "slow_model_call" : "slow_observation";
  } else if (
    (event.type === "ScreenshotCaptured" || event.type === "VisionRequested") &&
    (reason === "overlay_active_during_vision" || event.payload.overlayActive === true || event.payload.debugOverlayActive === true || (typeof event.payload.overlayMode === "string" && event.payload.overlayMode !== "Off"))
  ) {
    kind = "overlay_interference";
    reason ??= "overlay_active_during_vision";
  } else if (event.type === "RecoverySuggested") {
    const recoveryReason = stringPayload(event.payload, "reason");
    const bindingError = stringPayload(event.payload, "bindingError");
    reason = bindingError ?? reason;
    if (recoveryReason === "model_contract_repair") kind = "model_contract";
    else if (recoveryReason === "bind_failed_replan" || recoveryReason === "retry_rebind_failed" || recoveryReason === "retry_after_reobserve") kind = "observation_binding";
  } else if (event.type === "CommandResultReceived") {
    const result = event.payload.result;
    const status = nestedString(result, "status");
    if (status === "failed") {
      kind = "execution_verification";
      reason ??= nestedString(result, "reason");
    }
  } else if (event.type === "VerificationProduced" && event.payload.status === "failed") {
    kind = "execution_verification";
  } else if (event.type === "TaskFailed") {
    kind = kindFromReason(reason);
  }

  kind ??= kindFromReason(reason);
  if (!kind) return undefined;
  return { kind, reason, ...issueCopy(kind, locale) };
}

export function formatRuntimeIssue(issue: RuntimeIssue, locale?: SidepanelLocale): string {
  const reason = issue.reason ? (locale === "zh-CN" ? `原因：${issue.reason}` : `Reason: ${issue.reason}`) : undefined;
  return [issue.label, issue.suggestion, reason].filter(Boolean).join(" · ");
}
