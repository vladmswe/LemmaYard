// In-process sliding-window limiter (docs/specs/rooms.md §7.2 "Rate-limit
// caveat"). It is per server instance, so on Vercel with several instances it
// is a soft cap; limits that matter for abuse use DB counts instead. Used for
// hygiene limits: invite rotation and join attempts.

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSec: number };

export type RateLimiter = {
  /** Would one more hit for `key` stay within the limit? Does not record. */
  check(key: string, now?: number): RateLimitResult;
  /** Records one hit for `key`. */
  record(key: string, now?: number): void;
  /** check() and, when allowed, record() in one step. */
  hit(key: string, now?: number): RateLimitResult;
  /** Drops all state (tests). */
  reset(): void;
};

const MAX_KEYS = 10_000;

export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }): RateLimiter {
  const hits = new Map<string, number[]>();

  function recent(key: string, now: number): number[] {
    const list = (hits.get(key) ?? []).filter((t) => t > now - windowMs);
    if (list.length === 0) hits.delete(key);
    else hits.set(key, list);
    return list;
  }

  function check(key: string, now = Date.now()): RateLimitResult {
    const list = recent(key, now);
    if (list.length < limit) return { ok: true };
    const retryAfterMs = list[list.length - limit] + windowMs - now;
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
  }

  function record(key: string, now = Date.now()): void {
    const list = recent(key, now);
    list.push(now);
    hits.set(key, list);
    // Bound memory: forget the oldest keys first (Map keeps insertion order).
    while (hits.size > MAX_KEYS) {
      const oldest = hits.keys().next().value;
      if (oldest === undefined) break;
      hits.delete(oldest);
    }
  }

  return {
    check,
    record,
    hit(key, now = Date.now()) {
      const result = check(key, now);
      if (result.ok) record(key, now);
      return result;
    },
    reset() {
      hits.clear();
    },
  };
}

/**
 * Best-effort client address for a second limiter key. Behind Vercel the
 * first `x-forwarded-for` entry is set by the platform; elsewhere it can be
 * spoofed, which is why the per-user limit always applies as well.
 */
export function clientAddress(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return first.slice(0, 64);
  const real = request.headers.get("x-real-ip")?.trim();
  return real ? real.slice(0, 64) : null;
}
