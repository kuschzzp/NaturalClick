import type { ControlCandidate, FormSnapshot, PageModel, RiskSignal, TextBlock } from "./page-model";

export interface FocusedObservation {
  pageIdentity: string;
  candidates: ControlCandidate[];
  textBlocks: TextBlock[];
  forms: FormSnapshot[];
  feedback: string[];
  riskSignals: RiskSignal[];
}

interface Scored<T> {
  item: T;
  index: number;
  score: number;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function tokenize(value: string): string[] {
  const normalized = normalize(value);
  const words = normalized.match(/[a-z0-9]+/g) ?? [];
  return Array.from(new Set([normalized, ...words].filter((token) => token.length > 0)));
}

function scoreText(haystack: string, query: string, tokens: string[]): number {
  const normalizedHaystack = normalize(haystack);
  if (!query) return 1;
  if (normalizedHaystack === query) return 100;
  if (normalizedHaystack.includes(query)) return 80;

  let score = 0;
  for (const token of tokens) {
    if (token !== query && normalizedHaystack.includes(token)) {
      score += 15;
    }
  }
  return score;
}

function sortScored<T extends { confidence?: number }>(items: Scored<T>[]): T[] {
  return items
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const confidenceDelta = (b.item.confidence ?? 0) - (a.item.confidence ?? 0);
      if (confidenceDelta !== 0) return confidenceDelta;
      return a.index - b.index;
    })
    .map((scored) => scored.item);
}

function scoreControl(control: ControlCandidate, query: string, tokens: string[]): number {
  const labelScore = scoreText(control.label, query, tokens);
  const nameScore = scoreText(control.accessibleName, query, tokens);
  const roleScore = scoreText(control.role, query, tokens);
  const hintScore = scoreText(control.interactionHints.join(" "), query, tokens);
  const baseScore = Math.max(labelScore, nameScore, roleScore, hintScore);
  if (baseScore === 0) return 0;
  const visibilityBonus = control.visibility === "visible" ? 2 : 0;
  return baseScore + control.confidence * 10 + visibilityBonus;
}

function scoreBlock(block: TextBlock, query: string, tokens: string[]): number {
  const baseScore = scoreText(`${block.text} ${block.kind} ${block.role ?? ""}`, query, tokens);
  return baseScore === 0 ? 0 : baseScore + block.confidence * 5;
}

function scoreForm(form: FormSnapshot, query: string, tokens: string[]): number {
  const baseScore = scoreText(`${form.label} ${form.controlLabels.join(" ")}`, query, tokens);
  return baseScore === 0 ? 0 : baseScore + form.confidence * 5;
}

function scoreRisk(signal: RiskSignal, query: string, tokens: string[]): number {
  const baseScore = scoreText(`${signal.kind} ${signal.message}`, query, tokens);
  return baseScore === 0 ? 0 : baseScore + signal.confidence * 5;
}

function focusList<T extends { confidence?: number }>(
  items: T[],
  score: (item: T, index: number) => number,
  fallbackLimit: number
): T[] {
  const scored = items.map((item, index) => ({ item, index, score: score(item, index) }));
  const matches = scored.filter((item) => item.score > 0);
  if (matches.length > 0) return sortScored(matches);
  return sortScored(scored).slice(0, fallbackLimit);
}

export function focusObservation(page: PageModel, query: string): FocusedObservation {
  const normalizedQuery = normalize(query);
  const tokens = tokenize(query);

  return {
    pageIdentity: `${page.pageIdentity.title} ${page.pageIdentity.url}`.trim(),
    candidates: focusList(page.controls, (control) => scoreControl(control, normalizedQuery, tokens), 20),
    textBlocks: focusList(page.textBlocks, (block) => scoreBlock(block, normalizedQuery, tokens), 10),
    forms: focusList(page.forms, (form) => scoreForm(form, normalizedQuery, tokens), 5),
    feedback: page.feedback.filter((message) => scoreText(message, normalizedQuery, tokens) > 0),
    riskSignals: focusList(page.riskSignals, (signal) => scoreRisk(signal, normalizedQuery, tokens), 10)
  };
}
