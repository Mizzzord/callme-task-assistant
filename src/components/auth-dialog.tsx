import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
export type AccountMutation = <T>(url: string, body: unknown) => Promise<T>;
export function AuthDialog({
  mode,
  onClose,
  onMode,
  mutate,
  busy,
  inviteToken,
  onJoined,
}: {
  mode: "login" | "register" | null;
  onClose: () => void;
  onMode: (m: "login" | "register") => void;
  mutate: AccountMutation;
  busy: boolean;
  inviteToken?: string;
  onJoined: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [teamName, setTeamName] = useState("Моя команда");
  const [error, setError] = useState("");
  return (
    <Dialog
      open={!!mode}
      onOpenChange={(open) => {
        if (!open && !busy) {
          setPassword("");
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === "register" ? "Создать аккаунт CallMe" : "Войти в CallMe"}
          </DialogTitle>
          <DialogDescription>
            {mode === "register"
              ? inviteToken
                ? "Зарегистрируйтесь, чтобы принять приглашение в команду."
                : "Текущие проекты и записи станут пространством вашей команды."
              : "Войдите, чтобы открыть общее пространство команды."}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            try {
              await mutate(`/api/auth/${mode}`, {
                email,
                password,
                ...(mode === "register"
                  ? { name, ...(inviteToken ? { inviteToken } : { teamName }) }
                  : {}),
              });
              setPassword("");
              if (mode === "register" && inviteToken) onJoined();
              onClose();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Не удалось войти.");
            }
          }}
        >
          <FieldGroup>
            {mode === "register" && (
              <Field>
                <FieldLabel htmlFor="account-name">Ваше имя *</FieldLabel>
                <Input
                  id="account-name"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  minLength={2}
                  maxLength={80}
                  required
                />
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor="account-email">
                Электронная почта *
              </FieldLabel>
              <Input
                id="account-email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={254}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="account-password">Пароль *</FieldLabel>
              <Input
                id="account-password"
                type="password"
                autoComplete={
                  mode === "register" ? "new-password" : "current-password"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={10}
                maxLength={128}
                required
              />
              <FieldDescription>
                Не менее 10 символов. Восстановление по почте пока не
                подключено.
              </FieldDescription>
            </Field>
            {mode === "register" && !inviteToken && (
              <Field>
                <FieldLabel htmlFor="initial-team">
                  Название команды *
                </FieldLabel>
                <Input
                  id="initial-team"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  maxLength={80}
                  required
                />
              </Field>
            )}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" disabled={busy}>
              {busy
                ? "Подождите…"
                : mode === "register"
                  ? inviteToken
                    ? "Создать аккаунт и присоединиться"
                    : "Создать аккаунт"
                  : "Войти"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setError("");
                onMode(mode === "login" ? "register" : "login");
              }}
            >
              {mode === "login"
                ? "Нет аккаунта? Зарегистрироваться"
                : "Уже есть аккаунт? Войти"}
            </Button>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
