import type { LessonMeta } from "@/lib/guide/content/types";

export const meta: LessonMeta = {
  slug: "hash-tables",
  title: "Hash tables: sets, maps and collisions",
  summary:
    "Hash a key to a bucket and find it in O(1) on average; learn why collisions happen, what the load factor controls and when the worst case bites.",
  track: "hashing",
  order: 7,
  prerequisites: ["arrays", "linked-lists"],
  minutes: 30,
  status: "draft",
  practice: [
    { slug: "two-sum", why: "Look up the complement of each number in a map." },
    { slug: "contains-duplicate", why: "A set remembers what you have already seen." },
    { slug: "valid-anagram", why: "Count letters with a frequency map." },
    { slug: "longest-substring-without-repeating-characters", why: "A sliding window with a last-seen map." },
  ],
  updated: "2026-10-17",
};
