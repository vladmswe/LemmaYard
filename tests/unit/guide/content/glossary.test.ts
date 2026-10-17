// AC-G-1-17: glossary aggregation.
import { describe, expect, it } from "vitest";

import { LESSON_DATA, LESSON_SLUGS } from "@/content/learn";
import { FIXTURE_LESSON } from "@/content/learn/_fixture";
import { buildGlossary, GLOSSARY, publishedGlossary } from "@/content/learn/glossary";
import { glossaryEntrySchema, type LessonMeta } from "@/lib/guide/content/types";

const meta = (slug: string, status: LessonMeta["status"] = "published"): LessonMeta => ({
  ...LESSON_DATA.arrays.meta,
  slug,
  title: slug,
  status,
});

describe("buildGlossary", () => {
  it("merges lesson glossaries alphabetically with the introducing lesson", () => {
    const items = buildGlossary([
      { meta: meta("a"), glossary: [{ id: "load-factor", term: "Load factor", definition: "n/m" }] },
      { meta: meta("b"), glossary: [{ id: "amortized", term: "amortized cost", definition: "average over a sequence" }] },
    ]);
    expect(items.map((i) => [i.id, i.lesson.slug])).toEqual([
      ["amortized", "b"],
      ["load-factor", "a"],
    ]);
  });

  it("rejects an id defined by two lessons", () => {
    expect(() =>
      buildGlossary([
        { meta: meta("hash-tables"), glossary: [{ id: "load-factor", term: "Load factor", definition: "x" }] },
        { meta: meta("bloom-filters"), glossary: [{ id: "load-factor", term: "Load factor", definition: "y" }] },
      ]),
    ).toThrow('Glossary id "load-factor" is defined by both "hash-tables" and "bloom-filters"');
  });

  it("rejects an id repeated inside one lesson", () => {
    const g = { id: "x", term: "X", definition: "x" };
    expect(() => buildGlossary([{ meta: meta("a"), glossary: [g, g] }])).toThrow(/defined by both "a" and "a"/);
  });
});

describe("lesson glossaries", () => {
  it("are valid entries without duplicate ids across lessons and the fixture", () => {
    for (const slug of LESSON_SLUGS) {
      for (const e of LESSON_DATA[slug].glossary) expect(glossaryEntrySchema.safeParse(e).success, `${slug}/${e.id}`).toBe(true);
    }
    expect(() => buildGlossary([...LESSON_SLUGS.map((s) => LESSON_DATA[s]), FIXTURE_LESSON])).not.toThrow();
    expect(GLOSSARY.length).toBe(LESSON_SLUGS.reduce((n, s) => n + LESSON_DATA[s].glossary.length, 0));
  });

  it("lists only published lessons' terms on /learn/glossary", () => {
    const items = buildGlossary([
      { meta: meta("a", "draft"), glossary: [{ id: "x", term: "X", definition: "x" }] },
      { meta: meta("b"), glossary: [{ id: "y", term: "Y", definition: "y" }] },
    ]);
    expect(publishedGlossary(items).map((i) => i.id)).toEqual(["y"]);
    // The real glossary: exactly the entries of the published lessons' glossary.ts files.
    const published = LESSON_SLUGS.filter((s) => LESSON_DATA[s].meta.status === "published");
    const expected = published.flatMap((s) => LESSON_DATA[s].glossary.map((e) => `${s}/${e.id}`)).sort();
    expect(publishedGlossary().map((i) => `${i.lesson.slug}/${i.id}`).sort()).toEqual(expected);
    // With no published lesson, the glossary is empty.
    const allDrafts = LESSON_SLUGS.map((s) => ({ ...LESSON_DATA[s], meta: { ...LESSON_DATA[s].meta, status: "draft" as const } }));
    expect(publishedGlossary(buildGlossary(allDrafts))).toEqual([]);
  });
});
