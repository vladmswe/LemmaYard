import { cn } from "cn";

import { CountUp } from "@/components/motion/count-up";
import { DifficultyGlyph } from "@/components/problems/difficulty-badge";
import { DIFFICULTIES, DIFFICULTY_ORDER, type Difficulty } from "@/components/problems/difficulty";
import { Avatar } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";

export type ProgressNumbers = {
  solved: Record<Difficulty, number>;
  totals: Record<Difficulty, number>;
  submits: number;
  acceptance: number | null;
};

/**
 * Profile card of the landing page (DESIGN.md §13.1 § 05): three serif
 * numbers that count up, then one meter per difficulty. With `example`, the
 * numbers are illustrative: the card says so ("Example") and is hidden from
 * assistive tech; the totals are always the real catalog counts. With
 * `username`, it is the signed-in user's own card.
 */
export function ProgressPreview({
  numbers,
  example = false,
  username,
  className,
}: {
  numbers: ProgressNumbers;
  example?: boolean;
  username?: string;
  className?: string;
}) {
  const { solved, totals } = numbers;
  const solvedTotal = solved.easy + solved.medium + solved.hard;
  const total = totals.easy + totals.medium + totals.hard;
  const acceptance = numbers.acceptance === null ? null : Math.round(numbers.acceptance * 100);

  return (
    <div className={cn("rounded-2xl border bg-card p-6 shadow-md sm:p-8", className)}>
      <div className="flex items-center gap-3">
        <Avatar name={example ? "ada" : (username ?? "you")} className="size-10 rounded-[12px]" />
        <div className="min-w-0">
          <p className="truncate font-semibold">{example ? "Example profile" : (username ?? "Your profile")}</p>
          <p className="text-[0.84375rem] text-muted-foreground">
            {example ? "Illustrative numbers" : "Your numbers so far"}
          </p>
        </div>
        {example && <span className="example-tag ml-auto">Example</span>}
      </div>
      <div aria-hidden={example || undefined}>
        <dl className="mt-6 mb-6 grid grid-cols-3 gap-3 border-b pb-6 sm:gap-4">
          <Stat label="Solved">
            <CountUp value={solvedTotal} />
            <small className="text-[0.45em] text-muted-foreground">/{total}</small>
          </Stat>
          <Stat label="Submissions">
            <CountUp value={numbers.submits} />
          </Stat>
          <Stat label="Acceptance">
            {acceptance === null ? (
              "—"
            ) : (
              <>
                <CountUp value={acceptance} />
                <small className="text-[0.45em] text-muted-foreground">%</small>
              </>
            )}
          </Stat>
        </dl>
        <div className="grid gap-1">
          {DIFFICULTY_ORDER.map((d, i) => (
            <div
              key={d}
              className="grid grid-cols-[5.5rem_1fr_3rem] items-center gap-4 py-2 text-[0.9375rem]"
            >
              <span className={cn("inline-flex items-center gap-1.5 font-semibold", DIFFICULTIES[d].text)}>
                <DifficultyGlyph difficulty={d} />
                {DIFFICULTIES[d].label}
              </span>
              <Progress
                value={solved[d]}
                max={totals[d]}
                label={`${DIFFICULTIES[d].label}: ${solved[d]} of ${totals[d]} solved`}
                indicatorClassName={DIFFICULTIES[d].fill}
                delayMs={200 + i * 150}
              />
              <span className="text-right font-mono text-[0.8125rem] text-muted-foreground tabular-nums">
                {solved[d]}/{totals[d]}
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
    <div className="flex min-w-0 flex-col-reverse">
      <dt className="mt-1.5 text-sm text-muted-foreground">{label}</dt>
      <dd className="font-display text-[2.625rem] leading-none tracking-[-0.01em] whitespace-nowrap tabular-nums sm:text-[3.5rem]">
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
