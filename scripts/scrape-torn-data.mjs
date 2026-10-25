// Собирает каталог Tornscape (домены → фракции → герои → юниты/заклинания/снаряжение)
// из публичных JSON-эндпоинтов armybuilder.torn-world.com и сохраняет в data/torn-catalog.json.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const PROFILE_DIR = path.join(ROOT, ".browser-profile");
const BASE = "https://armybuilder.torn-world.com";
const LOCALE = "ru";
const OUT_DIR = path.join(ROOT, "data");
const OUT_FILE = path.join(OUT_DIR, "torn-catalog.json");

fs.mkdirSync(PROFILE_DIR, { recursive: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

const context = await chromium.launchPersistentContext(PROFILE_DIR, {
  headless: true,
  viewport: { width: 1440, height: 900 },
  locale: "ru-RU",
});
const page = context.pages()[0] ?? (await context.newPage());
await page.goto(`${BASE}/${LOCALE}/rosters/new`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson(url) {
  const result = await page.evaluate(async (u) => {
    const response = await fetch(u, { headers: { Accept: "application/json" } });
    const text = await response.text();
    return { status: response.status, text };
  }, url);
  if (result.status !== 200) throw new Error(`${url} -> ${result.status}`);
  return JSON.parse(result.text);
}

const formats = (await getJson(`${BASE}/${LOCALE}/rosters/select_format.json`)).formats ?? [];
const domains = (await getJson(`${BASE}/${LOCALE}/rosters/select_domain.json`)).domains ?? [];

const catalog = {
  source: BASE,
  scrapedAt: new Date().toISOString(),
  formats,
  domains: [],
};

let requestCount = 0;

for (const domain of domains) {
  const factions = (await getJson(`${BASE}/${LOCALE}/rosters/select_factions.json?domain_id=${domain.id}`)).factions ?? [];
  requestCount += 1;
  const domainEntry = { ...domain, factions: [] };

  for (const faction of factions) {
    const heroes = (await getJson(`${BASE}/${LOCALE}/rosters/select_heroes.json?faction_id=${faction.id}`)).heroes ?? [];
    requestCount += 1;
    const factionEntry = { ...faction, heroes: [] };

    for (const hero of heroes) {
      const details = await getJson(`${BASE}/${LOCALE}/rosters/hero_details.json?hero_id=${hero.id}`);
      requestCount += 1;
      await sleep(120);

      factionEntry.heroes.push({
        id: details.id ?? hero.id,
        techName: details.tech_name ?? hero.tech_name,
        name: details.name ?? hero.name,
        nameEn: details.name_en ?? null,
        pointCost: details.point_cost ?? hero.point_cost ?? null,
        image: details.image_path ?? hero.image_path ?? null,
        cardImage: details.card_image_path ?? null,
        cardBackImage: details.card_back_image_path ?? null,
        weight: details.weight ?? hero.weight ?? null,
        // Порядок в интерфейсе armybuilder задаётся полем weight (по возрастанию),
        // а не порядком элементов в массиве — сохраняем его для сортировки.
        units: (details.available_units ?? []).map((unit) => ({
            id: unit.id,
            techName: unit.tech_name,
            name: unit.name,
            limit: unit.quantity,
            pointCost: unit.point_cost,
            weight: unit.weight ?? 0,
            // Вложенные юниты (спутники) открываются после родителя, но у них
            // есть и своя стоимость, и обе стороны карты — сохраняем их тоже.
            requires: (unit.available_units ?? []).map((nested) => ({
              id: nested.id,
              techName: nested.tech_name,
              name: nested.name,
              limit: nested.quantity,
              pointCost: nested.point_cost ?? 0,
              weight: nested.weight ?? 0,
              image: nested.image_path ?? null,
              cardImage: nested.card_image_path ?? null,
              cardBackImage: nested.card_back_image_path ?? null,
            })),
            uniqKey: unit.uniq_key ?? null,
            image: unit.image_path,
            cardImage: unit.card_image_path ?? null,
            // Карты двусторонние: обратная сторона приходит отдельным полем.
            cardBackImage: unit.card_back_image_path ?? null,
          })),
        spells: (details.available_spells ?? []).map((spell) => ({
          id: spell.id,
          techName: spell.tech_name,
          name: spell.name,
          limit: spell.quantity,
          domains: spell.domain_names ?? [],
          weight: spell.weight ?? 0,
          image: spell.image_path,
        })),
        equipment: (details.available_equipment ?? []).map((item) => ({
          id: item.id,
          techName: item.tech_name,
          name: item.name,
          limit: item.quantity,
          pointCost: item.point_cost,
          weight: item.weight ?? 0,
          image: item.image_path,
        })),
      });
      process.stdout.write(`  hero ${hero.tech_name} (${(details.available_units ?? []).length} units)\n`);
    }

    domainEntry.factions.push(factionEntry);
  }

  catalog.domains.push(domainEntry);
}

fs.writeFileSync(OUT_FILE, JSON.stringify(catalog, null, 2), "utf8");

const totals = {
  domains: catalog.domains.length,
  factions: catalog.domains.reduce((sum, d) => sum + d.factions.length, 0),
  heroes: catalog.domains.reduce((sum, d) => sum + d.factions.reduce((s, f) => s + f.heroes.length, 0), 0),
  unitEntries: catalog.domains.reduce(
    (sum, d) => sum + d.factions.reduce((s, f) => s + f.heroes.reduce((a, h) => a + h.units.length, 0), 0),
    0,
  ),
  uniqueUnits: new Set(
    catalog.domains.flatMap((d) =>
      d.factions.flatMap((f) => f.heroes.flatMap((h) => h.units.map((u) => u.techName))),
    ),
  ).size,
  requests: requestCount,
  file: path.relative(ROOT, OUT_FILE),
};

console.log(JSON.stringify(totals, null, 2));
await context.close();
