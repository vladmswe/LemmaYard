"use client";

import { useState } from "react";
import { toast } from "sonner";
import { cn } from "cn";

import { DIFFICULTY_FEEDBACK_LABELS, DIFFICULTY_FEEDBACK_VALUES, type DifficultyFeedback } from "@/lib/community/types";

import { communityFetch } from "./community-api";

/**
 * "How did it feel compared to its rating?" (docs/specs/community.md §A.3,
 * AC-C-VT-5; mockup 01), only for solvers. An opinion: it goes into the
 * maintainer report and the public summary from 10 answers, and never moves
 * any rating. Toggle buttons with aria-pressed; pressing the chosen one clears it.
 */
export function DifficultyFeedbackCard({
  slug,
  initial,
  rating,
  difficultyLabel,
  disabled,
}: {
  slug: string;
  initial: DifficultyFeedback | null;
  rating: number;
  difficultyLabel: string;
  disabled?: boolean;
}) {
  const [value, setValue] = useState<DifficultyFeedback | null>(initial);
  const [pending, setPending] = useState(false);
  const [announce, setAnnounce] = useState("");

  async function choose(next: DifficultyFeedback) {
    if (pending || disabled) return;
    const target = value === next ? null : next;
    const before = value;
    setValue(target);
    setPending(true);
    const result = await communityFetch(`/api/problems/${slug}/difficulty-feedback`, "PUT", { value: target });
    setPending(false);
    if (!result.ok) {
      setValue(before);
      toast.error(result.error);
      return;
    }
    setAnnounce(target === null ? "Answer cleared" : `Saved: ${DIFFICULTY_FEEDBACK_LABELS[target]}`);
  }

  return (
    <section
      aria-labelledby="difficulty-feedback-title"
      className="rounded-lg border bg-card px-4 py-3.5"
      data-testid="difficulty-feedback"
    >
      <h3 id="difficulty-feedback-title" className="text-[0.9375rem] font-semibold">
        How did it feel compared to its rating?
      </h3>
      <p className="mt-0.5 text-sm text-muted-foreground">
        You solved it. Rating {rating} · {difficultyLabel}. Shown to others after 10 answers.
      </p>
      <div role="group" aria-label="Difficulty compared to its rating" className="mt-3 inline-flex flex-wrap rounded-full border border-border bg-surface-sunken p-[3px]">
        {DIFFICULTY_FEEDBACK_VALUES.map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={value === v}
            disabled={pending || disabled}
            onClick={() => void choose(v)}
            className={cn(
              "relative inline-flex h-9 cursor-pointer items-center rounded-full px-4 text-sm font-medium whitespace-nowrap text-muted-foreground transition-[color,background-color,box-shadow] duration-200 ease-out after:absolute after:inset-x-0 after:-inset-y-1 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:cursor-not-allowed aria-pressed:bg-card aria-pressed:font-semibold aria-pressed:text-foreground aria-pressed:shadow-md dark:aria-pressed:bg-popover",
            )}
          >
            {DIFFICULTY_FEEDBACK_LABELS[v]}
          </button>
        ))}
      </div>
      <span aria-live="polite" className="sr-only">
        {announce}
      </span>
    </section>
  );
}
