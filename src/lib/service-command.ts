export type ServiceCommand = "disk" | "calendar" | "mail" | "mail-messages" | "unsupported";

export function serviceCommand(text: string): ServiceCommand | undefined {
  const match = text.trim().match(/^@(диск|календарь|почта)(?:\s+(.*))?$/iu);
  if (!match) return /(?:^|\s)@(диск|календарь|почта)(?=\s|$)/iu.test(text) ? "unsupported" : undefined;
  const service = match[1].toLocaleLowerCase("ru");
  const request = (match[2] || "").trim().toLocaleLowerCase("ru").replace(/[.!?]+$/, "");
  if (service === "диск" && ["", "покажи файлы", "файлы"].includes(request)) return "disk";
  if (service === "календарь" && ["", "покажи календари", "календари"].includes(request)) return "calendar";
  if (service === "почта" && ["письма", "покажи письма"].includes(request)) return "mail-messages";
  if (service === "почта" && ["", "проверь почту", "входящие"].includes(request)) return "mail";
  return "unsupported";
}
