import { connect } from "node:tls";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
class MailReadError extends Error {}

function mailClient(email: string, token: string) {
  const client = new ImapFlow({ host: "imap.yandex.ru", port: 993, secure: true, auth: { user: email, accessToken: token }, logger: false, disableAutoIdle: true, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 15000 });
  client.on("error", () => {});
  return client;
}

export async function listMailboxMessages(email: string, token: string) {
  const client = mailClient(email, token);
  try {
    await client.connect();
    const mailbox = await client.mailboxOpen("INBOX", { readOnly: true });
    if (!mailbox.exists) return { messages: [], total: 0 };
    const start = Math.max(1, mailbox.exists - 19);
    const messages = await client.fetchAll(`${start}:${mailbox.exists}`, { uid: true, envelope: true, flags: true });
    return {
      total: mailbox.exists,
      messages: messages.reverse().map((message) => ({
        uid: message.uid,
        uidValidity: String(mailbox.uidValidity),
        subject: (message.envelope?.subject || "Без темы").slice(0, 200),
        from: (message.envelope?.from?.[0]?.name || message.envelope?.from?.[0]?.address || "Неизвестный отправитель").slice(0, 200),
        date: message.envelope?.date instanceof Date && !Number.isNaN(message.envelope.date.getTime()) ? message.envelope.date.toISOString() : undefined,
        unseen: !message.flags?.has("\\Seen"),
      })),
    };
  } catch {
    throw new Error("Не удалось получить список писем. Проверьте подключение Почты.");
  } finally {
    client.close();
  }
}

export async function readMailboxMessage(email: string, token: string, uidValidity: string, uid: number) {
  const client = mailClient(email, token);
  try {
    await client.connect();
    const mailbox = await client.mailboxOpen("INBOX", { readOnly: true });
    if (String(mailbox.uidValidity) !== uidValidity) throw new MailReadError("Папка Почты изменилась. Выберите письмо заново.");
    const metadata = await client.fetchOne(String(uid), { size: true }, { uid: true });
    if (!metadata || metadata.uid !== uid) throw new MailReadError("Письмо не найдено во входящих.");
    if (!metadata.size || metadata.size > 2 * 1024 * 1024) throw new MailReadError("Письмо слишком велико для просмотра в CallMe. Откройте его в Яндекс Почте.");
    const message = await client.fetchOne(String(uid), { source: true }, { uid: true });
    if (!message || message.uid !== uid || !message.source || message.source.length > 2 * 1024 * 1024) throw new MailReadError("Не удалось получить письмо.");
    const parsed = await simpleParser(message.source, { maxHtmlLengthToParse: 1000000, skipImageLinks: true, skipTextToHtml: true });
    if ((parsed.text?.length || 0) > 200000) throw new MailReadError("Текст письма слишком велик для просмотра в CallMe. Откройте его в Яндекс Почте.");
    return { subject: (parsed.subject || "Без темы").slice(0, 200), from: (parsed.from?.text || "Неизвестный отправитель").slice(0, 300), text: parsed.text || "" };
  } catch (error) {
    if (error instanceof MailReadError) throw error;
    throw new Error("Не удалось открыть письмо. Проверьте подключение Почты.");
  } finally {
    client.close();
  }
}

export type MailStatus = { messages: number; unseen: number };
export function readMailboxStatus(email: string, token: string, createSocket: typeof connect = connect): Promise<MailStatus> {
  const hasControls = (value: string) => Array.from(value).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
  if (!/^[^\s@]+@[^\s@]+$/.test(email) || hasControls(email) || hasControls(token))
    return Promise.reject(new Error("Некорректные данные для подключения Почты."));
  return new Promise((resolve, reject) => {
    const socket = createSocket({ host: "imap.yandex.ru", port: 993, servername: "imap.yandex.ru", rejectUnauthorized: true });
    let buffer = "", stage = 0, settled = false, status: MailStatus | undefined;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error); else if (status) resolve(status); else reject(new Error("Почта не вернула данные папки."));
    };
    socket.setTimeout(15000, () => finish(new Error("Яндекс Почта не ответила вовремя.")));
    socket.on("error", () => finish(new Error("Не удалось подключиться к Яндекс Почте.")));
    socket.on("close", () => { if (!settled) finish(new Error("Подключение к Почте прервано.")); });
    socket.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      if (buffer.length > 65536) return finish(new Error("Недопустимый ответ Почты."));
      while (buffer.includes("\r\n")) {
        const end = buffer.indexOf("\r\n"), line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (stage === 0) {
          if (!/^\* OK\b/i.test(line)) return finish(new Error("Почтовый сервер не готов."));
          const auth = Buffer.from(`user=${email}\x01auth=Bearer ${token}\x01\x01`).toString("base64");
          socket.write(`A1 AUTHENTICATE XOAUTH2 ${auth}\r\n`);
          stage = 1;
        } else if (stage === 1 && /^A1\s/i.test(line)) {
          if (!/^A1 OK\b/i.test(line)) return finish(new Error("Яндекс Почта отклонила авторизацию. Проверьте права и доступ IMAP."));
          socket.write('A2 STATUS "INBOX" (MESSAGES UNSEEN)\r\n');
          stage = 2;
        } else if (stage === 2) {
          if (/^\* STATUS\s/i.test(line)) {
            const messageCount = line.match(/\bMESSAGES\s+(\d+)/i), unseenCount = line.match(/\bUNSEEN\s+(\d+)/i);
            if (messageCount && unseenCount) status = { messages: Number(messageCount[1]), unseen: Number(unseenCount[1]) };
          } else if (/^A2\s/i.test(line)) {
            if (!/^A2 OK\b/i.test(line)) return finish(new Error("Не удалось прочитать состояние входящих писем."));
            socket.write("A3 LOGOUT\r\n");
            finish();
          }
        }
      }
    });
  });
}
