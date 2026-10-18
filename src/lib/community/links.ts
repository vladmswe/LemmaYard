// Links in user content (docs/specs/community.md §B.11): extraction from the
// raw markdown, the host allowlist, URL shorteners, and LeetCode URL
// normalization (C2/C3 reuse it for external problem links). Pure.

/** Hosts whose links never count against the TL0/TL1 link caps (plus the site's own host). */
export const ALLOWLISTED_HOSTS = [
  "leetcode.com",
  "github.com",
  "developer.mozilla.org",
  "docs.python.org",
  "en.wikipedia.org",
] as const;

/** URL shorteners: rejected for everyone (they hide the destination). */
export const SHORTENER_HOSTS = [
  "bit.ly",
  "buff.ly",
  "cutt.ly",
  "goo.gl",
  "is.gd",
  "lnkd.in",
  "ow.ly",
  "rb.gy",
  "rebrand.ly",
  "s.id",
  "shorturl.at",
  "t.co",
  "t.ly",
  "tiny.cc",
  "tinyurl.com",
  "v.gd",
] as const;

/** Link caps per comment outside the allowlist (§B.11). */
export const LINK_CAPS = { tl0: 1, tl1: 10 } as const;

export type ExtractedLink = { url: string; host: string | null };

// Absolute URLs, protocol-relative URLs, bare www. autolinks (GFM) and mailto.
const LINK_PATTERN = /\b(?:https?|ftp):\/\/[^\s<>()[\]"'`]+|(?<![\w/.:])\/\/[^\s<>()[\]"'`/]+[^\s<>()[\]"'`]*|\bwww\.[^\s<>()[\]"'`]+|\bmailto:[^\s<>()[\]"'`]+/gi;

/** Lower-cased host of a URL-ish string, without a leading "www.", or null. */
export function hostOf(raw: string): string | null {
  let candidate = raw.trim();
  if (/^mailto:/i.test(candidate)) return null;
  if (candidate.startsWith("//")) candidate = `https:${candidate}`;
  else if (/^www\./i.test(candidate)) candidate = `https://${candidate}`;
  try {
    const host = new URL(candidate).hostname.toLowerCase().replace(/\.$/, "");
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return null;
  }
}

/** Every link-like token in a markdown body (counted, not deduplicated). */
export function extractLinks(body: string): ExtractedLink[] {
  return [...body.matchAll(LINK_PATTERN)].map((m) => {
    const url = m[0].replace(/[.,;:!?*_~]+$/, "");
    return { url, host: hostOf(url) };
  });
}

function hostMatches(host: string, list: readonly string[]): boolean {
  return list.some((h) => host === h || host.endsWith(`.${h}`));
}

/** True for the allowlist and for `siteHost` (the deployment's own host). */
export function isAllowlisted(link: ExtractedLink, siteHost: string | null = null): boolean {
  // mailto: and unparsable URLs are never allowlisted.
  if (link.host === null) return false;
  if (siteHost && (link.host === siteHost || link.host === siteHost.replace(/^www\./, ""))) return true;
  return hostMatches(link.host, ALLOWLISTED_HOSTS);
}

export function isShortener(link: ExtractedLink): boolean {
  return link.host !== null && hostMatches(link.host, SHORTENER_HOSTS);
}

export type LinkCheck =
  | { ok: true; total: number; external: number }
  | { ok: false; reason: "shortener" | "too_many_links"; message: string };

/**
 * Link rules for one body: any shortener → rejected; more than the cap of
 * non-allowlisted links for the trust level → rejected. `external` (links
 * outside the allowlist) feeds the hold-for-review decision.
 */
export function checkLinks(body: string, trust: 0 | 1, siteHost: string | null): LinkCheck {
  const links = extractLinks(body);
  if (links.some(isShortener)) {
    return { ok: false, reason: "shortener", message: "Link shorteners are not allowed. Paste the full link." };
  }
  const external = links.filter((l) => !isAllowlisted(l, siteHost)).length;
  const cap = trust === 1 ? LINK_CAPS.tl1 : LINK_CAPS.tl0;
  if (external > cap) {
    return {
      ok: false,
      reason: "too_many_links",
      message:
        trust === 1
          ? `At most ${cap} links to other sites per comment.`
          : `New accounts can add at most ${cap} link to other sites per comment.`,
    };
  }
  return { ok: true, total: links.length, external };
}

const LEETCODE_PROBLEM = /^\/problems\/([a-z0-9-]{1,100})(?:\/.*)?$/;

/**
 * `http://leetcode.com/problems/two-sum/description/?x=1` →
 * `https://leetcode.com/problems/two-sum/`; anything that is not a LeetCode
 * problem URL → null (§B.6, AC-C-SP-4).
 */
export function normalizeLeetCodeUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password || (url.port && url.port !== "80" && url.port !== "443")) return null;
  const host = url.hostname.toLowerCase();
  if (host !== "leetcode.com" && host !== "www.leetcode.com") return null;
  const match = LEETCODE_PROBLEM.exec(url.pathname.toLowerCase());
  return match ? `https://leetcode.com/problems/${match[1]}/` : null;
}
