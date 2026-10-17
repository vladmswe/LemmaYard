export const DEFAULT_REDIRECT = "/problems";

/**
 * Validates a post-login redirect target (`/login?next=...`). Only same-site
 * relative paths are allowed: a single leading `/`, no `//`, no scheme, no
 * backslash and no control characters. Anything else falls back to `/problems`.
 */
export function safeRedirectPath(next: unknown): string {
  if (typeof next !== "string" || next.length === 0 || next.length > 2048) {
    return DEFAULT_REDIRECT;
  }
  if (!next.startsWith("/") || next.startsWith("//")) return DEFAULT_REDIRECT;
  if (next.includes("\\")) return DEFAULT_REDIRECT;
  if (/[\u0000-\u001f\u007f]/.test(next)) return DEFAULT_REDIRECT;
  // Defense in depth: the path must resolve to the same origin.
  try {
    const base = "http://localhost";
    if (new URL(next, base).origin !== base) return DEFAULT_REDIRECT;
  } catch {
    return DEFAULT_REDIRECT;
  }
  return next;
}
