import type { ControlCandidate, ElementBounds, LocatorHint, PageModel, TextBlock } from "../observation/page-model";
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

export interface BindingCandidateHint {
  semanticId?: string;
  label?: string;
  accessibleName?: string;
  role?: string;
  regionRef?: string;
  visibility?: string;
  expandedState?: string;
  score: number;
  confidence: number;
}

export interface BindingFailureDetails {
  candidates?: BindingCandidateHint[];
}

interface ScoredControl {
  control: ControlCandidate;
  score: number;
  rank: ControlRank;
}

type ControlRank = [number, number, number, number, number, number];

interface ScoredVisual {
  candidate: VisualCandidate;
  score: number;
  x: number;
  y: number;
}

interface ScoredTextBlock {
  block: TextBlock;
  score: number;
}

const DOM_MATCH_THRESHOLD = 0.45;
const AMBIGUITY_MARGIN = 0.04;
const VISUAL_CONFIDENCE_THRESHOLD = 0.85;
const VISUAL_MATCH_THRESHOLD = 0.45;

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function tokens(value: string): string[] {
  const normalized = normalize(value);
  return normalized ? normalized.split(/\s+/) : [];
}

function stringInput(command: SemanticCommand, key: string): string | undefined {
  const value = command.inputs[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    unique.push(trimmed);
  }
  return unique;
}

function targetPhrases(command: SemanticCommand): string[] {
  return uniqueStrings([
    stringInput(command, "label"),
    stringInput(command, "targetLabel"),
    stringInput(command, "name"),
    stringInput(command, "title"),
    stringInput(command, "ariaLabel"),
    stringInput(command, "accessibleName"),
    stringInput(command, "placeholder"),
    command.type === "FillField" || command.type === "SelectOption" ? undefined : stringInput(command, "text"),
    command.targetGoal
  ]);
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

function bestTextScore(phrases: string[], value?: string): number {
  return phrases.reduce((best, phrase) => Math.max(best, textScore(phrase, value)), 0);
}

function roleScore(command: SemanticCommand, control: Pick<ControlCandidate, "role" | "interactionHints">, phrases: string[]): number {
  const role = control.role.toLowerCase();
  const hints = new Set(control.interactionHints.map((hint) => hint.toLowerCase()));
  const goalRoleScore = bestTextScore(phrases, role);
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
    return ["button", "link", "checkbox", "radio", "switch", "menuitem", "listitem", "tab"].includes(role) ? 0.8 : 0;
  }

  return 0;
}

function locatorScore(phrases: string[], hints: LocatorHint[]): number {
  return hints.reduce((best, hint) => Math.max(best, bestTextScore(phrases, hint.value) * (hint.confidence ?? 0.65)), 0);
}

function scoreControl(command: SemanticCommand, control: ControlCandidate): number {
  const phrases = targetPhrases(command);
  const label = bestTextScore(phrases, control.label);
  const accessibleName = bestTextScore(phrases, control.accessibleName);
  const locator = locatorScore(phrases, control.locatorHints);
  const role = roleScore(command, control, phrases);
  const region = regionScore(command, control);
  const confidence = Math.max(0, Math.min(control.confidence, 1));

  return label * 0.42 + accessibleName * 0.25 + locator * 0.18 + role * 0.1 + confidence * 0.05 + region * 0.06;
}

function scoreTextBlock(command: SemanticCommand, block: TextBlock): number {
  const phrases = targetPhrases(command);
  const text = bestTextScore(phrases, block.text);
  const role = block.role ? bestTextScore(phrases, block.role) : 0;
  const kind = bestTextScore(phrases, block.kind);
  const locator = locatorScore(phrases, block.locatorHints);
  const region = block.regionRef ? bestTextScore(phrases, block.regionRef) * 0.35 : 0;
  const confidence = Math.max(0, Math.min(block.confidence, 1));
  return text * 0.62 + locator * 0.16 + role * 0.08 + kind * 0.06 + region * 0.04 + confidence * 0.04;
}

function controlRank(command: SemanticCommand, control: ControlCandidate): ControlRank {
  const phrases = targetPhrases(command);
  return [
    bestExactTextRank(phrases, control),
    regionPriorityForCommand(command, control),
    rolePriority(control),
    clickPriority(control),
    expandedPriority(control),
    labelLength(control)
  ];
}

