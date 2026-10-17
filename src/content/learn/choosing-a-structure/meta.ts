import type { LessonMeta } from "@/lib/guide/content/types";

export const meta: LessonMeta = {
  slug: "choosing-a-structure",
  title: "Choosing a data structure (review)",
  summary:
    "Pick the simplest structure that supports every operation you need: a review of the guide with a decision table and mixed questions.",
  track: "review",
  order: 15,
  prerequisites: ["complexity-basics", "arrays", "dynamic-arrays", "linked-lists", "stacks", "queues-and-deques", "hash-tables", "heaps", "binary-search-trees", "balanced-trees", "graphs", "graph-traversal"],
  minutes: 20,
  status: "draft",
  practice: [
    { slug: "binary-search", why: "Sorted array plus halving (lessons 1 and 9)." },
    { slug: "product-of-array-except-self", why: "Prefix and suffix arrays (lesson 2)." },
    { slug: "valid-parentheses", why: "A stack (lesson 5)." },
    { slug: "longest-substring-without-repeating-characters", why: "A hash map inside a sliding window (lesson 7)." },
  ],
  updated: "2026-10-17",
};
