import type { LessonMeta } from "@/lib/guide/content/types";

export const meta: LessonMeta = {
  slug: "dynamic-arrays",
  title: "Dynamic arrays and amortized cost",
  summary:
    "A list that grows on demand: doubling the buffer when it is full keeps appends O(1) amortized, even though one append may copy everything.",
  track: "foundations",
  order: 3,
  prerequisites: ["arrays"],
  minutes: 20,
  status: "draft",
  practice: [],
  updated: "2026-10-17",
};
