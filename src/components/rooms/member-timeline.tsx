import { CalendarDaysIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "cn";

import { EmptyState } from "@/components/empty-state";
import { Reveal } from "@/components/motion/reveal";
import { DIFFICULTIES, DIFFICULTY_ORDER } from "@/components/problems/difficulty";
import { DifficultyBadge } from "@/components/problems/difficulty-badge";
import { Progress } from "@/components/ui/progress";
import { tableLinkClasses } from "@/components/ui/table";
import { formatPercent, formatShortDate } from "@/lib/format";
import {
  progressSeries,
  sessionResultsHref,
  solvedProblemLabel,
  timelineTotals,
  type TimelineSession,
} from "@/lib/rooms/history";
import type { MemberTimeline } from "@/server/rooms/history";

import { LocalDate } from "./local-date";

/** Sessions shown in the progress chart (newest N, oldest first). */
const CHART_SESSIONS = 20;

/** Member timeline body (spec §5.2): header stats, progress chart, dated list. */
export function MemberTimelineView({ roomId, timeline }: { roomId: string; timeline: MemberTimeline }) {
  const { sessions, member } = timeline;
  if (sessions.length === 0) {
    return (
      <div className="rounded-lg border bg-card shadow-xs">
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

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Reveal as="section" index={3} aria-labelledby="rate-heading" className="rounded-lg border bg-card p-6 shadow-xs">
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
        <Reveal as="section" index={4} aria-labelledby="chart-heading" className="rounded-lg border bg-card p-6 shadow-xs">
          <h2 id="chart-heading" className="text-lg/7 font-semibold">
            Progress over time
          </h2>
          <ProgressChart sessions={sessions} />
        </Reveal>
      </div>

      <section aria-labelledby="timeline-heading" className="flex flex-col gap-3">
        <h2 id="timeline-heading" className="text-lg/7 font-semibold">
          Sessions
        </h2>
        <ol className="flex flex-col gap-3" data-testid="timeline-list">
          {sessions.map((s) => (
            <TimelineItem key={s.sessionId} roomId={roomId} session={s} />
          ))}
        </ol>
        {timeline.truncated && (
          <p className="text-sm text-muted-foreground">Showing the latest {sessions.length} sessions.</p>
        )}
      </section>
    </div>
  );
}

function Stat({ label, index, children }: { label: string; index: number; children: React.ReactNode }) {
  return (
    <Reveal index={index} className="flex flex-col-reverse rounded-lg border bg-card p-4 shadow-xs sm:p-6">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="font-heading text-2xl/9 font-semibold tabular-nums sm:text-[1.875rem]/9">{children}</dd>
    </Reveal>
  );
}

/**
 * Solved share per session as bars (CSS/SVG only, DESIGN tokens via
 * fill-*). The SVG is decorative; the caption and the list carry the data.
 */
function ProgressChart({ sessions }: { sessions: TimelineSession[] }) {
  const series = progressSeries(sessions).slice(-CHART_SESSIONS);
  const W = 100;
  const H = 40;
  const gap = series.length > 12 ? 0.8 : 1.6;
  const barW = (W - gap * (series.length - 1)) / series.length;
  const summary = series
    .map((p) => `${formatShortDate(p.startedAt)}: ${p.solved} of ${p.offered}${p.rank === 1 ? ", won" : ""}`)
    .join("; ");
  const first = series[0];
  const last = series[series.length - 1];
  return (
    <figure className="mt-4 flex flex-col gap-2" data-testid="progress-chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        aria-hidden
        className="h-32 w-full overflow-visible"
      >
        {series.map((p, i) => {
          const x = i * (barW + gap);
          const share = p.offered ? p.solved / p.offered : 0;
          const h = Math.max(share * H, share > 0 ? 1 : 0);
          return (
            <g key={p.sessionId}>
              <rect x={x} y={0} width={barW} height={H} rx={0.6} className="fill-muted" />
              <rect x={x} y={H - h} width={barW} height={h} rx={0.6} className="fill-primary" />
            </g>
          );
        })}
      </svg>
      <div aria-hidden className="flex justify-between text-xs text-muted-foreground tabular-nums">
        <span>{formatShortDate(first.startedAt)}</span>
        {series.length > 1 && <span>{formatShortDate(last.startedAt)}</span>}
      </div>
      <figcaption className="text-sm text-muted-foreground">
        Share of each session&apos;s problems solved, oldest first
        {sessions.length > CHART_SESSIONS ? ` (latest ${CHART_SESSIONS} sessions)` : ""}.
        <span className="sr-only"> {summary}.</span>
      </figcaption>
    </figure>
  );
}

/** "Oct 24 · rank 1 of 3 · solved Valid Anagram (6:10), …; not solved: Edit Distance" (spec §5.2). */
function TimelineItem({ roomId, session: s }: { roomId: string; session: TimelineSession }) {
  const solved = s.problems.filter((p) => p.solveSeconds !== null);
  const unsolved = s.problems.filter((p) => p.solveSeconds === null);
  return (
    <li className="rounded-lg border bg-card p-4 shadow-xs sm:p-5" data-session={s.sessionId}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-[1.0625rem]/6 font-semibold">
          <Link href={sessionResultsHref(roomId, s.sessionId)} className={tableLinkClasses()}>
            <LocalDate iso={s.startedAt.toISOString()} options={{ weekday: "short", month: "short", day: "numeric", year: "numeric" }} />
          </Link>
        </h3>
        <p className="text-sm text-muted-foreground tabular-nums">
          {s.rank !== null ? `Rank ${s.rank} of ${s.participants}` : `${s.participants} participants`} · {s.solvedCount}/
          {s.problems.length} solved
        </p>
      </div>
      <div className="mt-3 grid gap-2 text-sm">
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="font-semibold text-success">Solved</span>
          {solved.length === 0 ? (
            <span className="text-muted-foreground">nothing this time</span>
          ) : (
            solved.map((p, i) => (
              <span key={p.position} className="inline-flex items-baseline gap-1.5">
                <span className="text-foreground">
                  {solvedProblemLabel(p)}
                  {i < solved.length - 1 ? "," : ""}
                </span>
                <DifficultyBadge difficulty={p.difficulty} variant="text" className="text-xs" />
              </span>
            ))
          )}
        </p>
        {unsolved.length > 0 && (
          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-semibold text-foreground-secondary">Not solved</span>
            {unsolved.map((p, i) => (
              <span key={p.position} className="inline-flex items-baseline gap-1.5">
                <span className="text-foreground-secondary">
                  {p.title}
                  {p.attempts > 0 ? ` (${p.attempts} ${p.attempts === 1 ? "try" : "tries"})` : ""}
                  {i < unsolved.length - 1 ? "," : ""}
                </span>
                <DifficultyBadge difficulty={p.difficulty} variant="text" className="text-xs" />
              </span>
            ))}
          </p>
        )}
      </div>
    </li>
  );
}
