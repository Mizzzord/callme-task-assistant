import { useEffect, useState } from "react";
import type { AccountState, TeamInvite, TeamMember } from "@/types";
import type { AccountMutation } from "@/components/auth-dialog";
import { request } from "@/lib/api";
import { roleNames } from "@/lib/events";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from "@/components/ui/select";
import {
  Item,
  ItemGroup,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
} from "@/components/ui/item";
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
import { Separator } from "@/components/ui/separator";
import { Copy, LogOut, Users, X } from "lucide-react";
export function TeamSettings({
  account,
  mutate,
  busy,
  onAuth,
}: {
  account?: AccountState;
  mutate: AccountMutation;
  busy: boolean;
  onAuth: (mode: "login" | "register") => void;
}) {
  const [name, setName] = useState(account?.team.name || "");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [role, setRole] = useState<"member" | "viewer">("member");
  const [invites, setInvites] = useState<TeamInvite[]>([]);
  const [inviteUrl, setInviteUrl] = useState("");
  const [confirm, setConfirm] = useState<{
    member: TeamMember;
    role?: "member" | "viewer";
    remove?: true;
  }>();
  const owner = account?.role === "owner";
  useEffect(() => {
    if (!owner) return;
    let active = true;
    request<TeamInvite[]>("/api/team/invites")
      .then((v) => {
        if (active) setInvites(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [owner, account?.team.id]);
  async function run(work: () => Promise<void>) {
    setError("");
    setNotice("");
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Действие не выполнено.");
    }
  }
  async function refreshInvites() {
    setInvites(await request<TeamInvite[]>("/api/team/invites"));
  }
  if (!account?.user)
    return (
      <div className="flex flex-col gap-4">
        <Alert>
          <Users />
          <AlertDescription>
            Создайте аккаунт, чтобы пригласить команду, назначать исполнителей и
            работать над общими задачами.
          </AlertDescription>
        </Alert>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => onAuth("register")}>Создать аккаунт</Button>
          <Button variant="outline" onClick={() => onAuth("login")}>
            Войти
          </Button>
        </div>
      </div>
    );
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <Avatar>
          <AvatarFallback>
            {account.user.name.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{account.user.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {account.user.email}
          </p>
        </div>
        <Badge variant="secondary">{roleNames[account.role!]}</Badge>
      </div>
      {account.teams.length > 1 && (
        <Field>
          <FieldLabel htmlFor="active-team">Команда</FieldLabel>
          <Select
            value={account.team.id}
            disabled={busy}
            onValueChange={(teamId) =>
              void run(async () => {
                await mutate("/api/team/switch", { teamId });
              })
            }
          >
            <SelectTrigger id="active-team" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {account.teams.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      )}
      {owner ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await mutate("/api/team/settings", {
                name,
                revision: account.team.revision,
              });
              setNotice("Название команды сохранено.");
            });
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="team-name">Название команды *</FieldLabel>
              <div className="flex gap-2">
                <Input
                  id="team-name"
                  value={name}
                  maxLength={80}
                  required
                  onChange={(e) => setName(e.target.value)}
                />
                <Button type="submit" disabled={busy || !name.trim()}>
                  Сохранить
                </Button>
              </div>
            </Field>
          </FieldGroup>
        </form>
      ) : (
        <p className="text-sm font-medium">{account.team.name}</p>
      )}
      <Separator />
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium">Участники команды</p>
        <ItemGroup>
          {account.members.map((m) => (
            <Item key={m.id} variant="outline" size="sm" className="flex-wrap">
              <Avatar className="size-8">
                <AvatarFallback>
                  {m.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <ItemContent className="min-w-0">
                <ItemTitle className="break-words">
                  {m.name}
                  {m.id === account.user?.id ? " · вы" : ""}
                </ItemTitle>
                <ItemDescription className="truncate">
                  {m.email}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                {owner && m.role !== "owner" ? (
                  <>
                    <Select
                      value={m.role}
                      disabled={busy}
                      onValueChange={(v) =>
                        setConfirm({
                          member: m,
                          role: v as "member" | "viewer",
                        })
                      }
                    >
                      <SelectTrigger size="sm" aria-label={`Роль: ${m.name}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="member">Участник</SelectItem>
                          <SelectItem value="viewer">Наблюдатель</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      disabled={busy}
                      aria-label={`Убрать из команды: ${m.name}`}
                      onClick={() => setConfirm({ member: m, remove: true })}
                    >
                      <X />
                    </Button>
                  </>
                ) : (
                  <Badge variant="outline">{roleNames[m.role]}</Badge>
                )}
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
        <p className="text-xs text-muted-foreground">
          Участники редактируют все задачи. Наблюдатели только читают. Командой
          и приглашениями управляет владелец.
        </p>
      </div>
      {owner && (
        <>
          <Separator />
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="invite-role">Роль приглашённого</FieldLabel>
              <Select
                value={role}
                disabled={busy}
                onValueChange={(v) => setRole(v as "member" | "viewer")}
              >
                <SelectTrigger id="invite-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="member">
                      Участник — может редактировать
                    </SelectItem>
                    <SelectItem value="viewer">
                      Наблюдатель — только чтение
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>
                Одноразовая ссылка действует 7 дней. Передайте её нужному
                человеку самостоятельно.
              </FieldDescription>
            </Field>
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const result = await mutate<{ token: string }>(
                    "/api/team/invites",
                    { role },
                  );
                  setInviteUrl(
                    `${window.location.origin}/#invite=${result.token}`,
                  );
                  await refreshInvites();
                })
              }
            >
              Создать приглашение
            </Button>
            {inviteUrl && (
              <Field>
                <FieldLabel htmlFor="invite-link">
                  Ссылка-приглашение
                </FieldLabel>
                <Input id="invite-link" value={inviteUrl} readOnly />
                <Button
                  variant="outline"
                  onClick={() =>
                    void run(async () => {
                      await navigator.clipboard.writeText(inviteUrl);
                      setNotice("Ссылка скопирована.");
                    })
                  }
                >
                  <Copy data-icon="inline-start" />
                  Копировать ссылку
                </Button>
                <FieldDescription>
                  Ссылка даёт доступ к команде после входа. Она отображается
                  только сейчас; при необходимости создайте новую.
                </FieldDescription>
              </Field>
            )}
          </FieldGroup>
          <ItemGroup>
            {invites.map((invite) => (
              <Item key={invite.id} variant="outline" size="sm">
                <ItemContent>
                  <ItemTitle>{roleNames[invite.role]}</ItemTitle>
                  <ItemDescription>
                    {
                      {
                        active: "Действует до",
                        used: "Принято · срок до",
                        revoked: "Отозвано · срок до",
                        expired: "Истекло",
                      }[invite.status]
                    }{" "}
                    {new Date(invite.expiresAt).toLocaleDateString("ru-RU", {
                      timeZone: "Europe/Moscow",
                    })}
                  </ItemDescription>
                </ItemContent>
                {invite.status === "active" && (
                  <ItemActions>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await mutate(
                            `/api/team/invites/${invite.id}/revoke`,
                            {},
                          );
                          setInviteUrl("");
                          await refreshInvites();
                        })
                      }
                    >
                      Отозвать
                    </Button>
                  </ItemActions>
                )}
              </Item>
            ))}
          </ItemGroup>
        </>
      )}
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Separator />
      <Button
        variant="outline"
        disabled={busy}
        onClick={() =>
          void run(async () => {
            await mutate("/api/auth/logout", {});
          })
        }
      >
        <LogOut data-icon="inline-start" />
        Выйти из аккаунта
      </Button>
      <AlertDialog
        open={!!confirm}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirm(undefined);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.remove
                ? "Убрать участника из команды?"
                : "Изменить роль участника?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.member.name}.{" "}
              {confirm?.remove || confirm?.role === "viewer"
                ? "Назначенные этому участнику задачи останутся в команде без исполнителя."
                : "Участник сможет изменять все задачи команды."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                if (confirm)
                  void run(async () => {
                    await mutate(`/api/team/members/${confirm.member.id}`, {
                      role: confirm.role,
                      remove: confirm.remove,
                      revision: confirm.member.revision,
                    });
                    setConfirm(undefined);
                  });
              }}
            >
              Подтвердить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
