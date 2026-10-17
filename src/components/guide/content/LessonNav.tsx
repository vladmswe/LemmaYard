import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import Link from "next/link";

import type { LessonMeta } from "@/lib/guide/content/types";

/** Previous / next lesson among the published ones, by order (drafts are skipped). */
export function neighbours(
  order: number,
  published: readonly LessonMeta[],
): { prev: LessonMeta | null; next: LessonMeta | null } {
  const sorted = [...published].sort((a, b) => a.order - b.order);
  return {
    prev: sorted.filter((l) => l.order < order).at(-1) ?? null,
    next: sorted.find((l) => l.order > order) ?? null,
  };
}

export function LessonNav({ order, published }: { order: number; published: readonly LessonMeta[] }) {
  const { prev, next } = neighbours(order, published);
  if (!prev && !next) return null;
  return (
    <nav aria-label="Lesson" className="guide-lesson-nav">
      {prev ? (
        <Link href={`/learn/${prev.slug}`} rel="prev" className="guide-lesson-nav-link" data-nav="prev">
          <span className="guide-lesson-nav-dir">
            <ArrowLeftIcon aria-hidden className="size-4" /> Previous
          </span>
          <span className="guide-lesson-nav-title">{prev.title}</span>
        </Link>
      ) : (
        <span />
      )}
      {next && (
        <Link href={`/learn/${next.slug}`} rel="next" className="guide-lesson-nav-link guide-lesson-nav-next" data-nav="next">
          <span className="guide-lesson-nav-dir">
            Next <ArrowRightIcon aria-hidden className="size-4" />
          </span>
          <span className="guide-lesson-nav-title">{next.title}</span>
        </Link>
      )}
    </nav>
  );
}
