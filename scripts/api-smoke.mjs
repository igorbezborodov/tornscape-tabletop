// Smoke-тест API бэкенда: справочники каталога и валидация POST /api/rosters.
// Запуск: node scripts/api-smoke.mjs (бэкенд должен быть на localhost:3001)

const BASE = process.env.API_URL ?? "http://localhost:3001";

let failures = 0;

const check = (label, condition, extra = "") => {
  const status = condition ? "OK  " : "FAIL";
  if (!condition) failures += 1;
  console.log(`[${status}] ${label}${extra ? ` — ${extra}` : ""}`);
};

const getJson = async (path) => {
  const response = await fetch(`${BASE}${path}`);
  const payload = await response.json().catch(() => null);
  return { status: response.status, payload };
};

const postJson = async (path, body) => {
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  return { status: response.status, payload };
};

const main = async () => {
  const catalog = await getJson("/api/catalog");
  check("GET /api/catalog", catalog.status === 200, `доменов: ${catalog.payload?.domains}`);
  check(
    "каталог загружен",
    catalog.payload?.domains === 4 &&
      catalog.payload?.factions === 9 &&
      catalog.payload?.heroes === 28,
    `${catalog.payload?.units} юнитов, ${catalog.payload?.spells} заклинаний`,
  );
  check(
    "форматы 200/300/400",
    JSON.stringify((catalog.payload?.formats ?? []).map((f) => f.points).sort()) ===
      "[200,300,400]",
  );

  const domains = await getJson("/api/domains");
  check("GET /api/domains", domains.status === 200 && domains.payload.length === 4);
  check(
    "у домена есть счётчик фракций",
    domains.payload.every((domain) => typeof domain.factionCount === "number"),
  );

  const factions = await getJson("/api/factions?domainSlug=creation");
  check("GET /api/factions?domainSlug=creation", factions.status === 200, factions.payload.length);

  const heroes = await getJson("/api/heroes?factionSlug=engeln");
  check("GET /api/heroes?factionSlug=engeln", heroes.status === 200, heroes.payload.length);

  const detail = await getJson("/api/heroes/richard");
  const heroDetail = detail.payload;
  check("GET /api/heroes/richard", detail.status === 200);
  check(
    "карточка содержит юниты/заклинания/снаряжение",
    heroDetail.units.length > 0 &&
      heroDetail.spells.length > 0 &&
      heroDetail.equipment.length > 0,
    `${heroDetail.units.length}/${heroDetail.spells.length}/${heroDetail.equipment.length}`,
  );
  check(
    "есть юнит с требованием (requires)",
    heroDetail.units.some((unit) => unit.requires.length > 0),
  );
  check(
    "есть взаимоисключающие юниты (uniqKey)",
    heroDetail.units.some((unit) => unit.uniqKey !== null),
  );
  check(
    "параметры боя не публикуются API",
    heroDetail.units.every((unit) => unit.specialRules === null),
  );

  const find = (slug, field = "slug") => heroDetail.units.find((unit) => unit[field] === slug);

  const cheap = find("condesator_of_lightning");
  const heavy = find("mul");
  const sword = find("militia_sword");
  const spell = heroDetail.spells[0];
  const item = heroDetail.equipment.find((entry) => entry.slug === "antidote") ?? heroDetail.equipment[0];

  const expected =
    heroDetail.hero.points +
    cheap.points * 2 +
    heavy.points +
    sword.points +
    item.points;

  const valid = await postJson("/api/rosters", {
    name: "Smoke: валидный ростер",
    heroSlug: "richard",
    formatPoints: 200,
    units: [
      { slug: cheap.slug, quantity: 2 },
      { slug: heavy.slug, quantity: 1 },
      { slug: sword.slug, quantity: 1 },
    ],
    spells: [{ slug: spell.slug, quantity: 1 }],
    equipment: [{ slug: item.slug, quantity: 1 }],
  });

  check("POST /api/rosters (валидный)", valid.status === 201, `очков: ${valid.payload?.points}`);
  check("очки посчитаны верно", valid.payload?.points === expected, `ожидалось ${expected}`);
  check(
    "связи ростера сохранены",
    valid.payload?.units.length === 3 &&
      valid.payload?.spells.length === 1 &&
      valid.payload?.equipment.length === 1,
  );

  const overLimit = await postJson("/api/rosters", {
    heroSlug: "richard",
    formatPoints: 400,
    units: [{ slug: cheap.slug, quantity: cheap.limit + 5 }],
  });
  check(
    "отклоняется превышение лимита",
    overLimit.status === 422,
    overLimit.payload?.problems?.[0],
  );

  const overBudget = await postJson("/api/rosters", {
    heroSlug: "richard",
    formatPoints: 200,
    units: [{ slug: heavy.slug, quantity: heavy.limit }].concat(
      Array.from({ length: 40 }, () => ({ slug: sword.slug, quantity: sword.limit })),
    ),
  });
  check("отклоняется превышение бюджета", overBudget.status === 422);

  const foreignUnit = await postJson("/api/rosters", {
    heroSlug: "richard",
    formatPoints: 200,
    units: [{ slug: "not_a_real_unit", quantity: 1 }],
  });
  check("отклоняется недоступный юнит", foreignUnit.status === 422);

  const uniqUnits = heroDetail.units.filter((unit) => unit.uniqKey === "taorgas");
  if (uniqUnits.length > 1) {
    const uniqResponse = await postJson("/api/rosters", {
      heroSlug: "richard",
      formatPoints: 400,
      units: uniqUnits.slice(0, 2).map((unit) => ({ slug: unit.slug, quantity: 1 })),
    });
    check("отклоняются взаимоисключающие юниты", uniqResponse.status === 422);
  } else {
    check("uniqKey-группа найдена для проверки", false, "нужно ≥2 юнита");
  }

  const noHero = await postJson("/api/rosters", { units: [] });
  check("требуется лидер", noHero.status === 400);

  const missing = await getJson("/api/heroes/nope");
  check("404 для неизвестного лидера", missing.status === 404);

  console.log(failures === 0 ? "\nВсе проверки пройдены." : `\nПровалено проверок: ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
};

main().catch((error) => {
  console.error("Smoke-тест упал:", error);
  process.exit(1);
});
