// Client side of /api/plans/**: JSON + same-origin conventions of the other
// API clients (auth, submissions, rooms), with the HTTP method as a parameter.

export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | {
      ok: false;
      status: number;
      error: string;
      fieldErrors?: Partial<Record<string, string>>;
    };

const NETWORK_ERROR = "Network error. Check your connection and try again.";

export async function sendJson<T = Record<string, unknown>>(
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body: unknown = {},
): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return { ok: false, status: 0, error: NETWORK_ERROR };
  }
  const payload = (await res.json().catch(() => null)) as
    | (T & { error?: string; fieldErrors?: Partial<Record<string, string>> })
    | null;
  if (res.ok) return { ok: true, status: res.status, data: (payload ?? {}) as T };
  return {
    ok: false,
    status: res.status,
    error: payload?.error ?? "Something went wrong. Try again.",
    fieldErrors: payload?.fieldErrors,
  };
}

export async function getJson<T>(path: string): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(path, { cache: "no-store" });
  } catch {
    return { ok: false, status: 0, error: NETWORK_ERROR };
  }
  const payload = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (res.ok) return { ok: true, status: res.status, data: (payload ?? {}) as T };
  return { ok: false, status: res.status, error: payload?.error ?? "Something went wrong. Try again." };
}

/** `/plans/<id>` with the share token for unlisted plans. */
export function planHref(id: string, share?: string | null): string {
  return share ? `/plans/${id}?share=${encodeURIComponent(share)}` : `/plans/${id}`;
}
