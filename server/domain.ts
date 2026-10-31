import { randomUUID } from "node:crypto";
import { linkError } from "../src/lib/links.ts";
import * as chrono from "chrono-node";
import { z } from "zod";
import type {
  CalendarEvent,
  Command,
  Draft,
  Workspace,
  Pending,
} from "../src/types.ts";

export const commandSchema = z
  .object({
    action: z.enum([
      "createProject",
      "move",
      "create",
      "update",
      "delete",
      "complete",
      "list",
      "search",
      "select",
      "confirm",
      "cancel",
      "reply",
      "unknown",
    ]),
    priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
    assigneeId: z.string().uuid().nullable().optional(),
    status: z.enum(["todo", "in_progress", "done"]).optional(),
    projectId: z.string().uuid().nullable().optional(),
    callUrl: z
      .string()
      .max(2048)
      .refine((v) => !linkError(v, "telemost"))
      .nullable()
      .optional(),
    links: z
      .array(
        z
          .object({
            label: z.string().trim().min(1).max(100),
            url: z.string().max(2048),
            service: z.enum(["telegram", "yandex_notes", "yandex_mail", "other"]),
          })
          .strict()
          .refine((v) => !linkError(v.url, v.service)),
      )
      .max(12)
      .optional(),
    description: z.string().trim().max(4000).optional(),
    title: z.string().trim().min(1).max(300).optional(),
    kind: z.enum(["task", "meeting", "reminder"]).optional(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    time: z
      .string()
      .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
      .nullable()
      .optional(),
    duration: z.number().int().min(1).max(1440).nullable().optional(),
    query: z.string().max(300).optional(),
    period: z.enum(["today", "tomorrow", "week", "all"]).optional(),
    index: z.number().int().positive().optional(),
    id: z.string().max(100).optional(),
    revision: z.number().int().optional(),
    token: z.string().optional(),
    question: z.string().max(500).optional(),
    answer: z.string().trim().min(1).max(2000).optional(),
  })
  .strict();
export const today = (now = new Date()) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Moscow" }).format(now);
export const addDays = (date: string, n: number) =>
  new Date(Date.parse(date + "T12:00:00+03:00") + n * 86400000)
    .toISOString()
    .slice(0, 10);
export function validDate(date: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    !Number.isNaN(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date
  );
}
export function describe(e: CalendarEvent | Draft) {
  return `«${e.title}» · ${e.date ? e.date.split("-").reverse().join(".") : "без срока"}${e.time ? ` в ${e.time}` : ""}${e.duration ? ` · ${e.duration} мин` : ""}`;
}
const normalize = (s: string) => s.toLocaleLowerCase("ru").replace(/ё/g, "е");
const stems = (s: string) =>
  normalize(s)
    .split(/[^a-zа-я0-9]+/)
    .filter((x) => x.length > 2)
    .map((x) =>
      x.replace(
        /(иями|ами|ями|ого|ему|ому|ией|ий|ый|ая|яя|ой|ей|ом|ем|ов|ев|ам|ям|ах|ях|ы|и|а|я|у|ю|е|ь)$/,
        "",
      ),
    );
export function search(events: CalendarEvent[], query: string) {
  const terms = stems(query).filter(
    (x) => !["найт", "по", "про", "встреч", "задач", "запис"].includes(x),
  );
  if (!terms.length) return events;
  return events
    .map((e) => ({
      e,
      score: terms.filter((t) =>
        stems(e.title).some((w) => w.startsWith(t) || t.startsWith(w)),
      ).length,
    }))
    .filter((x) => x.score === terms.length)
    .sort((a, b) => (b.e.date || "").localeCompare(a.e.date || ""))
    .map((x) => x.e);
}
export function periodEvents(
  events: CalendarEvent[],
  period: string,
  now: Date,
) {
  const d = today(now);
  const start = period === "tomorrow" ? addDays(d, 1) : d;
  const weekday = new Date(d + "T12:00:00+03:00").getUTCDay() || 7;
  const end = period === "week" ? addDays(d, 7 - weekday) : start;
  return events.filter(
    (e) => period === "all" || (e.date && e.date >= start && e.date <= end),
  );
}
function temporal(text: string, now: Date): Partial<Command> {
  const out: Partial<Command> = {};
  if (/без (срока|даты)/i.test(text)) {
    out.date = null;
    out.time = null;
  }
  const duration = text.match(
    /(?:на|длительностью)\s+(\d+)\s*(минут\S*|час\S*)/i,
  );
  if (duration)
    out.duration =
      Number(duration[1]) * (duration[2].startsWith("час") ? 60 : 1);
  else if (/на (полчаса|пол часа)/i.test(text)) out.duration = 30;
  else if (/на час(?:\s|$)/i.test(text)) out.duration = 60;
  const stripped = text.replace(
    /(?:на|длительностью)\s+(?:\d+\s*(?:минут\S*|час\S*)|полчаса|час)(?:\s|$)/gi,
    " ",
  );
  const iso = stripped.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) out.date = iso[1];
  const result = chrono.ru.parse(stripped, { instant: now, timezone: 180 })[0];
  if (result) {
    if (
      !iso &&
      (result.start.isCertain("day") ||
        /сегодня|завтра|послезавтра|понедельник|вторник|сред|четверг|пятниц|суббот|воскресень/i.test(
          stripped,
        ))
    )
      out.date = today(result.start.date());
    if (result.start.isCertain("hour"))
      out.time = `${String(result.start.get("hour")).padStart(2, "0")}:${String(result.start.get("minute") || 0).padStart(2, "0")}`;
  }
  const clock =
    stripped.match(/(?:в\s+|\b)([01]?\d|2[0-3]):([0-5]\d)\b/) ||
    stripped.match(/в\s+([01]?\d|2[0-3])(?:\s|$)/i);
  if (clock) out.time = `${clock[1].padStart(2, "0")}:${clock[2] || "00"}`;
  return out;
}
export function localCommand(text: string, ws: Workspace, now: Date): Command {
  const t = normalize(text.trim());
  const fields = temporal(t, now);
  if (/(?:^|\s)(в|на|до|через|после|длительностью)$/.test(t))
    return {
      action: "unknown",
      question:
        "Фраза выглядит незаконченной. Уточните дату или время — ничего не сохранено.",
    };
  const clockText = t.match(/(?:в\s+)(\d{1,2}:\d{2})/)?.[1];
  if (clockText && !/^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(clockText))
    return {
      action: "unknown",
      question:
        "Укажите корректное время от 00:00 до 23:59. Ничего не сохранено.",
    };
  if (/^(отмена|отмени|нет|не надо)[.!]?$/i.test(t))
    return { action: "cancel" };
  if (
    /^(да|да[, ]+верно|да[, ]+подтверждаю|верно|все верно|правильно|подтверждаю|подтвердить|сохрани|сохранить|да[, ]+удалить)[.!]?$/i.test(t)
  )
    return { action: "confirm" };
  const number = t.match(/^(?:номер |выбери |выбрать )?(\d+)[.!]?$/);
  const words = ["перв", "втор", "трет", "четверт", "пят"];
  if (
    ws.pending?.type === "choose" &&
    (number || words.some((w) => t.startsWith(w)))
  )
    return {
      action: "select",
      index: number
        ? Number(number[1])
        : words.findIndex((w) => t.startsWith(w)) + 1,
    };
  if (
    /^(создай|создать|добавь|добавить|запиши|записать|напомни|напомнить|запланируй)/.test(
      t,
    )
  ) {
    const kind = /напомн/.test(t)
      ? "reminder"
      : /встреч|созвон/.test(t)
        ? "meeting"
        : "task";
    let title = text.replace(
      /^(создай|создать|добавь|добавить|запиши|записать|напомни|напомнить|запланируй)\s*(?:мне\s+)?(?:задачу|задача|напоминание|встречу)?\s*[:—-]?\s*/i,
      "",
    );
    title = title.replace(
      /(?:на|длительностью)\s+(?:\d+\s*(?:минут\S*|час\S*)|полчаса|час)(?=\s|$)/gi,
      "",
    );
    for (const result of chrono.ru
      .parse(title, { instant: now, timezone: 180 })
      .reverse())
      title =
        title.slice(0, result.index) +
        title.slice(result.index + result.text.length);
    title = title
      .replace(/\d{4}-\d{2}-\d{2}|без (срока|даты)/gi, "")
      .replace(/\s+/g, " ")
      .replace(/(?:\s+на|\s+в)$/, "")
      .trim();
    return { action: "create", kind, ...(title ? { title } : {}), ...fields };
  }
  const boardMove = t.match(/^(?:перенеси|перенести|передвинь|перемести)\s+(.+?)\s+(?:в\s+(?:колонку\s+)?)?(работу|в работе|готово|выполнено|к выполнению|выполнению)[.!]?$/);
  if (boardMove) {
    const query = boardMove[1].replace(/^(?:задачу|запись)\s+/, "").replace(/^(?:ее|его|эту задачу|эту запись|задачу|запись)$/, "").trim();
    const status = /работ/.test(boardMove[2]) ? "in_progress" : /готово|выполнено/.test(boardMove[2]) ? "done" : "todo";
    return { action: "move", status, ...(query ? { query } : {}) };
  }
  if (/^(перенеси|перенести|измени|изменить|переименуй)/.test(t))
    return {
      action: "update",
      ...fields,
      ...(/переименуй.+(?: в | на )/.test(t)
        ? { title: text.split(/ в | на /).at(-1) }
        : {}),
      query: t
        .replace(/^(перенеси|перенести|измени|изменить|переименуй)\s+/, "")
        .split(/ на | завтра| сегодня| в \d/)[0]
        .replace(/^(её|ее|его|это|эту задачу|эту встречу)$/, ""),
    };
  if (/^(удали|удалить|отметь|заверши|выполни)/.test(t))
    return {
      action: /^удал/.test(t) ? "delete" : "complete",
      query: t
        .replace(/^(удали|удалить|отметь|заверши|выполни)\s+/, "")
        .replace(/\s+(выполненной|выполненным|готовой|готовым)$/, "")
        .replace(/^(её|ее|его|это|задачу|встречу)$/, ""),
    };
  if (/^(найди|найти|поиск|поищи)/.test(t))
    return {
      action: "search",
      query: t.replace(/^(найди|найти|поиск|поищи)\s+/, ""),
    };
  if (/покажи|что (у меня|на)|планы|список|расписание/.test(t))
    return {
      action: "list",
      period: /послезавтра/.test(t)
        ? "all"
        : /завтра/.test(t)
          ? "tomorrow"
          : /недел/.test(t)
            ? "week"
            : /сегодня/.test(t)
              ? "today"
              : "all",
      ...(/встреч/.test(t)
        ? { kind: "meeting" }
        : /задач/.test(t)
          ? { kind: "task" }
          : {}),
    };
  if (ws.pending?.type === "draft") {
    const duration = t.match(/^(\d+)\s*(минут\S*|час\S*)?$/);
    if (duration)
      return {
        action: "update",
        duration:
          Number(duration[1]) * (duration[2]?.startsWith("час") ? 60 : 1),
      };
    if (Object.keys(fields).length) return { action: "update", ...fields };
    if (!ws.pending.draft?.title)
      return { action: "update", title: text.trim() };
  }
  return {
    action: "unknown",
    question:
      "Не удалось однозначно понять запрос. Попробуйте «Создай задачу купить молоко завтра», «Покажи встречи на неделю» или выберите запись в списке.",
  };
}
function pending(ws: Workspace, value: Omit<Pending, "token">) {
  ws.pending = { ...value, token: randomUUID() };
}
function target(ws: Workspace, cmd: Command) {
  if (cmd.id) return ws.events.find((e) => e.id === cmd.id);
  if (cmd.query) {
    const found = search(ws.events, cmd.query);
    if (found.length === 1) return found[0];
    if (found.length > 1) {
      pending(ws, {
        type: "choose",
        candidates: found.slice(0, 20),
        next: cmd,
      });
      return { candidates: found.slice(0, 20) };
    }
    return undefined;
  }
  return ws.events.find((e) => e.id === ws.selected);
}
export function execute(
  ws: Workspace,
  cmd: Command,
  now: Date,
): { text: string; events?: CalendarEvent[] } {
  if (cmd.action === "createProject") {
    const name = cmd.title?.trim();
    if (!name || name.length > 80)
      throw new Error("Название проекта должно содержать от 1 до 80 символов.");
    if ((ws.projects || []).some((p) => normalize(p.name) === normalize(name)))
      throw new Error("Проект с таким названием уже есть.");
    ws.projects = [...(ws.projects || []), { id: randomUUID(), name }];
    ws.pending = undefined;
    return { text: `Создан проект «${name}».` };
  }
  if (cmd.projectId && !(ws.projects || []).some((p) => p.id === cmd.projectId))
    throw new Error("Проект не найден в вашем пространстве.");
  if (cmd.action === "cancel") {
    ws.pending = undefined;
    return { text: "Действие отменено. Записи не изменены." };
  }
  if (cmd.action === "confirm") {
    const p = ws.pending;
    if (!p) return { text: "Сейчас нечего подтверждать." };
    if (cmd.token && cmd.token !== p.token)
      throw new Error("Подтверждение устарело. Откройте актуальное действие.");
    if (p.type === "draft" || p.type === "choose")
      return {
        text: "Сначала укажите недостающие данные или выберите запись.",
      };
    if (p.type === "speech") {
      ws.pending = p.prior;
      const recognized = localCommand(p.text!, ws, now);
      return execute(
        ws,
        recognized.action === "create"
          ? { ...recognized, projectId: p.projectId }
          : recognized,
        now,
      );
    }
    if (p.target) {
      const current = ws.events.find((e) => e.id === p.target!.id);
      if (!current || current.revision !== p.target.revision) {
        ws.pending = undefined;
        return {
          text: "Запись изменилась. Выберите её снова; действие не выполнено.",
        };
      }
    }
    ws.pending = undefined;
    if (p.type === "delete") {
      ws.events = ws.events.filter((e) => e.id !== p.target!.id);
      if (ws.selected === p.target!.id) ws.selected = undefined;
      return { text: `Удалено: ${describe(p.target!)}.` };
    }
    return save(ws, p.draft!, now, p.target, true, p.type === "conflict");
  }
  if (cmd.action === "select") {
    const p = ws.pending;
    const e = cmd.id
      ? ws.events.find((e) => e.id === cmd.id)
      : p?.candidates?.[(cmd.index || 0) - 1];
    if (!e)
      return {
        text: "Такого варианта нет. Выберите запись из текущего списка.",
      };
    ws.selected = e.id;
    ws.pending = undefined;
    if (p?.type === "choose" && p.next)
      return execute(ws, { ...p.next, id: e.id, query: undefined }, now);
    return {
      text: `Выбрана запись: ${describe(e)}. Можно перенести, изменить или удалить её.`,
      events: [e],
    };
  }
  if (cmd.action === "list" || cmd.action === "search") {
    ws.pending = undefined;
    let found =
      cmd.action === "search"
        ? search(ws.events, cmd.query || "")
        : periodEvents(ws.events, cmd.period || "all", now);
    if (cmd.kind) found = found.filter((e) => e.kind === cmd.kind);
    if (found.length === 1) ws.selected = found[0].id;
    else if (found.length > 1) {
      ws.selected = undefined;
      pending(ws, { type: "choose", candidates: found.slice(0, 20) });
    }
    return {
      text: found.length
        ? `Найдено записей: ${found.length}.${found.length > 20 ? " Показаны первые 20. Уточните запрос, чтобы сузить поиск." : ""}${found.length > 1 ? " Выберите нужную кнопкой или назовите её номер." : ""}`
        : "За этот период или по этому запросу записей нет.",
      events: found.slice(0, 20),
    };
  }
  if (cmd.action === "create") {
    ws.pending = undefined;
    return save(
      ws,
      {
        title: cmd.title || "",
        description: cmd.description || "",
        kind: cmd.kind || "task",
        date: cmd.date ?? null,
        time: cmd.time ?? null,
        duration: cmd.duration ?? null,
        priority: cmd.priority ?? "normal",
        assigneeId: cmd.assigneeId ?? null,
        projectId: cmd.projectId ?? null,
        callUrl: cmd.callUrl ?? null,
        links: cmd.links ?? [],
      },
      now,
    );
  }
  if (cmd.action === "reply")
    return { text: cmd.answer || "Уточните, пожалуйста, ваш вопрос." };
  if (cmd.action === "unknown")
    return { text: cmd.question || "Уточните запрос. Изменения не выполнены." };
  if (
    cmd.action === "update" &&
    ws.pending?.type === "draft" &&
    !cmd.id &&
    !cmd.query
  ) {
    const p = ws.pending;
    return save(ws, { ...p.draft!, ...pickDraft(cmd) }, now, p.target);
  }
  ws.pending = undefined;
  const e = target(ws, cmd);
  if (e && "candidates" in e)
    return {
      text: "Найдено несколько записей. Какую выбрать?",
      events: e.candidates,
    };
  if (!e)
    return {
      text: "Запись не найдена или ещё не выбрана. Найдите её по названию или выберите в списке.",
    };
  if (cmd.revision !== undefined && cmd.revision !== e.revision)
    throw new Error("Запись уже изменена. Обновите её перед сохранением.");
  ws.selected = e.id;
  if (cmd.action === "delete") {
    pending(ws, { type: "delete", target: { ...e } });
    return {
      text: `Удалить ${describe(e)}? Подтвердите удаление или отмените действие.`,
      events: [e],
    };
  }
  if (cmd.action === "move") {
    if (!cmd.status) throw new Error("Укажите колонку доски.");
    e.status = cmd.status;
    e.completed = cmd.status === "done";
    e.revision++;
    e.updatedAt = now.toISOString();
    return { text: `Статус записи «${e.title}» изменён.`, events: [e] };
  }
  if (cmd.action === "complete") {
    if (e.kind === "meeting")
      return { text: "Выполненными можно отмечать задачи и напоминания." };
    e.completed = true;
    e.status = "done";
    e.revision++;
    e.updatedAt = now.toISOString();
    return { text: `Выполнено: ${describe(e)}.`, events: [e] };
  }
  if (Object.keys(pickDraft(cmd)).length === 0) {
    pending(ws, { type: "draft", draft: { ...e }, target: { ...e } });
    return { text: "Что изменить? Укажите новую дату, время или название." };
  }
  return save(ws, { ...e, ...pickDraft(cmd) }, now, e);
}
function pickDraft(cmd: Command): Partial<Draft> {
  return Object.fromEntries(
    Object.entries(cmd).filter(([k]) =>
      [
        "title",
        "description",
        "kind",
        "date",
        "time",
        "duration",
        "priority",
        "assigneeId",
        "projectId",
        "callUrl",
        "links",
      ].includes(k),
    ),
  );
}
function save(
  ws: Workspace,
  draft: Draft,
  now: Date,
  previous?: CalendarEvent,
  allowPast = false,
  allowConflict = false,
): { text: string; events?: CalendarEvent[] } {
  if (previous) {
    const current = ws.events.find((e) => e.id === previous.id);
    if (!current || current.revision !== previous.revision)
      throw new Error(
        "Запись изменилась во время уточнения. Выберите её снова.",
      );
  }
  if (draft.date && !validDate(draft.date))
    throw new Error("Такой даты не существует. Проверьте день и месяц.");
  const missing = !draft.title
    ? "Как назвать запись?"
    : draft.time && !draft.date
      ? "На какую дату? Время уже указано."
      : draft.kind === "meeting" && !draft.date
        ? "На какую дату назначить встречу?"
        : draft.kind === "meeting" && !draft.time
          ? "Во сколько начнётся встреча?"
          : draft.kind === "meeting" && !draft.duration
            ? "Сколько минут продлится встреча?"
            : null;
  if (missing) {
    pending(ws, {
      type: "draft",
      draft,
      target: previous ? { ...previous } : undefined,
    });
    return { text: missing };
  }
  const isPast =
    draft.date &&
    (draft.time
      ? Date.parse(`${draft.date}T${draft.time}:00+03:00`) < now.getTime()
      : draft.date < today(now));
  if (isPast && !allowPast) {
    pending(ws, {
      type: "past",
      draft,
      target: previous ? { ...previous } : undefined,
    });
    return {
      text: `Дата уже прошла: ${describe(draft)}. Сохранить именно эту дату?`,
    };
  }
  if (draft.kind === "meeting" && !allowConflict) {
    const start = Date.parse(`${draft.date}T${draft.time}:00+03:00`);
    const end = start + draft.duration! * 60000;
    const conflicts = ws.events
      .filter(
        (e) =>
          e.id !== previous?.id && e.kind === "meeting" && e.date && e.time,
      )
      .filter((e) => {
        const s = Date.parse(`${e.date}T${e.time}:00+03:00`);
        return e.duration
          ? start < s + e.duration * 60000 && end > s
          : start === s;
      });
    if (conflicts.length) {
      pending(ws, {
        type: "conflict",
        draft,
        target: previous ? { ...previous } : undefined,
      });
      return {
        text: "Время пересекается с другой встречей. У исходных событий длительность может быть неизвестна — для них проверяется совпадение начала. Всё равно сохранить?",
        events: conflicts,
      };
    }
  }
  const event: CalendarEvent = {
    ...previous,
    ...draft,
    id: previous?.id || randomUUID(),
    completed: previous?.completed || false,
    inferred: (previous?.inferred && previous.kind === draft.kind) || false,
    revision: (previous?.revision || 0) + 1,
    createdAt: previous?.createdAt || now.toISOString(),
    updatedAt: now.toISOString(),
  };
  if (previous)
    ws.events = ws.events.map((e) => (e.id === previous.id ? event : e));
  else ws.events.push(event);
  ws.selected = event.id;
  ws.pending = undefined;
  return {
    text: `${previous ? "Изменено" : "Сохранено"}: ${describe(event)}.${event.kind === "reminder" ? " Напоминание сохранено в расписании; уведомления не отправляются." : ""}`,
    events: [event],
  };
}
