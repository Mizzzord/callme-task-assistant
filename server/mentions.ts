import type { TeamMember } from "../src/types.ts";

export function resolveMention(text: string, members: TeamMember[]) {
  const hits: { start: number; end: number; members: TeamMember[] }[] = [];
  const names = [...new Set(members.map((member) => member.name))].sort((a, b) => b.length - a.length);
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(?:^|\\s)@${escaped}(?![\\p{L}\\p{N}_])`, "giu");
    for (const match of text.matchAll(pattern)) {
      const start = match.index + (match[0].startsWith("@") ? 0 : 1);
      const end = match.index + match[0].length;
      if (hits.some((hit) => start < hit.end && end > hit.start)) continue;
      hits.push({ start, end, members: members.filter((member) => member.name.localeCompare(name, "ru", { sensitivity: "accent" }) === 0) });
    }
    const spoken = new RegExp(`(?:^|\\s)(?:исполнитель|назначь исполнителем|назначить исполнителем)\\s+${escaped}(?![\\p{L}\\p{N}_])`, "giu");
    for (const match of text.matchAll(spoken)) {
      const start = match.index + (match[0].startsWith(" ") ? 1 : 0);
      const end = match.index + match[0].length;
      if (hits.some((hit) => start < hit.end && end > hit.start)) continue;
      hits.push({ start, end, members: members.filter((member) => member.name.localeCompare(name, "ru", { sensitivity: "accent" }) === 0) });
    }
  }
  if (!hits.length) return { text, assigneeId: undefined };
  const people = new Map(hits.flatMap((hit) => hit.members).map((member) => [member.id, member]));
  if (people.size !== 1) throw new Error("Укажите одного участника с однозначным именем.");
  const person = [...people.values()][0];
  if (person.role === "viewer") throw new Error("Наблюдателя нельзя назначить исполнителем.");
  let cleaned = text;
  for (const hit of hits.sort((a, b) => b.start - a.start)) cleaned = cleaned.slice(0, hit.start) + cleaned.slice(hit.end);
  return { text: cleaned.replace(/\s{2,}/g, " ").trim(), assigneeId: person.id };
}
