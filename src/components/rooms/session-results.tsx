// Results of a finished session (docs/specs/rooms-v2.md §2.2; rooms.md §4,
// §4.5): fact tiles, the final matrix (same cells as live, plus "seen",
// medians and a code link per solved cell when sharing allows), the
// Timeline lanes, per-problem summaries and the rating-change slot (renders
// nothing until the rating module provides data), then session details.
import { EyeOffIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "cn";

import { DifficultyBadge } from "@/components/problems/difficulty-badge";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { tableLinkClasses } from "@/components/ui/table";
import {
  formatMinutes,
  memberTimelineHref,
  plural,
  resultFacts,
  solutionHref,
  timelineMarks,
  type SolutionAccess,
} from "@/lib/rooms/history";
import {
  axisTicks,
  columnStats,
  hasExternalProblems,
  matrixRows,
  problemLabel,
  selfReportedPositions,
  type CellView,
  type ScoreRow,
} from "@/lib/rooms/live-view";
import { formatScoreTime } from "@/lib/rooms/scoring";
import { mixLabel } from "@/lib/rooms/session-view";
import type { FinishedResults, ResultParticipant } from "@/server/rooms/results";

import { DIFFICULTY_ESTIMATED_HELP, ratingSourceHelp } from "@/lib/leetcode/labels";

import { EstimatedTag, LeetCodeLink, LeetCodeTag } from "./external/leetcode-bits";
import { LocalTime } from "./local-time";
import { MatrixLegend, ScoreMatrix, type MatrixRating } from "./matrix/score-matrix";

const CHALLENGE_LABELS = { relaxed: "Relaxed", balanced: "Balanced", tough: "Tough" } as const;

const HIDDEN_REASON: Record<Exclude<SolutionAccess, { visible: true }>["reason"], string> = {
  not_finished: "Not available yet",
  unsolved: "Not solved",
  room_off: "Sharing is off in this room",
  author_left: "Hidden: left the room",
  opted_out: "Hidden by its author",
};

/** Matrix rows of the results page (participants in rank order). */
export function resultRows(results: FinishedResults): ScoreRow[] {
  return matrixRows(
    results.participants,
    results.problems.map((p) => p.position),
    {
      viewerId: results.viewer.userId,
      durationSec: results.session.durationMin * 60,
      selfReported: selfReportedPositions(results.problems),
    },
  );
}

/** Rating slot: per-person rating before the session, only when the rating module filled it. */
function ratingMap(results: FinishedResults): ReadonlyMap<string, MatrixRating> | undefined {
  const entries = results.participants
    .filter((p) => p.ratingChange)
    .map((p) => [p.userId, { rating: p.ratingChange!.before, provisional: p.ratingChange!.provisional }] as const);
  return entries.length > 0 ? new Map(entries) : undefined;
}

function problemRatingMap(results: FinishedResults): ReadonlyMap<number, number> | undefined {
  const entries = results.problems.filter((p) => p.rating).map((p) => [p.position, p.rating!.before] as const);
  return entries.length > 0 ? new Map(entries) : undefined;
}

// --- Fact tiles -------------------------------------------------------------------

function Fact({ label, value, sub, testId }: { label: string; value: ReactNode; sub?: ReactNode; testId: string }) {
  return (
    <div className="flex min-w-0 flex-col rounded-xl border bg-card px-4 py-4 shadow-sm sm:px-5" data-testid={testId}>
      <dt className="label-mono order-1 text-muted-foreground">{label}</dt>
      <dd className="order-2 mt-2.5 min-w-0 truncate text-lg/6 font-semibold">{value}</dd>
      {sub && <dd className="order-3 mt-1 text-[0.84375rem] text-muted-foreground">{sub}</dd>}
    </div>
  );
}

/** Winner · First solves · Fastest solve · Your session (§2.2). */
export function ResultFacts({ results, rows }: { results: FinishedResults; rows: ScoreRow[] }) {
  const facts = resultFacts(rows);
  const me = rows.find((r) => r.isViewer);
  const myRating = results.participants.find((p) => p.isViewer)?.ratingChange;
  const top = facts.firstSolves[0];
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="result-facts">
      <Fact
        testId="fact-winner"
        label="Winner"
        value={facts.winners.length > 0 ? facts.winners.map((w) => w.username).join(", ") : "—"}
        sub={
          facts.winners.length > 0
            ? `${facts.winners[0].solved} solved · ${formatScoreTime(facts.winners[0].penaltySec)}${facts.winners.length > 1 ? " (tie)" : ""}`
            : "Nobody solved a problem"
        }
      />
      <Fact
        testId="fact-first"
        label="First solves"
        value={top ? `${top.username} · ${top.count}` : "—"}
        sub={facts.firstSolves.length > 0 ? facts.firstSolves.map((f) => `${f.username} ${f.count}`).join(" · ") : undefined}
      />
      <Fact
        testId="fact-fastest"
        label="Fastest solve"
        value={facts.fastest ? <span className="font-mono">{formatScoreTime(facts.fastest.seconds)}</span> : "—"}
        sub={facts.fastest ? `${facts.fastest.username} on ${problemLabel(facts.fastest.position)}` : undefined}
      />
      <Fact
        testId="fact-you"
        label="Your session"
        value={me ? `${me.solved} solved${me.rank !== null ? ` · rank ${me.rank}` : ""}` : "You didn't join"}
        sub={
          myRating ? (
            <span>
              rating {myRating.delta >= 0 ? "+" : "−"}
              {Math.abs(myRating.delta)}
            </span>
          ) : me ? (
            me.solved > 0 ? `${me.time} total time` : undefined
          ) : undefined
        }
      />
    </dl>
  );
}