function compareRank(left: ControlRank, right: ControlRank): number {
  for (let index = 0; index < left.length; index += 1) {
    const delta = left[index] - right[index];
    if (delta !== 0) return delta;
  }
  return 0;
}

function sameAmbiguityRank(left: ControlRank, right: ControlRank): boolean {
  return compareRank(left, right) === 0;
}

function regionScore(command: SemanticCommand, control: Pick<ControlCandidate, "regionRef">): number {
  const region = control.regionRef?.toLowerCase();
  if (!region) return 0;

  if (command.type === "ActivateTarget" || command.type === "NavigateTo") {
    if (region === "sidebar" || region === "navigation") return 1;
    if (region === "dialog") return 0.4;
  }

  if (command.type === "FillField" || command.type === "SelectOption" || command.type === "SubmitCurrentForm") {
    if (region === "form") return 0.5;
    if (region === "dialog") return 0.35;
  }

  return 0;
}

function regionPriorityForCommand(command: SemanticCommand, control: Pick<ControlCandidate, "regionRef">): number {
  const region = control.regionRef?.toLowerCase();
  if (command.type === "FillField" || command.type === "SelectOption" || command.type === "SubmitCurrentForm") {
    if (region === "form") return 0;
    if (region === "dialog") return 1;
    if (region === "main_content") return 2;
    return 3;
  }
  if (command.type === "ActivateTarget" || command.type === "NavigateTo") {
    if (region === "dialog") return 0;
    if (region === "sidebar" || region === "navigation") return 1;
    if (region === "main_content") return 2;
    return 3;
  }
  return 2;
}

function clickPriority(control: Pick<ControlCandidate, "clickablePoint" | "occlusion" | "bounds">): number {
  if (control.clickablePoint && control.occlusion === "clear") return 0;
  if (control.clickablePoint && (!control.occlusion || control.occlusion === "unknown")) return 1;
  if (control.clickablePoint && control.occlusion === "covered") return 2;
  if (control.bounds && control.bounds.width > 0 && control.bounds.height > 0) return 3;
  return 4;
}

function expandedPriority(control: Pick<ControlCandidate, "expandedState">): number {
  if (control.expandedState === "collapsed") return 0;
  if (control.expandedState === "expanded") return 1;
  return 2;
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
  const hasAddressableLocator = control.locatorHints.some((hint) => hint.kind !== "role") || Boolean(control.label || control.accessibleName);
  return !control.disabled && control.visibility === "visible" && (hasUsableBounds || hasAddressableLocator);
}

function canActivateParentForHiddenChild(command: SemanticCommand): boolean {
  return command.type === "ActivateTarget" || command.type === "NavigateTo";
}

function visibleParentForHiddenTarget(command: SemanticCommand, pageModel: PageModel, control: ControlCandidate): ControlCandidate | undefined {
  if (!canActivateParentForHiddenChild(command) || !control.parentRef || control.visibility === "visible") return undefined;
  const parent = pageModel.controls.find((candidate) => candidate.semanticId === control.parentRef);
  return parent && isInteractable(parent) ? parent : undefined;
}

function inputValue(command: SemanticCommand): string {
  const value = command.inputs.value ?? command.inputs.text ?? command.inputs.input ?? "";
  return typeof value === "string" ? value : String(value);
}

