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
