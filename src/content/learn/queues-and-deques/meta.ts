import type { LessonMeta } from "@/lib/guide/content/types";

export const meta: LessonMeta = {
  slug: "queues-and-deques",
  title: "Queues, circular buffers and deques",
  summary:
    "First in, first out without shifting elements: a circular buffer gives O(1) enqueue and dequeue, and a deque works at both ends.",
  track: "linear",
  order: 6,
  prerequisites: ["stacks"],
  minutes: 25,
  status: "draft",
  practice: [],
  updated: "2026-10-17",
};
