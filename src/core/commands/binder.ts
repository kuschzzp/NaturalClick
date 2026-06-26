import type { ControlCandidate, ElementBounds, LocatorHint, PageModel } from "../observation/page-model";
import { err, ok, type Result } from "../../shared/result";
import type { BoundCommand, BrowserPrimitive, SemanticCommand } from "./commands";

export type BindingError =
  | "target_not_found"
  | "ambiguous_target"
  | "target_not_interactable"
  | "needs_more_observation"
  | "requires_user_choice";

export interface VisualCandidate {
  id?: string;
  label?: string;
  accessibleName?: string;
  role?: string;
  x?: number;
  y?: number;
  bounds?: ElementBounds;
  confidence: number;
  locatorHints?: LocatorHint[];
}

interface ScoredControl {
  control: ControlCandidate;
  score: number;
}

interface ScoredVisual {
  candidate: VisualCandidate;
  score: number;
  x: number;
  y: number;
}

const DOM_MATCH_THRESHOLD = 0.45;
const AMBIGUITY_MARGIN = 0.04;
const VISUAL_CONFIDENCE_THRESHOLD = 0.85;
const VISUAL_MATCH_THRESHOLD = 0.45;

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokens(value: string): string[] {
  const normalized = normalize(value);
  return normalized ? normalized.split(/\s+/) : [];
}

function textScore(goal: string, value?: string): number {
  if (!value) return 0;

  const goalText = normalize(goal);
  const candidateText = normalize(value);
  if (!goalText || !candidateText) return 0;
  if (goalText === candidateText) return 1;
  if (goalText.includes(candidateText) || candidateText.includes(goalText)) return 0.9;

  const goalTokens = new Set(tokens(goal));
  const candidateTokens = tokens(value);
  if (goalTokens.size === 0 || candidateTokens.length === 0) return 0;

  const overlap = candidateTokens.filter((token) => goalTokens.has(token)).length;
  if (overlap === 0) return 0;

  const candidateCoverage = overlap / candidateTokens.length;
  const goalCoverage = overlap / goalTokens.size;
  return candidateCoverage * 0.65 + goalCoverage * 0.35;
}

function roleScore(command: SemanticCommand, control: Pick<ControlCandidate, "role" | "interactionHints">): number {
  const role = control.role.toLowerCase();
  const hints = new Set(control.interactionHints.map((hint) => hint.toLowerCase()));
  const goalRoleScore = textScore(command.targetGoal, role);
  if (goalRoleScore > 0) return goalRoleScore;

  if (command.type === "FillField") {
    return role === "textbox" || role === "searchbox" || hints.has("editable") || hints.has("textarea") ? 0.9 : 0;
  }
  if (command.type === "SelectOption") {
    return role === "combobox" || role === "listbox" || role === "option" || hints.has("select") || hints.has("select-one") ? 0.9 : 0;
  }
  if (command.type === "SubmitCurrentForm") {
    return role === "button" || hints.has("submit") ? 0.85 : 0;
  }
  if (command.type === "ActivateTarget" || command.type === "NavigateTo") {
    return ["button", "link", "checkbox", "radio", "menuitem", "tab"].includes(role) ? 0.8 : 0;
  }

  return 0;
}

function locatorScore(goal: string, hints: LocatorHint[]): number {
  return hints.reduce((best, hint) => Math.max(best, textScore(goal, hint.value) * (hint.confidence ?? 0.65)), 0);
}

function scoreControl(command: SemanticCommand, control: ControlCandidate): number {
  const label = textScore(command.targetGoal, control.label);
  const accessibleName = textScore(command.targetGoal, control.accessibleName);
  const locator = locatorScore(command.targetGoal, control.locatorHints);
  const role = roleScore(command, control);
  const confidence = Math.max(0, Math.min(control.confidence, 1));

  return label * 0.42 + accessibleName * 0.25 + locator * 0.18 + role * 0.1 + confidence * 0.05;
}

function hasObservationEvidence(pageModel: PageModel): boolean {
  return (
    pageModel.controls.length > 0 ||
    pageModel.textBlocks.length > 0 ||
    pageModel.readableContent.length > 0 ||
    pageModel.feedback.length > 0
  );
}

function isInteractable(control: ControlCandidate): boolean {
  const hasUsableBounds = !control.bounds || (control.bounds.width > 0 && control.bounds.height > 0);
  return !control.disabled && control.visibility === "visible" && hasUsableBounds;
}

function inputValue(command: SemanticCommand): string {
  const value = command.inputs.value ?? command.inputs.text ?? command.inputs.input ?? "";
  return typeof value === "string" ? value : String(value);
}

function primitiveFor(command: SemanticCommand, semanticId: string): BrowserPrimitive {
  if (command.type === "FillField" || command.type === "SelectOption") {
    return { type: "dom_input", semanticId, value: inputValue(command) };
  }
  return { type: "dom_click", semanticId };
}

