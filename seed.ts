// seed.ts
// Заполняет базу каталогом https://armybuilder.torn-world.com
// (data/torn-catalog.json — результат scripts/scrape-torn-data.mjs).
//
// Prisma 7 requires a driver adapter to instantiate PrismaClient.
import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "./src/generated/prisma/client.js";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const catalogPath = path.resolve(projectRoot, "data", "torn-catalog.json");

/**
 * `DATABASE_URL="file:./prisma/dev.db"` is relative to the project root, which is
 * also where the Prisma CLI resolves it. `better-sqlite3` would resolve it against
 * `process.cwd()` instead, so make `file:` URLs absolute here.
 */
function resolveDatabaseUrl(rawUrl: string): string {
  if (!rawUrl.startsWith("file:") || rawUrl.startsWith("file:/")) {
    return rawUrl;
  }

  return `file:${path.resolve(projectRoot, rawUrl.slice("file:".length))}`;
}

// --- Типы каталога (структура data/torn-catalog.json) ---

type CatalogRequirement = {
  id: number;
  techName: string;
  name: string;
  limit: number;
  /** Требование тоже юнит со своей стоимостью и картой (спутник). */
  pointCost?: number;
  /** Порядок в списке выбора у armybuilder (по возрастанию). */
  weight?: number;
  image?: string | null;
  cardImage?: string | null;
  cardBackImage?: string | null;
};

type CatalogUnitOption = {
  id: number;
  techName: string;
  name: string;
  limit: number;
  pointCost: number;
  /** Порядок в списке выбора: armybuilder сортирует по weight по возрастанию. */
  weight?: number;
  requires: CatalogRequirement[];
  uniqKey: string | null;
  image: string | null;
  cardImage: string | null;
  /** Обратная сторона двусторонней карты (может отсутствовать). */
  cardBackImage?: string | null;
};

type CatalogSpell = {
  id: number;
  techName: string;
  name: string;
  limit: number;
  domains: string[];
  /** Порядок в списке заклинаний (сортировка по weight). */
  weight?: number;
  image: string | null;
};

type CatalogEquipment = {
  id: number;
  techName: string;
  name: string;
  limit: number;
  pointCost: number;
  /** Порядок в списке снаряжения (сортировка по weight). */
  weight?: number;
  image: string | null;
};

type CatalogHero = {
  id: number;
  techName: string;
  name: string;
  nameEn: string | null;
  pointCost: number;
  image: string | null;
  cardImage: string | null;
  cardBackImage: string | null;
  weight: number;
  units: CatalogUnitOption[];
  spells: CatalogSpell[];
  equipment: CatalogEquipment[];
};

type CatalogFaction = {
  id: number;
  tech_name: string;
  name: string;
  image_path: string | null;
  weight: number;
  has_heroes: boolean;
  heroes: CatalogHero[];
};

type CatalogDomain = {
  id: number;
  tech_name: string;
  name: string;
  image_path: string | null;
  weight: number;
  factions: CatalogFaction[];
};

type Catalog = {
  source: string;
  scrapedAt: string;
  formats: { id: number; format: number }[];
  domains: CatalogDomain[];
};

const adapter = new PrismaBetterSqlite3({
  url: resolveDatabaseUrl(process.env["DATABASE_URL"] ?? "file:./prisma/dev.db"),
});

const prisma = new PrismaClient({ adapter });

/** Формат ростера по умолчанию (минимальный бюджет — 200 очков). */
const DEFAULT_FORMAT_POINTS = 200;

/** Справочник юнитов, собранный из всех списков лидеров и их требований. */
type UnitSeed = {
  externalId: number | null;
  slug: string;
  name: string;
  points: number;
  limit: number;
  /** Порядок в каталоге выбора (weight из armybuilder). */
  weight: number;
  uniqKey: string | null;
  imageUrl: string | null;
  cardImageUrl: string | null;
  cardBackImageUrl: string | null;
};

