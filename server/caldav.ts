import { XMLParser } from "fast-xml-parser";

const origin = "https://caldav.yandex.ru";
const xml = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, isArray: (name) => name === "response" || name === "propstat" });
type DavProp = Record<string, unknown>;
type DavResponse = { href?: unknown; propstat?: { status?: unknown; prop?: DavProp }[] };
function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function prop(response: DavResponse) {
  return response.propstat?.find((item) => typeof item.status === "string" && /\s200\s/.test(item.status))?.prop || {};
}
function path(value: unknown, base = origin) {
  if (typeof value !== "string" || value.length > 2048) throw new Error("Некорректный адрес Календаря.");
  const url = new URL(value, base);
  if (url.origin !== origin || url.username || url.password || url.search || url.hash) throw new Error("Календарь вернул недопустимый адрес.");
  return url.href;
}
async function propfind(url: string, token: string, depth: "0" | "1", properties: string) {
  const response = await fetch(path(url), {
    method: "PROPFIND", redirect: "error",
    headers: { Authorization: `OAuth ${token}`, Depth: depth, "Content-Type": "application/xml; charset=utf-8" },
    body: `<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop>${properties}</d:prop></d:propfind>`,
    signal: AbortSignal.timeout(15000),
  });
  if (response.status !== 207) throw new Error("Яндекс Календарь не подтвердил запрос.");
  const body = await response.text();
  if (body.length > 2_000_000) throw new Error("Ответ Календаря слишком большой.");
  const parsed: unknown = xml.parse(body);
  const responses = object(object(parsed).multistatus).response;
  if (!Array.isArray(responses)) throw new Error("Некорректный ответ Яндекс Календаря.");
  return responses as DavResponse[];
}
export async function listYandexCalendars(token: string) {
  const root = await propfind(origin + "/", token, "0", "<d:current-user-principal/>");
  const principal = path(object(prop(root[0] || {})["current-user-principal"]).href);
  const account = await propfind(principal, token, "0", "<c:calendar-home-set/>");
  const home = path(object(prop(account[0] || {})["calendar-home-set"]).href, principal);
  const entries = await propfind(home, token, "1", "<d:displayname/><d:resourcetype/>");
  return entries.flatMap((entry) => {
    const properties = prop(entry);
    if (!("calendar" in object(properties.resourcetype))) return [];
    const name = typeof properties.displayname === "string" ? properties.displayname : "Календарь";
    return [{ url: path(entry.href, home), name: name.slice(0, 300) }];
  });
}

export type RemoteCalendarObject = { url: string; etag: string; data: string };
export async function listCalendarObjects(token: string, calendarUrl: string): Promise<RemoteCalendarObject[]> {
  const calendars = await listYandexCalendars(token);
  const chosen = path(calendarUrl);
  if (!calendars.some((item) => item.url === chosen)) throw new Error("Выбранный календарь недоступен.");
  const result = await fetch(chosen, {
    method: "REPORT", redirect: "error",
    headers: { Authorization: `OAuth ${token}`, Depth: "1", "Content-Type": "application/xml; charset=utf-8" },
    body: '<?xml version="1.0" encoding="utf-8"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"/></c:comp-filter></c:filter></c:calendar-query>',
    signal: AbortSignal.timeout(25000),
  });
  if (result.status !== 207) throw new Error("Не удалось получить события календаря.");
  const body = await result.text();
  if (body.length > 8_000_000 || /<!DOCTYPE/i.test(body)) throw new Error("Недопустимый или слишком большой ответ календаря.");
  const records = object(object(xml.parse(body)).multistatus).response;
  if (!Array.isArray(records) || records.length > 2000) throw new Error("Слишком много событий или некорректный ответ календаря.");
  return (records as DavResponse[]).map((record) => {
    const data = prop(record);
    if (typeof data.getetag !== "string" || typeof data["calendar-data"] !== "string") throw new Error("Календарь вернул событие без версии или содержимого.");
    const url = path(record.href, chosen);
    if (!url.startsWith(chosen.endsWith("/") ? chosen : chosen + "/")) throw new Error("Событие находится вне выбранного календаря.");
    return { url, etag: data.getetag, data: data["calendar-data"] };
  });
}
