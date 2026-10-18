"use client";

import { useEffect, useId } from "react";

import { Qed } from "@/components/brand/qed";
import { Checkbox } from "@/components/ui/checkbox";
import { markVisited, progressStore, toggleComplete, useProgress } from "@/lib/guide/content/progress";

/** Marks the lesson visited on mount and renders the "Mark lesson as complete" toggle. */
export function LessonProgress({ slug }: { slug: string }) {
  const id = useId();
  const progress = useProgress();
  const completed = Boolean(progress.lessons[slug]?.completed);

  useEffect(() => {
    progressStore().update((p) => markVisited(p, slug, new Date().toISOString()));
  }, [slug]);

  return (
    <div className="guide-complete" data-lesson-complete={completed ? "true" : "false"}>
      <label htmlFor={id} className="guide-complete-label">
        <Checkbox
          id={id}
          checked={completed}
          onCheckedChange={() => progressStore().update((p) => toggleComplete(p, slug, new Date().toISOString()))}
        />
        <span>Mark lesson as complete</span>
      </label>
      {completed && (
        <span className="guide-complete-done">
          <Qed size={10} snap />
          Lesson complete
        </span>
      )}
    </div>
  );
}
