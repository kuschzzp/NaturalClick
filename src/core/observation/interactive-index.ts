export interface InteractiveElementRecord {
  frameId: number;
  handle: string;
  tag: string;
  role: string;
  label: string;
  text: string;
  region?: string;
  visibility?: "visible" | "hidden";
  disabled?: boolean;
  focused?: boolean;
  expanded?: boolean;
  confidence?: number;
}

export function renderInteractiveIndex(records: InteractiveElementRecord[]): string {
  return sortInteractiveRecords(records)
    .map(
      (record, index) =>
        `<interactive index="${index + 1}" frame_id="${record.frameId}" handle="${xml(record.handle)}" tag="${xml(record.tag)}" role="${xml(record.role)}" label="${xml(record.label)}"${record.region ? ` region="${xml(record.region)}"` : ""}${record.visibility ? ` visibility="${record.visibility}"` : ""}${record.disabled ? ` disabled="true"` : ""}${record.focused ? ` focused="true"` : ""}${record.expanded !== undefined ? ` expanded="${record.expanded}"` : ""}>${xml(record.text)}</interactive>`
    )
    .join("\n");
}

export function sortInteractiveRecords(records: InteractiveElementRecord[]): InteractiveElementRecord[] {
  return [...records].sort((left, right) => priorityFor(left) - priorityFor(right) || (right.confidence ?? 0) - (left.confidence ?? 0));
}

function priorityFor(record: InteractiveElementRecord): number {
  const role = record.role.toLowerCase();
  const tag = record.tag.toLowerCase();
  if (role === "textbox" || role === "searchbox" || tag === "input" || tag === "textarea") return 0;
  if (["button", "menuitem", "tab", "combobox", "checkbox", "radio", "switch", "option"].includes(role)) return 1;
  if (role === "link" || tag === "a") return 2;
  return 3;
}

function xml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char] ?? char);
}
