import { createApp } from "./app.ts";
import { Store } from "./store.ts";
import { createServer } from "node:http";
import { localYandexRedirectUri, yandexRedirectUri } from "./yandex.ts";
const port = Number(process.env.PORT || 3001);
const redirectUri = yandexRedirectUri();
const store = new Store(process.env.DB_PATH || "data/app.sqlite");
const server = createApp(store).listen(
  port,
  process.env.HOST || "127.0.0.1",
  () => console.log(`API: http://127.0.0.1:${port}`),
);
const callback = redirectUri === localYandexRedirectUri && (process.env.YANDEX_CALENDAR_DISK_CLIENT_ID || process.env.YANDEX_MAIL_CLIENT_ID || process.env.YANDEX_TELEMOST_CLIENT_ID)
  ? createServer((req, res) => {
      const url = new URL(req.url || "/", "http://127.0.0.1:8765");
      if (req.method !== "GET" || url.pathname !== "/api/yandex/callback") {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(303, {
        Location: `http://127.0.0.1:${port}/api/yandex/callback${url.search}`,
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      }).end();
    }).listen(8765, "127.0.0.1")
  : undefined;
callback?.on("error", () => console.error("Не удалось открыть локальный адрес возврата Яндекса на порту 8765."));
process.on("SIGTERM", () => {
  callback?.close();
  server.close(() => store.db.close());
});
