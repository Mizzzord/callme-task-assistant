import type { EventKind, Draft } from "@/types";
export const kindNames: Record<EventKind, string> = {
  task: "Задача",
  meeting: "Встреча",
  reminder: "Напоминание",
};
export const eventDate = (e: Draft) =>
  e.date
    ? new Intl.DateTimeFormat("ru-RU", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Europe/Moscow",
      }).format(new Date(e.date + "T12:00:00+03:00")) +
      (e.time ? ` · ${e.time}` : " · весь день")
    : "Без срока";
export const statusNames = {
  todo: "К выполнению",
  in_progress: "В работе",
  done: "Готово",
};
export const statusOf = (e: import("@/types").CalendarEvent) =>
  e.completed ? "done" : e.status === "in_progress" ? "in_progress" : "todo";

export const priorityNames = { low: "Низкий", normal: "Обычный", high: "Высокий", urgent: "Срочный" };
export const priorityRank = { urgent: 0, high: 1, normal: 2, low: 3 };
export const roleNames = { owner: "Владелец", member: "Участник", viewer: "Наблюдатель" };
