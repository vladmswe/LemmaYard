import { ArrowRightIcon, HistoryIcon, SearchXIcon, TrophyIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "cn";

import { EmptyState } from "@/components/empty-state";
import { Pagination } from "@/components/pagination";
import { DIFFICULTIES } from "@/components/problems/difficulty";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, tableLinkClasses } from "@/components/ui/table";
import {
  formatMinutes,
  roomHistoryHref,
  sessionResultsHref,
  sessionScreenHref,
} from "@/lib/rooms/history";
import { mixLabel } from "@/lib/rooms/session-view";
import { mixOf } from "@/lib/rooms/types";
import type { HistorySessionItem, OpenSessionItem, RoomHistory } from "@/server/rooms/history";

import { LocalDate } from "./local-date";
import { LocalTime } from "./local-time";
import { SessionStatusBadge } from "./session-status-badge";

const DATE_OPTIONS: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric", year: "numeric" };

/** Sessions tab (spec §5.2): open session pinned, then the finished/cancelled list. */
export function RoomHistoryPanel({ roomId, history }: { roomId: string; history: RoomHistory }) {
  const { open, sessions, total, page, pageSize } = history;
  return (
    <section aria-labelledby="history-heading" className="flex flex-col gap-5" data-testid="room-history">
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
        <div className="rounded-lg border bg-card shadow-xs">
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
              Finished sessions are listed here with their problems, who took part and who won.
            </EmptyState>
          )}
        </div>
      ) : (
        <div>
          <HistoryTable roomId={roomId} sessions={sessions} />
          <HistoryCards roomId={roomId} sessions={sessions} />
          <Pagination
            className="mt-5"
            page={page}
            pageSize={pageSize}
            totalItems={total}
            hrefFor={(p) => roomHistoryHref(roomId, p)}
          />
        </div>
      )}
    </section>
  );
}

function OpenSessionRow({ roomId, session }: { roomId: string; session: OpenSessionItem }) {
  const live = session.status === "live";
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 shadow-xs">
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

function ProblemTitles({ session }: { session: HistorySessionItem }) {
  if (session.problems.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="flex flex-col gap-0.5">
      <span className="line-clamp-2 text-sm">
        {session.problems.map((p, i) => (
          <span key={p.position}>
            {i > 0 && <span aria-hidden className="text-muted-foreground"> · </span>}
            <span className={cn("font-medium", DIFFICULTIES[p.difficulty].text)}>{p.title}</span>
            <span className="sr-only"> ({DIFFICULTIES[p.difficulty].label})</span>
          </span>
        ))}
      </span>
      <span aria-hidden className="text-xs text-muted-foreground">
        {mixLabel(mixOf(session.problems))}
      </span>
    </span>
  );
}

function DateCell({ roomId, session }: { roomId: string; session: HistorySessionItem }) {
  const date = <LocalDate iso={session.date} options={DATE_OPTIONS} />;
  if (session.status === "cancelled") return <span className="text-muted-foreground">{date}</span>;
  return (
    <Link href={sessionResultsHref(roomId, session.id)} className={tableLinkClasses()}>
      {date}
      <span className="sr-only"> results</span>
    </Link>
  );
}

function durationText(s: HistorySessionItem): string {
  if (s.status === "cancelled") return "—";
  if (s.endReason === "host" && s.runMinutes < s.durationMin) {
    return `${formatMinutes(s.runMinutes)} of ${s.durationMin}`;
  }
  return formatMinutes(s.durationMin);
}

function Winners({ session }: { session: HistorySessionItem }) {
  if (session.status === "cancelled" || session.winners.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <TrophyIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <span className="truncate">{session.winners.join(", ")}</span>
      {session.winners.length > 1 && <span className="sr-only"> (tie)</span>}
    </span>
  );
}

function YouCell({ session }: { session: HistorySessionItem }) {
  if (session.status === "cancelled") return <span className="text-muted-foreground">—</span>;
  if (!session.viewer) return <span className="text-muted-foreground">Didn&apos;t join</span>;
  return (
    <span className="tabular-nums">
      {session.viewer.solved}/{session.problemCount}
      {session.viewer.rank !== null && <span className="text-muted-foreground">, rank {session.viewer.rank}</span>}
    </span>
  );
}

function HistoryTable({ roomId, sessions }: { roomId: string; sessions: HistorySessionItem[] }) {
  return (
    <Table containerClassName="hidden md:block" data-testid="history-table">
      <caption className="sr-only">Past sessions, newest first</caption>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Problems</TableHead>
          <TableHead numeric>Duration</TableHead>
          <TableHead numeric>People</TableHead>
          <TableHead>Winner</TableHead>
          <TableHead numeric>You</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sessions.map((s) => {
          const cancelled = s.status === "cancelled";
          return (
            <TableRow key={s.id} data-status={s.status} className={cn(cancelled && "text-muted-foreground")}>
              <TableCell className="py-2.5 whitespace-nowrap">
                <span className="flex flex-col items-start gap-1">
                  <DateCell roomId={roomId} session={s} />
                  {cancelled && <SessionStatusBadge status="cancelled" />}
                </span>
              </TableCell>
              <TableCell className="max-w-[26rem] py-2.5">
                {cancelled ? <span className="text-sm">Cancelled before it started</span> : <ProblemTitles session={s} />}
              </TableCell>
              <TableCell numeric className="whitespace-nowrap">
                {durationText(s)}
              </TableCell>
              <TableCell numeric>{cancelled ? "—" : s.participants}</TableCell>
              <TableCell className="max-w-40">
                <Winners session={s} />
              </TableCell>
              <TableCell numeric className="whitespace-nowrap">
                <YouCell session={s} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/** Below md: one card per session (DESIGN.md §6.4 table ↔ card list). */
function HistoryCards({ roomId, sessions }: { roomId: string; sessions: HistorySessionItem[] }) {
  return (
    <ul aria-label="Past sessions, newest first" className="flex flex-col gap-3 md:hidden" data-testid="history-cards">
      {sessions.map((s) => {
        const cancelled = s.status === "cancelled";
        return (
          <li
            key={s.id}
            data-status={s.status}
            className={cn("flex flex-col gap-2 rounded-lg border bg-card p-4 shadow-xs", cancelled && "text-muted-foreground")}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold">
                <DateCell roomId={roomId} session={s} />
              </span>
              {cancelled && <SessionStatusBadge status="cancelled" />}
            </div>
            {cancelled ? (
              <p className="text-sm">Cancelled before it started</p>
            ) : (
              <>
                <ProblemTitles session={s} />
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <dt className="text-muted-foreground">Winner</dt>
                  <dd className="min-w-0 text-right">
                    <Winners session={s} />
                  </dd>
                  <dt className="text-muted-foreground">You</dt>
                  <dd className="text-right">
                    <YouCell session={s} />
                  </dd>
                  <dt className="text-muted-foreground">People · duration</dt>
                  <dd className="text-right tabular-nums">
                    {s.participants} · {durationText(s)}
                  </dd>
                </dl>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
