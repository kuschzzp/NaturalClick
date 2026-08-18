export type SemanticCommandType =
  | "NavigateTo"
  | "ActivateTarget"
  | "FillField"
  | "ScrollRegion"
  | "ReadContent"
  | "OpenTab"
  | "SwitchTab"
  | "BrowserNavigation"
  | "PressKey"
  | "WaitForChange"
  | "AskUser"
  | "FinishTask"
  | "SelectOption"
  | "SubmitCurrentForm";

export interface SemanticCommand {
  id: string;
  type: SemanticCommandType;
  targetGoal: string;
  inputs: Record<string, unknown>;
  expectedOutcome: string;
  successCriteria: string[];
  riskHint: "low" | "medium" | "high";
  fallbackHints: string[];
}

export type BrowserPrimitive =
  | { type: "navigate"; url: string }
  | { type: "open_tab"; url: string; active?: boolean }
  | { type: "history"; action: "back" | "forward" | "reload" }
  | { type: "key_press"; key: string }
  | { type: "dom_click"; semanticId: string }
  | { type: "dom_input"; semanticId: string; value: string }
  | { type: "dom_select_option"; semanticId: string; value: string }
  | { type: "read_content"; semanticId?: string; query?: string }
  | { type: "scroll"; direction: "up" | "down"; amount: number }
  | { type: "wait"; milliseconds: number }
  | { type: "capture_screenshot" }
  | { type: "coordinate_click"; x: number; y: number };

export interface BoundCommand {
  semanticCommandId: string;
  targetRef?: string;
  primitive: BrowserPrimitive;
  confidence: number;
  alternatives: string[];
  bindingEvidenceRefs: string[];
  expiresOn: "navigation" | "reload" | "step_end";
}

export interface PrimitiveResult {
  status: "success" | "failed";
  reason?: string;
  details: Record<string, unknown>;
}
