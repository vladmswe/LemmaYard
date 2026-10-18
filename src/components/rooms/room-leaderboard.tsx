import { TrophyIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "cn";

import { EmptyState } from "@/components/empty-state";
import { DIFFICULTIES, DIFFICULTY_ORDER } from "@/components/problems/difficulty";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, tableLinkClasses } from "@/components/ui/table";
import { formatPercent, MISSING } from "@/lib/format";
import { LEADERBOARD_RANGE_LABELS, memberTimelineHref } from "@/lib/rooms/history";
import type { RoomLeaderboard } from "@/server/rooms/history";

import { LeaderboardRangeSelect } from "./leaderboard-range-select";

/** Leaderboard tab (spec §5.2): standings over a window, then the room's difficulty profile. */
export function RoomLeaderboardPanel({
  roomId,
  viewerId,
  leaderboard,
}: {
  roomId: string;
  viewerId: string;
  leaderboard: RoomLeaderboard;
}) {
  const { rows, range, sessions, calibration } = leaderboard;
  return (
    <div className="flex flex-col gap-6" data-testid="room-leaderboard">
      <section aria-labelledby="leaderboard-heading" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="leaderboard-heading" className="text-lg/7 font-semibold">
              Standings
            </h2>
            <p className="text-sm text-muted-foreground">
              {LEADERBOARD_RANGE_LABELS[range]} · {sessions === 1 ? "1 finished session" : `${sessions} finished sessions`}
            </p>
          </div>
          <LeaderboardRangeSelect roomId={roomId} range={range} />
        </div>
        {sessions === 0 ? (
          <div className="rounded-xl border bg-card shadow-sm">
            <EmptyState icon={TrophyIcon} title="No finished sessions in this period">
              {range === "all"
                ? "Once your room finishes a session, members are ranked here by problems solved."
                : "Choose a longer period, or finish a session to see the standings."}
            </EmptyState>
          </div>
        ) : (
          <Table data-testid="leaderboard-table">
            <caption className="sr-only">
              Leaderboard, {LEADERBOARD_RANGE_LABELS[range].toLowerCase()}, sorted by problems solved, then solve rate
            </caption>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14">#</TableHead>
                <TableHead>Member</TableHead>
                <TableHead numeric>Sessions</TableHead>
                <TableHead numeric>Solved</TableHead>
                <TableHead numeric>Solve rate</TableHead>
                <TableHead numeric>Wins</TableHead>
                <TableHead numeric>Avg rank</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow
                  key={r.userId}
                  data-user={r.username}
                  className={cn(r.userId === viewerId && "bg-secondary!", !r.isMember && "text-muted-foreground")}
                >
                  <TableCell className="text-muted-foreground tabular-nums">{r.rank ?? MISSING}</TableCell>
                  <th scope="row" className="h-12 px-4 text-left align-middle font-normal">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <Avatar name={r.username} className={cn(!r.isMember && "opacity-60")} />
                      <Link
                        href={memberTimelineHref(roomId, r.username)}
                        className={cn(tableLinkClasses(), !r.isMember && "text-muted-foreground")}
                      >
                        {r.username}
                      </Link>
                      {r.userId === viewerId && <span className="text-sm text-muted-foreground">(you)</span>}
                      {!r.isMember && <span className="text-sm">(left)</span>}
                    </span>
                  </th>
                  <TableCell numeric>{r.sessions}</TableCell>
                  <TableCell numeric className="font-semibold">
                    {r.solved}
                    {r.sessions > 0 && <span className="font-normal text-muted-foreground"> / {r.offered}</span>}
                  </TableCell>
                  <TableCell numeric>{formatPercent(r.solveRate, 0)}</TableCell>
                  <TableCell numeric>{r.sessions > 0 ? r.wins : MISSING}</TableCell>
                  <TableCell numeric>{r.avgRank === null ? MISSING : r.avgRank.toFixed(1)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <p className="text-sm text-muted-foreground">
          Counts finished sessions only. Solve rate = problems solved / problems in the sessions they played; wins =
          sessions finished in first place (ties included). People who left the room are shown in grey with
          &ldquo;(left)&rdquo;.
        </p>
      </section>

      <Card>
        <CardHeader>
          <h2 className="text-lg/7 font-semibold">Room difficulty profile, last 6 sessions</h2>
          <CardDescription>
            {calibration.sessions === 0
              ? "No finished sessions yet, so the lobby starts with a standard mix. It adapts after your first session."
              : `The lobby suggests its difficulty mix from these numbers: every person who submitted × every problem of the last ${
                  calibration.sessions === 1 ? "session" : `${calibration.sessions} sessions`
                }.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-1" data-testid="difficulty-profile">
            {DIFFICULTY_ORDER.map((d, i) => {
              const { solved, pairs } = calibration.counts[d];
              return (
                <div
                  key={d}
                  data-difficulty={d}
                  className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1 py-2 text-[0.9375rem] sm:grid-cols-[4.5rem_minmax(0,1fr)_9rem_8rem]"
                >
                  <dt className={cn("font-semibold", DIFFICULTIES[d].text)}>{DIFFICULTIES[d].label}</dt>
                  <dd className="contents">
                    <Progress
                      value={solved}
                      max={Math.max(pairs, 1)}
                      label={`${DIFFICULTIES[d].label}: ${solved} of ${pairs} solved`}
                      indicatorClassName={DIFFICULTIES[d].fill}
                      delayMs={120 + i * 80}
                    />
                    <span className="col-start-2 text-sm text-muted-foreground tabular-nums sm:col-start-auto sm:text-right">
                      {solved} of {pairs} solved
                    </span>
                    <span className="col-start-2 text-sm text-muted-foreground tabular-nums sm:col-start-auto sm:text-right">
                      rate {formatPercent(calibration.rates[d], 0)}
                    </span>
                  </dd>
                </div>
              );
            })}
          </dl>
          <p className="mt-3 text-sm text-muted-foreground">
            The rate is smoothed toward a starting guess, so one hard evening does not swing the mix.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
