import type { AppState, Command } from "@/types";
export type RequestBody = {
  requestId: string;
  workspaceId?: string;
  projectId?: string | null;
  text?: string;
  command?: Command;
  source?: "text" | "voice";
  uncertain?: boolean;
};
export const headers = {
  "Content-Type": "application/json",
  "x-app-request": "voice-planner",
};
export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      signal: init?.signal || AbortSignal.timeout(25000),
    });
  } catch {
    throw new Error(
      "Нет связи с сервером. Результат действия неизвестен. Обновите данные перед повтором.",
    );
  }
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Сервер недоступен." }));
    throw new Error(error.error || "Запрос не выполнен.");
  }
  return response.json();
}
export const getState = () => request<AppState>("/api/state");
export const send = (body: RequestBody) =>
  request<AppState>("/api/chat", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
