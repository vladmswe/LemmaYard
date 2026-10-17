// Lesson registry, roadmap and prev/next (AC-G-1-2, AC-G-1-14 data side).
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { neighbours } from "@/components/guide/content/LessonNav";
import { getLesson, LESSON_DATA, LESSON_LOADERS, LESSON_SLUGS, LESSONS, publishedLessons } from "@/content/learn";
import { buildRoadmap } from "@/lib/guide/content/roadmap";
import type { LessonMeta } from "@/lib/guide/content/types";

const PLAN_ORDER = [
  "complexity-basics",
  "arrays",
  "dynamic-arrays",
  "linked-lists",
  "stacks",
  "queues-and-deques",
  "hash-tables",
  "heaps",
  "binary-search-trees",
  "balanced-trees",
  "graphs",
  "graph-traversal",
  "tries",
  "bloom-filters",
  "choosing-a-structure",
];

function fake(slug: string, order: number, track: LessonMeta["track"], status: LessonMeta["status"] = "published"): LessonMeta {
  return {
    slug,
    title: slug,
    summary: `${slug} summary`,
    track,
    order,
    prerequisites: [],
    minutes: 10,
    status,
    practice: [],
    updated: "2026-10-17",
  };
}

describe("lesson registry", () => {
  it("lists the 15 lessons in plan order with matching metadata", () => {
    expect([...LESSON_SLUGS]).toEqual(PLAN_ORDER);
    expect(LESSONS.map((l) => l.slug)).toEqual(PLAN_ORDER);
    expect(LESSONS.map((l) => l.order)).toEqual(PLAN_ORDER.map((_, i) => i + 1));
    for (const slug of LESSON_SLUGS) expect(LESSON_DATA[slug].meta.slug).toBe(slug);
  });

  it("has one explicit static import() per lesson (no template-literal imports)", () => {
    const src = readFileSync(path.join(process.cwd(), "src/content/learn/index.ts"), "utf8");
    expect(src).not.toMatch(/import\(\s*`/);
    for (const slug of LESSON_SLUGS) {
      expect(src).toContain(`import("./${slug}/lesson.mdx")`);
      expect(typeof LESSON_LOADERS[slug]).toBe("function");
    }
  });

  it("keeps every stub a draft (M-G1 publishes nothing)", () => {
    expect(LESSONS.every((l) => l.status === "draft")).toBe(true);
    expect(publishedLessons()).toEqual([]);
  });

  it("looks lessons up by slug", () => {
    expect(getLesson("heaps")?.title).toBe("Heaps and priority queues");
    expect(getLesson("unknown")).toBeUndefined();
    expect(getLesson("_fixture")).toBeUndefined();
  });

  it("publishedLessons filters drafts and sorts by order", () => {
    const list = [fake("b", 2, "linear"), fake("a", 1, "foundations"), fake("d", 3, "linear", "draft")];
    expect(publishedLessons(list).map((l) => l.slug)).toEqual(["a", "b"]);
  });
});

describe("buildRoadmap", () => {
  it("groups published lessons by track in guide order, lessons by order", () => {
    const lessons = [
      fake("heaps", 8, "trees"),
      fake("arrays", 2, "foundations"),
      fake("stacks", 5, "linear"),
      fake("complexity-basics", 1, "foundations"),
      fake("graphs", 11, "graphs", "draft"),
      fake("bsts", 9, "trees"),
    ];
    const roadmap = buildRoadmap(lessons);
    expect(roadmap.map((s) => [s.track, s.label, s.lessons.map((l) => l.slug)])).toEqual([
      ["foundations", "Foundations", ["complexity-basics", "arrays"]],
      ["linear", "Linear structures", ["stacks"]],
      ["trees", "Trees", ["heaps", "bsts"]],
    ]);
  });

  it("is empty while every lesson is a draft", () => {
    expect(buildRoadmap(LESSONS)).toEqual([]);
  });
});

describe("prev / next among published lessons", () => {
  const published = [fake("a", 1, "foundations"), fake("c", 3, "linear"), fake("e", 5, "linear")];
  it("skips drafts and stops at the ends", () => {
    expect(neighbours(3, published)).toEqual({ prev: published[0], next: published[2] });
    expect(neighbours(1, published)).toEqual({ prev: null, next: published[1] });
    expect(neighbours(4, published)).toEqual({ prev: published[1], next: published[2] }); // a draft at order 4
    expect(neighbours(5, published).next).toBeNull();
    expect(neighbours(2, [])).toEqual({ prev: null, next: null });
  });
});
