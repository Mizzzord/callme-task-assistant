import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUp,
  ArrowUpRight,
  AudioLines,
  Check,
  LayoutGrid,
  MessageCircle,
  Mic,
  Moon,
  PanelRight,
  Sparkles,
  Sun,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  InputGroup,
  InputGroupTextarea,
  InputGroupAddon,
  InputGroupButton,
} from "@/components/ui/input-group";
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
  Message,
  MessageContent,
  MessageHeader,
} from "@/components/ui/message";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import {
  MessageScrollerProvider,
  MessageScroller,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerButton,
} from "@/components/ui/message-scroller";
import { cn } from "@/lib/utils";

type VariantId = "side" | "floating" | "focus" | "workspace";
export type ChatLine = { id: number; role: "user" | "assistant"; text: string };
const variants: {
  id: VariantId;
  title: string;
  lead: string;
  button: string;
  panel: string;
  fit: string;
}[] = [
  {
    id: "side",
    title: "Всегда рядом",
    lead: "Полноэкранная панель",
    button: "Подписанная кнопка внизу справа",
    panel:
      "Помощник на весь экран с быстрыми запросами слева и разговором справа.",
    fit: "Для регулярной работы с помощником",
  },
  {
    id: "floating",
    title: "Лёгкое касание",
    lead: "Полноэкранный чат",
    button: "Компактная круглая кнопка с иконкой",
    panel:
      "Лаконичный чат на весь экран с компактной шапкой и спокойной компоновкой.",
    fit: "Для коротких запросов между делами",
  },
  {
    id: "focus",
    title: "В центре внимания",
    lead: "Полноэкранный фокус",
    button: "Широкая кнопка-приглашение внизу экрана",
    panel:
      "Крупное приветствие и разговор по центру полноэкранного пространства.",
    fit: "Когда хочется спокойно сформулировать мысль",
  },
  {
    id: "workspace",
    title: "Место для разговора",
    lead: "Полноэкранное пространство",
    button: "Пункт «ИИ-помощник» рядом с доской",
    panel: "Полноценная рабочая область с широким чатом и быстрыми запросами.",
    fit: "Для длинных разговоров и планирования",
  },
];
const suggestions = ["Что у меня сегодня?", "Добавить задачу", "Найти встречу"];
const sample: ChatLine[] = [
  { id: 1, role: "user", text: "Помоги подготовиться к запуску CallMe" },
  {
    id: 2,
    role: "assistant",
    text: "Давайте начнём с материалов и презентации. На какой день запланируем подготовку?",
  },
];

function Launcher({
  variant,
  onClick,
  expanded = false,
}: {
  variant: VariantId;
  onClick: () => void;
  expanded?: boolean;
}) {
  if (variant === "floating")
    return (
      <Button
        size="icon-lg"
        className="rounded-full"
        aria-label="Открыть ИИ-помощника"
        aria-expanded={expanded}
        onClick={onClick}
      >
        <AudioLines />
      </Button>
    );
  if (variant === "focus")
    return (
      <Button
        size="lg"
        variant="outline"
        className="max-w-full gap-3 rounded-full"
        aria-expanded={expanded}
        onClick={onClick}
      >
        <Sparkles data-icon="inline-start" />
        Что будем планировать?
        <ArrowUpRight data-icon="inline-end" />
      </Button>
    );
  return (
    <Button
      variant={variant === "workspace" ? "secondary" : "default"}
      size="lg"
      aria-expanded={expanded}
      onClick={onClick}
    >
      {variant === "side" ? (
        <MessageCircle data-icon="inline-start" />
      ) : (
        <AudioLines data-icon="inline-start" />
      )}
      ИИ-помощник{variant === "side" && <PanelRight data-icon="inline-end" />}
    </Button>
  );
}

