import { ArrowRightIcon, HistoryIcon, SearchXIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "cn";

import { EmptyState } from "@/components/empty-state";
import { Pagination } from "@/components/pagination";
import { DifficultyGlyph } from "@/components/problems/difficulty-badge";
import { DIFFICULTIES } from "@/components/problems/difficulty";
import { Avatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { formatMinutes, roomHistoryHref, sessionResultsHref, sessionScreenHref } from "@/lib/rooms/history";
import { SELF_REPORTED_NOTE, SELF_REPORTED_TOOLTIP } from "@/lib/rooms/external";
import {
  formatMinuteMark,
  hasExternalProblems,
  matrixRows,
  problemLabel,
  selfReportedPositions,
  type CellView,
} from "@/lib/rooms/live-view";
import type { HistorySessionItem, OpenSessionItem, RoomHistory } from "@/server/rooms/history";

import { LocalDate } from "./local-date";
import { LocalTime } from "./local-time";
import { SessionStatusBadge } from "./session-status-badge";

const DATE_OPTIONS: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" };

/** Sessions tab (rooms-v2 §2.4): open session pinned, then one card per past session with its mini-matrix. */
export function RoomHistoryPanel({
  roomId,
  history,
  viewerId,
}: {
  roomId: string;
  history: RoomHistory;
  viewerId?: string;
}) {
  const { open, sessions, total, page, pageSize } = history;
  return (
    <section aria-labelledby="history-heading" className="flex flex-col gap-4" data-testid="room-history">
      <h2 id="history-heading" className="sr-only">
        Session history
      </h2>
      {open.length > 0 && (
        <ul aria-label="Open session" className="flex flex-col gap-3">
          {open.map((s) => (
            <OpenSessionRow key={s.id} roomId={roomId} session={s} />
          ))}
        </ul>
      )}
      {sessions.length === 0 ? (
        <div className="rounded-xl border bg-card shadow-sm">
          {total > 0 ? (
            <EmptyState
              icon={SearchXIcon}
              title="This page is empty"
              action={
                <Link href={roomHistoryHref(roomId, 1)} className={buttonVariants({ variant: "secondary" })}>
                  Go to the first page
                </Link>
              }
            >
              {`This room has ${total === 1 ? "1 past session" : `${total} past sessions`}.`}
            </EmptyState>
          ) : (
            <EmptyState icon={HistoryIcon} title="No sessions yet">
              Finished sessions are listed here with who solved which problem, and when.
            </EmptyState>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          <ol aria-label="Past sessions, newest first" className="flex flex-col gap-3.5" data-testid="history-cards">
            {sessions.map((s) => (
              <SessionCard key={s.id} roomId={roomId} session={s} viewerId={viewerId ?? null} />
            ))}
          </ol>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Times are from each session&apos;s start. ★ = first to solve.</p>
            <Pagination page={page} pageSize={pageSize} totalItems={total} hrefFor={(p) => roomHistoryHref(roomId, p)} />
          </div>
        </div>
      )}
    </section>
  );
}

function OpenSessionRow({ roomId, session }: { roomId: string; session: OpenSessionItem }) {
  const live = session.status === "live";
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <SessionStatusBadge status={session.status} />
        <span className="text-sm text-foreground-secondary">
          {session.problemCount} problems · {formatMinutes(session.durationMin)} · {session.joined} joined
          {live && session.endsAt && (
            <>
              {" "}
              · ends <LocalTime iso={session.endsAt} />
            </>
          )}
          {!live && session.plannedFor && (
            <>
              {" "}
              · planned for <LocalTime iso={session.plannedFor} withDate />
            </>
          )}
        </span>
      </div>
      <Link
        href={sessionScreenHref(roomId, session.id)}
        className={buttonVariants({ variant: live ? "default" : "secondary", size: "sm" })}
      >
        {live ? "Open session" : "Open lobby"}
        <ArrowRightIcon aria-hidden />
      </Link>
    </li>
  );
}

function durationText(s: HistorySessionItem): string {
  if (s.endReason === "host" && s.runMinutes < s.durationMin) {
    return `${formatMinutes(s.runMinutes)} of ${s.durationMin}`;
  }
  return formatMinutes(s.durationMin);
}

function sessionMeta(s: HistorySessionItem): string {
  const problems = `${s.problemCount} ${s.problemCount === 1 ? "problem" : "problems"}`;
  const people = `${s.participants} ${s.participants === 1 ? "person" : "people"}`;
  return `${problems} · ${durationText(s)} · ${people}`;
}

function SessionCard({ roomId, session: s, viewerId }: { roomId: string; session: HistorySessionItem; viewerId: string | null }) {
  const cancelled = s.status === "cancelled";
  const date = <LocalDate iso={s.date} options={DATE_OPTIONS} />;
  return (
    <li
      data-status={s.status}
      data-session={s.id}
      className={cn("rounded-xl border bg-card px-4 py-4 shadow-sm sm:px-5", cancelled && "text-muted-foreground")}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="min-w-0 text-[0.9375rem]">
          <span className="font-semibold text-foreground">{date}</span>
          <span className="text-muted-foreground"> · {cancelled ? "Cancelled before it started" : sessionMeta(s)}</span>
        </h3>
        {cancelled ? (
          <SessionStatusBadge status="cancelled" />
        ) : (
          <Link
            href={sessionResultsHref(roomId, s.id)}
            className="relative text-sm font-semibold text-link after:absolute after:-inset-2 hover:underline"
          >
            Results<span className="sr-only"> of this session</span>
            <ArrowRightIcon aria-hidden className="ml-1 inline size-3.5" />
          </Link>
        )}
      </div>
      {!cancelled && s.standings.length > 0 && <MiniMatrix session={s} viewerId={viewerId} />}
      {!cancelled && hasExternalProblems(s.problems) && (
        <p className="mt-2 text-[0.8125rem] text-muted-foreground" data-testid="history-self-reported">
          {SELF_REPORTED_NOTE} (marked SELF).
        </p>
      )}
    </li>
  );
}

/** Person × problem: `✓ 24:30 ★`, `✗ 2`, `—`; minutes (`25′`) below sm. A real table for screen readers. */
function MiniMatrix({ session: s, viewerId }: { session: HistorySessionItem; viewerId: string | null }) {
  const positions = s.problems.map((p) => p.position);
  const rows = matrixRows(
    s.standings.map((p) => ({ ...p, isHost: false })),
    positions,
    { viewerId, durationSec: s.durationMin * 60, selfReported: selfReportedPositions(s.problems) },
  );
  return (
    <div className="relative mt-3 overflow-x-auto" data-testid="mini-matrix">
      <table className="w-full table-fixed border-separate border-spacing-1 text-[0.8125rem]">
        <caption className="sr-only">Who solved which problem, and when</caption>
        <colgroup>
          <col className="w-[5.5rem] sm:w-[7.5rem]" />
          {positions.map((p) => (
            <col key={p} className={cn(positions.length <= 4 && "lg:w-[12.5rem]")} />
          ))}
          {positions.length <= 4 && <col className="hidden lg:table-column" />}
          <col className="w-9 sm:w-[4.5rem]" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">Participant</span>
            </th>
            {s.problems.map((p) => (
              <th
                key={p.position}
                scope="col"
                className="truncate px-1 text-left font-mono text-[0.6875rem] font-medium text-muted-foreground"
                title={p.title}
              >
                {p.difficulty && (
                  <DifficultyGlyph difficulty={p.difficulty} className={cn("mr-1", DIFFICULTIES[p.difficulty].text)} />
                )}
                <span aria-hidden>{p.position}</span>
                <span className="hidden sm:inline" aria-hidden>
                  {" "}
                  · {p.external ? "LeetCode · " : ""}
                  {p.title}
                </span>
                <span className="sr-only">
                  {problemLabel(p.position)}: {p.title} (
                  {[p.external ? "LeetCode, self-reported" : null, p.difficulty ? DIFFICULTIES[p.difficulty].label : null]
                    .filter(Boolean)
                    .join(", ")}
                  )
                </span>
              </th>
            ))}
            {positions.length <= 4 && <td aria-hidden className="hidden lg:table-cell" />}
            <th scope="col" className="px-1 text-right font-mono text-[0.6875rem] font-medium text-muted-foreground">
              solved
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.userId} data-user={r.username}>
              <th scope="row" className="truncate text-left font-semibold">
                <span className="flex min-w-0 items-center gap-2">
                  <Avatar name={r.username} className="hidden size-6 rounded-[7px] text-[10px] sm:inline-grid" />
                  <span className="truncate">{r.username}</span>
                  {r.isViewer && <span className="sr-only"> (you)</span>}
                </span>
              </th>
              {r.cells.map((c) => (
                <td key={c.position} className="p-0">
                  <MiniCell cell={c} />
                </td>
              ))}
              {positions.length <= 4 && <td aria-hidden className="hidden lg:table-cell" />}
              <td className="px-1 text-right font-mono font-semibold whitespace-nowrap tabular-nums">
                {r.solved}
                <span className="hidden font-normal text-muted-foreground sm:inline">
                  {" "}
                  · #{r.rank ?? "—"}
                </span>
                <span className="sr-only">
                  {" "}
                  solved{r.rank !== null ? `, rank ${r.rank}` : ""}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MiniCell({ cell }: { cell: CellView }) {
  const box = "flex h-[1.875rem] min-w-0 items-center gap-1 overflow-hidden rounded-[7px] px-1.5 font-mono text-[0.71875rem] font-medium whitespace-nowrap sm:px-2 sm:text-[0.78125rem]";
  const sr = <span className="sr-only">{cell.srText}</span>;
  if (cell.state === "solved") {
    return (
      <span
        className={cn(box, "bg-success-bg text-foreground", cell.selfReported && "border border-dashed border-success/70")}
        data-cell-state="solved"
        data-self-reported={cell.selfReported || undefined}
        title={cell.selfReported ? SELF_REPORTED_TOOLTIP : undefined}
      >
        {sr}
        <span aria-hidden className="hidden text-success sm:inline">
          ✓
        </span>
        <span aria-hidden className="hidden sm:inline">
          {cell.time}
        </span>
        <span aria-hidden className="sm:hidden">
          {formatMinuteMark(cell.solveSeconds ?? 0)}
        </span>
        {cell.firstSolver && (
          <span aria-hidden className="text-primary">
            ★
          </span>
        )}
        {cell.selfReported && (
          <span aria-hidden className="text-[0.625rem] font-semibold text-foreground-secondary">
            SELF
          </span>
        )}
      </span>
    );
  }
  if (cell.state === "attempted") {
    return (
      <span className={cn(box, "text-danger ring-1 ring-border-strong ring-inset")} data-cell-state="attempted">
        {sr}
        <span aria-hidden>✗ {cell.attempts}</span>
      </span>
    );
  }
  return (
    <span className={cn(box, "text-faint")} data-cell-state="untouched">
      {sr}
      <span aria-hidden>—</span>
    </span>
  );
}
