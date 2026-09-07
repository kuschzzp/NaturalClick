import type { AgentEvent } from "../core/events/events";
import { isContinuableLimitReason } from "../core/runtime/execution-budget";
import type { SidepanelLocale } from "./i18n";

export type RuntimeIssueKind =
  | "model_contract"
  | "model_api"
  | "observation_binding"
  | "execution_verification"
  | "permission_policy"
  | "runtime_budget"
  | "task_target"
  | "runtime_performance"
  | "overlay_interference";

export interface RuntimeIssue {
  kind: RuntimeIssueKind;
  label: string;
  suggestion: string;
  reason?: string;
  budgetMultiplier?: number;
  nextBudgetMultiplier?: number;
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

function numericPayload(payload: Record<string, unknown>, key: string): number | undefined {
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value) && value >= 1 ? value : undefined;
}

function plannerReasonCopy(reason: string | undefined, locale?: SidepanelLocale): Pick<RuntimeIssue, "label" | "suggestion"> | undefined {
  if (!reason) return undefined;
  const zh = locale === "zh-CN";
  const copy: Record<string, { zh: Pick<RuntimeIssue, "label" | "suggestion">; en: Pick<RuntimeIssue, "label" | "suggestion"> }> = {
    planner_output_truncated: {
      zh: { label: "模型输出被截断", suggestion: "Planner 已自动扩大输出预算重试。仍失败时，请提高模型输出上限或换用支持更长输出的模型。" },
      en: { label: "Model output truncated", suggestion: "The Planner already retried with a larger output budget. Increase the output limit or use a model that supports longer outputs." }
    },
    planner_empty_output: {
      zh: { label: "模型返回空内容", suggestion: "Planner 已自动改用非流式请求重试。请检查所选模型是否支持当前协议，或切换 API 协议后重试。" },
      en: { label: "Empty model output", suggestion: "The Planner already retried without streaming. Check whether the model supports the selected protocol, or switch API protocol and retry." }
    },
    planner_schema_violation: {
      zh: { label: "Planner 结构不匹配", suggestion: "模型返回内容不符合 Planner Schema。系统会自动修复一次；可改用支持 Structured Outputs 的模型提升稳定性。" },
      en: { label: "Planner schema mismatch", suggestion: "The model output did not match the Planner schema. One repair is automatic; a model with Structured Outputs will be more reliable." }
    },
    planner_returned_non_json: {
      zh: { label: "Planner 返回非 JSON", suggestion: "当前模型没有遵守 Planner 输出契约。请优先使用 Responses API 或支持 JSON Schema 的 Chat Completions 模型。" },
      en: { label: "Planner returned non-JSON", suggestion: "The model ignored the Planner contract. Prefer Responses API or a Chat Completions model with JSON Schema support." }
    },
    planner_refused: {
      zh: { label: "模型拒绝执行", suggestion: "模型明确拒绝了这次 Planner 请求。请调整任务表达、模型安全设置，或切换模型后重试。" },
      en: { label: "Model refused the request", suggestion: "The model explicitly refused this Planner request. Adjust the task or safety settings, or switch models and retry." }
    },
    planner_tool_arguments_invalid: {
      zh: { label: "工具参数无效", suggestion: "模型生成的工具参数不是有效 JSON。系统会把错误反馈给模型；重复失败时请关闭原生工具或切换支持严格工具调用的模型。" },
      en: { label: "Invalid tool arguments", suggestion: "The model produced invalid JSON tool arguments. Repeated failures may require disabling native tools or using a model with strict tool calling." }
    },
    planner_provider_protocol_error: {
      zh: { label: "模型协议不兼容", suggestion: "Provider 没有按所选协议返回有效响应。请在模型配置中改用自动检测，或固定为 Provider 实际支持的协议。" },
      en: { label: "Model protocol mismatch", suggestion: "The provider did not return a valid response for the selected protocol. Use Auto detect or select the protocol the provider actually supports." }
    },
    planner_transport_timeout: {
      zh: { label: "模型调用超时", suggestion: "请求在 Planner 时限内没有完成。请检查网络和 Provider 延迟，或切换更快的模型后重新执行。" },
      en: { label: "Model request timed out", suggestion: "The request exceeded the Planner timeout. Check network and provider latency, or switch to a faster model and retry." }
    },
    planner_first_token_timeout: {
      zh: { label: "等待模型响应超时", suggestion: "连接建立后长时间没有收到模型输出。请检查 Provider 排队、网关流式转发和当前模型的首 Token 延迟。" },
      en: { label: "First model response timed out", suggestion: "No model output arrived in time. Check provider queueing, gateway streaming, and first-token latency for the selected model." }
    },
    planner_stream_idle_timeout: {
      zh: { label: "模型流式响应中断", suggestion: "模型曾返回数据，但随后长时间没有新内容。请检查 SSE 转发、代理缓冲或 Provider 流式连接稳定性。" },
      en: { label: "Model stream became idle", suggestion: "The model returned data and then stopped. Check SSE forwarding, proxy buffering, and provider stream stability." }
    },
    planner_request_timeout: {
      zh: { label: "单次模型请求超时", suggestion: "本次模型请求超过硬上限。请缩短输入上下文、切换更快的模型，或检查 Provider 的长请求限制。" },
      en: { label: "Model request limit reached", suggestion: "This request exceeded its hard limit. Reduce input context, use a faster model, or check the provider's long-request limits." }
    },
    planner_total_budget_exhausted: {
      zh: { label: "Planner 总时间预算耗尽", suggestion: "协议探测、重试、工具调用和格式修复的累计时间已达上限。请查看执行明细定位最慢阶段后重新执行。" },
      en: { label: "Planner time budget exhausted", suggestion: "Protocol negotiation, retries, tools, and repair exhausted the total budget. Inspect the slowest stage in execution details before retrying." }
    },
    planner_repair_exhausted: {
      zh: { label: "Planner 修复失败", suggestion: "原始输出与自动修复结果都不符合契约。请切换到支持 Structured Outputs 的模型或检查兼容服务的 JSON Schema 实现。" },
      en: { label: "Planner repair failed", suggestion: "Both the original output and automatic repair violated the contract. Use a Structured Outputs model or inspect the provider's JSON Schema support." }
    }
  };
  const matched = copy[reason === "invalid_contract" ? "planner_schema_violation" : reason];
  return matched ? matched[zh ? "zh" : "en"] : undefined;
}

