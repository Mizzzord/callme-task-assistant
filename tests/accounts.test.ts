import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { createApp } from "../server/app.ts";
import { Store } from "../server/store.ts";
import { Accounts } from "../server/accounts.ts";
import type { AppState, Command } from "../src/types.ts";
process.env.ALLOW_PAID_API = "false";
const now = new Date("2026-10-30T12:00:00Z");
let base: string, server: Server;
const temp = mkdtempSync(join(tmpdir(), "callme-accounts-"));
const store = new Store(join(temp, "test.sqlite"), []);
before(async () => {
  server = createApp(store, () => now).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  base = `http://127.0.0.1:${address.port}`;
});
after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  store.db.close();
  rmSync(temp, { recursive: true });
});
function client(baseUrl = base) {
  const cookies = new Map<string, string>();
  let teamId = "";
  return {
    cookies,
    async raw(path: string, body?: unknown, expected = 200) {
      const response = await fetch(baseUrl + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
          "content-type": "application/json",
          "x-app-request": "voice-planner",
          "x-team-id": teamId,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      for (const item of response.headers.getSetCookie()) {
        const [key, value] = item.split(";")[0].split("=");
        if (value) cookies.set(key, value);
        else cookies.delete(key);
      }
      const data = await response.json();
      assert.equal(response.status, expected, JSON.stringify(data));
      return data;
    },
    async state(): Promise<AppState> {
      const s = await this.raw("/api/state");
      teamId = s.account.team.id;
      return s;
    },
    async register(name: string, inviteToken?: string) {
      await this.state();
      await this.raw("/api/auth/register", {
        name,
        email: `${name}@example.test`,
        password: "test-only-passphrase",
        ...(inviteToken ? { inviteToken } : { teamName: `Команда ${name}` }),
      });
      return this.state();
    },
    async command(command: Command, expected = 200): Promise<AppState> {
      return this.raw(
        "/api/chat",
        { requestId: randomUUID(), workspaceId: teamId, command },
        expected,
      );
    },
  };
}
test("registration preserves guest records, hashes credentials and isolates account data after logout", async () => {
  const c = client();
  await c.state();
  const guestCookie = c.cookies.get("workspace")!;
  await c.command({
    action: "create",
    title: "Сохранить при регистрации",
    priority: "high",
  });
  const s = await c.register("owner-one");
  assert.equal(s.account?.role, "owner");
  assert.equal(s.events.length, 1);
  assert.equal(s.messages.length, 2);
  const row = store.db
    .prepare("SELECT password_hash FROM users WHERE id=?")
    .get(s.account!.user!.id)!;
  assert.notEqual(row.password_hash, "test-only-passphrase");
  assert(!JSON.stringify(s).includes("password_hash"));
  await c.raw("/api/auth/logout", {});
  const guest = await c.state();
  assert.equal(guest.events.length, 0);
  assert.equal(guest.account?.user, null);
  const copied = client();
  copied.cookies.set("workspace", guestCookie);
  assert.equal((await copied.state()).events.length, 0);
  await c.raw(
    "/api/auth/login",
    { email: "owner-one@example.test", password: "wrong-password" },
    401,
  );
  await c.raw("/api/auth/login", {
    email: "owner-one@example.test",
    password: "test-only-passphrase",
  });
  assert.equal((await c.state()).events[0].priority, "high");
});
test("username registration and login preserve the workspace and reject duplicates", async () => {
  const isolated = createApp(store, () => now).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => isolated.once("listening", resolve));
  const address = isolated.address();
  assert(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}`;
  try {
  const first = client(url);
  await first.state();
  await first.command({ action: "create", title: "Задача нового пользователя" });
  await first.raw("/api/auth/register", { email: "Тест_Пользователь", name: "Тест_Пользователь", password: "test-only-passphrase" });
  const registered = await first.state();
  assert.equal(registered.events[0].title, "Задача нового пользователя");
  const second = client(url);
  await second.state();
  await second.raw("/api/auth/register", { email: "тест_пользователь", name: "другой", password: "test-only-passphrase" }, 409);
  await first.raw("/api/auth/logout", {});
  await second.raw("/api/auth/login", { email: "ТЕСТ_ПОЛЬЗОВАТЕЛЬ", password: "test-only-passphrase" });
  const restored = await second.state();
  assert.equal(restored.account?.user?.id, registered.account?.user?.id);
  assert.equal(restored.events[0].title, "Задача нового пользователя");
  } finally {
    await new Promise<void>((resolve) => isolated.close(() => resolve()));
  }
});
test("chat mentions assign a team member in text and confirmed speech", async () => {
  const owner = client();
  const s = await owner.register("mention-owner");
  const userId = s.account!.user!.id;
  const sendText = (text: string, source?: "voice") => owner.raw("/api/chat", { requestId: randomUUID(), text, ...(source ? { source } : {}) }) as Promise<AppState>;
  const created = await sendText("Создай задачу проверить документы @mention-owner");
  assert.equal(created.events.at(-1)?.assigneeId, userId);
  assert.equal(created.events.at(-1)?.title, "проверить документы");
  const pending = await sendText("Создай задачу подготовить доклад @mention-owner", "voice");
  assert.equal(pending.pending?.type, "speech");
  assert.equal(pending.events.length, 1);
  const confirmed = await owner.command({ action: "confirm", token: pending.pending!.token });
  assert.equal(confirmed.events.at(-1)?.assigneeId, userId);
  assert.equal(confirmed.events.at(-1)?.title, "подготовить доклад");
  const moved = await sendText("Перенеси задачу подготовить доклад в колонку в работе");
  assert.equal(moved.events.at(-1)?.status, "in_progress");
});
test("member and viewer roles, shared assignments, private conversations, stale edits, and revocation", async () => {
  const owner = client(),
    member = client(),
    viewer = client();
  const ownerState = await owner.register("owner-two");
  const invitation = await owner.raw("/api/team/invites", { role: "member" });
  assert.equal(
    (await member.raw(`/api/invites/${invitation.token}`)).role,
    "member",
  );
  const memberState = await member.register("member-two", invitation.token);
  assert.equal(memberState.account?.team.id, ownerState.account?.team.id);
  await member.raw(`/api/invites/${invitation.token}`, undefined, 410);
  const viewerInvite = await owner.raw("/api/team/invites", { role: "viewer" });
  const viewerState = await viewer.register("viewer-two", viewerInvite.token);
  const memberId = memberState.account!.user!.id;
  let s = await owner.command({
    action: "create",
    title: "Общая задача",
    priority: "urgent",
    assigneeId: memberId,
  });
  const id = s.events[0].id;
  assert.equal((await member.state()).events[0].assigneeId, memberId);
  assert.equal((await member.state()).messages.length, 0);
  await member.command({
    action: "update",
    id,
    revision: 1,
    title: "Изменено участником",
    priority: "low",
  });
  await owner.command(
    { action: "update", id, revision: 1, title: "Устаревшее" },
    503,
  );
  assert.equal((await owner.state()).events[0].priority, "low");
  for (const command of [
    { action: "create", title: "Запрещено" },
    { action: "update", id, title: "Запрещено" },
    { action: "move", id, status: "done" },
    { action: "delete", id },
    { action: "createProject", title: "Запрещено" },
  ] as Command[])
    await viewer.command(command, 403);
  assert.equal(
    (await viewer.command({ action: "list", period: "all" })).events[0].title,
    "Изменено участником",
  );
  await viewer.raw(
    "/api/chat",
    { requestId: randomUUID(), text: "Создай задачу запрет" },
    403,
  );
  await member.raw("/api/team/invites", { role: "member" }, 403);
  await member.raw("/api/team/settings", { name: "Запрет", revision: 1 }, 403);
  await owner.command(
    { action: "update", id, assigneeId: viewerState.account!.user!.id },
    403,
  );
  await owner.command({ action: "update", id, assigneeId: randomUUID() }, 403);
  s = await member.command({ action: "delete", id });
  assert.equal((await owner.state()).pending, undefined);
  assert.equal(s.pending?.type, "delete");
  await owner.raw(`/api/team/members/${memberId}`, {
    role: "viewer",
    revision: 1,
  });
  await member.command({ action: "confirm", token: s.pending!.token }, 403);
  assert.equal((await owner.state()).events[0].assigneeId, null);
  await owner.raw(
    `/api/team/members/${memberId}`,
    { remove: true, revision: 1 },
    409,
  );
  await owner.raw(`/api/team/members/${memberId}`, {
    remove: true,
    revision: 2,
  });
  await member.raw("/api/state", undefined, 401);
  assert.equal((await member.state()).events.length, 0);
});
test("invitation revocation, expiry, atomic one-time claim, team switching and owner protection", async () => {
  const owner = client(),
    other = client();
  const original = await owner.register("owner-three");
  const otherOriginal = await other.register("other-three");
  const revoked = await owner.raw("/api/team/invites", { role: "member" });
  await owner.raw(`/api/team/invites/${revoked.id}/revoke`, {});
  await other.raw("/api/invites/accept", { token: revoked.token }, 410);
  const expired = await owner.raw("/api/team/invites", { role: "member" });
  store.db
    .prepare("UPDATE invitations SET expires=? WHERE id=?")
    .run(now.getTime(), expired.id);
  await other.raw(`/api/invites/${expired.token}`, undefined, 410);
  const invite = await owner.raw("/api/team/invites", { role: "member" });
  await other.raw("/api/invites/accept", { token: invite.token });
  assert.equal((await other.state()).account?.teams.length, 2);
  await other.raw("/api/invites/accept", { token: invite.token }, 410);
  await other.raw("/api/team/switch", { teamId: randomUUID() }, 403);
  const accounts = new Accounts(store, () => now);
  const identity = accounts.resolve(other.cookies.get("callme_session"))!;
  await other.raw("/api/team/switch", {
    teamId: otherOriginal.account!.team.id,
  });
  assert.throws(() => accounts.current(identity));
  await other.state();
  await other.raw(
    "/api/chat",
    {
      requestId: randomUUID(),
      workspaceId: original.account!.team.id,
      command: { action: "create", title: "Устаревшая вкладка" },
    },
    409,
  );
  await owner.raw(
    `/api/team/members/${original.account!.user!.id}`,
    { remove: true, revision: 1 },
    403,
  );
  await owner.raw("/api/team/settings", {
    name: "Обновлённая команда",
    revision: 1,
  });
  await owner.raw(
    "/api/team/settings",
    { name: "Устаревшая команда", revision: 1 },
    409,
  );
  assert.equal((await owner.state()).account?.team.name, "Обновлённая команда");
  const used = store.db
    .prepare("SELECT hash FROM invitations WHERE id=?")
    .get(invite.id)!;
  assert.equal(
    used.hash,
    createHash("sha256").update(invite.token).digest("hex"),
  );
});
test("delayed confirmation cannot reassign a removed participant", async () => {
  const owner = client(),
    member = client();
  await owner.register("owner-four");
  const invite = await owner.raw("/api/team/invites", { role: "member" });
  const joined = await member.register("member-four", invite.token);
  const memberId = joined.account!.user!.id;
  const s = await owner.command({
    action: "create",
    title: "В прошлом",
    date: "2026-01-01",
    assigneeId: memberId,
    priority: "high",
  });
  assert.equal(s.pending?.type, "past");
  await owner.raw(`/api/team/members/${memberId}`, {
    remove: true,
    revision: 1,
  });
  await owner.command({ action: "confirm", token: s.pending!.token }, 403);
  assert.equal((await owner.state()).events.length, 0);
  await owner.command({ action: "cancel" });
});

test("two simultaneous invite claims admit exactly one account", async () => {
  const owner = client(),
    first = client(),
    second = client();
  const team = await owner.register("owner-five");
  await first.register("first-five");
  await second.register("second-five");
  const invite = await owner.raw("/api/team/invites", { role: "member" });
  const results = await Promise.all(
    [first, second].map((c) =>
      fetch(base + "/api/invites/accept", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-app-request": "voice-planner",
          cookie: [...c.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
        },
        body: JSON.stringify({ token: invite.token }),
      }),
    ),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 410]);
  assert.equal((await owner.state()).account!.members.length, 2);
  const joined = await Promise.all([first.state(), second.state()]);
  assert.equal(
    joined.filter((s) => s.account!.team.id === team.account!.team.id).length,
    1,
  );
});
test("accounts, sessions, roles and task fields survive reopening SQLite", async () => {
  const owner = client();
  const s = await owner.register("owner-six");
  const userId = s.account!.user!.id;
  await owner.command({
    action: "create",
    title: "После перезапуска",
    priority: "high",
    assigneeId: userId,
  });
  const reopened = new Store(join(temp, "test.sqlite"), []);
  try {
    const accounts = new Accounts(reopened, () => now);
    const identity = accounts.resolve(owner.cookies.get("callme_session"))!;
    assert.equal(identity.role, "owner");
    const restored = reopened.readFor(identity.teamId, userId);
    assert.equal(restored.events[0].assigneeId, userId);
    assert.equal(restored.events[0].priority, "high");
    assert.equal(restored.messages.length, 2);
  } finally {
    reopened.db.close();
  }
});

test("attachments are private to each conversation within one team", async () => {
  const owner = client(),
    member = client();
  const ownerState = await owner.register("attachment-owner");
  const invitation = await owner.raw("/api/team/invites", { role: "member" });
  await member.register("attachment-member", invitation.token);
  const cookie = (c: ReturnType<typeof client>) =>
    [...c.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  const uploaded = await fetch(base + "/api/attachments", {
    method: "POST",
    headers: {
      cookie: cookie(owner),
      "x-app-request": "voice-planner",
      "x-team-id": ownerState.account!.team.id,
      "content-type": "application/octet-stream",
      "x-file-name": "test.txt",
    },
    body: Buffer.from("private"),
  });
  assert.equal(uploaded.status, 200);
  const result = (await uploaded.json()) as AppState;
  const attachment = result.messages.at(-1)?.attachment;
  assert(attachment);
  const forbidden = await fetch(base + `/api/attachments/${attachment.id}`, {
    headers: { cookie: cookie(member) },
  });
  assert.equal(forbidden.status, 404);
  assert.equal((await member.state()).messages.length, 0);
  const download = await fetch(base + `/api/attachments/${attachment.id}`, {
    headers: { cookie: cookie(owner) },
  });
  assert.equal(download.status, 200);
  assert.equal(await download.text(), "private");
});

test("guest attachments remain accessible after creating a personal account", async () => {
  const guest = client();
  const before = await guest.state();
  const cookie = () =>
    [...guest.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  const response = await fetch(base + "/api/attachments", {
    method: "POST",
    headers: {
      cookie: cookie(),
      "x-app-request": "voice-planner",
      "x-team-id": before.account!.team.id,
      "content-type": "application/octet-stream",
      "x-file-name": "guest.txt",
    },
    body: Buffer.from("guest attachment"),
  });
  assert.equal(response.status, 200);
  const uploaded = (await response.json()) as AppState;
  const attachment = uploaded.messages.at(-1)?.attachment;
  assert(attachment);
  const registered = await guest.register("attachment-migration");
  assert.equal(registered.messages.at(-1)?.attachment?.id, attachment.id);
  const download = await fetch(base + `/api/attachments/${attachment.id}`, {
    headers: { cookie: cookie() },
  });
  assert.equal(download.status, 200);
  assert.equal(await download.text(), "guest attachment");
});