function directPrimitive(command: SemanticCommand): BoundCommand | undefined {
  if (command.type === "ScrollRegion") {
    const direction = command.inputs.direction === "up" ? "up" : "down";
    const amount = typeof command.inputs.amount === "number" ? Math.max(1, command.inputs.amount) : 600;
    return {
      semanticCommandId: command.id,
      primitive: { type: "scroll", direction, amount },
      confidence: 0.95,
      alternatives: [],
      bindingEvidenceRefs: [],
      expiresOn: "step_end"
    };
  }

  if (command.type === "WaitForChange") {
    const milliseconds = typeof command.inputs.milliseconds === "number" ? Math.max(0, command.inputs.milliseconds) : 1000;
    return {
      semanticCommandId: command.id,
      primitive: { type: "wait", milliseconds },
      confidence: 0.95,
      alternatives: [],
      bindingEvidenceRefs: [],
      expiresOn: "step_end"
    };
  }

  return undefined;
}

function visualCoordinates(candidate: VisualCandidate): { x: number; y: number } | undefined {
  if (typeof candidate.x === "number" && typeof candidate.y === "number") {
    return { x: candidate.x, y: candidate.y };
  }
  if (candidate.bounds) {
    return {
      x: candidate.bounds.x + candidate.bounds.width / 2,
      y: candidate.bounds.y + candidate.bounds.height / 2
    };
  }
  return undefined;
}

function scoreVisual(command: SemanticCommand, candidate: VisualCandidate): ScoredVisual | undefined {
  const coordinates = visualCoordinates(candidate);
  if (!coordinates) return undefined;

  const label = textScore(command.targetGoal, candidate.label);
  const accessibleName = textScore(command.targetGoal, candidate.accessibleName);
  const role = textScore(command.targetGoal, candidate.role);
  const locator = locatorScore(command.targetGoal, candidate.locatorHints ?? []);
  const text = Math.max(label, accessibleName, role, locator);
  const confidence = Math.max(0, Math.min(candidate.confidence, 1));
  const score = text * 0.75 + confidence * 0.25;

  return { candidate, score, x: coordinates.x, y: coordinates.y };
}

function sortedDomMatches(command: SemanticCommand, pageModel: PageModel): ScoredControl[] {
  return pageModel.controls
    .map((control): ScoredControl => ({ control, score: scoreControl(command, control) }))
    .filter((candidate) => candidate.score >= DOM_MATCH_THRESHOLD)
    .sort((left, right) => right.score - left.score || right.control.confidence - left.control.confidence);
}

function sortedVisualMatches(command: SemanticCommand, visualCandidates: VisualCandidate[]): ScoredVisual[] {
  return visualCandidates
    .map((candidate) => scoreVisual(command, candidate))
    .filter((candidate): candidate is ScoredVisual => Boolean(candidate))
    .filter(
      (candidate) => candidate.candidate.confidence > VISUAL_CONFIDENCE_THRESHOLD && candidate.score >= VISUAL_MATCH_THRESHOLD
    )
    .sort((left, right) => right.score - left.score || right.candidate.confidence - left.candidate.confidence);
}

export function bindCommand(
  command: SemanticCommand,
  pageModel: PageModel,
  visualCandidates: VisualCandidate[] = []
): Result<BoundCommand, BindingError> {
  if (command.type === "AskUser") {
    return err("requires_user_choice", "Command requires an explicit user choice before binding.");
  }

  const direct = directPrimitive(command);
  if (direct) return ok(direct);

  const domMatches = sortedDomMatches(command, pageModel);
  const interactableMatches = domMatches.filter((candidate) => isInteractable(candidate.control));

  if (interactableMatches.length > 0) {
    const [best, second] = interactableMatches;
    if (second && best.score - second.score <= AMBIGUITY_MARGIN) {
      return err("ambiguous_target", `Multiple controls match "${command.targetGoal}" with similar confidence.`);
    }

    const alternatives = interactableMatches.slice(1).map((candidate) => candidate.control.semanticId);
    return ok({
      semanticCommandId: command.id,
      targetRef: best.control.semanticId,
      primitive: primitiveFor(command, best.control.semanticId),
      confidence: Math.max(0, Math.min(best.score, 0.99)),
      alternatives,
      bindingEvidenceRefs: [
        best.control.semanticId,
        ...best.control.locatorHints.map((hint) => `${hint.kind}:${hint.value}`)
      ],
      expiresOn: "navigation"
    });
  }

  if (domMatches.length > 0) {
    return err("target_not_interactable", `Matched target "${command.targetGoal}" is disabled, hidden, or has unusable bounds.`);
  }

  const visualMatches = sortedVisualMatches(command, visualCandidates);
  if (visualMatches.length > 0) {
    const [best, second] = visualMatches;
    if (second && best.score - second.score <= AMBIGUITY_MARGIN) {
      return err("ambiguous_target", `Multiple visual targets match "${command.targetGoal}" with similar confidence.`);
    }

    return ok({
      semanticCommandId: command.id,
      targetRef: best.candidate.id,
      primitive: { type: "coordinate_click", x: best.x, y: best.y },
      confidence: Math.max(0, Math.min(best.score, 0.99)),
      alternatives: visualMatches.slice(1).map((candidate) => candidate.candidate.id ?? "visual_candidate"),
      bindingEvidenceRefs: [best.candidate.id ?? "visual_candidate"],
      expiresOn: "step_end"
    });
  }

  if (!hasObservationEvidence(pageModel)) {
    return err("needs_more_observation", `No observation evidence is available to bind "${command.targetGoal}".`);
  }

  return err("target_not_found", `No observed target matches "${command.targetGoal}".`);
}
