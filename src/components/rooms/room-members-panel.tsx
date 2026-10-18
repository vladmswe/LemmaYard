import { ArrowRightIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "cn";

import { EmptyState } from "@/components/empty-state";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  attendanceText,
  LEADERBOARD_RANGE_LABELS,
  memberTimelineHref,
  type Attendance,
} from "@/lib/rooms/history";
import type { MemberStatsRow, RoomMemberStats } from "@/server/rooms/history";

import { LeaderboardRangeSelect } from "./leaderboard-range-select";

/** Rating slot (rooms-v2 §2.4, filled by the rating module): absent → no Rating column at all. */
export type MemberRating = { rating: number; delta?: number | null; provisional?: boolean };

/** Squares of the last 8 sessions: filled = played, hollow = missed, a dash before they joined. */
export function AttendanceSquares({ value }: { value: Attendance }) {
  return (
    <span className="inline-flex items-center gap-1" role="img" aria-label={attendanceText(value)} data-testid="attendance">
      {value.marks.map((m, i) => (
        <i
          key={i}
          className={cn(
            "inline-block size-3 rounded-[3px]",
            m === "played" && "bg-primary",
            m === "missed" && "ring-[1.5px] ring-border-strong ring-inset",
            m === "before" && "h-0 border-b-[1.5px] border-border",
          )}
        />
      ))}
    </span>
  );
}

function RatingValue({ rating }: { rating: MemberRating | undefined }) {
  if (!rating) return <span className="text-muted-foreground">—</span>;
  const d = rating.delta ?? null;
  return (
    <span className="whitespace-nowrap">
      <span className="font-mono">{rating.rating}</span>
      {rating.provisional && (
        <span className="text-warning" title="Provisional: moves faster for the first two sessions">
          ?<span className="sr-only"> (provisional)</span>
        </span>
      )}
      {d !== null && d !== 0 && (
        <span className={cn("ml-1.5 text-[0.78125rem]", d > 0 ? "text-success" : "text-danger")}>
          {d > 0 ? "+" : "−"}
          {Math.abs(d)}
        </span>
      )}
    </span>
  );
}

function MemberName({ row, viewerId }: { row: MemberStatsRow; viewerId: string }) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <Avatar name={row.username} className={cn(!row.isMember && "opacity-60")} />
      <span className={cn("font-semibold", !row.isMember && "text-muted-foreground")}>{row.username}</span>
      {row.role === "owner" && <Badge variant="outline">Owner</Badge>}
      {row.userId === viewerId && <span className="text-sm text-muted-foreground">(you)</span>}
      {!row.isMember && <span className="text-sm text-muted-foreground">(left)</span>}
    </span>
  );
}

function HistoryLink({ roomId, row }: { roomId: string; row: MemberStatsRow }) {
  return (
    <Link
      href={memberTimelineHref(roomId, row.username)}
      className="relative inline-flex items-center gap-1 text-sm font-semibold whitespace-nowrap text-link after:absolute after:-inset-2 hover:underline"
    >
      History<span className="sr-only"> of {row.username}</span>
      <ArrowRightIcon aria-hidden className="size-3.5" />
    </Link>
  );
}

/**
 * Members tab (rooms-v2 §2.4): who plays, how often and how well. Ranked by
 * wins, then solved, then first solves (the v1 "difficulty profile" is gone:
 * those numbers stay in the lobby).
 */
