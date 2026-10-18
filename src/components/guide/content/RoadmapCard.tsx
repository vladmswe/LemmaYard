import { ClockIcon } from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";

import { getLesson } from "@/content/learn";
import type { LessonMeta } from "@/lib/guide/content/types";

import { LessonGlyph } from "./LessonGlyph";
import { LessonStatusBadge } from "./RoadmapProgress";

/**
 * One lesson on the roadmap (DESIGN.md §13.8): a row of the track's proof —
 * gutter number, title + summary, minutes, prerequisites, status square and a
 * monoline glyph. The title link is stretched over the whole row (one link,
 * no nesting); prerequisite links sit above it.
 */
export function RoadmapCard({
  lesson,
  questionIds,
  position,
}: {
  lesson: LessonMeta;
  questionIds: readonly string[];
  /** 1-based place among the published lessons (the proof's line number). */
  position: number;
}) {
  const prereqs = lesson.prerequisites.map((s) => getLesson(s)).filter((l): l is LessonMeta => Boolean(l));
  const practice = lesson.practice.length;
  return (
    <div className="guide-card guide-row" data-roadmap-card={lesson.slug}>
      <span aria-hidden className="guide-row-no">
        {String(position).padStart(2, "0")}
      </span>
      <div className="guide-row-main">
        <h3 className="guide-row-title">
          <Link href={`/learn/${lesson.slug}`} className="guide-card-link">
            <span className="sr-only">{position}. </span>
            {lesson.title}
          </Link>
        </h3>
        <p className="guide-row-summary">{lesson.summary}</p>
        <div className="guide-row-meta">
          <LessonStatusBadge slug={lesson.slug} questionIds={questionIds} variant="row" />
          <span className="inline-flex items-center gap-1.5">
            <ClockIcon aria-hidden className="size-4" />
            {lesson.minutes} min
          </span>
          {practice > 0 && (
            <span>
              {practice} practice {practice === 1 ? "problem" : "problems"}
            </span>
          )}
          {prereqs.length > 0 && (
            <span className="guide-row-needs">
              Before this:{" "}
              {prereqs.map((p, i) => (
                <Fragment key={p.slug}>
                  {i > 0 && ", "}
                  <Link href={`/learn/${p.slug}`} className="guide-link">
                    {p.title}
                  </Link>
                </Fragment>
              ))}
            </span>
          )}
        </div>
      </div>
      <LessonGlyph slug={lesson.slug} track={lesson.track} className="guide-row-glyph" />
    </div>
  );
}
