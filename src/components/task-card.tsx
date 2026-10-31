import { CalendarDays, Flag, GripVertical, UserRound } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardAction,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { priorityNames } from "@/lib/events";
import type { Priority } from "@/types";

export function TaskCard({
  title,
  description,
  project,
  priority,
  due,
  assignee,
  onOpen,
  disabled = false,
  draggable = false,
}: {
  title: string;
  description?: string;
  project: string;
  priority: Priority;
  due: string;
  assignee?: string | null;
  onOpen: () => void;
  disabled?: boolean;
  draggable?: boolean;
}) {
  const initials = assignee
    ?.trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toLocaleUpperCase("ru");
  return (
    <Card
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={`Открыть: ${title}`}
      aria-disabled={disabled || undefined}
      aria-describedby={draggable ? "task-drag-help" : undefined}
      className="w-full min-w-0 scroll-m-1.5 cursor-pointer outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
      onClick={() => {
        if (!disabled) onOpen();
      }}
      onKeyDown={(event) => {
        if (disabled || event.defaultPrevented) return;
        if (event.key === "Enter" || (!draggable && event.key === " ")) {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <CardHeader className="min-w-0 gap-3 has-data-[slot=card-action]:grid-cols-[minmax(0,1fr)_auto]">
        <CardDescription className="min-w-0 [overflow-wrap:anywhere]">
          {project}
        </CardDescription>
        {draggable && (
          <CardAction>
            <GripVertical
              className="size-4 text-muted-foreground"
              aria-hidden="true"
            />
          </CardAction>
        )}
        <CardTitle className="min-w-0 [overflow-wrap:anywhere]">{title}</CardTitle>
        <CardDescription className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]">
          {description || "Без описания"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-5">
          <div className="flex min-w-0 flex-col gap-2">
            <dt className="text-xs text-muted-foreground">Приоритет</dt>
            <dd>
              <Badge
                variant={
                  priority === "urgent"
                    ? "destructive"
                    : priority === "high"
                      ? "default"
                      : "outline"
                }
              >
                <Flag data-icon="inline-start" />
                {priorityNames[priority]}
              </Badge>
            </dd>
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <dt className="text-xs text-muted-foreground">Срок</dt>
            <dd className="flex items-start gap-1.5 text-xs">
              <CalendarDays className="size-3.5 shrink-0" />
              <span>{due}</span>
            </dd>
          </div>
          <div className="col-span-2 flex min-w-0 flex-col gap-2">
            <dt className="text-xs text-muted-foreground">Исполнитель</dt>
            <dd className="flex min-w-0 items-center gap-2">
              <Avatar size="sm">
                <AvatarFallback>
                  {initials || <UserRound className="size-3" />}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0 [overflow-wrap:anywhere] text-sm">
                {assignee || "Не назначен"}
              </span>
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
