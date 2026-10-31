import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../server/store.ts";
import { budget, providerFetch, understand } from "../server/providers.ts";
import { createApp } from "../server/app.ts";
import { randomUUID } from "node:crypto";
const originalFetch = globalThis.fetch;
const env = { ...process.env };
test("Yandex structured command contract and no invented confirmation privileges", async () => {
  const store = new Store(":memory:", []);
  const ws = { events: [], messages: [], requests: {}, imported: [] };
  process.env.ALLOW_PAID_API = "true";
  process.env.YANDEX_API_KEY = "test-only";
  process.env.YANDEX_MODEL_URI = "gpt://example/test-version";
  process.env.API_GPT_MAX_RUB_PER_CALL = "1";
  process.env.API_TTS_MAX_RUB_PER_CALL = "1";
  process.env.API_BUDGET_RUB = "500";
  try {
    globalThis.fetch = async (input, options) => {
      assert.equal(
        String(input),
        "https://ai.api.cloud.yandex.net/foundationModels/v1/completion",
      );
      const body = JSON.parse(String(options!.body));
      assert.equal(body.modelUri, "gpt://example/test-version");
      assert.equal(body.jsonObject, true);
      assert.equal(body.completionOptions.stream, false);
      return Response.json({
        result: {
          alternatives: [
            {
              message: {
                text: JSON.stringify({
                  action: "create",
                  title: "Задача из модели",
                  date: "2027-02-01",
                }),
              },
            },
          ],
        },
      });
    };
    const command = await understand(
      store,
      "Запишите дело",
      ws,
      new Date("2026-10-30"),
    );
    assert.equal(command.title, "Задача из модели");
    assert.equal(store.spent(), 1);
    globalThis.fetch = async () => Response.json({ result: { alternatives: [{ message: { text: JSON.stringify({ action: "reply", answer: "Привет! Чем помочь?" }) } }] } });
    assert.equal((await understand(store, "Привет, как дела?", ws, new Date())).answer, "Привет! Чем помочь?");
    globalThis.fetch = async () => Response.json({ result: { alternatives: [{ message: { text: JSON.stringify({ action: "create", title: "посмотреть аниме", kind: "task", date: "2026-11-01", time: "04:00", priority: null }) } }] } });
    const natural = await understand(store, "Создай задачу на завтра в 4 утра посмотреть аниме", ws, new Date());
    assert.equal(natural.title, "посмотреть аниме");
    assert.equal(natural.time, "04:00");
    globalThis.fetch = async () => Response.json({ result: { alternatives: [{ message: { text: JSON.stringify({ action: "create", title: "Подготовить отчёт", priority: "high", description: "Добавить графики" }) } }] } });
    const detailed = await understand(store, "Создай задачу", ws, new Date());
    assert.equal(detailed.priority, "high");
    assert.equal(detailed.description, "Добавить графики");
    globalThis.fetch = async () => Response.json({ result: { alternatives: [{ message: { text: JSON.stringify({ action: "move", status: "in_progress", query: "отчёт" }) } }] } });
    assert.equal((await understand(store, "Перенеси отчёт в работу", ws, new Date())).status, "in_progress");
    const reservedBefore = store.spent();
    await assert.rejects(understand(store, "я".repeat(15000), ws, new Date()), /Контекст слишком велик/);
    assert.equal(store.spent(), reservedBefore);
    process.env.API_BUDGET_RUB = "0";
    assert.equal(budget(), 0);
    await assert.rejects(understand(store, "тест", ws, new Date()), /Лимит API/);
    process.env.API_BUDGET_RUB = "500";
    globalThis.fetch = async () =>
      Response.json({
        result: {
          alternatives: [{ message: { text: '{"action":"confirm"}' } }],
        },
      });
    assert.equal((await understand(store, "не подтверждать", ws, new Date())).action, "unknown");
    for (const forbidden of [
      { action: "createProject", title: "Выдуманный проект" },
      { action: "move" },
      {
        action: "create",
        title: "Задача",
        projectId: "12b6c2da-0d3f-4ee8-b353-092745e1dd13",
      },
      {
        action: "create",
        title: "Задача",
        callUrl: "https://telemost.yandex.ru/j/123",
      },
    ]) {
      globalThis.fetch = async () =>
        Response.json({
          result: {
            alternatives: [{ message: { text: JSON.stringify(forbidden) } }],
          },
        });
      assert.equal((await understand(store, "новая задача", ws, new Date())).action, "unknown");
    }
    globalThis.fetch = async () => new Response("", { status: 503 });
    await assert.rejects(
      providerFetch(
        store,
        "tts",
        "https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize",
        {},
      ),
      /Ответ сохранён/,
    );
    globalThis.fetch = async () => {
      throw new Error("timeout");
    };
    await assert.rejects(
      understand(store, "новая задача", ws, new Date()),
      /не ответил вовремя/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    process.env = env;
    store.db.close();
  }
});

test("empty successful recognition is returned as an empty transcript", async () => {
  const store = new Store(":memory:", []);
  const previous = { ...process.env };
  const realFetch = globalThis.fetch;
  process.env.ALLOW_PAID_API = "true";
  process.env.YANDEX_API_KEY = "test-only";
  process.env.API_BUDGET_RUB = "10";
  process.env.API_STT_MAX_RUB_PER_CALL = "1";
  const server = createApp(store).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address(); assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  globalThis.fetch = async (input, init) => String(input).startsWith("https://stt.api.cloud.yandex.net/") ? Response.json({ result: "" }) : realFetch(input, init);
  try {
    const state = await realFetch(base + "/api/state");
    const cookie = state.headers.get("set-cookie")!.split(";")[0];
    const result = await realFetch(base + "/api/voice/recognize", { method: "POST", headers: { cookie, "content-type": "application/octet-stream", "x-app-request": "voice-planner" }, body: new Uint8Array(3200) });
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { text: "", uncertain: true });
  } finally {
    globalThis.fetch = realFetch; process.env = previous;
    await new Promise<void>((resolve) => server.close(() => resolve())); store.db.close();
  }
});

