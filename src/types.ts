export type Priority = "low" | "normal" | "high" | "urgent";
export type TeamRole = "owner" | "member" | "viewer";
export type AccountUser = { id: string; name: string; email: string };
export type TeamMember = AccountUser & { role: TeamRole; revision: number };
export type AccountState = {
  user: AccountUser | null;
  role: TeamRole | null;
  team: { id: string; name: string; revision: number };
  teams: { id: string; name: string; role: TeamRole }[];
  members: TeamMember[];
};
export type TeamInvite = {
  id: string;
  role: "member" | "viewer";
  expiresAt: string;
  status: "active" | "used" | "revoked" | "expired";
};
export type TaskStatus = "todo" | "in_progress" | "done";
export type Project = { id: string; name: string };
export type RelatedLink = {
  label: string;
  url: string;
  service: "telegram" | "yandex_notes" | "other";
};
export type EventKind = "task" | "meeting" | "reminder";
export type CalendarEvent = {
  id: string;
  title: string;
  description?: string;
  kind: EventKind;
  date: string | null;
  time: string | null;
  duration: number | null;
  completed: boolean;
  status?: TaskStatus;
  priority?: Priority;
  assigneeId?: string | null;
  projectId?: string | null;
  callUrl?: string | null;
  links?: RelatedLink[];
  inferred: boolean;
  revision: number;
  original?: { id: string; date: string; time: string; text: string };
  createdAt: string;
  updatedAt: string;
};
export type Draft = Pick<
  CalendarEvent,
  | "title"
  | "description"
  | "kind"
  | "date"
  | "time"
  | "duration"
  | "priority"
  | "assigneeId"
  | "projectId"
  | "callUrl"
  | "links"
>;
export type Command = {
  action:
    | "createProject"
    | "move"
    | "create"
    | "update"
    | "delete"
    | "complete"
    | "list"
    | "search"
    | "select"
    | "confirm"
    | "cancel"
    | "unknown";
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: Priority;
  assigneeId?: string | null;
  projectId?: string | null;
  callUrl?: string | null;
  links?: RelatedLink[];
  kind?: EventKind;
  date?: string | null;
  time?: string | null;
  duration?: number | null;
  query?: string;
  period?: "today" | "tomorrow" | "week" | "all";
  index?: number;
  id?: string;
  revision?: number;
  token?: string;
  question?: string;
};
export type Pending = {
  token: string;
  type: "draft" | "delete" | "past" | "conflict" | "choose" | "speech";
  draft?: Draft;
  target?: CalendarEvent;
  candidates?: CalendarEvent[];
  next?: Command;
  text?: string;
  approvedPast?: boolean;
  prior?: Pending;
  projectId?: string | null;
};
export type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  at: string;
  events?: CalendarEvent[];
  attachment?: { id: string; name: string; size: number };
};
export type Workspace = {
  teamName?: string;
  teamRevision?: number;
  projects?: Project[];
  events: CalendarEvent[];
  messages: Message[];
  selected?: string;
  pending?: Pending;
  imported: string[];
  requests: Record<string, { fingerprint: string }>;
};
export type AppState = Omit<Workspace, "requests" | "imported"> & {
  account?: AccountState;
  mode: "local" | "yandex";
  voiceAvailable: boolean;
  seedCount: number;
  reservedRub: number;
  budgetRub: number;
  today: string;
};
