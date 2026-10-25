// CLI-обвязка над Playwright: управление браузером из терминала.
//
// Каждый вызов — отдельный процесс, поэтому cookies/localStorage живут в
// persistent-профиле `.browser-profile`, а последний URL — в
// `.browser-profile/state.json`. Для многошаговых сценариев без потери
// состояния React используйте команду `run` (шаги в одном процессе).
//
// Примеры:
//   node scripts/browser.mjs open http://localhost:5173
//   node scripts/browser.mjs see
//   node scripts/browser.mjs click "button[data-testid=roll]"
//   node scripts/browser.mjs click-text "В P1"
//   node scripts/browser.mjs fill "input[name=army]" "Undead"
//   node scripts/browser.mjs screenshot board --full-page
//   node scripts/browser.mjs eval "document.title"
//   node scripts/browser.mjs run "click-text 'В P1';; screenshot p1;; text body"
//   node scripts/browser.mjs run steps.json
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(import.meta.dirname, "..");
const PROFILE_DIR = path.join(ROOT, ".browser-profile");
const STATE_FILE = path.join(PROFILE_DIR, "state.json");
const SHOTS_DIR = path.join(ROOT, "screenshots");
const DEFAULT_URL = "http://localhost:5173";

const argv = process.argv.slice(2);
const command = (argv.shift() ?? "help").toLowerCase();

const flags = new Map();
const positional = [];
for (const token of argv) {
  if (token.startsWith("--")) {
    const [key, ...value] = token.slice(2).split("=");
    flags.set(key, value.length ? value.join("=") : "true");
  } else {
    positional.push(token);
  }
}

const hasFlag = (name) => flags.has(name);
const flagValue = (name, fallback) => {
  const value = flags.get(name);
  return value === undefined || value === "true" ? fallback : value;
};

const headless = !hasFlag("headed");
const timeout = Number(flagValue("timeout", 20_000));
const fullPage = hasFlag("full-page");

function log(message) {
  console.log(message);
}

function fail(message) {
  console.error(`error: ${message}`);
  process.exitCode = 1;
}

function parseViewport() {
  const raw = flagValue("viewport", "1440x900");
  const [width, height] = raw.split("x").map(Number);
  return {
    width: Number.isFinite(width) ? width : 1440,
    height: Number.isFinite(height) ? height : 900,
  };
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function writeState(next) {
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(next, null, 2));
}

function saveCurrentUrl(page) {
  writeState({ url: page.url(), updatedAt: new Date().toISOString() });
}

function printHelp() {
  log(`Usage: node scripts/browser.mjs <command> [args] [flags]

Commands:
  open <url>              открыть URL (по умолчанию ${DEFAULT_URL})
  goto <url>              то же, что open
  reload                  перезагрузить текущую страницу
  back                    назад по истории
  url                     текущий URL и заголовок
  see [selector]          ARIA-снимок (что видит пользователь)
  text [selector]         innerText элемента (по умолчанию body)
  html [selector]         outerHTML элемента (по умолчанию html)
  links                   список ссылок: текст -> href
  click <selector>        клик по первому совпадению CSS-селектора
  click-text <text>       клик по кнопке/ссылке с текстом
  fill <selector> <val>   заполнить input/textarea
  press <key>             нажать клавишу (Enter, Tab, Control+A...)
  wait <ms|selector>      пауза или ожидание видимости элемента
  eval "<js>"             выполнить JS в странице и вывести результат
  screenshot [name]       скриншот в screenshots/
  console                 логи/ошибки страницы, собранные за вызов
  run <steps|file.json>   несколько шагов в одном процессе (сохраняет состояние)
  close                   сбросить сохранённый URL
  help                    эта справка

Flags:
  --headed                показать окно (по умолчанию headless)
  --timeout=<ms>          таймаут ожиданий, по умолчанию 20000
  --viewport=1440x900     размер окна
  --full-page             полный скриншот
  --selector=<css>        область для скриншота
  --wait=<ms>             пауза после загрузки/действия
  --logs                  печатать console-логи страницы после команды`);
}

function tokenize(input) {
  const tokens = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match;
  while ((match = re.exec(input)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3]);
  }
  return tokens;
}

