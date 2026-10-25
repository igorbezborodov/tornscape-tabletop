// server/index.ts
// REST API поверх каталога armybuilder.torn-world.com.
// Порядок данных повторяет оригинал: домен → фракция → лидер → юниты,
// заклинания и снаряжение с лимитами количества.
import express from "express";
import cors from "cors";
import { prisma } from "./prisma.js";

const app = express();
const PORT = Number(process.env["PORT"] ?? 3001); // Отдельный порт от Vite (5173)

// Middleware
app.use(cors()); // Разрешаем запросы с фронтенда
app.use(express.json()); // Учим сервер принимать JSON

// --- ЭНДПОИНТЫ ---

// 0. Корневой маршрут — краткая справка по API
app.get("/", (_req, res) => {
  res.json({
    name: "Tornscape Tabletop API",
    source: "https://armybuilder.torn-world.com",
    endpoints: [
      "GET /api/health",
      "GET /api/catalog",
      "GET /api/formats",
      "GET /api/domains",
      "GET /api/factions?domainSlug=<slug>",
      "GET /api/heroes?factionSlug=<slug>",
      "GET /api/heroes/:slug",
      "GET /api/heroes/:slug/roster",
      "GET /api/units?heroSlug=<slug>",
    ],
  });
});

// 1. Проверка живости сервера
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// 2. Размеры каталога и доступные форматы ростера
app.get("/api/catalog", async (_req, res) => {
  try {
    const [domains, factions, heroes, units, spells, equipment, formats] = await Promise.all([
      prisma.domain.count(),
      prisma.faction.count(),
      prisma.hero.count(),
      prisma.unit.count(),
      prisma.spell.count(),
      prisma.equipment.count(),
      prisma.rosterFormat.findMany({ orderBy: { points: "asc" } }),
    ]);

    res.json({ domains, factions, heroes, units, spells, equipment, formats });
  } catch (error) {
    console.error("Не удалось получить сводку каталога:", error);
    res.status(500).json({ error: "Ошибка при получении сводки каталога" });
  }
});

// 3. Форматы ростера (200 / 300 / 400 очков)
app.get("/api/formats", async (_req, res) => {
  try {
    const formats = await prisma.rosterFormat.findMany({ orderBy: { points: "asc" } });
    res.json(formats);
  } catch (error) {
    console.error("Не удалось получить форматы:", error);
    res.status(500).json({ error: "Ошибка при получении форматов" });
  }
});

// 4. Домены
app.get("/api/domains", async (_req, res) => {
  try {
    const domains = await prisma.domain.findMany({
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { factions: true } } },
    });

    res.json(
      domains.map((domain) => ({
        id: domain.id,
        slug: domain.slug,
        name: domain.name,
        imageUrl: domain.imageUrl,
        sortOrder: domain.sortOrder,
        factionCount: domain._count.factions,
      })),
    );
  } catch (error) {
    console.error("Не удалось получить домены:", error);
    res.status(500).json({ error: "Ошибка при получении доменов" });
  }
});

// 5. Фракции (можно фильтровать по домену)
app.get("/api/factions", async (req, res) => {
  try {
    const domainSlug = req.query["domainSlug"] ? String(req.query["domainSlug"]) : undefined;

    const factions = await prisma.faction.findMany({
      where: domainSlug ? { domain: { slug: domainSlug } } : undefined,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        domain: { select: { slug: true } },
        _count: { select: { heroes: true } },
      },
    });

    res.json(
      factions.map((faction) => ({
        id: faction.id,
        slug: faction.slug,
        name: faction.name,
        description: faction.description,
        imageUrl: faction.imageUrl,
        domainId: faction.domainId,
        domainSlug: faction.domain?.slug ?? null,
        sortOrder: faction.sortOrder,
        heroCount: faction._count.heroes,
      })),
    );
  } catch (error) {
    console.error("Не удалось получить фракции:", error);
    res.status(500).json({ error: "Ошибка при получении фракций" });
  }
});

// 6. Лидеры (можно фильтровать по фракции)
app.get("/api/heroes", async (req, res) => {
  try {
    const factionSlug = req.query["factionSlug"] ? String(req.query["factionSlug"]) : undefined;

    const heroes = await prisma.hero.findMany({
      where: factionSlug ? { faction: { slug: factionSlug } } : undefined,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        faction: { select: { slug: true, name: true, domain: { select: { slug: true } } } },
        _count: { select: { unitOptions: true, spellOptions: true, equipmentOptions: true } },
      },
    });

    res.json(
      heroes.map((hero) => ({
        id: hero.id,
        slug: hero.slug,
        name: hero.name,
        nameEn: hero.nameEn,
        points: hero.points,
        imageUrl: hero.imageUrl,
        cardImageUrl: hero.cardImageUrl,
        factionId: hero.factionId,
        factionSlug: hero.faction.slug,
        factionName: hero.faction.name,
        domainSlug: hero.faction.domain?.slug ?? null,
        unitCount: hero._count.unitOptions,
        spellCount: hero._count.spellOptions,
        equipmentCount: hero._count.equipmentOptions,
      })),
    );
  } catch (error) {
    console.error("Не удалось получить лидеров:", error);
    res.status(500).json({ error: "Ошибка при получении лидеров" });
  }
});

