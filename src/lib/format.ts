/** Placeholder for a missing value in tables and stats (DESIGN.md §13). */
export const MISSING = "—";

/** 0.524 -> "52.4%"; null / non-finite -> "—". */
export function formatPercent(ratio: number | null | undefined, digits = 1): string {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return MISSING;
  return `${(Math.min(Math.max(ratio, 0), 1) * 100).toFixed(digits)}%`;
}

/**
 * Topic tag label in sentence case (DESIGN.md §13): "Hash Table" -> "Hash
 * table". Words after the first are lowercased unless they are acronyms
 * ("BFS"). Display only; the DB keeps the importer's names.
 */
export function formatTagLabel(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w, i) => {
      if (i === 0) return w.charAt(0).toUpperCase() + w.slice(1);
      return w.length > 1 && w === w.toUpperCase() ? w : w.toLowerCase();
    })
    .join(" ");
}

/** "Oct 2026" for "Joined …" lines (UTC, so server and client agree). */
export function formatMonthYear(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

/** "Oct 17, 2026" (UTC). */
export function formatShortDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** "Oct 17, 2026, 14:02 UTC": absolute time for titles and the submission page. */
export function formatDateTime(date: Date): string {
  const time = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  return `${formatShortDate(date)}, ${time} UTC`;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * "just now", "3 min ago", "5 h ago", "yesterday", "4 days ago". From 30 days
 * on (and for times more than a minute in the future) the short date instead.
 */
export function formatRelativeTime(date: Date, now: Date = new Date()): string {
  const diff = now.getTime() - date.getTime();
  if (diff < -MINUTE || diff >= 30 * DAY) return formatShortDate(date);
  if (diff < MINUTE) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} h ago`;
  const days = Math.floor(diff / DAY);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
