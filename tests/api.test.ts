import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { createApp } from "../server/app.ts";
import { Store, loadSeed, importSeed } from "../server/store.ts";
import type { AppState, Command, Workspace } from "../src/types.ts";
process.env.ALLOW_PAID_API = "false";
const now = new Date("2026-10-30T07:00:00Z");
let server: Server, store: Store, base: string;
const tmp = mkdtempSync(join(tmpdir(), "voice-planner-"));
before(async () => {
  store = new Store(join(tmp, "app.sqlite"));
  server = createApp(store, () => now).listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const a = server.address();
  assert(a && typeof a !== "string");
  base = `http://127.0.0.1:${a.port}`;
});
after(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  store.db.close();
  rmSync(tmp, { recursive: true });
});
async function client() {
  let cookie = "";
  return {
    async state() {
      const r = await fetch(base + "/api/state", { headers: { cookie } });
      cookie = r.headers.get("set-cookie")?.split(";")[0] || cookie;
      assert.equal(r.status, 200);
      return r.json() as Promise<AppState>;
    },
    async chat(
      content: string | Command,
      options: {
        requestId?: string;
        source?: "voice";
        uncertain?: boolean;
        projectId?: string | null;
        pendingToken?: string;
        expectStatus?: number;
      } = {},
    ) {
      const r = await fetch(base + "/api/chat", {
        method: "POST",
        headers: {
          cookie,
          "Content-Type": "application/json",
          "x-app-request": "voice-planner",
        },
        body: JSON.stringify({
          requestId: options.requestId || randomUUID(),
          projectId: options.projectId,
          pendingToken: options.pendingToken,
          ...(typeof content === "string"
            ? { text: content }
            : { command: content }),
          ...(options.source
            ? { source: options.source, uncertain: options.uncertain }
            : {}),
        }),
      });
      assert.equal(r.status, options.expectStatus || 200);
      return r.json() as Promise<AppState>;
    },
    cookie: () => cookie,
  };
}
const last = (s: AppState) => s.messages.at(-1)?.text || "";
test("voice confirmation acts only on the captured pending request", async () => {
  const c = await client();
  await c.state();
  const pending = await c.chat("Создай задачу полить цветы", { source: "voice", uncertain: true });
  assert.equal(pending.pending?.type, "speech");
  const before = pending.events.length;
  const stale = await c.chat("Да, верно", { source: "voice", uncertain: true, pendingToken: randomUUID(), expectStatus: 503 });
  assert.match((stale as unknown as { error: string }).error, /устарело/);
  assert.equal((await c.state()).events.length, before);
  const confirmed = await c.chat("Да, верно", { source: "voice", uncertain: true, pendingToken: pending.pending!.token });
  assert.equal(confirmed.events.length, before + 1);
  assert.equal(confirmed.events.at(-1)?.title, "полить цветы");
});
test("1000 source records, exact originals, duplicates kept, repeat import preserves edit and deletion", async () => {
  const c = await client();
  const s = await c.state();
  assert.equal(s.events.length, 1000);
  assert.equal(new Set(s.events.map((e) => e.id)).size, 1000);
  const seed = loadSeed();
  for (const e of s.events) {
    assert.deepEqual(e.original, seed.find((x) => x.id === e.id)!.original);
    assert.equal(e.duration, null);
    assert.equal(e.inferred, true);
  }
  assert(new Set(seed.map((x) => x.title)).size < seed.length);
  const ws: Workspace = {
    events: seed.slice(1),
    messages: [],
    requests: {},
    imported: seed.map((e) => e.id),
  };
  ws.events[0].title = "Изменено";
  importSeed(ws, seed);
  assert.equal(ws.events.length, 999);
  assert.equal(ws.events[0].title, "Изменено");
});
test("text create, date only, without deadline, time without date asks, reminders have no delivery", async () => {
  const c = await client();
  await c.state();
  let s = await c.chat("Создай задачу купить молоко завтра");
  assert.match(last(s), /Сохранено/);
  assert.equal(s.events.at(-1)?.title, "купить молоко");
  assert.equal(s.events.at(-1)?.date, "2026-10-31");
  assert.equal(s.events.at(-1)?.time, null);
  s = await c.chat("Добавь задачу прочитать книгу без срока");
  assert.equal(s.events.at(-1)?.date, null);
  s = await c.chat("Создай задачу проверить отчёт в 15:00");
  assert.equal(s.pending?.type, "draft");
  assert.match(last(s), /какую дату/);
  assert.equal(s.events.length, 1002);
  s = await c.chat("завтра");
  assert.equal(s.events.at(-1)?.time, "15:00");
  assert.equal(s.events.at(-1)?.date, "2026-10-31");
  s = await c.chat("Напомни купить билет завтра");
  assert.equal(s.events.at(-1)?.kind, "reminder");
  assert.match(last(s), /уведомления не отправляются/);
});
test("meeting clarification, conflict approval, cancellation, past-date confirmation, invalid date rejected", async () => {
  const c = await client();
  await c.state();
  let s = await c.chat("Создай встречу с командой 2028-01-02 в 15:00");
  assert.match(last(s), /Сколько минут/);
  assert.equal(s.events.length, 1000);
  s = await c.chat("30 минут");
  assert.equal(s.events.at(-1)?.duration, 30);
  assert.equal(s.events.at(-1)?.date, "2028-01-02");
  s = await c.chat({
    action: "create",
    kind: "meeting",
    title: "Пересечение",
    date: "2028-01-02",
    time: "15:15",
    duration: 30,
  });
  assert.equal(s.pending?.type, "conflict");
  assert.equal(s.events.length, 1001);
  s = await c.chat({ action: "confirm", token: s.pending!.token });
  assert.equal(s.events.length, 1002);
  s = await c.chat({ action: "create", title: "Прошлое", date: "2025-12-31" });
  assert.equal(s.pending?.type, "past");
  s = await c.chat("Отмена");
  assert.equal(s.events.length, 1002);
  s = await c.chat({
    action: "create",
    title: "Архивная запись",
    date: "2025-12-31",
  });
  s = await c.chat("Подтверждаю");
  assert.equal(s.events.at(-1)?.date, "2025-12-31");
  await c.chat(
    { action: "create", title: "Не существует", date: "2027-02-30" },
    { expectStatus: 503 },
  );
  assert.equal((await c.state()).events.length, 1003);
});
test("unknown duration only same start warns, adjacent known meetings do not conflict", async () => {
  const c = await client();
  const first = await c.state();
  const e = first.events.find(
    (e) => e.kind === "meeting" && e.date! >= "2027-01-01",
  )!;
  let s = await c.chat({
    action: "create",
    kind: "meeting",
    title: "Совпадение",
    date: e.date,
    time: e.time,
    duration: 30,
  });
  assert.equal(s.pending?.type, "conflict");
  assert.match(last(s), /неизвестна/);
  await c.chat("Отмена");
  await c.chat({
    action: "create",
    kind: "meeting",
    title: "Первая",
    date: "2028-05-01",
    time: "12:00",
    duration: 30,
  });
  s = await c.chat({
    action: "create",
    kind: "meeting",
    title: "Вторая",
    date: "2028-05-01",
    time: "12:30",
    duration: 60,
  });
  assert.equal(s.pending, undefined);
});
test("search ambiguity, numbered selection, pronoun move, complete, delete cancel and confirm", async () => {
  const c = await client();
  await c.state();
  await c.chat({ action: "create", title: "Проверка макета А" });
  await c.chat({ action: "create", title: "Проверка макета Б" });
  let s = await c.chat("Найди проверка макета");
  assert.equal(s.pending?.candidates?.length, 2);
  s = await c.chat("2");
  const id = s.selected;
  assert.ok(id);
  s = await c.chat("Перенеси её на завтра");
  assert.equal(s.events.find((e) => e.id === id)?.date, "2026-10-31");
  s = await c.chat("Отметь её выполненной");
  assert.equal(s.events.find((e) => e.id === id)?.completed, true);
  s = await c.chat("Удали её");
  assert.equal(s.pending?.type, "delete");
  assert.ok(s.events.find((e) => e.id === id));
  s = await c.chat("Отмена");
  assert.ok(s.events.find((e) => e.id === id));
  s = await c.chat("Удали её");
  s = await c.chat({ action: "confirm", token: s.pending!.token });
  assert.equal(
    s.events.find((e) => e.id === id),
    undefined,
  );
});
test("new command replaces draft; partial speech never mutates; speech confirmation retains clarification", async () => {
  const c = await client();
  await c.state();
  await c.chat("Создай встречу с врачом завтра");
  let s = await c.chat("Создай задачу читать");
  assert.equal(s.pending, undefined);
  assert.equal(s.events.length, 1001);
  s = await c.chat("Создай задачу позвонить", {
    source: "voice",
    uncertain: true,
  });
  assert.equal(s.events.length, 1001);
  assert.equal(s.pending?.type, "speech");
  s = await c.chat({ action: "confirm", token: s.pending!.token });
  assert.equal(s.events.length, 1002);
  await c.chat("Создай встречу с командой 2028-01-02 в 10:00");
  s = await c.chat("30 минут", { source: "voice", uncertain: true });
  s = await c.chat({ action: "confirm", token: s.pending!.token });
  assert.equal(s.events.at(-1)?.duration, 30);
});
test("idempotent retry, concurrent duplicates, ownership and stale revision protections", async () => {
  const a = await client(),
    b = await client();
  await a.state();
  await b.state();
  const requestId = randomUUID();
  const [s] = await Promise.all([
    a.chat("Создай задачу не дублировать", { requestId }),
    a.chat("Создай задачу не дублировать", { requestId }),
  ]);
  assert.equal(s.events.length, 1001);
  await a.chat("Создай задачу другая", { requestId, expectStatus: 503 });
  const id = s.events.at(-1)!.id;
  let other = await b.chat({ action: "delete", id });
  assert.equal(other.pending, undefined);
  assert.match(last(other), /не найдена/);
  let mine = await a.chat({
    action: "update",
    id,
    revision: 1,
    title: "Новое название",
  });
  assert.equal(mine.events.at(-1)?.revision, 2);
  await a.chat(
    { action: "update", id, revision: 1, title: "Устаревшее" },
    { expectStatus: 503 },
  );
  assert.equal((await a.state()).events.at(-1)?.title, "Новое название");
  mine = await a.chat({ action: "delete", id });
  await a.chat({ action: "confirm", token: "stale" }, { expectStatus: 503 });
  assert.equal((await a.state()).pending?.token, mine.pending?.token);
  other = await b.state();
  assert.equal(other.events.length, 1000);
});
test("calendar filters, Russian inflections, empty search and malformed inputs", async () => {
  const c = await client();
  await c.state();
  let s = await c.chat("Покажи планы на завтра");
  assert.ok(s.messages.at(-1)?.events?.every((e) => e.date === "2026-10-31"));
  s = await c.chat("Найди технического задания");
  assert.ok((s.messages.at(-1)?.events?.length || 0) > 0);
  s = await c.chat("Найди абракадабрасквознойтест");
  assert.match(last(s), /записей нет/);
  await c.chat(
    { action: "create", title: "Ошибка", time: "25:00" },
    { expectStatus: 400 },
  );
});
test("same browser persistence survives reopen of SQLite; cookie and cross-site mutation protections", async () => {
  const c = await client();
  await c.state();
  await c.chat("Создай задачу сохраниться");
  const db = new Store(join(tmp, "app.sqlite"));
  const rows = db.db
    .prepare("SELECT body FROM workspaces")
    .all()
    .map((r) => JSON.parse(String(r.body)));
  assert.ok(
    rows.some((w) =>
      w.events.some((e: { title: string }) => e.title === "сохраниться"),
    ),
  );
  db.db.close();
  const r = await fetch(base + "/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: c.cookie() },
    body: JSON.stringify({
      requestId: randomUUID(),
      text: "Создай задачу CSRF",
    }),
  });
  assert.equal(r.status, 403);
  const state = await c.state();
  assert.ok(state.messages.length);
  assert.equal(state.voiceAvailable, false);
});
test("budget reserves globally, never overruns configured ceiling and no configured price blocks calls", () => {
  const db = new Store(":memory:", []);
  assert.throws(() => db.reserve("stt", NaN, 1000));
  db.reserve("gpt", 600, 1000);
  assert.throws(() => db.reserve("gpt", 401, 1000));
  assert.equal(db.spent(), 600);
  db.reserve("stt", 400, 1000);
  assert.equal(db.spent(), 1000);
  db.db.close();
});