// 7. Полная карточка лидера: юниты, заклинания и снаряжение с лимитами
app.get("/api/heroes/:slug", async (req, res) => {
  try {
    const hero = await prisma.hero.findUnique({
      where: { slug: req.params.slug },
      include: {
        faction: { select: { slug: true, name: true, domain: { select: { slug: true } } } },
        // Как на armybuilder: списки выбора отсортированы по weight по
        // возрастанию (сначала дешёвые отряды, в конце уникальные персонажи).
        unitOptions: {
          orderBy: [{ weight: "asc" }, { sortOrder: "asc" }],
          include: {
            unit: true,
            requires: { orderBy: [{ weight: "asc" }, { unitName: "asc" }] },
          },
        },
        spellOptions: {
          orderBy: [{ weight: "asc" }, { sortOrder: "asc" }],
          include: { spell: true },
        },
        equipmentOptions: {
          orderBy: [{ weight: "asc" }, { sortOrder: "asc" }],
          include: { equipment: true },
        },
      },
    });

    if (!hero) {
      res.status(404).json({ error: "Лидер не найден" });
      return;
    }

    // Спутники приходят вложенными требованиями: собираем их отдельно,
    // чтобы интерфейс знал, какой родитель их открывает.
    const requirements = await prisma.heroUnitRequirement.findMany({
      where: { option: { heroId: hero.id } },
      include: { option: { include: { unit: true } } },
      orderBy: [{ weight: "asc" }, { unitName: "asc" }],
    });
    const requirementSlugs = [...new Set(requirements.map((item) => item.unitSlug))];
    const companionCatalog = await prisma.unit.findMany({
      where: { slug: { in: requirementSlugs } },
    });
    const companionBySlug = new Map(companionCatalog.map((unit) => [unit.slug, unit]));
    const companionUnits = requirements.map((requirement) => ({
      requirement,
      unit: companionBySlug.get(requirement.unitSlug) ?? null,
    }));

    res.json({
      hero: {
        id: hero.id,
        slug: hero.slug,
        name: hero.name,
        nameEn: hero.nameEn,
        points: hero.points,
        imageUrl: hero.imageUrl,
        cardImageUrl: hero.cardImageUrl,
        factionId: hero.factionId,
        factionSlug: hero.faction.slug,
        factionName: hero.faction.name,
        domainSlug: hero.faction.domain?.slug ?? null,
        unitCount: hero.unitOptions.length,
        spellCount: hero.spellOptions.length,
        equipmentCount: hero.equipmentOptions.length,
      },
      units: hero.unitOptions.map((option) => ({
        optionId: option.id,
        unitId: option.unitId,
        slug: option.unit.slug,
        name: option.unit.name,
        points: option.points,
        limit: option.limit,
        weight: option.weight,
        uniqKey: option.unit.uniqKey,
        imageUrl: option.unit.imageUrl,
        cardImageUrl: option.unit.cardImageUrl,
        cardBackImageUrl: option.unit.cardBackImageUrl,
        specialRules: option.unit.specialRules,
        requires: option.requires.map((requirement) => ({
          slug: requirement.unitSlug,
          name: requirement.unitName,
          limit: requirement.limit,
          points: requirement.points,
          weight: requirement.weight,
        })),
      })),
      // Привязанные юниты (Гомункул, Боевой пёс, Штальхунд …): слаг спутника
      // хранится в HeroUnitRequirement, изображения — в справочнике Unit.
      companions: companionUnits.map(({ requirement, unit }) => ({
        slug: requirement.unitSlug,
        name: requirement.unitName,
        // Спутник стоит своих очков — в API он приходит с point_cost.
        points: requirement.points ?? unit?.points ?? 0,
        parentSlug: requirement.option.unit.slug,
        parentName: requirement.option.unit.name,
        parentWeight: requirement.option.weight,
        limit: requirement.limit,
        weight: requirement.weight,
        imageUrl: unit?.imageUrl ?? null,
        cardImageUrl: unit?.cardImageUrl ?? null,
        cardBackImageUrl: unit?.cardBackImageUrl ?? null,
      })),
      spells: hero.spellOptions.map((option) => ({
        optionId: option.id,
        spellId: option.spellId,
        slug: option.spell.slug,
        name: option.spell.name,
        limit: option.limit,
        weight: option.weight,
        domainSlug: option.spell.domainSlug,
        imageUrl: option.spell.imageUrl,
      })),
      equipment: hero.equipmentOptions.map((option) => ({
        optionId: option.id,
        equipmentId: option.equipmentId,
        slug: option.equipment.slug,
        name: option.equipment.name,
        points: option.points,
        limit: option.limit,
        weight: option.weight,
        imageUrl: option.equipment.imageUrl,
      })),
    });
  } catch (error) {
    console.error("Не удалось получить лидера:", error);
    res.status(500).json({ error: "Ошибка при получении лидера" });
  }
});

