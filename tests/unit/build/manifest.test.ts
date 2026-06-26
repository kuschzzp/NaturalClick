import { describe, expect, it } from "vitest";
import manifest from "../../../public/manifest.json";

describe("MV3 manifest", () => {
  it("declares the side panel, service worker, and content script", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.side_panel.default_path).toBe("sidepanel.html");
    expect(manifest.background.service_worker).toBe("background.js");
    expect(manifest.content_scripts[0].js).toEqual(["content.js"]);
  });
});
