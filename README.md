# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.

## Browser CLI (Playwright)

[`scripts/browser.mjs`](scripts/browser.mjs) — обёртка над Playwright для управления браузером из терминала (headless по умолчанию). Состояние (cookies, localStorage) хранится в persistent-профиле `.browser-profile`, последний URL — в `.browser-profile/state.json`, поэтому команды можно вызывать по одной: каждая следующая откроет последнюю страницу.

Установка браузера (один раз):

```bash
npx playwright install chromium
```

Базовые команды:

```bash
npm run browser open http://localhost:5173   # открыть страницу
npm run browser see                          # ARIA-снимок: что реально видит пользователь
npm run browser text body                    # текст страницы
npm run browser click "button.primary"       # клик по CSS-селектору
npm run browser click-text "Начать игру"     # клик по кнопке/ссылке по тексту
npm run browser fill "input[name=q]" "маг"   # заполнить поле
npm run browser eval "document.title"        # выполнить JS на странице
npm run browser screenshot board --full-page # скриншот в screenshots/
npm run browser html ".roster"               # HTML фрагмента
npm run browser -- --headed open             # показать окно браузера
```

Сценарий из нескольких шагов в одном процессе (сохраняет состояние React между шагами, разделитель `;;`):

```bash
npm run browser run "open http://localhost:5173;; click-text 'В P1';; wait 300;; screenshot roster;; text body"
```

То же можно передать JSON-файлом: `npm run browser run steps.json`, где `steps.json` — массив строк-команд. Флаги `--timeout=<ms>`, `--viewport=1440x900`, `--wait=<ms>`, `--logs` работают для всех команд. Папки `.browser-profile/` и `screenshots/` добавлены в [`.gitignore`](.gitignore).
