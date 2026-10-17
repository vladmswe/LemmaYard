// Live problem list (docs/specs/rooms.md §7.4 ProblemList): one card per
// problem with its number, difficulty, title link to the problem page
// carrying the session (`?session=`), and the viewer's own status as icon +
// word ("Solved 23:41" / "Attempted" / "Not started"). Only the viewer's own
// state is shown here; other people's progress is on the scoreboard.
import { CircleCheckIcon, CircleDashedIcon, CircleIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "cn";

import { DifficultyBadge } from "@/components/problems/difficulty-badge";
import type { SessionSnapshot } from "@/lib/rooms/events";
import { myProblemStatus, problemLabel, sessionProblemHref } from "@/lib/rooms/live-view";

const STATUS = {
  solved: { icon: CircleCheckIcon, className: "text-success" },
  attempted: { icon: CircleDashedIcon, className: "text-warning" },
  untouched: { icon: CircleIcon, className: "text-input" },
} as const;

export function ProblemList({
  snapshot,
  sessionId,
  viewerId,
  isParticipant,
  className,
}: {
  snapshot: SessionSnapshot;
  sessionId: string;
  viewerId: string;
  isParticipant: boolean;
  className?: string;
}) {
  return (
    <ol
      aria-label="Problems"
      data-testid="problem-list"
      className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-[repeat(auto-fill,minmax(14rem,1fr))]", className)}
    >
      {snapshot.problems.map((p) => {
        const mine = myProblemStatus(snapshot, viewerId, p.position);
        const s = STATUS[mine.state];
        const Icon = s.icon;
        const href = p.slug ? sessionProblemHref(p.slug, sessionId) : null;
        return (
          <li
            key={p.position}
            data-testid={`problem-card-${p.position}`}
            className={cn(
              "relative flex flex-col gap-2 rounded-lg border bg-card p-4 shadow-xs transition-[border-color,box-shadow] duration-120",
              href && "hover:border-border-strong hover:shadow-sm",
              mine.state === "solved" && "border-success/40",
            )}
          >
            <div className="flex items-center gap-2">
              <span aria-hidden className="grid size-7 place-items-center rounded-md border bg-surface-sunken font-heading text-sm font-semibold tabular-nums">
                {p.position}
              </span>
              <DifficultyBadge difficulty={p.difficulty} />
            </div>
            <h3 className="text-[1.0625rem]/6 font-semibold">
              {href ? (
                <Link href={href} className="rounded-sm text-foreground after:absolute after:inset-0 hover:text-link">
                  <span className="sr-only">{problemLabel(p.position)}: </span>
                  {p.title}
                </Link>
              ) : (
                <span>{problemLabel(p.position)}</span>
              )}
            </h3>
            {isParticipant && (
              <p className={cn("mt-auto flex items-center gap-1.5 text-sm", mine.state === "untouched" ? "text-muted-foreground" : "text-foreground-secondary")}>
                <Icon aria-hidden className={cn("size-4", s.className)} />
                <span className="tabular-nums">{mine.text}</span>
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
