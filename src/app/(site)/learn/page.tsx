import { BookOpenIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { RoadmapCard } from "@/components/guide/content/RoadmapCard";
import { RoadmapProgress } from "@/components/guide/content/RoadmapProgress";
import { PageHead } from "@/components/page-head";
import { buttonVariants } from "@/components/ui/button";
import { LESSON_DATA, LESSONS, isLessonSlug } from "@/content/learn";
import { buildRoadmap } from "@/lib/guide/content/roadmap";

export const metadata: Metadata = {
  title: "Learn data structures · LemmaYard",
  description:
    "A visual guide to data structures: step through each operation, predict what happens next, and read the same code in Python and JavaScript.",
};

function questionIds(slug: string): string[] {
  return isLessonSlug(slug) ? LESSON_DATA[slug].quizzes.flatMap((q) => q.questions.map((x) => x.id)) : [];
}

// Roadmap (PLAN-GUIDE 2.8): published lessons only, grouped by track.
export default function LearnPage() {
  const sections = buildRoadmap(LESSONS);
  const published = sections.flatMap((s) => s.lessons);

  return (
    <>
      <PageHead
        crumbs={[{ label: "Home", href: "/" }, { label: "Learn" }]}
        title="Data Structures"
        subtitle="Learn how the structures behind your code work, one operation at a time."
      />
      <div className="container-page flex flex-col gap-10 py-10">
        <section aria-labelledby="how-it-works" className="max-w-3xl">
          <h2 id="how-it-works" className="mb-2 text-xl/7 font-semibold">
            How the visuals work
          </h2>
          <p className="text-foreground-secondary">
            Each lesson explains a structure in plain words, then lets you step through its operations with Next and
            Back. Before some steps you predict what happens, and the matching line of Python or JavaScript lights up as
            you go.
          </p>
        </section>

        {published.length === 0 ? (
          <EmptyState
            icon={BookOpenIcon}
            title="Lessons are on their way"
            className="rounded-lg border"
            action={
              <Link href="/problems" className={buttonVariants({ variant: "secondary", className: "min-h-11" })}>
                Browse problems
              </Link>
            }
          >
            <p data-roadmap-empty="">The first lessons are being written. Meanwhile, practise on the problems.</p>
          </EmptyState>
        ) : (
          <>
            <RoadmapProgress lessons={published.map((l) => ({ slug: l.slug, title: l.title }))} />
            {sections.map((s) => (
              <section key={s.track} aria-labelledby={`track-${s.track}`} data-track={s.track}>
                <h2 id={`track-${s.track}`} className="mb-4 font-display text-[1.75rem]/9">
                  {s.label}
                </h2>
                <ol className="grid gap-4 md:grid-cols-2" role="list">
                  {s.lessons.map((l) => (
                    <li key={l.slug}>
                      <RoadmapCard lesson={l} questionIds={questionIds(l.slug)} />
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </>
        )}
      </div>
    </>
  );
}
