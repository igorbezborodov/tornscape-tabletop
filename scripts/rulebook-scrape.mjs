// Скачивает тексты всех страниц rulebook.torn-world.com в data/rulebook/*.txt
// и собирает оглавление с якорями. Нужен для реализации правил настольной игры.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(ROOT, "data", "rulebook");
const BASE = "https://rulebook.torn-world.com/";

const PAGES = [
  "index.html",
  "components_game.html",
  "structure_game.html",
  "combat.html",
  "movement.html",
  "ethereal_whirlwinds.html",
  "maps_gods.html",
  "expeditionary_force.html",
  "scenario.html",
  "glossary.html",
];

fs.mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();
const summary = [];

for (const name of PAGES) {
  const url = new URL(name, BASE).href;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);

  const content = await page.evaluate(() => {
    const main =
      document.querySelector("#content") ??
      document.querySelector(".content") ??
      document.querySelector("main") ??
      document.body;

    const headings = [...main.querySelectorAll("h1,h2,h3,h4,h5")].map((h) => ({
      level: Number(h.tagName.slice(1)),
      id: h.id || null,
      text: h.textContent.trim(),
    }));

    const images = [...main.querySelectorAll("img")].map((img) => ({
      src: img.getAttribute("src"),
      alt: img.getAttribute("alt"),
    }));

    const tables = [...main.querySelectorAll("table")].map((table) =>
      [...table.querySelectorAll("tr")].map((row) =>
        [...row.querySelectorAll("th,td")].map((cell) => cell.innerText.trim().replace(/\s+/g, " ")),
      ),
    );

    return {
      text: main.innerText,
      headings,
      images,
      tables,
    };
  });

  fs.writeFileSync(
    path.join(OUT_DIR, name.replace(".html", ".json")),
    JSON.stringify({ url, ...content }, null, 2),
    "utf8",
  );
  fs.writeFileSync(
    path.join(OUT_DIR, name.replace(".html", ".txt")),
    `${url}\n\n${content.text}`,
    "utf8",
  );

  summary.push({ name, chars: content.text.length, headings: content.headings.length, tables: content.tables.length, images: content.images.length });
  console.log(`${name}: ${content.text.length} chars, ${content.headings.length} headings, ${content.tables.length} tables`);
}

await browser.close();
console.log("\nSummary:", JSON.stringify(summary, null, 2));
