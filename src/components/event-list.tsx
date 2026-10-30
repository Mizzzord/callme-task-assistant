import { useState } from "react";
import type { CalendarEvent } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
} from "@/components/ui/input-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty";
import {
  Item,
  ItemGroup,
  ItemContent,
  ItemDescription,
  ItemTitle,
  ItemMedia,
  ItemActions,
} from "@/components/ui/item";
import {
  Search,
  CalendarDays,
  CircleCheck,
  Bell,
  ArrowUpRight,
  ListTodo,
  Plus,
} from "lucide-react";
import { eventDate, kindNames } from "@/lib/events";
export function EventList({
  events,
  today,
  open,
  create,
  compact = false,
  readOnly = false,
}: {
  events: CalendarEvent[];
  today: string;
  open: (e: CalendarEvent) => void;
  create: () => void;
  compact?: boolean;
  readOnly?: boolean;
}) {
  const [period, setPeriod] = useState(compact ? "today" : "all");
  const [kind, setKind] = useState("all");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(30);
  const tomorrow = new Date(Date.parse(today + "T12:00:00+03:00") + 86400000)
    .toISOString()
    .slice(0, 10);
  const weekEnd = new Date(
    Date.parse(today + "T12:00:00+03:00") +
      (7 - (new Date(today + "T12:00:00+03:00").getUTCDay() || 7)) * 86400000,
  )
    .toISOString()
    .slice(0, 10);
  const filtered = events
    .filter(
      (e) =>
        (kind === "all" || (kind === "done" ? e.completed : e.kind === kind)) &&
        (!query ||
          e.title
            .toLocaleLowerCase("ru")
            .replace(/ё/g, "е")
            .includes(query.toLocaleLowerCase("ru").replace(/ё/g, "е"))) &&
        (period === "all" ||
          (period === "today" && e.date === today) ||
          (period === "tomorrow" && e.date === tomorrow) ||
          (period === "week" &&
            e.date &&
            e.date >= today &&
            e.date <= weekEnd)),
    )
    .sort(
      (a, b) =>
        (a.date || "9999").localeCompare(b.date || "9999") ||
        (a.time || "").localeCompare(b.time || ""),
    );
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-col gap-3">
        <InputGroup>
          <InputGroupInput
            aria-label="Поиск по записям"
            placeholder="Поиск по названию…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(30);
            }}
          />
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
        </InputGroup>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <ToggleGroup
            type="single"
            value={period}
            onValueChange={(v) => {
              if (v) {
                setPeriod(v);
                setLimit(30);
              }
            }}
            size="sm"
            variant="outline"
            aria-label="Период"
          >
            <ToggleGroupItem value="today">Сегодня</ToggleGroupItem>
            <ToggleGroupItem value="tomorrow">Завтра</ToggleGroupItem>
            <ToggleGroupItem value="week">Неделя</ToggleGroupItem>
            <ToggleGroupItem value="all">Все</ToggleGroupItem>
          </ToggleGroup>
          <Select
            value={kind}
            onValueChange={(v) => {
              setKind(v);
              setLimit(30);
            }}
          >
            <SelectTrigger size="sm" aria-label="Тип записей">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">Все типы</SelectItem>
                <SelectItem value="task">Задачи</SelectItem>
                <SelectItem value="meeting">Встречи</SelectItem>
                <SelectItem value="reminder">Напоминания</SelectItem>
                <SelectItem value="done">Выполненные</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{filtered.length} записей</span>
        <span>Московское время</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        {!filtered.length ? (
          <Empty className="py-10">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CalendarDays />
              </EmptyMedia>
              <EmptyTitle>
                {query ? "Ничего не найдено" : "Можно выдохнуть"}
              </EmptyTitle>
              <EmptyDescription>
                {query
                  ? "Попробуйте другое слово или период."
                  : "На этот период записей нет. Добавьте первое дело или посмотрите все записи."}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                variant="outline"
                disabled={readOnly && !query}
                onClick={
                  query
                    ? () => {
                        setQuery("");
                        setPeriod("all");
                      }
                    : create
                }
              >
                {query ? (
                  "Сбросить поиск"
                ) : (
                  <>
                    <Plus data-icon="inline-start" />
                    Добавить дело
                  </>
                )}
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <ItemGroup>
            {filtered.slice(0, limit).map((e) => (
              <Item key={e.id} variant="outline" size="sm">
                <ItemMedia variant="icon">
                  {e.completed ? (
                    <CircleCheck />
                  ) : e.kind === "meeting" ? (
                    <CalendarDays />
                  ) : e.kind === "reminder" ? (
                    <Bell />
                  ) : (
                    <ListTodo />
                  )}
                </ItemMedia>
                <ItemContent className="min-w-0">
                  <ItemTitle className="line-clamp-none break-words">
                    {e.title}
                  </ItemTitle>
                  <ItemDescription>{eventDate(e)}</ItemDescription>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Badge variant="secondary">
                      {e.completed ? "Выполнено" : kindNames[e.kind]}
                    </Badge>
                    {e.inferred && (
                      <Badge variant="outline">Тип предположен</Badge>
                    )}
                  </div>
                </ItemContent>
                <ItemActions>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Открыть: ${e.title}`}
                    onClick={() => open(e)}
                  >
                    <ArrowUpRight />
                  </Button>
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        )}
        {filtered.length > limit && (
          <Button
            className="mt-4 w-full"
            variant="outline"
            onClick={() => setLimit((v) => v + 30)}
          >
            Показать ещё · {filtered.length - limit}
          </Button>
        )}
      </div>
    </div>
  );
}
