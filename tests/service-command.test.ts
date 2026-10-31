import { test } from "node:test";
import assert from "node:assert/strict";
import { serviceCommand } from "../src/lib/service-command.ts";

test("service tags accept only supported read actions", () => {
  assert.equal(serviceCommand("@Диск покажи файлы"), "disk");
  assert.equal(serviceCommand("@Календарь"), "calendar");
  assert.equal(serviceCommand("@Почта проверь почту"), "mail");
  assert.equal(serviceCommand("@Почта покажи письма"), "mail-messages");
  assert.equal(serviceCommand("@Почта отправь письмо"), "unsupported");
  assert.equal(serviceCommand("Создай задачу проверить диск"), undefined);
});
