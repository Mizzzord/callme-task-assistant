import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createApp } from "../server/app.ts";
import { Store } from "../server/store.ts";

test("Yandex OAuth binds state to the browser and stores encrypted credentials per CallMe user", async () => {
  const temp = mkdtempSync(join(tmpdir(), "callme-yandex-"));
  process.env.YANDEX_VAULT_DIR = join(temp, "vault");
  process.env.YANDEX_CALENDAR_DISK_CLIENT_ID = "test-client";
  process.env.YANDEX_MAIL_CLIENT_ID = "test-mail-client";
  process.env.YANDEX_TELEMOST_CLIENT_ID = "test-telemost-client";
  const store = new Store(join(temp, "test.sqlite"), []);
  let messageReads = 0;
  const server = createApp(store, undefined, {
    list: async () => ({ total: 1, messages: [{ uid: 12, uidValidity: "42", subject: "Тест письма", from: "Отправитель", date: undefined, unseen: true }] }),
    read: async (_email, _token, validity, uid) => { messageReads++; assert.equal(validity, "42"); assert.equal(uid, 12); return { subject: "<script>bad()</script>", from: "A & B", text: "<img src=x onerror=bad()>" }; },
  }).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const nativeFetch = globalThis.fetch;
  let tokenRequests = 0;
  let conferences = 0;
  let failConference = false;
  let returnedScope: string | undefined;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url === "https://oauth.yandex.ru/token") {
      tokenRequests++;
      const body = new URLSearchParams(String(init?.body));
      assert(["test-client", "test-mail-client", "test-telemost-client"].includes(body.get("client_id") || ""));
      assert(body.get("code_verifier"));
      return Response.json({ access_token: "test-only-secret", expires_in: 3600, ...(returnedScope ? { scope: returnedScope } : {}) });
    }
    if (url === "https://login.yandex.ru/info?format=json") return Response.json({ default_email: "oauth@example.test" });
    if (url.startsWith("https://cloud-api.yandex.net/v1/disk/")) {
      assert(init?.headers);
      assert.equal((init.headers as Record<string, string>).Authorization, "OAuth test-only-secret");
      return Response.json({ _embedded: { total: 1, items: [{ name: "test.txt", type: "file", path: "disk:/test.txt" }] } });
    }
    if (url === "https://caldav.yandex.ru/") {
      assert.equal(init?.method, "PROPFIND");
      return new Response('<d:multistatus xmlns:d="DAV:"><d:current-user-principal><d:href>/test/</d:href></d:current-user-principal></d:multistatus>', { status: 207 });
    }
    if (url === "https://cloud-api.yandex.net/v1/telemost-api/conferences") {
      conferences++;
      if (failConference) throw new Error("test timeout");
      return Response.json({ join_url: "https://telemost.yandex.ru/j/example" }, { status: 201 });
    }
    return nativeFetch(input, init);
  };
  const cookies = new Map<string, string>();
  async function call(path: string, body?: object, jar = cookies) {
    const response = await nativeFetch(base + path, { method: body ? "POST" : "GET", headers: { cookie: [...jar].map(([k,v]) => `${k}=${v}`).join("; "), "content-type": "application/json", "x-app-request": "voice-planner" }, ...(body ? { body: JSON.stringify(body) } : {}), redirect: "manual" });
    for (const item of response.headers.getSetCookie()) { const [k,v] = item.split(";")[0].split("="); if (v) jar.set(k,v); else jar.delete(k); }
    return response;
  }
  try {
    assert.equal((await call("/api/yandex/status")).status, 401);
    await call("/api/state");
    const registration = await call("/api/auth/register", { name: "Test", email: "oauth@example.test", password: "test-password-only", teamName: "Test" });
    assert.equal(registration.status, 200);
    process.env.YANDEX_REDIRECT_URI = "https://callme.example.test/api/yandex/callback";
    const remoteStart = await call("/api/yandex/connect", {});
    assert.equal(new URL((await remoteStart.json() as { url: string }).url).searchParams.get("redirect_uri"), process.env.YANDEX_REDIRECT_URI);
    assert.match(remoteStart.headers.get("set-cookie") || "", /Secure/i);
    process.env.YANDEX_REDIRECT_URI = "http://example.test/api/yandex/callback";
    assert.equal((await call("/api/yandex/connect", {})).status, 503);
    delete process.env.YANDEX_REDIRECT_URI;
    const start = await call("/api/yandex/connect", {});
    const data = await start.json() as { url: string };
    const auth = new URL(data.url);
    assert.equal(auth.searchParams.get("code_challenge_method"), "S256");
    assert.equal(auth.searchParams.get("redirect_uri"), "http://127.0.0.1:8765/api/yandex/callback");
    const state = auth.searchParams.get("state");
    const bad = await call(`/api/yandex/callback?state=${state}&code=fake`, undefined, new Map());
    assert.equal(bad.headers.get("location"), "/?yandex=failed");
    assert.equal(tokenRequests, 0);
    const retry = await call("/api/yandex/connect", {});
    const next = new URL((await retry.json() as { url: string }).url);
    const callback = await call(`/api/yandex/callback?state=${next.searchParams.get("state")}&code=fake`);
    assert.equal(callback.headers.get("location"), "/?yandex=connected");
    assert.equal(tokenRequests, 1);
    const row = store.db.prepare("SELECT token FROM yandex_connections").get();
    assert(row && !String(row.token).includes("test-only-secret"));
    const status = await (await call("/api/yandex/status")).json() as { connected: boolean };
    assert.equal(status.connected, true);
    const disk = await (await call("/api/yandex/disk")).json() as { total: number; items: { url: string }[] };
    assert.equal(disk.total, 1);
    assert.equal(new URL(disk.items[0].url).searchParams.get("idDialog"), "/disk/test.txt");
    assert.equal((await call("/api/yandex/disk?path=other%3A%2F")).status, 400);
    const mailStart = await call("/api/yandex/connect", { service: "mail" });
    const mailAuth = new URL((await mailStart.json() as { url: string }).url);
    assert.equal(mailAuth.searchParams.get("scope"), "login:email mail:imap_ro");
    returnedScope = "login:email login:info mail:imap_ro";
    assert.equal((await call(`/api/yandex/callback?state=${mailAuth.searchParams.get("state")}&code=fake`)).headers.get("location"), "/?yandex=connected");
    returnedScope = undefined;
    assert.equal((await (await call("/api/yandex/status")).json() as { mail: { connected: boolean } }).mail.connected, true);
    const mailbox = await (await call("/api/yandex/mail/messages")).json() as { messages: { url: string }[] };
    assert.equal(mailbox.messages.length, 1);
    const mailUrl = mailbox.messages[0].url;
    const saved = await call("/api/chat", { requestId: randomUUID(), command: { action: "create", title: "Задача с письмом", links: [{ service: "yandex_mail", label: "Письмо", url: mailUrl }] } });
    assert.equal(saved.status, 200);
    const task = ((await saved.json()) as { events: { id: string; revision: number; links: { url: string }[] }[] }).events[0];
    assert.equal(task.links[0].url, mailUrl);
    assert.equal((await call(mailUrl, undefined, new Map())).status, 401);
    const otherMail = new Map<string, string>();
    await call("/api/state", undefined, otherMail);
    await call("/api/auth/register", { name: "Foreign", email: "foreign@example.test", password: "test-password-only", teamName: "Foreign" }, otherMail);
    assert.equal((await call(mailUrl, undefined, otherMail)).status, 403);
    assert.equal((await call(`${mailUrl}?format=json`, undefined, otherMail)).status, 403);
    assert.equal(messageReads, 0);
    const message = await call(mailUrl);
    assert.equal(message.status, 200);
    assert.equal(message.headers.get("cache-control"), "no-store");
    assert.match(message.headers.get("content-security-policy") || "", /default-src 'none'/);
    const rendered = await message.text();
    assert.match(rendered, /&lt;script&gt;/);
    assert(!rendered.includes("<script>bad()"));
    assert.equal(messageReads, 1);
    const preview = await call(`${mailUrl}?format=json`);
    assert.equal(preview.headers.get("cache-control"), "no-store");
    const previewData = await preview.json() as { text: string };
    assert.equal(previewData.text, "<img src=x onerror=bad()>");
    const withText = await call("/api/chat", { requestId: randomUUID(), command: { action: "update", id: task.id, revision: task.revision, description: previewData.text } });
    assert.equal(withText.status, 200);
    assert.equal(((await withText.json()) as { events: { description: string }[] }).events[0].description, previewData.text);
    assert.equal(messageReads, 2);
    assert.equal((await (await call("/api/yandex/status")).json() as { connected: boolean }).connected, true);
    assert.equal((await call("/api/yandex/disconnect", { service: "mail" })).status, 200);
    assert.equal((await (await call("/api/yandex/status")).json() as { connected: boolean }).connected, true);
    const wrongScope = await call("/api/yandex/connect", { service: "mail" });
    const wrongAuth = new URL((await wrongScope.json() as { url: string }).url);
    returnedScope = "login:email";
    assert.equal((await call(`/api/yandex/callback?state=${wrongAuth.searchParams.get("state")}&code=fake`)).headers.get("location"), "/?yandex=failed");
    returnedScope = undefined;
    assert.equal((await (await call("/api/yandex/status")).json() as { mail: { connected: boolean } }).mail.connected, false);
    const teleStart = await call("/api/yandex/connect", { service: "telemost" });
    const teleAuth = new URL((await teleStart.json() as { url: string }).url);
    assert.equal(teleAuth.searchParams.get("scope"), "telemost-api:conferences.create telemost-api:conferences.read");
    assert.equal((await call(`/api/yandex/callback?state=${teleAuth.searchParams.get("state")}&code=fake`)).headers.get("location"), "/?yandex=connected");
    const requestId = randomUUID();
    assert.equal((await call("/api/yandex/telemost/conference", { requestId })).status, 400);
    assert.equal((await call("/api/yandex/telemost/conference", { requestId, confirm: true })).status, 200);
    assert.equal((await call("/api/yandex/telemost/conference", { requestId, confirm: true })).status, 200);
    assert.equal(conferences, 1);
    failConference = true;
    const uncertainId = randomUUID();
    assert.equal((await call("/api/yandex/telemost/conference", { requestId: uncertainId, confirm: true })).status, 502);
    assert.equal((await call("/api/yandex/telemost/conference", { requestId: uncertainId, confirm: true })).status, 409);
    assert.equal(conferences, 2);
    assert.equal((await call("/api/yandex/calendar")).status, 200);
    assert.equal((await call("/api/yandex/disk", undefined, new Map())).status, 401);
    const another = new Map<string, string>();
    await call("/api/state", undefined, another);
    assert.equal((await call("/api/auth/register", { name: "Other", email: "other@example.test", password: "test-password-only", teamName: "Other" }, another)).status, 200);
    assert.equal((await (await call("/api/yandex/status", undefined, another)).json() as { connected: boolean }).connected, false);
    assert.equal((await call("/api/yandex/disk", undefined, another)).status, 401);
    assert.equal((await call("/api/yandex/disconnect", {})).status, 200);
    assert.equal((await call("/api/yandex/disk")).status, 401);
  } finally {
    globalThis.fetch = nativeFetch;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.db.close();
    rmSync(temp, { recursive: true, force: true });
    delete process.env.YANDEX_VAULT_DIR;
    delete process.env.YANDEX_CALENDAR_DISK_CLIENT_ID;
    delete process.env.YANDEX_MAIL_CLIENT_ID;
    delete process.env.YANDEX_TELEMOST_CLIENT_ID;
    delete process.env.YANDEX_REDIRECT_URI;
  }
});
