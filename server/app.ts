import express from "express";
import { Accounts, AccessError, installAccountRoutes } from "./accounts.ts";
import type { Identity, Locked } from "./accounts.ts";
import { installYandexRoutes } from "./yandex.ts";
import type { MailReaders } from "./yandex.ts";
import { resolveMention } from "./mentions.ts";
import { splitSpeechText } from "./tts.ts";
import cookieParser from "cookie-parser";
import { randomBytes, createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { Store } from "./store.ts";
import { commandSchema, execute, localCommand, today } from "./domain.ts";
import {
  enabled,
  gptEnabled,
  budget,
  providerFetch,
  understand,
} from "./providers.ts";
import type { Workspace, Command } from "../src/types.ts";
export function createApp(store: Store, clock = () => new Date(), mailReaders?: MailReaders) {
  const app = express();
  app.disable("x-powered-by");
  app.use(cookieParser());
  app.use(express.json({ limit: "96kb" }));
  app.use(
    "/api/voice/recognize",
    express.raw({ type: "application/octet-stream", limit: "960kb" }),
  );
  app.use(
    "/api/attachments",
    express.raw({ type: "application/octet-stream", limit: "10mb" }),
  );
  const locks = new Map<string, Promise<unknown>>();
  const locked: Locked = async (id, work) => {
    const pending = (locks.get(id) || Promise.resolve())
      .catch(() => {})
      .then(work);
    locks.set(id, pending);
    try {
      return await pending;
    } finally {
      if (locks.get(id) === pending) locks.delete(id);
    }
  };
  const accounts = new Accounts(store, clock);
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    res.set("Referrer-Policy", "no-referrer");
    if (req.method !== "GET" && req.get("x-app-request") !== "voice-planner")
      return res
        .status(403)
        .json({ error: "Запрос отклонён. Обновите страницу." });
    next();
  });
  installAccountRoutes(app, accounts, locked, clock);
  installYandexRoutes(app, accounts, mailReaders);
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    res.set("X-Content-Type-Options", "nosniff");
    if (req.method !== "GET" && req.get("x-app-request") !== "voice-planner")
      return res
        .status(403)
        .json({ error: "Запрос отклонён. Обновите страницу." });
    const identity = res.locals.account as Identity | undefined;
    if (identity) {
      res.locals.owner = identity.teamId;
      return next();
    }
    const token = req.cookies.workspace;
    let id =
      typeof token === "string"
        ? createHash("sha256").update(token).digest("hex")
        : "";
    try {
      if (!id || !store.read(id) || accounts.isTeam(id)) {
        const value = randomBytes(32).toString("hex");
        id = createHash("sha256").update(value).digest("hex");
        store.create(id);
        res.cookie("workspace", value, {
          httpOnly: true,
          sameSite: "strict",
          secure: process.env.COOKIE_SECURE === "true",
          maxAge: 365 * 86400000,
          path: "/",
        });
      }
      res.locals.owner = id;
      next();
    } catch {
      res
        .status(503)
        .json({ error: "Не удалось открыть хранилище. Попробуйте позже." });
    }
  });
  const state = (ws: Workspace, id: string, identity?: Identity) => ({
    account: accounts.snapshot(id, identity),
    projects: ws.projects || [],
    events: ws.events,
    messages: ws.messages,
    selected: ws.selected,
    pending: ws.pending,
    mode: gptEnabled() ? "yandex" : "local",
    voiceAvailable: enabled(),
    seedCount: store.seed.length,
    reservedRub: store.spent(),
    budgetRub: budget(),
    today: today(clock()),
  });
  app.get("/api/state", (req, res) =>
    res.json(
      state(
        store.readFor(res.locals.owner, res.locals.account?.user.id),
        res.locals.owner,
        res.locals.account,
      ),
    ),
  );
  app.post("/api/attachments", async (req, res, next) => {
    try {
      const workspaceId = res.locals.owner as string;
      const identity = accounts.current(res.locals.account);
      const userId = identity?.user.id || "";
      const expectedTeam = req.get("x-team-id");
      if (expectedTeam && expectedTeam !== workspaceId)
        throw new AccessError("Команда изменилась. Обновите страницу.", 409);
      const rawName = req.get("x-file-name") || "";
      let name: string;
      try {
        name = decodeURIComponent(rawName)
          .replace(/[\x00-\x1f\x7f/\\]/g, "_")
          .trim();
      } catch {
        return res.status(400).json({ error: "Некорректное имя файла." });
      }
      if (
        !name ||
        name.length > 200 ||
        !Buffer.isBuffer(req.body) ||
        !req.body.length
      )
        return res
          .status(400)
          .json({ error: "Выберите непустой файл с корректным именем." });
      const data: Buffer = req.body;
      const id = randomUUID();
      const nextState = await locked(workspaceId, () => {
        const ws = store.readFor(workspaceId, identity?.user.id);
        ws.messages.push({
          id: randomUUID(),
          role: "user",
          text: "Файл прикреплён",
          at: clock().toISOString(),
          attachment: { id, name, size: data.length },
        });
        store.transaction(() => {
          store.db
            .prepare(
              "INSERT INTO chat_attachments(id,workspace_id,user_id,name,data) VALUES(?,?,?,?,?)",
            )
            .run(id, workspaceId, userId, name, data);
          if (identity) {
            const { messages, requests, selected, pending, ...shared } = ws;
            store.save(workspaceId, { ...shared, messages: [], requests: {} });
            store.db
              .prepare(
                "INSERT INTO conversations(team_id,user_id,body) VALUES(?,?,?) ON CONFLICT(team_id,user_id) DO UPDATE SET body=excluded.body",
              )
              .run(
                workspaceId,
                userId,
                JSON.stringify({ messages, requests, selected, pending }),
              );
          } else store.save(workspaceId, ws);
        });
        return state(ws, workspaceId, identity);
      });
      return res.json(nextState);
    } catch (error) {
      return next(error);
    }
  });
  app.get("/api/attachments/:id", (req, res, next) => {
    try {
      const identity = accounts.current(res.locals.account);
      const row = store.db
        .prepare(
          "SELECT name,data FROM chat_attachments WHERE id=? AND workspace_id=? AND user_id=?",
        )
        .get(
          req.params.id,
          res.locals.owner as string,
          identity?.user.id || "",
        );
      if (!row) return res.status(404).json({ error: "Файл не найден." });
      res.set("Content-Type", "application/octet-stream");
      res.set(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(String(row.name)).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)}`,
      );
      return res.send(Buffer.from(row.data as Uint8Array));
    } catch (error) {
      return next(error);
    }
  });
  const bodySchema = z
    .object({
      requestId: z.string().uuid(),
      workspaceId: z.string().max(100).optional(),
      projectId: z.string().uuid().nullable().optional(),
      text: z.string().trim().min(1).max(2000).optional(),
      command: commandSchema.optional(),
      source: z.enum(["text", "voice"]).default("text"),
      uncertain: z.boolean().default(false),
      pendingToken: z.string().uuid().optional(),
    })
    .refine(
      (b) => Boolean(b.text) !== Boolean(b.command),
      "Нужен текст либо действие",
    );
  app.post("/api/chat", async (req, res, next) => {
    const id = res.locals.owner as string;
    const before = locks.get(id) || Promise.resolve();
    const work = before
      .catch(() => {})
      .then(async () => {
        const body = bodySchema.parse(req.body);
        if (body.workspaceId && body.workspaceId !== id)
          throw new AccessError(
            "Команда изменилась. Обновите страницу перед действием.",
            409,
          );
        const identity = accounts.current(res.locals.account);
        const ws = store.readFor(id, identity?.user.id);
        const fingerprint = createHash("sha256")
          .update(JSON.stringify({ ...body, requestId: undefined }))
          .digest("hex");
        if (ws.requests[body.requestId]) {
          if (ws.requests[body.requestId].fingerprint !== fingerprint)
            throw new Error(
              "Повторный идентификатор запроса содержит другое действие.",
            );
          return state(ws, id, identity);
        }
        if (
          body.projectId &&
          !(ws.projects || []).some((p) => p.id === body.projectId)
        )
          throw new Error("Проект не найден в вашем пространстве.");
        let cmd: Command;
        let mention = body.text ? resolveMention(body.text, accounts.members(id)) : undefined;
        const local = body.text
          ? localCommand(mention!.text, ws, clock())
          : undefined;
        const spokenConfirmation = body.source === "voice" && local?.action === "confirm";
        if (spokenConfirmation && (ws.pending || body.pendingToken) && (!ws.pending || !body.pendingToken || body.pendingToken !== ws.pending.token || !["speech", "delete", "past", "conflict"].includes(ws.pending.type)))
          throw new Error("Голосовое подтверждение устарело. Проверьте действие и подтвердите его ещё раз.");
        const spoken = body.source === "voice" && body.text && gptEnabled() && local?.action === "unknown"
          ? await understand(store, mention!.text, ws, clock())
          : local;
        if (
          body.source === "voice" &&
          (!spoken ||
            !["select", "cancel", "list", "search", "reply", "unknown", ...(spokenConfirmation ? ["confirm"] : [])].includes(spoken.action))
        ) {
          if (identity?.role === "viewer")
            throw new AccessError(
              "Наблюдатель может только просматривать записи.",
            );
          ws.pending = {
            type: "speech",
            projectId: body.projectId,
            token: randomUUID(),
            text: body.text,
            prior:
              ws.pending?.type === "speech" ? ws.pending.prior : ws.pending,
          };
          ws.messages.push(
            {
              id: randomUUID(),
              role: "user",
              text: body.text!,
              at: clock().toISOString(),
            },
            {
              id: randomUUID(),
              role: "assistant",
              text:
                "Я услышал: «" + body.text + "». Всё верно? Скажите «да, верно» или подтвердите кнопкой.",
              at: clock().toISOString(),
            },
          );
        } else {
          if (body.command) cmd = body.command;
          else if (body.source === "voice" && spoken) cmd = spokenConfirmation ? { ...spoken, token: body.pendingToken } : spoken;
          else if (
            local &&
            (["confirm", "cancel", "select", "move"].includes(local.action) ||
              (body.source === "voice" &&
                ["list", "search"].includes(local.action)))
          )
            cmd = local;
          else
            cmd = gptEnabled()
              ? await understand(store, mention!.text, ws, clock())
              : local!;
          if (
            cmd.action === "confirm" &&
            ws.pending?.type === "speech"
          ) {
            if (cmd.token && cmd.token !== ws.pending.token)
              throw new Error("Подтверждение устарело.");
            const text = ws.pending.text!;
            const projectId = ws.pending.projectId;
            ws.pending = ws.pending.prior;
            mention = resolveMention(text, accounts.members(id));
            const recognized = localCommand(mention.text, ws, clock());
            cmd = gptEnabled() && recognized.action !== "move"
              ? await understand(store, mention.text, ws, clock())
              : recognized;
            if (cmd.action === "unknown" && cmd.question === "Не удалось точно понять запрос. Уточните, что нужно сделать; записи не изменены." && recognized.action === "create" && recognized.title)
              cmd = recognized;
            if (cmd.action === "create") cmd.projectId = projectId;
          }
          if (mention?.assigneeId && ["create", "update"].includes(cmd.action))
            cmd.assigneeId = mention.assigneeId;
          if (cmd.action === "create" && cmd.projectId === undefined)
            cmd.projectId = body.projectId;
          const current = accounts.current(identity);
          const readActions = ["list", "search", "select", "cancel", "reply", "unknown"];
          if (
            current?.role === "viewer" &&
            (!readActions.includes(cmd.action) ||
              (cmd.action === "select" &&
                ws.pending?.next &&
                !readActions.includes(ws.pending.next.action)))
          )
            throw new AccessError(
              "Наблюдатель может только просматривать записи.",
            );
          const assigneeId =
            cmd.assigneeId !== undefined
              ? cmd.assigneeId
              : ["confirm", "update"].includes(cmd.action)
                ? ws.pending?.draft?.assigneeId
                : undefined;
          if (
            cmd.action !== "cancel" &&
            assigneeId &&
            !accounts
              .members(id)
              .some((m) => m.id === assigneeId && m.role !== "viewer")
          )
            throw new AccessError(
              "Исполнитель не состоит в команде или имеет доступ только для чтения.",
            );
          const beforeEvents = JSON.stringify(ws.events);
          const beforeProjects = JSON.stringify(ws.projects);
          const result = execute(ws, cmd, clock());
          if (current?.role === "viewer")
            result.text = result.text.replace(
              "Можно перенести, изменить или удалить её.",
              "Доступен просмотр.",
            );
          if (
            current?.role === "viewer" &&
            (JSON.stringify(ws.events) !== beforeEvents ||
              JSON.stringify(ws.projects) !== beforeProjects)
          )
            throw new AccessError(
              "Наблюдатель может только просматривать записи.",
            );
          const assignable = new Set(
            accounts
              .members(id)
              .filter((m) => m.role !== "viewer")
              .map((m) => m.id),
          );
          if (
            ws.events.some((e) => e.assigneeId && !assignable.has(e.assigneeId))
          )
            throw new AccessError(
              "Исполнитель больше не доступен. Выберите участника команды.",
            );
          ws.messages.push(
            {
              id: randomUUID(),
              role: "user",
              text: body.text || actionLabel(cmd),
              at: clock().toISOString(),
            },
            {
              id: randomUUID(),
              role: "assistant",
              ...result,
              at: clock().toISOString(),
            },
          );
        }
        ws.requests[body.requestId] = { fingerprint };
        try {
          store.saveFor(id, ws, identity?.user.id);
        } catch {
          throw new Error(
            "Не удалось сохранить изменения. Запись не подтверждена. Повторите запрос.",
          );
        }
        return state(ws, id, identity);
      });
    locks.set(id, work);
    try {
      res.json(await work);
    } catch (e) {
      next(e);
    } finally {
      if (locks.get(id) === work) locks.delete(id);
    }
  });
  app.post("/api/voice/recognize", async (req, res, next) => {
    try {
      if (
        !Buffer.isBuffer(req.body) ||
        req.body.length < 3200 ||
        req.body.length > 960000 ||
        req.body.length % 2
      )
        throw new Error("Некорректная аудиозапись. Повторите фразу.");
      const response = await providerFetch(
        store,
        "stt",
        "https://stt.api.cloud.yandex.net/speech/v1/stt:recognize?lang=ru-RU&format=lpcm&sampleRateHertz=16000",
        {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: new Uint8Array(req.body),
        },
      );
      const data = await response.json();
      if (typeof data.result !== "string")
        throw new Error("Сервис распознавания вернул некорректный ответ.");
      res.json({ text: data.result.trim(), uncertain: true });
    } catch (e) {
      next(e);
    }
  });
  app.post("/api/voice/synthesize", async (req, res, next) => {
    try {
      const { messageId, part } = z
        .object({ messageId: z.string().uuid(), part: z.number().int().min(0).max(99).default(0) })
        .parse(req.body);
      const msg = store
        .readFor(res.locals.owner, res.locals.account?.user.id)
        .messages.find((m) => m.id === messageId && m.role === "assistant");
      if (!msg) throw new Error("Ответ для озвучивания не найден.");
      const parts = splitSpeechText(msg.text);
      if (!parts[part]) throw new Error("Часть ответа для озвучивания не найдена.");
      const response = await providerFetch(
        store,
        "tts",
        "https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            text: parts[part],
            lang: "ru-RU",
            voice: process.env.YANDEX_VOICE || "alena",
            format: "mp3",
          }),
        },
      );
      res.set("X-TTS-Parts", String(parts.length)).type("audio/mpeg").send(Buffer.from(await response.arrayBuffer()));
    } catch (e) {
      next(e);
    }
  });
  app.use(express.static("dist"));
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res
        .status(
          err instanceof AccessError
            ? err.status
            : err instanceof z.ZodError
              ? 400
              : 503,
        )
        .json({
          error:
            err instanceof z.ZodError
              ? "Некорректные данные. Проверьте заполненные поля и допустимые значения."
              : err instanceof Error
                ? err.message
                : "Ошибка сервера. Действие не подтверждено.",
        });
    },
  );
  return app;
}
function actionLabel(c: Command) {
  const labels: Record<Command["action"], string> = {
    createProject: "Создать проект",
    move: "Переместить запись",
    create: "Создать запись",
    update: "Сохранить изменения",
    delete: "Удалить запись",
    complete: "Отметить выполненной",
    select: "Выбрать запись",
    confirm: "Подтверждаю",
    cancel: "Отмена",
    reply: "Ответ",
    list: "Показать записи",
    search: "Поиск",
    unknown: "Уточнение",
  };
  return labels[c.action] + (c.title ? `: ${c.title}` : "");
}
