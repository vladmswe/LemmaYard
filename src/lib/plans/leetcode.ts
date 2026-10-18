// External LeetCode items of study plans (docs/specs/community.md §B.8, owner
// decision for C2): the user pastes a link, we keep ONLY the problem slug and
// build the canonical URL when rendering. Nothing is ever fetched from
// leetcode.com. Pure module (client forms use the same rules).

/** LeetCode problem slugs: lowercase words joined by single hyphens. */
export const LEETCODE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const LEETCODE_SLUG_MAX = 100;
/** Longest pasted link we look at (anything longer is not a problem link). */
export const LEETCODE_URL_INPUT_MAX = 300;

const HOSTS = new Set(["leetcode.com", "www.leetcode.com"]);
// Whitespace, controls, backslashes: the WHATWG URL parser silently drops tabs
// and newlines and turns "\" into "/" for https, so such input could pass as a
// different URL than the one the user sees. Reject it before parsing.
const UNSAFE_INPUT = /[\s\p{Cc}\p{Cf}\\]/u;

export function isLeetCodeSlug(value: unknown): value is string {
  return typeof value === "string" && value.length <= LEETCODE_SLUG_MAX && LEETCODE_SLUG_PATTERN.test(value);
}

/**
 * The problem slug of a LeetCode problem link, or null. Accepts
 * `http(s)://(www.)leetcode.com/problems/<slug>` with an optional trailing
 * slash, sub-page (`/description/`), query and fragment; the host and the slug
 * are matched case-insensitively. Rejects every other host (including look-alike
 * hosts, subdomains other than www, IP addresses), credentials, ports, encoded
 * characters in the slug and anything that is not a problem page.
 */
export function parseLeetCodeProblemUrl(input: string): string | null {
  const raw = input.trim();
  if (raw.length === 0 || raw.length > LEETCODE_URL_INPUT_MAX || UNSAFE_INPUT.test(raw)) return null;
  if (!/^https?:\/\//i.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username !== "" || url.password !== "" || url.port !== "") return null;
  if (!HOSTS.has(url.hostname)) return null;
  const match = /^\/problems\/([^/]+)(?:\/.*)?$/.exec(url.pathname);
  if (!match) return null;
  const slug = match[1].toLowerCase();
  return isLeetCodeSlug(slug) ? slug : null;
}

/** The canonical link for a stored slug; throws on a slug that is not one (never builds a URL from bad data). */
export function leetCodeProblemUrl(slug: string): string {
  if (!isLeetCodeSlug(slug)) throw new Error("invalid LeetCode slug");
  return `https://leetcode.com/problems/${slug}/`;
}

/** "two-sum" -> "Two Sum": the default title of an external item. */
export function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .map((w) => (w.length === 0 ? w : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}
