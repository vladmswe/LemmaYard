// Scoreboard matrix (docs/specs/rooms-v2.md §2.1, §2.2, §3, §13): rows =
// participants, columns = problems, one cell per pair (solved with time,
// split, wrong attempts and ★ First / judging now / tried / not started) and
// a solved + total time column. A real <table> from lg up (caption, column
// and row headers, one sr-only sentence per cell, icons aria-hidden); below
// lg a problem legend and one card per person. The layout adapts to N
// (wide cells with a time track for 1–2, standard 3–4, narrow 5, compact
// 6–8). No hooks: it renders in the live client screen and on the server
// rendered results page alike. Shows only results: never code, verdict types
// or test data.
import { ArrowRightIcon, CheckIcon, XIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "cn";

import { DifficultyBadge } from "@/components/problems/difficulty-badge";
import { Avatar } from "@/components/ui/avatar";
import {
  axisTicks,
  chipsSrText,
  chipsText,
  columnMetaText,
  columnStats,
  matrixLayout,
  problemLabel,
  wrongAttemptsLabel,
  type CellView,
  type Chip,
  type MatrixLayout,
  type MatrixProblem,
  type ScoreRow,
} from "@/lib/rooms/live-view";

/** Optional per-room rating (Rooms v2 §6, filled by the rating module); absent → nothing renders. */
export type MatrixRating = { rating: number; provisional?: boolean };

export type ScoreMatrixProps = {
  problems: readonly MatrixProblem[];
  rows: readonly ScoreRow[];
  durationSec: number;
  /** Finished session: medians, "seen", last solve, code links; no "Open" or judging counts. */
  final?: boolean;
  caption?: string;
  /** "Open →" link of a problem column (live), or null. */
  problemHref?: (problem: MatrixProblem) => string | null;
  /** Link on the participant's name (e.g. the member timeline). */
  nameHref?: (row: ScoreRow) => string | null;
  /** Extra badges after the name ("(left)"). */
  nameExtra?: (row: ScoreRow) => ReactNode;
  /** Extra content of a solved cell (results: the code link), outside the aria-hidden visuals. */
  cellExtra?: (row: ScoreRow, cell: CellView) => ReactNode;
  /** Rating slot: chip next to each name; renders nothing without data. */
  ratings?: ReadonlyMap<string, MatrixRating>;
  /** Rating slot: problem ratings in the column headers; renders nothing without data. */
  problemRatings?: ReadonlyMap<number, number>;
  /** Show the problem legend above the mobile cards (live; results lists problems elsewhere too). */
  mobileLegend?: boolean;
  className?: string;
};

const TAG =
  "inline-flex h-5 items-center rounded-sm border border-border-strong px-1.5 font-mono text-[0.6875rem] font-medium text-muted-foreground";

/** Static under reduced motion (DESIGN.md §11.3). */
export function JudgingSpinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-3 shrink-0 rounded-full border-2 border-info/30 border-t-info motion-safe:animate-spin-slow",
        className,
      )}
    />
  );
}

function RatingChip({ rating }: { rating: MatrixRating | undefined }) {
  if (!rating) return null;
  return (
    <span className={cn(TAG, "text-foreground-secondary")} data-testid="rating-chip">
      <span className="sr-only">rating </span>
      {rating.rating}
      {rating.provisional && (
        <span className="text-warning" title="Provisional rating">
          ?<span className="sr-only"> (provisional)</span>
        </span>
      )}
    </span>
  );
}

function FirstTag({ words }: { words: boolean }) {
  return (
    <span
      className="inline-flex h-[18px] items-center gap-1 rounded-sm bg-primary-soft px-1.5 font-mono text-[0.625rem] font-semibold tracking-[0.04em] text-on-primary-soft uppercase"
      title="First to solve it"
    >
      ★{words && " First"}
    </span>
  );
}

