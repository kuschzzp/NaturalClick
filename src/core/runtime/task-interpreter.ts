import type { SemanticCommandType } from "../commands/commands";

export interface TaskFrame {
  taskText: string;
  allowedCommandTypes: SemanticCommandType[];
  deniedCommandTypes: SemanticCommandType[];
  providedValues: Record<string, string>;
  initialProfile: "GeneralBrowsingProfile" | "LightFormProfile";
}

const defaultAllowed: SemanticCommandType[] = [
  "NavigateTo",
  "ActivateTarget",
  "FillField",
  "ScrollRegion",
  "ReadContent",
  "WaitForChange",
  "SelectOption"
];

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function extractProvidedValues(taskText: string): Record<string, string> {
  const values: Record<string, string> = {};
  const quotedPairs = taskText.matchAll(/\b(name|email|phone|address|title)\s+(?:to|as|is)\s+["']?([^"',.]+)["']?/gi);
  for (const match of quotedPairs) {
    values[match[1].toLowerCase()] = match[2].trim();
  }

  const email = taskText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  if (email) values.email = email;
  return values;
}

export function interpretTask(taskText: string): TaskFrame {
  const lowered = taskText.toLowerCase();
  const deniedCommandTypes: SemanticCommandType[] = [];
  const allowedCommandTypes = [...defaultAllowed];

  if (/\b(do not|don't|dont|without)\s+(submit|save|send|create|publish|confirm)\b/.test(lowered)) {
    deniedCommandTypes.push("SubmitCurrentForm");
  }

  if (/\b(submit|save|create|send|publish|confirm)\b/.test(lowered) && !deniedCommandTypes.includes("SubmitCurrentForm")) {
    allowedCommandTypes.push("SubmitCurrentForm");
  }

  const isFormTask = /\b(form|field|email|phone|address|input|fill|submit|save|create)\b/.test(lowered);

  return {
    taskText,
    allowedCommandTypes: unique(allowedCommandTypes),
    deniedCommandTypes: unique(deniedCommandTypes),
    providedValues: extractProvidedValues(taskText),
    initialProfile: isFormTask ? "LightFormProfile" : "GeneralBrowsingProfile"
  };
}
