-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_hero_spells" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "heroId" TEXT NOT NULL,
    "spellId" TEXT NOT NULL,
    "limit" INTEGER NOT NULL DEFAULT 1,
    "weight" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "hero_spells_heroId_fkey" FOREIGN KEY ("heroId") REFERENCES "heroes" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "hero_spells_spellId_fkey" FOREIGN KEY ("spellId") REFERENCES "spells" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_hero_spells" ("createdAt", "heroId", "id", "limit", "sortOrder", "spellId", "updatedAt") SELECT "createdAt", "heroId", "id", "limit", "sortOrder", "spellId", "updatedAt" FROM "hero_spells";
DROP TABLE "hero_spells";
ALTER TABLE "new_hero_spells" RENAME TO "hero_spells";
CREATE INDEX "hero_spells_heroId_idx" ON "hero_spells"("heroId");
CREATE UNIQUE INDEX "hero_spells_heroId_spellId_key" ON "hero_spells"("heroId", "spellId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
