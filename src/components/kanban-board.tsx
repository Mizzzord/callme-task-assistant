import { useEffect, useRef, useState } from "react";
import { Plus, Search } from "lucide-react";
import type {
  CalendarEvent,
  Command,
  Project,
  TaskStatus,
  TeamMember,
} from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TaskCard } from "@/components/task-card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
} from "@/components/ui/input-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty";
import {
  eventDate,
  statusNames,
  statusOf,
  priorityNames,
  priorityRank,
} from "@/lib/events";
import { cn } from "@/lib/utils";
const columns = Object.keys(statusNames) as TaskStatus[];
export function KanbanBoard({
  events,
  projects,
  today,
  open,
  create,
  action,
  busy,
  members,
  readOnly = false,
  highlightedId,
  composerInset = false,
}: {
  events: CalendarEvent[];
  projects: Project[];
  today: string;
  open: (e: CalendarEvent) => void;
  create: () => void;
  action: (c: Command) => Promise<boolean>;
  busy: boolean;
  members: TeamMember[];
  readOnly?: boolean;
  highlightedId?: string | null;
  composerInset?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState("all");
  const [assignee, setAssignee] = useState("all");
  const [period, setPeriod] = useState("all");
  const [mobileColumn, setMobileColumn] = useState<TaskStatus>("todo");
  const [limit, setLimit] = useState(12);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [keyboardDrag, setKeyboardDrag] = useState(false);
  const [landedId, setLandedId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const suppressDragClick = useRef(false);
  const dragImage = useRef<HTMLElement | null>(null);
  useEffect(() => () => dragImage.current?.remove(), []);
  useEffect(() => {
    if (!landedId) return;
    const timer = setTimeout(() => setLandedId(null), 1800);
    return () => clearTimeout(timer);
  }, [landedId]);
  const [over, setOver] = useState<TaskStatus | null>(null);
  const filtered = events
    .filter(
      (e) =>
        (priority === "all" || (e.priority || "normal") === priority) &&
        (assignee === "all" ||
          (assignee === "none" ? !e.assigneeId : e.assigneeId === assignee)) &&
        e.title
          .toLocaleLowerCase("ru")
          .includes(query.toLocaleLowerCase("ru")) &&
        (period === "all" ||
          (period === "today" && e.date === today) ||
          (period === "upcoming" && (!e.date || e.date >= today))),
    )
    .sort(
      (a, b) =>
        priorityRank[a.priority || "normal"] -
          priorityRank[b.priority || "normal"] ||
        Number(Boolean(a.original)) - Number(Boolean(b.original)) ||
        b.createdAt.localeCompare(a.createdAt),
    );
  function endDrag() {
    setDraggingId(null);
    setKeyboardDrag(false);
    setOver(null);
    dragImage.current?.remove();
    dragImage.current = null;
  }
  async function move(e: CalendarEvent, status: TaskStatus) {
    endDrag();
    if (statusOf(e) === status || busy || readOnly) return;
    const ok = await action({
      action: "move",
      id: e.id,
      revision: e.revision,
      status,
    });
    if (ok) {
      setLandedId(e.id);
      setMobileColumn(status);
      setAnnouncement(
        `«${e.title}» перемещена в колонку «${statusNames[status]}».`,
      );
    } else
      setAnnouncement(
        "Перенести карточку не удалось. Она осталась в прежней колонке.",
      );
  }
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-5 max-lg:min-h-[40rem]", composerInset && "shrink-0")}>
      <p id="task-drag-help" className="sr-only">
        Enter открывает карточку. Для переноса нажмите пробел, выберите колонку
        стрелками влево или вправо, затем Enter. Escape отменяет перенос.
      </p>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <InputGroup className="w-full sm:max-w-xs">
          <InputGroupInput
            aria-label="Поиск на доске"
            placeholder="Найти задачу или встречу…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(12);
            }}
          />
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
        </InputGroup>
        <ToggleGroup
          type="single"
          value={period}
          onValueChange={(v) => {
            if (v) {
              setPeriod(v);
              setLimit(12);
            }
          }}
          variant="outline"
          size="sm"
          aria-label="Период доски"
        >
          <ToggleGroupItem value="all">Все даты</ToggleGroupItem>
          <ToggleGroupItem value="today">Сегодня</ToggleGroupItem>
          <ToggleGroupItem value="upcoming">Впереди</ToggleGroupItem>
        </ToggleGroup>
        <Select
          value={assignee}
          onValueChange={(v) => {
            setAssignee(v);
            setLimit(12);
          }}
        >
          <SelectTrigger
            aria-label="Фильтр по исполнителю"
            className="w-full sm:w-44"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">Все исполнители</SelectItem>
              <SelectItem value="none">Не назначен</SelectItem>
              {members.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Select
          value={priority}
          onValueChange={(v) => {
            setPriority(v);
            setLimit(12);
          }}
        >
          <SelectTrigger
            aria-label="Фильтр по приоритету"
            className="w-full sm:w-44"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">Все приоритеты</SelectItem>
              {Object.entries(priorityNames).map(([v, name]) => (
                <SelectItem key={v} value={v}>
                  {name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <ToggleGroup
        className="w-full lg:hidden"
        type="single"
        value={mobileColumn}
        onValueChange={(v) => {
          if (v) setMobileColumn(v as TaskStatus);
        }}
        variant="outline"
        size="sm"
        aria-label="Колонка доски"
      >
        {columns.map((c) => (
          <ToggleGroupItem className="min-w-0 flex-1 text-[11px] sm:text-sm" key={c} value={c}>
            {statusNames[c]} ·{" "}
            {filtered.filter((e) => statusOf(e) === c).length}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <div className={cn("grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-3", composerInset && "flex-none items-stretch")}>
        {columns.map((column) => {
          const items = filtered.filter((e) => statusOf(e) === column);
          return (
            <section
              key={column}
              aria-label={statusNames[column]}
              className={cn(
                "flex min-h-0 min-w-0 flex-col gap-3 rounded-xl bg-muted/50 p-3",

                mobileColumn !== column && "hidden lg:flex",
                over === column && "outline-2 outline-ring bg-accent",
              )}
              onDragOver={(e) => {
                if (
                  !busy &&
                  !readOnly &&
                  e.dataTransfer.types.includes("application/x-ryadom-event")
                ) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setOver(column);
                }
              }}
              onDragLeave={(e) => {
                if (
                  !(e.relatedTarget instanceof Node) ||
                  !e.currentTarget.contains(e.relatedTarget)
                )
                  setOver(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const item = events.find(
                  (x) =>
                    x.id ===
                    e.dataTransfer.getData("application/x-ryadom-event"),
                );
                if (item) void move(item, column);
                else endDrag();
              }}
            >
              <div className="flex items-center gap-2 px-1 py-1">
                <h2 className="text-sm font-medium">{statusNames[column]}</h2>
                <Badge variant="secondary">{items.length}</Badge>
                {draggingId && over === column && (
                  <Badge variant="outline" className="ml-auto">
                    {keyboardDrag ? "Enter — перенести" : "Отпустите здесь"}
                  </Badge>
                )}
                {column === "todo" && !readOnly && (
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    className="ml-auto"
                    aria-label="Добавить запись в колонку"
                    onClick={create}
                    disabled={busy || readOnly}
                  >
                    <Plus />
                  </Button>
                )}
              </div>
              <div className={cn("flex min-h-0 flex-1 flex-col gap-3 p-1.5", !composerInset && "overflow-y-auto")}>
                {!items.length && (
                  <Empty className="flex-none px-3 py-8">
                    <EmptyHeader>
                      <EmptyTitle>
                        {query ? "Ничего не найдено" : "Пока пусто"}
                      </EmptyTitle>
                      <EmptyDescription>
                        {query
                          ? "Измените запрос или фильтры."
                          : readOnly
                            ? "Здесь появятся записи команды с этим статусом."
                            : column === "todo"
                              ? "Добавьте дело вручную или попросите ассистента."
                              : "Перетащите сюда карточку или перенесите её через окно записи."}
                      </EmptyDescription>
                    </EmptyHeader>
                    {column === "todo" && !readOnly && (
                      <EmptyContent>
                        <Button size="sm" variant="outline" onClick={create}>
                          Добавить дело
                        </Button>
                      </EmptyContent>
                    )}
                  </Empty>
                )}
                {items.slice(0, limit).map((e) => (
                  <div
                    key={e.id}
                    role="group"
                    aria-label={`Карточка: ${e.title}`}
                    aria-roledescription={
                      readOnly ? "карточка задачи" : "перетаскиваемая карточка"
                    }
                    aria-describedby={readOnly ? undefined : "task-drag-help"}
                    data-task-id={e.id}
                    data-dragging={draggingId === e.id || undefined}
                    className={cn(
                      "min-w-0 shrink-0 rounded-xl outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring motion-safe:transition-[transform,opacity,box-shadow] motion-safe:duration-150",
                      !readOnly &&
                        !busy &&
                        "cursor-grab active:cursor-grabbing",
                      draggingId === e.id &&
                        "opacity-45 shadow-xl motion-safe:-translate-y-1 motion-safe:-rotate-1",
                      landedId === e.id && "outline-2 outline-ring",
                      highlightedId === e.id &&
                        "outline-2 outline-green-600 shadow-lg",
                    )}
                    draggable={!busy && !readOnly}
                    onPointerDownCapture={() => {
                      suppressDragClick.current = false;
                    }}
                    onClickCapture={(click) => {
                      if (suppressDragClick.current || draggingId) {
                        click.preventDefault();
                        click.stopPropagation();
                      }
                    }}
                    onKeyDownCapture={(key) => {
                      if (busy || readOnly) return;
                      if (!draggingId && key.key === " ") {
                        key.preventDefault();
                        setDraggingId(e.id);
                        setKeyboardDrag(true);
                        setOver(column);
                        setAnnouncement(
                          `Поднята карточка «${e.title}». Выберите колонку стрелками.`,
                        );
                      } else if (draggingId === e.id && keyboardDrag) {
                        if (["ArrowLeft", "ArrowRight"].includes(key.key)) {
                          key.preventDefault();
                          const index = columns.indexOf(over || column);
                          const next =
                            columns[
                              Math.max(
                                0,
                                Math.min(
                                  columns.length - 1,
                                  index + (key.key === "ArrowRight" ? 1 : -1),
                                ),
                              )
                            ];
                          setOver(next);
                          setAnnouncement(
                            `Колонка «${statusNames[next]}». Enter — перенести.`,
                          );
                        } else if (key.key === "Enter" || key.key === " ") {
                          key.preventDefault();
                          void move(e, over || column);
                        } else if (key.key === "Escape") {
                          key.preventDefault();
                          endDrag();
                          setAnnouncement("Перенос отменён.");
                        } else if (key.key === "Tab") {
                          endDrag();
                          setAnnouncement("Перенос отменён.");
                        }
                      }
                    }}
                    onDragStart={(d) => {
                      if (
                        busy ||
                        readOnly ||
                        (d.target instanceof Element &&
                          d.target.closest(
                            "button, a, input, select, textarea",
                          ))
                      ) {
                        d.preventDefault();
                        return;
                      }
                      suppressDragClick.current = true;
                      d.dataTransfer.setData(
                        "application/x-ryadom-event",
                        e.id,
                      );
                      d.dataTransfer.effectAllowed = "move";
                      const rect = d.currentTarget.getBoundingClientRect();
                      const clone = d.currentTarget.cloneNode(
                        true,
                      ) as HTMLElement;
                      clone.setAttribute("aria-hidden", "true");
                      clone.style.cssText = `position:fixed;left:-10000px;top:0;width:${rect.width}px;pointer-events:none;opacity:1;box-shadow:0 20px 45px rgb(0 0 0 / 0.25);transform:${window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "none" : "rotate(-2deg) scale(1.03)"};`;
                      dragImage.current?.remove();
                      dragImage.current = clone;
                      document.body.appendChild(clone);
                      d.dataTransfer.setDragImage(
                        clone,
                        d.clientX - rect.left,
                        d.clientY - rect.top,
                      );
                      setDraggingId(e.id);
                      setKeyboardDrag(false);
                      setOver(column);
                    }}
                    onDragEnd={endDrag}
                  >
                    <TaskCard
                      title={e.title}
                      description={e.description}
                      project={
                        projects.find((p) => p.id === e.projectId)?.name ||
                        "Без проекта"
                      }
                      priority={e.priority || "normal"}
                      due={eventDate(e)}
                      assignee={
                        members.find((m) => m.id === e.assigneeId)?.name
                      }
                      onOpen={() => open(e)}
                      disabled={busy}
                      draggable={!readOnly && !busy}
                    />
                  </div>
                ))}
                {items.length > limit && (
                  <Button
                    variant="outline"
                    onClick={() => setLimit((n) => n + 12)}
                  >
                    Показать ещё · {items.length - limit}
                  </Button>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
