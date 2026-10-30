import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  AudioLines,
  CalendarDays,
  Check,
  CheckCheck,
  Circle,
  CircleCheck,
  Clock3,
  Flag,
  Folder,
  LayoutGrid,
  Link2,
  Moon,
  RotateCcw,
  Sun,
  UserRound,
} from "lucide-react";
import { TaskCard as WorkingTaskCard } from "@/components/task-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  CardAction,
} from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { priorityNames, statusNames } from "@/lib/events";
import type { Priority, TaskStatus } from "@/types";

type Example = "regular" | "long" | "overdue" | "minimal";
type PreviewTask = {
  title: string;
  description: string;
  project: string;
  due: string;
  assignee: string | null;
  priority: Priority;
  status: TaskStatus;
  overdue: boolean;
  links: number;
};
type CardProps = {
  task: PreviewTask;
  open: () => void;
  toggleDone: () => void;
  changeStatus: (value: TaskStatus) => void;
};
const examples: { id: Example; label: string }[] = [
  { id: "regular", label: "Обычная задача" },
  { id: "long", label: "Длинное название" },
  { id: "overdue", label: "Просроченная" },
  { id: "minimal", label: "Минимум данных" },
];
const variants = [
  {
    title: "Лаконичная",
    subtitle: "Название на первом плане",
    description:
      "Свободное пространство, только главные метки. Для спокойной, легко читаемой доски.",
    tag: "Больше воздуха",
  },
  {
    title: "Компактная",
    subtitle: "Больше задач на экране",
    description:
      "Короткие строки и завершение в один клик. Для насыщенной доски и небольших экранов.",
    tag: "Меньше высота",
  },
  {
    title: "Командная",
    subtitle: "Понятно, кто отвечает",
    description:
      "Исполнитель с именем, материалы и быстрый выбор статуса. Для совместной работы.",
    tag: "Фокус на людях",
  },
  {
    title: "Срок на виду",
    subtitle: "Сначала — когда",
    description:
      "Срок вынесен наверх. Просроченную задачу легко заметить даже при быстром просмотре.",
    tag: "Фокус на времени",
  },
  {
    title: "Рабочая",
    subtitle: "Все детали под рукой",
    description:
      "Название, описание и основные поля. Открывается нажатием на карточку; статус определяется колонкой доски.",
    tag: "Больше информации",
  },
  {
    title: "Строка",
    subtitle: "Минимум визуального шума",
    description:
      "Завершение слева, детали справа. Подходит для списка и плотных колонок канбана.",
    tag: "Самая плотная",
  },
];
function makeTask(example: Example): PreviewTask {
  return {
    title:
      example === "long"
        ? "Подготовить материалы к запуску CallMe и согласовать финальную версию презентации с командой"
        : "Подготовить запуск CallMe",
    description:
      example === "minimal"
        ? ""
        : "Собрать финальные материалы, проверить сценарий презентации и согласовать дату запуска с командой. Подготовить список вопросов для обсуждения.",
    project: "Запуск продукта",
    due:
      example === "minimal"
        ? "Без срока"
        : example === "overdue"
          ? "Вчера, 18:00"
          : "Завтра, 18:00",
    assignee: example === "minimal" ? null : "Мария Иванова",
    priority:
      example === "overdue"
        ? "urgent"
        : example === "minimal"
          ? "normal"
          : "high",
    status: "in_progress",
    overdue: example === "overdue",
    links: example === "minimal" ? 0 : 2,
  };
}
function PriorityBadge({ task }: { task: PreviewTask }) {
  return (
    <Badge
      variant={
        task.priority === "urgent"
          ? "destructive"
          : task.priority === "high"
            ? "default"
            : "outline"
      }
    >
      <Flag data-icon="inline-start" />
      {priorityNames[task.priority]}
    </Badge>
  );
}
function StatusBadge({ task }: { task: PreviewTask }) {
  return (
    <Badge variant={task.status === "done" ? "default" : "secondary"}>
      {task.status === "done" ? (
        <Check data-icon="inline-start" />
      ) : task.status === "in_progress" ? (
        <Clock3 data-icon="inline-start" />
      ) : (
        <Circle data-icon="inline-start" />
      )}
      {statusNames[task.status]}
    </Badge>
  );
}
function Person({ task, name = true }: { task: PreviewTask; name?: boolean }) {
  return (
    <div
      className="flex min-w-0 items-center gap-2"
      title={task.assignee || "Не назначен"}
    >
      <Avatar size="sm">
        <AvatarFallback>
          {task.assignee ? "МИ" : <UserRound className="size-3" />}
        </AvatarFallback>
      </Avatar>
      {name && (
        <span className="truncate text-xs">
          {task.assignee || "Не назначен"}
        </span>
      )}
    </div>
  );
}
function Due({ task }: { task: PreviewTask }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs",
        task.overdue && task.status !== "done"
          ? "text-destructive"
          : "text-muted-foreground",
      )}
    >
      <CalendarDays className="size-3.5 shrink-0" />
      {task.due}
    </span>
  );
}
function OpenButton({ open }: Pick<CardProps, "open">) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Открыть пример задачи"
      onClick={open}
    >
      <ArrowUpRight />
    </Button>
  );
}
function DoneButton({
  task,
  toggleDone,
}: Pick<CardProps, "task" | "toggleDone">) {
  return (
    <Button
      variant={task.status === "done" ? "default" : "outline"}
      size="icon-sm"
      aria-label={
        task.status === "done" ? "Вернуть задачу в работу" : "Завершить задачу"
      }
      aria-pressed={task.status === "done"}
      onClick={toggleDone}
    >
      {task.status === "done" ? <CircleCheck /> : <Circle />}
    </Button>
  );
}
function StatusSelect({
  task,
  changeStatus,
}: Pick<CardProps, "task" | "changeStatus">) {
  return (
    <Select
      value={task.status}
      onValueChange={(v) => {
        if (v === "todo" || v === "in_progress" || v === "done")
          changeStatus(v);
      }}
    >
      <SelectTrigger size="sm" aria-label="Статус примера" className="w-36">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {Object.entries(statusNames).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
function TaskCard({ variant, ...props }: CardProps & { variant: number }) {
  const { task, open, toggleDone, changeStatus } = props;
  const title = (
    <CardTitle className="min-w-0 break-words">{task.title}</CardTitle>
  );
  if (variant === 0)
    return (
      <Card className="w-full">
        <CardHeader className="gap-3">
          <CardDescription>{task.project}</CardDescription>
          <CardAction>
            <OpenButton open={open} />
          </CardAction>
          {title}
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <PriorityBadge task={task} />
          <Due task={task} />
        </CardContent>
        <CardFooter className="justify-between gap-2">
          <Person task={task} />
          <StatusBadge task={task} />
        </CardFooter>
      </Card>
    );
  if (variant === 1)
    return (
      <Card size="sm" className="w-full">
        <CardHeader>
          <CardDescription>CM–024 · {task.project}</CardDescription>
          <CardAction>
            <DoneButton task={task} toggleDone={toggleDone} />
          </CardAction>
          {title}
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <PriorityBadge task={task} />
          <Due task={task} />
          <Person task={task} name={false} />
        </CardContent>
        <CardFooter className="justify-between gap-2">
          <StatusBadge task={task} />
          <Button variant="ghost" size="xs" onClick={open}>
            Подробнее
            <ArrowUpRight data-icon="inline-end" />
          </Button>
        </CardFooter>
      </Card>
    );
  if (variant === 2)
    return (
      <Card className="w-full">
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge variant="outline">
              <Folder data-icon="inline-start" />
              {task.project}
            </Badge>
            <PriorityBadge task={task} />
          </div>
          {title}
          <CardDescription>
            <Due task={task} />
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <Avatar size="lg">
                <AvatarFallback>
                  {task.assignee ? "МИ" : <UserRound />}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Исполнитель</p>
                <p className="text-sm">{task.assignee || "Не назначен"}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={open}
              aria-label={`Открыть материалы: ${task.links}`}
            >
              <Link2 data-icon="inline-start" />
              {task.links}
            </Button>
          </div>
        </CardContent>
        <CardFooter className="justify-between gap-2">
          <StatusSelect task={task} changeStatus={changeStatus} />
          <OpenButton open={open} />
        </CardFooter>
      </Card>
    );
  if (variant === 3)
    return (
      <Card className="w-full">
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge
              variant={
                task.overdue && task.status !== "done"
                  ? "destructive"
                  : "secondary"
              }
            >
              <CalendarDays data-icon="inline-start" />
              {task.due}
            </Badge>
            <OpenButton open={open} />
          </div>
          {title}
          <CardDescription>{task.project}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <PriorityBadge task={task} />
          <StatusBadge task={task} />
        </CardContent>
        <CardFooter className="justify-between gap-2">
          <Person task={task} />
          <DoneButton task={task} toggleDone={toggleDone} />
        </CardFooter>
      </Card>
    );
  if (variant === 4)
    return (
      <WorkingTaskCard
        title={task.title}
        description={task.description}
        project={task.project}
        priority={task.priority}
        due={task.due}
        assignee={task.assignee}
        onOpen={open}
      />
    );
  return (
    <Card size="sm" className="w-full">
      <CardHeader className="grid-cols-[auto_1fr_auto] gap-x-3">
        <div className="row-span-2">
          <DoneButton task={task} toggleDone={toggleDone} />
        </div>
        {title}
        <div className="col-start-3 row-span-2">
          <OpenButton open={open} />
        </div>
        <CardDescription className="col-start-2">
          {task.project}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2 pl-14">
        <PriorityBadge task={task} />
        <Due task={task} />
        <Person task={task} name={false} />
        {task.status === "done" && <StatusBadge task={task} />}
      </CardContent>
    </Card>
  );
}
export function TaskCardGallery() {
  const [example, setExample] = useState<Example>("regular");
  const [task, setTask] = useState(() => makeTask("regular"));
  const [dark, setDark] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [opened, setOpened] = useState<number | null>(null);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  function chooseExample(value: string) {
    const next = examples.find((e) => e.id === value);
    if (next) {
      setExample(next.id);
      setTask(makeTask(next.id));
    }
  }
  const toggleDone = () =>
    setTask((t) => ({
      ...t,
      status: t.status === "done" ? "in_progress" : "done",
    }));
  const changeStatus = (status: TaskStatus) =>
    setTask((t) => ({ ...t, status }));
  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <a
            href="/"
            className="flex items-center gap-2.5 font-semibold"
            aria-label="CallMe — на главную"
          >
            <AudioLines className="size-5 text-primary" />
            CallMe
            <Separator
              orientation="vertical"
              className="mx-1 hidden h-5 sm:block"
            />
            <span className="hidden text-sm font-normal text-muted-foreground sm:inline">
              Лаборатория карточек
            </span>
          </a>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label={
                dark ? "Включить светлую тему" : "Включить тёмную тему"
              }
              onClick={() => setDark((v) => !v)}
            >
              {dark ? <Sun /> : <Moon />}
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href="/">
                <ArrowLeft data-icon="inline-start" />К доске
              </a>
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto flex max-w-7xl flex-col gap-7 px-5 py-7 sm:gap-9 sm:px-8 sm:py-12">
        <section className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="flex max-w-2xl flex-col gap-4">
            <div>
              <Badge variant="secondary">
                <LayoutGrid data-icon="inline-start" />6 вариантов · один набор
                данных
              </Badge>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl sm:leading-[1.12]">
              Как будет выглядеть
              <br />
              <span className="text-primary">ваша задача.</span>
            </h1>
            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Сравните компоновки. Открывайте карточки, меняйте приоритет и
              статус — попробуйте их в работе.
            </p>
          </div>
          <p className="max-w-xs text-xs leading-relaxed text-muted-foreground md:max-w-56">
            Отдельный предпросмотр. Все действия меняют только примеры на этой
            странице.
          </p>
        </section>
        <section
          aria-label="Настройки примера"
          className="flex flex-wrap items-center justify-between gap-4 border-y py-4"
        >
          <div className="flex min-w-0 flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">
              ПРОВЕРИТЬ НА ПРИМЕРЕ
            </p>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={example}
              onValueChange={chooseExample}
              className="flex-wrap justify-start"
              aria-label="Пример задачи"
            >
              {examples.map((e) => (
                <ToggleGroupItem key={e.id} value={e.id}>
                  {e.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setTask(makeTask(example));
              setSelected(null);
            }}
          >
            <RotateCcw data-icon="inline-start" />
            Сбросить
          </Button>
        </section>
        {selected !== null && (
          <Alert>
            <CheckCheck />
            <AlertTitle>
              Выбран вариант {String(selected + 1).padStart(2, "0")} ·{" "}
              {variants[selected].title}
            </AlertTitle>
            <AlertDescription>
              Можно назвать этот номер в чате — он будет ориентиром для
              следующей правки основной доски.
            </AlertDescription>
          </Alert>
        )}
        <div className="grid items-stretch gap-x-7 gap-y-10 md:grid-cols-2 xl:grid-cols-3">
          {variants.map((variant, index) => (
            <section
              key={variant.title}
              aria-label={`Вариант ${index + 1}: ${variant.title}`}
              className="flex min-w-0 flex-col gap-4"
            >
              <div className="flex items-start gap-3">
                <span className="pt-0.5 font-mono text-xs text-muted-foreground">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <h2 className="font-semibold">{variant.title}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {variant.subtitle}
                  </p>
                </div>
              </div>
              <div
                className={cn(
                  "flex min-h-72 flex-1 items-center rounded-2xl bg-muted/60 p-4 sm:p-5",
                  selected === index &&
                    "outline-2 outline-offset-4 outline-primary",
                )}
              >
                <TaskCard
                  variant={index}
                  task={task}
                  open={() => setOpened(index)}
                  toggleDone={toggleDone}
                  changeStatus={changeStatus}
                />
              </div>
              <div className="flex flex-col gap-3">
                <p className="min-h-12 text-xs leading-relaxed text-muted-foreground">
                  {variant.description}
                </p>
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline">{variant.tag}</Badge>
                  <Button
                    variant={selected === index ? "default" : "ghost"}
                    size="sm"
                    aria-pressed={selected === index}
                    aria-label={`Выбрать вариант ${index + 1}: ${variant.title}`}
                    onClick={() =>
                      setSelected(selected === index ? null : index)
                    }
                  >
                    {selected === index ? (
                      <Check data-icon="inline-start" />
                    ) : null}
                    {selected === index ? "Выбрано" : "Выбрать"}
                  </Button>
                </div>
              </div>
            </section>
          ))}
        </div>
        <Separator />
        <footer className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>CallMe / Исследование карточки задачи</span>
          <span>Один стиль, разные акценты. Какой оставляем?</span>
        </footer>
      </main>
      <Dialog
        open={opened !== null}
        onOpenChange={(open) => {
          if (!open) setOpened(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{task.title}</DialogTitle>
            <DialogDescription>
              Пример из варианта{" "}
              {opened === null ? "" : String(opened + 1).padStart(2, "0")}.
              Изменения видны во всех шести компоновках.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel>Проект</FieldLabel>
              <p className="text-sm">{task.project}</p>
            </Field>
            <Field>
              <FieldLabel htmlFor="preview-priority">Приоритет</FieldLabel>
              <Select
                value={task.priority}
                onValueChange={(v) => {
                  if (
                    v === "low" ||
                    v === "normal" ||
                    v === "high" ||
                    v === "urgent"
                  )
                    setTask((t) => ({ ...t, priority: v }));
                }}
              >
                <SelectTrigger id="preview-priority" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {Object.entries(priorityNames).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Статус</FieldLabel>
              <StatusSelect task={task} changeStatus={changeStatus} />
            </Field>
            <div className="flex flex-wrap justify-between gap-4">
              <Due task={task} />
              <Person task={task} />
            </div>
            <Field>
              <FieldLabel>Связанные материалы</FieldLabel>
              <p className="text-sm text-muted-foreground">
                {task.links
                  ? "Презентация запуска · План коммуникаций"
                  : "Материалов пока нет"}
              </p>
            </Field>
            <Button onClick={() => setOpened(null)}>Готово</Button>
          </FieldGroup>
        </DialogContent>
      </Dialog>
    </div>
  );
}