/** One desktop cell. Visuals are aria-hidden; the sr-only sentence carries the meaning. */
export function MatrixCell({
  cell,
  layout,
  final = false,
  extra,
}: {
  cell: CellView;
  layout: MatrixLayout;
  final?: boolean;
  extra?: ReactNode;
}) {
  const compact = layout.variant === "compact";
  // The key changes with the content, so a changed cell fades/flashes in (motion-safe).
  const key = `${cell.state}-${cell.time}-${cell.wrong}-${cell.firstSolver}-${cell.judgingAttempt}`;
  const box = cn(
    "relative flex h-full min-w-0 flex-col justify-center gap-1 rounded-[10px]",
    compact ? "px-1.5 py-1" : "px-2.5 py-2",
  );
  const l1 = cn("flex min-w-0 items-center gap-1.5 font-mono font-semibold whitespace-nowrap tabular-nums", compact ? "text-[0.8125rem]" : "text-[0.9375rem]");
  const l2 = cn("flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 font-mono font-medium whitespace-nowrap", compact ? "text-[0.65625rem]" : "text-[0.71875rem]");

  if (cell.state === "solved") {
    return (
      <div key={key} data-cell-state="solved" data-position={cell.position} className={cn(box, "bg-success-bg room-flash")}>
        <span className="sr-only">{cell.srText}</span>
        <span aria-hidden className={cn(l1, "text-foreground")}>
          <CheckIcon className="size-3.5 shrink-0 text-success" strokeWidth={3} />
          {cell.time}
          {cell.firstSolver && <FirstTag words={layout.words && !compact} />}
        </span>
        <span className={cn(l2, "text-foreground-secondary")}>
          <span aria-hidden className="contents">
            {cell.split ? (
              <span className="text-success" title="Time since this person's previous solve">
                {cell.split}
              </span>
            ) : (
              layout.words && !compact && <span>first solve</span>
            )}
            {cell.wrong > 0 && <span className="text-warning">{compact ? `${cell.wrong}w` : `${cell.wrong} wrong`}</span>}
            {final && cell.solvedBefore && (
              <span className={cn(TAG, "h-4 px-1 text-[0.625rem] uppercase")} title="Solved this problem before the session">
                seen
              </span>
            )}
          </span>
          {extra}
        </span>
        {layout.track && cell.track !== null && (
          <span aria-hidden className="absolute inset-x-2.5 bottom-1 h-0.5 rounded-full bg-success/15">
            <i className="absolute -top-0.5 h-1.5 w-0.5 rounded-full bg-success" style={{ left: `${(cell.track * 100).toFixed(2)}%` }} />
          </span>
        )}
      </div>
    );
  }
  if (cell.state === "judging") {
    return (
      <div key={key} data-cell-state="judging" data-position={cell.position} className={cn(box, "bg-info-bg ring-1 ring-info/45 ring-inset")}>
        <span className="sr-only">{cell.srText}</span>
        <span aria-hidden className={cn(l1, "text-[0.84375rem] text-info")}>
          <JudgingSpinner />
          Judging…
        </span>
        {!compact && (
          <span aria-hidden className={cn(l2, "text-foreground-secondary")}>
            attempt {cell.judgingAttempt}
          </span>
        )}
      </div>
    );
  }
  if (cell.state === "attempted") {
    return (
      <div key={key} data-cell-state="attempted" data-position={cell.position} className={cn(box, "border border-dashed border-border-strong")}>
        <span className="sr-only">{cell.srText}</span>
        <span aria-hidden className={cn(l1, "text-[0.84375rem] text-danger")}>
          <XIcon className="size-3.5 shrink-0" strokeWidth={3} />
          {compact ? cell.attempts : `${cell.attempts} ${cell.attempts === 1 ? "try" : "tries"}`}
        </span>
        {!compact && (
          <span aria-hidden className={cn(l2, "text-muted-foreground")}>
            not solved
          </span>
        )}
      </div>
    );
  }
  return (
    <div key={key} data-cell-state="untouched" data-position={cell.position} className={cn(box, "items-start pl-3 font-mono text-faint")}>
      <span className="sr-only">{cell.srText}</span>
      <span aria-hidden>—</span>
    </div>
  );
}

