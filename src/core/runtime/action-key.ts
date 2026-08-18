export interface ActionKeyCommand {
  type?: unknown;
  targetGoal?: unknown;
  inputs?: unknown;
}

function normalizedActionPart(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function commandInputs(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function commandActionKey(command: ActionKeyCommand): string {
  const inputs = commandInputs(command.inputs);
  const inputRef = inputs.controlId ?? inputs.semanticId ?? inputs.controlRef ?? inputs.url ?? inputs.href ?? inputs.key ?? "";
  const valueRef = command.type === "FillField" || command.type === "SelectOption" ? inputs.value ?? inputs.option ?? "" : "";
  return [command.type, command.targetGoal, inputRef, valueRef].map(normalizedActionPart).filter(Boolean).join(":");
}

export function commandActionKeyFromUnknown(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.type !== "string") return undefined;
  return commandActionKey({
    type: record.type,
    targetGoal: record.targetGoal,
    inputs: record.inputs
  });
}