function issueCopy(kind: RuntimeIssueKind, locale?: SidepanelLocale, reason?: string): Pick<RuntimeIssue, "label" | "suggestion"> {
  const plannerCopy = plannerReasonCopy(reason, locale);
  if (plannerCopy) return plannerCopy;
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
        task_target: {
          label: "任务页面",
          suggestion: "任务页面已关闭。请打开要继续操作的页面，然后点击继续，任务会绑定到当前标签。"
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
        task_target: {
          label: "Task page",
          suggestion: "The task page was closed. Open the page you want to continue on, then resume to bind the task to the current tab."
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
  if (
    reason === "invalid_contract" ||
    reason === "planner_schema_violation" ||
    reason === "planner_returned_non_json" ||
    reason === "planner_tool_arguments_invalid" ||
    reason === "planner_repair_exhausted" ||
    reason.includes("contract")
  ) return "model_contract";
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
  if (reason === "task_tab_closed" || reason === "task_tab_not_found") return "task_target";
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
    kind = reason === "task_tab_closed" || reason === "task_tab_not_found" ? "task_target" : "runtime_budget";
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
  return {
    kind,
    reason,
    ...(event.type === "RuntimeSuspended"
      ? {
          budgetMultiplier: numericPayload(event.payload, "budgetMultiplier"),
          nextBudgetMultiplier: numericPayload(event.payload, "nextBudgetMultiplier")
        }
      : {}),
    ...issueCopy(kind, locale, reason)
  };
}

export function formatRuntimeIssue(issue: RuntimeIssue, locale?: SidepanelLocale): string {
  const continuation =
    issue.kind === "runtime_budget" && isContinuableLimitReason(issue.reason) && issue.nextBudgetMultiplier
      ? locale === "zh-CN"
        ? `点击继续执行后，本会话的步数、时长、观察和模型调用预算将提升至 ${issue.nextBudgetMultiplier}×。`
        : `Continue to raise this session's step, duration, observation, and model-call budgets to ${issue.nextBudgetMultiplier}×.`
      : undefined;
  const reason = issue.reason ? (locale === "zh-CN" ? `原因：${issue.reason}` : `Reason: ${issue.reason}`) : undefined;
  return [issue.label, issue.suggestion, continuation, reason].filter(Boolean).join(" · ");
}
