// Live problem legend (docs/specs/rooms-v2.md §2.1 mobile; rooms.md §7.4):
// the Problems tab below lg. One row per problem: P1, difficulty, title,
// the viewer's own status (icon + word) and Open → the problem page with the
// session (`?session=`). On lg+ the matrix column headers carry the same.
// A LeetCode slot (rooms-external-problems §5) links to leetcode.com in a new
// tab and has the viewer's Mark solved / Undo button.
import { CircleCheckIcon, CircleIcon, CircleXIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "cn";

import { DifficultyBadge } from "@/components/problems/difficulty-badge";
import type { PendingCell, SessionSnapshot } from "@/lib/rooms/events";
import { myProblemStatus, problemLabel, sessionProblemHref } from "@/lib/rooms/live-view";

import { LeetCodeLink, LeetCodeTag } from "../external/leetcode-bits";
import { JudgingSpinner } from "../matrix/score-matrix";
import { SelfReportButton } from "./self-report";

const STATUS = {
  solved: { icon: CircleCheckIcon, className: "text-success" },
  attempted: { icon: CircleXIcon, className: "text-danger" },
  untouched: { icon: CircleIcon, className: "text-input" },
} as const;

export function ProblemList({
  snapshot,
  roomId,
  sessionId,
  viewerId,
  isParticipant,
  pending = [],
  onSelfReport,
  className,
}: {
  snapshot: SessionSnapshot;
  roomId: string;
  sessionId: string;
  viewerId: string;
  isParticipant: boolean;
  pending?: readonly PendingCell[];
  /** After a self-reported LeetCode solve changed (poll now). */
  onSelfReport: () => void;
  className?: string;
}) {
  const me = snapshot.participants.find((p) => p.userId === viewerId);
  return (
    <ol aria-label="Problems" data-testid="problem-list" className={cn("flex flex-col divide-y rounded-xl border bg-card shadow-sm", className)}>
      {snapshot.problems.map((p) => {
        const mine = myProblemStatus(snapshot, viewerId, p.position, pending);
        const href = p.slug ? sessionProblemHref(p.slug, sessionId) : null;
        const s = mine.state === "judging" ? null : STATUS[mine.state];
        const Icon = s?.icon;
        const external = p.external;
        return (
          <li key={p.position} data-testid={`problem-card-${p.position}`} className="flex flex-col gap-1.5 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground" aria-hidden>
                P{p.position}
              </span>
              {external && <LeetCodeTag />}
              {p.difficulty && <DifficultyBadge difficulty={p.difficulty} />}
              <span className="relative min-w-0 flex-1 truncate font-semibold" title={p.title}>
                {href ? (
                  <Link href={href} className="text-foreground hover:text-link">
                    <span className="sr-only">{problemLabel(p.position)}: </span>
                    {p.title}
                  </Link>
                ) : external?.slug ? (
                  <LeetCodeLink slug={external.slug} icon={false} className="text-foreground hover:text-link">
                    <span className="sr-only">{problemLabel(p.position)}: </span>
                    {p.title}
                  </LeetCodeLink>
                ) : (
                  problemLabel(p.position)
                )}
              </span>
              {href && (
                <Link href={href} aria-hidden tabIndex={-1} className="shrink-0 px-1 py-2 text-sm font-semibold text-link hover:underline">
                  Open
                </Link>
              )}
              {external?.slug && (
                <LeetCodeLink slug={external.slug} decorative className="shrink-0 px-1 py-2 text-sm font-semibold">
                  Open
                </LeetCodeLink>
              )}
            </div>
            {isParticipant && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className={cn("flex items-center gap-1.5 text-sm", mine.state === "untouched" ? "text-muted-foreground" : "text-foreground-secondary")}>
                  {Icon ? <Icon aria-hidden className={cn("size-4", s!.className)} /> : <JudgingSpinner />}
                  <span className="tabular-nums">{mine.text}</span>
                </p>
                {external && (
                  <SelfReportButton
                    roomId={roomId}
                    sessionId={sessionId}
                    position={p.position}
                    solveSeconds={me?.cells.find((c) => c.position === p.position)?.solveSeconds ?? null}
                    onChanged={onSelfReport}
                  />
                )}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