function collectUnits(catalog: Catalog): Map<string, UnitSeed> {
  const units = new Map<string, UnitSeed>();

  const remember = (unit: UnitSeed) => {
    const existing = units.get(unit.slug);

    if (!existing) {
      units.set(unit.slug, unit);
      return;
    }

    // Юнит встречается у нескольких лидеров: стоимость одинаковая, а лимит
    // берём максимальный, чтобы `Unit.limit` показывал верхнюю границу.
    // weight у одного и того же юнита одинаковый, но на всякий случай берём
    // минимальный — так порядок остаётся стабильным (вес 0 = «не задан»).
    const weights = [existing.weight, unit.weight].filter((value) => value > 0);
    units.set(unit.slug, {
      ...existing,
      limit: Math.max(existing.limit, unit.limit),
      weight: weights.length > 0 ? Math.min(...weights) : 0,
      imageUrl: existing.imageUrl ?? unit.imageUrl,
      cardImageUrl: existing.cardImageUrl ?? unit.cardImageUrl,
      cardBackImageUrl: existing.cardBackImageUrl ?? unit.cardBackImageUrl,
    });
  };

  for (const domain of catalog.domains) {
    for (const faction of domain.factions) {
      for (const hero of faction.heroes) {
        for (const option of hero.units) {
          remember({
            externalId: option.id,
            slug: option.techName,
            name: option.name,
            points: option.pointCost,
            limit: option.limit,
            weight: option.weight ?? 0,
            uniqKey: option.uniqKey,
            imageUrl: option.image,
            cardImageUrl: option.cardImage,
            cardBackImageUrl: option.cardBackImage ?? null,
          });
        }

        // Некоторые юниты-требования (Боевой пёс, Гомункул, Вирмглинг,
        // модификации Кефера) не входят в список доступных лидеру, но
        // участвуют в правилах набора — их тоже заводим в справочник.
        for (const option of hero.units) {
          for (const requirement of option.requires) {
            if (units.has(requirement.techName)) continue;

            remember({
              externalId: requirement.id,
              slug: requirement.techName,
              name: requirement.name,
              points: requirement.pointCost ?? 0,
              limit: requirement.limit,
              weight: requirement.weight ?? 0,
              uniqKey: null,
              imageUrl: requirement.image ?? null,
              cardImageUrl: requirement.cardImage ?? null,
              cardBackImageUrl: requirement.cardBackImage ?? null,
            });
          }
        }
      }
    }
  }

  return units;
}

function collectSpells(catalog: Catalog) {
  const spells = new Map<
    string,
    { externalId: number; name: string; limit: number; domains: string[]; weight: number; imageUrl: string | null }
  >();

  for (const domain of catalog.domains) {
    for (const faction of domain.factions) {
      for (const hero of faction.heroes) {
        for (const spell of hero.spells) {
          if (!spells.has(spell.techName)) {
            spells.set(spell.techName, {
              externalId: spell.id,
              name: spell.name,
              limit: spell.limit,
              domains: spell.domains,
              weight: spell.weight ?? 0,
              imageUrl: spell.image,
            });
          }
        }
      }
    }
  }

  return spells;
}

function collectEquipment(catalog: Catalog) {
  const equipment = new Map<
    string,
    { externalId: number; name: string; points: number; limit: number; weight: number; imageUrl: string | null }
  >();

  for (const domain of catalog.domains) {
    for (const faction of domain.factions) {
      for (const hero of faction.heroes) {
        for (const item of hero.equipment) {
          if (!equipment.has(item.techName)) {
            equipment.set(item.techName, {
              externalId: item.id,
              name: item.name,
              points: item.pointCost,
              limit: item.limit,
              weight: item.weight ?? 0,
              imageUrl: item.image,
            });
          }
        }
      }
    }
  }

  return equipment;
}

