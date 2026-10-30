import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { request } from "@/lib/api";
import { roleNames } from "@/lib/events";
import type { AccountMutation } from "@/components/auth-dialog";
export function InviteDialog({
  token,
  signedIn,
  onAuth,
  onClose,
  mutate,
  busy,
  authOpen,
}: {
  token: string | null;
  signedIn: boolean;
  onAuth: (mode: "login" | "register") => void;
  onClose: () => void;
  mutate: AccountMutation;
  busy: boolean;
  authOpen: boolean;
}) {
  const [info, setInfo] = useState<{
    teamName: string;
    role: "member" | "viewer";
  }>();
  const [error, setError] = useState("");
  useEffect(() => {
    if (!token) return;
    let active = true;
    request<{ teamName: string; role: "member" | "viewer" }>(
      `/api/invites/${encodeURIComponent(token)}`,
    )
      .then((v) => {
        if (active) setInfo(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [token]);
  return (
    <Dialog
      open={!!token && !authOpen}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Приглашение в CallMe</DialogTitle>
          <DialogDescription>
            {info
              ? `Команда «${info.teamName}». Ваша роль: ${roleNames[info.role].toLowerCase()}.`
              : "Проверяем приглашение…"}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : !info ? (
          <Skeleton className="h-20 w-full" />
        ) : signedIn ? (
          <Button
            disabled={busy}
            onClick={async () => {
              try {
                await mutate("/api/invites/accept", { token });
                onClose();
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "Не удалось принять приглашение.",
                );
              }
            }}
          >
            Присоединиться к команде
          </Button>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => onAuth("register")}>
              Создать аккаунт и присоединиться
            </Button>
            <Button variant="outline" onClick={() => onAuth("login")}>
              Войти
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
