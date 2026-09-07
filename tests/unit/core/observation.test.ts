import { describe, expect, it } from "vitest";
import { renderPageAtlas } from "../../../src/core/observation/page-atlas";
import { createMemoryAtlasStore } from "../../../src/core/observation/atlas-store";

describe("page atlas", () => {
  it("renders action and data surfaces without raw full DOM", () => {
    const atlas = renderPageAtlas({
      atlasId: "atlas_1",
      tabId: 7,
      url: "https://example.test/app",
      title: "Console",
      fingerprint: {
        url: "https://example.test/app",
        bodyTextLengthBucket: 1000,
        interactiveCountBucket: 20,
        topSectionCount: 3
      },
      controls: [{ id: "ctrl_1", frameId: 0, handle: "h1", role: "menuitem", label: "客户管理", expanded: false, focused: true }],
      forms: [],
      targets: [{ id: "table_1", frameId: 0, type: "table", label: "客户列表", confidence: "high", summary: "10 rows", visibleCount: 10 }]
    });

    expect(atlas).toContain("<page_atlas");
    expect(atlas).toContain('label="客户管理"');
    expect(atlas).toContain('focused="true"');
    expect(atlas).toContain('target_id="table_1"');
    expect(atlas).not.toContain("<body");
  });

  it("keeps only the newest memory atlas entries", () => {
    const store = createMemoryAtlasStore(1);
    store.set({
      atlasId: "old",
      tabId: 1,
      url: "https://old.test",
      title: "Old",
      fingerprint: { url: "https://old.test", bodyTextLengthBucket: 0, interactiveCountBucket: 0, topSectionCount: 0 },
      controls: [],
      forms: [],
      targets: []
    });
    store.set({
      atlasId: "new",
      tabId: 1,
      url: "https://new.test",
      title: "New",
      fingerprint: { url: "https://new.test", bodyTextLengthBucket: 0, interactiveCountBucket: 0, topSectionCount: 0 },
      controls: [],
      forms: [],
      targets: []
    });

    expect(store.get("old")).toBeUndefined();
    expect(store.get("new")?.title).toBe("New");
  });
});