// --- Matrix -----------------------------------------------------------------------

function SolutionLink({ results, participant: p, cell }: { results: FinishedResults; participant: ResultParticipant; cell: CellView }) {
  const access = p.cells.find((c) => c.position === cell.position)?.solution;
  if (!access) return null;
  if (access.visible) {
    return (
      <Link
        href={solutionHref(results.room.id, results.session.id, p.username, cell.position)}
        className="relative font-sans text-xs font-semibold text-link after:absolute after:-inset-2.5 hover:underline"
        data-testid="view-solution"
      >
        code
        <span className="sr-only">
          {" "}
          of {p.isViewer ? "yours" : p.username} for {problemLabel(cell.position)}
        </span>
      </Link>
    );
  }
  if (access.reason === "room_off") return null;
  return (
    <span className="inline-flex items-center gap-1 font-sans text-[0.6875rem] text-muted-foreground" data-testid="solution-hidden" title={HIDDEN_REASON[access.reason]}>
      <EyeOffIcon aria-hidden className="size-3" />
      <span className="sr-only">{HIDDEN_REASON[access.reason]}</span>
    </span>
  );
}

/** "Who solved what, and when" (§2.2): the final matrix. */
export function FinalScoreboard({ results, rows }: { results: FinishedResults; rows: ScoreRow[] }) {
  const byUser = new Map(results.participants.map((p) => [p.userId, p]));
  return (
    <section aria-labelledby="scoreboard-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 id="scoreboard-heading" className="text-lg/7 font-semibold">
          Who solved what, and when
        </h2>
        {results.room.shareSolutions && (
          <p className="hidden text-sm text-muted-foreground md:block">&ldquo;code&rdquo; in a solved cell opens that person&apos;s solution</p>
        )}
      </div>
      <div data-testid="results-table">
        <ScoreMatrix
          problems={results.problems}
          rows={rows}
          durationSec={results.session.durationMin * 60}
          final
          caption="Final scoreboard: who solved which problem and when"
          nameHref={(r) => memberTimelineHref(results.room.id, r.username)}
          nameExtra={(r) => (byUser.get(r.userId)?.isMember === false ? <span className="text-sm text-muted-foreground">(left)</span> : null)}
          cellExtra={(r, cell) => {
            const p = byUser.get(r.userId);
            // A self-reported LeetCode solve has no code here.
            return p && !cell.selfReported ? <SolutionLink results={results} participant={p} cell={cell} /> : null;
          }}
          ratings={ratingMap(results)}
          problemRatings={problemRatingMap(results)}
        />
      </div>
      <MatrixLegend className="mt-1" selfReported={hasExternalProblems(results.problems)} />
    </section>
  );
}

// --- Timeline lanes ------------------------------------------------------------------

