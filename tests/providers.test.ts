import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../server/store.ts";
import { providerFetch, understand } from "../server/providers.ts";
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
    globalThis.fetch = async () =>
      Response.json({
        result: {
          alternatives: [{ message: { text: '{"action":"confirm"}' } }],
        },
      });
    await assert.rejects(
      understand(store, "не подтверждать", ws, new Date()),
      /не прошёл проверку/,
    );
    for (const forbidden of [
      { action: "createProject", title: "Выдуманный проект" },
      { action: "move", status: "done" },
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
      await assert.rejects(
        understand(store, "новая задача", ws, new Date()),
        /не прошёл проверку/,
      );
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
