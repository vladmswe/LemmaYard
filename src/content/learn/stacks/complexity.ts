import type { ComplexityTableData } from "@/lib/guide/content/types";

export const tables: readonly ComplexityTableData[] = [
  {
    id: "stack-ops",
    caption: "Cost of stack operations (n values on the stack, or n characters / values scanned)",
    rows: [
      {
        op: "push",
        cells: [
          { bound: "O(1)", q: "amortized", cond: "array" },
          { bound: "O(n)", q: "worst", cond: "array, growing" },
          { bound: "O(1)", q: "worst", cond: "linked list" },
        ],
        why: "A push writes one slot; only a push into a full array copies everything first, which doubling makes rare (copies stayed 0 for four pushes, then 4).",
      },
      {
        op: "pop",
        cells: [{ bound: "O(1)", q: "worst", cond: "array or list" }],
        why: "Read the top and move top down by one; nothing shifts. An array that also shrinks makes pop O(1) amortized instead.",
      },
      {
        op: "peek",
        cells: [{ bound: "O(1)", q: "worst" }],
        why: "One read at index top; the reads counter goes up by one.",
      },
      {
        op: "bracket check (n characters)",
        cells: [
          { bound: "O(n)", q: "worst", cond: "time" },
          { bound: "O(n)", q: "worst", cond: "space" },
        ],
        why: "Each character is read once (36 reads for the 36-character line) and causes at most one push or pop.",
      },
      {
        op: "next greater element (n values)",
        cells: [{ bound: "O(n)", q: "worst", cond: "total" }],
        why: "Each index is pushed once and popped at most once: 8 pushes and 5 pops for the 8 default values.",
      },
    ],
    space: "O(n) for n values; an array that only doubles keeps fewer than 2n slots",
    notes: [
      "The comparison-only alternative to the monotonic stack checks every later value: O(n²) worst case.",
    ],
  },
];
