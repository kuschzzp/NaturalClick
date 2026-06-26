export function roughTokenCount(value: unknown): number {
  return Math.ceil(JSON.stringify(value).length / 4);
}

export function takeTopByConfidence<T extends { confidence?: number }>(items: T[], limit: number): T[] {
  return [...items].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)).slice(0, limit);
}
