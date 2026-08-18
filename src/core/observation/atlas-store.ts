import type { PageAtlas } from "./page-atlas";

export interface AtlasStore {
  get(atlasId: string): PageAtlas | undefined;
  set(atlas: PageAtlas): void;
  delete(atlasId: string): void;
  clear(): void;
}

export function createMemoryAtlasStore(limit = 8): AtlasStore {
  const entries = new Map<string, PageAtlas>();
  return {
    get: (atlasId) => entries.get(atlasId),
    set: (atlas) => {
      entries.delete(atlas.atlasId);
      entries.set(atlas.atlasId, atlas);
      while (entries.size > limit) {
        const oldest = entries.keys().next().value as string | undefined;
        if (!oldest) break;
        entries.delete(oldest);
      }
    },
    delete: (atlasId) => {
      entries.delete(atlasId);
    },
    clear: () => {
      entries.clear();
    }
  };
}
