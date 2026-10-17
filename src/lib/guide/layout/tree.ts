// Binary tree layout: x by in-order rank, y by depth.
import type { ElementId } from "../contracts";

export interface TreeLayoutOptions {
  readonly levelGap?: number; // default 56
  readonly top?: number; // y of the root, default 24
  readonly minGap?: number; // minimum horizontal distance between ranks, default 36
  readonly maxGap?: number; // cap so small trees stay compact, default 72
}

export interface TreeNodePosition {
  readonly x: number;
  readonly y: number;
  readonly depth: number;
}

export interface TreeLayout {
  readonly positions: ReadonlyMap<ElementId, TreeNodePosition>;
  /** true when minGap per node needs more than `width`: render inside a horizontal scroller. */
  readonly tooWide: boolean;
  readonly contentWidth: number; // > width only when tooWide
  readonly height: number; // deepest level plus top and bottom margin
  readonly depth: number; // max depth (root = 0); -1 for an empty tree
}

type Item = { id: ElementId; depth: number };

export function binaryTreeLayout(
  rootId: ElementId | null,
  children: (id: ElementId) => readonly [ElementId | null, ElementId | null],
  width: number,
  opts: TreeLayoutOptions = {},
): TreeLayout {
  const levelGap = opts.levelGap ?? 56;
  const top = opts.top ?? 24;
  const minGap = opts.minGap ?? 36;
  const maxGap = opts.maxGap ?? 72;

  // Iterative in-order walk (no recursion limit for degenerate trees).
  const order: Item[] = [];
  const seen = new Set<ElementId>();
  const stack: Item[] = [];
  let cur: Item | null = rootId === null ? null : { id: rootId, depth: 0 };
  while (cur !== null || stack.length > 0) {
    while (cur !== null) {
      if (seen.has(cur.id)) throw new Error(`binaryTreeLayout: node ${cur.id} reached twice`);
      seen.add(cur.id);
      stack.push(cur);
      const left: ElementId | null = children(cur.id)[0];
      cur = left === null ? null : { id: left, depth: cur.depth + 1 };
    }
    const node = stack.pop() as Item;
    order.push(node);
    const right = children(node.id)[1];
    cur = right === null ? null : { id: right, depth: node.depth + 1 };
  }

  const count = order.length;
  const fitGap = count > 0 ? width / count : width;
  const gap = Math.min(maxGap, Math.max(minGap, fitGap));
  const contentWidth = Math.max(width, gap * count);
  const offset = (contentWidth - gap * count) / 2;
  const positions = new Map<ElementId, TreeNodePosition>();
  let depth = -1;
  order.forEach((n, rank) => {
    depth = Math.max(depth, n.depth);
    positions.set(n.id, {
      x: offset + (rank + 0.5) * gap,
      y: top + n.depth * levelGap,
      depth: n.depth,
    });
  });
  return {
    positions,
    tooWide: fitGap < minGap,
    contentWidth,
    height: depth < 0 ? 0 : top * 2 + depth * levelGap,
    depth,
  };
}
