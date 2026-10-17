import type { LessonMeta } from "@/lib/guide/content/types";

export const meta: LessonMeta = {
  slug: "complexity-basics",
  title: "Measuring cost: Big-O, worst case and amortized time",
  summary:
    "Count the steps an algorithm takes so you can compare data structures before you write code, and know what worst case and amortized really promise.",
  track: "foundations",
  order: 1,
  prerequisites: [],
  minutes: 15,
  status: "published",
  practice: [
    { slug: "binary-search", why: "Halves the search range every step: the O(log n) growth you meet in this lesson." },
    { slug: "two-sum", why: "The O(n²) pair loop you will speed up in the hash-table lesson." },
  ],
  updated: "2026-10-17",
};
