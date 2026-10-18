// Client calls to the community API (docs/specs/community.md §C.2). JSON in,
// `{ ok, status, data } | { ok: false, status, error, code, fieldErrors }` out.
export type ApiOk<T> = { ok: true; status: number; data: T };
export type ApiFail = {
  ok: false;
  status: number;
  error: string;
  code?: string;
  fieldErrors?: Record<string, string>;
  retryAfterSec?: number;
};
export type ApiResult<T> = ApiOk<T> | ApiFail;

export async function communityFetch<T>(
  path: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: method === "GET" ? undefined : { "Content-Type": "application/json" },
      body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
      cache: "no-store",
    });
  } catch {
    return { ok: false, status: 0, error: "Network error. Check your connection and try again." };
  }
  let json: Record<string, unknown> = {};
  try {
    json = (await response.json()) as Record<string, unknown>;
  } catch {
    // Non-JSON error page (e.g. a proxy): fall through with an empty body.
  }
  if (response.ok) return { ok: true, status: response.status, data: json as T };
  const retry = Number(response.headers.get("Retry-After"));
  return {
    ok: false,
    status: response.status,
    error: typeof json.error === "string" ? json.error : "Something went wrong. Try again.",
    code: typeof json.code === "string" ? json.code : undefined,
    fieldErrors: (json.fieldErrors as Record<string, string> | undefined) ?? undefined,
    retryAfterSec: Number.isFinite(retry) && retry > 0 ? retry : undefined,
  };
}

/** `/login?next=<current path>` for guests who try to act. */
export function loginHref(): string {
  if (typeof window === "undefined") return "/login";
  return `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
}
