// Проходит по мастеру создания ростера и логирует все сетевые запросы и ответы.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const PROFILE_DIR = path.join(ROOT, ".browser-profile");
const BASE = "https://armybuilder.torn-world.com";
const OUT_DIR = path.join(ROOT, "tmp", "flow");
fs.mkdirSync(OUT_DIR, { recursive: true });

fs.mkdirSync(PROFILE_DIR, { recursive: true });
const context = await chromium.launchPersistentContext(PROFILE_DIR, {
  headless: true,
  viewport: { width: 1600, height: 1000 },
  locale: "ru-RU",
});
const page = context.pages()[0] ?? (await context.newPage());

const log = [];
page.on("request", (request) => {
  const type = request.resourceType();
  if (type === "xhr" || type === "fetch") {
    log.push({ phase: "request", method: request.method(), url: request.url(), postData: request.postData() ?? null });
  }
});
page.on("response", async (response) => {
  const request = response.request();
  const type = request.resourceType();
  if (type !== "xhr" && type !== "fetch") return;
  let body = null;
  try {
    const ct = response.headers()["content-type"] ?? "";
    if (/json/i.test(ct)) {
      const text = await response.text();
      body = text.length > 2000 ? `${text.slice(0, 2000)}... [${text.length} bytes]` : text;
    }
  } catch {
    body = "(body unavailable)";
  }
  log.push({ phase: "response", status: response.status(), url: response.url(), body });
});

await page.goto(`${BASE}/ru/rosters/new`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);

const steps = [
  ["domain", ".element.domain"],
  ["faction", ".element.faction"],
  ["hero", ".element.hero"],
];

for (const [name, selector] of steps) {
  const locator = page.locator(selector).first();
  if ((await locator.count()) === 0) {
    // запасной вариант: общий .element
    const generic = page.locator(".element").nth(steps.findIndex((s) => s[0] === name));
    if ((await generic.count()) === 0) {
      log.push({ phase: "note", message: `selector ${selector} not found for ${name}` });
      break;
    }
    await generic.click({ force: true });
  } else {
    await locator.click({ force: true });
  }
  await page.waitForTimeout(2500);
  log.push({ phase: "note", message: `clicked ${name}`, url: page.url() });
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`) });
}

// пробуем открыть карточку юнита
const unit = page.locator(".element.unit").first();
if (await unit.count()) {
  await unit.click({ force: true });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT_DIR, "unit-modal.png") });
  log.push({ phase: "note", message: "clicked unit" });
}

const html = await page.content();
fs.writeFileSync(path.join(OUT_DIR, "page.html"), html);
fs.writeFileSync(path.join(OUT_DIR, "network.json"), JSON.stringify(log, null, 2));
console.log(JSON.stringify(log.filter((entry) => entry.phase !== "note").map((entry) => ({ p: entry.phase, m: entry.method, s: entry.status, u: entry.url, len: entry.body?.length })), null, 2));
await context.close();
