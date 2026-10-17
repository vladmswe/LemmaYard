import type { ComplexityTableData } from "@/lib/guide/content/types";

export const tables: readonly ComplexityTableData[] = [
  {
    id: "arrays-ops",
    caption: "Cost of array operations (n elements)",
    rows: [
      {
        op: "get / set a[i]",
        cells: [{ bound: "O(1)", q: "worst" }],
        why: "The address is base + i · size: one computation and one read or write, whatever i is.",
      },
      {
        op: "insert / remove at index i",
        cells: [
          { bound: "O(n − i)", q: "worst" },
          { bound: "O(n)", q: "worst", cond: "at the front" },
        ],
        why: "Every later element shifts one slot: the moves counter showed 5 moves for an insert at index 1 of 6 elements.",
      },
      {
        op: "insert / remove at the end",
        cells: [{ bound: "O(1)", q: "worst", cond: "if a slot is free" }],
        why: "No element comes after the end, so nothing shifts; the 'Insert at the end' preset moves 0 elements.",
      },
      {
        op: "search, unsorted",
        cells: [{ bound: "O(n)", q: "worst" }],
        why: "A missing value means comparing every cell once.",
      },
      {
        op: "search, sorted (binary search)",
        cells: [{ bound: "O(log n)", q: "worst" }],
        why: "Each comparison halves the range [lo, hi); the result is an index or −1.",
      },
      {
        op: "build prefix sums",
        cells: [{ bound: "O(n)", q: "worst" }],
        why: "One pass: each p[i + 1] = p[i] + a[i] is one addition and one write.",
      },
      {
        op: "range sum of [l, r)",
        cells: [{ bound: "O(1)", q: "worst", cond: "after building p" }],
        why: "p[r] − p[l]: two reads and one subtraction, however long the range.",
      },
      {
        op: "merge two sorted arrays",
        cells: [{ bound: "O(|A| + |B|)", q: "worst" }],
        why: "Every step writes one value into C and moves one pointer: 10 writes for 5 + 5 values.",
      },
    ],
    space: "O(n) for the array; prefix sums need n + 1 more cells, a merge |A| + |B|",
    notes: ["Inserting into a full fixed array fails; the next lesson's dynamic array grows instead."],
  },
];
