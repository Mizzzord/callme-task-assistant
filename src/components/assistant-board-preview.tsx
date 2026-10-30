import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUp,
  ArrowUpRight,
  AudioLines,
  Info,
  LayoutGrid,
  MessageCircle,
  Moon,
  Sun,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
  InputGroupButton,
} from "@/components/ui/input-group";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
} from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  SidebarProvider,
  Sidebar,
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
} from "@/components/ui/sidebar";
import { KanbanBoard } from "@/components/kanban-board";
import { Chat, type ChatLine } from "@/components/assistant-gallery";
import { eventDate, priorityNames } from "@/lib/events";
import type { CalendarEvent, TeamMember } from "@/types";

const members: TeamMember[] = [
  {
    id: "preview-anna",
    name: "Анна",
    email: "anna@example.invalid",
    role: "member",
    revision: 1,
  },
  {
    id: "preview-max",
    name: "Максим",
    email: "max@example.invalid",
    role: "member",
    revision: 1,
  },
];
const taskSeeds: Pick<
  CalendarEvent,
  "id" | "title" | "description" | "status" | "priority" | "assigneeId"
>[] = [
  {
    id: "preview-1",
    title: "Подготовить запуск CallMe",
    description:
      "Собрать материалы, проверить сценарий презентации и согласовать дату запуска.",
    status: "todo",
    priority: "high",
    assigneeId: "preview-anna",
  },
  {
    id: "preview-2",
    title: "Согласовать презентацию",
    description: "Проверить структуру и обсудить финальную версию с командой.",
    status: "todo",
    priority: "normal",
    assigneeId: "preview-max",
  },
  {
    id: "preview-3",
    title: "Собрать обратную связь",
    description:
      "Посмотреть, что понравилось первым пользователям и что стоит улучшить.",
    status: "in_progress",
    priority: "normal",
    assigneeId: "preview-anna",
  },
  {
    id: "preview-4",
    title: "Проверить сценарий встречи",
    description: "Пройти основные шаги и составить короткий список вопросов.",
    status: "in_progress",
    priority: "low",
    assigneeId: "preview-max",
  },
  {
    id: "preview-5",
    title: "Обсудить план с командой",
    description: "Определить приоритеты и договориться о следующих шагах.",
    status: "done",
    priority: "normal",
    assigneeId: "preview-max",
  },
];
const tasks: CalendarEvent[] = taskSeeds.map((task, index) => ({
  ...task,
  kind: "task",
  projectId: "preview-project",
  date: "2026-10-30",
  time: null,
  duration: null,
  completed: task.status === "done",
  inferred: false,
  revision: 1,
  createdAt: `2026-10-29T10:0${5 - index}:00Z`,
  updatedAt: "2026-10-29T10:00:00Z",
}));
const projects = [{ id: "preview-project", name: "Запуск CallMe" }];

const concepts = [
  {
    id: "dock",
    label: "1 · По центру",
    title: "Помощник рядом",
    description:
      "Кнопка по центру снизу. Чат пристыкован справа, доска сужается и остаётся доступной.",
  },
  {
    id: "float",
    label: "2 · В углу",
    title: "Лёгкое окно",
    description:
      "Кнопка внизу справа. Компактный чат парит над доской, не меняя её ширину.",
  },
  {
    id: "bar",
    label: "3 · Строка",
    title: "Начать с вопроса",
    description:
      "Широкая строка снизу приглашает к разговору. Просторная панель выезжает справа поверх доски.",
  },
] as const;
type ConceptId = (typeof concepts)[number]["id"];
function isConcept(value: string | null): value is ConceptId {
  return concepts.some((concept) => concept.id === value);
}
function readChoice(): ConceptId | null {
  try {
    const value = localStorage.getItem("callme-assistant-board-choice");
    return value === "yes" ? "dock" : isConcept(value) ? value : null;
  } catch {
    return null;
  }
}

