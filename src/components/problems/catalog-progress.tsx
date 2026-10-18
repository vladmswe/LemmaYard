import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "cn";

import type { CatalogPage } from "@/server/catalog";

import { DifficultyGlyph } from "./difficulty-badge";
import { DIFFICULTIES, DIFFICULTY_ORDER } from "./difficulty";
import { ProofSquares } from "./proof-squares";

const R = 25;
const C = 2 * Math.PI * R;

/**
 * Page-head aside of the catalog (DESIGN.md §13.3): a ring with the solved
 * count, then Easy / Medium / Hard with their proof squares (filled =
 * solved, dashed = attempted) and "x / y". Guests get a log-in card. The
 * data comes from the catalog's own queries (AC-M3-7: no extra query).
 */
export function CatalogProgress({ data }: { data: CatalogPage }) {
  const { published, progress } = data;

  if (!progress) {
    return (
      <div className="w-full max-w-[22rem] rounded-xl border border-border-strong bg-card p-5 shadow-sm">
        <p className="font-semibold">Track your progress</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Log in to see which problems you have solved and which ones are still open.
        </p>
        <Link
          href="/login?next=%2Fproblems"
          className="mt-3 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-link underline-offset-4 hover:underline"
        >
          Log in to track progress
          <ArrowRightIcon aria-hidden data-arrow className="size-4" />
        </Link>
      </div>
    );
  }

  const solvedTotal = progress.solved.easy + progress.solved.medium + progress.solved.hard;
  const share = published.total > 0 ? solvedTotal / published.total : 0;

  return (
    <section
      aria-labelledby="catalog-progress-heading"
      data-testid="catalog-progress"
      className="w-full rounded-xl border border-border-strong bg-card p-5 shadow-sm min-[961px]:w-auto"
    >
      <h2 id="catalog-progress-heading" className="sr-only">
        Your progress
      </h2>
      <div className="flex items-center gap-5">
        <div className="relative grid size-16 shrink-0 place-items-center">
          <svg aria-hidden viewBox="0 0 60 60" className="absolute inset-0 size-full -rotate-90">
            <circle cx="30" cy="30" r={R} fill="none" strokeWidth="5" className="stroke-surface-sunken" />
            <circle
              cx="30"
              cy="30"
              r={R}
              fill="none"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={`${share * C} ${C}`}
              className={cn("stroke-primary", share === 0 && "hidden")}
            />
          </svg>
          <span className="relative text-lg font-semibold tabular-nums">{solvedTotal}</span>
        </div>
        <dl className="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 text-sm">
          {DIFFICULTY_ORDER.map((d) => {
            const meta = DIFFICULTIES[d];
            const total = published.byDifficulty[d];
            return (
              <div key={d} className="contents">
                <dt className={cn("inline-flex items-center gap-1.5 font-semibold", meta.text)}>
                  <DifficultyGlyph difficulty={d} />
                  {meta.label}
                </dt>
                {/* contents: the squares and the count are two grid cells of one dd. */}
                <dd className="contents">
                  <ProofSquares
                    difficulty={d}
                    solved={progress.solved[d]}
                    attempted={progress.attemptedBy[d]}
                    total={total}
                    size="sm"
                    max={24}
                    className="max-sm:hidden"
                  />
                  <span className="justify-self-end font-mono text-[0.8125rem] text-foreground-secondary tabular-nums max-sm:col-start-3">
                    {progress.solved[d]} / {total}
                    <span className="sr-only"> solved</span>
                  </span>
                </dd>
              </div>
            );
          })}
        </dl>
      </div>
      {progress.attempted > 0 && (
        <p className="mt-3 border-t pt-3 text-[0.8125rem] text-muted-foreground tabular-nums">
          {solvedTotal} of {published.total} solved · {progress.attempted} attempted
        </p>
      )}
    </section>
  );
}
