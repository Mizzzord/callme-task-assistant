import { TeamSettings } from "@/components/team-settings";
import type { AccountState } from "@/types";
import type { AccountMutation } from "@/components/auth-dialog";
import { useEffect, useState } from "react";
import { headers, request } from "@/lib/api";
import {
  Video,
  MessageSquare,
  NotebookPen,
  CalendarDays,
  HardDrive,
  Mail,
  MapPin,
  Mic,
  ExternalLink,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import type { MicrophoneSensitivity } from "@/lib/speech-segmenter";
const services = [
  {
    name: "Яндекс Телемост",
    icon: Video,
    description: "Ссылка на созвон прямо в карточке задачи или встречи.",
    detail:
      "Добавьте ссылку на встречу в карточку. Создание через API доступно после авторизации выше и подтверждения; поддержку конкретного аккаунта ещё нужно проверить.",
    href: "https://telemost.yandex.ru/",
    action: "Открыть Телемост",
  },
  {
    name: "Telegram",
    icon: MessageSquare,
    description: "Обсуждения и сообщения рядом с задачей.",
    detail:
      "Скопируйте ссылку на сообщение или чат и добавьте её в связанные материалы. Приложение не читает переписку и не отправляет сообщения.",
    href: "https://web.telegram.org/",
    action: "Открыть Telegram",
  },
  {
    name: "Яндекс Заметки",
    icon: NotebookPen,
    description: "Идеи, конспекты и итоги встреч в связанных материалах.",
    detail:
      "Добавьте доступный вам адрес заметки как связанный материал. Содержимое не импортируется; при открытии может потребоваться вход в Яндекс.",
    href: "https://disk.yandex.ru/notes",
    action: "Открыть заметки",
  },
  {
    name: "Яндекс Календарь",
    icon: CalendarDays,
    description: "События и встречи в календаре Яндекса.",
    detail: "После подключения доступен предварительный просмотр поддерживаемых событий. Связь с задачами и синхронизация пока не включены.",
    href: "https://calendar.yandex.ru/",
    action: "Открыть Календарь",
  },
  {
    name: "Яндекс Диск",
    icon: HardDrive,
    description: "Файлы и документы, связанные с задачами.",
    detail: "После подключения команда @Диск в чате показывает папки и файлы. Выбранный материал можно прикрепить к задаче; загрузка на Диск пока не подключена.",
    href: "https://disk.yandex.ru/",
    action: "Открыть Диск",
  },
  {
    name: "Яндекс Почта",
    icon: Mail,
    description: "Письма и переписка в Яндекс Почте.",
    detail: "После подключения команда @Почта покажи письма выводит последние входящие. Ссылку или выбранный фрагмент можно добавить в задачу. Отправка писем не реализована.",
    href: "https://mail.yandex.ru/",
    action: "Открыть Почту",
  },
  {
    name: "Яндекс Карты",
    icon: MapPin,
    description: "Адреса и места для встреч.",
    detail: "Ссылку на место можно сохранить как связанный материал. Карта и поиск адресов внутри приложения пока не подключены.",
    href: "https://yandex.ru/maps/",
    action: "Открыть Карты",
  },
];
export function SettingsPanel({
  open,
  onOpenChange,
  voiceAvailable,
  microphoneSensitivity,
  onMicrophoneSensitivityChange,
  account,
  mutate,
  busy,
  onAuth,
  tab = "team",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  voiceAvailable: boolean;
  microphoneSensitivity: MicrophoneSensitivity;
  onMicrophoneSensitivityChange: (value: MicrophoneSensitivity) => void;
  account?: AccountState;
  mutate: AccountMutation;
  busy: boolean;
  onAuth: (mode: "login" | "register") => void;
  tab?: "team" | "services";
}) {
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const [storedYandexStatus, setYandexStatus] = useState<{ userId: string; configured: boolean; connected: boolean; mail: { configured: boolean; connected: boolean }; telemost: { configured: boolean; connected: boolean } }>();
  const userId = account?.user?.id;
  const yandexStatus = storedYandexStatus?.userId === userId ? storedYandexStatus : undefined;
  const [yandexMessage, setYandexMessage] = useState("");
  const [mailMessage, setMailMessage] = useState("");
  const [telemostMessage, setTelemostMessage] = useState("");
  const [conference, setConference] = useState<{ userId: string; url: string }>();
  const [diskListing, setDiskListing] = useState<{ userId: string; items: { name?: string; type?: string }[] }>();
  const [calendarListing, setCalendarListing] = useState<{ userId: string; calendars: { name: string; url: string }[] }>();
  const [selectedCalendar, setSelectedCalendar] = useState("");
  const [calendarPreview, setCalendarPreview] = useState<{ userId: string; events: { uid: string; title: string; date: string; time: string | null }[]; skipped: number }>();
  const [yandexBusy, setYandexBusy] = useState(false);
  useEffect(() => {
    let active = true;
    if (userId) request<{ configured: boolean; connected: boolean; mail: { configured: boolean; connected: boolean }; telemost: { configured: boolean; connected: boolean } }>("/api/yandex/status")
      .then((status) => { if (active) setYandexStatus({ ...status, userId }); })
      .catch(() => { if (active) setYandexMessage("Не удалось проверить состояние подключения."); });
    return () => { active = false; };
  }, [userId]);
  async function connectYandex(service = "calendar-disk") {
    setYandexBusy(true);
    setYandexMessage("");
    try {
      const result = await request<{ url: string }>("/api/yandex/connect", { method: "POST", headers, body: JSON.stringify({ service }) });
      window.location.assign(result.url);
    } catch (error) { (service === "mail" ? setMailMessage : service === "telemost" ? setTelemostMessage : setYandexMessage)(error instanceof Error ? error.message : "Не удалось начать подключение."); setYandexBusy(false); }
  }
  async function checkYandex(service: "disk" | "calendar") {
    setYandexBusy(true);
    setYandexMessage("");
    if (service === "disk") setDiskListing(undefined);
    try {
      if (service === "disk") {
        const result = await request<{ total: number; items: { name?: string; type?: string }[] }>("/api/yandex/disk");
        if (userId) setDiskListing({ userId, items: result.items });
        setYandexMessage(`Диск доступен: элементов в корневой папке — ${result.total}.`);
      } else {
        const result = await request<{ calendars: { name: string; url: string }[] }>("/api/yandex/calendars");
        if (userId) setCalendarListing({ userId, calendars: result.calendars });
        setYandexMessage(`Доступ к Календарю подтверждён. Найдено календарей: ${result.calendars.length}.`);
      }
    } catch (error) { setYandexMessage(error instanceof Error ? error.message : "Проверка доступа не удалась."); }
    finally { setYandexBusy(false); }
  }
  async function disconnectYandex() {
    setYandexBusy(true);
    try {
      await request("/api/yandex/disconnect", { method: "POST", headers, body: "{}" });
      setDiskListing(undefined);
      setCalendarListing(undefined);
      setCalendarPreview(undefined);
      if (userId && yandexStatus) setYandexStatus({ ...yandexStatus, userId, connected: false });
      setYandexMessage("Локальное подключение удалено. Доступ можно также отозвать в настройках Яндекс ID.");
    } catch (error) { setYandexMessage(error instanceof Error ? error.message : "Не удалось отключить Яндекс."); }
    finally { setYandexBusy(false); }
  }
  async function checkMail() {
    setYandexBusy(true);
    setMailMessage("");
    try {
      const result = await request<{ messages: number; unseen: number }>("/api/yandex/mail");
      setMailMessage(`Почта доступна: входящих ${result.messages}, непрочитанных ${result.unseen}.`);
    } catch (error) { setMailMessage(error instanceof Error ? error.message : "Не удалось проверить Почту."); }
    finally { setYandexBusy(false); }
  }
  async function disconnectMail() {
    setYandexBusy(true);
    try {
      await request("/api/yandex/disconnect", { method: "POST", headers, body: JSON.stringify({ service: "mail" }) });
      if (userId && yandexStatus) setYandexStatus({ ...yandexStatus, mail: { ...yandexStatus.mail, connected: false } });
      setMailMessage("Локальный доступ к Почте отключён. Разрешение в Яндекс ID можно отозвать отдельно.");
    } catch (error) { setMailMessage(error instanceof Error ? error.message : "Не удалось отключить Почту."); }
    finally { setYandexBusy(false); }
  }
  async function createConference() {
    setYandexBusy(true);
    setTelemostMessage("");
    try {
      const result = await request<{ url: string }>("/api/yandex/telemost/conference", { method: "POST", headers, body: JSON.stringify({ requestId: crypto.randomUUID(), confirm: true }) });
      if (userId) setConference({ userId, url: result.url });
      setTelemostMessage("Встреча создана. Ссылку можно добавить в карточку задачи.");
    } catch (error) { setTelemostMessage(error instanceof Error ? error.message : "Не удалось создать встречу."); }
    finally { setYandexBusy(false); }
  }
  async function disconnectTelemost() {
    setYandexBusy(true);
    try {
      await request("/api/yandex/disconnect", { method: "POST", headers, body: JSON.stringify({ service: "telemost" }) });
      if (userId && yandexStatus) setYandexStatus({ ...yandexStatus, telemost: { ...yandexStatus.telemost, connected: false } });
      setConference(undefined);
      setTelemostMessage("Локальный доступ отключён. Разрешение в Яндекс ID можно отозвать отдельно.");
    } catch (error) { setTelemostMessage(error instanceof Error ? error.message : "Не удалось отключить Телемост."); }
    finally { setYandexBusy(false); }
  }
  async function previewCalendar() {
    setYandexBusy(true);
    setYandexMessage("");
    setCalendarPreview(undefined);
    try {
      const result = await request<{ events: { uid: string; title: string; date: string; time: string | null }[]; skipped: number }>(`/api/yandex/calendar-events?calendar=${encodeURIComponent(selectedCalendar)}`);
      if (userId) setCalendarPreview({ userId, ...result });
      setYandexMessage(`Найдено событий для просмотра: ${result.events.length}. Пропущено неподдерживаемых: ${result.skipped}. Изменений не внесено.`);
    } catch (error) { setYandexMessage(error instanceof Error ? error.message : "Не удалось прочитать события."); }
    finally { setYandexBusy(false); }
  }
  const [theme, setTheme] = useState(
    document.documentElement.classList.contains("dark") ? "dark" : "light",
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Настройки</DialogTitle>
          <DialogDescription>
            Команда, права доступа, внешний вид и сервисы.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue={tab}>
          <TabsList>
            <TabsTrigger value="team">Команда</TabsTrigger>
            <TabsTrigger value="services">Сервисы</TabsTrigger>
            <TabsTrigger value="appearance">Внешний вид</TabsTrigger>
          </TabsList>
          <TabsContent value="team" className="pt-3">
            <TeamSettings
              key={account?.team.id}
              account={account}
              mutate={mutate}
              busy={busy}
              onAuth={onAuth}
            />
          </TabsContent>
          <TabsContent value="services" className="flex flex-col gap-3 pt-3">
            <Card size="sm">
              <CardHeader><CardTitle>Подключение Календаря и Диска</CardTitle>
                <CardDescription>Личное подключение для вашего аккаунта CallMe. Яндекс запросит чтение Диска и доступ к календарям.</CardDescription></CardHeader>
              <CardContent className="flex flex-col gap-3">
                <Badge variant="outline">{!account?.user ? "Войдите в CallMe" : yandexStatus?.connected ? "Авторизация сохранена" : yandexStatus?.configured ? "Не подключено" : "OAuth не настроен"}</Badge>
                {yandexMessage && <p role="status" className="text-sm">{yandexMessage}</p>}
                {yandexStatus?.connected && calendarListing && calendarListing.userId === userId && (
                  <div className="flex flex-col gap-2"><p className="text-sm font-medium">Календари</p>
                    {calendarListing.calendars.length ? <><Select value={selectedCalendar} onValueChange={(value) => { setSelectedCalendar(value); setCalendarPreview(undefined); }}><SelectTrigger aria-label="Выбрать календарь"><SelectValue placeholder="Выберите календарь" /></SelectTrigger><SelectContent><SelectGroup>{calendarListing.calendars.map((calendar) => <SelectItem key={calendar.url} value={calendar.url}>{calendar.name}</SelectItem>)}</SelectGroup></SelectContent></Select><Button variant="outline" size="sm" disabled={!selectedCalendar || yandexBusy} onClick={() => void previewCalendar()}>Просмотреть события</Button></> : <p className="text-sm text-muted-foreground">Календари не найдены.</p>}
                  </div>
                )}
                {calendarPreview && calendarPreview.userId === userId && <div className="flex flex-col gap-2"><p className="text-sm font-medium">События календаря (первые 20)</p><ul className="flex flex-col gap-1 text-sm">{calendarPreview.events.slice(0, 20).map((event, index) => <li key={`${event.uid}-${index}`}>{event.date}{event.time ? ` ${event.time}` : ""} · {event.title}</li>)}</ul></div>}
                {yandexStatus?.connected && diskListing && diskListing.userId === userId && (
                  <div className="flex flex-col gap-2">
                    <p className="text-sm font-medium">Корневая папка Диска (до 20 элементов)</p>
                    {diskListing.items.length ? <ul className="flex flex-col gap-1 text-sm">{diskListing.items.map((item, index) => <li key={index} className="break-all">{item.type === "dir" ? "Папка" : "Файл"}: {item.name}</li>)}</ul> : <p className="text-sm text-muted-foreground">Папка пуста.</p>}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" disabled={!account?.user || !yandexStatus?.configured || yandexBusy} onClick={() => void connectYandex()}>{yandexStatus?.connected ? "Подключить заново" : "Подключить Яндекс"}</Button>
                  <Button variant="outline" size="sm" disabled={!yandexStatus?.connected || yandexBusy} onClick={() => void checkYandex("disk")}>Проверить Диск</Button>
                  <Button variant="outline" size="sm" disabled={!yandexStatus?.connected || yandexBusy} onClick={() => void checkYandex("calendar")}>Проверить Календарь</Button>
                  {yandexStatus?.connected && <Button variant="outline" size="sm" disabled={yandexBusy} onClick={() => void disconnectYandex()}>Отключить на этом устройстве</Button>}
                </div>
              </CardContent>
            </Card>
            <Card size="sm"><CardHeader><CardTitle>Подключение Яндекс Почты</CardTitle><CardDescription>Личный доступ к входящим письмам по IMAP. Отправка и удаление писем не подключены.</CardDescription></CardHeader><CardContent className="flex flex-col gap-3"><Badge variant="outline">{!account?.user ? "Войдите в CallMe" : yandexStatus?.mail?.connected ? "Авторизация сохранена" : yandexStatus?.mail?.configured ? "Не подключено" : "OAuth не настроен"}</Badge>{mailMessage && <p role="status" className="text-sm">{mailMessage}</p>}<div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={!account?.user || !yandexStatus?.mail?.configured || yandexBusy} onClick={() => void connectYandex("mail")}>{yandexStatus?.mail?.connected ? "Подключить Почту заново" : "Подключить Почту"}</Button><Button variant="outline" size="sm" disabled={!yandexStatus?.mail?.connected || yandexBusy} onClick={() => void checkMail()}>Проверить Почту</Button>{yandexStatus?.mail?.connected && <Button variant="outline" size="sm" disabled={yandexBusy} onClick={() => void disconnectMail()}>Отключить Почту</Button>}</div></CardContent></Card>
            <Card size="sm"><CardHeader><CardTitle>Подключение Телемоста</CardTitle><CardDescription>Отдельная авторизация для создания встреч. Доступность зависит от аккаунта и условий Яндекса.</CardDescription></CardHeader><CardContent className="flex flex-col gap-3"><Badge variant="outline">{!account?.user ? "Войдите в CallMe" : yandexStatus?.telemost?.connected ? "Авторизация сохранена" : yandexStatus?.telemost?.configured ? "Не подключено" : "OAuth не настроен"}</Badge>{telemostMessage && <p role="status" className="text-sm">{telemostMessage}</p>}{conference && conference.userId === userId && <a className="break-all text-sm underline" href={conference.url} target="_blank" rel="noopener noreferrer">{conference.url}</a>}<div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={!account?.user || !yandexStatus?.telemost?.configured || yandexBusy} onClick={() => void connectYandex("telemost")}>{yandexStatus?.telemost?.connected ? "Подключить Телемост заново" : "Подключить Телемост"}</Button><AlertDialog><AlertDialogTrigger asChild><Button variant="outline" size="sm" disabled={!yandexStatus?.telemost?.connected || yandexBusy || account?.role === "viewer"}>Создать встречу</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Создать публичную встречу?</AlertDialogTitle><AlertDialogDescription>Яндекс создаст встречу, доступную всем, у кого есть ссылка. Если связь прервётся, проверьте Телемост перед повтором, чтобы не создать дубликат.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Отмена</AlertDialogCancel><AlertDialogAction onClick={() => void createConference()}>Создать встречу</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>{yandexStatus?.telemost?.connected && <Button variant="outline" size="sm" disabled={yandexBusy} onClick={() => void disconnectTelemost()}>Отключить Телемост</Button>}</div></CardContent></Card>
            {services.map((s) => (
              <Card key={s.name} size="sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <s.icon />
                    {s.name}
                  </CardTitle>
                  <CardDescription>{s.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Badge variant="outline">{["Яндекс Диск", "Яндекс Почта"].includes(s.name) ? "Чтение · без синхронизации" : "Ссылки · без синхронизации"}</Badge>
                  <p className="mt-3 text-sm text-muted-foreground">
                    {s.detail}
                  </p>
                </CardContent>
                <CardFooter>
                  <Button asChild variant="outline" size="sm">
                    <a href={s.href} target="_blank" rel="noopener noreferrer">
                      {s.action}
                      <ExternalLink data-icon="inline-end" />
                    </a>
                  </Button>
                </CardFooter>
              </Card>
            ))}
            <Card size="sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mic />
                  Голосовой ассистент
                </CardTitle>
                <CardDescription>
                  {voiceAvailable
                    ? "Сервис настроен. Запустите разговор кнопкой микрофона."
                    : "Пока не подключён. Текстовый чат и формы доступны."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Field>
                  <FieldLabel htmlFor="microphone-sensitivity">Чувствительность микрофона</FieldLabel>
                  <Select value={microphoneSensitivity} onValueChange={(value) => { if (value === "quiet" || value === "normal" || value === "noisy") onMicrophoneSensitivityChange(value); }}>
                    <SelectTrigger id="microphone-sensitivity"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectGroup>
                      <SelectItem value="quiet">Тихий голос</SelectItem>
                      <SelectItem value="normal">Обычная</SelectItem>
                      <SelectItem value="noisy">Шумное помещение</SelectItem>
                    </SelectGroup></SelectContent>
                  </Select>
                  <FieldDescription>Настройка применяется после перезапуска голосового разговора. Посторонняя речь всё ещё может распознаваться.</FieldDescription>
                </Field>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="appearance" className="pt-4">
            <FieldGroup>
              <Field>
                <FieldLabel>Тема приложения</FieldLabel>
                <ToggleGroup
                  type="single"
                  value={theme}
                  variant="outline"
                  onValueChange={(v) => {
                    if (!v) return;
                    setTheme(v);
                    document.documentElement.classList.toggle(
                      "dark",
                      v === "dark",
                    );
                    try {
                      localStorage.setItem("ryadom-theme", v);
                    } catch {
                      setStorageUnavailable(true);
                    }
                  }}
                  aria-label="Тема приложения"
                >
                  <ToggleGroupItem value="light">Светлая</ToggleGroupItem>
                  <ToggleGroupItem value="dark">Тёмная</ToggleGroupItem>
                </ToggleGroup>
                <FieldDescription>
                  {storageUnavailable
                    ? "Хранилище браузера недоступно. Тема применена до перезагрузки."
                    : "Выбор сохраняется в этом браузере."}
                </FieldDescription>
              </Field>
            </FieldGroup>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