export function AssistantBoardPreview() {
  const [selected, setSelected] = useState<ConceptId | null>(readChoice);
  const [concept, setConcept] = useState<ConceptId>(
    () => readChoice() ?? "dock",
  );

  const [open, setOpen] = useState(false);
  const [boardTasks, setBoardTasks] = useState(tasks);
  const [newId, setNewId] = useState<string | null>(null);
  const [pendingTitle, setPendingTitle] = useState("");
  const [pendingDate, setPendingDate] = useState("");
  const [pendingTime, setPendingTime] = useState("");
  const [compact, setCompact] = useState(
    () => window.matchMedia("(max-width: 1023px)").matches,
  );
  const [dark, setDark] = useState(false);
  const [details, setDetails] = useState<CalendarEvent | null>(null);
  const [about, setAbout] = useState(false);
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState(true);
  const launchRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const focusComposer = useRef(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const update = () => setCompact(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  useEffect(() => {
    if (open && !compact && concept !== "bar" && focusComposer.current) {
      panelRef.current?.querySelector("textarea")?.focus();
      focusComposer.current = false;
    }
  }, [open, compact, concept]);
  function showAssistant() {
    focusComposer.current = true;
    setOpen(true);
  }
  function closeAssistant() {
    setOpen(false);
    requestAnimationFrame(() => launchRef.current?.focus());
  }
  function choose() {
    const next = selected === concept ? null : concept;
    setSelected(next);
    try {
      if (next) localStorage.setItem("callme-assistant-board-choice", next);
      else localStorage.removeItem("callme-assistant-board-choice");
      setSaved(true);
    } catch {
      setSaved(false);
    }
  }
  function proposeTask(text: string) {
    const title = text.trim();
    if (!title) {
      showAssistant();
      return;
    }
    setPendingTitle(title);
    setDraft("");
    showAssistant();
  }
  function confirmTask() {
    if (!pendingTitle.trim()) return;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    setBoardTasks((current) => [
      {
        id,
        title: pendingTitle.trim(),
        kind: "task",
        projectId: "preview-project",
        date: pendingDate || null,
        time: pendingDate && pendingTime ? pendingTime : null,
        duration: null,
        completed: false,
        status: "todo",
        priority: "normal",
        inferred: false,
        revision: 1,
        createdAt: now,
        updatedAt: now,
      },
      ...current,
    ]);
    setNewId(id);
    setPendingTitle("");
    setPendingDate("");
    setPendingTime("");
    closeAssistant();
    window.setTimeout(
      () => setNewId((current) => (current === id ? null : current)),
      2500,
    );
  }
  function send(text: string) {
    let response =
      "Уточните, пожалуйста, название задачи и что вы хотите с ней сделать. В этом примере я показываю ход разговора, а данные доски остаются прежними.";
    if (text === "Что у меня сегодня?")
      response =
        "На примерной доске четыре незавершённых дела. Высокий приоритет у задачи «Подготовить запуск CallMe», её исполнитель — Анна. Начнём с неё?";
    else if (text === "Добавить задачу")
      response = "Как назовём задачу? Можно сразу добавить описание и срок.";
    else if (text === "Найти встречу")
      response =
        "С кем или на какую тему была встреча? На этой примерной доске показаны только задачи.";
    else if (text.includes("Подготовить запуск CallMe"))
      response =
        "Для подготовки запуска нужно собрать материалы, проверить сценарий презентации и согласовать дату. За задачу отвечает Анна. Какой шаг обсудим?";
    setLines((current) => [
      ...current,
      { id: Date.now(), role: "user", text },
      { id: Date.now() + 1, role: "assistant", text: response },
    ]);
  }
  const conversation = pendingTitle ? (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-4">
      <p className="text-sm">
        Проверьте задачу перед добавлением на демонстрационную доску.
      </p>
      <label className="flex flex-col gap-1 text-sm">
        Название{" "}
        <Input
          value={pendingTitle}
          onChange={(e) => setPendingTitle(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Дата (необязательно){" "}
        <Input
          type="date"
          value={pendingDate}
          onChange={(e) => {
            setPendingDate(e.target.value);
            if (!e.target.value) setPendingTime("");
          }}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Время (необязательно){" "}
        <Input
          type="time"
          value={pendingTime}
          disabled={!pendingDate}
          onChange={(e) => setPendingTime(e.target.value)}
        />
      </label>
      <div className="flex gap-2">
        <Button onClick={confirmTask} disabled={!pendingTitle.trim()}>
          Добавить задачу
        </Button>
        <Button variant="outline" onClick={() => setPendingTitle("")}>
          Отмена
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Задача доступна только до перезагрузки предпросмотра.
      </p>
    </div>
  ) : (
    <Chat
      variant="board"
      minimal
      lines={lines}
      send={(text) => {
        if (text === "Добавить задачу") {
          setLines((current) => [
            ...current,
            {
              id: Date.now(),
              role: "assistant",
              text: "Введите название задачи в строке и нажмите отправить.",
            },
          ]);
        } else send(text);
      }}
      reset={() => setLines([])}
      welcome={() => setLines([])}
      composer={{ value: draft, onChange: setDraft }}
    />
  );
  return (
    <SidebarProvider
      defaultOpen={false}
      className="h-dvh min-h-0 overflow-hidden"
    >
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild tooltip="CallMe">
                <a href="/">
                  <AudioLines />
                  <span className="font-semibold group-data-[collapsible=icon]:hidden">
                    CallMe
                  </span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Рабочее пространство</SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive
                  tooltip="Доска задач"
                  onClick={closeAssistant}
                >
                  <LayoutGrid />
                  <span>Доска задач</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="ИИ-помощник"
                  onClick={showAssistant}
                >
                  <MessageCircle />
                  <span>ИИ-помощник</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Другие варианты">
                <a href="/assistant.html">
                  <ArrowLeft />
                  <span>Другие варианты</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="О варианте"
                onClick={() => setAbout(true)}
              >
                <Info />
                <span>О варианте и референсах</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <div className="flex items-center gap-2 p-1">
            <Avatar size="sm">
              <AvatarFallback>Я</AvatarFallback>
            </Avatar>
            <span className="truncate text-xs group-data-[collapsible=icon]:hidden">
              Личное пространство
            </span>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-h-0 min-w-0 overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b px-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <SidebarTrigger />
            <span className="truncate text-sm">CallMe</span>
            <Badge variant="outline">Предпросмотр</Badge>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label={dark ? "Светлая тема" : "Тёмная тема"}
              onClick={() => setDark((value) => !value)}
            >
              {dark ? <Sun /> : <Moon />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="О варианте и референсах"
              onClick={() => setAbout(true)}
            >
              <Info />
            </Button>
          </div>
        </header>
        <div className="relative flex min-h-0 flex-1">
          <section
            aria-label="Доска проекта"
            className="flex min-h-0 min-w-0 flex-1 flex-col"
          >
            <div className="flex min-h-0 flex-1 overflow-auto px-4 pt-4 sm:px-6">
              <div className="flex min-h-0 min-w-0 flex-1 lg:min-w-[760px]">
                <KanbanBoard
                  events={boardTasks}
                  highlightedId={newId}
                  projects={projects}
                  today="2026-10-30"
                  open={setDetails}
                  create={() => {
                    send("Добавить задачу");
                    showAssistant();
                  }}
                  action={async () => false}
                  busy={false}
                  members={members}
                  readOnly
                />
              </div>
            </div>
            <footer className="flex shrink-0 justify-center px-4 py-4 sm:px-6">
              <form
                className="w-full max-w-2xl"
                onSubmit={(event) => {
                  event.preventDefault();
                  proposeTask(draft);
                }}
              >
                <InputGroup className="transition-[transform] duration-200 focus-within:scale-[1.015] motion-reduce:transition-none">
                  <InputGroupAddon>
                    <AudioLines />
                  </InputGroupAddon>
                  <InputGroupInput
                    ref={launchRef}
                    aria-label="Название новой задачи"
                    placeholder="Напишите, что нужно сделать…"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      type="submit"
                      aria-label="Продолжить"
                      variant="default"
                      size="icon-xs"
                    >
                      <ArrowUp />
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
              </form>
            </footer>
          </section>
          {open && !compact && concept !== "bar" && (
            <Card
              ref={panelRef}
              id="board-assistant-panel"
              role="complementary"
              aria-label="ИИ-помощник"
              className={cn(
                "w-[400px] shrink-0 gap-3",
                concept === "float"
                  ? "absolute right-6 bottom-28 h-[min(560px,calc(100%-8rem))] shadow-xl"
                  : "h-full rounded-none border-y-0 border-r-0",
              )}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.stopPropagation();
                  closeAssistant();
                }
              }}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AudioLines className="size-5" />
                  ИИ-помощник
                </CardTitle>
                <CardDescription>Проект «Запуск CallMe»</CardDescription>
                <CardAction>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Закрыть помощника"
                    onClick={closeAssistant}
                  >
                    <X />
                  </Button>
                </CardAction>
              </CardHeader>
              {conversation}
            </Card>
          )}
        </div>
        {!saved && (
          <p role="status" className="px-4 pb-2 text-xs text-muted-foreground">
            Выбор отмечен до перезагрузки страницы.
          </p>
        )}
      </SidebarInset>
      <Sheet
        open={open && (compact || concept === "bar")}
        onOpenChange={(value) => {
          if (!value) closeAssistant();
        }}
      >
        <SheetContent
          id="board-assistant-panel"
          className={cn(
            "data-[side=right]:w-full",
            concept === "bar"
              ? "data-[side=right]:sm:max-w-xl"
              : "data-[side=right]:sm:max-w-md",
          )}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            launchRef.current?.focus();
          }}
        >
          <SheetHeader>
            <SheetTitle>ИИ-помощник</SheetTitle>
            <SheetDescription>Проект «Запуск CallMe»</SheetDescription>
          </SheetHeader>
          {(compact || concept === "bar") && conversation}
        </SheetContent>
      </Sheet>
      <Dialog
        open={Boolean(details)}
        onOpenChange={(value) => {
          if (!value) setDetails(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{details?.title}</DialogTitle>
            <DialogDescription>{details?.description}</DialogDescription>
          </DialogHeader>
          {details && (
            <>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-muted-foreground">Приоритет</dt>
                  <dd>{priorityNames[details.priority || "normal"]}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Срок</dt>
                  <dd>{eventDate(details)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Исполнитель</dt>
                  <dd>
                    {members.find((member) => member.id === details.assigneeId)
                      ?.name || "Не назначен"}
                  </dd>
                </div>
              </dl>
              <Button
                onClick={() => {
                  send(`Помоги с задачей «${details.title}»`);
                  setDetails(null);
                  showAssistant();
                }}
              >
                Обсудить с помощником
                <ArrowUpRight data-icon="inline-end" />
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={about} onOpenChange={setAbout}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Помощник на вашей доске</DialogTitle>
            <DialogDescription>
              Три варианта главного экрана. Переключайте их сверху, открывайте
              помощника и отмечайте понравившийся кнопкой «Выбрать».
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 text-sm">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={concept}
              aria-label="Варианты главного экрана"
              onValueChange={(value) => {
                if (isConcept(value)) {
                  setConcept(value);
                  setOpen(false);
                }
              }}
            >
              {concepts.map((item) => (
                <ToggleGroupItem key={item.id} value={item.id}>
                  {item.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <Button
              variant={selected === concept ? "secondary" : "outline"}
              onClick={choose}
            >
              {selected === concept ? "Выбрано" : "Выбрать этот вариант"}
            </Button>
            <p>
              Первый вариант оставляет чат рядом с доской, второй открывает
              компактное плавающее окно, третий — широкую выдвижную панель. На
              телефоне во всех вариантах чат занимает всю ширину. Выбор
              сохраняется после перезагрузки; переписка и черновик сохраняются
              при переключении вариантов в пределах страницы.
            </p>
            <p>
              Ориентиры: нижняя кнопка и правый чат в Notion Agent; короткие
              стартовые запросы в Asana Smart Chat.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <a
                  href="https://www.notion.com/en-gb/help/notion-agent"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Notion Agent
                  <ArrowUpRight data-icon="inline-end" />
                </a>
              </Button>
              <Button asChild variant="outline" size="sm">
                <a
                  href="https://help.asana.com/s/article/ai-chat"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Asana Smart Chat
                  <ArrowUpRight data-icon="inline-end" />
                </a>
              </Button>
            </div>
            <p className="text-muted-foreground">
              Это интерактивный пример: пять демонстрационных задач, ответы по
              сценарию. Данные основного приложения и внешние сервисы не
              меняются.
            </p>
            <Button asChild variant="ghost">
              <a href="/assistant.html">
                <ArrowLeft data-icon="inline-start" />
                Вернуться к вариантам
              </a>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
