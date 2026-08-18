import { promises as fs } from "node:fs";
import { describe, expect, it } from "vitest";
import manifest from "../../../public/manifest.json";

describe("MV3 manifest", () => {
  it("declares the side panel, service worker, and content script", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.side_panel.default_path).toBe("sidepanel.html");
    expect(manifest.background.service_worker).toBe("background.js");
    expect(manifest.content_scripts[0].js).toEqual(["content-loader.js"]);
    expect(manifest.web_accessible_resources[0].resources).toEqual(["content.js", "chunks/*.js"]);
    expect(manifest.web_accessible_resources[0].matches).toEqual(["<all_urls>"]);
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

  it("keeps package and extension manifest versions aligned", async () => {
    const [pkg, publicManifest, builtManifest] = await Promise.all([
      fs.readFile("package.json", "utf8").then(JSON.parse),
      fs.readFile("public/manifest.json", "utf8").then(JSON.parse),
      fs.readFile("naturalclick-extension/manifest.json", "utf8").then(JSON.parse)
    ]);

    expect(publicManifest.version).toBe(pkg.version);
    expect(builtManifest.version).toBe(pkg.version);
  });
});
