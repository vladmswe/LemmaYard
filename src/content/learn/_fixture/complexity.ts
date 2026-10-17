import type { ComplexityTableData } from "@/lib/guide/content/types";

export const tables: readonly ComplexityTableData[] = [
  {
    id: "fixture-stack-ops",
    caption: "Cost of stack operations (array-backed)",
    rows: [
      {
        op: "push",
        cells: [
          { bound: "O(1)", q: "amortized" },
          { bound: "O(n)", q: "worst", cond: "when the array grows" },
        ],
        why: "One write at the end; a resize copies every element.",
      },
      { op: "pop", cells: [{ bound: "O(1)", q: "worst" }], why: "One read and one shrink of the size." },
      { op: "peek", cells: [{ bound: "O(1)", q: "worst" }], why: "One read of the top slot." },
    ],
    space: "O(n)",
    notes: ["A linked-list stack makes push O(1) worst case at the price of one pointer per value."],
  },
];
