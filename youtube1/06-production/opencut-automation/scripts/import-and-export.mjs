#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

function argsFrom(argv) {
  const args = { baseUrl: "http://localhost:3000", timeout: 120000, headed: false };
  for (let i = 2; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === "--headed") args.headed = true;
    else if (value === "--base-url") args.baseUrl = argv[++i];
    else if (value === "--manifest") args.manifest = argv[++i];
    else if (value === "--assets-dir") args.assetsDir = argv[++i];
    else if (value === "--output") args.output = argv[++i];
    else if (value === "--timeout") args.timeout = Number(argv[++i]);
    else if (value === "--help") {
      console.log("Usage: npm run import -- --manifest <json> --assets-dir <dir> --output <mp4> [--headed] [--base-url URL] [--timeout ms]");
      process.exit(0);
    }
  }
  if (!args.manifest || !args.assetsDir || !args.output) throw new Error("--manifest, --assets-dir and --output are required");
  return args;
}

const args = argsFrom(process.argv);
const manifestPath = path.resolve(args.manifest);
const assetsDir = path.resolve(args.assetsDir);
const outputPath = path.resolve(args.output);
const assetNames = await fs.readdir(assetsDir);
const assetPaths = assetNames.map((name) => path.join(assetsDir, name));
await fs.mkdir(path.dirname(outputPath), { recursive: true });

const userDataDir = path.resolve(".playwright-profile");
const context = await chromium.launchPersistentContext(userDataDir, {
  headless: !args.headed,
  acceptDownloads: true,
});
await context.addInitScript(() => localStorage.setItem("hasSeenOnboarding", "true"));
const page = context.pages()[0] ?? await context.newPage();
page.setDefaultTimeout(args.timeout);
page.on("console", (message) => console.error(`[browser:${message.type()}] ${message.text()}`));
page.on("pageerror", (error) => console.error(`[browser:pageerror] ${error.message}`));
page.on("framenavigated", (frame) => {
  if (frame === page.mainFrame()) console.error(`[browser:navigation] ${frame.url()}`);
});

try {
  await page.goto(`${args.baseUrl.replace(/\/$/, "")}/automation`, { waitUntil: "networkidle" });
  // Next development mode can perform one hydration refresh after the first compile.
  await page.waitForTimeout(1000);
  await page.getByTestId("manifest-input").setInputFiles(manifestPath);
  if (assetPaths.length > 0) await page.getByTestId("asset-input").setInputFiles(assetPaths);
  await page.waitForFunction(
	  () => {
	    const button = document.querySelector('[data-testid="import-button"]');
	    return button instanceof HTMLButtonElement && !button.disabled;
	  },
    undefined,
    { timeout: args.timeout },
  );
  await page.getByTestId("import-button").click();
	await page.waitForFunction(() => {
	  const state = window.__OPENCUT_AUTOMATION__;
	  if (state?.status === "error") throw new Error(state.error);
	  return state?.status === "ready";
	}, undefined, { timeout: args.timeout });
  await page.waitForURL(/\/editor\//, { timeout: args.timeout });
  await page.locator("[data-automation-project-id]").waitFor({ state: "attached", timeout: args.timeout }).catch(() => undefined);
  const headerExport = page.getByRole("button", { name: "Export", exact: true }).first();
  await headerExport.click();
  const exportButton = page.getByRole("button", { name: "Export", exact: true }).last();
  const downloadPromise = page.waitForEvent("download", { timeout: args.timeout });
  await exportButton.click();
  const download = await downloadPromise;
  await download.saveAs(outputPath);
  console.log(JSON.stringify({ projectUrl: page.url(), output: outputPath }, null, 2));
} catch (error) {
  const diagnostic = await page.evaluate(() => ({
    state: window.__OPENCUT_AUTOMATION__ ?? null,
    statusText: document.querySelector('[data-testid="automation-status"]')?.textContent ?? null,
    url: location.href,
	buttons: Array.from(document.querySelectorAll("button")).map((button) => button.textContent?.trim()).filter(Boolean),
	bodyText: document.body.innerText.slice(0, 1000),
  })).catch(() => null);
	await page.screenshot({ path: `${outputPath}.failure.png`, fullPage: true }).catch(() => undefined);
  console.error(JSON.stringify({ diagnostic }, null, 2));
  throw error;
} finally {
  await context.close();
}
