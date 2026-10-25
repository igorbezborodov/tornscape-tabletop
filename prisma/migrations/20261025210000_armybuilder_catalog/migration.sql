-- Переход к каталогу armybuilder.torn-world.com.
-- Старые таблицы содержали только демо-данные (2 фракции, 3 юнита), которые
-- seed.ts всё равно перезаписывает из data/torn-catalog.json, поэтому
-- таблицы каталога пересоздаются с нуля.

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "_RosterToUnit";
DROP TABLE "units";
DROP TABLE "rosters";
DROP TABLE "factions";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "domains" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "externalId" INTEGER,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "factions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "externalId" INTEGER,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "domainId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "factions_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "domains" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "heroes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "externalId" INTEGER,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "points" INTEGER NOT NULL DEFAULT 0,
    "imageUrl" TEXT,
    "cardImageUrl" TEXT,
    "cardBackImageUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "factionId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "heroes_factionId_fkey" FOREIGN KEY ("factionId") REFERENCES "factions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "units" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "externalId" INTEGER,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "limit" INTEGER NOT NULL DEFAULT 1,
    "uniqKey" TEXT,
    "imageUrl" TEXT,
    "cardImageUrl" TEXT,
    "hp" INTEGER,
    "maxHp" INTEGER,
    "movement" INTEGER,
    "attack" INTEGER,
    "defense" INTEGER,
    "specialRules" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "hero_units" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "heroId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "limit" INTEGER NOT NULL DEFAULT 1,
    "points" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "hero_units_heroId_fkey" FOREIGN KEY ("heroId") REFERENCES "heroes" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "hero_units_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "hero_unit_requirements" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "optionId" TEXT NOT NULL,
    "unitSlug" TEXT NOT NULL,
    "unitName" TEXT NOT NULL,
    "limit" INTEGER NOT NULL DEFAULT 1,
    "points" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "hero_unit_requirements_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "hero_units" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "spells" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "externalId" INTEGER,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "limit" INTEGER NOT NULL DEFAULT 1,
    "domainSlug" TEXT,
    "domainsJson" TEXT,
    "imageUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "hero_spells" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "heroId" TEXT NOT NULL,
    "spellId" TEXT NOT NULL,
    "limit" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "hero_spells_heroId_fkey" FOREIGN KEY ("heroId") REFERENCES "heroes" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "hero_spells_spellId_fkey" FOREIGN KEY ("spellId") REFERENCES "spells" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "equipment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "externalId" INTEGER,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "limit" INTEGER NOT NULL DEFAULT 1,
    "imageUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "hero_equipment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "heroId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "limit" INTEGER NOT NULL DEFAULT 1,
    "points" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "hero_equipment_heroId_fkey" FOREIGN KEY ("heroId") REFERENCES "heroes" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "hero_equipment_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "equipment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "roster_formats" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "externalId" INTEGER,
    "points" INTEGER NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "rosters" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "domainId" TEXT,
    "factionId" TEXT,
    "heroId" TEXT,
    "formatId" TEXT,
    "maxPoints" INTEGER NOT NULL DEFAULT 200,
    "points" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "rosters_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "domains" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "rosters_factionId_fkey" FOREIGN KEY ("factionId") REFERENCES "factions" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "rosters_heroId_fkey" FOREIGN KEY ("heroId") REFERENCES "heroes" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "rosters_formatId_fkey" FOREIGN KEY ("formatId") REFERENCES "roster_formats" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "roster_units" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rosterId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "points" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "roster_units_rosterId_fkey" FOREIGN KEY ("rosterId") REFERENCES "rosters" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "roster_units_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "roster_spells" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rosterId" TEXT NOT NULL,
    "spellId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "roster_spells_rosterId_fkey" FOREIGN KEY ("rosterId") REFERENCES "rosters" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "roster_spells_spellId_fkey" FOREIGN KEY ("spellId") REFERENCES "spells" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "roster_equipment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rosterId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "points" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "roster_equipment_rosterId_fkey" FOREIGN KEY ("rosterId") REFERENCES "rosters" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "roster_equipment_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "equipment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "domains_externalId_key" ON "domains"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "domains_slug_key" ON "domains"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "factions_externalId_key" ON "factions"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "factions_slug_key" ON "factions"("slug");

-- CreateIndex
CREATE INDEX "factions_domainId_idx" ON "factions"("domainId");

-- CreateIndex
CREATE UNIQUE INDEX "heroes_externalId_key" ON "heroes"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "heroes_slug_key" ON "heroes"("slug");

-- CreateIndex
CREATE INDEX "heroes_factionId_idx" ON "heroes"("factionId");

-- CreateIndex
CREATE UNIQUE INDEX "units_externalId_key" ON "units"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "units_slug_key" ON "units"("slug");

-- CreateIndex
CREATE INDEX "units_uniqKey_idx" ON "units"("uniqKey");

-- CreateIndex
CREATE INDEX "hero_units_heroId_idx" ON "hero_units"("heroId");

-- CreateIndex
CREATE UNIQUE INDEX "hero_units_heroId_unitId_key" ON "hero_units"("heroId", "unitId");

-- CreateIndex
CREATE UNIQUE INDEX "hero_unit_requirements_optionId_unitSlug_key" ON "hero_unit_requirements"("optionId", "unitSlug");

-- CreateIndex
CREATE UNIQUE INDEX "spells_externalId_key" ON "spells"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "spells_slug_key" ON "spells"("slug");

-- CreateIndex
CREATE INDEX "spells_domainSlug_idx" ON "spells"("domainSlug");

-- CreateIndex
CREATE INDEX "hero_spells_heroId_idx" ON "hero_spells"("heroId");

-- CreateIndex
CREATE UNIQUE INDEX "hero_spells_heroId_spellId_key" ON "hero_spells"("heroId", "spellId");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_externalId_key" ON "equipment"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_slug_key" ON "equipment"("slug");

-- CreateIndex
CREATE INDEX "hero_equipment_heroId_idx" ON "hero_equipment"("heroId");

-- CreateIndex
CREATE UNIQUE INDEX "hero_equipment_heroId_equipmentId_key" ON "hero_equipment"("heroId", "equipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "roster_formats_externalId_key" ON "roster_formats"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "roster_formats_points_key" ON "roster_formats"("points");

-- CreateIndex
CREATE INDEX "rosters_domainId_idx" ON "rosters"("domainId");

-- CreateIndex
CREATE INDEX "rosters_factionId_idx" ON "rosters"("factionId");

-- CreateIndex
CREATE INDEX "rosters_heroId_idx" ON "rosters"("heroId");

-- CreateIndex
CREATE UNIQUE INDEX "roster_units_rosterId_unitId_key" ON "roster_units"("rosterId", "unitId");

-- CreateIndex
CREATE UNIQUE INDEX "roster_spells_rosterId_spellId_key" ON "roster_spells"("rosterId", "spellId");

-- CreateIndex
CREATE UNIQUE INDEX "roster_equipment_rosterId_equipmentId_key" ON "roster_equipment"("rosterId", "equipmentId");
