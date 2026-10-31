import { test } from "node:test";
import assert from "node:assert/strict";
import { listYandexCalendars } from "../server/caldav.ts";

test("CalDAV discovers calendars and rejects external addresses", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  const response = (content: string) => new Response(`<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">${content}</d:multistatus>`, { status: 207 });
  const entry = (href: string, properties: string) => `<d:response><d:href>${href}</d:href><d:propstat><d:prop>${properties}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`;
  globalThis.fetch = async (url, options) => {
    assert(String(url).startsWith("https://caldav.yandex.ru/"));
    assert.equal(options?.redirect, "error");
    calls++;
    if (calls === 1) return response(entry("/", "<d:current-user-principal><d:href>/principals/a/</d:href></d:current-user-principal>"));
    if (calls === 2) return response(entry("/principals/a/", "<c:calendar-home-set><d:href>/calendars/a/</d:href></c:calendar-home-set>"));
    return response(entry("/calendars/a/", "<d:resourcetype><d:collection/></d:resourcetype>") + entry("/calendars/a/default/", "<d:displayname>Основной</d:displayname><d:resourcetype><d:collection/><c:calendar/></d:resourcetype>"));
  };
  try {
    assert.deepEqual(await listYandexCalendars("test-token"), [{ name: "Основной", url: "https://caldav.yandex.ru/calendars/a/default/" }]);
    globalThis.fetch = async () => response(entry("/", "<d:current-user-principal><d:href>https://attacker.example/</d:href></d:current-user-principal>"));
    await assert.rejects(() => listYandexCalendars("test-token"), /недопустимый адрес/);
  } finally { globalThis.fetch = original; }
});

import { parseCalendarObject } from "../server/calendar-format.ts";
test("Calendar preview preserves Moscow and UTC dates and excludes unsafe events", () => {
  const make = (event: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:example\r\nSUMMARY:Test\r\n${event}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;
  assert.deepEqual(parseCalendarObject(make("DTSTART;TZID=Europe/Moscow:20261101T120000\r\nDTEND;TZID=Europe/Moscow:20261101T123000")), { uid: "example", title: "Test", date: "2026-11-01", time: "12:00", duration: 30, description: "" });
  assert.equal(parseCalendarObject(make("DTSTART:20261031T230000Z\r\nDTEND:20261101T000000Z"))?.date, "2026-11-01");
  assert.equal(parseCalendarObject(make("DTSTART;VALUE=DATE:20261101\r\nDTEND;VALUE=DATE:20261102"))?.time, null);
  assert.equal(parseCalendarObject(make("DTSTART;TZID=Asia/Tokyo:20261101T120000\r\nDTEND;TZID=Asia/Tokyo:20261101T130000")), undefined);
  assert.equal(parseCalendarObject(make("DTSTART:20261101T120000Z\r\nRRULE:FREQ=DAILY")), undefined);
  assert.equal(parseCalendarObject(make("DTSTART:20261101T120000Z\r\nATTENDEE:mailto:test@example.test")), undefined);
});