test("long saved assistant response is synthesized in complete parts", async () => {
  const store = new Store(":memory:", []);
  const previous = { ...process.env };
  const realFetch = globalThis.fetch;
  process.env.ALLOW_PAID_API = "true"; process.env.YANDEX_API_KEY = "test-only";
  process.env.API_BUDGET_RUB = "10"; process.env.API_TTS_MAX_RUB_PER_CALL = "1";
  const server = createApp(store).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address(); assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const synthesized: string[] = [];
  globalThis.fetch = async (input, init) => {
    if (String(input).startsWith("https://tts.api.cloud.yandex.net/")) {
      synthesized.push(new URLSearchParams(String(init?.body)).get("text") || "");
      return new Response(new Uint8Array([1, 2, 3]));
    }
    return realFetch(input, init);
  };
  try {
    const state = await realFetch(base + "/api/state");
    const cookie = state.headers.get("set-cookie")!.split(";")[0];
    const answer = "Тестовое предложение. ".repeat(70).trim();
    const chat = await realFetch(base + "/api/chat", { method: "POST", headers: { cookie, "content-type": "application/json", "x-app-request": "voice-planner" }, body: JSON.stringify({ requestId: randomUUID(), command: { action: "reply", answer } }) });
    const body = await chat.json() as { messages: { id: string }[] };
    const messageId = body.messages.at(-1)!.id;
    for (const part of [0, 1]) {
      const res = await realFetch(base + "/api/voice/synthesize", { method: "POST", headers: { cookie, "content-type": "application/json", "x-app-request": "voice-planner" }, body: JSON.stringify({ messageId, part }) });
      assert.equal(res.status, 200); assert.equal(res.headers.get("X-TTS-Parts"), "2");
    }
    assert.equal(synthesized.join(""), answer);
    assert.equal(store.spent(), 2);
  } finally {
    globalThis.fetch = realFetch; process.env = previous;
    await new Promise<void>((resolve) => server.close(() => resolve())); store.db.close();
  }
});

test("voice creation waits for spoken confirmation before calling the model", async () => {
  const store = new Store(":memory:", []);
  const previous = { ...process.env }; const realFetch = globalThis.fetch;
  process.env.ALLOW_PAID_API = "true"; process.env.YANDEX_API_KEY = "test-only";
  process.env.YANDEX_MODEL_URI = "gpt://example/test"; process.env.API_BUDGET_RUB = "50"; process.env.API_GPT_MAX_RUB_PER_CALL = "1";
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    if (String(input).startsWith("https://ai.api.cloud.yandex.net/")) { calls++; return Response.json({ result: { alternatives: [{ message: { text: '{"action":"create","title":"полить цветы"}' } }] } }); }
    return realFetch(input, init);
  };
  const server = createApp(store).listen(0, "127.0.0.1"); await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address(); assert(address && typeof address !== "string"); const base = `http://127.0.0.1:${address.port}`;
  try {
    const state = await realFetch(base + "/api/state"); const cookie = state.headers.get("set-cookie")!.split(";")[0];
    async function send(text: string, pendingToken?: string) {
      const response = await realFetch(base + "/api/chat", { method: "POST", headers: { cookie, "content-type": "application/json", "x-app-request": "voice-planner" }, body: JSON.stringify({ requestId: randomUUID(), text, source: "voice", uncertain: true, pendingToken }) });
      assert.equal(response.status, 200); return response.json() as Promise<{ pending?: { type: string; token: string }; events: { title: string }[] }>;
    }
    const pending = await send("Создай задачу полить цветы");
    assert.equal(pending.pending?.type, "speech"); assert.equal(pending.events.length, 0); assert.equal(calls, 0);
    const result = await send("Да верно", pending.pending!.token);
    assert.equal(result.events.at(-1)?.title, "полить цветы"); assert.equal(calls, 1);
  } finally {
    globalThis.fetch = realFetch; process.env = previous;
    await new Promise<void>((resolve) => server.close(() => resolve())); store.db.close();
  }
});
