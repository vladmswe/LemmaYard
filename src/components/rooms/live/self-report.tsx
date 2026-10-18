"use client";

// Self-reported LeetCode solves while live (docs/specs/rooms-external-problems.md
// §5): a participant marks their own LeetCode problem solved, or takes it
// back. The time is the server's; the button only says what happened.
import { CheckIcon, Undo2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "cn";

import { DifficultyBadge } from "@/components/problems/difficulty-badge";
import { Button } from "@/components/ui/button";
import type { SessionSnapshot } from "@/lib/rooms/events";
import { problemLabel } from "@/lib/rooms/live-view";
import { formatScoreTime } from "@/lib/rooms/scoring";

import { LeetCodeLink, LeetCodeTag, SelfReportedTag } from "../external/leetcode-bits";
import { sessionApi } from "./session-api";

/** "Mark solved" / "Undo" for the viewer's own LeetCode slot. */
export function SelfReportButton({
  roomId,
  sessionId,
  position,
  solveSeconds,
  onChanged,
  size = "sm",
}: {
  roomId: string;
  sessionId: string;
  position: number;
  /** The viewer's solve time on this slot, or null. */
  solveSeconds: number | null;
  onChanged: () => void;
  size?: "sm" | "default";
}) {
  const [busy, setBusy] = useState(false);
  const solved = solveSeconds !== null;

  async function toggle() {
    setBusy(true);
    const res = await sessionApi.selfReport(roomId, sessionId, position, !solved);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(
      res.data.solved
        ? `${problemLabel(position)} marked solved at ${formatScoreTime(res.data.solveSeconds ?? 0)} (self-reported)`
        : `${problemLabel(position)} is no longer marked solved`,
    );
    onChanged();
  }

  return solved ? (
    <Button
      variant="ghost"
      size={size}
      loading={busy}
      onClick={toggle}
      data-testid={`self-report-undo-${position}`}
    >
      <Undo2Icon aria-hidden />
      Undo<span className="sr-only"> marking {problemLabel(position)} solved</span>
    </Button>
  ) : (
    <Button
      variant="secondary"
      size={size}
      loading={busy}
      onClick={toggle}
      data-testid={`self-report-${position}`}
    >
      <CheckIcon aria-hidden />
      Mark solved<span className="sr-only"> {problemLabel(position)} (self-reported)</span>
    </Button>
  );
}

/**
 * Desktop card above the live scoreboard: the session's LeetCode problems with
 * their links and, for a participant, Mark solved / Undo.
 */
export function ExternalProblemsCard({
  snapshot,
  roomId,
  sessionId,
  viewerId,
  isParticipant,
  onChanged,
  className,
}: {
  snapshot: SessionSnapshot;
  roomId: string;
  sessionId: string;
  viewerId: string;
  isParticipant: boolean;
  onChanged: () => void;
  className?: string;
}) {
  const externals = snapshot.problems.filter((p) => p.external);
  if (externals.length === 0) return null;
  const me = snapshot.participants.find((p) => p.userId === viewerId);
  return (
    <section
      aria-labelledby="leetcode-problems"
      className={cn("flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-sm", className)}
      data-testid="external-problems-card"
    >
      <div>
        <h2 id="leetcode-problems" className="text-[1.0625rem]/6 font-semibold">
          LeetCode problems
        </h2>
        <p className="text-sm text-muted-foreground">
          Solve them on leetcode.com, then mark them solved here. The time is taken when you press the button. These
          results are self-reported and never change ratings.
        </p>
      </div>
      <ul className="flex flex-col divide-y">
        {externals.map((p) => {
          const cell = me?.cells.find((c) => c.position === p.position);
          const solveSeconds = cell?.solveSeconds ?? null;
          return (
            <li key={p.position} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5" data-testid={`external-row-${p.position}`}>
              <span aria-hidden className="font-mono text-xs text-muted-foreground">
                P{p.position}
              </span>
              <LeetCodeTag />
              {p.difficulty && <DifficultyBadge difficulty={p.difficulty} />}
              <span className="min-w-0 flex-1 basis-40 font-semibold break-words">
                <span className="sr-only">{problemLabel(p.position)}: </span>
                {p.external?.slug ? <LeetCodeLink slug={p.external.slug}>{p.title}</LeetCodeLink> : p.title}
              </span>
              {isParticipant && (
                <span className="flex items-center gap-2">
                  {solveSeconds !== null && (
                    <span className="inline-flex items-center gap-1.5 font-mono text-sm text-foreground-secondary tabular-nums">
                      <CheckIcon aria-hidden className="size-3.5 text-success" strokeWidth={3} />
                      {formatScoreTime(solveSeconds)}
                      <SelfReportedTag sr />
                    </span>
                  )}
                  <SelfReportButton
                    roomId={roomId}
                    sessionId={sessionId}
                    position={p.position}
                    solveSeconds={solveSeconds}
                    onChanged={onChanged}
                  />
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
