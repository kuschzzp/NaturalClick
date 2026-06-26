import { describe, expect, it } from "vitest";
import manifest from "../../../public/manifest.json";

describe("MV3 manifest", () => {
  it("declares the side panel, service worker, and content script", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.side_panel.default_path).toBe("sidepanel.html");
    expect(manifest.background.service_worker).toBe("background.js");
    expect(manifest.content_scripts[0].js).toEqual(["content.js"]);
  });

  it("declares extension and toolbar icons", () => {
    expect(manifest.icons).toEqual({
      "16": "icons/icon-16.png",
      "32": "icons/icon-32.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    });
    expect(manifest.action.default_icon).toEqual(manifest.icons);
  });
});
