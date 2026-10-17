// rowLayout with balanced rows: when the cells wrap, every row gets about the
// same number of cells (32 cells at 390 px: 4 rows of 8, not 3 of 9 and one of 5).
// Positions stay relative to `width` and are centred in it. Shared by the
// array-like renderers of the foundations lessons.
import { rowLayout, type RowLayout, type RowLayoutOptions } from "@/lib/guide/layout/row";

export function balancedRowLayout(n: number, width: number, opts: RowLayoutOptions = {}): RowLayout {
  const first = rowLayout(n, width, opts);
  if (first.rows <= 1) return first;
  const gap = opts.gap ?? 4;
  const per = Math.ceil(n / first.rows);
  const w = per * (first.cellW + gap) - gap;
  const even = rowLayout(n, w, { ...opts, minCell: first.cellW, maxCell: first.cellW });
  const off = Math.max(0, (width - even.usedWidth) / 2);
  return { ...even, positions: even.positions.map((p) => ({ ...p, x: p.x + off })) };
}
