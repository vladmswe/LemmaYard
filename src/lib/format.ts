/** Placeholder for a missing value in tables and stats (DESIGN.md §13). */
export const MISSING = "—";

/** 0.524 -> "52.4%"; null / non-finite -> "—". */
export function formatPercent(ratio: number | null | undefined, digits = 1): string {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return MISSING;
  return `${(Math.min(Math.max(ratio, 0), 1) * 100).toFixed(digits)}%`;
}

/** "Oct 2026" for "Joined …" lines (UTC, so server and client agree). */
export function formatMonthYear(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}
