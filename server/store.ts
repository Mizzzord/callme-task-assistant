import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { parse } from "csv-parse/sync";
import { randomUUID } from "node:crypto";
import type { CalendarEvent, Workspace } from "../src/types.ts";
import { validDate } from "./domain.ts";
export function loadSeed(path = "data/events.csv"): CalendarEvent[] {
  const rows = parse(readFileSync(path, "utf8"), {
    columns: true,
    bom: true,
    skip_empty_lines: true,
  }) as { id: string; date: string; time: string; text: string }[];
  const ids = new Set<string>();
  return rows.map((row) => {
    if (
      !row.id ||
      ids.has(row.id) ||
      !validDate(row.date) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(row.time) ||
      !row.text
    )
      throw new Error("Некорректный исходный CSV или повторный ID");
    ids.add(row.id);
    return {
      id: `seed-${row.id}`,
      title: row.text,
      kind: /^(встреча|созвон|совещание|демо|интервью|провести планёрку)/i.test(
        row.text,
      )
        ? "meeting"
        : /^напомнить/i.test(row.text)
          ? "reminder"
          : "task",
      date: row.date,
      time: row.time,
      duration: null,
      completed: false,
      inferred: true,
      revision: 1,
      original: { ...row },
      createdAt: `${row.date}T${row.time}:00+03:00`,
      updatedAt: `${row.date}T${row.time}:00+03:00`,
    };
  });
}
export function importSeed(ws: Workspace, seed: CalendarEvent[]) {
  const known = new Set(ws.imported);
  for (const e of seed)
    if (!known.has(e.id)) {
      ws.events.push(structuredClone(e));
      ws.imported.push(e.id);
    }
}
export class Store {
  db: DatabaseSync;
  seed: CalendarEvent[];
  constructor(path = "data/app.sqlite", seed = process.env.CALLME_SEED === "false" ? [] : loadSeed()) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.seed = seed;
    this.db.exec(
      "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS usage (id TEXT PRIMARY KEY, kind TEXT NOT NULL, reserved REAL NOT NULL, at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS chat_attachments (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL, name TEXT NOT NULL, data BLOB NOT NULL);",
    );
  }
  read(id: string): Workspace | undefined {
    const row = this.db
      .prepare("SELECT body FROM workspaces WHERE id=?")
      .get(id);
    return row ? JSON.parse(String(row.body)) : undefined;
  }
  create(id: string) {
    const ws: Workspace = {
      events: [],
      messages: [],
      imported: [],
      requests: {},
    };
    importSeed(ws, this.seed);
    this.save(id, ws);
    return ws;
  }
  save(id: string, ws: Workspace) {
    this.db
      .prepare(
        "INSERT INTO workspaces (id,body) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
      )
      .run(id, JSON.stringify(ws));
  }
  transaction<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  readFor(id: string, userId?: string): Workspace {
    const ws = this.read(id)!;
    if (!userId) return ws;
    const row = this.db
      .prepare("SELECT body FROM conversations WHERE team_id=? AND user_id=?")
      .get(id, userId);
    return {
      ...ws,
      messages: [],
      requests: {},
      selected: undefined,
      pending: undefined,
      ...(row ? JSON.parse(String(row.body)) : {}),
    };
  }
  saveFor(id: string, ws: Workspace, userId?: string) {
    if (!userId) return this.save(id, ws);
    this.transaction(() => {
      const { messages, requests, selected, pending, ...shared } = ws;
      this.save(id, { ...shared, messages: [], requests: {} });
      this.db
        .prepare(
          "INSERT INTO conversations(team_id,user_id,body) VALUES(?,?,?) ON CONFLICT(team_id,user_id) DO UPDATE SET body=excluded.body",
        )
        .run(
          id,
          userId,
          JSON.stringify({ messages, requests, selected, pending }),
        );
    });
  }
  spent() {
    return Number(
      this.db
        .prepare("SELECT COALESCE(SUM(reserved),0) AS total FROM usage")
        .get()!.total,
    );
  }
  reserve(kind: string, amount: number, limit: number) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (
        !Number.isFinite(amount) ||
        amount <= 0 ||
        this.spent() + amount > limit
      )
        throw new Error(
          "Лимит API исчерпан или не настроена оценка стоимости. Платный запрос не отправлен.",
        );
      this.db
        .prepare("INSERT INTO usage VALUES (?,?,?,?)")
        .run(randomUUID(), kind, amount, new Date().toISOString());
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
}
