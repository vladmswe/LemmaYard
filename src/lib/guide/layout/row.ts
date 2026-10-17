// Row of equal cells that wraps into several rows when the width is too small.

export interface RowLayoutOptions {
  readonly minCell?: number; // default 32
  readonly maxCell?: number; // default 56
  readonly gap?: number; // horizontal gap between cells, default 4
  readonly rowGap?: number; // vertical space between wrapped rows (index labels), default 24
}

export interface RowCellPosition {
  readonly x: number; // top-left corner
  readonly y: number;
  readonly row: number;
  readonly col: number;
}

export interface RowLayout {
  readonly cellW: number;
  readonly perRow: number;
  readonly rows: number;
  /** Top-left corner of each cell; every row is centred in the width. */
  readonly positions: readonly RowCellPosition[];
  readonly usedWidth: number; // width of the widest row
  readonly height: number; // all rows plus the gaps between them
}

export function rowLayout(n: number, width: number, opts: RowLayoutOptions = {}): RowLayout {
  const minCell = opts.minCell ?? 32;
  const maxCell = opts.maxCell ?? 56;
  const gap = opts.gap ?? 4;
  const rowGap = opts.rowGap ?? 24;
  if (n <= 0) {
    return { cellW: maxCell, perRow: 0, rows: 0, positions: [], usedWidth: 0, height: 0 };
  }

  const fit = (count: number) => Math.floor((width - (count - 1) * gap) / count);
  let perRow = n;
  let cellW = Math.min(maxCell, fit(n));
  if (cellW < minCell) {
    perRow = Math.max(1, Math.floor((width + gap) / (minCell + gap)));
    cellW = Math.max(minCell, Math.min(maxCell, fit(perRow)));
  }
  const rows = Math.ceil(n / perRow);
  const positions: RowCellPosition[] = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const inRow = Math.min(perRow, n - row * perRow);
    const rowWidth = inRow * cellW + (inRow - 1) * gap;
    const offset = Math.max(0, (width - rowWidth) / 2);
    positions.push({ x: offset + col * (cellW + gap), y: row * (cellW + rowGap), row, col });
  }
  const usedWidth = perRow * cellW + (perRow - 1) * gap;
  return { cellW, perRow, rows, positions, usedWidth, height: rows * cellW + (rows - 1) * rowGap };
}