/** Mobile card cell: `P3 / ✓ 40:00 ★ / +36:00 1w` (§3.1). */
function MobileCell({ cell, n, final, extra }: { cell: CellView; n: number; final: boolean; extra?: ReactNode }) {
  const pn = <span className="font-mono text-[0.65625rem] font-semibold text-muted-foreground">P{cell.position}</span>;
  const base = "relative flex min-h-14 min-w-0 flex-col gap-1 rounded-[10px] px-2 py-1.5";
  const line = "flex min-w-0 flex-wrap items-center gap-1 font-mono text-[0.8125rem] font-semibold tabular-nums";
  let body: ReactNode;
  let cls = "";
  if (cell.state === "solved") {
    cls = "bg-success-bg";
    body = (
      <>
        <span className={cn(line, "text-foreground")}>
          <CheckIcon className="size-3 shrink-0 text-success" strokeWidth={3} />
          {cell.time}
          {cell.firstSolver && <span className="text-primary" title="First to solve it">★</span>}
        </span>
        <span className="flex flex-wrap gap-x-1.5 font-mono text-[0.65625rem] font-medium">
          {cell.split && <span className="text-success">{cell.split}</span>}
          {cell.wrong > 0 && <span className="text-warning">{cell.wrong}w</span>}
          {final && cell.solvedBefore && <span className="text-muted-foreground">seen</span>}
        </span>
      </>
    );
  } else if (cell.state === "judging") {
    cls = "bg-info-bg ring-1 ring-info/45 ring-inset";
    body = (
      <span className={cn(line, "text-info")}>
        <JudgingSpinner />
        {n <= 2 ? "Judging…" : "…"}
      </span>
    );
  } else if (cell.state === "attempted") {
    cls = "border border-dashed border-border-strong";
    body = (
      <span className={cn(line, "text-danger")}>
        <XIcon className="size-3 shrink-0" strokeWidth={3} />
        {cell.attempts}
      </span>
    );
  } else {
    body = <span className="mt-1 font-mono text-faint">—</span>;
  }
  return (
    <li data-cell-state={cell.state} data-position={cell.position} className={cn(base, cls)}>
      <span className="sr-only">{cell.srText}</span>
      <span aria-hidden className="contents">
        {pn}
        {body}
      </span>
      {extra}
    </li>
  );
}

function ColumnHeader({
  problem,
  stats,
  layout,
  final,
  durationSec,
  href,
  rating,
}: {
  problem: MatrixProblem;
  stats: ReturnType<typeof columnStats>;
  layout: MatrixLayout;
  final: boolean;
  durationSec: number;
  href: string | null;
  rating: number | undefined;
}) {
  const compact = layout.variant === "compact";
  return (
    <th scope="col" className="border-b border-l bg-surface-sunken px-2.5 pt-3.5 pb-3 text-left align-top font-normal" data-position={problem.position}>
      <span className="flex flex-wrap items-center gap-1.5">
        <span
          aria-hidden
          className="inline-grid size-[22px] shrink-0 place-items-center rounded-md border border-border-strong font-mono text-xs font-semibold"
        >
          {problem.position}
        </span>
        <DifficultyBadge difficulty={problem.difficulty} className={cn(compact && "px-1.5 text-[0.6875rem]")} />
        {rating !== undefined && <span className={TAG}>{rating}</span>}
      </span>
      <span className="mt-2 block truncate text-sm/5 font-semibold text-foreground" title={problem.title}>
        <span className="sr-only">{problemLabel(problem.position)}: </span>
        {problem.title ?? <span aria-hidden>{problemLabel(problem.position)}</span>}
      </span>
      <span className="mt-1.5 flex items-baseline justify-between gap-1.5 font-mono text-[0.71875rem] text-muted-foreground">
        <span className="truncate" data-testid="column-meta">
          {columnMetaText(stats, layout, final)}
        </span>
        {href && (
          <Link href={href} className="relative shrink-0 font-sans text-[0.8125rem] font-semibold text-link after:absolute after:-inset-2 hover:underline">
            Open<span className="sr-only"> {problemLabel(problem.position)}</span>
            <ArrowRightIcon aria-hidden className="ml-0.5 inline size-3.5" />
          </Link>
        )}
      </span>
      {layout.axis && (
        <span aria-hidden className="mt-2 flex justify-between font-mono text-[0.6875rem] text-faint">
          {axisTicks(durationSec).map((t, i) => (
            <span key={i}>{t}</span>
          ))}
        </span>
      )}
    </th>
  );
}

function NameBlock({
  row,
  href,
  extra,
  rating,
  meta,
}: {
  row: ScoreRow;
  href: string | null;
  extra?: ReactNode;
  rating?: MatrixRating;
  meta: string;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <Avatar name={row.username} />
      <span className="min-w-0">
        <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
          {href ? (
            <Link href={href} className="truncate font-semibold text-foreground hover:text-link hover:underline">
              {row.username}
            </Link>
          ) : (
            <span className="truncate font-semibold text-foreground">{row.username}</span>
          )}
          {row.isViewer && (
            <span className={TAG}>
              <span className="sr-only">(</span>you<span className="sr-only">)</span>
            </span>
          )}
          {row.isHost && <span className={TAG}>Host</span>}
          <RatingChip rating={rating} />
          {extra}
        </span>
        <span className="mt-0.5 block text-[0.78125rem] text-muted-foreground">{meta}</span>
      </span>
    </span>
  );
}

