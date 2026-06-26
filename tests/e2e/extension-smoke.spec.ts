import { chromium, expect, test } from "@playwright/test";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

test.setTimeout(60_000);

async function sidepanelUrl(context: Awaited<ReturnType<typeof chromium.launchPersistentContext>>): Promise<string> {
  const worker =
    context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker", { timeout: 3_000 }).catch(() => undefined));
  if (worker) {
    return `chrome-extension://${new URL(worker.url()).host}/sidepanel.html`;
  }
  return `file://${path.resolve("naturalclick-extension/sidepanel.html")}`;
}

test("built extension content script and sidepanel smoke", async () => {
  execSync("npm run build", { stdio: "inherit" });

  const extensionPath = path.resolve("naturalclick-extension");
  const fixtureUrl = `file://${path.resolve("tests/fixtures/pages/general.html")}`;
  const userDataDir = mkdtempSync(path.join(tmpdir(), "naturalclick-profile-"));
  let context: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | undefined;

  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chrome",
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        "--allow-file-access-from-files"
      ]
    });

    const page = await context.newPage();
    await page.goto(fixtureUrl);
    await expect(page.locator("h1")).toHaveText("Account dashboard");

    const sidepanel = await context.newPage();
    await sidepanel.goto(await sidepanelUrl(context));
    await expect(sidepanel.locator("text=NaturalClick")).toBeVisible();
  } finally {
    await context?.close();
    rmSync(userDataDir, { recursive: true, force: true });
  }
});
