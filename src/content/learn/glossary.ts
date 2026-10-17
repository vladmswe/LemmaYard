// Guide glossary (PLAN-GUIDE 2.8): every lesson's glossary.ts, merged.
// Ids are global: a term is defined by exactly one lesson.
import type { GlossaryEntry, LessonData, LessonMeta } from "@/lib/guide/content/types";

import { LESSON_DATA, LESSON_SLUGS } from "./index";

export interface GlossaryItem extends GlossaryEntry {
  readonly lesson: LessonMeta; // where the term is introduced
}

/** Merges lesson glossaries; throws on an id that two lessons (or one lesson twice) define. */
export function buildGlossary(lessons: readonly Pick<LessonData, "meta" | "glossary">[]): GlossaryItem[] {
  const seen = new Map<string, string>();
  const items: GlossaryItem[] = [];
  for (const { meta, glossary } of lessons) {
    for (const entry of glossary) {
      const other = seen.get(entry.id);
      if (other !== undefined) {
        throw new Error(`Glossary id "${entry.id}" is defined by both "${other}" and "${meta.slug}"`);
      }
      seen.set(entry.id, meta.slug);
      items.push({ ...entry, lesson: meta });
    }
  }
  return items.sort((a, b) => a.term.localeCompare(b.term, "en", { sensitivity: "base" }));
}

/** All terms of all lessons (drafts included): `<Term id>` must resolve here. */
export const GLOSSARY: readonly GlossaryItem[] = buildGlossary(LESSON_SLUGS.map((s) => LESSON_DATA[s]));

export function findTerm(id: string, items: readonly GlossaryItem[] = GLOSSARY): GlossaryItem | undefined {
  return items.find((t) => t.id === id);
}

/** What /learn/glossary lists: terms of published lessons, alphabetical. */
export function publishedGlossary(items: readonly GlossaryItem[] = GLOSSARY): GlossaryItem[] {
  return items.filter((t) => t.lesson.status === "published");
}
