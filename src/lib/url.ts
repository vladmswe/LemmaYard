/**
 * True when a raw (still percent-encoded) URL path has an escape that
 * `decodeURIComponent` rejects, e.g. `/u/%FF` or `/u/%E0%A4%A`. Next.js fails
 * to decode such dynamic params and answers with a bare 500, so `src/proxy.ts`
 * turns them into a normal 404 first.
 */
export function hasMalformedPathEscape(pathname: string): boolean {
  if (!pathname.includes("%")) return false;
  try {
    decodeURIComponent(pathname);
    return false;
  } catch {
    return true;
  }
}
