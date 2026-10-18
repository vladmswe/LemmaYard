// Attendance strip of the room page (docs/specs/rooms-v2.md §2.4, §12):
// the room's last 8 finished sessions as squares per member (played, missed,
// or "before they joined"), "7 of last 8 · streak 5" / "2 of 2 since
// joining". Pure; the server passes the sessions and who took part.
//
// Note: the Members tab (module V2-3) builds its own attendance column; this
// helper only serves the room page header strip of V2-2.

export const ATTENDANCE_WINDOW = 8;

export type AttendanceMark = "played" | "missed" | "before";

export type AttendanceSession = {
  id: string;
  startedAt: string;
  /** Users with a participant row in the session. */
  participantIds: readonly string[];
};

export type MemberAttendance = {
  /** Oldest first, one per session of the window. */
  marks: AttendanceMark[];
  played: number;
  /** Sessions held since the member joined (inside the window). */
  eligible: number;
  /** Consecutive played sessions up to the latest one. */
  streak: number;
  /** "7 of last 8 · streak 5", "2 of 2 since joining", "No sessions yet". */
  label: string;
  /** Screen-reader text of the squares. */
  ariaLabel: string;
};

/**
 * `sessions` in any order; the latest `ATTENDANCE_WINDOW` by start count.
 * A session counts as "before" when it started before the member joined
 * and they did not play it (someone may play and then rejoin later).
 */
export function memberAttendance(
  userId: string,
  joinedAt: string,
  sessions: readonly AttendanceSession[],
): MemberAttendance {
  const window = [...sessions]
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
    .slice(0, ATTENDANCE_WINDOW)
    .reverse();
  const joined = Date.parse(joinedAt);
  const marks: AttendanceMark[] = window.map((s) => {
    if (s.participantIds.includes(userId)) return "played";
    return Date.parse(s.startedAt) < joined ? "before" : "missed";
  });
  const played = marks.filter((m) => m === "played").length;
  const eligible = marks.filter((m) => m !== "before").length;
  let streak = 0;
  for (let i = marks.length - 1; i >= 0 && marks[i] === "played"; i--) streak++;

  let label: string;
  if (window.length === 0) label = "No sessions yet";
  else if (eligible === 0) label = "Joined after the last session";
  else if (eligible < window.length) label = `${played} of ${eligible} since joining`;
  else label = `${played} of last ${window.length}${streak > 0 ? ` · streak ${streak}` : ""}`;

  const ariaLabel =
    window.length === 0
      ? "No finished sessions yet"
      : eligible < window.length
        ? `Played ${played} of ${eligible} sessions since joining`
        : `Played ${played} of the last ${window.length} sessions`;
  return { marks, played, eligible, streak, label, ariaLabel };
}

/** "played 7 of last 8" for the rooms list "You" line (null without sessions). */
export function attendanceShort(a: Pick<MemberAttendance, "played" | "eligible" | "marks">): string | null {
  if (a.marks.length === 0 || a.eligible === 0) return null;
  return a.eligible < a.marks.length
    ? `played ${a.played} of ${a.eligible} since joining`
    : `played ${a.played} of last ${a.marks.length}`;
}
