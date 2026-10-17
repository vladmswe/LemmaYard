import type { LessonMeta } from "@/lib/guide/content/types";

export const meta: LessonMeta = {
  slug: "linked-lists",
  title: "Linked lists: nodes, pointers and sentinels",
  summary:
    "Nodes joined by pointers let you insert or delete in O(1) once you hold the right node, at the price of walking the list to find it.",
  track: "linear",
  order: 4,
  prerequisites: ["arrays"],
  minutes: 25,
  status: "draft",
  practice: [],
  updated: "2026-10-17",
};
