import type { LessonMeta } from "@/lib/guide/content/types";

export const meta: LessonMeta = {
  slug: "arrays",
  title: "Arrays, half-open ranges and prefix sums",
  summary:
    "Elements side by side in memory give O(1) access by index; see what inserting costs and how prefix sums answer range sums instantly.",
  track: "foundations",
  order: 2,
  prerequisites: ["complexity-basics"],
  minutes: 20,
  status: "draft",
  practice: [
    { slug: "product-of-array-except-self", why: "Prefix and suffix products in two passes." },
    { slug: "best-time-to-buy-and-sell-stock", why: "Keep a running prefix minimum." },
    { slug: "maximum-subarray", why: "Subarray sums seen as differences of prefix sums." },
    { slug: "trapping-rain-water", why: "Prefix and suffix maxima bound the water at each index." },
    { slug: "reverse-string", why: "Two pointers moving towards each other, in place." },
    { slug: "merge-intervals", why: "Sort, then one sweep over the array." },
  ],
  updated: "2026-10-17",
};
