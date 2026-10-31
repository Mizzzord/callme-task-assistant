import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../server/store.ts";

test("seed can be disabled for new workspaces", () => {
  const previous = process.env.CALLME_SEED;
  process.env.CALLME_SEED = "false";
  const store = new Store(":memory:");
  try {
    store.create("empty");
    assert.deepEqual(store.read("empty")?.events, []);
    assert.deepEqual(store.seed, []);
  } finally {
    store.db.close();
    if (previous === undefined) delete process.env.CALLME_SEED;
    else process.env.CALLME_SEED = previous;
  }
});
