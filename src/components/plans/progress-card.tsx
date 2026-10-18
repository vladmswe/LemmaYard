import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { DIFFICULTIES } from "@/components/problems/difficulty";
import type { PlanProgress } from "@/lib/plans/progress";
import type { PlanItemView } from "@/server/plans/read";

/**
 * "Your progress" (mockup 06): the viewer's done count in the display serif,
 * a progress bar, Easy / Medium / Hard / External rows (only those the plan
 * has) and a "Next:" link to the first item not done yet. Guests get a
 * sign-in prompt: progress is always the viewer's own.
 */
export function ProgressCard({
  progress,
  items,
  loginHref,
}: {
  progress: PlanProgress | null;
  items: PlanItemView[];
  loginHref: string;
}) {
  if (!progress) {
    return (
      <Card className="gap-4 px-6">
        <h2 className="eyebrow">Your progress</h2>
        <p className="text-sm text-foreground-secondary">
          Log in to track your progress: problems solved on LemmaYard count automatically, LeetCode links you tick
          yourself.
        </p>
        <Link href={loginHref} className={buttonVariants({ variant: "secondary", className: "self-start" })}>
          Log in
        </Link>
      </Card>
    );
  }
  const rows = [
    ...(["easy", "medium", "hard"] as const).map((d) => ({ label: DIFFICULTIES[d].label, tally: progress.byDifficulty[d] })),
    { label: "LeetCode", tally: progress.external },
  ].filter((r) => r.tally.total > 0);
  const next = progress.nextItemId ? items.find((i) => i.id === progress.nextItemId) : null;

  return (
    <Card className="gap-5 px-6" data-testid="plan-progress">
      <h2 className="eyebrow">Your progress</h2>
      <p className="flex items-baseline gap-2">
        <span className="font-display text-[3.5rem]/[0.9] tabular-nums" data-testid="plan-progress-done">
          {progress.done}
        </span>
        <span className="text-foreground-secondary">of {progress.total} done</span>
      </p>
      <Progress
        value={progress.done}
        max={Math.max(progress.total, 1)}
        label={`${progress.done} of ${progress.total} done`}
        indicatorClassName="bg-success"
      />
      {rows.length > 0 && (
        <dl className="divide-y divide-border border-t border-border text-sm">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between py-2.5">
              <dt className="text-foreground-secondary">{r.label}</dt>
              <dd className="font-semibold tabular-nums">
                {r.tally.done} / {r.tally.total}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {next ? (
        next.kind === "problem" ? (
          <Link href={`/problems/${next.problem.slug}`} className={buttonVariants({ className: "h-auto min-h-11 py-2 whitespace-normal" })}>
            Next: {next.problem.title}
            <ArrowRightIcon aria-hidden data-arrow />
          </Link>
        ) : (
          <a
            href={next.external.url}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ className: "h-auto min-h-11 py-2 whitespace-normal" })}
          >
            Next: {next.external.title}
            <span className="sr-only"> (opens leetcode.com in a new tab)</span>
          </a>
        )
      ) : (
        progress.total > 0 && <p className="text-sm font-semibold text-success">Every problem in this plan is done.</p>
      )}
    </Card>
  );
}
