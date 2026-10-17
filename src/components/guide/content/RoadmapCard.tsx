import { ClockIcon } from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";

import { Card } from "@/components/ui/card";
import { getLesson } from "@/content/learn";
import type { LessonMeta } from "@/lib/guide/content/types";

import { LessonStatusBadge } from "./RoadmapProgress";

/**
 * One lesson on the roadmap. The title link is stretched over the whole card
 * (one link, no nesting); prerequisite links sit above it.
 */
export function RoadmapCard({ lesson, questionIds }: { lesson: LessonMeta; questionIds: readonly string[] }) {
  const prereqs = lesson.prerequisites.map((s) => getLesson(s)).filter((l): l is LessonMeta => Boolean(l));
  const practice = lesson.practice.length;
  return (
    <Card interactive size="sm" className="guide-card relative" data-roadmap-card={lesson.slug}>
      <div className="flex flex-col gap-2 px-(--card-spacing)">
        <h3 className="text-lg/7 font-semibold">
          <Link href={`/learn/${lesson.slug}`} className="guide-card-link">
            <span className="mr-1 text-muted-foreground tabular-nums">{lesson.order}.</span>
            {lesson.title}
          </Link>
        </h3>
        <p className="text-[0.9375rem] text-foreground-secondary">{lesson.summary}</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <ClockIcon aria-hidden className="size-4" />
            {lesson.minutes} min
          </span>
          {practice > 0 && (
            <span>
              {practice} practice {practice === 1 ? "problem" : "problems"}
            </span>
          )}
          <LessonStatusBadge slug={lesson.slug} questionIds={questionIds} />
        </div>
        {prereqs.length > 0 && (
          <p className="relative z-10 text-sm text-muted-foreground">
            Before this:{" "}
            {prereqs.map((p, i) => (
              <Fragment key={p.slug}>
                {i > 0 && ", "}
                <Link href={`/learn/${p.slug}`} className="guide-link">
                  {p.title}
                </Link>
              </Fragment>
            ))}
          </p>
        )}
      </div>
    </Card>
  );
}
