// Scoreboard (docs/specs/rooms.md §4.1–§4.3, §7.4 accessibility): a real
// table from md up (caption, participant row headers, sr-only text per cell),
// a card list below md. Shows only "solved", times and attempt counts:
// never code, verdict types or test data. A changed cell fades in (260 ms,
// motion-safe only) because its key changes with its content.
import { CircleCheckIcon, CircleXIcon, HistoryIcon, MedalIcon } from "lucide-react";
import { cn } from "cn";

import { TestSquares, type TestSquareState } from "@/components/judge/test-squares";
import { Avatar } from "@/components/ui/avatar";
import type { SessionSnapshot } from "@/lib/rooms/events";
import { problemLabel, scoreboardRows, type CellView, type ScoreRow } from "@/lib/rooms/live-view";

export type ScoreboardProps = {
  snapshot: SessionSnapshot;
  viewerId: string | null;
  /** Finished: also "Solved before" markers. */
  final?: boolean;
  /** Visible heading level/text is rendered by the caller; this labels the table. */
  caption?: string;
  className?: string;
};

function CellMarks({ cell, final }: { cell: CellView; final: boolean }) {
  return (
    <>
      {cell.firstSolver && (
        <span
          className="inline-flex h-5 items-center gap-1 rounded-sm whitespace-nowrap bg-primary-soft px-1.5 font-mono text-[0.6875rem] font-medium tracking-[0.04em] text-on-primary-soft uppercase"
          aria-hidden
        >
          <MedalIcon className="size-3" />
          First
        </span>
      )}
      {final && cell.solvedBefore && (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground" aria-hidden>
          <HistoryIcon className="size-3.5" />
          Solved before
        </span>
      )}
    </>
  );
}

export function ScoreCell({ cell, final = false }: { cell: CellView; final?: boolean }) {
  const key = `${cell.state}-${cell.time}-${cell.wrong}-${cell.firstSolver}`;
  return (
    <span
      key={key}
      data-cell-state={cell.state}
      className={cn(
        "inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-sm motion-safe:animate-enter-fade",
        cell.state === "solved" && "room-flash",
      )}
    >
      <span className="sr-only">{cell.srText}</span>
      {cell.state === "solved" && (
        <span aria-hidden className="inline-flex items-center gap-1.5 font-medium whitespace-nowrap text-success">
          <CircleCheckIcon className="size-4" />
          <span className="font-mono text-[0.8125rem] text-foreground tabular-nums">{cell.time}</span>
          {cell.wrong && <span className="tabular-nums text-xs text-muted-foreground">{cell.wrong}</span>}
        </span>
      )}
      {cell.state === "attempted" && (
        <span aria-hidden className="inline-flex items-center gap-1.5 whitespace-nowrap text-danger">
          <CircleXIcon className="size-4" />
          <span className="font-mono text-[0.8125rem] text-foreground-secondary tabular-nums">{cell.wrong}</span>
        </span>
      )}
      {cell.state === "untouched" && (
        <span aria-hidden className="text-muted-foreground">
          —
        </span>
      )}
      <CellMarks cell={cell} final={final} />
    </span>
  );
}

const TAG = "inline-flex h-5 items-center rounded-sm border border-border-strong px-1.5 font-mono text-[0.6875rem] font-medium text-muted-foreground";

function Name({ row }: { row: ScoreRow }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2.5">
      <Avatar name={row.username} />
      <span className="truncate font-semibold text-foreground">{row.username}</span>
      {row.isViewer && (
        <span className={TAG}>
          <span className="sr-only">(</span>you<span className="sr-only">)</span>
        </span>
      )}
      {row.isHost && <span className={TAG}>Host</span>}
    </span>
  );
}

/** Rank: sans 600 (small numbers are never serif), the leader in primary. */
function Rank({ rank }: { rank: number | null }) {
  return (
    <span className={cn("text-lg font-semibold tabular-nums", rank === 1 ? "text-primary" : "text-muted-foreground")}>
      {rank ?? "—"}
    </span>
  );
}

const SQUARE: Record<CellView["state"], TestSquareState> = { solved: "pass", attempted: "fail", untouched: "pending" };

const TIME_NOTE = "Time includes 5 min per wrong attempt before a solve.";

export function Scoreboard({ snapshot, viewerId, final = false, caption = "Scoreboard", className }: ScoreboardProps) {
  const rows = scoreboardRows(snapshot, viewerId);
  const positions = snapshot.problems.map((p) => p.position);
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Nobody has joined yet.</p>;
  }
  return (
    <div className={className} data-testid="scoreboard">
      {/* md+: table */}
      <div className="hidden overflow-x-auto rounded-xl border bg-card shadow-sm md:block">
        <table className="w-full border-collapse text-[0.9375rem]">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="label-mono border-b text-left text-muted-foreground">
              <th scope="col" className="h-11 w-14 px-4 text-right">
                #
              </th>
              <th scope="col" className="h-11 px-3">
                Participant
              </th>
              <th scope="col" className="h-11 px-3 text-right">
                Solved
              </th>
              <th scope="col" className="h-11 px-3 text-right">
                Time
              </th>
              {positions.map((pos) => (
                <th key={pos} scope="col" className="h-11 min-w-24 px-3">
                  <span aria-hidden>{pos}</span>
                  <span className="sr-only">{problemLabel(pos)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.userId}
                data-testid={`score-row-${row.username}`}
                className={cn(
                  "border-b transition-colors duration-(--d-1) last:border-b-0",
                  row.isViewer ? "bg-primary-soft/60" : "hover:bg-surface-sunken",
                )}
              >
                <td className="h-14 px-4 text-right">
                  <Rank rank={row.rank} />
                </td>
                <th scope="row" className="h-14 px-3 text-left font-normal whitespace-nowrap">
                  <Name row={row} />
                </th>
                <td className="h-14 px-3 text-right text-xl font-semibold tabular-nums">{row.solved}</td>
                <td className="h-14 px-3 text-right font-mono text-[0.8125rem] text-foreground-secondary tabular-nums">
                  {row.time}
                </td>
                {row.cells.map((cell) => (
                  <td key={cell.position} className="h-14 px-3">
                    <ScoreCell cell={cell} final={final} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* < md: one card per participant */}
      <ol className="flex flex-col gap-2 md:hidden" aria-label={caption}>
        {rows.map((row) => (
          <li
            key={row.userId}
            data-testid={`score-card-${row.username}`}
            className={cn("rounded-xl border p-4 shadow-sm", row.isViewer ? "bg-primary-soft/60" : "bg-card")}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="w-6 shrink-0 text-right">
                  <span className="sr-only">Rank </span>
                  <Rank rank={row.rank} />
                </span>
                <Name row={row} />
              </div>
              <span className="shrink-0 pt-1 text-sm tabular-nums">
                <span className="font-semibold">{row.solved}</span>
                <span className="text-muted-foreground"> solved · </span>
                <span className="font-mono text-[0.8125rem]">{row.time}</span>
              </span>
            </div>
            <TestSquares results={row.cells.map((c) => SQUARE[c.state])} className="mt-2.5 ml-9" />
            <ul className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 pl-9 text-sm">
              {row.cells.map((cell) => (
                <li key={cell.position} className="flex items-center gap-2">
                  <span aria-hidden className="w-4 text-right font-mono text-xs text-muted-foreground tabular-nums">
                    {cell.position}
                  </span>
                  <ScoreCell cell={cell} final={final} />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-xs text-muted-foreground">{TIME_NOTE}</p>
    </div>
  );
}
