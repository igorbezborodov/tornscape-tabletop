// Сохраняет JS-бандлы armybuilder в tmp/bundles для офлайн-анализа.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const PROFILE_DIR = path.join(ROOT, ".browser-profile");
const OUT_DIR = path.join(ROOT, "tmp", "bundles");
const BASE = "https://armybuilder.torn-world.com";

fs.mkdirSync(PROFILE_DIR, { recursive: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

const context = await chromium.launchPersistentContext(PROFILE_DIR, {
  headless: true,
  viewport: { width: 1440, height: 900 },
  locale: "ru-RU",
});
const page = context.pages()[0] ?? (await context.newPage());
for (const route of ["/ru/rosters/new", "/ru"]) {
  await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
}

const scripts = await page.evaluate(() =>
  performance
    .getEntriesByType("resource")
    .map((entry) => entry.name)
    .filter((name) => name.includes("armybuilder") && /\.js($|\?)/.test(name)),
);

for (const url of scripts) {
  const text = await page.evaluate(async (u) => (await fetch(u)).text(), url);
  const name = url.split("/").pop().split("?")[0];
  fs.writeFileSync(path.join(OUT_DIR, name), text, "utf8");
}

console.log(`saved ${scripts.length} bundles to ${path.relative(ROOT, OUT_DIR)}`);
await context.close();
