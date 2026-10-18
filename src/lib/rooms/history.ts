// History and stats of a room (docs/specs/rooms.md §4.1, §4.5, §5): pure
// helpers behind the Sessions tab, the session results page, the Leaderboard
// tab and the member timeline. No DB or server imports (client-safe).
import { formatScoreTime, PENALTY_SEC_PER_WRONG } from "./scoring";
import { DIFFICULTIES, type Difficulty, type RoomSessionStatus } from "./types";

/** §5.2: 20 sessions per history page. */
export const HISTORY_PAGE_SIZE = 20;

/** Sessions shown on one member timeline (newest first). */
export const TIMELINE_SESSION_LIMIT = 100;

/** `?page=` → a positive integer; anything else (missing, "0", "2x", "-1") → 1. */
export function parsePageParam(value: unknown): number {
  const v = Array.isArray(value) ? value[0] : value;
  if (typeof v !== "string" || !/^\d{1,6}$/.test(v)) return 1;
  const n = Number(v);
  return n >= 1 ? n : 1;
}

/** Room page URL keeping the tab: the Sessions tab is the default (no `tab`). */
export function roomHistoryHref(roomId: string, page: number): string {
  return page > 1 ? `/rooms/${roomId}?page=${page}` : `/rooms/${roomId}`;
}

// --- Leaderboard windows (§5.2: "Last 4 weeks / Last 3 months / All time") ---

export const LEADERBOARD_RANGES = ["4w", "3m", "all"] as const;
export type LeaderboardRange = (typeof LEADERBOARD_RANGES)[number];
export const DEFAULT_LEADERBOARD_RANGE: LeaderboardRange = "3m";

export const LEADERBOARD_RANGE_LABELS: Record<LeaderboardRange, string> = {
  "4w": "Last 4 weeks",
  "3m": "Last 3 months",
  all: "All time",
};

export function parseLeaderboardRange(value: unknown): LeaderboardRange {
  const v = Array.isArray(value) ? value[0] : value;
  return LEADERBOARD_RANGES.includes(v as LeaderboardRange) ? (v as LeaderboardRange) : DEFAULT_LEADERBOARD_RANGE;
}

/** v2: the standings live in the Members tab (`?tab=leaderboard` redirects there). */
export function leaderboardHref(roomId: string, range: LeaderboardRange): string {
  return membersHref(roomId, range);
}

// --- Leaderboard aggregation (§5.2, query Q5) ---

/** One member's aggregate over the window's finished sessions (Q5 row). */
export type LeaderboardInput = {
  userId: string;
  username: string;
  /** Still a member of the room ("(left)" otherwise). */
  isMember: boolean;
  sessions: number;
  solved: number;
  /** Σ problem_count of the sessions they played. */
  offered: number;
  /** Sessions with rank 1 (ties included). */
  wins: number;
  /** Σ rank and the number of sessions with a rank (rank is null only before the first scoring pass). */
  rankSum: number;
  rankedSessions: number;
};

export type LeaderboardRow = LeaderboardInput & {
  /** Competition rank (1, 1, 3); null for members without sessions in the window. */
  rank: number | null;
  /** solved / offered; null without sessions. */
  solveRate: number | null;
  avgRank: number | null;
};

export function solveRate(solved: number, offered: number): number | null {
  return offered > 0 ? solved / offered : null;
}

const RATE_EPS = 1e-9;

function compareStanding(a: LeaderboardRow, b: LeaderboardRow): number {
  if (b.solved !== a.solved) return b.solved - a.solved;
  const ra = a.solveRate ?? 0;
  const rb = b.solveRate ?? 0;
  if (Math.abs(rb - ra) > RATE_EPS) return rb - ra;
  return 0;
}

/**
 * §5.2: sorted by problems solved, then solve rate (both desc). Equal solved
 * and equal rate share a rank (1, 1, 3), listed by username. Members with no
 * session in the window come last, unranked, by username.
 */
