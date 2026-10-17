// AC-G-1-13: practice links read problems/<slug>/meta.json through metaSchema.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { relatedPractice } from "@/components/guide/content/lesson-components";
import { PRACTICE_FALLBACK_NOTE, PracticeLinks } from "@/components/guide/content/PracticeLinks";
import { LESSON_DATA, LESSON_SLUGS } from "@/content/learn";
import { FIXTURE_LESSON } from "@/content/learn/_fixture";
import { getPracticeProblem } from "@/server/guide/problems";

describe("getPracticeProblem", () => {
  it("returns title and difficulty from meta.json", async () => {
    await expect(getPracticeProblem("two-sum")).resolves.toEqual({ slug: "two-sum", title: "Two Sum", difficulty: "easy" });
  });
  it("rejects an unknown or malformed slug", async () => {
    await expect(getPracticeProblem("no-such-problem")).rejects.toThrow();
    await expect(getPracticeProblem("../package")).rejects.toThrow(/Invalid problem slug/);
  });
});

describe.each([...LESSON_SLUGS, "_fixture"])("practice of %s", (slug) => {
  const meta = slug === "_fixture" ? FIXTURE_LESSON.meta : LESSON_DATA[slug as keyof typeof LESSON_DATA].meta;
  it("links only problems that exist", async () => {
    for (const p of meta.practice) await expect(getPracticeProblem(p.slug), p.slug).resolves.toMatchObject({ slug: p.slug });
  });
});

describe("<PracticeLinks>", () => {
  it("renders title, difficulty, why and a plain /problems/<slug> link", async () => {
    const html = renderToStaticMarkup(
      await PracticeLinks({ practice: [{ slug: "valid-parentheses", why: "A stack of brackets." }] }),
    );
    expect(html).toContain('href="/problems/valid-parentheses"');
    expect(html).toContain("Valid Parentheses");
    expect(html).toMatch(/data-difficulty="easy"[^>]*>Easy</);
    expect(html).toContain("A stack of brackets.");
  });

  it("shows the fallback note and related problems for an empty list", async () => {
    const related = relatedPractice(LESSON_DATA["dynamic-arrays"]);
    expect(related.map((r) => r.slug)).toContain("product-of-array-except-self");
    const html = renderToStaticMarkup(await PracticeLinks({ practice: [], related }));
    expect(html).toContain(PRACTICE_FALLBACK_NOTE);
    expect(html).toContain('href="/problems/product-of-array-except-self"');
    const bare = renderToStaticMarkup(await PracticeLinks({ practice: [] }));
    expect(bare).toContain(PRACTICE_FALLBACK_NOTE);
    expect(bare).not.toContain("href=");
  });

  it("fails on an unknown slug", async () => {
    await expect(PracticeLinks({ practice: [{ slug: "no-such-problem", why: "x" }] })).rejects.toThrow();
  });
});
