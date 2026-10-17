import type { LessonMeta } from "@/lib/guide/content/types";

export const meta: LessonMeta = {
  slug: "balanced-trees",
  title: "Keeping trees balanced: rotations and treaps",
  summary:
    "A search tree is only as fast as it is short; rotations keep its height near log n, and a treap does it with random priorities.",
  track: "trees",
  order: 10,
  prerequisites: ["binary-search-trees"],
  minutes: 20,
  status: "draft",
  practice: [],
  updated: "2026-10-17",
};
