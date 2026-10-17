import type { LessonMeta } from "@/lib/guide/content/types";

export const meta: LessonMeta = {
  slug: "queues-and-deques",
  title: "Queues, circular buffers and deques",
  summary:
    "First in, first out without shifting: a circular buffer gives O(1) amortized enqueue (the ring grows) and O(1) dequeue; a deque works at both ends.",
  track: "linear",
  order: 6,
  prerequisites: ["stacks"],
  minutes: 25,
  status: "draft",
  practice: [],
  updated: "2026-10-17",
};
