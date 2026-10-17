// Scoreboard (docs/specs/rooms.md §4.1–§4.3, §7.4 accessibility): a real
// table from md up (caption, participant row headers, sr-only text per cell),
// a card list below md. Shows only "solved", times and attempt counts:
// never code, verdict types or test data. A changed cell fades in (260 ms,
// motion-safe only) because its key changes with its content.
import { CircleCheckIcon, CircleDashedIcon, HistoryIcon, MedalIcon } from "lucide-react";
import { cn } from "cn";

import { Badge } from "@/components/ui/badge";
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
        <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-foreground-secondary" aria-hidden>
          <MedalIcon className="size-3.5 text-info" />
          First
        </span>
      )}
      {final && cell.solvedBefore && (
        <span className="inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground" aria-hidden>
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
    <span key={key} data-cell-state={cell.state} className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 motion-safe:animate-enter-fade">
      <span className="sr-only">{cell.srText}</span>
      {cell.state === "solved" && (
        <span aria-hidden className="inline-flex items-center gap-1 font-medium text-success">
          <CircleCheckIcon className="size-4" />
          <span className="tabular-nums text-foreground">{cell.time}</span>
          {cell.wrong && <span className="tabular-nums text-xs text-muted-foreground">{cell.wrong}</span>}
        </span>
      )}
      {cell.state === "attempted" && (
        <span aria-hidden className="inline-flex items-center gap-1 text-warning">
          <CircleDashedIcon className="size-4" />
          <span className="tabular-nums text-sm text-foreground-secondary">{cell.wrong}</span>
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

function Name({ row }: { row: ScoreRow }) {
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5">
      <span className="truncate font-medium text-foreground">{row.username}</span>
      {row.isViewer && <span className="text-sm text-muted-foreground">(you)</span>}
      {row.isHost && (
        <Badge variant="outline" className="h-5 px-1.5 text-[0.7rem]">
          Host
        </Badge>
      )}
    </span>
  );
}

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
      <div className="hidden overflow-x-auto rounded-lg border bg-card shadow-xs md:block">
        <table className="w-full border-collapse text-[0.9375rem]">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b bg-surface-sunken text-left text-[0.78rem] font-semibold tracking-[0.04em] text-muted-foreground uppercase">
              <th scope="col" className="h-10 w-12 px-3 text-right">
                #
              </th>
              <th scope="col" className="h-10 px-3">
                Participant
              </th>
              <th scope="col" className="h-10 px-3 text-right">
                Solved
              </th>
              <th scope="col" className="h-10 px-3 text-right">
                Time
              </th>
              {positions.map((pos) => (
                <th key={pos} scope="col" className="h-10 w-32 min-w-28 px-3">
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
                className={cn("border-b last:border-b-0", row.isViewer ? "bg-secondary" : "even:bg-surface-sunken")}
              >
                <td className="h-12 px-3 text-right text-muted-foreground tabular-nums">{row.rank ?? "—"}</td>
                <th scope="row" className="h-12 max-w-56 px-3 text-left font-normal">
                  <Name row={row} />
                </th>
                <td className="h-12 px-3 text-right font-semibold tabular-nums">{row.solved}</td>
                <td className="h-12 px-3 text-right tabular-nums">{row.time}</td>
                {row.cells.map((cell) => (
                  <td key={cell.position} className="h-12 px-3">
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
            className={cn("rounded-lg border p-3 shadow-xs", row.isViewer ? "bg-secondary" : "bg-card")}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-baseline gap-2">
                <span className="w-6 shrink-0 text-right text-muted-foreground tabular-nums">
                  <span className="sr-only">Rank </span>
                  {row.rank ?? "—"}
                </span>
                <Name row={row} />
              </div>
              <span className="shrink-0 text-sm tabular-nums">
                <span className="font-semibold">{row.solved}</span>
                <span className="text-muted-foreground"> solved · </span>
                {row.time}
              </span>
            </div>
            <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 pl-8 text-sm">
              {row.cells.map((cell) => (
                <li key={cell.position} className="flex items-center gap-2">
                  <span aria-hidden className="w-4 text-right text-muted-foreground tabular-nums">
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
