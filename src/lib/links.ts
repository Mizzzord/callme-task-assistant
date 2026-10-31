import type { RelatedLink } from "../types.ts";
export const serviceNames = {
  telegram: "Telegram",
  yandex_notes: "Яндекс Заметки",
  yandex_mail: "Яндекс Почта (личный доступ)",
  other: "Другой материал",
};
export function linkError(
  value: string,
  service: RelatedLink["service"] | "telemost",
): string | undefined {
  if (service === "yandex_mail")
    return /^\/api\/yandex\/mail\/messages\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{32}\/[1-9]\d{0,19}\/[1-9]\d{0,9}$/i.test(value)
      ? undefined
      : "Нужна защищённая ссылка на письмо, выбранное в CallMe.";
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
