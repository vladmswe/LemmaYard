export type PageItem = number | "ellipsis-start" | "ellipsis-end";

/**
 * Page links to show (DESIGN.md §8.16): first, last, current ±1, with an
 * ellipsis for each gap of 2+ pages (a gap of one page shows that page).
 * `current` is clamped to 1..total; total < 1 yields [].
 */
export function pageWindow(current: number, total: number): PageItem[] {
  if (!Number.isFinite(total) || total < 1) return [];
  const last = Math.trunc(total);
  const cur = Math.min(Math.max(Math.trunc(current) || 1, 1), last);

  const pages = new Set<number>([1, last, cur - 1, cur, cur + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= last).sort((a, b) => a - b);

  const out: PageItem[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const page = sorted[i];
    const prev = sorted[i - 1];
    if (prev !== undefined && page - prev === 2) out.push(prev + 1);
    else if (prev !== undefined && page - prev > 2) {
      out.push(page < cur ? "ellipsis-start" : "ellipsis-end");
    }
    out.push(page);
  }
  return out;
}

/** "Showing 21–40 of 45" range for page `page` of size `pageSize`. */
export function pageRange(page: number, pageSize: number, totalItems: number) {
  if (totalItems <= 0 || pageSize <= 0) return { from: 0, to: 0 };
  const from = (Math.max(1, Math.trunc(page)) - 1) * pageSize + 1;
  return { from: Math.min(from, totalItems), to: Math.min(from + pageSize - 1, totalItems) };
}
