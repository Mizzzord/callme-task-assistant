import ICAL from "ical.js";
export type CalendarPreview = { uid: string; title: string; date: string; time: string | null; duration: number | null; description: string };
const pad = (n: number) => String(n).padStart(2, "0");
export function parseCalendarObject(data: string): CalendarPreview | undefined {
  try {
    if (data.length > 200_000) return;
    const calendar = new ICAL.Component(ICAL.parse(data));
    const events = calendar.getAllSubcomponents("vevent");
    if (events.length !== 1) return;
    const component = events[0];
    if (["rrule", "rdate", "exdate", "recurrence-id", "attendee", "organizer"].some((name) => component.hasProperty(name))) return;
    const event = new ICAL.Event(component);
    const start = event.startDate;
    const tzid = component.getFirstProperty("dtstart")?.getParameter("tzid");
    if (tzid && tzid !== "Europe/Moscow") return;
    if (!event.uid || !event.summary || event.summary.length > 300 || (event.description || "").length > 4000 || !start) return;
    const seconds = event.duration.toSeconds();
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 86400 || seconds % 60 !== 0 || (start.isDate && seconds !== 86400)) return;
    let date = `${start.year}-${pad(start.month)}-${pad(start.day)}`;
    let time = start.isDate ? null : `${pad(start.hour)}:${pad(start.minute)}`;
    if (!start.isDate && start.zone.tzid === "UTC") {
      const value = new Date(start.toUnixTime() * 1000);
      const fields = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(value);
      const part = (name: string) => fields.find((field) => field.type === name)?.value;
      date = `${part("year")}-${part("month")}-${part("day")}`;
      time = `${part("hour")}:${part("minute")}`;
    }
    return { uid: event.uid, title: event.summary, date, time, duration: start.isDate || !seconds ? null : seconds / 60, description: event.description || "" };
  } catch { return; }
}
