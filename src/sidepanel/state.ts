import type { AgentEvent, AgentEventType } from "../core/events/events";

export type SidepanelMode = "conversation" | "workbench";
export type OverlayMode = "Off" | "Focus" | "All Targets" | "Evidence" | "Vision";
export type SidepanelSafetyMode = "conservative" | "balanced" | "autonomous" | "experimental_full_auto";
export type FlowNodeId = "start" | "intent" | "observe" | "route" | "plan" | "act" | "verify" | "reply";
export type RuntimeFlowNodeStatus = "done" | "active" | "waiting" | "blocked";

export interface RuntimeFlowNode {
  id: FlowNodeId;
  label: string;
  shortLabel: string;
  description: string;
  status: RuntimeFlowNodeStatus;
}

export interface ActiveTaskState {
  taskId: string;
  status: string;
  currentAction?: string;
  activeNodeId?: FlowNodeId;
  targetLabel?: string;
  expectedOutcome?: string;
  semanticTargetId?: string;
  bindingSource?: "DOM" | "Vision" | "DOM+Vision";
  riskLevel?: "low" | "medium" | "high" | "blocked";
}

export interface TimelineItem {
  id: string;
  title: string;
  detail?: string;
  tone?: "info" | "success" | "warning" | "error";
}

export interface SidepanelState {
  mode: SidepanelMode;
  overlayMode: OverlayMode;
  safetyMode: SidepanelSafetyMode;
  modelConfigured: boolean;
  activeTask?: ActiveTaskState;
  traceOpen: boolean;
  settingsOpen?: boolean;
  timeline?: TimelineItem[];
  decisionSummary?: string;
  evidenceSummary?: string[];
  traceSummary?: string[];
}

export const RUNTIME_FLOW: Array<Omit<RuntimeFlowNode, "status">> = [
  {
    id: "start",
    label: "开始",
    shortLabel: "开",
    description: "接收用户目标"
  },
  {
    id: "intent",
    label: "意图理解",
    shortLabel: "脑",
    description: "拆解任务和约束"
  },
  {
    id: "observe",
    label: "页面观察",
    shortLabel: "观",
    description: "DOM、截图、元素标号"
  },
  {
    id: "route",
    label: "路由判断",
    shortLabel: "判",
    description: "继续、追问或确认"
  },
  {
    id: "plan",
    label: "计划动作",
    shortLabel: "计",
    description: "生成下一条语义命令"
  },
  {
    id: "act",
    label: "Chrome 执行",
    shortLabel: "执",
    description: "执行页面动作"
  },
  {
    id: "verify",
    label: "结果校验",
    shortLabel: "验",
    description: "确认页面是否推进"
  },
  {
    id: "reply",
    label: "回复用户",
    shortLabel: "答",
    description: "输出结果和下一步"
  }
];

export function deriveSidepanelMode(state: SidepanelState): SidepanelMode {
  if (state.traceOpen) return "workbench";
  if (state.activeTask && !["completed", "failed", "stopped"].includes(state.activeTask.status)) return "workbench";
  return "conversation";
}

export function needsModelGuidance(state: SidepanelState): boolean {
  return !state.modelConfigured;
}

export function withDerivedMode(state: SidepanelState): SidepanelState {
  return { ...state, mode: deriveSidepanelMode(state) };
}

export function flowNodeForEventType(type: AgentEventType): FlowNodeId {
  switch (type) {
    case "TaskStarted":
      return "start";
    case "TaskInterpreted":
    case "PlanRequested":
    case "ModelCallStarted":
    case "ModelCallProgress":
    case "ModelCallCompleted":
    case "ModelCallFailed":
    case "ModelContractViolation":
      return "intent";
    case "ObservationRequested":
    case "ObservationReceived":
    case "EvidenceAdded":
    case "ScreenshotCaptured":
    case "VisionRequested":
    case "VisionCompleted":
    case "VisualEvidenceAdded":
      return "observe";
    case "PolicyEvaluated":
    case "UserConsentRequested":
    case "UserConsentResolved":
    case "RecoverySuggested":
      return "route";
    case "PlanProduced":
    case "CommandBound":
      return "plan";
    case "CommandIssued":
    case "CommandResultReceived":
      return "act";
    case "VerificationProduced":
    case "MemoryUpdated":
      return "verify";
    case "TaskCompleted":
    case "TaskFailed":
    case "TaskStopped":
    case "RuntimeSuspended":
    case "RuntimeResumed":
      return "reply";
  }
}

export function deriveActiveNodeId(state: SidepanelState): FlowNodeId | undefined {
  if (!state.activeTask) return undefined;
  if (state.activeTask.activeNodeId) return state.activeTask.activeNodeId;

  switch (state.activeTask.status) {
    case "completed":
    case "failed":
    case "stopped":
      return "reply";
    case "waiting":
    case "awaiting_confirmation":
    case "blocked":
      return "route";
    case "observing":
      return "observe";
    case "executing":
      return "act";
    case "verifying":
      return "verify";
    case "interpreting":
      return "intent";
    case "planning":
    case "running":
    default:
      return "plan";
  }
}

