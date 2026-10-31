import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { connect } from "node:tls";
import { readMailboxStatus } from "../server/yandex-mail.ts";

class Socket extends EventEmitter {
  writes: string[] = [];
  setTimeout() { return this; }
  destroy() { return this; }
  write(value: string) { this.writes.push(value); return true; }
  line(value: string) { this.emit("data", Buffer.from(value)); }
}
test("Mail status uses XOAUTH2 and returns only inbox counts", async () => {
  const socket = new Socket();
  const result = readMailboxStatus("user@example.test", "fake-token", (() => socket) as unknown as typeof connect);
  socket.line("* OK ready\r\n");
  assert.match(socket.writes[0], /^A1 AUTHENTICATE XOAUTH2 /);
  const payload = Buffer.from(socket.writes[0].trim().split(" ")[3], "base64").toString();
  assert.equal(payload, "user=user@example.test\u0001auth=Bearer fake-token\u0001\u0001");
  socket.line("A1 OK authorised\r\n* STATUS INBOX (MESSAGES 10 ");
  socket.line("UNSEEN 2)\r\nA2 OK completed\r\n");
  assert.deepEqual(await result, { messages: 10, unseen: 2 });
});
test("Mail rejects injection and fails closed on authentication errors", async () => {
  await assert.rejects(() => readMailboxStatus("bad\r\n@example.test", "fake-token"));
  const socket = new Socket();
  const result = readMailboxStatus("user@example.test", "fake-token", (() => socket) as unknown as typeof connect);
  socket.line("* OK ready\r\n");
  socket.line("A1 NO failed\r\n");
  await assert.rejects(result, /отклонила авторизацию/);
  assert.equal(socket.writes.length, 1);
});