test("incomplete text and invalid clock never create; original type remains inferred after moving", async () => {
  const c = await client();
  await c.state();
  let s = await c.chat("Создай задачу купить молоко завтра в");
  assert.equal(s.events.length, 1000);
  assert.match(last(s), /незаконченной/);
  s = await c.chat("Создай встречу с командой завтра в 25:00 на 30 минут");
  assert.equal(s.events.length, 1000);
  assert.match(last(s), /корректное время/);
  const original = s.events.find((e) => e.kind === "task")!;
  s = await c.chat({ action: "update", id: original.id, date: "2028-01-01" });
  assert.equal(s.events.find((e) => e.id === original.id)?.inferred, true);
  assert.deepEqual(
    s.events.find((e) => e.id === original.id)?.original,
    original.original,
  );
});
test("database write failure returns error without reporting or persisting success", async () => {
  const c = await client();
  await c.state();
  const save = store.save.bind(store);
  try {
    store.save = () => {
      throw new Error("Disk full");
    };
    await c.chat("Создай задачу не сохранить", { expectStatus: 503 });
  } finally {
    store.save = save;
  }
  assert.equal((await c.state()).events.length, 1000);
});

test("uncertain voice may select and cancel without mutating event data", async () => {
  const c = await client();
  await c.state();
  await c.chat({ action: "create", title: "Выбор голосом первый" });
  await c.chat({ action: "create", title: "Выбор голосом второй" });
  let s = await c.chat("Найди выбор голосом");
  s = await c.chat("2", { source: "voice", uncertain: true });
  assert.equal(s.pending, undefined);
  assert.ok(s.selected);
  assert.equal(s.events.length, 1002);
  s = await c.chat("Создай задачу голосовое уточнение", {
    source: "voice",
    uncertain: true,
  });
  assert.equal(s.pending?.type, "speech");
  s = await c.chat("Отмена", { source: "voice", uncertain: true });
  assert.equal(s.pending, undefined);
  assert.equal(s.events.length, 1002);
});
test("projects persist, retries are idempotent, duplicate names and cross-workspace project IDs are rejected", async () => {
  const c = await client();
  await c.state();
  const requestId = randomUUID();
  const command: Command = { action: "createProject", title: "Новый продукт" };
  const s = await c.chat(command, { requestId });
  const project = s.projects!.at(-1)!;
  assert.equal(project.name, "Новый продукт");
  assert.equal((await c.chat(command, { requestId })).projects!.length, 1);
  assert.equal((await c.state()).projects![0].id, project.id);
  await c.chat({ ...command, title: "новый продукт" }, { expectStatus: 503 });
  const other = await client();
  await other.state();
  await other.chat(
    { action: "create", title: "Чужой проект", projectId: project.id },
    { expectStatus: 503 },
  );
  await other.chat("Создай задачу тест", {
    projectId: project.id,
    expectStatus: 503,
  });
  assert.equal((await other.state()).events.length, 1000);
});
test("kanban moves are persisted, reopen completed tasks, reject stale revisions and preserve original dates", async () => {
  const c = await client();
  const initial = await c.state();
  const original = initial.events[0];
  const moving: Command = {
    action: "move",
    id: original.id,
    revision: original.revision,
    status: "in_progress",
  };
  const requestId = randomUUID();
  let s = await c.chat(moving, { requestId });
  let e = s.events.find((e) => e.id === original.id)!;
  assert.equal(e.status, "in_progress");
  assert.equal(e.completed, false);
  assert.deepEqual(e.original, original.original);
  assert.equal(e.date, original.date);
  assert.equal(s.pending, undefined);
  assert.equal(
    (await c.chat(moving, { requestId })).events.find(
      (e) => e.id === original.id,
    )!.revision,
    e.revision,
  );
  await c.chat(moving, { expectStatus: 503 });
  s = await c.chat({
    action: "move",
    id: e.id,
    revision: e.revision,
    status: "done",
  });
  e = s.events.find((x) => x.id === e.id)!;
  assert.equal(e.completed, true);
  s = await c.chat({
    action: "move",
    id: e.id,
    revision: e.revision,
    status: "todo",
  });
  e = s.events.find((x) => x.id === e.id)!;
  assert.equal(e.completed, false);
  assert.equal(e.status, "todo");
  assert.equal(
    (await c.state()).events.find((x) => x.id === e.id)!.status,
    "todo",
  );
  await c.chat({ action: "move", id: e.id }, { expectStatus: 503 });
});
test("Telemost and material links persist through edit, confirmation and removal", async () => {
  const c = await client();
  await c.state();
  let s = await c.chat({ action: "createProject", title: "Материалы" });
  const projectId = s.projects![0].id;
  const links = [
    {
      service: "telegram" as const,
      label: "Обсуждение",
      url: "https://t.me/example/12",
    },
    {
      service: "yandex_notes" as const,
      label: "Заметка",
      url: "https://disk.yandex.ru/notes/example",
    },
    {
      service: "other" as const,
      label: "Документ",
      url: "https://example.com/brief",
    },
  ];
  s = await c.chat({
    action: "create",
    title: "Подготовить обсуждение",
    date: "2026-10-29",
    projectId,
    links,
    callUrl: "https://telemost.yandex.ru/j/123456789",
  });
  assert.equal(s.pending?.type, "past");
  assert.deepEqual(s.pending?.draft?.links, links);
  s = await c.chat({ action: "confirm", token: s.pending!.token });
  let e = s.events.at(-1)!;
  assert.equal(e.projectId, projectId);
  assert.deepEqual(e.links, links);
  assert.equal(e.callUrl, "https://telemost.yandex.ru/j/123456789");
  s = await c.chat({
    action: "update",
    id: e.id,
    revision: e.revision,
    date: null,
    title: "Проверить материалы",
  });
  e = s.events.find((x) => x.id === e.id)!;
  assert.deepEqual(e.links, links);
  assert.equal(e.projectId, projectId);
  s = await c.chat({
    action: "update",
    id: e.id,
    revision: e.revision,
    projectId: null,
    callUrl: null,
    links: [],
  });
  e = (await c.state()).events.find((x) => x.id === e.id)!;
  assert.deepEqual(e.links, []);
  assert.equal(e.callUrl, null);
  assert.equal(e.projectId, null);
});
test("link validation rejects executable URLs, credentials, fake service domains and overlarge link sets", async () => {
  const c = await client();
  await c.state();
  for (const url of [
    "javascript:alert(1)",
    "http://telemost.yandex.ru/j/123",
    "https://telemost.yandex.ru.attacker.invalid/j/123",
    "https://user:pass@telemost.yandex.ru/j/123",
    "https://telemost.yandex.ru/",
  ]) {
    await c.chat(
      { action: "create", title: "Невалидный созвон", callUrl: url },
      { expectStatus: 400 },
    );
  }
  for (const [service, url] of [
    ["telegram", "https://example.com"],
    ["other", "data:text/html,test"],
    ["yandex_notes", "javascript:alert(1)"],
  ] as const) {
    await c.chat(
      {
        action: "create",
        title: "Невалидный материал",
        links: [{ service, url, label: "Материал" }],
      },
      { expectStatus: 400 },
    );
  }
  await c.chat(
    {
      action: "create",
      title: "Слишком много",
      links: Array.from({ length: 13 }, () => ({
        service: "other",
        url: "https://example.com",
        label: "Материал",
      })),
    },
    { expectStatus: 400 },
  );
  assert.equal((await c.state()).events.length, 1000);
});
test("chat and confirmed speech retain selected project across clarification without silently moving existing events", async () => {
  const c = await client();
  await c.state();
  let s = await c.chat({ action: "createProject", title: "Голосовой проект" });
  const projectId = s.projects![0].id;
  s = await c.chat("Создай встречу с командой завтра в 18:13", { projectId });
  assert.equal(s.pending?.draft?.projectId, projectId);
  s = await c.chat("30 минут");
  assert.equal(s.events.at(-1)!.projectId, projectId);
  s = await c.chat("Создай задачу проверить ссылки", {
    source: "voice",
    projectId,
  });
  assert.equal(s.pending?.type, "speech");
  const before = s.events.length;
  s = await c.chat({ action: "confirm", token: s.pending!.token });
  assert.equal(s.events.length, before + 1);
  assert.equal(s.events.at(-1)!.projectId, projectId);
  const e = s.events.at(-1)!;
  s = await c.chat(
    { action: "update", id: e.id, revision: e.revision, title: "Новое имя" },
    { projectId: null },
  );
  assert.equal(s.events.find((x) => x.id === e.id)!.projectId, projectId);
  s = await c.chat({ action: "complete", id: e.id });
  assert.equal(s.events.find((x) => x.id === e.id)!.status, "done");
});

