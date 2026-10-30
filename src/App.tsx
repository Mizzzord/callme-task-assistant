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
  VolumeX,
  CircleAlert,
  Sparkles,
  Clock3,
  Check,
  RefreshCw,
  Columns3,
  Folder,
  Settings2,
  Link2,
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
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
import type { VoiceStatus } from "@/lib/voice";
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
  const [voiceError, setVoiceError] = useState("");
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
      retry.current = undefined;
      voice.current?.stop();
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
  async function submit(text = input) {
    if (!text.trim()) return;
    setChatOpen(true);
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
      async (text) => {
        const next = await perform({
          requestId: crypto.randomUUID(),
          text,
          projectId: currentProjectId,
          source: "voice",
          uncertain: true,
        });
        return next?.messages.at(-1)?.id;
      },
      setVoiceError,
    );
    await voice.current.start();
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
            <SelectLabel>Участники · вставка имени без уведомления</SelectLabel>
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
            <SelectLabel>Сервисы · вставка ссылки</SelectLabel>
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
    if (!open) voice.current?.stop();
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
      <Sidebar collapsible="icon">
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
            {isMobile && (
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
                "flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4 sm:p-6",
                "pb-36 sm:pb-36",
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
              {errorPanel}
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
            <footer className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-4 pb-3 sm:px-6">
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
                  <InputGroupAddon
                    align="block-end"
                    className="justify-between"
                  >
                    <InputGroupButton
                      type="button"
                      aria-label="Прикрепить файл"
                      onClick={() => pickFile()}
                      disabled={busy}
                    >
                      <Plus />
                    </InputGroupButton>
                    {mentionPicker("board")}
                    <InputGroupButton
                      type="button"
                      variant="default"
                      size="icon-sm"
                      className="rounded-full"
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
            </footer>
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
      <Sheet open={chatOpen} onOpenChange={closeChat}>
        <SheetContent className="data-[side=right]:w-full data-[side=right]:sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <AudioLines />
              CallMe — ваш ассистент
            </SheetTitle>
            <SheetDescription>
              Новые записи:{" "}
              {currentProjectId ? projectNameLabel : "без проекта"}. Поиск по
              всему пространству.
            </SheetDescription>
          </SheetHeader>
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
                {voiceStatus !== "off" && (
                  <Alert>
                    <AudioLines />
                    <AlertTitle role="status">
                      {
                        {
                          listening: "Слушаю вас",
                          processing: "Распознаю речь",
                          speaking: "Озвучиваю ответ",
                          off: "",
                        }[voiceStatus]
                      }
                    </AlertTitle>
                    <AlertDescription>
                      <p>Говорите короткими фразами. Можно перебить ответ.</p>
                      <div className="mt-2 flex gap-2">
                        {voiceStatus === "speaking" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              voice.current?.interrupt();
                              setVoiceStatus("listening");
                            }}
                          >
                            <VolumeX data-icon="inline-start" />
                            Перебить
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => voice.current?.stop()}
                        >
                          <Square data-icon="inline-start" />
                          Завершить разговор
                        </Button>
                      </div>
                    </AlertDescription>
                  </Alert>
                )}
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
                        <InputGroupAddon
                          align="block-end"
                          className="justify-between"
                        >
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
                          {mentionPicker("chat")}
                          <InputGroupButton
                            type="button"
                            variant="default"
                            size="icon-sm"
                            className="ml-auto rounded-full"
                            disabled={busy && voiceStatus === "off"}
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
                <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
                  {state.mode === "local"
                    ? "Локальный режим · ограниченный набор текстовых команд. Голос ещё не подключён."
                    : "Отвечает на основе ваших записей · время по Москве"}
                  <br />
                  Напоминания сохраняются без отправки уведомлений.
                </p>
              </div>

              {errorPanel && <div className="px-4 pb-3">{errorPanel}</div>}
            </div>
          )}
        </SheetContent>
      </Sheet>
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