export function RoomMembersPanel({
  roomId,
  viewerId,
  stats,
  ratings,
}: {
  roomId: string;
  viewerId: string;
  stats: RoomMemberStats;
  ratings?: ReadonlyMap<string, MemberRating>;
}) {
  const { rows, range, sessions } = stats;
  const showRating = ratings !== undefined && ratings.size > 0;
  const period = LEADERBOARD_RANGE_LABELS[range];
  return (
    <section aria-labelledby="members-heading" className="flex flex-col gap-4" data-testid="room-members">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="members-heading" className="text-lg/7 font-semibold">
            Members
          </h2>
          <p className="text-sm text-muted-foreground">
            {period} · {sessions === 1 ? "1 finished session" : `${sessions} finished sessions`}
          </p>
        </div>
        <LeaderboardRangeSelect roomId={roomId} range={range} />
      </div>
      {rows.length === 0 ? (
        <div className="rounded-xl border bg-card shadow-sm">
          <EmptyState icon={UsersIcon} title="No members yet" />
        </div>
      ) : (
        <>
          <Table containerClassName="hidden md:block" data-testid="members-table">
            <caption className="sr-only">
              Members: attendance over the last 8 sessions; solved, first solves and wins over {period.toLowerCase()}
            </caption>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                {showRating && <TableHead numeric>Rating</TableHead>}
                <TableHead>Attended · last 8</TableHead>
                <TableHead numeric>Solved · {period.replace(/^Last /, "").toLowerCase()}</TableHead>
                <TableHead numeric>First solves</TableHead>
                <TableHead numeric>Wins</TableHead>
                <TableHead>
                  <span className="sr-only">History</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.userId} data-user={r.username} className={cn(r.userId === viewerId && "bg-secondary!")}>
                  <th scope="row" className="h-14 px-4 text-left align-middle font-normal">
                    <MemberName row={r} viewerId={viewerId} />
                  </th>
                  {showRating && (
                    <TableCell numeric>
                      <RatingValue rating={ratings!.get(r.userId)} />
                    </TableCell>
                  )}
                  <TableCell>
                    {r.attendance ? (
                      <span className="inline-flex items-center gap-2.5">
                        <AttendanceSquares value={r.attendance} />
                        <span aria-hidden className="text-[0.8125rem] text-muted-foreground tabular-nums">
                          {r.attendance.played}/{r.attendance.of}
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell numeric className="font-mono">
                    {r.solved}
                  </TableCell>
                  <TableCell numeric className="font-mono">
                    {r.firstSolves}
                  </TableCell>
                  <TableCell numeric className="font-mono">
                    {r.wins}
                  </TableCell>
                  <TableCell className="text-right">
                    <HistoryLink roomId={roomId} row={r} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <ul aria-label="Members" className="flex flex-col gap-3 md:hidden" data-testid="members-cards">
            {rows.map((r) => (
              <li key={r.userId} data-user={r.username} className={cn("rounded-xl border p-4 shadow-sm", r.userId === viewerId ? "bg-secondary" : "bg-card")}>
                <div className="flex items-start justify-between gap-3">
                  <MemberName row={r} viewerId={viewerId} />
                  <HistoryLink roomId={roomId} row={r} />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  {showRating && (
                    <>
                      <dt className="text-muted-foreground">Rating</dt>
                      <dd className="text-right">
                        <RatingValue rating={ratings!.get(r.userId)} />
                      </dd>
                    </>
                  )}
                  <dt className="text-muted-foreground">Attended</dt>
                  <dd className="flex flex-col items-end gap-1 text-right">
                    {r.attendance ? (
                      <>
                        <AttendanceSquares value={r.attendance} />
                        <span aria-hidden className="text-xs text-muted-foreground">
                          {attendanceText(r.attendance)}
                        </span>
                      </>
                    ) : (
                      "—"
                    )}
                  </dd>
                  <dt className="text-muted-foreground">Solved · first · wins</dt>
                  <dd className="text-right font-mono tabular-nums">
                    {r.solved} · {r.firstSolves} · {r.wins}
                  </dd>
                </dl>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="text-sm text-muted-foreground">
        Ranked by wins (sessions finished in first place, ties included), then problems solved, then first solves.
        &ldquo;History&rdquo; lists, per session, which problems that person solved and when. People who left the room
        are shown in grey with &ldquo;(left)&rdquo;.
        {showRating && " Ratings are visible to members of this room only."}
      </p>
    </section>
  );
}
