import { CalendarDaysIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "cn";

import { EmptyState } from "@/components/empty-state";
import { Reveal } from "@/components/motion/reveal";
import { DIFFICULTIES, DIFFICULTY_ORDER } from "@/components/problems/difficulty";
import { DifficultyGlyph } from "@/components/problems/difficulty-badge";
import { Progress } from "@/components/ui/progress";
import { tableLinkClasses } from "@/components/ui/table";
import { formatPercent } from "@/lib/format";
import { sessionResultsHref, timelineTotals, type TimelineSession } from "@/lib/rooms/history";
import { formatSplit, problemLabel, splitsByPosition } from "@/lib/rooms/live-view";
import { formatScoreTime } from "@/lib/rooms/scoring";
import type { MemberTimeline } from "@/server/rooms/history";

import { LocalDate } from "./local-date";

/**
 * Member timeline body (spec §5.2, rooms-v2 §2.4): header stats, solve rate
 * by difficulty and, per session, one chip per problem with the solve time
 * from the start, the split since their previous solve, wrong attempts and
 * ★ First (the v1 one-bar "Progress over time" chart is gone).
 */
export function MemberTimelineView({ roomId, timeline }: { roomId: string; timeline: MemberTimeline }) {
  const { sessions, member } = timeline;
  if (sessions.length === 0) {
    return (
      <div className="rounded-xl border bg-card shadow-sm">
        <EmptyState icon={CalendarDaysIcon} title="No finished sessions yet">
          {`Sessions ${member.username} takes part in are listed here with the problems solved on each date.`}
        </EmptyState>
      </div>
    );
  }
  const totals = timelineTotals(sessions);
  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-3 gap-3 sm:gap-6" data-testid="timeline-stats">
        <Stat label="Sessions" index={0}>
          {totals.sessions}
        </Stat>
        <Stat label="Problems solved" index={1}>
          {totals.solved}
          <span className="text-lg text-muted-foreground sm:text-xl">/{totals.offered}</span>
        </Stat>
        <Stat label="Wins" index={2}>
          {totals.wins}
        </Stat>
      </dl>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section aria-labelledby="timeline-heading" className="flex min-w-0 flex-col gap-3 lg:order-1">
          <h2 id="timeline-heading" className="text-lg/7 font-semibold">
            Sessions
          </h2>
          <ol className="flex flex-col gap-3" data-testid="timeline-list">
            {sessions.map((s) => (
              <TimelineItem key={s.sessionId} roomId={roomId} session={s} />
            ))}
          </ol>
          <p className="text-sm text-muted-foreground">
            Times are from each session&apos;s start; +split = time since their previous solve. ★ = first to solve it.
          </p>
          {timeline.truncated && (
            <p className="text-sm text-muted-foreground">Showing the latest {sessions.length} sessions.</p>
          )}
        </section>
        <Reveal as="section" index={3} aria-labelledby="rate-heading" className="rounded-xl border bg-card p-6 shadow-sm lg:order-2">
          <h2 id="rate-heading" className="text-lg/7 font-semibold">
            Solve rate by difficulty
          </h2>
          <p className="text-sm text-muted-foreground">Problems solved out of those offered in their sessions.</p>
          <div className="mt-4 grid gap-1" data-testid="timeline-difficulty">
            {DIFFICULTY_ORDER.map((d, i) => {
              const { solved, offered } = totals.byDifficulty[d];
              return (
                <div
                  key={d}
                  data-difficulty={d}
                  className="grid grid-cols-[4.5rem_minmax(0,1fr)_5.5rem] items-center gap-3 py-2 text-[0.9375rem]"
                >
                  <span className={cn("font-semibold", DIFFICULTIES[d].text)}>{DIFFICULTIES[d].label}</span>
                  <Progress
                    value={solved}
                    max={Math.max(offered, 1)}
                    label={`${DIFFICULTIES[d].label}: ${solved} of ${offered} solved`}
                    indicatorClassName={DIFFICULTIES[d].fill}
                    delayMs={200 + i * 80}
                  />
                  <span className="text-right text-sm text-muted-foreground tabular-nums">
                    {solved} / {offered}
                    <span className="sr-only"> ({formatPercent(offered ? solved / offered : null, 0)})</span>
                  </span>
                </div>
              );
            })}
          </div>
        </Reveal>
      </div>
    </div>
  );
}