function resolveUrl(input) {
  const raw = input ?? readState().url ?? DEFAULT_URL;
  if (/^[a-z]+:\/\//i.test(raw) || raw.startsWith("about:") || raw.startsWith("data:")) {
    return raw;
  }
  if (raw.startsWith("/")) return new URL(raw, DEFAULT_URL).href;
  return `http://${raw}`;
}

async function launch() {
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless,
    viewport: parseViewport(),
    locale: "ru-RU",
    timezoneId: "Europe/Moscow",
    args: ["--disable-blink-features=AutomationControlled"],
  });
  context.setDefaultTimeout(timeout);
  context.setDefaultNavigationTimeout(timeout);

  const page = context.pages()[0] ?? (await context.newPage());
  const consoleLines = [];

  page.on("console", (message) => {
    consoleLines.push(`[${message.type()}] ${message.text()}`);
  });
  page.on("pageerror", (error) => {
    consoleLines.push(`[pageerror] ${error.message}`);
  });

  return { context, page, consoleLines };
}

async function settle(page) {
  try {
    await page.waitForLoadState("networkidle", { timeout: Math.min(timeout, 5_000) });
  } catch {
    // HMR/SSE держат соединение открытым — networkidle не наступает, это нормально.
  }
  const waitMs = Number(flagValue("wait", 0));
  if (waitMs > 0) await page.waitForTimeout(waitMs);
}

async function navigate(page, target) {
  const url = resolveUrl(target);
  const response = await page.goto(url, { waitUntil: "domcontentloaded" });
  await settle(page);
  saveCurrentUrl(page);
  return `opened ${page.url()} (status ${response ? response.status() : "n/a"})`;
}

async function ariaSnapshot(page, selector) {
  const locator = page.locator(selector ?? "body").first();
  await locator.waitFor({ state: "attached" });
  try {
    return await locator.ariaSnapshot();
  } catch {
    return await locator.innerText();
  }
}

const NAVIGATION_COMMANDS = new Set(["open", "goto", "nav", "reload", "back", "run"]);

/**
 * Выполняет один шаг. Возвращает строку для печати (или null).
 */
