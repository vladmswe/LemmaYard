import type { MDXComponents } from "mdx/types";
import type { ReactNode } from "react";

import { findTerm } from "@/content/learn/glossary";
import { getLesson } from "@/content/learn";
import type { LessonData, PracticeLink } from "@/lib/guide/content/types";

import { ComplexityTable } from "./ComplexityTable";
import { PracticeLinks } from "./PracticeLinks";
import { QuizClient } from "./QuizClient";
import { Term } from "./Term";

const MAX_RELATED = 3;

/** Practice of the prerequisite lessons, for a lesson without its own. */
export function relatedPractice(lesson: LessonData): PracticeLink[] {
  const seen = new Set<string>();
  const out: PracticeLink[] = [];
  for (const slug of lesson.meta.prerequisites) {
    for (const link of getLesson(slug)?.practice ?? []) {
      if (seen.has(link.slug) || out.length >= MAX_RELATED) continue;
      seen.add(link.slug);
      out.push(link);
    }
  }
  return out;
}

/**
 * The MDX components that need the current lesson's data. The lesson page
 * passes them to the MDX content (`<Content components={...} />`), so
 * `<Quiz id>`, `<ComplexityTable id>`, `<PracticeLinks />` and `<Term id>`
 * resolve against this lesson's quiz.ts, complexity.ts, meta.ts, glossary.ts.
 */
export function lessonComponents(lesson: LessonData): MDXComponents {
  const slug = lesson.meta.slug;
  const usedTerms = new Set<string>();
  const questionIds = lesson.quizzes.flatMap((q) => q.questions.map((x) => x.id));

  return {
    Quiz({ id }: { id: string }) {
      const quiz = lesson.quizzes.find((q) => q.id === id);
      if (!quiz) throw new Error(`<Quiz id="${id}">: no such quiz in ${slug}/quiz.ts`);
      return <QuizClient lessonSlug={slug} quiz={quiz} lessonQuestionIds={questionIds} />;
    },
    ComplexityTable({ id }: { id: string }) {
      const table = lesson.tables.find((t) => t.id === id);
      if (!table) throw new Error(`<ComplexityTable id="${id}">: no such table in ${slug}/complexity.ts`);
      return <ComplexityTable table={table} />;
    },
    PracticeLinks() {
      return <PracticeLinks practice={lesson.meta.practice} related={relatedPractice(lesson)} />;
    },
    Term({ id, children }: { id: string; children?: ReactNode }) {
      const entry = lesson.glossary.find((g) => g.id === id) ?? findTerm(id);
      if (!entry) throw new Error(`<Term id="${id}">: no glossary.ts defines this id`);
      const first = !usedTerms.has(id);
      usedTerms.add(id);
      return (
        <Term entry={entry} first={first}>
          {children}
        </Term>
      );
    },
  };
}
