import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { scaleGraph } from "@/lib/guide/layout/graph";
import { heapLayout, heapNodeRadius } from "@/lib/guide/layout/heap";
import { ringLayout } from "@/lib/guide/layout/ring";
import { rowLayout } from "@/lib/guide/layout/row";
import { textWidth } from "@/lib/guide/layout/text";
import { binaryTreeLayout } from "@/lib/guide/layout/tree";
import { numRuns } from "@/lib/guide/testing/fc";

describe("rowLayout", () => {
  it("uses the max cell when there is room", () => {
    const l = rowLayout(4, 1000);
    expect(l).toMatchObject({ cellW: 56, perRow: 4, rows: 1 });
  });
  it("wraps at narrow widths and keeps cells >= 32", () => {
    const l = rowLayout(12, 288);
    expect(l.cellW).toBeGreaterThanOrEqual(32);
    expect(l.rows).toBeGreaterThan(1);
    expect(l.positions[l.perRow]).toMatchObject({ row: 1, col: 0 });
  });
  it("handles n = 0", () => {
    expect(rowLayout(0, 300)).toMatchObject({ rows: 0, positions: [] });
  });
  it("never exceeds the width at 288..1040 px and keeps cells >= 32 (property)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 64 }), fc.integer({ min: 288, max: 1040 }), (n, width) => {
        const l = rowLayout(n, width);
        expect(l.cellW).toBeGreaterThanOrEqual(32);
        expect(l.cellW).toBeLessThanOrEqual(56);
        expect(l.usedWidth).toBeLessThanOrEqual(width);
        expect(l.positions).toHaveLength(n);
        for (const p of l.positions) {
          expect(p.x).toBeGreaterThanOrEqual(0);
          expect(p.x + l.cellW).toBeLessThanOrEqual(width + 1e-9);
        }
        // No two cells overlap.
        const seen = new Set(l.positions.map((p) => `${p.row}:${p.col}`));
        expect(seen.size).toBe(n);
      }),
      { numRuns: numRuns(300) },
    );
  });
});

type Tree = Map<string, [string | null, string | null]>;

/** Random BST shape from distinct keys inserted in order. */
function bstFrom(keys: number[]): { root: string | null; tree: Tree } {
  const tree: Tree = new Map();
  let root: string | null = null;
  for (const k of keys) {
    const id = `n${k}`;
    tree.set(id, [null, null]);
    if (root === null) {
      root = id;
      continue;
    }
    let cur = root;
    for (;;) {
      const [l, r] = tree.get(cur)!;
      const ck = Number(cur.slice(1));
      if (k < ck) {
        if (l === null) {
          tree.set(cur, [id, r]);
          break;
        }
        cur = l;
      } else {
        if (r === null) {
          tree.set(cur, [l, id]);
          break;
        }
        cur = r;
      }
    }
  }
  return { root, tree };
}

describe("binaryTreeLayout", () => {
  it("lays out a perfect 7-node tree by in-order rank and depth", () => {
    const { root, tree } = bstFrom([8, 4, 12, 2, 6, 10, 14]);
    const l = binaryTreeLayout(root, (id) => tree.get(id)!, 560, { levelGap: 56, top: 24 });
    const xs = [2, 4, 6, 8, 10, 12, 14].map((k) => l.positions.get(`n${k}`)!.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(l.positions.get("n8")!.y).toBe(24);
    expect(l.positions.get("n2")!.y).toBe(24 + 2 * 56);
    expect(l).toMatchObject({ tooWide: false, depth: 2 });
  });
  it("detects cycles", () => {
    expect(() => binaryTreeLayout("a", () => ["a", null], 300)).toThrow(/twice/);
  });
  it("returns an empty layout for an empty tree", () => {
    expect(binaryTreeLayout(null, () => [null, null], 300)).toMatchObject({ depth: -1, height: 0 });
  });
  it("distinct x per rank, y per depth, nodes >= 36 px apart, or tooWide (property)", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 0, max: 99 }), { minLength: 1, maxLength: 15 }),
        fc.integer({ min: 288, max: 1040 }),
        (keys, width) => {
          const { root, tree } = bstFrom(keys);
          const l = binaryTreeLayout(root, (id) => tree.get(id)!, width);
          const sorted = [...keys].sort((a, b) => a - b);
          const pts = sorted.map((k) => l.positions.get(`n${k}`)!);
          for (let i = 1; i < pts.length; i++) expect(pts[i]!.x).toBeGreaterThan(pts[i - 1]!.x);
          for (const p of pts) expect(p.y).toBe(24 + p.depth * 56);
          for (let i = 0; i < pts.length; i++) {
            for (let j = i + 1; j < pts.length; j++) {
              const d = Math.hypot(pts[i]!.x - pts[j]!.x, pts[i]!.y - pts[j]!.y);
              expect(d).toBeGreaterThanOrEqual(36 - 1e-9);
            }
          }
          if (!l.tooWide) {
            for (const p of pts) {
              expect(p.x).toBeGreaterThanOrEqual(0);
              expect(p.x).toBeLessThanOrEqual(width);
            }
          } else {
            expect(l.contentWidth).toBeGreaterThan(width);
          }
        },
      ),
      { numRuns: numRuns(300) },
    );
  });
});

describe("heapLayout", () => {
  it("places all 15 nodes inside 288 px, one level per depth", () => {
    const pts = heapLayout(15, 288);
    const r = heapNodeRadius(15, 288);
    expect(pts).toHaveLength(15);
    for (const p of pts) {
      expect(p.x - r).toBeGreaterThanOrEqual(0);
      expect(p.x + r).toBeLessThanOrEqual(288);
    }
    expect(new Set(pts.map((p) => p.y)).size).toBe(4);
    // Bottom-level neighbours do not overlap.
    expect(pts[8]!.x - pts[7]!.x).toBeGreaterThanOrEqual(2 * r);
  });
  it("children sit below their parent (0-based indices)", () => {
    const pts = heapLayout(7, 400);
    for (let i = 1; i < 7; i++) expect(pts[i]!.y).toBeGreaterThan(pts[Math.floor((i - 1) / 2)]!.y);
  });
});

describe("ringLayout, scaleGraph, textWidth", () => {
  it("ring points lie on the circle (property)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 40 }), fc.integer({ min: 10, max: 300 }), (n, r) => {
        for (const p of ringLayout(n, 150, 120, r)) {
          expect(Math.hypot(p.x - 150, p.y - 120)).toBeCloseTo(r, 6);
        }
      }),
      { numRuns: numRuns(100) },
    );
    expect(ringLayout(4, 0, 0, 10)[0]).toMatchObject({ angle: -90 });
  });
  it("scaleGraph maps 0..100 into the padded box", () => {
    const [a, b] = scaleGraph(
      [
        { id: "a", x: 0, y: 0 },
        { id: "b", x: 100, y: 100 },
      ],
      300,
      200,
      20,
    );
    expect(a).toMatchObject({ id: "a", x: 20, y: 20 });
    expect(b).toMatchObject({ x: 280, y: 180 });
  });
  it("textWidth is 0.6 em per character", () => {
    expect(textWidth("abcd", 10)).toBeCloseTo(24);
  });
});
