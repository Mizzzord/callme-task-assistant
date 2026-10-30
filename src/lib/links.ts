import type { RelatedLink } from "../types.ts";
export const serviceNames = {
  telegram: "Telegram",
  yandex_notes: "Яндекс Заметки",
  other: "Другой материал",
};
export function linkError(
  value: string,
  service: RelatedLink["service"] | "telemost",
): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password)
      return "Укажите HTTPS-ссылку без логина и пароля.";
    if (
      service === "telemost" &&
      (url.hostname !== "telemost.yandex.ru" ||
        !/^\/j\/[^/]+\/?$/.test(url.pathname))
    )
      return "Нужна ссылка на созвон: https://telemost.yandex.ru/j/…";
    if (
      service === "telegram" &&
      (!["t.me", "telegram.me"].includes(url.hostname) || url.pathname === "/")
    )
      return "Укажите ссылку на сообщение или чат: https://t.me/…";
  } catch {
    return "Введите полную HTTPS-ссылку.";
  }
}
