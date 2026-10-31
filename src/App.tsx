import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  AudioLines,
  Paperclip,
  UserRound,
  Video,
  Camera,
  CalendarDays,
  Plus,
  ArrowUp,
  Search,
  ArrowUpRight,
  CircleHelp,
  Mic,
  Square,
  CircleAlert,
  ChevronDown,
  Sparkles,
  Clock3,
  Check,
  RefreshCw,
  Columns3,
  Folder,
  Settings2,
  Link2,
  Mail,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  Sidebar,
  SidebarProvider,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarInset,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  InputGroup,
  InputGroupTextarea,
  InputGroupAddon,
  InputGroupButton,
} from "@/components/ui/input-group";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldError,
} from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  MessageScrollerProvider,
  MessageScroller,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerButton,
} from "@/components/ui/message-scroller";
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageHeader,
} from "@/components/ui/message";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Item,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
  ItemGroup,
} from "@/components/ui/item";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { KanbanBoard } from "@/components/kanban-board";
import { SettingsPanel } from "@/components/settings-panel";
import { EventEditor } from "@/components/event-editor";
import { eventDate } from "@/lib/events";
import { EventList } from "@/components/event-list";
import { AuthDialog } from "@/components/auth-dialog";
import { InviteDialog } from "@/components/invite-dialog";
import { getState, send, request, headers } from "@/lib/api";
import type { RequestBody } from "@/lib/api";
import { VoiceSession } from "@/lib/voice";
import { VoiceRecording } from "@/lib/voice-recording";
import { serviceCommand } from "@/lib/service-command";
import type { VoiceStatus } from "@/lib/voice";
import type { MicrophoneSensitivity } from "@/lib/speech-segmenter";
import type { AppState, CalendarEvent, Command } from "@/types";
const examples = [
  {
    icon: Plus,
    title: "Записать дело",
    description: "Чтобы освободить мысли",
    text: "Создай задачу купить молоко завтра",
  },
  {
    icon: CalendarDays,
    title: "Назначить встречу",
    description: "Время, место и планы",
    text: "Создай встречу с командой завтра в 15:00 на 30 минут",
  },
  {
    icon: Clock3,
    title: "Посмотреть планы",
    description: "Всё важное на неделю",
    text: "Покажи планы на неделю",
  },
  {
    icon: Search,
    title: "Найти в прошлом",
    description: "Даже если не помните дату",
    text: "Найди техническое задание",
  },
];
export default function App() {
  return (
    <TooltipProvider>
      <SidebarProvider style={{ "--sidebar-width": "15rem" } as CSSProperties}>
        <WorkspaceApp />
      </SidebarProvider>
    </TooltipProvider>
  );
}
function WorkspaceApp() {
  const [state, setState] = useState<AppState>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionTarget, setMentionTarget] = useState<"board" | "chat">("board");
  const mentionOffset = useRef(0);
  const boardInputRef = useRef<HTMLTextAreaElement>(null);
  const [view, setView] = useState<"board" | "events">("board");
  const [editor, setEditor] = useState<CalendarEvent | "new" | null>(null);
  const [help, setHelp] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [project, setProject] = useState("all");
  const [projectOpen, setProjectOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectInvalid, setProjectInvalid] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register" | null>(null);
  const [inviteToken, setInviteToken] = useState(() =>
    new URLSearchParams(window.location.hash.slice(1)).get("invite"),
  );
  const [settingsTab, setSettingsTab] = useState<"team" | "services">("team");
  const epoch = useRef(0);
  const scope = useRef("");
  const currentState = useRef<AppState | undefined>(undefined);
  const [settings, setSettings] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("off");
  const [microphoneSensitivity, setMicrophoneSensitivity] = useState<MicrophoneSensitivity>(() => {
    try { const value = localStorage.getItem("callme-microphone-sensitivity"); return value === "quiet" || value === "noisy" ? value : "normal"; } catch { return "normal"; }
  });
  const [voiceError, setVoiceError] = useState("");
  const [serviceResult, setServiceResult] = useState<{ title: string; lines: string[]; mail?: { subject: string; from: string; date?: string; unseen: boolean; url: string }[]; disk?: { path: string; offset: number; total: number; items: { name?: string; type?: string; path?: string; url?: string }[] } }>();
  const [mailPreview, setMailPreview] = useState<{ eventId: string; revision: number; title: string; subject: string; text: string }>();
  const [recordingStatus, setRecordingStatus] = useState<"off" | "starting" | "recording" | "processing">("off");
  const recording = useRef<VoiceRecording | undefined>(undefined);
  const [fileDraft, setFileDraft] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const retry = useRef<RequestBody | undefined>(undefined);
  const inflight = useRef(false);
  const voice = useRef<VoiceSession | undefined>(undefined);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const {
    setOpenMobile,
    state: sidebarState,
    isMobile,
    openMobile,
  } = useSidebar();
  function applyState(next: AppState) {
    const nextScope = `${next.account?.user?.id || "guest"}:${next.account?.team.id || ""}`;
    if (scope.current && scope.current !== nextScope) {
      setProject("all");
      setEditor(null);
      setProjectOpen(false);
      setProjectName("");
      setChatOpen(false);
      setInput("");
      setFileDraft(null);
      setServiceResult(undefined);
      setMailPreview(undefined);
      retry.current = undefined;
      voice.current?.stop();
      recording.current?.cancel();
      setRecordingStatus("off");
    }
    scope.current = nextScope;
    currentState.current = next;
    setState(next);
  }
  function clearInvite() {
    setInviteToken(null);
    window.history.replaceState(null, "", window.location.pathname);
  }
  function openAuth(mode: "login" | "register") {
    setSettings(false);
    setAuthMode(mode);
  }
  async function accountAction<T>(url: string, body: unknown): Promise<T> {
    if (inflight.current)
      throw new Error("Дождитесь завершения текущего действия.");
    inflight.current = true;
    epoch.current++;
    setBusy(true);
    try {
      const result = await request<T>(url, {
        method: "POST",
        headers: {
          ...headers,
          "x-team-id": currentState.current?.account?.team.id || "",
        },
        body: JSON.stringify(body),
      });
      applyState(await getState());
      setError("");
      return result;
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }
  async function load() {
    setLoading(true);
    setError("");
    try {
      applyState(await getState());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить данные.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let active = true;
    getState()
      .then((next) => {
        if (active) {
          applyState(next);
          if (!next.account?.user && !window.location.hash.includes("invite="))
            setAuthMode("register");
          if (
            next.pending &&
            ["draft", "choose", "speech"].includes(next.pending.type)
          )
            setChatOpen(true);
        }
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error ? e.message : "Не удалось загрузить данные.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      voice.current?.stop();
      recording.current?.cancel();
    };
  }, []);
  useEffect(() => {
    const updateInvite = () =>
      setInviteToken(
        new URLSearchParams(window.location.hash.slice(1)).get("invite"),
      );
    window.addEventListener("hashchange", updateInvite);
    return () => window.removeEventListener("hashchange", updateInvite);
  }, []);
  useEffect(() => {
    let active = true;
    let refreshing = false;
    const timer = setInterval(async () => {
      if (
        refreshing ||
        inflight.current ||
        document.visibilityState === "hidden"
      )
        return;
      refreshing = true;
      const started = epoch.current;
      try {
        const next = await getState();
        if (active && !inflight.current && epoch.current === started)
          applyState(next);
      } catch (e) {
        if (active && !inflight.current && epoch.current === started)
          setError(
            e instanceof Error ? e.message : "Не удалось обновить команду.",
          );
      } finally {
        refreshing = false;
      }
    }, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  async function perform(body: RequestBody): Promise<AppState | undefined> {
    if (inflight.current) return;
    inflight.current = true;
    epoch.current++;
    body = {
      ...body,
      workspaceId: body.workspaceId || currentState.current?.account?.team.id,
    };
    setBusy(true);
    setError("");
    retry.current = body;
    try {
      const next = await send(body);
      applyState(next);
      retry.current = undefined;
      if (body.text && body.source !== "voice")
        setInput((current) => (current.trim() === body.text ? "" : current));
      return next;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось выполнить запрос.");
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }
  async function action(command: Command) {
    const body =
      retry.current?.command &&
      JSON.stringify(retry.current.command) === JSON.stringify(command)
        ? retry.current
        : { requestId: crypto.randomUUID(), command };
    const next = await perform(body);
    if (next && voice.current?.active) {
      void voice.current
        .speak(next.messages.at(-1)!.id)
        .catch((e) =>
          setVoiceError(
            e instanceof Error
              ? e.message
              : "Ответ сохранён, но озвучить его не удалось.",
          ),
        );
    }
    return Boolean(next);
  }
  async function uploadFile() {
    if (!fileDraft || inflight.current) return;
    if (
      fileDraft.size === 0 ||
      fileDraft.size > 10 * 1024 * 1024 ||
      fileDraft.name.length > 200
    ) {
      setError(
        "Выберите непустой файл размером до 10 МБ и именем до 200 символов.",
      );
      return;
    }
    inflight.current = true;
    epoch.current++;
    retry.current = undefined;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/attachments", {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "x-app-request": "voice-planner",
          "x-file-name": encodeURIComponent(fileDraft.name),
          "x-team-id": currentState.current?.account?.team.id || "",
        },
        body: fileDraft,
        signal: AbortSignal.timeout(25000),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || "Не удалось сохранить файл.");
      }
      applyState((await response.json()) as AppState);
      setFileDraft(null);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Не удалось сохранить файл.",
      );
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }
  function pickFile(camera = false) {
    setChatOpen(true);
    (camera ? cameraRef : fileRef).current?.click();
  }
  async function readDisk(path = "disk:/", offset = 0) {
    const params = new URLSearchParams({ path, offset: String(offset) });
    const data = await request<{ total: number; path: string; offset: number; items: { name?: string; type?: string; path?: string; url?: string }[] }>(`/api/yandex/disk?${params}`);
    return { title: `Яндекс Диск · элементов: ${data.total}`, lines: [], disk: data };
  }
  async function browseDisk(path: string, offset = 0) {
    if (inflight.current) return;
    inflight.current = true;
    setBusy(true);
    setError("");
    const currentScope = scope.current;
    try {
      const data = await readDisk(path, offset);
      if (scope.current === currentScope) setServiceResult(data);
    } catch (e) {
      if (scope.current === currentScope) setError(e instanceof Error ? e.message : "Не удалось открыть папку.");
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }
  async function attachDiskLink(item: { name?: string; url?: string }) {
    const event = currentState.current?.events.find((entry) => entry.id === currentState.current?.selected);
    if (!event || !item.url) return;
    if ((event.links || []).some((link) => link.url === item.url)) {
      setError("Эта ссылка уже прикреплена к задаче.");
      return;
    }
    if ((event.links || []).length >= 12) {
      setError("В карточке уже 12 материалов. Удалите ненужную ссылку.");
      return;
    }
    await action({ action: "update", id: event.id, revision: event.revision, links: [...(event.links || []), { label: (item.name || "Яндекс Диск").slice(0, 100), url: item.url, service: "other" }] });
  }
  async function attachMailLink(item: { subject: string; url: string }) {
    const event = currentState.current?.events.find((entry) => entry.id === currentState.current?.selected);
    if (!event) return;
    if ((event.links || []).some((link) => link.url === item.url)) { setError("Это письмо уже прикреплено к задаче."); return; }
    if ((event.links || []).length >= 12) { setError("В карточке уже 12 материалов. Удалите ненужную ссылку."); return; }
    await action({ action: "update", id: event.id, revision: event.revision, links: [...(event.links || []), { label: item.subject.slice(0, 100) || "Письмо", url: item.url, service: "yandex_mail" }] });
  }
  async function previewMailContent(item: { subject: string; url: string }) {
    const event = currentState.current?.events.find((entry) => entry.id === currentState.current?.selected);
    if (!event || inflight.current) return;
    inflight.current = true;
    setBusy(true);
    setError("");
    setMailPreview(undefined);
    const currentScope = scope.current;
    try {
      const message = await request<{ subject: string; text: string }>(`${item.url}?format=json`);
      if (scope.current === currentScope) setMailPreview({ eventId: event.id, revision: event.revision, title: event.title, subject: message.subject, text: message.text });
    } catch (e) {
      if (scope.current === currentScope) setError(e instanceof Error ? e.message : "Не удалось прочитать письмо.");
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }
  async function saveMailContent() {
    if (!mailPreview) return;
    const event = currentState.current?.events.find((entry) => entry.id === mailPreview.eventId);
    if (!event || currentState.current?.selected !== event.id || event.revision !== mailPreview.revision) {
      setError("Выбранная задача изменилась. Выберите письмо заново перед переносом.");
      return;
    }
    const text = mailPreview.text.trim();
    if (!text) { setError("Выберите непустой текст письма."); return; }
    const description = event.description ? `${event.description}\n\n${text}` : text;
    if (description.length > 4000) { setError("Описание задачи ограничено 4000 символами. Сократите переносимый текст."); return; }
    const next = await perform({ requestId: crypto.randomUUID(), command: { action: "update", id: event.id, revision: event.revision, description } });
    if (next?.events.find((entry) => entry.id === event.id)?.description === description) setMailPreview(undefined);
  }
  async function submit(text = input) {
    if (!text.trim() || recordingStatus !== "off") return;
    setChatOpen(true);
    const service = serviceCommand(text);
    if (service) {
      if (service === "unsupported") {
        setError("Для сервиса доступны команды: @Диск покажи файлы, @Календарь покажи календари, @Почта проверь почту и @Почта покажи письма.");
        return;
      }
      if (inflight.current) return;
      inflight.current = true;
      setBusy(true);
      setError("");
      setServiceResult(undefined);
      const currentScope = scope.current;
      try {
        let result: NonNullable<typeof serviceResult>;
        if (service === "disk") {
          result = await readDisk();
        } else if (service === "calendar") {
          const data = await request<{ calendars: { name: string }[] }>("/api/yandex/calendars");
          result = { title: `Яндекс Календарь · календарей: ${data.calendars.length}`, lines: data.calendars.map((item) => item.name) };
        } else if (service === "mail-messages") {
          const data = await request<{ total: number; messages: { subject: string; from: string; date?: string; unseen: boolean; url: string }[] }>("/api/yandex/mail/messages");
          result = { title: `Яндекс Почта · последние письма (${data.total} во входящих)`, lines: [], mail: data.messages };
        } else {
          const data = await request<{ messages: number; unseen: number }>("/api/yandex/mail");
          result = { title: "Яндекс Почта", lines: [`Входящих: ${data.messages}, непрочитанных: ${data.unseen}.`] };
        }
        if (scope.current === currentScope) {
          setServiceResult(result);
          setInput((current) => current.trim() === text.trim() ? "" : current);
        }
      } catch (e) {
        if (scope.current === currentScope) setError(e instanceof Error ? e.message : "Не удалось обратиться к сервису.");
      } finally {
        inflight.current = false;
        setBusy(false);
      }
      return;
    }
    return perform(
      retry.current?.text === text.trim() && retry.current.source !== "voice"
        ? retry.current
        : {
            requestId: crypto.randomUUID(),
            text: text.trim(),
            projectId: currentProjectId,
          },
    );
  }
  function suggest(text: string) {
    setInput(text);
    setHelp(false);
    setChatOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }
  function openEvent(e: CalendarEvent) {
    setOpenMobile(false);
    setEditor(e);
    void action({ action: "select", id: e.id });
  }
  function newEvent() {
    if (currentState.current?.account?.role === "viewer") return;
    setOpenMobile(false);
    setEditor("new");
  }
  function navigate(next: "board" | "events") {
    setView(next);
    setOpenMobile(false);
  }
  async function toggleVoice() {
    if (recordingStatus !== "off") return;
    if (voiceStatus !== "off") {
      voice.current?.stop();
      return;
    }
    setVoiceError("");
    if (!state?.voiceAvailable) {
      setVoiceError(
        "Голосовой сервис пока не подключён. Все записи доступны через текст и формы.",
      );
      return;
    }
    voice.current = new VoiceSession(
      setVoiceStatus,
      async (text, pendingToken) => {
        const next = await perform({
          requestId: crypto.randomUUID(),
          text,
          projectId: currentProjectId,
          source: "voice",
          uncertain: true,
          pendingToken,
        });
        return next?.messages.at(-1)?.id;
      },
      setVoiceError,
      microphoneSensitivity,
      () => currentState.current?.pending?.token,
    );
    await voice.current.start();
  }
  async function finishRecording() {
    const active = recording.current;
    if (!active) return;
    setRecordingStatus("processing");
    try {
      const text = await active.finish();
      if (recording.current !== active || !text) return;
      setInput((current) => [current.trim(), text].filter(Boolean).join(" "));
    } catch (e) {
      if (recording.current === active)
        setVoiceError(e instanceof Error ? e.message : "Не удалось распознать запись.");
    } finally {
      if (recording.current === active) {
        recording.current = undefined;
        setRecordingStatus("off");
      }
    }
  }
  async function startRecording() {
    if (recording.current || voiceStatus !== "off" || busy) return;
    if (!state?.voiceAvailable) {
      setVoiceError("Распознавание речи пока не подключено.");
      return;
    }
    setChatOpen(true);
    setVoiceError("");
    setRecordingStatus("starting");
    const active = new VoiceRecording(() => void finishRecording());
    recording.current = active;
    try {
      if (await active.start() && recording.current === active) setRecordingStatus("recording");
    } catch (e) {
      if (recording.current === active) {
        recording.current = undefined;
        setRecordingStatus("off");
        setVoiceError(e instanceof DOMException && e.name === "NotAllowedError" ? "Нет доступа к микрофону. Разрешите его в браузере." : e instanceof Error ? e.message : "Не удалось начать запись.");
      }
    }
  }
  const [fallbackDay] = useState(() =>
    new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Moscow" }).format(
      new Date(),
    ),
  );
  const today = state?.today || fallbackDay;
  const readOnly = state?.account?.role === "viewer";
  const members = state?.account?.members || [];
  const projects = state?.projects || [];
  const currentProjectId =
    project === "all" || project === "none" ? null : project;
  const projectNameLabel =
    project === "all"
      ? "Все проекты"
      : project === "none"
        ? "Без проекта"
        : projects.find((p) => p.id === project)?.name || "Проект";
  const visibleEvents = (state?.events || []).filter(
    (e) =>
      project === "all" ||
      (project === "none" ? !e.projectId : e.projectId === project),
  );
  function updateInput(
    value: string,
    cursor: number,
    target: "board" | "chat",
  ) {
    setInput(value);
    if (
      cursor > 0 &&
      value[cursor - 1] === "@" &&
      (cursor === 1 || /\s/.test(value[cursor - 2]))
    ) {
      mentionOffset.current = cursor - 1;
      setMentionTarget(target);
      setMentionOpen(true);
    }
  }
  function insertMention(value: string) {
    const member = members.find((item) => item.id === value);
    const inserted = member
      ? `@${member.name}`
      : value === "disk" ? "@Диск"
        : value === "calendar" ? "@Календарь"
          : value === "mail" ? "@Почта покажи письма"
      : value === "telemost"
        ? "https://telemost.yandex.ru/"
        : "";
    if (!inserted) return;
    const start = mentionOffset.current;
    setInput(
      (current) =>
        current.slice(0, start) +
        inserted +
        " " +
        current.slice(current[start] === "@" ? start + 1 : start),
    );
    setMentionOpen(false);
    requestAnimationFrame(() =>
      (mentionTarget === "chat"
        ? inputRef.current
        : boardInputRef.current
      )?.focus(),
    );
  }
  function mentionPicker(target: "board" | "chat") {
    return (
      <Select
        open={mentionOpen && mentionTarget === target}
        onOpenChange={(open) => {
          setMentionTarget(target);
          setMentionOpen(open);
          if (open && !mentionOpen)
            mentionOffset.current =
              (target === "chat" ? inputRef.current : boardInputRef.current)
                ?.selectionStart ?? input.length;
        }}
        onValueChange={insertMention}
        value=""
      >
        <SelectTrigger
          size="sm"
          aria-label="Упомянуть участника или выбрать сервис"
          className="pointer-events-none absolute bottom-2 left-3 size-px border-0 p-0 opacity-0"
          tabIndex={-1}
        >
          <span aria-hidden="true">@</span>
        </SelectTrigger>
        <SelectContent position="popper" side="top">
          <SelectGroup>
            <SelectLabel>Участники · назначение в задаче без уведомления</SelectLabel>
            {members.length ? (
              members.map((member) => (
                <SelectItem key={member.id} value={member.id}>
                  <UserRound /> {member.name}
                </SelectItem>
              ))
            ) : (
              <SelectItem value="no-members" disabled>
                Нет участников
              </SelectItem>
            )}
          </SelectGroup>
          <SelectGroup>
            <SelectLabel>Сервисы · просмотр</SelectLabel>
            <SelectItem value="disk">Яндекс Диск — файлы</SelectItem>
            <SelectItem value="calendar">Яндекс Календарь — календари</SelectItem>
            <SelectItem value="mail">Яндекс Почта — последние письма</SelectItem>
            <SelectItem value="telemost">
              <Video /> Яндекс Телемост — вставить ссылку
            </SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    );
  }
  function chooseProject(id: string) {
    setProject(id);
    setView("board");
    setOpenMobile(false);
  }
  function closeChat(open: boolean) {
    setChatOpen(open);
    if (!open) {
      voice.current?.stop();
      recording.current?.cancel();
      recording.current = undefined;
      setRecordingStatus("off");
    }
  }
  const errorPanel =
    error && state ? (
      <Alert variant="destructive">
        <CircleAlert />
        <AlertTitle>Действие не подтверждено</AlertTitle>
        <AlertDescription>
          {error}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                retry.current ? void perform(retry.current) : void load()
              }
            >
              <RefreshCw data-icon="inline-start" />
              Повторить
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setError("")}>
              Закрыть
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    ) : null;
  const confirmation =
    state?.pending &&
    ["delete", "past", "conflict"].includes(state.pending.type)
      ? state.pending
      : undefined;
  return (
    <>
      <Sidebar collapsible="offcanvas">
        <SidebarHeader className="px-4 py-5 group-data-[collapsible=icon]:px-2">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-11 shrink-0 bg-primary group-data-[collapsible=icon]:hidden"
              style={{
                maskImage: "url('/callme-logo-v2.png')",
                maskPosition: "center",
                maskRepeat: "no-repeat",
                maskSize: "contain",
              }}
            />
            <p className="text-lg font-semibold tracking-tight group-data-[collapsible=icon]:hidden">CallMe</p>
            <SidebarTrigger
              className="ml-auto shrink-0 group-data-[collapsible=icon]:mx-auto"
              aria-label={sidebarState === "collapsed" && !isMobile ? "Открыть меню" : "Скрыть меню"}
              aria-expanded={isMobile ? openMobile : sidebarState !== "collapsed"}
            />
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={view === "board"}
                  onClick={() => navigate("board")}
                >
                  <Columns3 />
                  <span>Доска задач</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={view === "events"}
                  onClick={() => navigate("events")}
                >
                  <CalendarDays />
                  <span>Планы и встречи</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel>Мои проекты</SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={project === "all"}
                  onClick={() => chooseProject("all")}
                >
                  <Columns3 />
                  <span>Все проекты</span>
                  <Badge variant="secondary" className="ml-auto group-data-[collapsible=icon]:hidden">
                    {state?.events.length || 0}
                  </Badge>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={project === "none"}
                  onClick={() => chooseProject("none")}
                >
                  <Folder />
                  <span>Без проекта</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {projects.map((p) => (
                <SidebarMenuItem key={p.id}>
                  <SidebarMenuButton
                    isActive={project === p.id}
                    onClick={() => chooseProject(p.id)}
                  >
                    <Folder />
                    <span className="truncate">{p.name}</span>
                    <span className="ml-auto text-xs group-data-[collapsible=icon]:hidden">
                      {state?.events.filter((e) => e.projectId === p.id)
                        .length || 0}
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              <SidebarMenuItem>
                <SidebarMenuButton
                  disabled={!state || busy || readOnly}
                  onClick={() => {
                    setProjectOpen(true);
                    setOpenMobile(false);
                    setProjectInvalid(false);
                  }}
                >
                  <Plus />
                  <span>Новый проект</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="p-3 group-data-[collapsible=icon]:p-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => {
                  setSettingsTab("team");
                  setSettings(true);
                  setOpenMobile(false);
                }}
              >
                <Settings2 />
                <span>Настройки и сервисы</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={() => setHelp(true)}>
                <CircleHelp />
                <span>Как пользоваться</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <Separator />
          <div className="flex items-center gap-2 p-2">
            <Avatar className="size-8">
              <AvatarFallback>Я</AvatarFallback>
            </Avatar>
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <p className="text-sm truncate">
                {state?.account?.team.name || "Личное пространство"}
              </p>
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="h-dvh min-w-0 overflow-hidden">
        <header className="flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {(isMobile || sidebarState === "collapsed") && (
              <SidebarTrigger
                aria-label="Открыть меню"
                aria-expanded={isMobile ? openMobile : false}
              />
            )}
            <Select value={project} onValueChange={chooseProject}>
              <SelectTrigger
                aria-label="Выбрать проект"
                className="w-36 sm:w-56"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">Все проекты</SelectItem>
                  <SelectItem value="none">Без проекта</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label="Начать голосовой разговор с доски"
              disabled={!state || busy || readOnly}
              onClick={() => {
                setChatOpen(true);
                void toggleVoice();
              }}
            >
              <Mic />
            </Button>
            <Button disabled={!state || busy || readOnly} onClick={newEvent}>
              <Plus data-icon="inline-start" />
              <span className="hidden sm:inline">Новая запись</span>
              <span className="sm:hidden">Создать</span>
            </Button>
          </div>
        </header>
        {loading ? (
          <main
            aria-label="Загрузка"
            className="flex flex-1 flex-col gap-5 p-6"
          >
            <Skeleton className="h-12 w-1/2" />
            <div className="grid grid-cols-3 gap-4">
              <Skeleton className="h-72" />
              <Skeleton className="h-72" />
              <Skeleton className="h-72" />
            </div>
          </main>
        ) : !state ? (
          <main className="p-6">
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>Не удалось открыть пространство</AlertTitle>
              <AlertDescription>
                {error}
                <Button variant="outline" onClick={() => void load()}>
                  Повторить загрузку
                </Button>
              </AlertDescription>
            </Alert>
          </main>
        ) : (
          <>
            <main
              className={cn(
                "flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4 pb-36 sm:p-6 sm:pb-36",
              )}
            >
              {view === "events" && (
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h1 className="text-2xl font-semibold tracking-tight">
                      Планы и встречи
                    </h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {projectNameLabel} · Задачи, встречи и напоминания
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="hidden sm:inline-flex"
                    onClick={() => {
                      setSettingsTab("services");
                      setSettings(true);
                    }}
                  >
                    <Link2 data-icon="inline-start" />
                    Сервисы
                  </Button>
                </div>
              )}
              {!chatOpen && errorPanel}
              {view === "board" ? (
                <KanbanBoard
                  key={`${state.account?.team.id}:${project}`}
                  events={visibleEvents}
                  projects={projects}
                  members={members}
                  readOnly={readOnly}
                  today={today}
                  open={openEvent}
                  create={newEvent}
                  action={action}
                  busy={busy}
                  composerInset
                />
              ) : (
                <EventList
                  key={`${state.account?.team.id}:${project}`}
                  readOnly={readOnly}
                  events={visibleEvents}
                  today={today}
                  open={openEvent}
                  create={newEvent}
                />
              )}
            </main>
            {chatOpen && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-4 pb-3 sm:px-6">
      <section aria-label="Разговор с ассистентом" className="pointer-events-auto flex h-[min(70dvh,40rem)] max-h-[calc(100dvh-5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border bg-background shadow-lg">
          <div className="flex justify-end px-3 pt-2">
            <Button variant="ghost" size="icon-sm" aria-label="Свернуть чат" onClick={() => closeChat(false)}><ChevronDown /></Button>
          </div>
          {state && (
            <div className="flex min-h-0 flex-1 flex-col">
              <MessageScrollerProvider autoScroll defaultScrollPosition="end">
                <MessageScroller className="flex-1">
                  <MessageScrollerViewport>
                    <MessageScrollerContent className="mx-auto max-w-3xl px-4 py-4">
                      {!state.messages.length && (
                        <MessageScrollerItem messageId="welcome">
                          <div className="mx-auto flex max-w-xl flex-col gap-5 py-3">
                            <div className="flex flex-col items-start gap-5">
                              <Avatar className="size-10">
                                <AvatarFallback>
                                  <AudioLines className="size-7" />
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <Badge variant="secondary">
                                  Меньше держать в голове
                                </Badge>
                                <h2 className="mt-4 text-2xl font-semibold tracking-tight">
                                  С чего начнём?
                                </h2>
                                <p className="mt-3 max-w-md text-base leading-relaxed text-muted-foreground">
                                  Расскажите о планах. Я помогу записать дело,
                                  назначить встречу или найти то, что вы уже
                                  запланировали.
                                </p>
                              </div>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                              {examples.map((x) => (
                                <Card key={x.title} size="sm">
                                  <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                      <x.icon />
                                      {x.title}
                                    </CardTitle>
                                    <CardDescription>
                                      {x.description}
                                    </CardDescription>
                                  </CardHeader>
                                  <CardFooter>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="w-full justify-between"
                                      onClick={() => suggest(x.text)}
                                    >
                                      Попробовать
                                      <ArrowUpRight data-icon="inline-end" />
                                    </Button>
                                  </CardFooter>
                                </Card>
                              ))}
                            </div>
                          </div>
                        </MessageScrollerItem>
                      )}
                      {state.messages.map((m) => (
                        <MessageScrollerItem
                          key={m.id}
                          messageId={m.id}
                          scrollAnchor={m.role === "user"}
                        >
                          <Message align={m.role === "user" ? "end" : "start"}>
                            {m.role === "assistant" && (
                              <MessageAvatar>
                                <Avatar>
                                  <AvatarFallback>
                                    <AudioLines />
                                  </AvatarFallback>
                                </Avatar>
                              </MessageAvatar>
                            )}
                            <MessageContent>
                              <MessageHeader>
                                {m.role === "user" ? "Вы" : "CallMe"}
                              </MessageHeader>
                              <Bubble
                                align={m.role === "user" ? "end" : "start"}
                                variant={
                                  m.role === "user" ? "secondary" : "ghost"
                                }
                              >
                                <BubbleContent>{m.text}</BubbleContent>
                              </Bubble>
                              {m.attachment && (
                                <Button asChild variant="outline" size="sm">
                                  <a
                                    href={`/api/attachments/${encodeURIComponent(m.attachment.id)}`}
                                  >
                                    <Paperclip data-icon="inline-start" />
                                    {m.attachment.name} ·{" "}
                                    {Math.ceil(m.attachment.size / 1024)} КБ
                                  </a>
                                </Button>
                              )}
                              {m.events?.length ? (
                                <ItemGroup>
                                  {m.events.map((e, i) => (
                                    <Item
                                      key={e.id}
                                      variant="outline"
                                      size="sm"
                                    >
                                      <ItemContent className="min-w-0">
                                        <ItemTitle className="line-clamp-none break-words">
                                          {i + 1}. {e.title}
                                        </ItemTitle>
                                        <ItemDescription>
                                          {eventDate(e)}
                                          {e.duration
                                            ? ` · ${e.duration} мин`
                                            : ""}
                                        </ItemDescription>
                                        {e.inferred && (
                                          <div>
                                            <Badge variant="outline">
                                              Тип предположен
                                            </Badge>
                                          </div>
                                        )}
                                      </ItemContent>
                                      <ItemActions>
                                        <Button
                                          variant="ghost"
                                          size="icon-sm"
                                          aria-label={`Выбрать результат ${i + 1}: ${e.title}`}
                                          disabled={
                                            busy ||
                                            !state.events.some(
                                              (current) => current.id === e.id,
                                            )
                                          }
                                          onClick={() =>
                                            void action({
                                              action: "select",
                                              id: e.id,
                                            })
                                          }
                                        >
                                          <ArrowUpRight />
                                        </Button>
                                      </ItemActions>
                                    </Item>
                                  ))}
                                </ItemGroup>
                              ) : null}
                            </MessageContent>
                          </Message>
                        </MessageScrollerItem>
                      ))}
                      {busy && (
                        <MessageScrollerItem messageId="pending">
                          <p
                            role="status"
                            className="text-sm text-muted-foreground"
                          >
                            Обрабатываю запрос…
                          </p>
                        </MessageScrollerItem>
                      )}
                    </MessageScrollerContent>
                  </MessageScrollerViewport>
                  <MessageScrollerButton aria-label="К последнему сообщению" />
                </MessageScroller>
              </MessageScrollerProvider>
              <div className="mx-auto flex w-full max-w-3xl shrink-0 flex-col gap-3 px-4 pb-4 pt-2 sm:px-4 sm:pb-4">
                {(state.pending || fileDraft || voiceError || serviceResult || mailPreview || recordingStatus !== "off") && <div className="flex max-h-[min(35dvh,18rem)] flex-col gap-3 overflow-y-auto overscroll-contain">
                {state.pending &&
                  ["draft", "choose", "speech"].includes(
                    state.pending.type,
                  ) && (
                    <Alert>
                      <CircleHelp />
                      <AlertTitle>
                        {state.pending.type === "speech"
                          ? "Проверьте распознанный текст"
                          : "Нужно уточнение"}
                      </AlertTitle>
                      <AlertDescription>
                        <p>
                          {state.pending.type === "speech"
                            ? state.pending.text
                            : state.messages.at(-1)?.text}
                        </p>
                        {state.pending.type === "speech" && voiceStatus !== "off" && <p>Скажите «да, верно» или подтвердите кнопкой.</p>}
                        <div className="mt-2 flex flex-wrap gap-2">
                          {state.pending.type === "speech" && (
                            <Button
                              size="sm"
                              disabled={busy}
                              onClick={() =>
                                void action({
                                  action: "confirm",
                                  token: state.pending?.token,
                                })
                              }
                            >
                              <Check data-icon="inline-start" />
                              Текст верный
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => void action({ action: "cancel" })}
                          >
                            Отменить
                          </Button>
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}
                {fileDraft && (
                  <Alert>
                    <Paperclip />
                    <AlertTitle>Файл готов к отправке</AlertTitle>
                    <AlertDescription>
                      <p>
                        {fileDraft.name} · {Math.ceil(fileDraft.size / 1024)} КБ
                      </p>
                      <p>
                        Файл будет сохранён в истории чата; содержимое не
                        анализируется.
                      </p>
                      <div className="mt-2 flex gap-2">
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => void uploadFile()}
                        >
                          Отправить файл
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => setFileDraft(null)}
                        >
                          Убрать
                        </Button>
                      </div>
                    </AlertDescription>
                  </Alert>
                )}
                {voiceError && (
                  <Alert variant="destructive">
                    <Mic />
                    <AlertDescription>{voiceError}</AlertDescription>
                  </Alert>
                )}
                {serviceResult && (
                  <Alert>
                    <Link2 />
                    <AlertTitle>{serviceResult.title}</AlertTitle>
                    <AlertDescription>
                      {serviceResult.disk ? <>
                        <p>{state?.selected && state.events.find((event) => event.id === state.selected) ? `Выбрана запись: ${state.events.find((event) => event.id === state.selected)?.title}.` : "Выберите карточку задачи, затем прикрепите нужный материал."} Доступ определяется настройками Яндекс Диска.</p>
                        <div className="max-h-44 overflow-y-auto">
                        {serviceResult.disk.items.map((item, i) => <div key={`${item.path || item.name || "item"}-${i}`} className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="min-w-0 flex-1 break-words">{item.type === "dir" ? "Папка" : "Файл"}: {item.name || "Без названия"}</span>
                          {item.type === "dir" && item.path && <Button size="sm" variant="outline" disabled={busy} onClick={() => void browseDisk(item.path!)}>Открыть</Button>}
                          {item.url && <Button size="sm" variant="outline" disabled={busy || readOnly || !state?.selected} onClick={() => void attachDiskLink(item)}>Прикрепить</Button>}
                        </div>)}
                        </div>
                        {!serviceResult.disk.items.length && <p>Папка пуста.</p>}
                        <div className="mt-2 flex flex-wrap gap-2">
                          {serviceResult.disk.path !== "disk:/" && <Button size="sm" variant="outline" disabled={busy} onClick={() => { const segments = serviceResult.disk!.path.slice(6).split("/").filter(Boolean); segments.pop(); void browseDisk("disk:/" + segments.join("/")); }}>Вверх</Button>}
                          {serviceResult.disk.offset > 0 && <Button size="sm" variant="outline" disabled={busy} onClick={() => void browseDisk(serviceResult.disk!.path, Math.max(0, serviceResult.disk!.offset - 20))}>Назад</Button>}
                          {serviceResult.disk.offset + serviceResult.disk.items.length < serviceResult.disk.total && <Button size="sm" variant="outline" disabled={busy} onClick={() => void browseDisk(serviceResult.disk!.path, serviceResult.disk!.offset + 20)}>Ещё</Button>}
                        </div>
                      </> : serviceResult.mail ? <>
                        <p>{state?.selected && state.events.find((event) => event.id === state.selected) ? `Выбрана запись: ${state.events.find((event) => event.id === state.selected)?.title}.` : "Выберите карточку задачи, затем письмо."} Ссылка откроется только владельцу подключённого ящика.</p>
                        <div className="max-h-44 overflow-y-auto">
                          {serviceResult.mail.map((message) => <div key={message.url} className="mt-2 flex flex-wrap items-center gap-2">
                            <span className="min-w-0 flex-1 break-words">{message.unseen ? "Непрочитано · " : ""}{message.from}: {message.subject}{message.date ? ` · ${new Date(message.date).toLocaleDateString("ru-RU")}` : ""}</span>
                            <Button asChild size="sm" variant="outline"><a href={message.url} target="_blank" rel="noreferrer">Открыть</a></Button>
                            <Button size="sm" variant="outline" disabled={busy || readOnly || !state?.selected} onClick={() => void attachMailLink(message)}>Прикрепить</Button>
                            <Button size="sm" variant="outline" disabled={busy || readOnly || !state?.selected} onClick={() => void previewMailContent(message)}>Перенести текст</Button>
                          </div>)}
                        </div>
                        {!serviceResult.mail.length && <p>Входящих писем нет.</p>}
                      </> : serviceResult.lines.length ? <div className="max-h-44 overflow-y-auto">{serviceResult.lines.map((line, i) => <p key={i} className="break-words">{line}</p>)}</div> : <p>Нет элементов.</p>}
                      <Button className="mt-2" size="sm" variant="outline" onClick={() => setServiceResult(undefined)}>Закрыть</Button>
                    </AlertDescription>
                  </Alert>
                )}
                {mailPreview && (
                  <Alert>
                    <Mail />
                    <AlertTitle>Текст письма для задачи «{mailPreview.title}»</AlertTitle>
                    <AlertDescription>
                      <p>Письмо: {mailPreview.subject}. Выберите или исправьте нужный текст. После сохранения он будет виден участникам команды в описании задачи.</p>
                      <Textarea aria-label="Текст письма для переноса" className="mt-2 max-h-40 min-h-24" value={mailPreview.text} onChange={(event) => setMailPreview({ ...mailPreview, text: event.target.value })} />
                      <div className="mt-2 flex gap-2"><Button size="sm" disabled={busy} onClick={() => void saveMailContent()}>Добавить в описание</Button><Button size="sm" variant="outline" onClick={() => setMailPreview(undefined)}>Отменить</Button></div>
                    </AlertDescription>
                  </Alert>
                )}
                {recordingStatus !== "off" && (
                  <Alert>
                    <Mic />
                    <AlertTitle role="status">{recordingStatus === "starting" ? "Включаю микрофон" : recordingStatus === "recording" ? "Идёт запись" : "Распознаю запись"}</AlertTitle>
                    <AlertDescription>
                      <p>До 20 секунд. Распознанный текст появится в поле ввода — проверьте его перед отправкой.</p>
                      <div className="mt-2 flex gap-2">
                        {recordingStatus === "recording" && <Button size="sm" onClick={() => void finishRecording()}>Завершить запись</Button>}
                        <Button size="sm" variant="outline" onClick={() => { recording.current?.cancel(); recording.current = undefined; setRecordingStatus("off"); }}>Отменить</Button>
                      </div>
                    </AlertDescription>
                  </Alert>
                )}
                </div>}
                <span className="sr-only" role="status">{voiceStatus === "listening" ? "Слушаю вас" : voiceStatus === "processing" ? "Распознаю речь" : voiceStatus === "speaking" ? "Озвучиваю ответ" : ""}</span>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submit();
                  }}
                >
                  <FieldGroup>
                    <Field>
                      <FieldLabel className="sr-only" htmlFor="chat-input">
                        Сообщение ассистенту
                      </FieldLabel>
                      <InputGroup>
                        <InputGroupTextarea
                          id="chat-input"
                          ref={inputRef}
                          placeholder="Напишите, что нужно сделать…"
                          value={input}
                          maxLength={2000}
                          rows={2}
                          className="max-h-32 min-h-20"
                          onChange={(e) =>
                            updateInput(
                              e.target.value,
                              e.target.selectionStart,
                              "chat",
                            )
                          }
                          onKeyDown={(e) => {
                            if (
                              e.key === "Enter" &&
                              !e.shiftKey &&
                              !e.nativeEvent.isComposing
                            ) {
                              e.preventDefault();
                              void submit();
                            }
                          }}
                        />
                        <InputGroupAddon align="block-end">
                          <InputGroupButton
                            type="button"
                            aria-label="Прикрепить файл"
                            onClick={() => pickFile()}
                            disabled={busy}
                          >
                            <Paperclip />
                          </InputGroupButton>
                          <InputGroupButton
                            type="button"
                            aria-label="Сделать фотографию"
                            onClick={() => pickFile(true)}
                            disabled={busy}
                          >
                            <Camera />
                          </InputGroupButton>
                          <InputGroupButton type="button" aria-label="Записать голосовое сообщение" onClick={() => void startRecording()} disabled={busy || recordingStatus !== "off" || voiceStatus !== "off"}>
                            <Mic />
                          </InputGroupButton>
                          {mentionPicker("chat")}
                          <InputGroupButton
                            type="button"
                            variant="default"
                            size="icon-sm"
                            className="ml-auto rounded-full"
                            disabled={(busy && voiceStatus === "off") || recordingStatus !== "off"}
                            aria-label={
                              voiceStatus !== "off"
                                ? "Остановить голосовой разговор"
                                : input.trim()
                                  ? "Отправить сообщение"
                                  : "Начать голосовой разговор"
                            }
                            onClick={() => {
                              if (voiceStatus !== "off") {
                                void toggleVoice();
                                return;
                              }
                              if (input.trim()) {
                                void submit();
                                return;
                              }
                              void toggleVoice();
                            }}
                          >
                            {voiceStatus !== "off" ? (
                              <Square />
                            ) : input.trim() ? (
                              <ArrowUp />
                            ) : (
                              <AudioLines />
                            )}
                          </InputGroupButton>
                        </InputGroupAddon>
                      </InputGroup>
                    </Field>
                  </FieldGroup>
                </form>
              </div>

              {errorPanel && <div className="px-4 pb-3">{errorPanel}</div>}
            </div>
          )}
      </section>
              </div>
            )}
            {!chatOpen && <footer className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-4 pb-3 sm:px-6">
              <form
                className="pointer-events-auto w-full max-w-2xl"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submit();
                }}
              >
                <InputGroup className="rounded-3xl bg-background shadow-sm transition-transform duration-200 focus-within:scale-[1.015] motion-reduce:transition-none">
                  <InputGroupTextarea
                    ref={boardInputRef}
                    aria-label="Сообщение ассистенту на доске"
                    placeholder="Напишите, что нужно сделать…"
                    value={input}
                    maxLength={2000}
                    rows={1}
                    className="min-h-9 transition-[min-height] duration-200 focus:min-h-16 motion-reduce:transition-none"
                    onChange={(event) =>
                      updateInput(
                        event.target.value,
                        event.target.selectionStart,
                        "board",
                      )
                    }
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" &&
                        !event.shiftKey &&
                        !event.nativeEvent.isComposing
                      ) {
                        event.preventDefault();
                        void submit();
                      }
                    }}
                  />
                  <InputGroupAddon align="block-end">
                    <InputGroupButton
                      type="button"
                      aria-label="Прикрепить файл"
                      onClick={() => pickFile()}
                      disabled={busy}
                    >
                      <Plus />
                    </InputGroupButton>
                    <InputGroupButton type="button" aria-label="Записать голосовое сообщение" onClick={() => void startRecording()} disabled={busy || recordingStatus !== "off" || voiceStatus !== "off"}>
                      <Mic />
                    </InputGroupButton>
                    {mentionPicker("board")}
                    <InputGroupButton
                      type="button"
                      variant="default"
                      size="icon-sm"
                      className="ml-auto rounded-full"
                      aria-label={
                        voiceStatus !== "off"
                          ? "Остановить голосовой разговор"
                          : input.trim()
                            ? "Отправить сообщение"
                            : "Начать голосовой разговор"
                      }
                      disabled={busy && voiceStatus === "off"}
                      onClick={() => {
                        if (voiceStatus !== "off") {
                          void toggleVoice();
                          return;
                        }
                        if (input.trim()) {
                          void submit();
                          return;
                        }
                        setChatOpen(true);
                        void toggleVoice();
                      }}
                    >
                      {voiceStatus !== "off" ? (
                        <Square />
                      ) : input.trim() ? (
                        <ArrowUp />
                      ) : (
                        <AudioLines />
                      )}
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
              </form>
            </footer>}
            <p className="sr-only" role="status">
              {state.messages.at(-1)?.text}
            </p>
          </>
        )}
      </SidebarInset>
      <input
        ref={fileRef}
        type="file"
        className="sr-only"
        tabIndex={-1}
        aria-label="Выбрать файл"
        onChange={(event) => {
          setFileDraft(event.target.files?.[0] || null);
          event.target.value = "";
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-label="Сделать фотографию"
        onChange={(event) => {
          setFileDraft(event.target.files?.[0] || null);
          event.target.value = "";
        }}
      />
      <Dialog
        open={projectOpen}
        onOpenChange={(open) => {
          if (!busy) setProjectOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новый проект</DialogTitle>
            <DialogDescription>
              Объедините связанные задачи и встречи на одной доске.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setProjectInvalid(!projectName.trim());
              if (!projectName.trim()) return;
              const command: Command = {
                action: "createProject",
                title: projectName.trim(),
              };
              const next = await perform(
                retry.current?.command &&
                  JSON.stringify(retry.current.command) ===
                    JSON.stringify(command)
                  ? retry.current
                  : { requestId: crypto.randomUUID(), command },
              );
              if (next) {
                const created = next.projects?.find(
                  (p) => p.name === projectName.trim(),
                );
                if (created) chooseProject(created.id);
                setProjectOpen(false);
                setProjectName("");
              }
            }}
          >
            <FieldGroup>
              <Field data-invalid={projectInvalid}>
                <FieldLabel htmlFor="project-name">
                  Название проекта *
                </FieldLabel>
                <Input
                  id="project-name"
                  autoFocus
                  maxLength={80}
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  aria-invalid={projectInvalid}
                />
                {projectInvalid && (
                  <FieldError>Введите название проекта.</FieldError>
                )}
              </Field>
              {errorPanel}
              <Button type="submit" disabled={busy}>
                {busy ? "Создание…" : "Создать проект"}
              </Button>
            </FieldGroup>
          </form>
        </DialogContent>
      </Dialog>
      <SettingsPanel
        open={settings}
        onOpenChange={setSettings}
        voiceAvailable={state?.voiceAvailable || false}
        microphoneSensitivity={microphoneSensitivity}
        onMicrophoneSensitivityChange={(value) => { setMicrophoneSensitivity(value); try { localStorage.setItem("callme-microphone-sensitivity", value); } catch { setVoiceError("Настройка микрофона применена только до закрытия страницы."); } }}
        account={state?.account}
        mutate={accountAction}
        busy={busy}
        onAuth={openAuth}
        tab={settingsTab}
        key={`${settings}:${settingsTab}`}
      />
      <InviteDialog
        key={inviteToken || "none"}
        token={inviteToken}
        signedIn={!!state?.account?.user}
        onAuth={openAuth}
        onClose={clearInvite}
        mutate={accountAction}
        busy={busy}
        authOpen={!!authMode}
      />
      <AuthDialog
        mode={authMode}
        onMode={setAuthMode}
        onClose={() => setAuthMode(null)}
        mutate={accountAction}
        busy={busy}
        inviteToken={inviteToken || undefined}
        onJoined={clearInvite}
      />
      {editor && (
        <EventEditor
          key={editor === "new" ? "new" : editor.id}
          event={editor}
          projects={projects}
          members={members}
          readOnly={readOnly}
          projectId={currentProjectId}
          onClose={() => setEditor(null)}
          onAction={action}
          busy={busy}
          error={error}
        />
      )}
      <AlertDialog open={!!confirmation}>
        <AlertDialogContent className="max-h-[85dvh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmation?.type === "delete"
                ? "Удалить эту запись?"
                : confirmation?.type === "past"
                  ? "Дата уже прошла"
                  : "Встречи пересекаются"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {state?.messages.at(-1)?.text}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {(confirmation?.target || confirmation?.draft) && (
            <p className="text-sm font-medium break-words">
              {(confirmation.target || confirmation.draft)?.title}
              <br />
              <span className="font-normal text-muted-foreground">
                {eventDate((confirmation.target || confirmation.draft)!)}
              </span>
            </p>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void action({ action: "cancel" });
              }}
            >
              Отмена
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              variant={
                confirmation?.type === "delete" ? "destructive" : "default"
              }
              onClick={(e) => {
                e.preventDefault();
                void action({ action: "confirm", token: confirmation?.token });
              }}
            >
              {confirmation?.type === "delete"
                ? "Да, удалить"
                : "Всё равно сохранить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Просто расскажите о планах</DialogTitle>
            <DialogDescription>
              Начните с примера, затем отредактируйте сообщение.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {examples.map((x) => (
              <Button
                key={x.title}
                variant="outline"
                className="h-auto justify-start whitespace-normal py-3 text-left"
                onClick={() => suggest(x.text)}
              >
                {x.text}
              </Button>
            ))}
          </div>
          <Separator />
          <p className="text-sm text-muted-foreground">
            После выбора записи: «Перенеси её на завтра», «Отметь её
            выполненной», «Удали её». Удаление всегда требует подтверждения.
          </p>
          <Alert>
            <Sparkles />
            <AlertTitle>
              {state?.mode === "yandex"
                ? "YandexGPT подключён"
                : "Работает локальный режим"}
            </AlertTitle>
            <AlertDescription>
              Локальные команды и поиск по словам доступны без внешних сервисов.
              Для свободного диалога и голоса требуется подключение Yandex на
              сервере. Напоминания не отправляют уведомления.
            </AlertDescription>
          </Alert>
          <p className="text-xs text-muted-foreground">
            Резерв API: {state?.reservedRub || 0} из {state?.budgetRub || 1000}{" "}
            ₽. Это оценка по настройкам сервера, не счёт провайдера. Данные и
            история сохраняются на сервере. В аккаунт можно войти с другого
            устройства; доступ к гостевому пространству зависит от cookie.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
