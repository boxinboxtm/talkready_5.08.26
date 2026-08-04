# TalkReady

Голосовой тренажёр английского для нетворкинга. Собеседника играет Claude через Anthropic API. Собран по ТЗ v.02.

- **Фронт:** Vite + React (один компонент `src/TalkReady.jsx`, inline-стили, без Tailwind).
- **Бэк:** тонкий прокси, который хранит ключ Anthropic на сервере. Браузер зовёт `/api/chat`, а не Anthropic напрямую.
- **Память между сессиями:** `localStorage` (сравнение «от раза к разу»).

---

## 1. Локальный запуск

Нужен Node 18+.

```bash
npm install
cp .env.example .env        # и впиши свой ключ в ANTHROPIC_API_KEY
npm run dev
```

Откроется на **http://localhost:5173**. Команда `npm run dev` поднимает сразу два процесса:
- `web` — Vite (порт 5173),
- `api` — прокси на Express (порт 3001); Vite форвардит на него `/api/*`.

Проверить, что ключ подхватился: открой http://localhost:3001/api/health → должно быть `{"ok":true,"hasKey":true}`.

> Микрофон работает только на `https` или на `localhost`. На localhost — работает. Если браузер не даёт микрофон, приложение само переключается в режим «печатать вместо говорить» — это штатный фолбэк из ТЗ.

---

## 2. Деплой на Vercel (рекомендуется)

Vercel сам понимает и Vite, и папку `api/` (serverless-функции) — отдельный сервер не нужен, `server.js` в проде не используется.

1. Залей репозиторий на GitHub.
2. На vercel.com → **Add New → Project → Import** этот репозиторий.
3. Framework Preset определится как **Vite** автоматически. Build: `npm run build`, Output: `dist`.
4. В **Settings → Environment Variables** добавь `ANTHROPIC_API_KEY` (и при желании `ANTHROPIC_MODEL`).
5. **Deploy.** Фронт отдаётся статикой, `/api/chat` работает как функция.

CLI-вариант:
```bash
npm i -g vercel
vercel            # первый деплой (preview)
vercel env add ANTHROPIC_API_KEY
vercel --prod
```

---

## 3. Деплой на другой хостинг

Нужны две вещи: раздать статику из `dist/` (после `npm run build`) и поднять эндпоинт `POST /api/chat`.

- **Cloudflare Pages + Functions:** положи логику из `lib/anthropic.js` в `functions/api/chat.js`, ключ — в переменные окружения проекта.
- **Свой сервер (VPS):** `npm run build`, раздавай `dist/` любым статик-сервером, а `server.js` держи запущенным (например, через `pm2`) как `/api`-бэкенд за реверс-прокси.
- **Только статика (GitHub Pages и т.п.):** не подойдёт — негде безопасно держать ключ и запускать `/api/chat`. Нужен хотя бы один серверный эндпоинт.

---

## Структура

```
talkready/
├── api/chat.js          # Vercel serverless функция (прод-прокси)
├── lib/anthropic.js     # общий вызов Anthropic (ключ на сервере)
├── server.js            # локальный dev-прокси (Express)
├── src/
│   ├── TalkReady.jsx    # всё приложение
│   └── main.jsx         # точка входа
├── index.html
├── vite.config.js       # dev-proxy /api → :3001
└── .env.example
```

## Заметки по ТЗ

- Модель зафиксирована на сервере (`claude-sonnet-5`), чтобы из браузера нельзя было запросить более дорогую.
- Пункты `[уточнить / решение продукта]` из ТЗ (движок STT, срок хранения транскриптов, формулировка согласия) в прототипе обозначены, но не реализованы как продовые — это остаётся на стороне продукта/юристов.
- PDF-отчёт делается через печать браузера (кнопка «Скачать отчёт» → сохранить как PDF).