export function rankLeaderboard(rows: readonly LeaderboardInput[]): LeaderboardRow[] {
  const withStats: LeaderboardRow[] = rows.map((r) => ({
    ...r,
    rank: null,
    solveRate: r.sessions > 0 ? solveRate(r.solved, r.offered) : null,
    avgRank: r.rankedSessions > 0 ? r.rankSum / r.rankedSessions : null,
  }));
  const played = withStats.filter((r) => r.sessions > 0).sort((a, b) => compareStanding(a, b) || byName(a, b));
  const idle = withStats.filter((r) => r.sessions === 0).sort(byName);
  played.forEach((row, i) => {
    const prev = played[i - 1];
    row.rank = prev && compareStanding(prev, row) === 0 ? prev.rank : i + 1;
  });
  return [...played, ...idle];
}

function byName(a: { username: string; userId: string }, b: { username: string; userId: string }): number {
  return cmp(a.username, b.username) || cmp(a.userId, b.userId);
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// --- Solution sharing (§4.5, owner decision D2) ---

export type SolutionAccessInput = {
  sessionStatus: RoomSessionStatus;
  /** rooms.share_solutions */
  roomShares: boolean;
  /** The code's author is still a member of the room. */
  authorIsMember: boolean;
  /** room_members.share_solutions of the author (false when not a member). */
  authorShares: boolean;
  /** The viewer wrote this code. */
  viewerIsAuthor: boolean;
  /** The cell has a first accepted submission. */
  solved: boolean;
};

export type SolutionAccess =
  | { visible: true }
  | { visible: false; reason: "not_finished" | "unsolved" | "room_off" | "author_left" | "opted_out" };

/**
 * Who may open the accepted code of one (participant, problem) cell. Only a
 * finished session's solved cells qualify. Other members need the room
 * setting on and the author still a member with sharing on; authors can
 * always open their own code (it is their submission anyway).
 */
export function solutionAccess(input: SolutionAccessInput): SolutionAccess {
  if (input.sessionStatus !== "finished") return { visible: false, reason: "not_finished" };
  if (!input.solved) return { visible: false, reason: "unsolved" };
  if (input.viewerIsAuthor) return { visible: true };
  if (!input.roomShares) return { visible: false, reason: "room_off" };
  if (!input.authorIsMember) return { visible: false, reason: "author_left" };
  if (!input.authorShares) return { visible: false, reason: "opted_out" };
  return { visible: true };
}

export function solutionHref(roomId: string, sessionId: string, username: string, position: number): string {
  return `/rooms/${roomId}/sessions/${sessionId}/solutions/${username}/${position}`;
}

export function sessionResultsHref(roomId: string, sessionId: string): string {
  return `/rooms/${roomId}/sessions/${sessionId}/results`;
}

/** The R4 lobby/live screen. */
export function sessionScreenHref(roomId: string, sessionId: string): string {
  return `/rooms/${roomId}/sessions/${sessionId}`;
}

export function memberTimelineHref(roomId: string, username: string): string {
  return `/rooms/${roomId}/members/${username}`;
}

// --- Results grid (§4.1, §4.2) ---

export type ResultCellInput = {
  position: number;
  attempts: number;
  wrongBefore: number;
  solveSeconds: number | null;
  firstAcceptedAt: Date | null;
  solvedBefore: boolean;
};

/** Total time = Σ over solved cells of solve_seconds + 300 × wrong_before (D1), split into its parts. */
export function penaltyBreakdown(cells: readonly ResultCellInput[], penaltyPerWrong = PENALTY_SEC_PER_WRONG) {
  let solveSec = 0;
  let wrong = 0;
  for (const c of cells) {
    if (c.solveSeconds === null) continue;
    solveSec += c.solveSeconds;
    wrong += c.wrongBefore;
  }
  const penaltySec = wrong * penaltyPerWrong;
  return { solveSec, wrongCount: wrong, penaltySec, totalSec: solveSec + penaltySec };
}

/** "Problem 2: solved at 23 minutes 41 seconds after 1 wrong attempt, first to solve" (§4.2). */
export function cellSrText(
  position: number,
  cell: Pick<ResultCellInput, "attempts" | "wrongBefore" | "solveSeconds" | "solvedBefore"> | null,
  firstSolver: boolean,
): string {
  const head = `Problem ${position}: `;
  if (!cell || (cell.attempts === 0 && cell.solveSeconds === null)) return `${head}not attempted`;
  if (cell.solveSeconds === null) {
    return `${head}not solved, ${plural(cell.attempts, "attempt")}`;
  }
  const parts = [`${head}solved at ${spokenDuration(cell.solveSeconds)}`];
  if (cell.wrongBefore > 0) parts[0] += ` after ${plural(cell.wrongBefore, "wrong attempt")}`;
  if (firstSolver) parts.push("first to solve");
  if (cell.solvedBefore) parts.push("solved before the session");
  return parts.join(", ");
}

/** 1421 → "23 minutes 41 seconds"; 3600 → "1 hour". */
export function spokenDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts: string[] = [];
  if (h) parts.push(plural(h, "hour"));
  if (m) parts.push(plural(m, "minute"));
  if (sec || parts.length === 0) parts.push(plural(sec, "second"));
  return parts.join(" ");
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** "5:00 penalty" style label of a penalty in seconds. */
export function formatPenalty(penaltySec: number): string {
  return formatScoreTime(penaltySec);
}

/** Minutes the session actually ran (host may end early); planned duration otherwise. */
export function sessionRunMinutes(session: {
  startedAt: Date | null;
  endedAt: Date | null;
  durationMin: number;
}): number {
  if (!session.startedAt || !session.endedAt) return session.durationMin;
  const min = Math.round((session.endedAt.getTime() - session.startedAt.getTime()) / 60_000);
  return Math.max(0, Math.min(min, session.durationMin));
}

/** "90 min", "1 h 30 min" is avoided: the lobby speaks in minutes too. */
export function formatMinutes(min: number): string {
  return `${min} min`;
}

export type ProblemSummaryInput = {
  position: number;
  participants: readonly {
    userId: string;
    username: string;
    cell: Pick<ResultCellInput, "attempts" | "solveSeconds" | "firstAcceptedAt"> | null;
  }[];
};

export type ProblemSummary = {
  position: number;
  solvedBy: number;
  attemptedBy: number;
  participants: number;
  /** Earliest first accept (several on equal timestamps), with their solve time. */
  firstSolvers: { userId: string; username: string; solveSeconds: number }[];
};

/** "Problem 2 · House Robber · solved by 2 of 3 · first: alice 24:30" (§7.4 finished). */
export function summarizeProblem(input: ProblemSummaryInput): ProblemSummary {
  let solvedBy = 0;
  let attemptedBy = 0;
  let bestT: number | null = null;
  let first: ProblemSummary["firstSolvers"] = [];
  for (const p of input.participants) {
    const c = p.cell;
    if (!c) continue;
    if (c.attempts > 0 || c.solveSeconds !== null) attemptedBy += 1;
    if (c.solveSeconds === null) continue;
    solvedBy += 1;
    const t = c.firstAcceptedAt ? c.firstAcceptedAt.getTime() : c.solveSeconds * 1000;
    const entry = { userId: p.userId, username: p.username, solveSeconds: c.solveSeconds };
    if (bestT === null || t < bestT) {
      bestT = t;
      first = [entry];
    } else if (t === bestT) {
      first.push(entry);
    }
  }
  first.sort((a, b) => cmp(a.username, b.username));
  return { position: input.position, solvedBy, attemptedBy, participants: input.participants.length, firstSolvers: first };
}

// --- Member timeline (§5.2) ---

export type TimelineProblem = {
  position: number;
  title: string;
  /** Our problem's slug, or the LeetCode slug when `external`. */
  slug: string;
  /** Null only for a LeetCode problem without a difficulty. */
  difficulty: Difficulty | null;
  /** A LeetCode problem (rooms-external-problems): a solve is self-reported. */
  external?: boolean;
  solveSeconds: number | null;
  wrongBefore: number;
  attempts: number;
  /** v2: first to solve it in that session (ties: each). */
  firstSolver: boolean;
};

export type TimelineSession = {
  sessionId: string;
  startedAt: Date;
  rank: number | null;
  participants: number;
  solvedCount: number;
  problems: TimelineProblem[];
};

export type DifficultyTally = Record<Difficulty, { solved: number; offered: number }>;

export function timelineTotals(sessions: readonly TimelineSession[]): {
  sessions: number;
  solved: number;
  offered: number;
  wins: number;
  byDifficulty: DifficultyTally;
} {
  const byDifficulty = Object.fromEntries(DIFFICULTIES.map((d) => [d, { solved: 0, offered: 0 }])) as DifficultyTally;
  let solved = 0;
  let offered = 0;
  let wins = 0;
  for (const s of sessions) {
    if (s.rank === 1) wins += 1;
    for (const p of s.problems) {
      offered += 1;
      if (p.solveSeconds !== null) solved += 1;
      // The solve rate by difficulty is about judged problems: LeetCode ones are self-reported.
      if (p.external || p.difficulty === null) continue;
      byDifficulty[p.difficulty].offered += 1;
      if (p.solveSeconds !== null) byDifficulty[p.difficulty].solved += 1;
    }
  }
  return { sessions: sessions.length, solved, offered, wins, byDifficulty };
}

/** "Valid Anagram (6:10)", "House Robber (24:30, 1 wrong)" (§5.2). */
export function solvedProblemLabel(p: Pick<TimelineProblem, "title" | "solveSeconds" | "wrongBefore">): string {
  if (p.solveSeconds === null) return p.title;
  const extra = p.wrongBefore > 0 ? `, ${p.wrongBefore} wrong` : "";
  return `${p.title} (${formatScoreTime(p.solveSeconds)}${extra})`;
}

// --- Results page v2 (docs/specs/rooms-v2.md §2.2) ---

/** The cells/rows the results helpers read (a live-view ScoreRow fits). */
export type FactRow = {
  userId: string;
  username: string;
  rank: number | null;
  solved: number;
  penaltySec: number;
  cells: readonly {
    position: number;
    solveSeconds: number | null;
    splitSeconds: number | null;
    firstSolver: boolean;
  }[];
};

export type ResultFacts = {
  /** Rank 1 with at least one solve (several on a tie). */
  winners: { username: string; solved: number; penaltySec: number }[];
  /** First solves per person, most first (ties by username); empty without solves. */
  firstSolves: { username: string; count: number }[];
  /**
   * Shortest time spent on one solve: the split since the person's previous
   * solve, or the solve time for their first one. Ties: earlier position, name.
   */
  fastest: { username: string; position: number; seconds: number } | null;
};

export function resultFacts(rows: readonly FactRow[]): ResultFacts {
  const winners = rows
    .filter((r) => r.rank === 1 && r.solved > 0)
    .map((r) => ({ username: r.username, solved: r.solved, penaltySec: r.penaltySec }));
  const firsts = new Map<string, number>();
  let fastest: ResultFacts["fastest"] = null;
  for (const r of rows) {
    for (const c of r.cells) {
      if (c.solveSeconds === null) continue;
      if (c.firstSolver) firsts.set(r.username, (firsts.get(r.username) ?? 0) + 1);
      const seconds = c.splitSeconds ?? c.solveSeconds;
      const better =
        !fastest ||
        seconds < fastest.seconds ||
        (seconds === fastest.seconds &&
          (c.position < fastest.position || (c.position === fastest.position && r.username < fastest.username)));
      if (better) fastest = { username: r.username, position: c.position, seconds };
    }
  }
  const firstSolves = [...firsts]
    .map(([username, count]) => ({ username, count }))
    .sort((a, b) => b.count - a.count || cmp(a.username, b.username));
  return { winners, firstSolves, fastest };
}

export type TimelineMark = {
  position: number;
  solveSeconds: number;
  /** 0..1 */
  left: number;
  /** A LeetCode solve marked by the participant (rooms-external-problems §5). */
  selfReported: boolean;
};

/** One marker per solve at `left = solveSeconds / duration` (AC-V2-MX-6), in time order. */
export function timelineMarks(
  cells: readonly { position: number; solveSeconds: number | null; selfReported?: boolean }[],
  durationSec: number,
): TimelineMark[] {
  return cells
    .filter((c) => c.solveSeconds !== null)
    .map((c) => ({
      position: c.position,
      solveSeconds: c.solveSeconds!,
      selfReported: c.selfReported ?? false,
      left: durationSec > 0 ? Math.min(1, Math.max(0, c.solveSeconds! / durationSec)) : 0,
    }))
    .sort((a, b) => a.solveSeconds - b.solveSeconds || a.position - b.position);
}

// --- Members tab (docs/specs/rooms-v2.md §2.4) ---

/** Attendance squares cover the room's last 8 finished sessions. */
export const ATTENDANCE_WINDOW = 8;

/** One square: played, missed, or the session was before the person joined. */
export type AttendanceMark = "played" | "missed" | "before";

export type Attendance = {
  /** Oldest first, `ATTENDANCE_WINDOW` at most. */
  marks: AttendanceMark[];
  played: number;
  /** Sessions they could have played (played, or held after they joined). */
  of: number;
  /** Consecutive played sessions up to the newest. */
  streak: number;
  /** Some sessions of the window were before they joined: "2 of 2 since joining". */
  sinceJoining: boolean;
};

/**
 * `sessions`: the room's latest finished sessions, newest first. A session
 * counts as "before" when it started before the person (last) joined and they
 * did not play it.
 */
export function attendance(
  sessions: readonly { startedAt: Date; participants: ReadonlySet<string> }[],
  member: { userId: string; joinedAt: Date | null },
): Attendance {
  const window = sessions.slice(0, ATTENDANCE_WINDOW);
  const newestFirst: AttendanceMark[] = window.map((s) => {
    if (s.participants.has(member.userId)) return "played";
    if (member.joinedAt && s.startedAt.getTime() < member.joinedAt.getTime()) return "before";
    return "missed";
  });
  let streak = 0;
  for (const m of newestFirst) {
    if (m !== "played") break;
    streak += 1;
  }
  const played = newestFirst.filter((m) => m === "played").length;
  const of = newestFirst.filter((m) => m !== "before").length;
  return { marks: [...newestFirst].reverse(), played, of, streak, sinceJoining: of < window.length };
}

/** "7 of last 8 · streak 5" · "2 of 2 since joining" · "No sessions yet" (§12 copy). */
export function attendanceText(a: Attendance): string {
  if (a.marks.length === 0) return "No sessions yet";
  if (a.sinceJoining) return `${a.played} of ${a.of} since joining`;
  const base = `${a.played} of last ${a.of}`;
  return a.streak > 1 ? `${base} · streak ${a.streak}` : base;
}

export type MemberStatsInput = {
  userId: string;
  username: string;
  /** Still a member of the room ("(left)" otherwise). */
  isMember: boolean;
  solved: number;
  firstSolves: number;
  wins: number;
};

/**
 * Members tab order (rooms-v2 §2.4, the ranking that replaces the v1
 * leaderboard): current members first, then wins, problems solved and first
 * solves (all desc), then username.
 */
export function sortMemberStats<T extends MemberStatsInput>(rows: readonly T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      Number(b.isMember) - Number(a.isMember) ||
      b.wins - a.wins ||
      b.solved - a.solved ||
      b.firstSolves - a.firstSolves ||
      byName(a, b),
  );
}

/** Members tab URL keeping the period (`?range=`). */
export function membersHref(roomId: string, range: LeaderboardRange): string {
  return range === DEFAULT_LEADERBOARD_RANGE
    ? `/rooms/${roomId}?tab=members`
    : `/rooms/${roomId}?tab=members&range=${range}`;
}
