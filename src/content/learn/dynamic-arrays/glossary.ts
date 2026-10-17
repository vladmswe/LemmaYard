import type { GlossaryEntry } from "@/lib/guide/content/types";

export const glossary: readonly GlossaryEntry[] = [
  {
    id: "dynamic-array",
    term: "Dynamic array",
    definition: "An array with spare slots at the end that moves to a larger buffer when full: append is O(1) amortized, O(n) worst case.",
  },
  {
    id: "capacity",
    term: "Capacity",
    definition: "The number of slots in a dynamic array's buffer; the size (elements stored) never exceeds it.",
  },
  {
    id: "buffer",
    term: "Buffer",
    definition: "The fixed-size block of memory that actually holds a dynamic array's elements.",
  },
  {
    id: "resize",
    term: "Resize",
    definition: "Allocate a new buffer, copy every stored element into it and switch to it: O(n) for n elements.",
  },
  {
    id: "growth-factor",
    term: "Growth factor",
    definition: "How much a dynamic array multiplies its capacity on a resize, such as 2 or 1.5; any constant above 1 keeps append O(1) amortized.",
  },
  {
    id: "aggregate-analysis",
    term: "Aggregate analysis",
    definition: "Proving an amortized bound by adding up the cost of a whole sequence of n operations and dividing by n.",
  },
  {
    id: "thrashing",
    term: "Thrashing",
    definition: "Resizing again and again when operations alternate around a resize threshold, such as shrinking at half full.",
  },
  {
    id: "over-allocation",
    term: "Over-allocation",
    definition: "Reserving more slots than currently needed so that later appends need no resize.",
  },
];