// 8. Универсальный список юнитов: все или доступные конкретному лидеру
app.get("/api/units", async (req, res) => {
  try {
    const heroSlug = req.query["heroSlug"] ? String(req.query["heroSlug"]) : undefined;

    if (heroSlug) {
      const hero = await prisma.hero.findUnique({
        where: { slug: heroSlug },
        include: {
          unitOptions: {
            include: { unit: true },
            orderBy: [{ weight: "asc" }, { sortOrder: "asc" }],
          },
        },
      });

      if (!hero) {
        res.status(404).json({ error: "Лидер не найден" });
        return;
      }

      res.json(
        hero.unitOptions.map((option) => ({
          id: option.unitId,
          slug: option.unit.slug,
          name: option.unit.name,
          points: option.points,
          limit: option.limit,
          weight: option.weight,
          uniqKey: option.unit.uniqKey,
          imageUrl: option.unit.imageUrl,
          cardImageUrl: option.unit.cardImageUrl,
          cardBackImageUrl: option.unit.cardBackImageUrl,
          specialRules: option.unit.specialRules,
        })),
      );
      return;
    }

    const units = await prisma.unit.findMany({ orderBy: { name: "asc" } });
    res.json(units);
  } catch (error) {
    console.error("Не удалось получить юнитов:", error);
    res.status(500).json({ error: "Ошибка при получении юнитов" });
  }
});

// 9. Юнит по ID или слагу
app.get("/api/units/:idOrSlug", async (req, res) => {
  try {
    const unit = await prisma.unit.findFirst({
      where: { OR: [{ id: req.params.idOrSlug }, { slug: req.params.idOrSlug }] },
    });

    if (!unit) {
      res.status(404).json({ error: "Юнит не найден" });
      return;
    }

    res.json(unit);
  } catch (error) {
    console.error("Не удалось получить юнита:", error);
    res.status(500).json({ error: "Ошибка при получении юнита" });
  }
});

