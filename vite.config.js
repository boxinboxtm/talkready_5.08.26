import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// На GitHub Pages сайт лежит не в корне домена, а в подпапке с именем репозитория,
// поэтому в сборке нужен префикс. Локально он только мешал бы — отсюда проверка команды.
const REPO = "/talkready_5.08.26/";

export default defineConfig(({ command }) => ({
  base: command === "build" ? REPO : "/",
  plugins: [react()],
  server: {
    port: 5173,
    // Форвард на локальный прокси — нужен только в режиме ENGINE="claude".
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
}));
