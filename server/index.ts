import { createApp } from "./app.ts";
import { Store } from "./store.ts";
const port = Number(process.env.PORT || 3001);
const store = new Store(process.env.DB_PATH || "data/app.sqlite");
const server = createApp(store).listen(
  port,
  process.env.HOST || "127.0.0.1",
  () => console.log(`API: http://127.0.0.1:${port}`),
);
process.on("SIGTERM", () => server.close(() => store.db.close()));
