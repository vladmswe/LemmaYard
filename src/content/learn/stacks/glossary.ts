import type { GlossaryEntry } from "@/lib/guide/content/types";

export const glossary: readonly GlossaryEntry[] = [
  {
    id: "stack",
    term: "Stack",
    definition: "A collection that adds and removes only at one end, the top, so the newest value comes out first.",
  },
  {
    id: "lifo",
    term: "LIFO",
    definition: "Last in, first out: the value added most recently is the first one removed. The rule of a stack.",
  },
  {
    id: "push",
    term: "Push and pop",
    definition: "Push adds a value on top of a stack; pop removes the top value and returns it, and fails on an empty stack.",
  },
  {
    id: "top",
    term: "Top",
    definition: "The end of a stack where every push and pop happens; in an array-backed stack it is index size - 1.",
  },
  {
    id: "call-stack",
    term: "Call stack",
    definition: "The stack of frames a running program keeps for its active function calls: a call pushes a frame, a return pops it.",
  },
  {
    id: "monotonic-stack",
    term: "Monotonic stack",
    definition: "A stack whose values only decrease (or only increase) from bottom to top; it answers next-greater and next-smaller questions in one pass.",
  },
];
