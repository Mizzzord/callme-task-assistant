import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMention } from "../server/mentions.ts";
import type { TeamMember } from "../src/types.ts";

const member = (id: string, name: string, role: TeamMember["role"] = "member"): TeamMember => ({ id, name, role, email: "test@example.test", revision: 1 });
test("mentions match whole names, reject ambiguous and read-only assignees", () => {
  const people = [member("1", "Анна"), member("2", "Анна Иванова")];
  assert.deepEqual(resolveMention("Задача @Анна Иванова завтра", people), { text: "Задача завтра", assigneeId: "2" });
  assert.deepEqual(resolveMention("Создай задачу отчёт, исполнитель Анна Иванова", people), { text: "Создай задачу отчёт,", assigneeId: "2" });
  assert.equal(resolveMention("Задача @Анна2", people).assigneeId, undefined);
  assert.throws(() => resolveMention("Задача @Анна", [member("1", "Анна"), member("2", "АННА")]), /однозначным/);
  assert.throws(() => resolveMention("Задача @Анна", [member("1", "Анна", "viewer")]), /Наблюдателя/);
  assert.throws(() => resolveMention("Задача @Анна и @Борис", [member("1", "Анна"), member("2", "Борис")]), /одного участника/);
});
