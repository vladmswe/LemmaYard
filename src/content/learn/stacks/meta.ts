import type { LessonMeta } from "@/lib/guide/content/types";

export const meta: LessonMeta = {
  slug: "stacks",
  title: "Stacks: last in, first out",
  summary:
    "Last in, first out: the structure behind undo, the call stack and bracket matching, every operation O(1), amortized when an array grows.",
  track: "linear",
  order: 5,
  prerequisites: ["dynamic-arrays", "linked-lists"],
  minutes: 20,
  status: "draft",
  practice: [
    { slug: "valid-parentheses", why: "The bracket-matching stack from this lesson, exactly." },
    { slug: "longest-valid-parentheses", why: "A stack of indices instead of characters." },
    { slug: "trapping-rain-water", why: "A monotonic stack finds each bar's bounding walls." },
  ],
  updated: "2026-10-17",
};
