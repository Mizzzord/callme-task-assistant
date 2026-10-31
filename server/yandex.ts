import type { Express, Request, Response, NextFunction } from "express";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Accounts, Identity } from "./accounts.ts";
import { AccessError } from "./accounts.ts";
import { listYandexCalendars, listCalendarObjects } from "./caldav.ts";
import { parseCalendarObject } from "./calendar-format.ts";
import { listMailboxMessages, readMailboxMessage, readMailboxStatus } from "./yandex-mail.ts";
import { linkError } from "../src/lib/links.ts";
import { diskWebUrl, validDiskPath } from "./disk-link.ts";

export const localYandexRedirectUri = "http://127.0.0.1:8765/api/yandex/callback";
export function yandexRedirectUri() {
  const configured = process.env.YANDEX_REDIRECT_URI || localYandexRedirectUri;
  let url: URL;
  try { url = new URL(configured); } catch { throw new Error("Некорректный YANDEX_REDIRECT_URI."); }
  if (configured !== localYandexRedirectUri && (url.protocol !== "https:" || url.pathname !== "/api/yandex/callback" || url.username || url.password || url.search || url.hash))
    throw new Error("YANDEX_REDIRECT_URI должен быть HTTPS-адресом /api/yandex/callback без параметров.");
  return configured;
}
type YandexService = "calendar-disk" | "mail" | "telemost";
const pending = new Map<string, { verifier: string; binding: string; identity: Identity; until: number; service: YandexService; clientId: string }>();
const digest = (value: string) => createHash("sha256").update(value).digest("base64url");
const bytes = () => randomBytes(32).toString("base64url");
function vaultKey(create = false) {
  const folder = process.env.YANDEX_VAULT_DIR || "data/.yandex-vault";
  const path = join(folder, "key");
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  if (create) {
    try { writeFileSync(path, randomBytes(32), { mode: 0o600, flag: "wx" }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  }
  const key = readFileSync(path);
  if (key.length !== 32) throw new Error("Ключ локального хранилища повреждён.");
  return key;
}
function encrypt(value: string, owner: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", vaultKey(true), iv);
  cipher.setAAD(Buffer.from(owner));
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((part) => part.toString("base64url")).join(".");
}
function decrypt(value: string, owner: string) {
  const parts = value.split(".").map((part) => Buffer.from(part, "base64url"));
  if (parts.length !== 3) throw new Error("Запись подключения повреждена.");
  const decipher = createDecipheriv("aes-256-gcm", vaultKey(), parts[0]);
  decipher.setAAD(Buffer.from(owner));
  decipher.setAuthTag(parts[1]);
  return Buffer.concat([decipher.update(parts[2]), decipher.final()]).toString("utf8");
}
const clientId = () => process.env.YANDEX_CALENDAR_DISK_CLIENT_ID || "";
const serviceClient = (service: YandexService) => service === "calendar-disk" ? clientId() : service === "mail" ? process.env.YANDEX_MAIL_CLIENT_ID || "" : process.env.YANDEX_TELEMOST_CLIENT_ID || "";
const serviceScope: Record<YandexService, string> = { "calendar-disk": "cloud_api:disk.read calendar:all", mail: "login:email mail:imap_ro", telemost: "telemost-api:conferences.create telemost-api:conferences.read" };
export type MailReaders = { list: typeof listMailboxMessages; read: typeof readMailboxMessage };
export function installYandexRoutes(app: Express, accounts: Accounts, mailReaders: MailReaders = { list: listMailboxMessages, read: readMailboxMessage }) {
  const db = accounts.store.db;
  db.exec("CREATE TABLE IF NOT EXISTS yandex_connections (user_id TEXT PRIMARY KEY, token TEXT NOT NULL, expires INTEGER NOT NULL)");
  db.exec("CREATE TABLE IF NOT EXISTS yandex_service_connections (user_id TEXT NOT NULL, service TEXT NOT NULL, token TEXT NOT NULL, expires INTEGER NOT NULL, PRIMARY KEY(user_id, service))");
  db.exec("CREATE TABLE IF NOT EXISTS telemost_requests (user_id TEXT NOT NULL, id TEXT NOT NULL, status TEXT NOT NULL, result TEXT, PRIMARY KEY(user_id, id))");
  function identity(res: Response) {
    const current = accounts.current(res.locals.account as Identity | undefined);
    if (!current) throw new AccessError("Войдите в аккаунт CallMe, чтобы подключить Яндекс.", 401);
    return current;
  }
  function tokenFor(userId: string, service: YandexService = "calendar-disk") {
    const row = service === "calendar-disk" ? db.prepare("SELECT token,expires FROM yandex_connections WHERE user_id=?").get(userId) : db.prepare("SELECT token,expires FROM yandex_service_connections WHERE user_id=? AND service=?").get(userId, service);
    if (!row || Number(row.expires) <= Date.now()) throw new AccessError("Подключите Яндекс заново.", 401);
    return decrypt(String(row.token), service === "calendar-disk" ? userId : `${userId}:${service}`);
  }
  app.get("/api/yandex/status", (_req, res, next) => {
    try {
      const user = identity(res);
      const row = db.prepare("SELECT expires FROM yandex_connections WHERE user_id=?").get(user.user.id);
      const states = Object.fromEntries((["mail", "telemost"] as const).map((service) => {
        const entry = db.prepare("SELECT expires FROM yandex_service_connections WHERE user_id=? AND service=?").get(user.user.id, service);
        return [service, { configured: Boolean(serviceClient(service)), connected: Boolean(entry && Number(entry.expires) > Date.now()) }];
      }));
      res.json({ configured: Boolean(clientId()), connected: Boolean(row && Number(row.expires) > Date.now()), ...states });
    } catch (error) { next(error); }
  });
  app.post("/api/yandex/disconnect", (req, res, next) => {
    try {
      const user = identity(res);
      const service = req.body?.service ?? "calendar-disk";
      if (service === "calendar-disk") db.prepare("DELETE FROM yandex_connections WHERE user_id=?").run(user.user.id);
      else if (service === "mail" || service === "telemost") db.prepare("DELETE FROM yandex_service_connections WHERE user_id=? AND service=?").run(user.user.id, service);
      else throw new AccessError("Неизвестный сервис Яндекса.", 400);
      res.json({ disconnected: true });
    } catch (error) { next(error); }
  });
  app.post("/api/yandex/connect", (req, res, next) => {
    try {
      const user = identity(res);
      const service: YandexService = req.body?.service === undefined ? "calendar-disk" : req.body.service;
      if (!Object.hasOwn(serviceScope, service)) throw new AccessError("Неизвестный сервис Яндекса.", 400);
      const configuredClientId = serviceClient(service);
      if (!configuredClientId) throw new AccessError("OAuth-приложение Яндекса ещё не настроено на сервере.", 503);
      const redirectUri = yandexRedirectUri();
      for (const [key, item] of pending) if (item.until <= Date.now()) pending.delete(key);
      const state = bytes(), binding = bytes(), verifier = bytes();
      pending.set(state, { verifier, binding: digest(binding), identity: user, until: Date.now() + 10 * 60_000, service, clientId: configuredClientId });
      res.cookie("callme_yandex_flow", binding, { httpOnly: true, sameSite: "lax", secure: redirectUri.startsWith("https:"), path: "/api/yandex/callback", maxAge: 10 * 60_000 });
      const params = new URLSearchParams({ response_type: "code", client_id: configuredClientId, redirect_uri: redirectUri, scope: serviceScope[service], state, code_challenge: digest(verifier), code_challenge_method: "S256", force_confirm: "yes" });
      res.json({ url: `https://oauth.yandex.ru/authorize?${params}` });
    } catch (error) { next(error); }
  });
  app.get("/api/yandex/callback", async (req: Request, res: Response) => {
    res.set("Referrer-Policy", "no-referrer");
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const flow = pending.get(state);
    pending.delete(state);
    const binding = typeof req.cookies.callme_yandex_flow === "string" ? req.cookies.callme_yandex_flow : "";
    res.clearCookie("callme_yandex_flow", { path: "/api/yandex/callback" });
    try {
      if (!flow || flow.until <= Date.now() || !binding || digest(binding) !== flow.binding || typeof req.query.code !== "string") throw new Error("Не удалось подтвердить запрос авторизации.");
      accounts.current(flow.identity);
      const response = await fetch("https://oauth.yandex.ru/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", client_id: flow.clientId, code: req.query.code, code_verifier: flow.verifier }), signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error("Яндекс не подтвердил подключение.");
      const result = await response.json() as { access_token?: unknown; expires_in?: unknown; scope?: unknown };
      if (typeof result.access_token !== "string" || typeof result.expires_in !== "number" || result.expires_in <= 0) throw new Error("Яндекс вернул некорректный ответ.");
      if (result.scope !== undefined) {
        if (typeof result.scope !== "string") throw new Error("Яндекс вернул некорректные права.");
        const granted = new Set(result.scope.split(/\s+/).filter(Boolean));
        const requested = serviceScope[flow.service].split(/\s+/);
        const permitted = flow.service === "mail" ? [...requested, "login:info"] : requested;
        if (requested.some((scope) => !granted.has(scope)) || [...granted].some((scope) => !permitted.includes(scope))) throw new Error("Права Яндекса отличаются от запрошенных.");
      }
      accounts.current(flow.identity);
      if (flow.service === "calendar-disk") db.prepare("INSERT INTO yandex_connections(user_id,token,expires) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET token=excluded.token,expires=excluded.expires").run(flow.identity.user.id, encrypt(result.access_token, flow.identity.user.id), Date.now() + result.expires_in * 1000);
      else db.prepare("INSERT INTO yandex_service_connections(user_id,service,token,expires) VALUES(?,?,?,?) ON CONFLICT(user_id,service) DO UPDATE SET token=excluded.token,expires=excluded.expires").run(flow.identity.user.id, flow.service, encrypt(result.access_token, `${flow.identity.user.id}:${flow.service}`), Date.now() + result.expires_in * 1000);
      return res.redirect(303, "/?yandex=connected");
    } catch { return res.redirect(303, "/?yandex=failed"); }
  });
  async function mailEmail(token: string) {
      const response = await fetch("https://login.yandex.ru/info?format=json", { headers: { Authorization: `OAuth ${token}` }, redirect: "error", signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new AccessError("Не удалось определить адрес Яндекс Почты.", 502);
      const profile = await response.json() as { default_email?: unknown };
      if (typeof profile.default_email !== "string") throw new AccessError("Яндекс не вернул адрес Почты.", 502);
      return profile.default_email;
  }
  app.get("/api/yandex/mail", async (_req, res, next: NextFunction) => {
    try {
      const user = identity(res);
      const token = tokenFor(user.user.id, "mail");
      const result = await readMailboxStatus(await mailEmail(token), token);
      accounts.current(user);
      res.json(result);
    } catch (error) { next(error); }
  });
  app.get("/api/yandex/mail/messages", async (_req, res, next: NextFunction) => {
    try {
      const user = identity(res);
      const token = tokenFor(user.user.id, "mail");
      const email = await mailEmail(token);
      const result = await mailReaders.list(email, token);
      const mailboxId = createHmac("sha256", vaultKey()).update(email.toLowerCase()).digest("hex").slice(0, 32);
      accounts.current(user);
      res.set("Cache-Control", "no-store").json({ ...result, messages: result.messages.map((message) => ({ ...message, url: `/api/yandex/mail/messages/${user.user.id}/${mailboxId}/${message.uidValidity}/${message.uid}` })) });
    } catch (error) { next(error); }
  });
  app.get("/api/yandex/mail/messages/:owner/:mailbox/:validity/:uid", async (req, res, next: NextFunction) => {
    try {
      const user = identity(res);
      if (req.params.owner !== user.user.id || !/^[a-f0-9]{32}$/.test(req.params.mailbox) || !/^[1-9]\d{0,19}$/.test(req.params.validity) || !/^[1-9]\d{0,9}$/.test(req.params.uid) || Number(req.params.uid) > 4294967295) throw new AccessError("Письмо доступно только владельцу подключённого ящика.", 403);
      const token = tokenFor(user.user.id, "mail");
      const email = await mailEmail(token);
      const mailboxId = createHmac("sha256", vaultKey()).update(email.toLowerCase()).digest("hex").slice(0, 32);
      if (req.params.mailbox !== mailboxId) throw new AccessError("Подключён другой почтовый ящик. Выберите письмо заново.", 403);
      const message = await mailReaders.read(email, token, req.params.validity, Number(req.params.uid));
      accounts.current(user);
      const escape = (text: string) => text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
      res.set({ "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" });
      if (req.query.format === "json") return res.json(message);
      res.type("html").send(`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Письмо — CallMe</title><style>body{font:16px system-ui;max-width:760px;margin:40px auto;padding:0 20px;line-height:1.5}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}</style><h1>${escape(message.subject)}</h1><p>${escape(message.from)}</p><pre>${escape(message.text || "Текст письма недоступен для просмотра.")}</pre></html>`);
    } catch (error) { next(error); }
  });
  app.post("/api/yandex/telemost/conference", async (req, res, next: NextFunction) => {
    try {
      const user = identity(res);
      if (user.role === "viewer") throw new AccessError("Наблюдатель не может создавать встречи.", 403);
      const id = req.body?.requestId;
      if (req.body?.confirm !== true || typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new AccessError("Подтвердите создание встречи.", 400);
      const previous = db.prepare("SELECT status,result FROM telemost_requests WHERE user_id=? AND id=?").get(user.user.id, id);
      if (previous) {
        if (previous.status === "done" && typeof previous.result === "string") return res.json({ url: decrypt(previous.result, `${user.user.id}:telemost:${id}`) });
        throw new AccessError("Результат предыдущего запроса неизвестен. Проверьте Телемост перед повтором.", 409);
      }
      const token = tokenFor(user.user.id, "telemost");
      db.prepare("INSERT INTO telemost_requests(user_id,id,status) VALUES(?,?,'pending')").run(user.user.id, id);
      let response: globalThis.Response;
      try {
        response = await fetch("https://cloud-api.yandex.net/v1/telemost-api/conferences", { method: "POST", redirect: "error", headers: { Authorization: `OAuth ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ waiting_room_level: "PUBLIC" }), signal: AbortSignal.timeout(15000) });
      } catch { throw new AccessError("Ответ Телемоста не получен. Встреча могла быть создана; проверьте Телемост перед повтором.", 502); }
      if (!response.ok) throw new AccessError(`Телемост отклонил запрос (${response.status}). Проверьте доступ и тариф.`, 502);
      const data = await response.json() as { join_url?: unknown };
      if (typeof data.join_url !== "string" || linkError(data.join_url, "telemost")) throw new AccessError("Телемост не вернул корректную ссылку. Проверьте созданную встречу перед повтором.", 502);
      accounts.current(user);
      db.prepare("UPDATE telemost_requests SET status='done',result=? WHERE user_id=? AND id=?").run(encrypt(data.join_url, `${user.user.id}:telemost:${id}`), user.user.id, id);
      return res.json({ url: data.join_url });
    } catch (error) { return next(error); }
  });
  app.get("/api/yandex/disk", async (req, res, next: NextFunction) => {
    try {
      const user = identity(res);
      const path = typeof req.query.path === "string" ? req.query.path : "disk:/";
      const offset = req.query.offset === undefined ? 0 : Number(req.query.offset);
      if (!validDiskPath(path) || !Number.isSafeInteger(offset) || offset < 0 || offset > 100000) throw new AccessError("Некорректный путь к папке Диска.", 400);
      const params = new URLSearchParams({ path, limit: "20", offset: String(offset), fields: "_embedded.items.name,_embedded.items.type,_embedded.items.path,_embedded.total" });
      const response = await fetch(`https://cloud-api.yandex.net/v1/disk/resources?${params}`, { headers: { Authorization: `OAuth ${tokenFor(user.user.id)}` }, signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new AccessError("Не удалось прочитать Яндекс Диск. Проверьте доступ или подключите аккаунт заново.", 502);
      const result = await response.json() as { _embedded?: { total?: number; items?: { name?: string; type?: string; path?: string }[] } };
      accounts.current(user);
      res.json({ total: result._embedded?.total ?? 0, path, offset, items: (result._embedded?.items || []).map(({ name, type, path: itemPath }) => ({ name, type, path: itemPath, url: typeof itemPath === "string" && typeof type === "string" ? diskWebUrl(itemPath, type) : undefined })) });
    } catch (error) { next(error); }
  });
  app.get("/api/yandex/calendars", async (_req, res, next: NextFunction) => {
    try {
      const user = identity(res);
      const calendars = await listYandexCalendars(tokenFor(user.user.id));
      accounts.current(user);
      res.json({ calendars });
    } catch (error) { next(error); }
  });
  app.get("/api/yandex/calendar-events", async (req, res, next: NextFunction) => {
    try {
      const user = identity(res);
      if (typeof req.query.calendar !== "string") throw new AccessError("Выберите календарь.", 400);
      const objects = await listCalendarObjects(tokenFor(user.user.id), req.query.calendar);
      const events = objects.map((item) => parseCalendarObject(item.data)).filter((item) => item !== undefined);
      accounts.current(user);
      res.json({ events, skipped: objects.length - events.length });
    } catch (error) { next(error); }
  });
  app.get("/api/yandex/calendar", async (_req, res, next: NextFunction) => {
    try {
      const user = identity(res);
      const response = await fetch("https://caldav.yandex.ru/", {
        method: "PROPFIND",
        headers: { Authorization: `OAuth ${tokenFor(user.user.id)}`, Depth: "0", "Content-Type": "application/xml; charset=utf-8" },
        body: '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>',
        signal: AbortSignal.timeout(15000),
      });
      if (response.status !== 207) throw new AccessError("Не удалось получить доступ к Календарю. Проверьте права Яндекса.", 502);
      const body = await response.text();
      if (!/current-user-principal/i.test(body) || !/<(?:\w+:)?href\b/i.test(body)) throw new AccessError("Календарь не подтвердил доступ.", 502);
      accounts.current(user);
      res.json({ available: true });
    } catch (error) { next(error); }
  });
}