function Stat({ label, index, children }: { label: string; index: number; children: React.ReactNode }) {
  return (
    <Reveal index={index} className="flex flex-col-reverse rounded-xl border bg-card p-4 shadow-sm sm:p-6">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="font-display text-[1.75rem]/9 tabular-nums sm:text-[2.25rem]/10">{children}</dd>
    </Reveal>
  );
}

function chipSr(p: TimelineSession["problems"][number], split: number | null): string {
  const head = `${problemLabel(p.position)}, ${p.title}: `;
  if (p.solveSeconds !== null) {
    const parts = [`solved at ${formatScoreTime(p.solveSeconds)}`];
    if (split !== null) parts.push(`${formatSplit(split)} after the previous solve`);
    if (p.wrongBefore > 0) parts.push(`${p.wrongBefore} wrong`);
    if (p.firstSolver) parts.push("first to solve it");
    return head + parts.join(", ");
  }
  if (p.attempts > 0) return `${head}not solved, ${p.attempts} ${p.attempts === 1 ? "try" : "tries"}`;
  return `${head}not attempted`;
}

/** "Sat, Oct 24 · rank 1 of 3 · 3/4 solved" + one chip per problem (rooms-v2 §2.4). */
function TimelineItem({ roomId, session: s }: { roomId: string; session: TimelineSession }) {
  const splits = splitsByPosition(
    s.problems.map((p) => ({ ...p, solvedBefore: false })),
  );
  return (
    <li className="rounded-xl border bg-card p-4 shadow-sm sm:p-5" data-session={s.sessionId}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-[1.0625rem]/6 font-semibold">
          <Link href={sessionResultsHref(roomId, s.sessionId)} className={tableLinkClasses()}>
            <LocalDate iso={s.startedAt.toISOString()} options={{ weekday: "short", month: "short", day: "numeric", year: "numeric" }} />
          </Link>
        </h3>
        <p className="text-sm text-muted-foreground tabular-nums">
          {s.rank !== null ? `Rank ${s.rank} of ${s.participants}` : `${s.participants} participants`} · {s.solvedCount} of{" "}
          {s.problems.length} solved
        </p>
      </div>
      <ul className="mt-3 flex flex-wrap gap-2" data-testid="timeline-chips">
        {s.problems.map((p) => {
          const solved = p.solveSeconds !== null;
          const split = splits.get(p.position) ?? null;
          return (
            <li
              key={p.position}
              data-position={p.position}
              data-state={solved ? "solved" : p.attempts > 0 ? "attempted" : "untouched"}
              className={cn(
                "flex min-w-0 max-w-full items-center gap-2 rounded-[10px] px-2.5 py-1.5 text-[0.8125rem]",
                solved ? "bg-success-bg" : p.attempts > 0 ? "border border-dashed border-border-strong" : "border",
              )}
            >
              <span className="sr-only">{chipSr(p, split)}</span>
              <span aria-hidden className="flex min-w-0 items-center gap-2">
                <DifficultyGlyph difficulty={p.difficulty} className={DIFFICULTIES[p.difficulty].text} />
                <span className="max-w-[12rem] truncate font-medium" title={p.title}>
                  {p.position} · {p.title}
                </span>
                {solved ? (
                  <span className="flex items-center gap-1.5 font-mono font-semibold whitespace-nowrap tabular-nums">
                    <span className="text-success">✓</span>
                    {formatScoreTime(p.solveSeconds!)}
                    {split !== null && <span className="font-medium text-success">{formatSplit(split)}</span>}
                    {p.wrongBefore > 0 && <span className="font-medium text-warning">{p.wrongBefore}w</span>}
                    {p.firstSolver && <span className="text-primary">★</span>}
                  </span>
                ) : p.attempts > 0 ? (
                  <span className="font-mono font-semibold whitespace-nowrap text-danger">✗ {p.attempts}</span>
                ) : (
                  <span className="font-mono text-faint">—</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </li>
  );
}