function rowMeta(row: ScoreRow, final: boolean): string {
  const parts = [wrongAttemptsLabel(row.wrongTotal)];
  if (final && row.lastSolve) parts.push(`last solve ${row.lastSolve}`);
  return parts.join(" · ");
}

function Rank({ rank }: { rank: number | null }) {
  return (
    <span className={cn("text-lg font-semibold tabular-nums", rank === 1 ? "text-primary" : "text-foreground-secondary")}>
      {rank ?? "—"}
    </span>
  );
}

export function ScoreMatrix({
  problems,
  rows,
  durationSec,
  final = false,
  caption = "Scoreboard: who solved which problem and when",
  problemHref,
  nameHref,
  nameExtra,
  cellExtra,
  ratings,
  problemRatings,
  mobileLegend = true,
  className,
}: ScoreMatrixProps) {
  const n = problems.length;
  const layout = matrixLayout(n);
  const stats = problems.map((p) => columnStats(rows, p.position));
  return (
    <div className={className} data-testid="scoreboard" data-variant={layout.variant} data-problems={n}>
      {/* lg+: a real table */}
      <div className="hidden overflow-x-auto rounded-xl border bg-card shadow-sm lg:block" data-testid="matrix-table">
        <table className="w-full table-fixed border-separate border-spacing-0 text-[0.9375rem]">
          <caption className="sr-only">{caption}</caption>
          <colgroup>
            <col style={{ width: 52 }} />
            <col style={{ width: layout.nameCol }} />
            {problems.map((p) => (
              <col key={p.position} />
            ))}
            <col style={{ width: layout.totalCol }} />
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className="label-mono border-b bg-surface-sunken px-2 pt-3.5 align-top text-center text-muted-foreground">
                <span aria-hidden>#</span>
                <span className="sr-only">Rank</span>
              </th>
              <th scope="col" className="label-mono border-b bg-surface-sunken px-3 pt-3.5 text-left align-top text-muted-foreground">
                Participant
              </th>
              {problems.map((p, i) => (
                <ColumnHeader
                  key={p.position}
                  problem={p}
                  stats={stats[i]}
                  layout={layout}
                  final={final}
                  durationSec={durationSec}
                  href={final ? null : (problemHref?.(p) ?? null)}
                  rating={problemRatings?.get(p.position)}
                />
              ))}
              <th scope="col" className="label-mono border-b bg-surface-sunken px-3.5 pt-3.5 text-right align-top text-muted-foreground">
                Solved
                <span className="block font-mono text-[0.6875rem] tracking-normal normal-case">time</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => {
              const last = ri === rows.length - 1;
              const border = last ? "" : "border-b";
              return (
                <tr
                  key={row.userId}
                  data-testid={`score-row-${row.username}`}
                  data-user={row.username}
                  className={cn(row.isViewer && "bg-primary-soft/40")}
                >
                  <td className={cn(border, "px-2 text-center")}>
                    <Rank rank={row.rank} />
                  </td>
                  <th scope="row" className={cn(border, "px-3 py-2.5 text-left font-normal")}>
                    <NameBlock
                      row={row}
                      href={nameHref?.(row) ?? null}
                      extra={nameExtra?.(row)}
                      rating={ratings?.get(row.userId)}
                      meta={rowMeta(row, final)}
                    />
                  </th>
                  {row.cells.map((cell) => (
                    <td
                      key={cell.position}
                      className={cn(border, "border-l p-2", layout.variant === "compact" ? "h-[58px] p-1.5" : "h-[76px]")}
                    >
                      <MatrixCell
                        cell={cell}
                        layout={layout}
                        final={final}
                        extra={cell.state === "solved" ? cellExtra?.(row, cell) : undefined}
                      />
                    </td>
                  ))}
                  <td className={cn(border, "px-3.5 text-right")}>
                    <span className="block text-xl/none font-semibold tabular-nums">{row.solved}</span>
                    <span className="mt-1.5 block font-mono text-xs text-muted-foreground tabular-nums">{row.time}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* < lg: problem legend + one card per person */}
      <div className="lg:hidden">
        {mobileLegend && (
          <ol aria-label="Problems" className="mb-3 grid gap-1.5 text-[0.84375rem]" data-testid="problem-legend">
            {problems.map((p) => {
              const href = final ? null : (problemHref?.(p) ?? null);
              return (
                <li key={p.position} className="flex min-w-0 items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">P{p.position}</span>
                  <DifficultyBadge difficulty={p.difficulty} />
                  <span className="min-w-0 flex-1 truncate" title={p.title}>
                    <span className="sr-only">{problemLabel(p.position)}: </span>
                    {p.title ?? problemLabel(p.position)}
                  </span>
                  {href && (
                    <Link href={href} className="relative shrink-0 px-1 py-2 font-semibold text-link hover:underline">
                      Open<span className="sr-only"> {problemLabel(p.position)}</span>
                    </Link>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        <ol aria-label={caption} className="flex flex-col gap-2.5" data-testid="matrix-cards">
          {rows.map((row) => (
            <li
              key={row.userId}
              data-testid={`score-card-${row.username}`}
              data-user={row.username}
              className={cn("rounded-[18px] border p-3.5 shadow-sm", row.isViewer ? "bg-primary-soft/40" : "bg-card")}
            >
              <div className="flex items-center gap-2.5">
                <span className="w-5 shrink-0">
                  <span className="sr-only">Rank </span>
                  <Rank rank={row.rank} />
                </span>
                <span className="min-w-0 flex-1">
                  <NameBlock
                    row={row}
                    href={nameHref?.(row) ?? null}
                    extra={nameExtra?.(row)}
                    rating={ratings?.get(row.userId)}
                    meta={rowMeta(row, final)}
                  />
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[0.9375rem]/none font-semibold">{row.solved} solved</span>
                  <span className="mt-1 block font-mono text-[0.71875rem] text-muted-foreground tabular-nums">{row.time}</span>
                </span>
              </div>
              <ul
                className={cn(
                  "mt-3 grid gap-1.5",
                  n === 1 ? "grid-cols-1" : n === 2 ? "grid-cols-2" : "grid-cols-[repeat(auto-fill,minmax(72px,1fr))]",
                )}
              >
                {row.cells.map((cell) => (
                  <MobileCell
                    key={cell.position}
                    cell={cell}
                    n={n}
                    final={final}
                    extra={cell.state === "solved" ? cellExtra?.(row, cell) : undefined}
                  />
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/** One-line legend under the matrix (§12 copy). */
export function MatrixLegend({ className }: { className?: string }) {
  const sw = "inline-block size-3.5 shrink-0 rounded";
  return (
    <div className={cn("flex flex-col gap-1.5 text-[0.8125rem] text-muted-foreground", className)} data-testid="matrix-legend">
      <ul className="flex flex-col gap-x-5 gap-y-1.5 sm:flex-row sm:flex-wrap">
        <li className="flex items-start gap-2">
          <span aria-hidden className={cn(sw, "mt-0.5 bg-success-bg ring-1 ring-success ring-inset")} />
          <span>
            Solved: time from session start; <b className="font-mono font-semibold text-success">+split</b> = time since
            that person&apos;s previous solve (≈ time spent on this one)
          </span>
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden className={cn(sw, "bg-info-bg ring-1 ring-info ring-inset")} />
          Judging a submission now
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden className={cn(sw, "border border-dashed border-border-strong")} />
          Tried, not solved yet
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden>★</span> First = first to solve it
        </li>
      </ul>
      <p>Ranking: solved, then time + 5 min per wrong attempt before a solve</p>
    </div>
  );
}

/** "You: 1✓ 2✗ 3✓ 4·" (replaces "You 1/4 · Leader 2/4"). */
export function YouChips({ chips, label = "You", className }: { chips: readonly Chip[]; label?: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-baseline gap-1.5 tabular-nums", className)} data-testid="you-chips" data-chips={chipsText(chips)}>
      <span aria-hidden>{label}:</span>
      <span aria-hidden className="font-mono">
        {chips.map((c, i) => (
          <span
            key={c.position}
            className={cn(
              i > 0 && "ml-1.5",
              c.state === "solved" && "text-success",
              c.state === "attempted" && "text-danger",
              c.state === "judging" && "text-info",
            )}
          >
            {c.position}
            {c.mark}
          </span>
        ))}
      </span>
      <span className="sr-only">
        {label}: {chipsSrText(chips)}
      </span>
    </span>
  );
}