/** One lane per person, a numbered square at each solve (AC-V2-MX-6), with an sr-only table. */
export function SessionTimeline({ results, rows }: { results: FinishedResults; rows: ScoreRow[] }) {
  const durationSec = results.session.durationMin * 60;
  const summary = rows
    .map((r) => {
      const marks = timelineMarks(r.cells, durationSec);
      return marks.length === 0
        ? `${r.username}: no solves`
        : `${r.username}: ${marks.map((m) => `${m.position} at ${formatScoreTime(m.solveSeconds)}`).join(", ")}`;
    })
    .join("; ");
  return (
    <section aria-labelledby="timeline-heading" className="flex min-w-0 flex-col gap-2 rounded-xl border bg-card p-5 shadow-sm sm:p-6" data-testid="session-timeline">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="timeline-heading" className="text-lg/7 font-semibold">
          Timeline
        </h2>
        <span aria-hidden className="label-mono text-muted-foreground">
          0 → {formatScoreTime(durationSec)}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">
        Each square is a solve at its time from the start; the number is the problem.
      </p>
      <div role="img" aria-label={`Timeline of solves. ${summary}.`} className="mt-2 grid grid-cols-[5.5rem_minmax(0,1fr)] sm:grid-cols-[7.5rem_minmax(0,1fr)]">
        {rows.map((r) => (
          <div key={r.userId} className="contents" data-user={r.username}>
            <div aria-hidden className="flex h-11 min-w-0 items-center gap-2 text-sm font-semibold">
              <Avatar name={r.username} className="hidden size-6 rounded-[7px] text-[10px] sm:inline-grid" />
              <span className="truncate">{r.username}</span>
            </div>
            <div aria-hidden className="relative mx-3 h-11 border-b">
              <span className="absolute inset-x-0 top-1/2 h-px bg-border-strong" />
              {[25, 50, 75].map((x) => (
                <span key={x} className="absolute inset-y-0 w-px bg-primary/10" style={{ left: `${x}%` }} />
              ))}
              {timelineMarks(r.cells, durationSec).map((m) => (
                <span
                  key={m.position}
                  data-testid="timeline-mark"
                  data-left={m.left.toFixed(4)}
                  title={`${problemLabel(m.position)} at ${formatScoreTime(m.solveSeconds)}${m.selfReported ? " (self-reported)" : ""}`}
                  data-self-reported={m.selfReported || undefined}
                  className={cn(
                    "absolute top-1/2 grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[7px] bg-success-bg font-mono text-[0.6875rem] font-bold text-success",
                    m.selfReported ? "border-[1.5px] border-dashed border-success" : "ring-[1.5px] ring-success ring-inset",
                  )}
                  style={{ left: `${(m.left * 100).toFixed(2)}%` }}
                >
                  {m.position}
                </span>
              ))}
            </div>
          </div>
        ))}
        <div />
        <div aria-hidden className="mx-3 mt-2 flex justify-between font-mono text-[0.6875rem] text-faint">
          {axisTicks(durationSec).map((t, i) => (
            <span key={i} className={cn(i % 2 === 1 && "hidden sm:inline")}>
              {t}
            </span>
          ))}
        </div>
      </div>
      {/* sr-only on a wrapper: a <table> ignores the 1px box and would widen the page. */}
      <div className="sr-only">
        <table>
          <caption>Solves by person and time</caption>
          <thead>
            <tr>
              <th scope="col">Person</th>
              <th scope="col">Problem</th>
              <th scope="col">Time from the start</th>
            </tr>
          </thead>
          <tbody>
            {rows.flatMap((r) =>
              timelineMarks(r.cells, durationSec).map((m) => (
                <tr key={`${r.userId}-${m.position}`}>
                  <td>{r.username}</td>
                  <td>
                    {problemLabel(m.position)}
                    {m.selfReported ? " (LeetCode, self-reported)" : ""}
                  </td>
                  <td>{formatScoreTime(m.solveSeconds)}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// --- Problems card ------------------------------------------------------------------

/** Per problem: title, difficulty, rating slot, "Solved by k of n · first … · median …". */
export function ProblemSummaryList({ results, rows }: { results: FinishedResults; rows: ScoreRow[] }) {
  const byPos = new Map(results.summaries.map((s) => [s.position, s]));
  return (
    <section aria-labelledby="problems-heading" className="min-w-0 rounded-xl border bg-card shadow-sm">
      <h2 id="problems-heading" className="px-6 pt-6 text-lg/7 font-semibold">
        Problems
      </h2>
      <ol className="mt-2 divide-y px-6 pb-2" data-testid="problem-summaries">
        {results.problems.map((p) => {
          const s = byPos.get(p.position)!;
          const median = columnStats(rows, p.position).medianSeconds;
          return (
            <li key={p.position} className="flex flex-col gap-1.5 py-3.5" data-position={p.position}>
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <span className="font-mono text-base/6 text-muted-foreground tabular-nums">{p.position}</span>
                {p.external ? (
                  <LeetCodeLink slug={p.external.slug} className="min-w-0 font-medium break-words">
                    {p.title}
                  </LeetCodeLink>
                ) : p.published && p.slug ? (
                  <Link href={`/problems/${p.slug}`} className={tableLinkClasses("min-w-0 break-words")}>
                    {p.title}
                  </Link>
                ) : (
                  <span className="font-medium">{p.title}</span>
                )}
                {p.external && <LeetCodeTag />}
                {p.difficulty && <DifficultyBadge difficulty={p.difficulty} />}
                {p.external?.provenance?.difficultyEstimated && p.difficulty && (
                  <EstimatedTag help={DIFFICULTY_ESTIMATED_HELP} testId={`result-difficulty-estimated-${p.position}`} />
                )}
                {p.external?.rating != null && (
                  <span
                    className="rounded-sm border border-border-strong px-1.5 font-mono text-xs text-muted-foreground"
                    title={
                      p.external.provenance?.ratingSource
                        ? ratingSourceHelp(p.external.provenance.ratingSource)
                        : "Rating entered by the room owner (display only)"
                    }
                  >
                    {p.external.rating}
                  </span>
                )}
                {p.pinned && <Badge variant="outline">Pinned</Badge>}
                {p.rating && (
                  <span className="rounded-sm border border-border-strong px-1.5 font-mono text-xs text-muted-foreground">
                    {p.rating.before} → {p.rating.after}
                  </span>
                )}
              </div>
              <p className="text-sm text-foreground-secondary">
                {p.external ? "Marked solved (self-reported) by" : "Solved by"} {s.solvedBy} of {s.participants}
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
                {median !== null && (
                  <>
                    {" "}
                    · median <span className="tabular-nums">{formatScoreTime(median)}</span>
                  </>
                )}
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// --- Rating change (slot) --------------------------------------------------------------

/**
 * Rating change table (§2.2): rendered only when the rating module filled
 * `ratingChange` for at least one participant; otherwise nothing at all.
 */
export function RatingChangeCard({ results, rows }: { results: FinishedResults; rows: ScoreRow[] }) {
  const rated = results.participants.filter((p) => p.ratingChange !== undefined);
  if (rated.length === 0) return null;
  // LeetCode problems are self-reported and never rated (rooms-external-problems §6).
  const judged = new Set(results.problems.filter((p) => !p.external).map((p) => p.position));
  const n = judged.size;
  const externals = results.problems.length - n;
  const rowById = new Map(rows.map((r) => [r.userId, r]));
  const sorted = [...results.participants].sort((a, b) => (b.ratingChange?.delta ?? -1e9) - (a.ratingChange?.delta ?? -1e9));
  return (
    <section aria-labelledby="rating-heading" className="overflow-hidden rounded-xl border bg-card shadow-sm" data-testid="rating-change">
      <div className="px-6 pt-5 pb-3">
        <h2 id="rating-heading" className="text-lg/7 font-semibold">
          Rating change
        </h2>
        <p className="text-sm text-muted-foreground">
          Expected = the sum of each problem&apos;s solve chance from your rating vs. the problem&apos;s rating. Solving more
          than expected raises your rating.
          {n < 4 && ` With ${plural(n, "problem")} the change is scaled down (${n} of 4).`}
          {externals > 0 && ` LeetCode problems (self-reported) do not count toward ratings.`}
        </p>
      </div>
      <div className="overflow-x-auto" role="region" aria-label="Rating change per member" tabIndex={0}>
        <table className="w-full text-sm">
          <caption className="sr-only">Rating change per member</caption>
          <thead className="label-mono text-muted-foreground">
            <tr className="border-y bg-surface-sunken">
              <th scope="col" className="px-6 py-2.5 text-left">Member</th>
              <th scope="col" className="px-3 py-2.5 text-left">Solved</th>
              <th scope="col" className="px-3 py-2.5 text-right">Expected</th>
              <th scope="col" className="px-3 py-2.5 text-right">Before</th>
              <th scope="col" className="px-6 py-2.5 text-right">Change</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => {
              const r = rowById.get(p.userId);
              const c = p.ratingChange;
              return (
                <tr key={p.userId} className="border-b last:border-b-0">
                  <th scope="row" className="px-6 py-3 text-left font-semibold">
                    {p.username}
                  </th>
                  <td className="px-3 py-3 font-mono">
                    {r?.cells
                      .map((cell) => (cell.state === "solved" && judged.has(cell.position) ? cell.position : null))
                      .filter((x) => x !== null)
                      .join(" ") || "—"}
                  </td>
                  <td className="px-3 py-3 text-right font-mono">{c ? c.expected.toFixed(1) : "—"}</td>
                  <td className="px-3 py-3 text-right font-mono">{c ? c.before : "—"}</td>
                  <td className="px-6 py-3 text-right font-mono">
                    {c ? (
                      <>
                        <span className={c.delta >= 0 ? "text-success" : "text-danger"}>
                          {c.delta >= 0 ? "+" : "−"}
                          {Math.abs(c.delta)}
                        </span>{" "}
                        <span className="text-muted-foreground">→ {c.before + c.delta}</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">not rated: no submissions</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
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
  const externals = results.problems.filter((p) => p.external).length;
  if (externals > 0) {
    rows.push([
      "LeetCode problems",
      `${externals} (self-reported; never change ratings${externals === results.problems.length ? ", so this session was unrated" : ""})`,
    ]);
  }
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
