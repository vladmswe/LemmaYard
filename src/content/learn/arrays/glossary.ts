import type { GlossaryEntry } from "@/lib/guide/content/types";

export const glossary: readonly GlossaryEntry[] = [
  {
    id: "array",
    term: "Array",
    definition: "Equal-sized slots side by side in one block of memory; slot i is at base + i · size, so any index is reached in O(1).",
  },
  {
    id: "index",
    term: "Index",
    definition: "The position of a slot in an array, counted from 0; an array of length n has indices 0 to n − 1.",
  },
  {
    id: "half-open-range",
    term: "Half-open range",
    definition: "[l, r): the indices l, l + 1, …, r − 1. Its length is r − l, and [l, l) is empty.",
  },
  {
    id: "shift",
    term: "Shift (move)",
    definition: "Copying an element one slot left or right to open or close a gap; inserting or removing at index i shifts every later element.",
  },
  {
    id: "prefix-sums",
    term: "Prefix sums",
    definition: "An array p of n + 1 cells with p[0] = 0 and p[i + 1] = p[i] + a[i], so p[i] is the sum of the first i elements.",
  },
  {
    id: "range-sum-query",
    term: "Range sum query",
    definition: "The sum of a[l] up to a[r − 1], the half-open range [l, r); with prefix sums it is p[r] − p[l].",
  },
  {
    id: "sentinel",
    term: "Sentinel",
    definition: "An extra element placed at a boundary so the code needs no special case there, such as p[0] = 0 in prefix sums.",
  },
  {
    id: "two-pointers",
    term: "Two pointers",
    definition: "Two indices that only move forward through one or two sorted sequences, such as i and j in a merge: O(total length).",
  },
];
