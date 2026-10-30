import { TeamSettings } from "@/components/team-settings";
import type { AccountState } from "@/types";
import type { AccountMutation } from "@/components/auth-dialog";
import { useState } from "react";
import {
  Video,
  MessageSquare,
  NotebookPen,
  Mic,
  ExternalLink,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
const services = [
  {
    name: "Яндекс Телемост",
    icon: Video,
    description: "Ссылка на созвон прямо в карточке задачи или встречи.",
    detail:
      "Откройте Телемост, создайте встречу и вставьте её ссылку в поле «Созвон в Телемосте». Автоматическое создание из приложения пока не подключено.",
    href: "https://telemost.yandex.ru/",
    action: "Открыть Телемост",
  },
  {
    name: "Telegram",
    icon: MessageSquare,
    description: "Обсуждения и сообщения рядом с задачей.",
    detail:
      "Скопируйте ссылку на сообщение или чат и добавьте её в связанные материалы. Приложение не читает переписку и не отправляет сообщения.",
    href: "https://web.telegram.org/",
    action: "Открыть Telegram",
  },
  {
    name: "Яндекс Заметки",
    icon: NotebookPen,
    description: "Идеи, конспекты и итоги встреч в связанных материалах.",
    detail:
      "Добавьте доступный вам адрес заметки как связанный материал. Содержимое не импортируется; при открытии может потребоваться вход в Яндекс.",
    href: "https://disk.yandex.ru/notes",
    action: "Открыть заметки",
  },
];
export function SettingsPanel({
  open,
  onOpenChange,
  voiceAvailable,
  account,
  mutate,
  busy,
  onAuth,
  tab = "team",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  voiceAvailable: boolean;
  account?: AccountState;
  mutate: AccountMutation;
  busy: boolean;
  onAuth: (mode: "login" | "register") => void;
  tab?: "team" | "services";
}) {
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const [theme, setTheme] = useState(
    document.documentElement.classList.contains("dark") ? "dark" : "light",
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Настройки</DialogTitle>
          <DialogDescription>
            Команда, права доступа, внешний вид и сервисы.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue={tab}>
          <TabsList>
            <TabsTrigger value="team">Команда</TabsTrigger>
            <TabsTrigger value="services">Сервисы</TabsTrigger>
            <TabsTrigger value="appearance">Внешний вид</TabsTrigger>
          </TabsList>
          <TabsContent value="team" className="pt-3">
            <TeamSettings
              key={account?.team.id}
              account={account}
              mutate={mutate}
              busy={busy}
              onAuth={onAuth}
            />
          </TabsContent>
          <TabsContent value="services" className="flex flex-col gap-3 pt-3">
            {services.map((s) => (
              <Card key={s.name} size="sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <s.icon />
                    {s.name}
                  </CardTitle>
                  <CardDescription>{s.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Badge variant="outline">Ссылки · без синхронизации</Badge>
                  <p className="mt-3 text-sm text-muted-foreground">
                    {s.detail}
                  </p>
                </CardContent>
                <CardFooter>
                  <Button asChild variant="outline" size="sm">
                    <a href={s.href} target="_blank" rel="noopener noreferrer">
                      {s.action}
                      <ExternalLink data-icon="inline-end" />
                    </a>
                  </Button>
                </CardFooter>
              </Card>
            ))}
            <Card size="sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mic />
                  Голосовой ассистент
                </CardTitle>
                <CardDescription>
                  {voiceAvailable
                    ? "Сервис настроен. Запустите разговор кнопкой микрофона."
                    : "Пока не подключён. Текстовый чат и формы доступны."}
                </CardDescription>
              </CardHeader>
            </Card>
          </TabsContent>
          <TabsContent value="appearance" className="pt-4">
            <FieldGroup>
              <Field>
                <FieldLabel>Тема приложения</FieldLabel>
                <ToggleGroup
                  type="single"
                  value={theme}
                  variant="outline"
                  onValueChange={(v) => {
                    if (!v) return;
                    setTheme(v);
                    document.documentElement.classList.toggle(
                      "dark",
                      v === "dark",
                    );
                    try {
                      localStorage.setItem("ryadom-theme", v);
                    } catch {
                      setStorageUnavailable(true);
                    }
                  }}
                  aria-label="Тема приложения"
                >
                  <ToggleGroupItem value="light">Светлая</ToggleGroupItem>
                  <ToggleGroupItem value="dark">Тёмная</ToggleGroupItem>
                </ToggleGroup>
                <FieldDescription>
                  {storageUnavailable
                    ? "Хранилище браузера недоступно. Тема применена до перезагрузки."
                    : "Выбор сохраняется в этом браузере."}
                </FieldDescription>
              </Field>
            </FieldGroup>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