async function runStep(page, name, args, ctx) {
  switch (name) {
    case "open":
    case "goto":
    case "nav": {
      return navigate(page, args[0]);
    }

    case "reload": {
      await page.reload({ waitUntil: "domcontentloaded" });
      await settle(page);
      saveCurrentUrl(page);
      return `reloaded ${page.url()}`;
    }

    case "back": {
      await page.goBack({ waitUntil: "domcontentloaded" });
      await settle(page);
      saveCurrentUrl(page);
      return `back to ${page.url()}`;
    }

    case "url": {
      return `${page.url()}\n${await page.title()}`;
    }

    case "see": {
      return await ariaSnapshot(page, args[0]);
    }

    case "text": {
      const locator = page.locator(args[0] ?? "body").first();
      return (await locator.innerText()).trim();
    }

    case "html": {
      const locator = page.locator(args[0] ?? "html").first();
      return await locator.evaluate((element) => element.outerHTML);
    }

    case "links": {
      const items = await page.locator("a[href]").evaluateAll((anchors) =>
        anchors
          .map(
            (anchor) =>
              `${(anchor.textContent ?? "").trim() || "(no text)"} -> ${anchor.href}`,
          )
          .filter((line, index, all) => all.indexOf(line) === index),
      );
      return items.length ? items.join("\n") : "(no links)";
    }

    case "click": {
      if (!args[0]) throw new Error("укажите CSS-селектор элемента");
      await page.locator(args[0]).first().click();
      await settle(page);
      saveCurrentUrl(page);
      return `clicked ${args[0]}`;
    }

    case "click-text": {
      const text = args.join(" ");
      if (!text) throw new Error("укажите текст кнопки/ссылки");
      await page.getByRole("button", { name: text, exact: false }).first().click();
      await settle(page);
      saveCurrentUrl(page);
      return `clicked "${text}"`;
    }

    case "fill": {
      if (!args[0]) throw new Error("укажите CSS-селектор поля");
      const value = args.slice(1).join(" ");
      await page.locator(args[0]).first().fill(value);
      return `filled ${args[0]} <- ${JSON.stringify(value)}`;
    }

    case "press": {
      if (!args[0]) throw new Error("укажите клавишу, например Enter");
      await page.keyboard.press(args[0]);
      await settle(page);
      return `pressed ${args[0]}`;
    }

    case "wait": {
      const target = args[0];
      if (!target) throw new Error("укажите миллисекунды или селектор");
      if (/^\d+$/.test(target)) {
        await page.waitForTimeout(Number(target));
        return `waited ${target}ms`;
      }
      await page.locator(target).first().waitFor({ state: "visible" });
      return `element visible: ${target}`;
    }

    case "eval": {
      const source = args.join(" ");
      if (!source) throw new Error("укажите JS-выражение");
      const result = await page.evaluate((code) => {
        const value = new Function(`return (${code});`)();
        return value === undefined ? null : value;
      }, source);
      return typeof result === "string" ? result : JSON.stringify(result, null, 2);
    }

    case "screenshot":
    case "shot": {
      fs.mkdirSync(SHOTS_DIR, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const name = args[0] ?? `shot-${stamp}`;
      const file = path.join(SHOTS_DIR, name.endsWith(".png") ? name : `${name}.png`);
      const selector = args[1] ?? flagValue("selector", undefined);
      if (selector) {
        await page.locator(selector).first().screenshot({ path: file });
      } else {
        await page.screenshot({ path: file, fullPage });
      }
      return `screenshot ${path.relative(ROOT, file)}`;
    }

    case "console": {
      return ctx.consoleLines.length
        ? ctx.consoleLines.join("\n")
        : "(no console output captured)";
    }

    default:
      throw new Error(`неизвестная команда "${name}"`);
  }
}

function readSteps() {
  const raw = positional.join(" ").trim();
  if (!raw) throw new Error("укажите шаги: \"click-text 'В P1';; see\" или путь к JSON-файлу");

  const candidate = path.resolve(ROOT, positional[0]);
  if (/\.json$/i.test(positional[0]) && fs.existsSync(candidate)) {
    const parsed = JSON.parse(fs.readFileSync(candidate, "utf8"));
    return Array.isArray(parsed) ? parsed.map(String) : [String(parsed)];
  }

  return raw
    .split(";;")
    .map((step) => step.trim())
    .filter(Boolean);
}

async function main() {
  if (command === "help" || command === "-h" || command === "--help") {
    printHelp();
    return;
  }

  if (command === "close") {
    fs.rmSync(STATE_FILE, { force: true });
    log("state cleared");
    return;
  }

  const { context, page, consoleLines } = await launch();
  const ctx = { consoleLines };

  try {
    // Persistent-профиль стартует с about:blank, поэтому для не-навигационных
    // команд сначала возвращаемся на последний посещённый URL.
    if (!NAVIGATION_COMMANDS.has(command)) {
      const saved = readState().url;
      if (saved && saved !== "about:blank" && page.url() !== saved) {
        await page.goto(saved, { waitUntil: "domcontentloaded" });
        await settle(page);
      }
    }

    if (command === "run") {
      const steps = readSteps();
      for (const [index, step] of steps.entries()) {
        const [name, ...args] = tokenize(step);
        if (!name) continue;
        log(`#${index + 1} ${name}${args.length ? ` ${args.join(" ")}` : ""}`);
        const output = await runStep(page, name.toLowerCase(), args, ctx);
        if (output !== null && output !== undefined && output !== "") {
          log(output);
        }
      }
    } else {
      const output = await runStep(page, command, positional, ctx);
      if (output !== null && output !== undefined) log(output);
    }

    if (consoleLines.length > 0 && command !== "console" && hasFlag("logs")) {
      log("--- page console ---");
      log(consoleLines.join("\n"));
    }
  } finally {
    await context.close();
  }
}

main().catch((error) => {
  fail(error?.message ?? String(error));
  if (/ProcessSingleton|profile is already in use/i.test(String(error?.message))) {
    console.error(
      "hint: профиль занят другим процессом браузера — закройте его или удалите .browser-profile",
    );
  }
});
