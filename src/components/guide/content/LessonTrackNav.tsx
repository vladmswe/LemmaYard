"use client";

import { ChevronDownIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";

import { summarize, STATUS_LABELS, useProgress, type LessonStatus } from "@/lib/guide/content/progress";

export interface TrackNavLesson {
  slug: string;
  title: string;
  order: number;
}

export interface TrackNavGroup {
  label: string;
  lessons: readonly TrackNavLesson[];
}

/** Status square of a lesson (DESIGN.md §13.9): done ∎, in progress half, todo outline. Decorative. */
export function LessonStatusSquare({ status }: { status: LessonStatus }) {
  return <span aria-hidden className="guide-status-sq" data-status={status} />;
}

function Groups({ groups, current }: { groups: readonly TrackNavGroup[]; current: string }) {
  const progress = useProgress();
  return (
    <>
      {groups.map((g) => (
        <div key={g.label} className="guide-tracknav-group">
          <p className="guide-tracknav-track">{g.label}</p>
          <ol role="list">
            {g.lessons.map((l) => {
              const status = summarize(progress, l.slug).status;
              const here = l.slug === current;
              return (
                <li key={l.slug}>
                  <Link
                    href={`/learn/${l.slug}`}
                    className="guide-tracknav-link"
                    aria-current={here ? "page" : undefined}
                    data-lesson-status={status}
                  >
                    <LessonStatusSquare status={status} />
                    <span className="min-w-0">{l.title}</span>
                    <span className="sr-only">, {STATUS_LABELS[status]}</span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </>
  );
}

/**
 * Lessons of the guide by track with this browser's status squares: a sticky
 * column from 961px, and a sticky "Lesson k / N" bar with squares and an
 * "All lessons" disclosure below it (DESIGN.md §13.9).
 */
export function LessonTrackNav({ groups, current }: { groups: readonly TrackNavGroup[]; current: string }) {
  const progress = useProgress();
  const all = groups.flatMap((g) => g.lessons);
  const done = all.filter((l) => summarize(progress, l.slug).status === "completed").length;
  const index = all.findIndex((l) => l.slug === current);
  const ref = useRef<HTMLDetailsElement>(null);

  // Esc closes the mobile disclosure and returns focus to its summary.
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && d.open) {
        d.open = false;
        d.querySelector("summary")?.focus();
      }
    };
    d.addEventListener("keydown", onKey);
    return () => d.removeEventListener("keydown", onKey);
  }, []);

  if (all.length === 0) return null;
  const footer = (
    <p className="guide-tracknav-foot">
      {done} of {all.length} lessons complete · stored in this browser
    </p>
  );
  return (
    <>
      <nav aria-label="Lessons" className="guide-tracknav" data-lesson-tracknav="">
        <Groups groups={groups} current={current} />
        {footer}
      </nav>
      <div className="guide-lessonbar" data-lesson-bar="">
        <details ref={ref} className="guide-lessonbar-details">
          <summary className="guide-lessonbar-summary">
            <span className="guide-lessonbar-pos">
              {index >= 0 ? (
                <>
                  Lesson {index + 1}
                  <span className="text-muted-foreground"> / {all.length}</span>
                </>
              ) : (
                "Draft lesson"
              )}
            </span>
            <span aria-hidden className="guide-lessonbar-squares">
              {all.map((l) => (
                <LessonStatusSquare key={l.slug} status={summarize(progress, l.slug).status} />
              ))}
            </span>
            <span className="guide-lessonbar-all">
              All lessons
              <ChevronDownIcon aria-hidden className="size-4" />
            </span>
          </summary>
          <nav aria-label="All lessons" className="guide-lessonbar-panel">
            <Groups groups={groups} current={current} />
            {footer}
          </nav>
        </details>
      </div>
    </>
  );
}