export function deriveRuntimeFlow(state: SidepanelState): RuntimeFlowNode[] {
  const activeNodeId = deriveActiveNodeId(state);
  const activeIndex = activeNodeId ? RUNTIME_FLOW.findIndex((node) => node.id === activeNodeId) : -1;
  const blocked = state.activeTask?.status === "failed" || state.activeTask?.status === "blocked";

  return RUNTIME_FLOW.map((node, index) => {
    let status: RuntimeFlowNodeStatus = "waiting";
    if (activeIndex >= 0 && index < activeIndex) status = "done";
    if (activeIndex >= 0 && index === activeIndex) status = blocked ? "blocked" : "active";
    return { ...node, status };
  });
}

function stringPayload(payload: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "boolean") return value ? "是" : "否";
    if (typeof value === "number") return String(value);
  }
  return undefined;
}

function eventTone(type: AgentEventType): TimelineItem["tone"] {
  if (type === "TaskCompleted" || type === "VerificationProduced") return "success";
  if (type === "TaskStopped" || type === "UserConsentRequested" || type === "RecoverySuggested") return "warning";
  if (type === "TaskFailed" || type === "ModelCallFailed" || type === "ModelContractViolation") return "error";
  return "info";
}

function eventTitle(type: AgentEventType): string {
  const titles: Record<AgentEventType, string> = {
    TaskStarted: "任务开始",
    TaskInterpreted: "理解用户目标",
    ObservationRequested: "正在观察页面",
    ObservationReceived: "页面观察完成",
    EvidenceAdded: "证据已更新",
    PlanRequested: "请求生成计划",
    PlanProduced: "计划已生成",
    CommandBound: "目标已绑定",
    PolicyEvaluated: "安全策略已评估",
    UserConsentRequested: "需要用户确认",
    UserConsentResolved: "确认结果已记录",
    CommandIssued: "正在执行动作",
    CommandResultReceived: "动作执行完成",
    VerificationProduced: "结果校验完成",
    MemoryUpdated: "会话记忆已更新",
    RecoverySuggested: "恢复策略已生成",
    TaskCompleted: "任务完成",
    TaskFailed: "任务失败",
    TaskStopped: "任务已停止",
    ModelCallStarted: "模型调用开始",
    ModelCallProgress: "模型正在输出",
    ModelCallCompleted: "模型调用完成",
    ModelCallFailed: "模型调用失败",
    RuntimeSuspended: "运行时已挂起",
    RuntimeResumed: "运行时已恢复",
    ModelContractViolation: "模型输出契约异常",
    ScreenshotCaptured: "截图已捕获",
    VisionRequested: "视觉识别中",
    VisionCompleted: "视觉识别完成",
    VisualEvidenceAdded: "视觉证据已更新"
  };
  return titles[type];
}

export function mapEventToTimelineItem(event: AgentEvent): TimelineItem {
  return {
    id: event.id,
    title: eventTitle(event.type),
    detail: stringPayload(event.payload, [
      "taskText",
      "instruction",
      "summary",
      "detail",
      "command",
      "commandName",
      "targetLabel",
      "expectedOutcome",
      "reason",
      "error"
    ]),
    tone: eventTone(event.type)
  };
}

function activeStatusForEvent(type: AgentEventType): string {
  if (type === "TaskCompleted") return "completed";
  if (type === "TaskFailed") return "failed";
  if (type === "TaskStopped") return "stopped";
  if (type === "UserConsentRequested") return "awaiting_confirmation";
  if (type === "ObservationRequested" || type === "ObservationReceived" || type === "VisionRequested") return "observing";
  if (type === "CommandIssued" || type === "CommandResultReceived") return "executing";
  if (type === "VerificationProduced") return "verifying";
  if (type === "TaskInterpreted" || type === "ModelCallStarted") return "interpreting";
  return "running";
}

export function deriveActiveTaskFromEvents(events: AgentEvent[]): ActiveTaskState | undefined {
  const latest = events.at(-1);
  if (!latest) return undefined;

  return {
    taskId: latest.taskId,
    status: activeStatusForEvent(latest.type),
    activeNodeId: flowNodeForEventType(latest.type),
    currentAction:
      stringPayload(latest.payload, ["currentAction", "taskText", "command", "commandName", "summary", "instruction"]) ??
      eventTitle(latest.type),
    targetLabel: stringPayload(latest.payload, ["targetLabel", "label", "semanticLabel", "elementLabel"]),
    expectedOutcome: stringPayload(latest.payload, ["expectedOutcome", "successCriteria", "outcome"]),
    semanticTargetId: stringPayload(latest.payload, ["semanticTargetId", "targetId", "id"]),
    bindingSource: latest.type.startsWith("Vision") || latest.type === "VisualEvidenceAdded" ? "Vision" : undefined,
    riskLevel: latest.type === "UserConsentRequested" ? "medium" : latest.type === "TaskFailed" ? "blocked" : undefined
  };
}
