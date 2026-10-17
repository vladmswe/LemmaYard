import { cn } from "cn";

import { DIFFICULTIES, DIFFICULTY_ORDER, type Difficulty } from "@/components/problems/difficulty";
import { Progress } from "@/components/ui/progress";
import { formatPercent } from "@/lib/format";

export type ProgressNumbers = {
  solved: Record<Difficulty, number>;
  totals: Record<Difficulty, number>;
  submits: number;
  acceptance: number | null;
};

/**
 * Progress card (landing). With `example`, the numbers are illustrative: the
 * card says so and is hidden from assistive tech; totals are always real.
 */
export function ProgressPreview({
  numbers,
  example = false,
  className,
}: {
  numbers: ProgressNumbers;
  example?: boolean;
  className?: string;
}) {
  const { solved, totals } = numbers;
  const solvedTotal = solved.easy + solved.medium + solved.hard;
  const total = totals.easy + totals.medium + totals.hard;

  return (
    <div className={cn("rounded-lg border bg-card p-6 shadow-xs", className)}>
      {example && (
        <p className="eyebrow mb-4 flex items-center justify-between gap-3">
          <span>Example profile</span>
          <span className="rounded-sm border border-border-strong px-1.5 py-0.5 text-[0.6875rem] tracking-[0.06em]">
            Example
          </span>
        </p>
      )}
      <div aria-hidden={example || undefined}>
        <dl className="mb-6 grid grid-cols-3 gap-2 sm:gap-4">
          <Stat label="Solved">
            {solvedTotal}
            <span className="text-lg text-muted-foreground">/{total}</span>
          </Stat>
          <Stat label="Submissions">{numbers.submits}</Stat>
          <Stat label="Acceptance">{formatPercent(numbers.acceptance, 0)}</Stat>
        </dl>
        <div className="grid gap-1">
          {DIFFICULTY_ORDER.map((d, i) => (
            <div
              key={d}
              className="grid grid-cols-[4.5rem_1fr_3.5rem] items-center gap-3 py-2 text-[0.9375rem]"
            >
              <span className={cn("font-semibold", DIFFICULTIES[d].text)}>
                {DIFFICULTIES[d].label}
              </span>
              <Progress
                value={solved[d]}
                max={totals[d]}
                label={`${DIFFICULTIES[d].label}: ${solved[d]} of ${totals[d]} solved`}
                indicatorClassName={DIFFICULTIES[d].fill}
                delayMs={200 + i * 80}
              />
              <span className="text-right text-sm text-muted-foreground tabular-nums">
                {solved[d]} / {totals[d]}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col-reverse">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="font-heading text-2xl/9 font-semibold tabular-nums sm:text-[1.875rem]/9">
        {children}
      </dd>
    </div>
  );
}

/** Illustrative solved counts for the guest example, derived from real totals. */
export function exampleProgress(totals: Record<Difficulty, number>): ProgressNumbers {
  const solved = {
    easy: Math.round(totals.easy * 0.6),
    medium: Math.round(totals.medium * 0.35),
    hard: Math.round(totals.hard * 0.2),
  };
  return { solved, totals, submits: 64, acceptance: 0.57 };
}
