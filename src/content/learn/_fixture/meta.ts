import type { LessonMeta } from "@/lib/guide/content/types";

// Pipeline fixture (M-G1): not a lesson, not in LESSON_SLUGS. Rendered at
// /learn/dev-fixtures/lesson only when GUIDE_FIXTURES=1.
export const meta: LessonMeta = {
  slug: "_fixture",
  title: "Pipeline fixture: a tiny stack",
  summary: "Exercises every lesson component once, so the content pipeline is tested without a real lesson.",
  track: "linear",
  order: 99,
  prerequisites: ["arrays"],
  minutes: 5,
  status: "draft",
  practice: [
    { slug: "valid-parentheses", why: "A stack of open brackets." },
    { slug: "two-sum", why: "A link to a second problem, to test the list." },
  ],
  updated: "2026-10-17",
};