test("the supported maximum of material links fits the HTTP body and survives storage", async () => {
  const c = await client();
  await c.state();
  const prefix = "https://example.com/";
  const links = Array.from({ length: 12 }, (_, i) => ({
    service: "other" as const,
    label: `Материал ${i}`,
    url: prefix + "я".repeat(2048 - prefix.length),
  }));
  const s = await c.chat({ action: "create", title: "Большие ссылки", links });
  assert.deepEqual(s.events.at(-1)!.links, links);
  assert.deepEqual((await c.state()).events.at(-1)!.links, links);
});

test("task description survives confirmation, edits, column moves, and SQLite reopen; can be cleared", async () => {
  const c = await client();
  await c.state();
  const description =
    "Проверить материалы запуска.\nСогласовать итоговую презентацию с командой.";
  let s = await c.chat({
    action: "create",
    title: "Задача с описанием",
    description,
    date: "2026-01-01",
    priority: "high",
  });
  assert.equal(s.pending?.draft?.description, description);
  s = await c.chat({ action: "confirm", token: s.pending!.token });
  let e = s.events.at(-1)!;
  assert.equal(e.description, description);
  s = await c.chat({
    action: "update",
    id: e.id,
    revision: e.revision,
    title: "Название изменено",
    date: null,
  });
  e = s.events.at(-1)!;
  assert.equal(e.description, description);
  s = await c.chat({
    action: "move",
    id: e.id,
    revision: e.revision,
    status: "in_progress",
  });
  e = s.events.at(-1)!;
  assert.equal(e.description, description);
  assert.equal(e.status, "in_progress");
  const reopened = new Store(join(tmp, "app.sqlite"));
  try {
    const saved = reopened.db
      .prepare("SELECT body FROM workspaces")
      .all()
      .map((r) => JSON.parse(String(r.body)) as Workspace)
      .flatMap((w) => w.events)
      .find((x) => x.id === e.id);
    assert.equal(saved?.description, description);
  } finally {
    reopened.db.close();
  }
  await c.chat({
    action: "update",
    id: e.id,
    revision: e.revision,
    description: "",
  });
  assert.equal((await c.state()).events.at(-1)!.description, "");
});
test("description rejects oversized input and retains Unicode and line breaks at the allowed limit", async () => {
  const c = await client();
  await c.state();
  await c.chat(
    {
      action: "create",
      title: "Слишком длинное описание",
      description: "я".repeat(4001),
    },
    { expectStatus: 400 },
  );
  assert.equal((await c.state()).events.length, 1000);
  const description = "я".repeat(1999) + "\n" + "а".repeat(2000);
  const s = await c.chat({
    action: "create",
    title: "Описание 4000 символов",
    description,
  });
  assert.equal(s.events.at(-1)!.description, description);
});

