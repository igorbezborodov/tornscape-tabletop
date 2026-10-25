// server/index.ts
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
    endpoints: [
      "GET /api/health",
      "GET /api/factions",
      "GET /api/units?factionId=<id>",
      "GET /api/units/:id",
    ],
  });
});

// 1. Проверка живости сервера
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// 1. Получить список всех фракций
app.get("/api/factions", async (_req, res) => {
  try {
    const factions = await prisma.faction.findMany({ orderBy: { name: "asc" } });
    res.json(factions);
  } catch (error) {
    console.error("Не удалось получить фракции:", error);
    res.status(500).json({ error: "Ошибка при получении фракций" });
  }
});

// 2. Получить список всех юнитов (можно фильтровать по фракции)
app.get("/api/units", async (req, res) => {
  try {
    const { factionId } = req.query;
    const units = await prisma.unit.findMany({
      where: factionId ? { factionId: String(factionId) } : undefined,
      orderBy: { name: "asc" },
    });
    res.json(units);
  } catch (error) {
    console.error("Не удалось получить юнитов:", error);
    res.status(500).json({ error: "Ошибка при получении юнитов" });
  }
});

// 3. Получить юнита по ID
app.get("/api/units/:id", async (req, res) => {
  try {
    const unit = await prisma.unit.findUnique({
      where: { id: req.params.id },
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
