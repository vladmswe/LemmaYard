// Positions of a complete binary tree stored in an array (0-based heap indices).

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface HeapLayoutOptions {
  readonly levelGap?: number; // px between levels, default 56
  readonly top?: number; // y of the root, default 24
}

/** Level of index i: ⌊log₂(i + 1)⌋. */
export function heapLevel(i: number): number {
  return Math.floor(Math.log2(i + 1));
}

/** x splits each level into 2^level equal slots; every node lies strictly inside the width. */
export function heapLayout(n: number, width: number, opts: HeapLayoutOptions = {}): Point[] {
  const levelGap = opts.levelGap ?? 56;
  const top = opts.top ?? 24;
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    const level = heapLevel(i);
    const slots = 2 ** level;
    const pos = i - (slots - 1);
    out.push({ x: ((pos + 0.5) * width) / slots, y: top + level * levelGap });
  }
  return out;
}

/** Largest circle radius (capped at maxR) that keeps nodes of the deepest level apart. */
export function heapNodeRadius(n: number, width: number, maxR = 20): number {
  if (n <= 0) return maxR;
  const slots = 2 ** heapLevel(n - 1);
  return Math.max(8, Math.min(maxR, width / slots / 2 - 2));
}
