import { CircleCheckIcon, CircleDashedIcon, EyeOffIcon, MedalIcon, RotateCcwIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "cn";

import { DifficultyBadge } from "@/components/problems/difficulty-badge";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, tableLinkClasses } from "@/components/ui/table";
import {
  cellSrText,
  formatMinutes,
  memberTimelineHref,
  plural,
  solutionHref,
  type SolutionAccess,
} from "@/lib/rooms/history";
import { formatScoreTime, PENALTY_SEC_PER_WRONG } from "@/lib/rooms/scoring";
import { mixLabel } from "@/lib/rooms/session-view";
import type { FinishedResults, ResultCell, ResultParticipant, ResultProblem } from "@/server/rooms/results";

import { LocalTime } from "./local-time";

const CHALLENGE_LABELS = { relaxed: "Relaxed", balanced: "Balanced", tough: "Tough" } as const;

const HIDDEN_REASON: Record<Exclude<SolutionAccess, { visible: true }>["reason"], string> = {
  not_finished: "Not available yet",
  unsolved: "Not solved",
  room_off: "Sharing is off in this room",
  author_left: "Hidden: left the room",
  opted_out: "Hidden by its author",
};

type Ctx = { roomId: string; sessionId: string };

/** Final scoreboard (spec §4.2 Finished): rank, participant, solved, time, one cell per problem. */
export function FinalScoreboard({ results }: { results: FinishedResults }) {
  const ctx = { roomId: results.room.id, sessionId: results.session.id };
  return (
    <section aria-labelledby="scoreboard-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 id="scoreboard-heading" className="text-lg/7 font-semibold">
          Final standings
        </h2>
        <p className="text-sm text-muted-foreground">
          Ranked by problems solved, then time. Time includes {formatScoreTime(PENALTY_SEC_PER_WRONG)} per wrong
          attempt before a solve.
        </p>
      </div>
      <Table containerClassName="hidden md:block" data-testid="results-table">
        <caption className="sr-only">Scoreboard</caption>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">#</TableHead>
            <TableHead>Participant</TableHead>
            <TableHead numeric>Solved</TableHead>
            <TableHead numeric>Time</TableHead>
            {results.problems.map((p) => (
              <TableHead key={p.position} className="min-w-36">
                <span className="block">Problem {p.position}</span>
                <span className="block max-w-40 truncate text-xs font-medium tracking-normal normal-case" title={p.title}>
                  {p.title}
                </span>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {results.participants.map((p) => (
            <TableRow key={p.userId} data-user={p.username} className={cn(p.isViewer && "bg-secondary!")}>
              <TableCell className="font-mono text-base text-muted-foreground tabular-nums">{p.rank ?? "—"}</TableCell>
              <th scope="row" className="h-12 px-4 text-left align-middle font-normal">
                <ParticipantName ctx={ctx} participant={p} />
              </th>
              <TableCell numeric className="font-semibold">
                {p.solvedCount}
                <span className="font-normal text-muted-foreground">/{results.problems.length}</span>
              </TableCell>
              <TableCell numeric className="whitespace-nowrap">
                <TimeValue participant={p} />
              </TableCell>
              {p.cells.map((c) => (
                <TableCell key={c.position} className="py-2.5 align-top" data-position={c.position}>
                  <ResultCellView ctx={ctx} participant={p} cell={c} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Below md: one card per participant. */}
      <ol aria-label="Scoreboard" className="flex flex-col gap-3 md:hidden" data-testid="results-cards">
        {results.participants.map((p) => (
          <li
            key={p.userId}
            data-user={p.username}
            className={cn("rounded-lg border bg-card p-4 shadow-xs", p.isViewer && "bg-secondary")}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="w-6 font-mono text-base text-muted-foreground tabular-nums">
                  <span className="sr-only">Rank </span>
                  {p.rank ?? "—"}
                </span>
                <ParticipantName ctx={ctx} participant={p} />
              </div>
              <div className="text-right text-sm tabular-nums">
                <div className="font-semibold">
                  {p.solvedCount}/{results.problems.length} solved
                </div>
                <TimeValue participant={p} />
              </div>
            </div>
            <ul className="mt-3 flex flex-col divide-y border-t">
              {p.cells.map((c) => (
                <li key={c.position} className="flex items-start justify-between gap-3 py-2.5">
                  <span className="text-sm text-muted-foreground" aria-hidden>
                    Problem {c.position}
                  </span>
                  <ResultCellView ctx={ctx} participant={p} cell={c} align="end" />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ParticipantName({ ctx, participant: p }: { ctx: Ctx; participant: ResultParticipant }) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <Avatar name={p.username} className={cn(!p.isMember && "opacity-60")} />
      <Link
        href={memberTimelineHref(ctx.roomId, p.username)}
        className={cn(tableLinkClasses(), !p.isMember && "text-muted-foreground")}
      >
        {p.username}
      </Link>
      {p.isViewer && <span className="text-sm text-muted-foreground">(you)</span>}
      {!p.isMember && <span className="text-sm text-muted-foreground">(left)</span>}
      {p.isHost && <Badge variant="outline">Host</Badge>}
    </span>
  );
}

function TimeValue({ participant: p }: { participant: ResultParticipant }) {
  const { solveSec, penaltySec, wrongCount, totalSec } = p.breakdown;
  if (p.solvedCount === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex flex-col items-end">
      <span className="font-semibold">{formatScoreTime(totalSec)}</span>
      {penaltySec > 0 && (
        <span className="text-xs text-muted-foreground" data-testid="penalty-breakdown">
          {formatScoreTime(solveSec)} + {formatScoreTime(penaltySec)} for {plural(wrongCount, "wrong attempt")}
        </span>
      )}
    </span>
  );
}

function ResultCellView({
  ctx,
  participant,
  cell,
  align = "start",
}: {
  ctx: Ctx;
  participant: ResultParticipant;
  cell: ResultCell;
  align?: "start" | "end";
}) {
  const sr = cellSrText(cell.position, cell, cell.firstSolver);
  const solved = cell.solveSeconds !== null;
  const box = cn("flex flex-col gap-1", align === "end" ? "items-end text-right" : "items-start");
  if (!solved && cell.attempts === 0) {
    return (
      <span className={box}>
        <span aria-hidden className="text-muted-foreground">
          —
        </span>
        <span className="sr-only">{sr}</span>
      </span>
    );
  }
  return (
    <span className={box}>
      <span className="sr-only">{sr}</span>
      <span aria-hidden className="inline-flex items-center gap-1.5 text-[0.9375rem]">
        {solved ? (
          <>
            <CircleCheckIcon className="size-4 shrink-0 text-success" />
            <span className="font-semibold tabular-nums">{formatScoreTime(cell.solveSeconds!)}</span>
            {cell.wrongBefore > 0 && <span className="text-sm text-warning tabular-nums">−{cell.wrongBefore}</span>}
          </>
        ) : (
          <>
            <CircleDashedIcon className="size-4 shrink-0 text-warning" />
            <span className="text-sm text-foreground-secondary">Attempted</span>
            <span className="text-sm text-warning tabular-nums">−{cell.attempts}</span>
          </>
        )}
      </span>
      {solved && cell.attempts > 1 && (
        <span aria-hidden className="text-xs text-muted-foreground tabular-nums">
          {plural(cell.attempts, "attempt")}
        </span>
      )}
      {(cell.firstSolver || cell.solvedBefore) && (
        <span aria-hidden className="flex flex-wrap gap-1">
          {cell.firstSolver && (
            <Badge variant="secondary" data-testid="first-solver">
              <MedalIcon />
              First
            </Badge>
          )}
          {cell.solvedBefore && (
            <Badge variant="outline">
              <RotateCcwIcon />
              Solved before
            </Badge>
          )}
        </span>
      )}
      {solved && <SolutionLink ctx={ctx} participant={participant} cell={cell} />}
    </span>
  );
}

function SolutionLink({ ctx, participant: p, cell }: { ctx: Ctx; participant: ResultParticipant; cell: ResultCell }) {
  if (cell.solution.visible) {
    return (
      <Link
        href={solutionHref(ctx.roomId, ctx.sessionId, p.username, cell.position)}
        className="text-sm font-medium text-link underline-offset-4 hover:underline"
        data-testid="view-solution"
      >
        View solution
        <span className="sr-only">
          {" "}
          of {p.isViewer ? "yours" : p.username} for Problem {cell.position}
        </span>
      </Link>
    );
  }
  if (cell.solution.reason === "room_off") return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" data-testid="solution-hidden">
      <EyeOffIcon aria-hidden className="size-3.5" />
      {HIDDEN_REASON[cell.solution.reason]}
    </span>
  );
}

/** "Problem 2 · House Robber · solved by 2 of 3 · first: alice 24:30" (spec §7.4). */
export function ProblemSummaryList({ results }: { results: FinishedResults }) {
  const byPos = new Map(results.summaries.map((s) => [s.position, s]));
  return (
    <section aria-labelledby="problems-heading" className="rounded-lg border bg-card shadow-xs">
      <h2 id="problems-heading" className="px-6 pt-6 text-lg/7 font-semibold">
        Problems
      </h2>
      <ol className="mt-2 divide-y px-6 pb-2" data-testid="problem-summaries">
        {results.problems.map((p) => (
          <ProblemSummaryRow key={p.position} problem={p} summary={byPos.get(p.position)!} />
        ))}
      </ol>
    </section>
  );
}

function ProblemSummaryRow({
  problem: p,
  summary: s,
}: {
  problem: ResultProblem;
  summary: FinishedResults["summaries"][number];
}) {
  return (
    <li className="flex flex-col gap-1.5 py-3.5" data-position={p.position}>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="font-mono text-base/6 text-muted-foreground tabular-nums">{p.position}</span>
        {p.published ? (
          <Link href={`/problems/${p.slug}`} className={tableLinkClasses("min-w-0 break-words")}>
            {p.title}
          </Link>
        ) : (
          <span className="font-medium">{p.title}</span>
        )}
        <DifficultyBadge difficulty={p.difficulty} />
        {p.pinned && <Badge variant="outline">Pinned</Badge>}
      </div>
      <p className="text-sm text-foreground-secondary">
        Solved by {s.solvedBy} of {s.participants}
        {s.attemptedBy > s.solvedBy && <> · {s.attemptedBy - s.solvedBy} tried without a solve</>}
        {s.firstSolvers.length > 0 && (
          <>
            {" "}
            · first:{" "}
            {s.firstSolvers.map((f, i) => (
              <span key={f.userId}>
                {i > 0 && ", "}
                <span className="font-semibold text-foreground">{f.username}</span>{" "}
                <span className="tabular-nums">{formatScoreTime(f.solveSeconds)}</span>
              </span>
            ))}
          </>
        )}
      </p>
    </li>
  );
}

/** Session metadata (spec §5.1 "kept data"). */
export function SessionDetails({ results }: { results: FinishedResults }) {
  const { session } = results;
  const settings = session.settings;
  const endedEarly = session.endReason === "host" && session.runMinutes < session.durationMin;
  const rows: [string, ReactNode][] = [
    [
      "When",
      <>
        <LocalTime iso={session.startedAt} withDate />–<LocalTime iso={session.endedAt} />
      </>,
    ],
    [
      "Duration",
      endedEarly
        ? `${formatMinutes(session.runMinutes)} of ${formatMinutes(session.durationMin)} (ended by the host)`
        : formatMinutes(session.durationMin),
    ],
    ["Host", session.host ?? "—"],
    ["Participants", String(results.participants.length)],
    [
      "Difficulty mix",
      `${mixLabel(settings.mix)} (${settings.mixMode === "suggested" ? "suggested from the room's history" : "custom"})`,
    ],
    ["Challenge", CHALLENGE_LABELS[settings.challenge]],
    ["Topics", results.topics.length > 0 ? results.topics.join(", ") : "Any"],
    ["Avoid solved problems", settings.avoidSolved ? "On" : "Off"],
  ];
  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg/7 font-semibold">Session details</h2>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm" data-testid="session-details">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="min-w-0 break-words text-foreground tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
