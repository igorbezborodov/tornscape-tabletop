// scripts/torn-catalog-report.mjs
// Проверка целостности data/torn-catalog.json перед загрузкой в БД:
// дубли опций внутри героя, «висячие» требования и статистика справочников.
import { readFileSync } from "node:fs";
import path from "node:path";

const catalogPath = path.resolve(import.meta.dirname, "..", "data", "torn-catalog.json");
const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));

const dupOptions = [];
const missingRequires = [];
const unitPointCosts = new Map();
const unitLimits = new Map();
const spellLimits = new Map();
const equipmentCosts = new Map();
const uniqKeys = new Map();

let heroCount = 0;
let factionCount = 0;
let optionCount = 0;

for (const domain of catalog.domains) {
  for (const faction of domain.factions) {
    factionCount += 1;

    for (const hero of faction.heroes) {
      heroCount += 1;
      const seen = new Set();

      for (const option of hero.units) {
        optionCount += 1;

        if (seen.has(option.techName)) {
          dupOptions.push(`${hero.techName}/${option.techName}`);
        }
        seen.add(option.techName);

        if (!unitPointCosts.has(option.techName)) unitPointCosts.set(option.techName, new Set());
        unitPointCosts.get(option.techName).add(option.pointCost);

        if (!unitLimits.has(option.techName)) unitLimits.set(option.techName, new Set());
        unitLimits.get(option.techName).add(option.limit);

        if (option.uniqKey) {
          if (!uniqKeys.has(option.uniqKey)) uniqKeys.set(option.uniqKey, new Set());
          uniqKeys.get(option.uniqKey).add(`${hero.techName}/${option.techName}`);
        }

        for (const requirement of option.requires) {
          if (!hero.units.some((u) => u.techName === requirement.techName)) {
            missingRequires.push(`${hero.techName}/${option.techName} -> ${requirement.techName}`);
          }
        }
      }

      for (const spell of hero.spells) {
        if (!spellLimits.has(spell.techName)) spellLimits.set(spell.techName, new Set());
        spellLimits.get(spell.techName).add(spell.limit);
      }

      for (const item of hero.equipment) {
        if (!equipmentCosts.has(item.techName)) equipmentCosts.set(item.techName, new Set());
        equipmentCosts.get(item.techName).add(item.pointCost);
      }
    }
  }
}

const report = {
  source: catalog.source,
  scannedAt: catalog.scrapedAt,
  domains: catalog.domains.length,
  factions: factionCount,
  heroes: heroCount,
  unitOptions: optionCount,
  uniqueUnits: unitPointCosts.size,
  uniqueSpells: spellLimits.size,
  uniqueEquipment: equipmentCosts.size,
  duplicateOptions: dupOptions,
  missingRequires,
  unitsWithDifferentCostAcrossHeroes: [...unitPointCosts.entries()]
    .filter(([, costs]) => costs.size > 1)
    .map(([techName, costs]) => ({ techName, costs: [...costs] })),
  unitsWithDifferentLimitAcrossHeroes: [...unitLimits.entries()]
    .filter(([, limits]) => limits.size > 1).length,
  spellsWithDifferentLimit: [...spellLimits.entries()]
    .filter(([, limits]) => limits.size > 1)
    .map(([techName, limits]) => ({ techName, limits: [...limits] })),
  equipmentWithDifferentCost: [...equipmentCosts.entries()]
    .filter(([, costs]) => costs.size > 1)
    .map(([techName, costs]) => ({ techName, costs: [...costs] })),
  uniqKeys: [...uniqKeys.entries()].map(([key, entries]) => ({ key, entries: [...entries] })),
};

console.log(JSON.stringify(report, null, 2));
