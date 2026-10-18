import { BookmarkIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "cn";

import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { PlanCard as PlanCardData } from "@/server/plans/read";

import { planHref } from "./plans-api";
import { VisibilityBadge } from "./visibility";

function plural(n: number, word: string): string {
  return `${n} ${n === 1 ? word : `${word}s`}`;
}

/**
 * One plan in a list: title (the card's only link, stretched over the card),
 * meta, and the viewer's progress when known. `showOwner` for plans of
 * other people (saved, discover).
 */
export function PlanCard({ plan, showOwner = false }: { plan: PlanCardData; showOwner?: boolean }) {
  const meta = [
    plan.sectionCount > 0 ? plural(plan.sectionCount, "section") : null,
    plural(plan.itemCount, "problem"),
    showOwner ? `by ${plan.ownerUsername}` : null,
  ].filter(Boolean);
  return (
    <Card interactive className="relative h-full gap-4 px-5 py-5" data-testid="plan-card">
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 text-lg/snug font-semibold break-words" dir="auto">
          <Link
            href={planHref(plan.id, plan.share)}
            className="rounded-sm text-foreground after:absolute after:inset-0 after:rounded-[inherit] hover:text-link"
          >
            {plan.title}
          </Link>
        </h3>
        {!showOwner && <VisibilityBadge visibility={plan.visibility} className="shrink-0" />}
      </div>
      <p className="text-sm text-muted-foreground">
        {meta.join(" · ")}
        {showOwner && plan.saveCount > 0 && (
          <span className="ml-2 inline-flex items-center gap-1 tabular-nums">
            <BookmarkIcon aria-hidden className="size-3.5" />
            {plan.saveCount}
            <span className="sr-only">{plan.saveCount === 1 ? " save" : " saves"}</span>
          </span>
        )}
      </p>
      {plan.done !== null && plan.total !== null && (
        <div className={cn("mt-auto flex flex-col gap-2")}>
          <Progress
            value={plan.done}
            max={Math.max(plan.total, 1)}
            label={`${plan.title}: ${plan.done} of ${plan.total} done`}
            indicatorClassName="bg-success"
          />
          <p className="text-[0.8125rem] text-muted-foreground tabular-nums">
            {plan.total === 0 ? "No problems yet" : `${plan.done} of ${plan.total} done`}
          </p>
        </div>
      )}
    </Card>
  );
}
