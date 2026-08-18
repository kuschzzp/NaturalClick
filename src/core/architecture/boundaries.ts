export type OpaqueId<T extends string> = string & { readonly __opaqueType: T };

export const runtimeAbortReasons = [
  "user_stop",
  "panel_disconnect",
  "service_worker_restart",
  "new_task_replaced_previous",
  "cdp_detached",
  "budget_exceeded"
] as const;

export type RuntimeAbortReason = (typeof runtimeAbortReasons)[number];

export function isRuntimeAbortReason(value: unknown): value is RuntimeAbortReason {
  return typeof value === "string" && (runtimeAbortReasons as readonly string[]).includes(value);
}
