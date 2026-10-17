import type { GlossaryEntry } from "@/lib/guide/content/types";

export const glossary: readonly GlossaryEntry[] = [
  {
    id: "time-complexity",
    term: "Time complexity",
    definition: "How the number of basic steps an algorithm takes grows with the input size n, ignoring the speed of any particular machine.",
  },
  {
    id: "big-o",
    term: "Big-O",
    definition: "f(n) = O(g(n)): for large n, f(n) is at most a constant times g(n). An upper bound on growth.",
  },
  {
    id: "big-omega",
    term: "Big-Omega",
    definition: "f(n) = Ω(g(n)): for large n, f(n) is at least a constant times g(n). A lower bound on growth.",
  },
  {
    id: "big-theta",
    term: "Big-Theta",
    definition: "f(n) = Θ(g(n)): f(n) is both O(g(n)) and Ω(g(n)), so g describes its growth exactly, up to constants.",
  },
  {
    id: "worst-case",
    term: "Worst case",
    definition: "The largest number of steps an algorithm takes over all inputs of size n.",
  },
  {
    id: "best-case",
    term: "Best case",
    definition: "The smallest number of steps an algorithm takes over all inputs of size n.",
  },
  {
    id: "average-case",
    term: "Average case",
    definition: "The expected number of steps for inputs of size n drawn from a stated distribution, such as every position being equally likely.",
  },
  {
    id: "amortized-cost",
    term: "Amortized cost",
    definition: "The total cost of any sequence of operations divided by their number: a guarantee per operation over the sequence, not a probability.",
  },
  {
    id: "linear-search",
    term: "Linear search",
    definition: "Compare the elements one by one from the start until one equals the target: O(n) comparisons in the worst case.",
  },
  {
    id: "binary-search",
    term: "Binary search",
    definition: "On a sorted array, compare the middle of the remaining range with the target and keep one half: O(log n) worst case. Returns an index or −1.",
  },
];
