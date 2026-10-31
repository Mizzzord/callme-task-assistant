import { test } from "node:test";
import assert from "node:assert/strict";
import { diskWebUrl } from "../server/disk-link.ts";

test("disk links address the chosen private folder or file without publishing it", () => {
  assert.equal(diskWebUrl("disk:/Папка с файлами", "dir"), "https://disk.yandex.ru/client/disk/%D0%9F%D0%B0%D0%BF%D0%BA%D0%B0%20%D1%81%20%D1%84%D0%B0%D0%B9%D0%BB%D0%B0%D0%BC%D0%B8");
  const file = new URL(diskWebUrl("disk:/Папка/отчёт #1.pdf", "file")!);
  assert.equal(file.hostname, "disk.yandex.ru");
  assert.equal(file.searchParams.get("idDialog"), "/disk/Папка/отчёт #1.pdf");
  assert.equal(file.searchParams.get("dialog"), "slider");
  assert.equal(diskWebUrl("disk:/../secret", "file"), undefined);
  assert.equal(diskWebUrl("https://example.com/file", "file"), undefined);
});
