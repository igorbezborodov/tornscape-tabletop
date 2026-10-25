// seed.ts
// Prisma 7 requires a driver adapter to instantiate PrismaClient.
import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "./src/generated/prisma/client.js";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

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

const adapter = new PrismaBetterSqlite3({
  url: resolveDatabaseUrl(process.env["DATABASE_URL"] ?? "file:./prisma/dev.db"),
});

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Начинаем заполнение базы данных...");

  // 1. Создаем фракции (upsert по уникальному slug -> скрипт можно запускать повторно)
  const krigmark = await prisma.faction.upsert({
    where: { slug: "krigmark" },
    update: { name: "Кригмарк" },
    create: {
      slug: "krigmark",
      name: "Кригмарк",
      description: "Суровая северная фракция, полагающаяся на стойкость и ближний бой.",
    },
  });

  const angelin = await prisma.faction.upsert({
    where: { slug: "angelin" },
    update: { name: "Ангельн" },
    create: {
      slug: "angelin",
      name: "Ангельн",
      description: "Фракция дисциплинированных стрелков и дальнего боя.",
    },
  });

  console.log("Фракции созданы:", {
    krigmark: krigmark.name,
    angelin: angelin.name,
  });

  // 2. Создаем юнитов
  const units = [
    {
      name: "Воин Кригмарка",
      factionId: krigmark.id,
      hp: 3,
      maxHp: 3,
      movement: 3,
      attack: 2,
      defense: 2,
    },
    {
      name: "Стрелок Ангельна",
      factionId: angelin.id,
      hp: 2,
      maxHp: 2,
      movement: 2,
      attack: 3,
      defense: 1,
    },
    {
      name: "Капитан Кригмарка",
      factionId: krigmark.id,
      hp: 5,
      maxHp: 5,
      movement: 3,
      attack: 3,
      defense: 3,
    },
  ];

  for (const unit of units) {
    const { factionId, name, ...stats } = unit;

    await prisma.unit.upsert({
      where: { factionId_name: { factionId, name } },
      update: stats,
      create: { factionId, name, ...stats },
    });
  }

  console.log(`Добавлено ${units.length} юнитов.`);
  console.log("База данных успешно заполнена!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
