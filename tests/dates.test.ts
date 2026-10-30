import { test } from "node:test";
import assert from "node:assert/strict";
import {
  localCommand,
  periodEvents,
  today,
  addDays,
} from "../server/domain.ts";
import type { Workspace, CalendarEvent } from "../src/types.ts";
const ws: Workspace = { events: [], messages: [], imported: [], requests: {} };
test("Moscow midnight and year rollover, relative days and hours", () => {
  const now = new Date("2026-12-31T21:30:00Z");
  assert.equal(today(now), "2027-01-01");
  assert.equal(
    localCommand("Создай задачу проверить завтра", ws, now).date,
    "2027-01-02",
  );
  assert.equal(
    localCommand("Создай задачу проверить послезавтра", ws, now).date,
    "2027-01-03",
  );
  const c = localCommand("Создай задачу проверить через 2 часа", ws, now);
  assert.equal(c.date, "2027-01-01");
  assert.equal(c.time, "02:30");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(addDays("2027-02-28", 1), "2027-03-01");
});
test("current week stops on Sunday and does not include next Monday", () => {
  const events = ["2026-11-01", "2026-11-02"].map(
    (date) => ({ date }) as CalendarEvent,
  );
  assert.deepEqual(
    periodEvents(events, "week", new Date("2026-10-30T10:00:00Z")).map(
      (e) => e.date,
    ),
    ["2026-11-01"],
  );
});