// 10. Сохранение ростера: сервер повторно проверяет лимиты и бюджет очков
app.post("/api/rosters", async (req, res) => {
  try {
    const body = req.body as {
      name?: string;
      domainSlug?: string;
      factionSlug?: string;
      heroSlug?: string;
      formatPoints?: number;
      units?: { slug: string; quantity: number }[];
      companions?: { slug: string; quantity: number }[];
      spells?: { slug: string; quantity: number }[];
      equipment?: { slug: string; quantity: number }[];
    };

    if (!body.heroSlug) {
      res.status(400).json({ error: "Не выбран лидер" });
      return;
    }

    const hero = await prisma.hero.findUnique({
      where: { slug: body.heroSlug },
      include: {
        faction: { include: { domain: true } },
        unitOptions: { include: { unit: true } },
        spellOptions: { include: { spell: true } },
        equipmentOptions: { include: { equipment: true } },
      },
    });

    if (!hero) {
      res.status(404).json({ error: "Лидер не найден" });
      return;
    }

    const formatPoints = Number(body.formatPoints ?? 200);
    const problems: string[] = [];
    let points = hero.points;

    // Требования всех юнитов лидера — из них собираются спутники.
    const requirementRows = await prisma.heroUnitRequirement.findMany({
      where: { option: { heroId: hero.id } },
      include: { option: { include: { unit: true } } },
    });
    const requirementsFlat = requirementRows.map((row) => ({
      unitSlug: row.unitSlug,
      unitName: row.unitName,
      limit: row.limit,
      points: row.points ?? 0,
      parentSlug: row.option.unit.slug,
      parentName: row.option.unit.name,
    }));

    const selectedUnits = (body.units ?? []).map((entry) => {
      const option = hero.unitOptions.find((item) => item.unit.slug === entry.slug);

      if (!option) {
        problems.push(`Юнит «${entry.slug}» недоступен лидеру ${hero.name}.`);
        return null;
      }

      if (entry.quantity < 1 || entry.quantity > option.limit) {
        problems.push(`«${option.unit.name}»: допустимо от 1 до ${option.limit} шт.`);
      }

      points += option.points * entry.quantity;

      return { unitId: option.unitId, quantity: entry.quantity, points: option.points, uniqKey: option.unit.uniqKey, name: option.unit.name };
    });

    const selectedSpells = (body.spells ?? []).flatMap((entry) => {
      const option = hero.spellOptions.find((item) => item.spell.slug === entry.slug);
      if (!option) {
        problems.push(`Заклинание «${entry.slug}» недоступно лидеру ${hero.name}.`);
        return [];
      }
      if (entry.quantity < 1 || entry.quantity > option.limit) {
        problems.push(`Заклинание «${option.spell.name}»: допустимо от 1 до ${option.limit} шт.`);
      }
      return [{ spellId: option.spellId, quantity: entry.quantity }];
    });

    const selectedEquipment = (body.equipment ?? []).flatMap((entry) => {
      const option = hero.equipmentOptions.find((item) => item.equipment.slug === entry.slug);
      if (!option) {
        problems.push(`Снаряжение «${entry.slug}» недоступно лидеру ${hero.name}.`);
        return [];
      }
      if (entry.quantity < 1 || entry.quantity > option.limit) {
        problems.push(`Снаряжение «${option.equipment.name}»: допустимо от 1 до ${option.limit} шт.`);
      }
      points += option.points * entry.quantity;
      return [{ equipmentId: option.equipmentId, quantity: entry.quantity, points: option.points }];
    });

    // Спутники: лимит кратен количеству родителей в ростере — как на
    // armybuilder, где max_quantity = родители × вложенный лимит.
    for (const entry of body.companions ?? []) {
      const requirement = requirementsFlat.find((item) => item.unitSlug === entry.slug);

      if (!requirement) {
        problems.push(`Юнит «${entry.slug}» не является спутником лидера ${hero.name}.`);
        continue;
      }

      const parentInBody = (body.units ?? []).find(
        (unit) => unit.slug === requirement.parentSlug,
      );
      const parentCount = parentInBody?.quantity ?? 0;
      const limit = requirement.limit * parentCount;

      if (entry.quantity < 1 || entry.quantity > limit) {
        problems.push(
          `«${requirement.unitName}»: допустимо от 1 до ${limit} шт. (по ${requirement.limit} на каждого «${requirement.parentName}»).`,
        );
      }

      // Спутник стоит своих очков — учитываем их в бюджете ростера.
      points += requirement.points * entry.quantity;
    }

    // Взаимоисключающие юниты: только один вариант на uniqKey.
    const uniqGroups = new Map<string, string[]>();

    for (const unit of selectedUnits) {
      if (!unit || !unit.uniqKey) continue;
      const group = uniqGroups.get(unit.uniqKey) ?? [];
      group.push(unit.name);
      uniqGroups.set(unit.uniqKey, group);
    }

    for (const names of uniqGroups.values()) {
      if (names.length > 1) {
        problems.push(`Взаимоисключающие юниты: ${names.join(", ")}.`);
      }
    }

    if (points > formatPoints) {
      problems.push(`Превышен бюджет: ${points} из ${formatPoints} очков.`);
    }

    if (problems.length > 0) {
      res.status(422).json({ error: "Ростер не прошёл проверку", problems });
      return;
    }

    const format = await prisma.rosterFormat.findFirst({ where: { points: formatPoints } });

    const roster = await prisma.roster.create({
      data: {
        name: body.name?.trim() || `Ростер ${hero.name}`,
        domainId: hero.faction.domainId,
        factionId: hero.factionId,
        heroId: hero.id,
        formatId: format?.id ?? null,
        maxPoints: formatPoints,
        points,
        units: {
          create: selectedUnits.flatMap((unit) =>
            unit ? [{ unitId: unit.unitId, quantity: unit.quantity, points: unit.points }] : [],
          ),
        },
        spells: { create: selectedSpells },
        equipment: { create: selectedEquipment },
      },
      include: { units: true, spells: true, equipment: true },
    });

    res.status(201).json(roster);
  } catch (error) {
    console.error("Не удалось сохранить ростер:", error);
    res.status(500).json({ error: "Ошибка при сохранении ростера" });
  }
});

// 404 для неизвестных маршрутов (в формате JSON, а не HTML от Express)
app.use((_req, res) => {
  res.status(404).json({ error: "Маршрут не найден" });
});

// Запуск сервера
const server = app.listen(PORT, () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
});

// Аккуратно закрываем соединение с БД при остановке процесса
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => {
      void prisma.$disconnect().finally(() => process.exit(0));
    });
  });
}
