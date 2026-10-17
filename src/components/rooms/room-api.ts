// Client side of the room routes: one POST helper with the same JSON +
// same-origin conventions as the auth and submission clients.

export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | {
      ok: false;
      status: number;
      error: string;
      fieldErrors?: Partial<Record<string, string>>;
      retryAfterSec?: number;
    };

const NETWORK_ERROR = "Network error. Check your connection and try again.";

export async function postJson<T = Record<string, unknown>>(path: string, body: unknown = {}): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
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
  const retry = Number(res.headers.get("retry-after"));
  return {
    ok: false,
    status: res.status,
    error: payload?.error ?? "Something went wrong. Try again.",
    fieldErrors: payload?.fieldErrors,
    retryAfterSec: Number.isFinite(retry) && retry > 0 ? retry : undefined,
  };
}
