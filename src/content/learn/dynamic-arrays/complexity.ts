import type { ComplexityTableData } from "@/lib/guide/content/types";

export const tables: readonly ComplexityTableData[] = [
  {
    id: "dynamic-array-ops",
    caption: "Cost of dynamic array operations (n elements, doubling, shrink at a quarter)",
    rows: [
      {
        op: "append",
        cells: [
          { bound: "O(1)", q: "amortized" },
          { bound: "O(n)", q: "worst", cond: "when it grows" },
        ],
        why: "n appends copy fewer than 2n elements in total: 17 appends made 31 copies and averaged 2.8 steps each.",
      },
      {
        op: "pop (from the end)",
        cells: [
          { bound: "O(1)", q: "amortized" },
          { bound: "O(n)", q: "worst", cond: "when it shrinks" },
        ],
        why: "Usually one write; a shrink at a quarter copies the rest, and leaves the buffer half full so it cannot repeat soon.",
      },
      {
        op: "get / set a[i]",
        cells: [{ bound: "O(1)", q: "worst" }],
        why: "Still an array: slot i is one address computation away.",
      },
      {
        op: "insert / remove at index i",
        cells: [{ bound: "O(n)", q: "worst" }],
        why: "Every later element shifts one slot, as in the arrays lesson; a resize can come on top.",
      },
    ],
    space: "O(n): the capacity stays below about 4n (or the starting capacity)",
    notes: [
      "Growing by any constant factor above 1 keeps append O(1) amortized; growing by a constant number of slots makes it O(n) amortized.",
      "Shrinking at half instead of a quarter makes alternating append and pop O(n) per operation (thrashing).",
    ],
  },
];
