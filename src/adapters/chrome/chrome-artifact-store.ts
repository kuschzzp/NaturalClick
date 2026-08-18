import {
  generatedArtifactMatches,
  sanitizeGeneratedTextArtifact,
  type GeneratedTextArtifact,
  type GeneratedTextArtifactDraft
} from "../../core/capabilities/file-artifacts";

const ARTIFACT_STORE_PREFIX = "naturalclick.artifacts.v1";

function keyFor(sessionId: string): string {
  return `${ARTIFACT_STORE_PREFIX}:${sessionId}`;
}

async function loadArtifacts(sessionId: string): Promise<GeneratedTextArtifact[]> {
  const stored = await chrome.storage.local.get(keyFor(sessionId));
  const value = stored[keyFor(sessionId)];
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const artifact = sanitizeGeneratedTextArtifact(item as GeneratedTextArtifact);
    return artifact ? [artifact] : [];
  });
}

export class ChromeArtifactStore {
  async saveArtifact(sessionId: string, draft: GeneratedTextArtifactDraft): Promise<GeneratedTextArtifact> {
    const normalized = sanitizeGeneratedTextArtifact(draft);
    if (!normalized) throw new Error("invalid_generated_artifact");
    const artifacts = await loadArtifacts(sessionId);
    const index = artifacts.findIndex((item) => item.id === normalized.id);
    const next = [...artifacts];
    if (index >= 0) {
      next[index] = { ...normalized, createdAt: artifacts[index].createdAt ?? normalized.createdAt };
    } else {
      next.push(normalized);
    }
    await chrome.storage.local.set({ [keyFor(sessionId)]: next.slice(-50) });
    return index >= 0 ? next[index] : normalized;
  }

  async listArtifacts(sessionId: string, query: { query?: string; limit?: number } = {}): Promise<GeneratedTextArtifact[]> {
    const limit = Number.isFinite(query.limit) && query.limit && query.limit > 0 ? Math.floor(query.limit) : 50;
    return (await loadArtifacts(sessionId))
      .filter((artifact) => generatedArtifactMatches(artifact, query.query ?? ""))
      .sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0))
      .slice(0, limit);
  }

  async loadArtifact(sessionId: string, artifactId: string): Promise<GeneratedTextArtifact | undefined> {
    const id = artifactId.trim();
    if (!id) return undefined;
    return (await loadArtifacts(sessionId)).find((artifact) => artifact.id === id);
  }

  async clear(sessionId: string): Promise<void> {
    await chrome.storage.local.set({ [keyFor(sessionId)]: [] });
  }
}
