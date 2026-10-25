// server/prisma.ts
// Prisma 7 requires a driver adapter, and the client is generated into
// src/generated/prisma (see prisma/schema.prisma). The adapter resolves
// `file:./prisma/dev.db` against process.cwd(), while the Prisma CLI resolves it
// against the project root, so relative SQLite paths are made absolute here.
import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function resolveDatabaseUrl(rawUrl: string): string {
  if (!rawUrl.startsWith("file:") || rawUrl.startsWith("file:/")) {
    return rawUrl;
  }

  return `file:${path.resolve(projectRoot, rawUrl.slice("file:".length))}`;
}

const adapter = new PrismaBetterSqlite3({
  url: resolveDatabaseUrl(process.env["DATABASE_URL"] ?? "file:./prisma/dev.db"),
});

export const prisma = new PrismaClient({ adapter });
