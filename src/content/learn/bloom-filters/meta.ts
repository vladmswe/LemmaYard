import type { LessonMeta } from "@/lib/guide/content/types";

export const meta: LessonMeta = {
  slug: "bloom-filters",
  title: "Bloom filters: probably in the set",
  summary:
    "Answer \"have I seen this?\" with a few bits per key: never a false no, sometimes a false yes, at an error rate you choose.",
  track: "bonus",
  order: 14,
  prerequisites: ["hash-tables"],
  minutes: 15,
  status: "draft",
  practice: [],
  updated: "2026-10-17",
};