export function Chat({
  variant,
  lines,
  send,
  reset,
  welcome,
  minimal = false,
  composer,
}: {
  variant: VariantId | "board";
  lines: ChatLine[];
  send: (text: string) => void;
  reset: () => void;
  welcome: () => void;
  minimal?: boolean;
  composer?: { value: string; onChange: (value: string) => void };
}) {
  const [localInput, setLocalInput] = useState("");
  const input = composer?.value ?? localInput;
  const setInput = composer?.onChange ?? setLocalInput;
  const [voiceHint, setVoiceHint] = useState(false);
  const submit = () => {
    if (input.trim()) {
      send(input.trim());
      setInput("");
    }
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {!minimal && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-4">
          <Badge variant="outline">Запуск CallMe</Badge>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={lines.length ? "dialogue" : "start"}
            onValueChange={(v) => {
              if (v === "start") welcome();
              if (v === "dialogue") reset();
            }}
            aria-label="Состояние помощника"
          >
            <ToggleGroupItem value="start">Старт</ToggleGroupItem>
            <ToggleGroupItem value="dialogue">Диалог</ToggleGroupItem>
          </ToggleGroup>
        </div>
      )}
      <MessageScrollerProvider
        autoScroll
        defaultScrollPosition={lines.length ? "end" : "start"}
      >
        <MessageScroller className="min-h-0 flex-1">
          <MessageScrollerViewport>
            <MessageScrollerContent className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-5">
              {!lines.length ? (
                <MessageScrollerItem messageId="welcome">
                  <div
                    className={cn(
                      "flex flex-col gap-5",
                      variant === "focus" && "items-center text-center py-5",
                      variant === "workspace" && "py-8",
                    )}
                  >
                    <Avatar className="size-12">
                      <AvatarFallback>
                        <AudioLines />
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col gap-2">
                      <h2 className="text-2xl font-semibold tracking-tight">
                        {variant === "board"
                          ? "Чем помочь?"
                          : variant === "floating"
                            ? "Что нужно сделать?"
                            : variant === "focus"
                              ? "Освободим место для мыслей."
                              : "С чего начнём?"}
                      </h2>
                      <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
                        Расскажите о планах. Помогу записать задачу, найти
                        встречу или разобраться в расписании.
                      </p>
                    </div>
                    <div
                      className={cn(
                        "flex flex-wrap gap-2",
                        variant === "focus" && "justify-center",
                        minimal && "flex-col items-stretch",
                      )}
                    >
                      {suggestions.map((text) => (
                        <Button
                          key={text}
                          size="sm"
                          variant="outline"
                          className={minimal ? "justify-between" : undefined}
                          onClick={() => send(text)}
                        >
                          {text}
                          <ArrowUpRight data-icon="inline-end" />
                        </Button>
                      ))}
                    </div>
                  </div>
                </MessageScrollerItem>
              ) : (
                lines.map((line) => (
                  <MessageScrollerItem
                    key={line.id}
                    messageId={String(line.id)}
                    scrollAnchor={line.role === "user"}
                  >
                    <Message align={line.role === "user" ? "end" : "start"}>
                      <MessageContent>
                        <MessageHeader>
                          {line.role === "user" ? "Вы" : "CallMe"}
                        </MessageHeader>
                        <Bubble
                          variant={line.role === "user" ? "secondary" : "ghost"}
                          align={line.role === "user" ? "end" : "start"}
                        >
                          <BubbleContent>{line.text}</BubbleContent>
                        </Bubble>
                      </MessageContent>
                    </Message>
                  </MessageScrollerItem>
                ))
              )}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton aria-label="К последнему сообщению" />
        </MessageScroller>
      </MessageScrollerProvider>
      <div className="flex flex-col gap-3 px-4 pb-4">
        {voiceHint && (
          <Alert>
            <Mic />
            <AlertDescription>
              Это предпросмотр интерфейса. Микрофон здесь не включается.
            </AlertDescription>
          </Alert>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <InputGroup>
            <InputGroupTextarea
              aria-label="Сообщение помощнику"
              placeholder="Напишите или расскажите…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={1000}
              rows={2}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            <InputGroupAddon align="block-end" className="justify-between">
              <InputGroupButton
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Голосовой ввод — предпросмотр"
                aria-pressed={voiceHint}
                onClick={() => setVoiceHint((v) => !v)}
              >
                <Mic />
              </InputGroupButton>
              <InputGroupButton
                type="submit"
                variant="default"
                size="icon-sm"
                aria-label="Отправить пример сообщения"
                disabled={!input.trim()}
              >
                <ArrowUp />
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </form>
        <p className="text-center text-xs text-muted-foreground">
          Дизайн-превью · ответы по сценарию, задачи не сохраняются
        </p>
      </div>
    </div>
  );
}

function Miniature({ id, open }: { id: VariantId; open: () => void }) {
  return (
    <div className="relative flex h-80 flex-col overflow-hidden rounded-xl border bg-muted/40 p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2 pb-3">
        <span className="text-xs font-medium">CallMe / Доска задач</span>
        <Badge variant="outline">Пример</Badge>
      </div>
      <div className="grid flex-1 grid-cols-2 gap-3" aria-hidden="true">
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">К выполнению · 2</p>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Подготовить запуск</CardTitle>
              <CardDescription>Материалы и презентация</CardDescription>
            </CardHeader>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Встреча с командой</CardTitle>
              <CardDescription>Завтра, 11:00</CardDescription>
            </CardHeader>
          </Card>
        </div>
        <Card
          size="sm"
          className={cn(
            "absolute overflow-hidden",
            id === "side" && "inset-x-3 top-12 h-52",
            id === "floating" && "inset-x-3 top-12 h-52",
            id === "focus" && "inset-x-3 top-12 h-52 text-center",
            id === "workspace" && "inset-x-3 top-12 h-52",
          )}
        >
          <CardHeader>
            <CardTitle>
              <AudioLines className="mb-2 size-5" />
              {id === "focus" ? "Давайте обсудим" : "ИИ-помощник"}
            </CardTitle>
            <CardDescription>
              {id === "workspace"
                ? "Пространство для ваших планов"
                : "С чего начнём?"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Message>
              <MessageContent>
                <Bubble variant="secondary">
                  <BubbleContent>Помоги с планами</BubbleContent>
                </Bubble>
              </MessageContent>
            </Message>
          </CardContent>
        </Card>
      </div>
      <div
        className={cn(
          "absolute bottom-3 right-3 left-3 flex",
          id === "focus"
            ? "justify-center"
            : id === "workspace"
              ? "justify-start"
              : "justify-end",
        )}
      >
        <Launcher variant={id} onClick={open} />
      </div>
    </div>
  );
}

function Preview({
  id,
  back,
  choose,
  selected,
}: {
  id: VariantId;
  back: () => void;
  choose: () => void;
  selected: boolean;
}) {
  const variant = variants.find((v) => v.id === id)!;
  const [open, setOpen] = useState(true);
  const [lines, setLines] = useState<ChatLine[]>([]);
  const launcher = useRef<HTMLDivElement>(null);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);
  function close() {
    setOpen(false);
    requestAnimationFrame(() =>
      launcher.current?.querySelector("button")?.focus(),
    );
  }
  function send(text: string) {
    const response =
      text === suggestions[0]
        ? "В примере на сегодня два дела: материалы к запуску и встреча с командой. С чего начнём?"
        : text === suggestions[2]
          ? "Как называется встреча или с кем она будет?"
          : "На какой день запланируем задачу? Можно также указать время и исполнителя.";
    setLines((current) => [
      ...current,
      { id: Date.now(), role: "user", text },
      { id: Date.now() + 1, role: "assistant", text: response },
    ]);
  }
  const content = (
    <Chat
      variant={id}
      lines={lines}
      send={send}
      reset={() => setLines(sample)}
      welcome={() => setLines([])}
    />
  );
  const previewActions = (
    <div className="flex flex-wrap gap-2 pt-2">
      <Button variant="ghost" size="sm" onClick={back}>
        <ArrowLeft data-icon="inline-start" />К вариантам
      </Button>
      <Button variant="outline" size="sm" onClick={close}>
        Показать кнопку на доске
      </Button>
      <Button
        size="sm"
        variant={selected ? "secondary" : "default"}
        onClick={choose}
      >
        {selected && <Check data-icon="inline-start" />}
        {selected ? "Вариант выбран" : "Выбрать вариант"}
      </Button>
    </div>
  );
  const fullChat = (
    <div className="flex min-h-0 flex-1">
      {(id === "side" || id === "workspace") && (
        <aside
          className="hidden w-64 shrink-0 flex-col gap-5 border-r bg-muted/30 p-6 lg:flex"
          aria-label="Быстрые запросы"
        >
          <Avatar className="size-12">
            <AvatarFallback>
              <AudioLines />
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col gap-2">
            <h2 className="font-semibold">
              {id === "workspace"
                ? "Ваше пространство"
                : "Рядом с вашими планами"}
            </h2>
            <p className="text-sm text-muted-foreground">
              Задачи, встречи и расписание — начните с запроса.
            </p>
          </div>
          {suggestions.map((text) => (
            <Button
              key={text}
              variant="outline"
              className="justify-start"
              onClick={() => send(text)}
            >
              {text}
            </Button>
          ))}
          <Badge variant="outline">Запуск CallMe</Badge>
        </aside>
      )}
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col pt-4",
          id === "floating" && "mx-auto max-w-3xl",
          id === "workspace" && "lg:px-8",
        )}
      >
        {content}
      </div>
    </div>
  );
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-8">
        <Button variant="ghost" onClick={back}>
          <ArrowLeft data-icon="inline-start" />К вариантам
        </Button>
        <div className="flex items-center gap-2">
          <Badge variant="outline">Предпросмотр</Badge>
          <span className="text-sm font-medium">{variant.title}</span>
        </div>
        <Button variant={selected ? "secondary" : "default"} onClick={choose}>
          {selected && <Check data-icon="inline-start" />}
          {selected ? "Вариант выбран" : "Выбрать этот вариант"}
        </Button>
      </header>
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-4 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">
              CallMe / Запуск продукта
            </p>
            <h1 className="mt-2 text-2xl font-semibold">
              {id === "workspace" && open ? "ИИ-помощник" : "Доска задач"}
            </h1>
          </div>
          {id === "workspace" && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={close}>
                <LayoutGrid data-icon="inline-start" />
                Доска
              </Button>
              <div ref={launcher}>
                <Launcher
                  variant={id}
                  onClick={() => setOpen(true)}
                  expanded={open}
                />
              </div>
            </div>
          )}
        </div>
        <div className="grid gap-4 pb-24 md:grid-cols-3">
          {["К выполнению", "В работе", "Готово"].map((column, index) => (
            <section
              key={column}
              className="flex min-h-64 flex-col gap-4 rounded-xl bg-muted/50 p-4"
            >
              <h2 className="text-sm font-medium">
                {column}{" "}
                <span className="ml-2 text-muted-foreground">
                  {index === 0 ? 2 : 1}
                </span>
              </h2>
              {(index === 0
                ? ["Подготовить запуск CallMe", "Согласовать презентацию"]
                : index === 1
                  ? ["Собрать обратную связь"]
                  : ["Обсудить план с командой"]
              ).map((title) => (
                <Card key={title}>
                  <CardHeader>
                    <CardDescription>Запуск продукта</CardDescription>
                    <CardTitle>{title}</CardTitle>
                    <CardDescription>
                      Собрать материалы и договориться о следующих шагах.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Badge variant="outline">Обычный</Badge>
                      <span className="text-xs text-muted-foreground">
                        Завтра · 12:00
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </section>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {variant.button}. Нажмите, чтобы открыть помощника и попробовать
          диалог.
        </p>
      </div>
      {id !== "workspace" && (
        <div
          ref={launcher}
          className={cn(
            "fixed bottom-5",
            id === "focus" ? "inset-x-4 flex justify-center" : "right-5",
          )}
        >
          <Launcher
            variant={id}
            onClick={() => setOpen((v) => !v)}
            expanded={open}
          />
        </div>
      )}
      {id === "side" ? (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              launcher.current?.querySelector("button")?.focus();
            }}
            className="data-[side=right]:w-full data-[side=right]:sm:max-w-none h-dvh gap-0"
          >
            <SheetHeader className="shrink-0 border-b pr-12">
              <SheetTitle>CallMe — ИИ-помощник</SheetTitle>
              <SheetDescription>
                {variant.title} · полноэкранный вариант
              </SheetDescription>
              {previewActions}
            </SheetHeader>
            {fullChat}
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              launcher.current?.querySelector("button")?.focus();
            }}
            className="inset-0 flex h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none p-0 sm:max-w-none"
          >
            <DialogHeader className="shrink-0 border-b p-4 pr-12 text-left">
              <DialogTitle>
                {id === "focus" ? "Разговор с CallMe" : "CallMe — ваш помощник"}
              </DialogTitle>
              <DialogDescription>
                {variant.title} · полноэкранный вариант
              </DialogDescription>
              {previewActions}
            </DialogHeader>
            {fullChat}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

export function AssistantGallery() {
  const [dark, setDark] = useState(false);
  const [savedChoice, setSavedChoice] = useState(true);
  const [active, setActive] = useState<VariantId | null>(null);
  const [selected, setSelected] = useState<VariantId | null>(() => {
    try {
      const saved = localStorage.getItem("callme-assistant-choice");
      return variants.find((v) => v.id === saved)?.id || null;
    } catch {
      return null;
    }
  });
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  function choose(id: VariantId) {
    const next = selected === id ? null : id;
    setSelected(next);
    try {
      if (next) localStorage.setItem("callme-assistant-choice", next);
      else localStorage.removeItem("callme-assistant-choice");
      setSavedChoice(true);
    } catch {
      setSavedChoice(false);
    }
  }
  if (active)
    return (
      <Preview
        key={active}
        id={active}
        back={() => setActive(null)}
        choose={() => choose(active)}
        selected={selected === active}
      />
    );
  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-4 sm:px-8">
          <a href="/" className="flex items-center gap-2 font-semibold">
            <AudioLines className="size-5 text-primary" />
            CallMe
          </a>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label={dark ? "Светлая тема" : "Тёмная тема"}
              onClick={() => setDark((v) => !v)}
            >
              {dark ? <Sun /> : <Moon />}
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href="/cards.html">Карточки</a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href="/">К доске</a>
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-8 sm:px-8 sm:py-12">
        <section className="flex flex-col gap-4">
          <div>
            <Badge variant="secondary">4 полноэкранных варианта</Badge>
          </div>
          <h1 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-5xl sm:leading-tight">
            Помощник, которому
            <br />
            <span className="text-primary">есть место на вашей доске.</span>
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Сравните, как он появляется на экране и как выглядит разговор.
            Откройте вариант на весь экран, попробуйте переписку и посмотрите
            кнопку запуска на доске.
          </p>
        </section>
        <Card>
          <CardHeader>
            <CardTitle>Три варианта помощника на главном экране</CardTitle>
            <CardDescription>
              Кнопка по центру, в углу или широкая строка. Сравните поведение
              чата и выберите свой вариант.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <a href="/assistant-board.html">
                Сравнить три варианта
                <ArrowUpRight data-icon="inline-end" />
              </a>
            </Button>
          </CardContent>
        </Card>
        {selected && (
          <Alert>
            <Check />
            <AlertTitle>
              Выбран вариант {variants.findIndex((v) => v.id === selected) + 1}{" "}
              · {variants.find((v) => v.id === selected)?.title}
            </AlertTitle>
            <AlertDescription>
              {savedChoice
                ? "Выбор сохранён в этом браузере."
                : "Выбор отмечен до перезагрузки страницы."}{" "}
              Назовите номер в чате, чтобы применить его к основному приложению.
            </AlertDescription>
          </Alert>
        )}
        <div className="grid gap-x-8 gap-y-10 lg:grid-cols-2">
          {variants.map((variant, index) => (
            <section
              key={variant.id}
              aria-label={`Вариант ${index + 1}: ${variant.title}`}
              className="flex min-w-0 flex-col gap-4"
            >
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-muted-foreground">
                  0{index + 1}
                </span>
                <div>
                  <h2 className="text-lg font-semibold">{variant.title}</h2>
                  <p className="text-xs text-muted-foreground">
                    {variant.lead}
                  </p>
                </div>
              </div>
              <Miniature id={variant.id} open={() => setActive(variant.id)} />
              <div className="flex flex-1 flex-col gap-3">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {variant.panel}
                </p>
                <p className="text-xs font-medium">{variant.fit}</p>
                <div className="mt-auto flex flex-wrap gap-2 pt-1">
                  <Button
                    variant="outline"
                    onClick={() => setActive(variant.id)}
                    aria-label={`Посмотреть вариант ${index + 1}`}
                  >
                    <ArrowUpRight data-icon="inline-start" />
                    Посмотреть
                  </Button>
                  <Button
                    variant={selected === variant.id ? "default" : "ghost"}
                    onClick={() => choose(variant.id)}
                    aria-pressed={selected === variant.id}
                    aria-label={`Выбрать вариант ${index + 1}`}
                  >
                    {selected === variant.id && (
                      <Check data-icon="inline-start" />
                    )}
                    {selected === variant.id ? "Выбрано" : "Выбрать"}
                  </Button>
                </div>
              </div>
            </section>
          ))}
        </div>
        <Separator />
        <footer className="flex flex-wrap justify-between gap-3 text-xs text-muted-foreground">
          <span>CallMe / Исследование интерфейса помощника</span>
          <span>Демонстрационные данные · без обращения к ИИ и микрофону</span>
        </footer>
      </main>
    </div>
  );
}
