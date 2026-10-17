import type { LessonMeta } from "@/lib/guide/content/types";

export const meta: LessonMeta = {
  slug: "binary-search-trees",
  title: "Trees and binary search trees",
  summary:
    "Keep keys in sorted order and still insert quickly: a binary search tree finds, adds and removes keys in time proportional to its height.",
  track: "trees",
  order: 9,
  prerequisites: ["arrays", "heaps"],
  minutes: 30,
  status: "draft",
  practice: [
    { slug: "binary-search", why: "The same halving logic: the sorted-array version of a search down a BST." },
  ],
  updated: "2026-10-17",
};
