import { useState } from "react";
import type {
  CalendarEvent,
  Command,
  Draft,
  EventKind,
  Project,
  RelatedLink,
  TeamMember,
  Priority,
  TaskStatus,
} from "@/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldGroup,
  FieldSet,
  FieldLabel,
  FieldDescription,
  FieldError,
} from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, ExternalLink, Video, ArrowRight } from "lucide-react";
import { kindNames, priorityNames, statusNames, statusOf } from "@/lib/events";
import { linkError, serviceNames } from "@/lib/links";
import { Separator } from "@/components/ui/separator";
export function EventEditor({
  event,
  onClose,
  onAction,
  busy,
  error,
  projects,
  projectId,
  members,
  readOnly = false,
}: {
  event: CalendarEvent | "new";
  onClose: () => void;
  onAction: (c: Command) => Promise<boolean>;
  busy: boolean;
  error: string;
  projects: Project[];
  projectId: string | null;
  members: TeamMember[];
  readOnly?: boolean;
}) {
  const initial =
    event === "new"
      ? {
          title: "",
          kind: "task" as EventKind,
          date: null,
          time: null,
          duration: null,
          projectId,
          priority: "normal" as Priority,
          assigneeId: null,
          callUrl: null,
          links: [],
        }
      : event;
  const initialDraft: Draft = {
    title: initial.title,
    description: "description" in initial ? initial.description || "" : "",
    kind: initial.kind,
    date: initial.date,
    time: initial.time,
    duration: initial.duration,
    projectId: initial.projectId ?? null,
    priority: initial.priority || "normal",
    assigneeId: initial.assigneeId ?? null,
    callUrl: initial.callUrl ?? null,
    links: initial.links || [],
  };
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initialDraft);
  const [destination, setDestination] = useState<TaskStatus>(
    event === "new" ? "todo" : statusOf(event),
  );
  const [attempt, setAttempt] = useState(false);
  const errors: Record<string, string> = {};
  if (!draft.title.trim()) errors.title = "Введите название записи.";
  if (draft.kind === "meeting" && !draft.date)
    errors.date = "Укажите дату встречи.";
  if (draft.time && !draft.date) errors.date = "Для времени нужна дата.";
  if (draft.kind === "meeting" && !draft.time)
    errors.time = "Укажите время начала.";
  if (
    draft.kind === "meeting" &&
    (!draft.duration || draft.duration < 1 || draft.duration > 1440)
  )
    errors.duration = "Укажите длительность от 1 до 1440 минут.";
  if (draft.callUrl) {
    const message = linkError(draft.callUrl, "telemost");
    if (message) errors.callUrl = message;
  }
  draft.links?.forEach((link, i) => {
    const message = linkError(link.url, link.service);
    if (message || !link.label.trim())
      errors[`link-${i}`] = message || "Укажите название материала.";
  });
  function editLink(index: number, patch: Partial<RelatedLink>) {
    setDraft((d) => ({
      ...d,
      links: d.links?.map((link, i) =>
        i === index ? { ...link, ...patch } : link,
      ),
    }));
  }
  const edit = (field: keyof Draft, value: string | number | null) =>
    setDraft((d) => ({ ...d, [field]: value }));
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {event === "new" ? "Новая запись" : "Детали записи"}
          </DialogTitle>
          <DialogDescription>
            Дата и время — по Москве. Поля со звёздочкой обязательны.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            if (readOnly) return;
            setAttempt(true);
            if (Object.keys(errors).length) return;
            const ok = await onAction({
              action: event === "new" ? "create" : "update",
              ...draft,
              title: draft.title.trim(),
              ...(event === "new"
                ? {}
                : { id: event.id, revision: event.revision }),
            });
            if (ok) onClose();
          }}
        >
          <FieldSet disabled={readOnly || busy}>
            <FieldGroup>
              {readOnly && (
                <Alert>
                  <AlertDescription>
                    Вы можете просматривать запись. Изменения доступны владельцу
                    и участникам команды.
                  </AlertDescription>
                </Alert>
              )}
              <Field>
                <FieldLabel htmlFor="event-kind">Тип записи *</FieldLabel>
                <Select
                  value={draft.kind}
                  onValueChange={(v) => edit("kind", v)}
                >
                  <SelectTrigger id="event-kind" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {Object.entries(kindNames).map(([v, label]) => (
                        <SelectItem key={v} value={v}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field data-invalid={attempt && !!errors.title}>
                <FieldLabel htmlFor="event-title">Название *</FieldLabel>
                <Input
                  id="event-title"
                  autoFocus
                  maxLength={300}
                  value={draft.title}
                  onChange={(e) => edit("title", e.target.value)}
                  aria-invalid={attempt && !!errors.title}
                  aria-describedby={
                    attempt && errors.title ? "title-error" : undefined
                  }
                />
                {attempt && errors.title && (
                  <FieldError id="title-error">{errors.title}</FieldError>
                )}
              </Field>
              <Field>
                <FieldLabel htmlFor="event-description">Описание</FieldLabel>
                <Textarea
                  id="event-description"
                  value={draft.description || ""}
                  onChange={(e) => edit("description", e.target.value)}
                  maxLength={4000}
                  rows={4}
                  placeholder="Детали, ожидаемый результат и что важно учесть…"
                  className="min-h-28"
                />
                <FieldDescription>
                  {(draft.description || "").length} / 4000 символов
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="event-project">Проект</FieldLabel>
                <Select
                  value={draft.projectId || "none"}
                  onValueChange={(v) =>
                    edit("projectId", v === "none" ? null : v)
                  }
                >
                  <SelectTrigger id="event-project" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="none">Без проекта</SelectItem>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <FieldGroup className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="event-priority">Приоритет</FieldLabel>
                  <Select
                    value={draft.priority || "normal"}
                    disabled={readOnly || busy}
                    onValueChange={(v) => edit("priority", v)}
                  >
                    <SelectTrigger id="event-priority" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {Object.entries(priorityNames).map(([v, name]) => (
                          <SelectItem key={v} value={v}>
                            {name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="event-assignee">Исполнитель</FieldLabel>
                  <Select
                    value={draft.assigneeId || "none"}
                    disabled={readOnly || busy}
                    onValueChange={(v) =>
                      edit("assigneeId", v === "none" ? null : v)
                    }
                  >
                    <SelectTrigger id="event-assignee" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="none">Не назначен</SelectItem>
                        {members
                          .filter((m) => m.role !== "viewer")
                          .map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.name}
                            </SelectItem>
                          ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  {!members.length && (
                    <FieldDescription>
                      Исполнители появятся после создания команды в настройках.
                    </FieldDescription>
                  )}
                </Field>
              </FieldGroup>
              <FieldGroup className="grid grid-cols-2 gap-4">
                <Field data-invalid={attempt && !!errors.date}>
                  <FieldLabel htmlFor="event-date">
                    Дата{draft.kind === "meeting" ? " *" : ""}
                  </FieldLabel>
                  <Input
                    id="event-date"
                    type="date"
                    value={draft.date || ""}
                    onChange={(e) => edit("date", e.target.value || null)}
                    aria-invalid={attempt && !!errors.date}
                  />
                  {attempt && errors.date && (
                    <FieldError>{errors.date}</FieldError>
                  )}
                </Field>
                <Field data-invalid={attempt && !!errors.time}>
                  <FieldLabel htmlFor="event-time">
                    Время{draft.kind === "meeting" ? " *" : ""}
                  </FieldLabel>
                  <Input
                    id="event-time"
                    type="time"
                    value={draft.time || ""}
                    onChange={(e) => edit("time", e.target.value || null)}
                    aria-invalid={attempt && !!errors.time}
                  />
                  {attempt && errors.time && (
                    <FieldError>{errors.time}</FieldError>
                  )}
                </Field>
              </FieldGroup>
              {draft.kind === "meeting" ? (
                <Field data-invalid={attempt && !!errors.duration}>
                  <FieldLabel htmlFor="event-duration">
                    Длительность, минут *
                  </FieldLabel>
                  <Input
                    id="event-duration"
                    type="number"
                    min={1}
                    max={1440}
                    value={draft.duration || ""}
                    onChange={(e) =>
                      edit(
                        "duration",
                        e.target.value ? Number(e.target.value) : null,
                      )
                    }
                    aria-invalid={attempt && !!errors.duration}
                  />
                  {attempt && errors.duration && (
                    <FieldError>{errors.duration}</FieldError>
                  )}
                </Field>
              ) : (
                <FieldDescription>
                  Можно оставить дату и время пустыми — запись сохранится без
                  срока.
                </FieldDescription>
              )}
              {draft.kind === "reminder" && (
                <Alert>
                  <AlertDescription>
                    Напоминание появится в расписании. Автоматические
                    уведомления не отправляются.
                  </AlertDescription>
                </Alert>
              )}
              <Separator />
              <Field data-invalid={attempt && !!errors.callUrl}>
                <FieldLabel htmlFor="event-call">Созвон в Телемосте</FieldLabel>
                <Input
                  id="event-call"
                  placeholder="https://telemost.yandex.ru/j/…"
                  value={draft.callUrl || ""}
                  maxLength={2048}
                  onChange={(e) =>
                    edit("callUrl", e.target.value.trim() || null)
                  }
                  aria-invalid={attempt && !!errors.callUrl}
                />
                <FieldDescription>
                  Создайте встречу в Телемосте и вставьте её ссылку. Запись
                  останется открытой.
                </FieldDescription>
                {attempt && errors.callUrl && (
                  <FieldError>{errors.callUrl}</FieldError>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button asChild type="button" variant="outline" size="sm">
                    <a
                      href="https://telemost.yandex.ru/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink data-icon="inline-start" />
                      Открыть Телемост
                    </a>
                  </Button>
                  {draft.callUrl && !errors.callUrl && (
                    <Button asChild type="button" variant="outline" size="sm">
                      <a
                        href={draft.callUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Video data-icon="inline-start" />К созвону
                      </a>
                    </Button>
                  )}
                </div>
              </Field>
              <FieldGroup>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">Связанные материалы</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={(draft.links?.length || 0) >= 12}
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        links: [
                          ...(d.links || []),
                          { label: "", url: "", service: "telegram" },
                        ],
                      }))
                    }
                  >
                    <Plus data-icon="inline-start" />
                    Добавить ссылку
                  </Button>
                </div>
                <FieldDescription>
                  Сообщение из Telegram, заметка или другой материал. Доступ
                  определяется настройками исходного сервиса.
                </FieldDescription>
                {draft.links?.map((link, i) => (
                  <FieldGroup key={i} className="rounded-lg border p-3">
                    <Field>
                      <FieldLabel htmlFor={`link-service-${i}`}>
                        Сервис {i + 1}
                      </FieldLabel>
                      <Select
                        value={link.service}
                        onValueChange={(v) =>
                          editLink(i, { service: v as RelatedLink["service"] })
                        }
                      >
                        <SelectTrigger
                          id={`link-service-${i}`}
                          className="w-full"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {Object.entries(serviceNames).map(([v, name]) => (
                              <SelectItem key={v} value={v}>
                                {name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field data-invalid={attempt && !link.label.trim()}>
                      <FieldLabel htmlFor={`link-label-${i}`}>
                        Название материала *
                      </FieldLabel>
                      <Input
                        id={`link-label-${i}`}
                        value={link.label}
                        maxLength={100}
                        placeholder="Например, итоги обсуждения"
                        onChange={(e) => editLink(i, { label: e.target.value })}
                        aria-invalid={attempt && !link.label.trim()}
                      />
                    </Field>
                    <Field data-invalid={attempt && !!errors[`link-${i}`]}>
                      <FieldLabel htmlFor={`link-url-${i}`}>
                        Ссылка *
                      </FieldLabel>
                      <Input
                        id={`link-url-${i}`}
                        value={link.url}
                        maxLength={2048}
                        placeholder={
                          link.service === "telegram"
                            ? "https://t.me/…"
                            : "https://…"
                        }
                        onChange={(e) =>
                          editLink(i, { url: e.target.value.trim() })
                        }
                        aria-invalid={attempt && !!errors[`link-${i}`]}
                      />
                      {attempt && errors[`link-${i}`] && (
                        <FieldError>{errors[`link-${i}`]}</FieldError>
                      )}
                    </Field>
                    <div className="flex justify-between gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setDraft((d) => ({
                            ...d,
                            links: d.links?.filter((_, index) => i !== index),
                          }))
                        }
                      >
                        <Trash2 data-icon="inline-start" />
                        Убрать
                      </Button>
                      {!linkError(link.url, link.service) && (
                        <Button
                          asChild
                          type="button"
                          variant="outline"
                          size="sm"
                        >
                          <a
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Открыть
                            <ExternalLink data-icon="inline-end" />
                          </a>
                        </Button>
                      )}
                    </div>
                  </FieldGroup>
                ))}
              </FieldGroup>
              {event !== "new" && !readOnly && (
                <Field>
                  <FieldLabel htmlFor="event-column">
                    Переместить в колонку
                  </FieldLabel>
                  <div className="flex flex-wrap gap-2">
                    <Select
                      value={destination}
                      onValueChange={(v) => {
                        if (v === "todo" || v === "in_progress" || v === "done")
                          setDestination(v);
                      }}
                    >
                      <SelectTrigger
                        id="event-column"
                        className="min-w-0 flex-1"
                      >
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
                    <Button
                      type="button"
                      variant="outline"
                      disabled={
                        busy || destination === statusOf(event) || dirty
                      }
                      onClick={async () => {
                        if (
                          await onAction({
                            action: "move",
                            id: event.id,
                            revision: event.revision,
                            status: destination,
                          })
                        )
                          onClose();
                      }}
                    >
                      <ArrowRight data-icon="inline-start" />
                      Переместить
                    </Button>
                  </div>
                  <FieldDescription>
                    Если меняли поля записи, сначала сохраните их. Перенос
                    меняет только колонку.
                  </FieldDescription>
                </Field>
              )}
              {event !== "new" && event.original && (
                <div className="flex flex-col gap-2">
                  <Badge variant="outline">
                    Исходная запись №{event.original.id}
                  </Badge>
                  {event.inferred && (
                    <p className="text-xs text-muted-foreground">
                      Тип определён предположительно. Длительность в исходном
                      наборе не указана.
                    </p>
                  )}
                </div>
              )}
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="flex flex-wrap justify-between gap-2">
                <div className="flex gap-2">
                  {event !== "new" && !readOnly && (
                    <>
                      <Button
                        disabled={busy}
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label="Удалить запись"
                        onClick={async () => {
                          if (
                            await onAction({
                              action: "delete",
                              id: event.id,
                              revision: event.revision,
                            })
                          )
                            onClose();
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </>
                  )}
                </div>
                {!readOnly && (
                  <Button type="submit" disabled={busy}>
                    {busy
                      ? "Сохранение…"
                      : event === "new"
                        ? "Создать запись"
                        : "Сохранить"}
                  </Button>
                )}
              </div>
            </FieldGroup>
          </FieldSet>
        </form>
      </DialogContent>
    </Dialog>
  );
}
