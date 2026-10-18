// Attendance strip of the room page (docs/specs/rooms-v2.md §2.4, §12, §13):
// the last 8 finished sessions per member as squares (filled = played,
// hollow = missed, a dash before they joined), "7 of last 8 · streak 5" /
// "2 of 2 since joining", and the member's room rating (D3: every member
// sees every rating of the room; hidden while a member has none yet).
import { cn } from "cn";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ATTENDANCE_WINDOW, memberAttendance, type AttendanceMark, type AttendanceSession } from "@/lib/rooms/attendance";
import { memberRatingLabel } from "@/lib/rooms/lobby-rating";
import type { RoomMemberItem } from "@/server/rooms/queries";

const MARK_CLASS: Record<AttendanceMark, string> = {
  played: "size-3 rounded-[3px] bg-primary",
  missed: "size-3 rounded-[3px] border border-border-strong",
  before: "h-px w-3 bg-border-strong",
};

export function AttendanceCard({
  members,
  sessions,
  viewerId,
}: {
  members: RoomMemberItem[];
  sessions: AttendanceSession[];
  viewerId: string;
}) {
  return (
    <section
      aria-labelledby="attendance-title"
      className="flex h-full flex-col gap-3 rounded-xl border bg-card px-6 py-5 shadow-sm"
      data-testid="attendance-card"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="attendance-title" className="text-lg/7 font-semibold">
          Attendance
        </h2>
        <span className="label-mono text-muted-foreground">Last {ATTENDANCE_WINDOW} sessions</span>
      </div>
      {sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No finished sessions yet. Attendance shows up after the first one.</p>
      ) : null}
      <ul className="flex flex-col divide-y">
        {members.map((m) => {
          const a = memberAttendance(m.userId, m.joinedAt, sessions);
          const rating = memberRatingLabel(m.rating);
          return (
            <li key={m.userId} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
              <span className="flex min-w-0 flex-1 basis-32 items-center gap-2.5">
                <Avatar name={m.username} />
                <span className="truncate font-semibold">{m.username}</span>
                {m.userId === viewerId && (
                  <Badge variant="outline" className="h-5 px-1.5 text-[0.6875rem]">
                    you
                  </Badge>
                )}
              </span>
              {sessions.length > 0 && (
                <span className="order-last flex w-full items-center gap-2.5 sm:order-none sm:w-auto">
                  <span role="img" aria-label={a.ariaLabel} className="flex items-center gap-1 sm:w-[7.75rem] sm:justify-end">
                    {a.marks.map((mark, i) => (
                      <span key={i} aria-hidden className={cn("inline-block shrink-0", MARK_CLASS[mark])} />
                    ))}
                  </span>
                  <span aria-hidden className="text-sm text-foreground-secondary sm:w-36">
                    {a.label}
                  </span>
                </span>
              )}
              {rating && (
                <span
                  className="ml-auto inline-flex h-6 items-center rounded-sm border bg-surface-sunken px-1.5 font-mono text-xs tabular-nums text-foreground-secondary"
                  title={m.rating.provisional ? "Provisional: moves faster for the first two sessions." : "Rating in this room"}
                >
                  <span className="sr-only">Rating </span>
                  {rating}
                  {m.rating.provisional && <span className="sr-only"> (provisional)</span>}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