async function main() {
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as Catalog;

  console.log(
    `Загружаем каталог ${catalog.source} (снимок ${catalog.scrapedAt})…`,
  );

  // 1. Форматы ростера: 200 / 300 / 400 очков.
  for (const format of catalog.formats) {
    await prisma.rosterFormat.upsert({
      where: { points: format.format },
      update: { externalId: format.id, isDefault: format.format === DEFAULT_FORMAT_POINTS },
      create: {
        externalId: format.id,
        points: format.format,
        isDefault: format.format === DEFAULT_FORMAT_POINTS,
      },
    });
  }

  console.log(`Форматы ростера: ${catalog.formats.map((f) => f.format).join(", ")}`);

  // 2. Домены.
  const domainIds = new Map<string, string>();

  for (const [index, domain] of catalog.domains.entries()) {
    const saved = await prisma.domain.upsert({
      where: { slug: domain.tech_name },
      update: {
        externalId: domain.id,
        name: domain.name,
        imageUrl: domain.image_path,
        sortOrder: index,
      },
      create: {
        externalId: domain.id,
        slug: domain.tech_name,
        name: domain.name,
        imageUrl: domain.image_path,
        sortOrder: index,
      },
    });

    domainIds.set(domain.tech_name, saved.id);
  }

  // 3. Фракции.
  const factionIds = new Map<string, string>();
  let factionCount = 0;

  for (const domain of catalog.domains) {
    const domainId = domainIds.get(domain.tech_name) ?? null;

    for (const [index, faction] of domain.factions.entries()) {
      const saved = await prisma.faction.upsert({
        where: { slug: faction.tech_name },
        update: {
          externalId: faction.id,
          name: faction.name,
          imageUrl: faction.image_path,
          sortOrder: index,
          domainId,
        },
        create: {
          externalId: faction.id,
          slug: faction.tech_name,
          name: faction.name,
          imageUrl: faction.image_path,
          sortOrder: index,
          domainId,
        },
      });

      factionIds.set(faction.tech_name, saved.id);
      factionCount += 1;
    }
  }

  // 4. Справочник юнитов.
  const unitSeeds = collectUnits(catalog);
  const unitIds = new Map<string, string>();

  for (const unit of unitSeeds.values()) {
    const saved = await prisma.unit.upsert({
      where: { slug: unit.slug },
      update: {
        externalId: unit.externalId,
        name: unit.name,
        points: unit.points,
        limit: unit.limit,
        weight: unit.weight,
        uniqKey: unit.uniqKey,
        imageUrl: unit.imageUrl,
        cardImageUrl: unit.cardImageUrl,
        cardBackImageUrl: unit.cardBackImageUrl,
        // Боевые параметры armybuilder не публикует: они остаются null,
        // пока их не заполнят вручную (или из OCR карт).
        hp: null,
        maxHp: null,
        movement: null,
        attack: null,
        defense: null,
      },
      create: {
        externalId: unit.externalId,
        slug: unit.slug,
        name: unit.name,
        points: unit.points,
        limit: unit.limit,
        weight: unit.weight,
        uniqKey: unit.uniqKey,
        imageUrl: unit.imageUrl,
        cardImageUrl: unit.cardImageUrl,
        cardBackImageUrl: unit.cardBackImageUrl,
      },
    });

    unitIds.set(unit.slug, saved.id);
  }

  // 5. Заклинания и снаряжение.
  const spellSeeds = collectSpells(catalog);
  const spellIds = new Map<string, string>();

  for (const [slug, spell] of spellSeeds) {
    const saved = await prisma.spell.upsert({
      where: { slug },
      update: {
        externalId: spell.externalId,
        name: spell.name,
        limit: spell.limit,
        weight: spell.weight,
        domainSlug: spell.domains[0] ?? null,
        domainsJson: JSON.stringify(spell.domains),
        imageUrl: spell.imageUrl,
      },
      create: {
        externalId: spell.externalId,
        slug,
        name: spell.name,
        limit: spell.limit,
        weight: spell.weight,
        domainSlug: spell.domains[0] ?? null,
        domainsJson: JSON.stringify(spell.domains),
        imageUrl: spell.imageUrl,
      },
    });

    spellIds.set(slug, saved.id);
  }

  const equipmentSeeds = collectEquipment(catalog);
  const equipmentIds = new Map<string, string>();

  for (const [slug, item] of equipmentSeeds) {
    const saved = await prisma.equipment.upsert({
      where: { slug },
      update: {
        externalId: item.externalId,
        name: item.name,
        points: item.points,
        limit: item.limit,
        weight: item.weight,
        imageUrl: item.imageUrl,
      },
      create: {
        externalId: item.externalId,
        slug,
        name: item.name,
        points: item.points,
        limit: item.limit,
        weight: item.weight,
        imageUrl: item.imageUrl,
      },
    });

    equipmentIds.set(slug, saved.id);
  }

  // 6. Лидеры и их опции.
  let heroCount = 0;
  let heroUnitCount = 0;
  let heroSpellCount = 0;
  let heroEquipmentCount = 0;

  for (const domain of catalog.domains) {
    for (const faction of domain.factions) {
      const factionId = factionIds.get(faction.tech_name);
      if (!factionId) continue;

      for (const [index, hero] of faction.heroes.entries()) {
        const saved = await prisma.hero.upsert({
          where: { slug: hero.techName },
          update: {
            externalId: hero.id,
            name: hero.name,
            nameEn: hero.nameEn,
            points: hero.pointCost,
            imageUrl: hero.image,
            cardImageUrl: hero.cardImage,
            cardBackImageUrl: hero.cardBackImage,
            sortOrder: index,
            factionId,
          },
          create: {
            externalId: hero.id,
            slug: hero.techName,
            name: hero.name,
            nameEn: hero.nameEn,
            points: hero.pointCost,
            imageUrl: hero.image,
            cardImageUrl: hero.cardImage,
            cardBackImageUrl: hero.cardBackImage,
            sortOrder: index,
            factionId,
          },
        });

        heroCount += 1;

        // --- юниты лидера ---
        const desiredUnits: string[] = [];

        for (const [optionIndex, option] of hero.units.entries()) {
          const unitId = unitIds.get(option.techName);
          if (!unitId) continue;

          const optionRecord = await prisma.heroUnit.upsert({
            where: { heroId_unitId: { heroId: saved.id, unitId } },
            update: {
              limit: option.limit,
              points: option.pointCost,
              weight: option.weight ?? 0,
              sortOrder: optionIndex,
            },
            create: {
              heroId: saved.id,
              unitId,
              limit: option.limit,
              points: option.pointCost,
              weight: option.weight ?? 0,
              sortOrder: optionIndex,
            },
          });

          desiredUnits.push(unitId);
          heroUnitCount += 1;

          const desiredRequirements = option.requires.map((requirement) => requirement.techName);

          for (const requirement of option.requires) {
            await prisma.heroUnitRequirement.upsert({
              where: {
                optionId_unitSlug: {
                  optionId: optionRecord.id,
                  unitSlug: requirement.techName,
                },
              },
              update: {
                unitName: requirement.name,
                limit: requirement.limit,
                points: unitSeeds.get(requirement.techName)?.points ?? null,
                weight: requirement.weight ?? 0,
              },
              create: {
                optionId: optionRecord.id,
                unitSlug: requirement.techName,
                unitName: requirement.name,
                limit: requirement.limit,
                points: unitSeeds.get(requirement.techName)?.points ?? null,
                weight: requirement.weight ?? 0,
              },
            });
          }

          await prisma.heroUnitRequirement.deleteMany({
            where: {
              optionId: optionRecord.id,
              unitSlug: { notIn: desiredRequirements },
            },
          });
        }

        await prisma.heroUnit.deleteMany({
          where: { heroId: saved.id, unitId: { notIn: desiredUnits } },
        });

        // --- заклинания лидера ---
        const desiredSpells: string[] = [];

        for (const [optionIndex, spell] of hero.spells.entries()) {
          const spellId = spellIds.get(spell.techName);
          if (!spellId) continue;

          await prisma.heroSpell.upsert({
            where: { heroId_spellId: { heroId: saved.id, spellId } },
            update: { limit: spell.limit, weight: spell.weight ?? 0, sortOrder: optionIndex },
            create: {
              heroId: saved.id,
              spellId,
              limit: spell.limit,
              weight: spell.weight ?? 0,
              sortOrder: optionIndex,
            },
          });

          desiredSpells.push(spellId);
          heroSpellCount += 1;
        }

        await prisma.heroSpell.deleteMany({
          where: { heroId: saved.id, spellId: { notIn: desiredSpells } },
        });

        // --- снаряжение лидера ---
        const desiredEquipment: string[] = [];

        for (const [optionIndex, item] of hero.equipment.entries()) {
          const equipmentId = equipmentIds.get(item.techName);
          if (!equipmentId) continue;

          await prisma.heroEquipment.upsert({
            where: { heroId_equipmentId: { heroId: saved.id, equipmentId } },
            update: {
              limit: item.limit,
              points: item.pointCost,
              weight: item.weight ?? 0,
              sortOrder: optionIndex,
            },
            create: {
              heroId: saved.id,
              equipmentId,
              limit: item.limit,
              points: item.pointCost,
              weight: item.weight ?? 0,
              sortOrder: optionIndex,
            },
          });

          desiredEquipment.push(equipmentId);
          heroEquipmentCount += 1;
        }

        await prisma.heroEquipment.deleteMany({
          where: { heroId: saved.id, equipmentId: { notIn: desiredEquipment } },
        });
      }
    }
  }

  // 7. Убираем записи, которых больше нет в каталоге.
  await prisma.hero.deleteMany({ where: { slug: { notIn: [...catalog.domains.flatMap((domain) => domain.factions.flatMap((faction) => faction.heroes.map((hero) => hero.techName)))] } } });
  await prisma.faction.deleteMany({ where: { slug: { notIn: [...factionIds.keys()] } } });
  await prisma.domain.deleteMany({ where: { slug: { notIn: [...domainIds.keys()] } } });
  await prisma.unit.deleteMany({ where: { slug: { notIn: [...unitIds.keys()] } } });
  await prisma.spell.deleteMany({ where: { slug: { notIn: [...spellIds.keys()] } } });
  await prisma.equipment.deleteMany({ where: { slug: { notIn: [...equipmentIds.keys()] } } });

  console.log(
    [
      "База заполнена:",
      `${catalog.domains.length} доменов`,
      `${factionCount} фракций`,
      `${heroCount} лидеров`,
      `${unitIds.size} юнитов`,
      `${spellIds.size} заклинаний`,
      `${equipmentIds.size} предметов снаряжения`,
      `${heroUnitCount} связей лидер→юнит`,
      `${heroSpellCount} связей лидер→заклинание`,
      `${heroEquipmentCount} связей лидер→снаряжение`,
    ].join(" "),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
