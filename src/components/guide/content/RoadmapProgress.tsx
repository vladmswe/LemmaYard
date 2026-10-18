"use client";

import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { STATUS_LABELS, summarize, useProgress } from "@/lib/guide/content/progress";

import { LessonStatusSquare } from "./LessonTrackNav";

/**
 * Lesson status from this browser's progress (DESIGN.md §13.8): the status
 * square (done ∎ / in progress half / todo outline) plus the word, and the
 * quiz score once answered. `pill` (lesson meta) shows the word in a tinted
 * pill; `row` (roadmap) keeps the word quiet next to the square.
 */
export function LessonStatusBadge({
  slug,
  questionIds,
  variant = "pill",
}: {
  slug: string;
  questionIds: readonly string[];
  variant?: "pill" | "row";
}) {
  const s = summarize(useProgress(), slug, questionIds);
  return (
    <span className="guide-card-status" data-lesson-status={s.status} data-variant={variant}>
      <span className="guide-status-word">
        <LessonStatusSquare status={s.status} />
        {STATUS_LABELS[s.status]}
      </span>
      {s.quizAnswered > 0 && (
        <span className="text-sm text-muted-foreground tabular-nums">
          Quiz {s.quizCorrect}/{s.quizTotal}
        </span>
      )}
    </span>
  );
}

/** "Continue" to the last visited lesson (hidden for new visitors) and overall completion. */
export function RoadmapProgress({ lessons }: { lessons: readonly { slug: string; title: string }[] }) {
  const progress = useProgress();
  const done = lessons.filter((l) => progress.lessons[l.slug]?.completed).length;
  const last = lessons.find((l) => l.slug === progress.last);
  if (!last && done === 0) return null;
  return (
    <div className="guide-roadmap-progress" data-roadmap-progress="">
      {last && (
        <Link href={`/learn/${last.slug}`} className={buttonVariants({ className: "min-h-11" })} data-continue="">
          Continue: {last.title}
          <ArrowRightIcon aria-hidden data-arrow="" />
        </Link>
      )}
      <div className="flex min-w-48 flex-1 items-center gap-3">
        <Progress value={done} max={lessons.length} label="Lessons completed" className="max-w-xs" />
        <span className="text-sm text-muted-foreground tabular-nums">
          {done} / {lessons.length} completed
        </span>
      </div>
    </div>
  );
}
