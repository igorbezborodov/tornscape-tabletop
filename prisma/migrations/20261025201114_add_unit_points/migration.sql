-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_units" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "factionId" TEXT NOT NULL,
    "hp" INTEGER NOT NULL DEFAULT 1,
    "maxHp" INTEGER NOT NULL DEFAULT 1,
    "movement" INTEGER NOT NULL DEFAULT 1,
    "attack" INTEGER NOT NULL DEFAULT 1,
    "defense" INTEGER NOT NULL DEFAULT 1,
    "points" INTEGER NOT NULL DEFAULT 10,
    "specialRules" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "units_factionId_fkey" FOREIGN KEY ("factionId") REFERENCES "factions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_units" ("attack", "createdAt", "defense", "factionId", "hp", "id", "maxHp", "movement", "name", "updatedAt") SELECT "attack", "createdAt", "defense", "factionId", "hp", "id", "maxHp", "movement", "name", "updatedAt" FROM "units";
DROP TABLE "units";
ALTER TABLE "new_units" RENAME TO "units";
CREATE INDEX "units_factionId_idx" ON "units"("factionId");
CREATE UNIQUE INDEX "units_factionId_name_key" ON "units"("factionId", "name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
