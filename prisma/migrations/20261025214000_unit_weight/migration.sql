-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_equipment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "externalId" INTEGER,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "limit" INTEGER NOT NULL DEFAULT 1,
    "weight" INTEGER NOT NULL DEFAULT 0,
    "imageUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_equipment" ("createdAt", "externalId", "id", "imageUrl", "limit", "name", "points", "slug", "updatedAt") SELECT "createdAt", "externalId", "id", "imageUrl", "limit", "name", "points", "slug", "updatedAt" FROM "equipment";
DROP TABLE "equipment";
ALTER TABLE "new_equipment" RENAME TO "equipment";
CREATE UNIQUE INDEX "equipment_externalId_key" ON "equipment"("externalId");
CREATE UNIQUE INDEX "equipment_slug_key" ON "equipment"("slug");
CREATE TABLE "new_hero_equipment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "heroId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "limit" INTEGER NOT NULL DEFAULT 1,
    "points" INTEGER NOT NULL DEFAULT 0,
    "weight" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "hero_equipment_heroId_fkey" FOREIGN KEY ("heroId") REFERENCES "heroes" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "hero_equipment_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "equipment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_hero_equipment" ("createdAt", "equipmentId", "heroId", "id", "limit", "points", "sortOrder", "updatedAt") SELECT "createdAt", "equipmentId", "heroId", "id", "limit", "points", "sortOrder", "updatedAt" FROM "hero_equipment";
DROP TABLE "hero_equipment";
ALTER TABLE "new_hero_equipment" RENAME TO "hero_equipment";
CREATE INDEX "hero_equipment_heroId_idx" ON "hero_equipment"("heroId");
CREATE UNIQUE INDEX "hero_equipment_heroId_equipmentId_key" ON "hero_equipment"("heroId", "equipmentId");
CREATE TABLE "new_hero_unit_requirements" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "optionId" TEXT NOT NULL,
    "unitSlug" TEXT NOT NULL,
    "unitName" TEXT NOT NULL,
    "limit" INTEGER NOT NULL DEFAULT 1,
    "points" INTEGER,
    "weight" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "hero_unit_requirements_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "hero_units" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_hero_unit_requirements" ("createdAt", "id", "limit", "optionId", "points", "unitName", "unitSlug", "updatedAt") SELECT "createdAt", "id", "limit", "optionId", "points", "unitName", "unitSlug", "updatedAt" FROM "hero_unit_requirements";
DROP TABLE "hero_unit_requirements";
ALTER TABLE "new_hero_unit_requirements" RENAME TO "hero_unit_requirements";
CREATE UNIQUE INDEX "hero_unit_requirements_optionId_unitSlug_key" ON "hero_unit_requirements"("optionId", "unitSlug");
CREATE TABLE "new_hero_units" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "heroId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "limit" INTEGER NOT NULL DEFAULT 1,
    "points" INTEGER NOT NULL DEFAULT 0,
    "weight" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "hero_units_heroId_fkey" FOREIGN KEY ("heroId") REFERENCES "heroes" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "hero_units_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_hero_units" ("createdAt", "heroId", "id", "limit", "points", "sortOrder", "unitId", "updatedAt") SELECT "createdAt", "heroId", "id", "limit", "points", "sortOrder", "unitId", "updatedAt" FROM "hero_units";
DROP TABLE "hero_units";
ALTER TABLE "new_hero_units" RENAME TO "hero_units";
CREATE INDEX "hero_units_heroId_idx" ON "hero_units"("heroId");
CREATE UNIQUE INDEX "hero_units_heroId_unitId_key" ON "hero_units"("heroId", "unitId");
CREATE TABLE "new_spells" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "externalId" INTEGER,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "limit" INTEGER NOT NULL DEFAULT 1,
    "weight" INTEGER NOT NULL DEFAULT 0,
    "domainSlug" TEXT,
    "domainsJson" TEXT,
    "imageUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_spells" ("createdAt", "domainSlug", "domainsJson", "externalId", "id", "imageUrl", "limit", "name", "slug", "updatedAt") SELECT "createdAt", "domainSlug", "domainsJson", "externalId", "id", "imageUrl", "limit", "name", "slug", "updatedAt" FROM "spells";
DROP TABLE "spells";
ALTER TABLE "new_spells" RENAME TO "spells";
CREATE UNIQUE INDEX "spells_externalId_key" ON "spells"("externalId");
CREATE UNIQUE INDEX "spells_slug_key" ON "spells"("slug");
CREATE INDEX "spells_domainSlug_idx" ON "spells"("domainSlug");
CREATE TABLE "new_units" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "externalId" INTEGER,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "limit" INTEGER NOT NULL DEFAULT 1,
    "uniqKey" TEXT,
    "imageUrl" TEXT,
    "cardImageUrl" TEXT,
    "cardBackImageUrl" TEXT,
    "weight" INTEGER NOT NULL DEFAULT 0,
    "hp" INTEGER,
    "maxHp" INTEGER,
    "movement" INTEGER,
    "attack" INTEGER,
    "defense" INTEGER,
    "specialRules" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_units" ("attack", "cardBackImageUrl", "cardImageUrl", "createdAt", "defense", "externalId", "hp", "id", "imageUrl", "limit", "maxHp", "movement", "name", "points", "slug", "specialRules", "uniqKey", "updatedAt") SELECT "attack", "cardBackImageUrl", "cardImageUrl", "createdAt", "defense", "externalId", "hp", "id", "imageUrl", "limit", "maxHp", "movement", "name", "points", "slug", "specialRules", "uniqKey", "updatedAt" FROM "units";
DROP TABLE "units";
ALTER TABLE "new_units" RENAME TO "units";
CREATE UNIQUE INDEX "units_externalId_key" ON "units"("externalId");
CREATE UNIQUE INDEX "units_slug_key" ON "units"("slug");
CREATE INDEX "units_uniqKey_idx" ON "units"("uniqKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
