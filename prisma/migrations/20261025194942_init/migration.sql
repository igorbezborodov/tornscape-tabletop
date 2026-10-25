-- CreateTable
CREATE TABLE "factions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "units" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "factionId" TEXT NOT NULL,
    "hp" INTEGER NOT NULL DEFAULT 1,
    "maxHp" INTEGER NOT NULL DEFAULT 1,
    "movement" INTEGER NOT NULL DEFAULT 1,
    "attack" INTEGER NOT NULL DEFAULT 1,
    "defense" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "units_factionId_fkey" FOREIGN KEY ("factionId") REFERENCES "factions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "rosters" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "factionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "rosters_factionId_fkey" FOREIGN KEY ("factionId") REFERENCES "factions" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_RosterToUnit" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_RosterToUnit_A_fkey" FOREIGN KEY ("A") REFERENCES "rosters" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_RosterToUnit_B_fkey" FOREIGN KEY ("B") REFERENCES "units" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "factions_slug_key" ON "factions"("slug");

-- CreateIndex
CREATE INDEX "units_factionId_idx" ON "units"("factionId");

-- CreateIndex
CREATE UNIQUE INDEX "units_factionId_name_key" ON "units"("factionId", "name");

-- CreateIndex
CREATE INDEX "rosters_factionId_idx" ON "rosters"("factionId");

-- CreateIndex
CREATE UNIQUE INDEX "_RosterToUnit_AB_unique" ON "_RosterToUnit"("A", "B");

-- CreateIndex
CREATE INDEX "_RosterToUnit_B_index" ON "_RosterToUnit"("B");
