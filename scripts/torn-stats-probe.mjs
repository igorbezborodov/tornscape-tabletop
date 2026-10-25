// scripts/torn-stats-probe.mjs
// Проверяет, публикует ли torn-world.com (не armybuilder) параметры карт
// (атака/защита/здоровье/умения). Запросы идут из Node, поэтому CORS не мешает.
// Если ни один эндпоинт не отвечает данными — параметры доступны только на
// изображениях карт, и в БД их хранить неоткуда.

const CANDIDATES = [
  "https://torn-world.com/api/dict/v1/units",
  "https://torn-world.com/api/dict/v1/cards",
  "https://torn-world.com/api/dict/v1/names",
  "https://torn-world.com/api/v1/units",
  "https://torn-world.com/api/v1/cards",
  "https://torn-world.com/ru/cards.json",
  "https://torn-world.com/ru/units.json",
  "https://torn-world.com/ru/cards",
  "https://torn-world.com/ru/units",
  "https://torn-world.com/sitemap.xml",
  "https://armybuilder.torn-world.com/api/dict/v1/units",
  "https://armybuilder.torn-world.com/api/dict/v1/cards",
  "https://armybuilder.torn-world.com/api/dict/v1/unit",
  "https://armybuilder.torn-world.com/ru/rosters/unit_details.json?unit_id=9",
  "https://armybuilder.torn-world.com/ru/rosters/select_units.json?hero_id=3",
  "https://armybuilder.torn-world.com/ru/cards.json",
];

const headers = {
  Accept: "application/json, text/html;q=0.9",
  "Accept-Language": "ru",
  "User-Agent": "Mozilla/5.0 (compatible; tornscape-catalog-probe/1.0)",
};

for (const url of CANDIDATES) {
  try {
    const response = await fetch(url, { headers, redirect: "manual" });
    const contentType = response.headers.get("content-type") ?? "";
    const body = await response.text();
    const trimmed = body.replace(/\s+/g, " ").trim();
    console.log(
      [
        String(response.status).padEnd(4),
        contentType.split(";")[0].padEnd(24),
        String(body.length).padStart(7),
        url,
      ].join(" "),
    );
    if (response.ok && contentType.includes("json")) {
      console.log("     ->", trimmed.slice(0, 400));
    }
  } catch (error) {
    console.log("ERR  ", url, "-", error instanceof Error ? error.message : error);
  }
}
