// Client calls of the session routes (docs/specs/rooms.md §7.2). Unlike the
// generic `postJson`, failures keep the whole body: draw errors carry `code`
// and `counts` (§2.6) that the lobby renders inline.
import type { LobbyView } from "@/lib/rooms/session-view";
import type { Mix } from "@/lib/rooms/types";

export type SessionApiError = {
  ok: false;
  status: number;
  error: string;
  code?: string;
  counts?: Mix;
  requested?: Mix;
  fieldErrors?: Record<string, string>;
  sessionId?: string;
  retryAfterSec?: number;
};

export type SessionApiResult<T> = { ok: true; status: number; data: T } | SessionApiError;

const NETWORK_ERROR = "Network error. Check your connection and try again.";

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<SessionApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      cache: "no-store",
      credentials: "same-origin",
      headers: method === "POST" ? { "Content-Type": "application/json" } : { Accept: "application/json" },
      ...(method === "POST" ? { body: JSON.stringify(body ?? {}) } : {}),
    });
  } catch {
    return { ok: false, status: 0, error: NETWORK_ERROR };
  }
  const payload = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (res.ok) return { ok: true, status: res.status, data: (payload ?? {}) as T };
  const retry = Number(res.headers.get("retry-after"));
  const { error, code, counts, requested, sessionId, fieldErrors } = payload ?? {};
  return {
    ok: false,
    status: res.status,
    error: typeof error === "string" ? error : `Something went wrong (${res.status}). Try again.`,
    ...(typeof code === "string" ? { code } : {}),
    ...(counts ? { counts: counts as Mix } : {}),
    ...(requested ? { requested: requested as Mix } : {}),
    ...(typeof sessionId === "string" ? { sessionId } : {}),
    ...(fieldErrors && typeof fieldErrors === "object" ? { fieldErrors: fieldErrors as Record<string, string> } : {}),
    ...(Number.isFinite(retry) && retry > 0 ? { retryAfterSec: retry } : {}),
  };
}

const base = (roomId: string, sessionId: string) =>
  `/api/rooms/${encodeURIComponent(roomId)}/sessions/${encodeURIComponent(sessionId)}`;

export type LobbyResponse = { lobby: LobbyView };

export const sessionApi = {
  create: (roomId: string, body: Record<string, unknown> = {}) =>
    call<{ id: string; lobby: LobbyView }>("POST", `/api/rooms/${encodeURIComponent(roomId)}/sessions`, body),
  lobby: (roomId: string, sessionId: string) => call<LobbyResponse>("GET", `${base(roomId, sessionId)}/lobby`),
  draw: (roomId: string, sessionId: string, body: Record<string, unknown>) =>
    call<LobbyResponse>("POST", `${base(roomId, sessionId)}/draw`, body),
  reroll: (roomId: string, sessionId: string, position: number) =>
    call<LobbyResponse>("POST", `${base(roomId, sessionId)}/slots/${position}/reroll`),
  rerollAll: (roomId: string, sessionId: string) => call<LobbyResponse>("POST", `${base(roomId, sessionId)}/reroll-all`),
  pin: (roomId: string, sessionId: string, position: number, slug: string) =>
    call<LobbyResponse>("POST", `${base(roomId, sessionId)}/slots/${position}/pin`, { slug }),
  unpin: (roomId: string, sessionId: string, position: number) =>
    call<LobbyResponse>("POST", `${base(roomId, sessionId)}/slots/${position}/pin`, { unpin: true }),
  search: (roomId: string, sessionId: string, q: string) =>
    call<{ slug: string; title: string; difficulty: "easy" | "medium" | "hard"; tags: string[] }[]>(
      "GET",
      `${base(roomId, sessionId)}/problem-search?q=${encodeURIComponent(q)}`,
    ),
  join: (roomId: string, sessionId: string) => call<{ joined: true }>("POST", `${base(roomId, sessionId)}/join`),
  leave: (roomId: string, sessionId: string) => call<{ joined: false }>("POST", `${base(roomId, sessionId)}/leave`),
  start: (roomId: string, sessionId: string) =>
    call<{ startedAt: string; endsAt: string }>("POST", `${base(roomId, sessionId)}/start`),
  end: (roomId: string, sessionId: string) => call<{ endedAt: string }>("POST", `${base(roomId, sessionId)}/end`),
  cancel: (roomId: string, sessionId: string) => call<{ cancelled: true }>("POST", `${base(roomId, sessionId)}/cancel`),
};
