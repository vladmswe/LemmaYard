import type { LessonMeta } from "@/lib/guide/content/types";

export const meta: LessonMeta = {
  slug: "heaps",
  title: "Heaps and priority queues",
  summary:
    "Always know the smallest item: a heap keeps the minimum at the root and inserts or removes in O(log n), all inside a plain array.",
  track: "trees",
  order: 8,
  prerequisites: ["arrays"],
  minutes: 25,
  status: "draft",
  practice: [],
  updated: "2026-10-17",
};