function normalizeUrl(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[\w.-]+\.[a-z]{2,}([/?#].*)?$/i.test(trimmed)) return `https://${trimmed}`;
  return undefined;
}

function primitiveFor(command: SemanticCommand, semanticId: string): BrowserPrimitive {
  if (command.type === "ReadContent") {
    return { type: "read_content", semanticId, query: command.targetGoal };
  }
  if (command.type === "FillField") {
    return { type: "dom_input", semanticId, value: inputValue(command) };
  }
  if (command.type === "SelectOption") {
    return { type: "dom_select_option", semanticId, value: inputValue(command) };
  }
  return { type: "dom_click", semanticId };
}

function explicitTargetId(command: SemanticCommand): string | undefined {
  const candidates = [
    command.inputs.semanticId,
    command.inputs.controlId,
    command.inputs.targetRef,
    command.inputs.targetId,
    command.inputs.controlRef
  ];
  const match = candidates.find((value) => typeof value === "string" && value.trim());
  return typeof match === "string" ? match.trim() : undefined;
}

function bindExplicitTarget(command: SemanticCommand, pageModel: PageModel): Result<BoundCommand, BindingError> | undefined {
  const semanticId = explicitTargetId(command);
  if (!semanticId) return undefined;

  const control = pageModel.controls.find((candidate) => candidate.semanticId === semanticId);
  if (control) {
    const visibleParent = visibleParentForHiddenTarget(command, pageModel, control);
    if (visibleParent) {
      return ok(boundDomControl(command, visibleParent, 0.88, [control.semanticId]));
    }

    if (!isInteractable(control)) {
      return err("target_not_interactable", `Explicit target "${semanticId}" is disabled, hidden, or has unusable bounds.`);
    }

    return ok(boundDomControl(command, control, 0.98, []));
  }

  const textBlock = pageModel.textBlocks.find((block) => block.semanticId === semanticId);
  if (textBlock) return bindExplicitTextBlock(command, pageModel, textBlock);

  return err("target_not_found", `Explicit target "${semanticId}" was not found in the current observation.`);
}

function boundDomControl(command: SemanticCommand, control: ControlCandidate, confidence: number, alternatives: string[]): BoundCommand {
  return {
    semanticCommandId: command.id,
    targetRef: control.semanticId,
    primitive: primitiveFor(command, control.semanticId),
    confidence,
    alternatives,
    bindingEvidenceRefs: [
      control.semanticId,
      ...control.locatorHints.map((hint) => `${hint.kind}:${hint.value}`)
    ],
    expiresOn: "navigation"
  };
}

function bindExplicitTextBlock(command: SemanticCommand, pageModel: PageModel, textBlock: TextBlock): Result<BoundCommand, BindingError> {
  if (command.type === "FillField" || command.type === "SelectOption") {
    return err("target_not_interactable", `Explicit text target "${textBlock.semanticId}" cannot receive input.`);
  }
  if (textBlock.visibility !== "visible") {
    return err("target_not_interactable", `Explicit text target "${textBlock.semanticId}" is hidden.`);
  }

  if (command.type === "ReadContent") {
    return ok(boundTextBlock(command, textBlock, 0.96));
  }

  const relatedControl = bestControlForTextBlock(command, pageModel, textBlock);
  if (relatedControl) return ok(boundDomControl(command, relatedControl, 0.96, []));

  return ok({
    semanticCommandId: command.id,
    targetRef: textBlock.semanticId,
    primitive: primitiveFor(command, textBlock.semanticId),
    confidence: 0.93,
    alternatives: [],
    bindingEvidenceRefs: [
      textBlock.semanticId,
      ...textBlock.locatorHints.map((hint) => `${hint.kind}:${hint.value}`)
    ],
    expiresOn: "navigation"
  });
}

function boundTextBlock(command: SemanticCommand, textBlock: TextBlock, confidence: number): BoundCommand {
  return {
    semanticCommandId: command.id,
    targetRef: textBlock.semanticId,
    primitive: { type: "read_content", semanticId: textBlock.semanticId, query: command.targetGoal },
    confidence,
    alternatives: [],
    bindingEvidenceRefs: [
      textBlock.semanticId,
      ...textBlock.locatorHints.map((hint) => `${hint.kind}:${hint.value}`)
    ],
    expiresOn: "step_end"
  };
}

function bestControlForTextBlock(command: SemanticCommand, pageModel: PageModel, textBlock: TextBlock): ControlCandidate | undefined {
  const textCommand: SemanticCommand = {
    ...command,
    targetGoal: textBlock.text,
    inputs: { ...command.inputs, label: textBlock.text }
  };
  const matches = sortedDomMatches(textCommand, pageModel)
    .filter((candidate) => isInteractable(candidate.control))
    .map((candidate) => ({ ...candidate, exactness: exactTextRank(textBlock.text, candidate.control) }))
    .filter((candidate) => candidate.exactness < 3)
    .sort((left, right) => {
      const leftRegion = left.control.regionRef && left.control.regionRef === textBlock.regionRef ? 0 : 1;
      const rightRegion = right.control.regionRef && right.control.regionRef === textBlock.regionRef ? 0 : 1;
      return (
        left.exactness - right.exactness ||
        leftRegion - rightRegion ||
        rolePriority(left.control) - rolePriority(right.control) ||
        labelLength(left.control) - labelLength(right.control) ||
        right.score - left.score
      );
    });

  const [best, second] = matches;
  if (!best) return undefined;
  if (second && best.exactness === second.exactness && best.score - second.score <= AMBIGUITY_MARGIN) return undefined;
  return best.control;
}

function exactTextRank(text: string, control: ControlCandidate): number {
  const expected = normalize(text);
  const label = normalize(control.label);
  const accessibleName = normalize(control.accessibleName);
  const locatorExact = control.locatorHints.some((hint) => hint.kind === "text" && normalize(hint.value) === expected);
  if (label === expected || accessibleName === expected || locatorExact) return 0;
  if (label.startsWith(expected) || accessibleName.startsWith(expected)) return 1;
  if (label.includes(expected) || accessibleName.includes(expected)) return 2;
  return 3;
}

function bestExactTextRank(phrases: string[], control: ControlCandidate): number {
  return phrases.reduce((best, phrase) => Math.min(best, exactTextRank(phrase, control)), 3);
}

function rolePriority(control: ControlCandidate): number {
  const role = control.role.toLowerCase();
  if (role === "menuitem" || role === "link" || role === "button" || role === "tab") return 0;
  if (role === "listitem") return 1;
  return 2;
}

function labelLength(control: ControlCandidate): number {
  return normalize(control.label || control.accessibleName).length;
}

function shouldFallbackFromExplicitError(result: Result<BoundCommand, BindingError>): boolean {
  return !result.ok && (result.error === "target_not_found" || result.error === "target_not_interactable");
}

function directPrimitive(command: SemanticCommand): BoundCommand | undefined {
  if (command.type === "PressKey") {
    const key = stringInput(command, "key");
    if (!key) return undefined;
    return {
      semanticCommandId: command.id,
      primitive: { type: "key_press", key },
      confidence: 0.96,
      alternatives: [],
      bindingEvidenceRefs: [],
      expiresOn: "step_end"
    };
  }

  if (command.type === "BrowserNavigation") {
    const action = command.inputs.action;
    if (action !== "back" && action !== "forward" && action !== "reload") return undefined;
    return {
      semanticCommandId: command.id,
      primitive: { type: "history", action },
      confidence: 0.96,
      alternatives: [],
      bindingEvidenceRefs: [],
      expiresOn: "navigation"
    };
  }

  if (command.type === "OpenTab") {
    const url = normalizeUrl(String(command.inputs.url ?? command.inputs.href ?? command.targetGoal ?? ""));
    if (!url) return undefined;
    return {
      semanticCommandId: command.id,
      primitive: { type: "open_tab", url, active: command.inputs.active !== false },
      confidence: 0.96,
      alternatives: [],
      bindingEvidenceRefs: [],
      expiresOn: "navigation"
    };
  }

  if (command.type === "NavigateTo") {
    const url = normalizeUrl(String(command.inputs.url ?? command.inputs.href ?? command.targetGoal ?? ""));
    if (!url) return undefined;
    return {
      semanticCommandId: command.id,
      primitive: { type: "navigate", url },
      confidence: 0.96,
      alternatives: [],
      bindingEvidenceRefs: [],
      expiresOn: "navigation"
    };
  }

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

  const phrases = targetPhrases(command);
  const label = bestTextScore(phrases, candidate.label);
  const accessibleName = bestTextScore(phrases, candidate.accessibleName);
  const role = bestTextScore(phrases, candidate.role);
  const locator = locatorScore(phrases, candidate.locatorHints ?? []);
  const text = Math.max(label, accessibleName, role, locator);
  const confidence = Math.max(0, Math.min(candidate.confidence, 1));
  const score = text * 0.75 + confidence * 0.25;

  return { candidate, score, x: coordinates.x, y: coordinates.y };
}

function rounded(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function controlHint(candidate: ScoredControl): BindingCandidateHint {
  return {
    semanticId: candidate.control.semanticId,
    label: candidate.control.label || undefined,
    accessibleName: candidate.control.accessibleName || undefined,
    role: candidate.control.role,
    regionRef: candidate.control.regionRef,
    visibility: candidate.control.visibility,
    expandedState: candidate.control.expandedState,
    score: rounded(candidate.score),
    confidence: rounded(candidate.control.confidence)
  };
}

function visualHint(candidate: ScoredVisual): BindingCandidateHint {
  return {
    semanticId: candidate.candidate.id,
    label: candidate.candidate.label,
    accessibleName: candidate.candidate.accessibleName,
    role: candidate.candidate.role,
    score: rounded(candidate.score),
    confidence: rounded(candidate.candidate.confidence)
  };
}

function sortedDomMatches(command: SemanticCommand, pageModel: PageModel): ScoredControl[] {
  return pageModel.controls
    .map((control): ScoredControl => ({ control, score: scoreControl(command, control), rank: controlRank(command, control) }))
    .filter((candidate) => candidate.score >= DOM_MATCH_THRESHOLD)
    .sort((left, right) => compareRank(left.rank, right.rank) || right.score - left.score || right.control.confidence - left.control.confidence);
}

function sortedTextBlockMatches(command: SemanticCommand, pageModel: PageModel): ScoredTextBlock[] {
  return pageModel.textBlocks
    .filter((block) => block.visibility === "visible")
    .map((block): ScoredTextBlock => ({ block, score: scoreTextBlock(command, block) }))
    .filter((candidate) => candidate.score >= DOM_MATCH_THRESHOLD)
    .sort((left, right) => right.score - left.score || right.block.confidence - left.block.confidence);
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

  const explicit = bindExplicitTarget(command, pageModel);
  if (explicit?.ok) return explicit;

  if (command.type === "ReadContent") {
    const textMatches = sortedTextBlockMatches(command, pageModel);
    if (textMatches.length > 0) {
      const [best, second] = textMatches;
      if (second && best.score - second.score <= AMBIGUITY_MARGIN) {
        return err("ambiguous_target", `Multiple text blocks match "${command.targetGoal}" with similar confidence.`, {
          candidates: textMatches.slice(0, 8).map((candidate) => ({
            semanticId: candidate.block.semanticId,
            label: candidate.block.text,
            role: candidate.block.role ?? candidate.block.kind,
            regionRef: candidate.block.regionRef,
            visibility: candidate.block.visibility,
            score: rounded(candidate.score),
            confidence: rounded(candidate.block.confidence)
          }))
        });
      }
      return ok(boundTextBlock(command, best.block, Math.max(0, Math.min(best.score, 0.99))));
    }
  }

  const domMatches = sortedDomMatches(command, pageModel);
  const interactableMatches = domMatches.filter((candidate) => isInteractable(candidate.control));

  if (interactableMatches.length > 0) {
    const [best, second] = interactableMatches;
    if (second && best.score - second.score <= AMBIGUITY_MARGIN && sameAmbiguityRank(best.rank, second.rank)) {
      return err("ambiguous_target", `Multiple controls match "${command.targetGoal}" with similar confidence.`, {
        candidates: interactableMatches.slice(0, 8).map(controlHint)
      });
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

  if (explicit && !shouldFallbackFromExplicitError(explicit)) return explicit;

  if (command.type === "ReadContent" && hasObservationEvidence(pageModel)) {
    return ok({
      semanticCommandId: command.id,
      primitive: { type: "read_content", query: command.targetGoal },
      confidence: 0.72,
      alternatives: [],
      bindingEvidenceRefs: [...pageModel.textBlocks.slice(0, 5).map((block) => block.semanticId)],
      expiresOn: "step_end"
    });
  }

  if (domMatches.length > 0) {
    return err("target_not_interactable", `Matched target "${command.targetGoal}" is disabled, hidden, or has unusable bounds.`);
  }

  const visualMatches = sortedVisualMatches(command, visualCandidates);
  if (visualMatches.length > 0) {
    const [best, second] = visualMatches;
    if (second && best.score - second.score <= AMBIGUITY_MARGIN) {
      return err("ambiguous_target", `Multiple visual targets match "${command.targetGoal}" with similar confidence.`, {
        candidates: visualMatches.slice(0, 8).map(visualHint)
      });
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
