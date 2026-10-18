import { ArrowRightIcon, BookOpenIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { RoadmapCard } from "@/components/guide/content/RoadmapCard";
import { RoadmapProgress } from "@/components/guide/content/RoadmapProgress";
import { SectionNumber } from "@/components/layout/section-head";
import { PageHead } from "@/components/page-head";
import { buttonVariants } from "@/components/ui/button";
import { LESSON_DATA, LESSONS, isLessonSlug } from "@/content/learn";
import { buildRoadmap } from "@/lib/guide/content/roadmap";
import type { Track } from "@/lib/guide/content/types";

// Bonus and review tracks are night-tinted cards (DESIGN.md §13.8).
const NIGHT_TRACKS: readonly Track[] = ["bonus", "review"];

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
        size="d1"
        qed
        crumbs={[{ label: "Home", href: "/" }, { label: "Learn" }]}
        title={
          <>
            Data structures, <em>step by step</em>
          </>
        }
        subtitle={
          <span className="lead block max-w-[38ch]">
            Learn how the structures behind your code work, one operation at a time.
          </span>
        }
        actions={
          <Link href="/learn/glossary" className={buttonVariants({ variant: "secondary" })}>
            Glossary
            <ArrowRightIcon aria-hidden data-arrow="" />
          </Link>
        }
      />
      <div className="container-page flex flex-col gap-12 py-10 min-[961px]:py-14">
        {published.length > 0 && (
          <RoadmapProgress lessons={published.map((l) => ({ slug: l.slug, title: l.title }))} />
        )}
        <section aria-labelledby="how-it-works" className="guide-how">
          <h2 id="how-it-works" className="eyebrow">
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
            action={
              <Link href="/problems" className={buttonVariants({ variant: "secondary", className: "min-h-11" })}>
                Browse problems
              </Link>
            }
          >
            <p data-roadmap-empty="">The first lessons are being written. Meanwhile, practise on the problems.</p>
          </EmptyState>
        ) : (
          sections.map((s, i) => (
            <section
              key={s.track}
              aria-labelledby={`track-${s.track}`}
              data-track={s.track}
              className={NIGHT_TRACKS.includes(s.track) ? "guide-track on-night grain rounded-2xl" : "guide-track"}
            >
              <div className="guide-track-head">
                <SectionNumber n={i + 1} />
                <h2 id={`track-${s.track}`} className="guide-track-title">
                  {s.label}
                </h2>
                <span className="guide-track-count">
                  {s.lessons.length} {s.lessons.length === 1 ? "lesson" : "lessons"}
                </span>
              </div>
              <ol className="guide-track-list" role="list">
                {s.lessons.map((l) => (
                  <li key={l.slug}>
                    <RoadmapCard
                      lesson={l}
                      questionIds={questionIds(l.slug)}
                      position={published.findIndex((p) => p.slug === l.slug) + 1}
                    />
                  </li>
                ))}
              </ol>
            </section>
          ))
        )}
      </div>
    </>
  );
}
