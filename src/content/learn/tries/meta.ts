import type { LessonMeta } from "@/lib/guide/content/types";

export const meta: LessonMeta = {
  slug: "tries",
  title: "Tries: prefix trees",
  summary:
    "Store words as paths of letters, so a prefix query takes time proportional to the prefix length, not to the number of words.",
  track: "bonus",
  order: 13,
  prerequisites: ["hash-tables", "binary-search-trees"],
  minutes: 15,
  status: "draft",
  practice: [],
  updated: "2026-10-17",
};
