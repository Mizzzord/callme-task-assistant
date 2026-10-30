import {
  randomBytes,
  randomUUID,
  createHash,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import type { Express, Response } from "express";
import { z } from "zod";
import type { Store } from "./store.ts";
import type {
  AccountState,
  AccountUser,
  TeamInvite,
  TeamMember,
  TeamRole,
} from "../src/types.ts";
export class AccessError extends Error {
  constructor(
    message: string,
    public status = 403,
  ) {
    super(message);
  }
}
export type Identity = {
  user: AccountUser;
  teamId: string;
  role: TeamRole;
  session: string;
};
export type Locked = <T>(id: string, work: () => Promise<T> | T) => Promise<T>;
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
const credentials = z.object({
  email: z.email().trim().toLowerCase().max(254),
  password: z.string().min(10).max(128),
});
const cookieOptions = () => ({
  httpOnly: true,
  sameSite: "strict" as const,
  secure: process.env.COOKIE_SECURE === "true",
  path: "/",
  maxAge: 30 * 86400000,
});
const roleValue = (value: unknown): TeamRole =>
  value === "owner" ? "owner" : value === "member" ? "member" : "viewer";
async function derive(password: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(
      password,
      salt,
      64,
      { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
      (err, key) => (err ? reject(err) : resolve(key)),
    ),
  );
}
async function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + (await derive(password, salt)).toString("hex");
}
async function passwordMatches(password: string, encoded: string) {
  const [salt, key] = encoded.split(":");
  const actual = await derive(password, salt);
  const expected = Buffer.from(key, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export class Accounts {
  constructor(
    public store: Store,
    private clock: () => Date,
  ) {
    store.db.exec(`
      CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,password_hash TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS memberships(team_id TEXT NOT NULL,user_id TEXT NOT NULL,role TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(team_id,user_id));
      CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,team_id TEXT NOT NULL,expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS invitations(id TEXT PRIMARY KEY,hash TEXT UNIQUE NOT NULL,team_id TEXT NOT NULL,role TEXT NOT NULL,expires INTEGER NOT NULL,used_by TEXT,revoked INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS conversations(team_id TEXT NOT NULL,user_id TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(team_id,user_id));
    `);
  }
  isTeam(id: string) {
    return Boolean(
      this.store.db
        .prepare("SELECT 1 FROM memberships WHERE team_id=? LIMIT 1")
        .get(id),
    );
  }
  role(teamId: string, userId: string) {
    const row = this.store.db
      .prepare("SELECT role FROM memberships WHERE team_id=? AND user_id=?")
      .get(teamId, userId);
    return row ? roleValue(row.role) : undefined;
  }
  resolve(token: unknown): Identity | undefined {
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) return;
    const hash = digest(token);
    const row = this.store.db
      .prepare(
        "SELECT users.id,users.email,users.name,sessions.team_id,memberships.role FROM sessions JOIN users ON users.id=sessions.user_id JOIN memberships ON memberships.team_id=sessions.team_id AND memberships.user_id=users.id WHERE sessions.hash=? AND sessions.expires>?",
      )
      .get(hash, this.clock().getTime());
    if (!row) return;
    return {
      user: {
        id: String(row.id),
        name: String(row.name),
        email: String(row.email),
      },
      teamId: String(row.team_id),
      role: roleValue(row.role),
      session: hash,
    };
  }
  current(identity?: Identity) {
    if (!identity) return undefined;
    const row = this.store.db
      .prepare("SELECT team_id FROM sessions WHERE hash=? AND expires>?")
      .get(identity.session, this.clock().getTime());
    const role = this.role(identity.teamId, identity.user.id);
    if (!row || row.team_id !== identity.teamId || !role)
      throw new AccessError("Доступ к команде изменился. Войдите снова.", 401);
    return { ...identity, role };
  }
  requireOwner(identity?: Identity) {
    const current = this.current(identity);
    if (!current || current.role !== "owner")
      throw new AccessError(
        "Только владелец управляет командой и приглашениями.",
      );
    return current;
  }
  members(teamId: string): TeamMember[] {
    return this.store.db
      .prepare(
        "SELECT users.id,users.name,users.email,memberships.role,memberships.revision FROM memberships JOIN users ON users.id=memberships.user_id WHERE team_id=? ORDER BY CASE role WHEN 'owner' THEN 0 ELSE 1 END,users.name",
      )
      .all(teamId)
      .map((r) => ({
        id: String(r.id),
        name: String(r.name),
        email: String(r.email),
        role: roleValue(r.role),
        revision: Number(r.revision),
      }));
  }
  snapshot(teamId: string, identity?: Identity): AccountState {
    const ws = this.store.read(teamId)!;
    const current = this.current(identity);
    const teams = current
      ? this.store.db
          .prepare(
            "SELECT team_id,role FROM memberships WHERE user_id=? ORDER BY rowid",
          )
          .all(current.user.id)
          .map((r) => ({
            id: String(r.team_id),
            name: this.store.read(String(r.team_id))?.teamName || "Моя команда",
            role: roleValue(r.role),
          }))
      : [];
    return {
      user: current?.user || null,
      role: current?.role || null,
      team: {
        id: teamId,
        name: ws.teamName || (current ? "Моя команда" : "Личное пространство"),
        revision: ws.teamRevision || 1,
      },
      teams,
      members: current ? this.members(teamId) : [],
    };
  }
  invitation(token: string) {
    const row = this.store.db
      .prepare("SELECT * FROM invitations WHERE hash=?")
      .get(digest(token));
    if (
      !row ||
      row.used_by ||
      row.revoked ||
      Number(row.expires) <= this.clock().getTime()
    )
      throw new AccessError(
        "Приглашение недействительно, уже использовано или срок истёк.",
        410,
      );
    return {
      id: String(row.id),
      teamId: String(row.team_id),
      role: roleValue(row.role) as "member" | "viewer",
      expiresAt: new Date(Number(row.expires)).toISOString(),
    };
  }
  invites(teamId: string): TeamInvite[] {
    return this.store.db
      .prepare(
        "SELECT id,role,expires,used_by,revoked FROM invitations WHERE team_id=? ORDER BY rowid DESC LIMIT 50",
      )
      .all(teamId)
      .map((r) => ({
        id: String(r.id),
        role: r.role === "member" ? "member" : "viewer",
        expiresAt: new Date(Number(r.expires)).toISOString(),
        status: r.revoked
          ? "revoked"
          : r.used_by
            ? "used"
            : Number(r.expires) <= this.clock().getTime()
              ? "expired"
              : "active",
      }));
  }
  issueSession(userId: string, teamId: string, res: Response) {
    const token = randomBytes(32).toString("hex");
    this.store.db
      .prepare("DELETE FROM sessions WHERE expires<=?")
      .run(this.clock().getTime());
    this.store.db
      .prepare("INSERT INTO sessions VALUES(?,?,?,?)")
      .run(
        digest(token),
        userId,
        teamId,
        this.clock().getTime() + 30 * 86400000,
      );
    res.cookie("callme_session", token, cookieOptions());
  }
  claimPersonal(teamId: string, userId: string, name: string) {
    if (this.isTeam(teamId))
      throw new AccessError("Пространство уже принадлежит аккаунту.");
    const ws = this.store.read(teamId) || this.store.create(teamId);
    this.store.db.prepare("INSERT INTO conversations VALUES(?,?,?)").run(
      teamId,
      userId,
      JSON.stringify({
        messages: ws.messages,
        pending: ws.pending,
        selected: ws.selected,
        requests: ws.requests,
      }),
    );
    this.store.db
      .prepare(
        "UPDATE chat_attachments SET user_id=? WHERE workspace_id=? AND user_id='' ",
      )
      .run(userId, teamId);
    this.store.save(teamId, {
      ...ws,
      teamName: name,
      teamRevision: 1,
      messages: [],
      requests: {},
      pending: undefined,
      selected: undefined,
    });
    this.store.db
      .prepare("INSERT INTO memberships(team_id,user_id,role) VALUES(?,?,?)")
      .run(teamId, userId, "owner");
  }
  accept(token: string, userId: string) {
    const invite = this.invitation(token);
    if (this.role(invite.teamId, userId))
      throw new AccessError("Вы уже состоите в этой команде.", 409);
    this.store.db
      .prepare("INSERT INTO memberships(team_id,user_id,role) VALUES(?,?,?)")
      .run(invite.teamId, userId, invite.role);
    const result = this.store.db
      .prepare(
        "UPDATE invitations SET used_by=? WHERE id=? AND used_by IS NULL AND revoked=0 AND expires>?",
      )
      .run(userId, invite.id, this.clock().getTime());
    if (result.changes !== 1)
      throw new AccessError("Приглашение уже использовано.", 409);
    return invite.teamId;
  }
}
export function installAccountRoutes(
  app: Express,
  accounts: Accounts,
  locked: Locked,
  clock: () => Date,
) {
  const store = accounts.store;
  const rate = new Map<string, { count: number; until: number }>();
  app.use("/api", (req, res, next) => {
    const identity = accounts.resolve(req.cookies.callme_session);
    res.locals.account = identity;
    if (
      identity &&
      req.path.startsWith("/team/") &&
      req.path !== "/team/switch" &&
      req.get("x-team-id") &&
      req.get("x-team-id") !== identity.teamId
    )
      return res
        .status(409)
        .json({ error: "Команда изменилась. Обновите страницу." });
    if (req.cookies.callme_session && !identity) {
      res.clearCookie("callme_session", { path: "/" });
      if (!req.path.startsWith("/auth/") && !req.path.startsWith("/invites/"))
        return res
          .status(401)
          .json({ error: "Сессия истекла или доступ отозван. Войдите снова." });
    }
    next();
  });
  app.use("/api/auth", (req, res, next) => {
    if (req.method !== "POST" || !["/login", "/register"].includes(req.path))
      return next();
    const now = clock().getTime();
    for (const [key, entry] of rate) if (entry.until <= now) rate.delete(key);
    const key = req.ip || "local";
    const entry = rate.get(key) || { count: 0, until: now + 15 * 60000 };
    entry.count++;
    rate.set(key, entry);
    if (entry.count > 20)
      return res.status(429).json({
        error: "Слишком много попыток входа. Повторите через 15 минут.",
      });
    next();
  });
  app.post("/api/auth/register", async (req, res) => {
    if (res.locals.account)
      throw new AccessError("Вы уже вошли в аккаунт.", 409);
    const body = credentials
      .extend({
        name: z.string().trim().min(2).max(80),
        teamName: z.string().trim().min(1).max(80).optional(),
        inviteToken: tokenSchema.optional(),
      })
      .strict()
      .parse(req.body);
    const password = await passwordHash(body.password);
    const userId = randomUUID();
    const personal =
      typeof req.cookies.workspace === "string"
        ? digest(req.cookies.workspace)
        : randomUUID();
    await locked(personal, () =>
      store.transaction(() => {
        if (
          store.db.prepare("SELECT 1 FROM users WHERE email=?").get(body.email)
        )
          throw new AccessError(
            "Не удалось зарегистрировать этот адрес. Попробуйте войти.",
            409,
          );
        store.db
          .prepare("INSERT INTO users VALUES(?,?,?,?)")
          .run(userId, body.email, body.name, password);
        let teamId: string;
        if (body.inviteToken)
          teamId = accounts.accept(body.inviteToken, userId);
        else {
          teamId = accounts.isTeam(personal) ? randomUUID() : personal;
          accounts.claimPersonal(
            teamId,
            userId,
            body.teamName || "Моя команда",
          );
        }
        accounts.issueSession(userId, teamId, res);
      }),
    );
    res.json({ ok: true });
  });
  app.post("/api/auth/login", async (req, res) => {
    const body = credentials.parse(req.body);
    const row = store.db
      .prepare("SELECT id,password_hash,name FROM users WHERE email=?")
      .get(body.email);
    const dummy = "00000000000000000000000000000000:" + "00".repeat(64);
    const valid = await passwordMatches(
      body.password,
      row ? String(row.password_hash) : dummy,
    );
    if (!row || !valid)
      throw new AccessError("Неверный адрес или пароль.", 401);
    store.transaction(() => {
      let teamId = store.db
        .prepare(
          "SELECT team_id FROM memberships WHERE user_id=? ORDER BY rowid LIMIT 1",
        )
        .get(String(row.id))?.team_id;
      if (!teamId) {
        teamId = randomUUID();
        accounts.claimPersonal(String(teamId), String(row.id), "Моя команда");
      }
      if (res.locals.account)
        store.db
          .prepare("DELETE FROM sessions WHERE hash=?")
          .run((res.locals.account as Identity).session);
      accounts.issueSession(String(row.id), String(teamId), res);
    });
    res.json({ ok: true });
  });
  app.post("/api/auth/logout", (req, res) => {
    if (typeof req.cookies.callme_session === "string")
      store.db
        .prepare("DELETE FROM sessions WHERE hash=?")
        .run(digest(req.cookies.callme_session));
    res.clearCookie("callme_session", { path: "/" });
    res.json({ ok: true });
  });
  app.get("/api/invites/:token", (req, res) => {
    const token = tokenSchema.parse(req.params.token);
    const invite = accounts.invitation(token);
    res.json({
      teamName: store.read(invite.teamId)?.teamName || "Команда",
      role: invite.role,
      expiresAt: invite.expiresAt,
    });
  });
  app.post("/api/invites/accept", async (req, res) => {
    const identity = accounts.current(res.locals.account);
    if (!identity) throw new AccessError("Сначала войдите в аккаунт.", 401);
    const { token } = z.object({ token: tokenSchema }).parse(req.body);
    const invite = accounts.invitation(token);
    await locked(invite.teamId, () =>
      store.transaction(() => {
        accounts.current(identity);
        const teamId = accounts.accept(token, identity.user.id);
        store.db
          .prepare("UPDATE sessions SET team_id=? WHERE hash=?")
          .run(teamId, identity.session);
      }),
    );
    res.json({ ok: true });
  });
  app.post("/api/team/switch", (req, res) => {
    const identity = accounts.current(res.locals.account);
    if (!identity) throw new AccessError("Сначала войдите в аккаунт.", 401);
    const { teamId } = z
      .object({ teamId: z.string().min(1).max(100) })
      .parse(req.body);
    if (!accounts.role(teamId, identity.user.id))
      throw new AccessError("Нет доступа к этой команде.");
    store.db
      .prepare("UPDATE sessions SET team_id=? WHERE hash=?")
      .run(teamId, identity.session);
    res.json({ ok: true });
  });
  app.get("/api/team/invites", (req, res) => {
    const i = accounts.requireOwner(res.locals.account);
    res.json(accounts.invites(i.teamId));
  });
  app.post("/api/team/invites", async (req, res) => {
    const identity = accounts.requireOwner(res.locals.account);
    const { role } = z
      .object({ role: z.enum(["member", "viewer"]) })
      .strict()
      .parse(req.body);
    const token = randomBytes(32).toString("hex");
    const id = randomUUID();
    await locked(identity.teamId, () => {
      accounts.requireOwner(identity);
      store.db
        .prepare(
          "INSERT INTO invitations(id,hash,team_id,role,expires) VALUES(?,?,?,?,?)",
        )
        .run(
          id,
          digest(token),
          identity.teamId,
          role,
          clock().getTime() + 7 * 86400000,
        );
    });
    res.json({ token, id });
  });
  app.post("/api/team/invites/:id/revoke", async (req, res) => {
    const identity = accounts.requireOwner(res.locals.account);
    const id = z.string().uuid().parse(req.params.id);
    await locked(identity.teamId, () => {
      accounts.requireOwner(identity);
      const result = store.db
        .prepare(
          "UPDATE invitations SET revoked=1 WHERE id=? AND team_id=? AND used_by IS NULL",
        )
        .run(id, identity.teamId);
      if (!result.changes)
        throw new AccessError("Приглашение не найдено или уже принято.", 409);
    });
    res.json({ ok: true });
  });
  app.post("/api/team/settings", async (req, res) => {
    const identity = accounts.requireOwner(res.locals.account);
    const body = z
      .object({
        name: z.string().trim().min(1).max(80),
        revision: z.number().int().positive(),
      })
      .strict()
      .parse(req.body);
    await locked(identity.teamId, () => {
      accounts.requireOwner(identity);
      const ws = store.read(identity.teamId)!;
      if ((ws.teamRevision || 1) !== body.revision)
        throw new AccessError(
          "Настройки уже изменены. Обновите страницу.",
          409,
        );
      ws.teamName = body.name;
      ws.teamRevision = body.revision + 1;
      store.save(identity.teamId, ws);
    });
    res.json({ ok: true });
  });
  app.post("/api/team/members/:id", async (req, res) => {
    const identity = accounts.requireOwner(res.locals.account);
    const id = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        role: z.enum(["member", "viewer"]).optional(),
        remove: z.boolean().optional(),
        revision: z.number().int().positive(),
      })
      .strict()
      .refine((b) => Boolean(b.remove) !== Boolean(b.role))
      .parse(req.body);
    await locked(identity.teamId, () =>
      store.transaction(() => {
        accounts.requireOwner(identity);
        const member = accounts
          .members(identity.teamId)
          .find((m) => m.id === id);
        if (!member || member.role === "owner")
          throw new AccessError(
            "Владельца нельзя удалить или изменить этим действием.",
          );
        if (member.revision !== body.revision)
          throw new AccessError("Участник уже изменён. Обновите список.", 409);
        if (body.remove) {
          store.db
            .prepare("DELETE FROM memberships WHERE team_id=? AND user_id=?")
            .run(identity.teamId, id);
          store.db
            .prepare("DELETE FROM sessions WHERE team_id=? AND user_id=?")
            .run(identity.teamId, id);
        } else
          store.db
            .prepare(
              "UPDATE memberships SET role=?,revision=revision+1 WHERE team_id=? AND user_id=?",
            )
            .run(body.role!, identity.teamId, id);
        if (body.remove || body.role === "viewer") {
          const ws = store.read(identity.teamId)!;
          ws.events = ws.events.map((e) =>
            e.assigneeId === id
              ? {
                  ...e,
                  assigneeId: null,
                  revision: e.revision + 1,
                  updatedAt: clock().toISOString(),
                }
              : e,
          );
          store.save(identity.teamId, ws);
        }
      }),
    );
    res.json({ ok: true });
  });
}