test("chat attachment persists and is private to its workspace", async () => {
  const owner = await client();
  const other = await client();
  await owner.state();
  await other.state();
  const bytes = Buffer.from("attachment fixture");
  const response = await fetch(base + "/api/attachments", {
    method: "POST",
    headers: {
      cookie: owner.cookie(),
      "x-app-request": "voice-planner",
      "content-type": "application/octet-stream",
      "x-file-name": encodeURIComponent("пример.txt"),
    },
    body: bytes,
  });
  assert.equal(response.status, 200);
  const state = (await response.json()) as AppState;
  const attachment = state.messages.at(-1)?.attachment;
  assert(attachment);
  assert.equal(attachment.name, "пример.txt");
  assert.equal(attachment.size, bytes.length);
  const reload = await owner.state();
  assert.equal(reload.messages.at(-1)?.attachment?.id, attachment.id);
  const download = await fetch(base + `/api/attachments/${attachment.id}`, {
    headers: { cookie: owner.cookie() },
  });
  assert.equal(download.status, 200);
  assert.match(
    download.headers.get("content-disposition") || "",
    /^attachment;/,
  );
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
  const forbidden = await fetch(base + `/api/attachments/${attachment.id}`, {
    headers: { cookie: other.cookie() },
  });
  assert.equal(forbidden.status, 404);
  const empty = await fetch(base + "/api/attachments", {
    method: "POST",
    headers: {
      cookie: owner.cookie(),
      "x-app-request": "voice-planner",
      "content-type": "application/octet-stream",
      "x-file-name": "x.txt",
    },
    body: Buffer.alloc(0),
  });
  assert.equal(empty.status, 400);
});
