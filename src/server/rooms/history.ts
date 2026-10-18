// Room history, member stats and member timeline (docs/specs/rooms.md §5,
// §6.5 Q0, Q2, Q3, Q5; rooms-v2.md §2.4). Every function starts with the
// membership gate and returns null for non-members and unknown ids (the
// caller answers 404). Query budgets (asserted in
// tests/integration/rooms-history.test.ts): history ≤ 5 (Q0, open session,
// page, participants with their result cells, problems), members 4 (Q0,
// stats, members, attendance), timeline 3 (Q0, target, Q3); a due lazy close
// of the open session adds its own transaction.
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import {
  attendance,
  HISTORY_PAGE_SIZE,
  sessionRunMinutes,
  sortMemberStats,
  TIMELINE_SESSION_LIMIT,
  ATTENDANCE_WINDOW,
  type Attendance,
  type LeaderboardRange,
  type TimelineSession,
} from "@/lib/rooms/history";
import { firstSolvers } from "@/lib/rooms/scoring";
import { dueAction } from "@/lib/rooms/session-state";
import type { Difficulty, RoomSessionEndReason } from "@/lib/rooms/types";
import type { Db } from "@/server/db";
import {
  problems,
  roomMembers,
  roomSessionParticipants,
  roomSessionProblems,
  roomSessions,
  users,
} from "@/server/db/schema";

import { requireRoomMember, type RoomAccess } from "./access";
import { closeIfDueNow } from "./lifecycle";
import { toResultProblem } from "./results";

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export type OpenSessionItem = {
  id: string;
  status: "lobby" | "live";
  plannedFor: string | null;
  startedAt: string | null;
  endsAt: string | null;
  problemCount: number;
  durationMin: number;
  joined: number;
  viewerJoined: boolean;
};

export type HistoryProblem = {
  position: number;
  /** Null for a LeetCode slot (see `external`). */
  slug: string | null;
  title: string;
  /** Null only for a LeetCode slot without a difficulty. */
  difficulty: Difficulty | null;
  published: boolean;
  /** A LeetCode slot (rooms-external-problems): its cells are self-reported. */
  external?: { slug: string; rating: number | null };
};

export type HistorySessionItem = {
  id: string;
  status: "finished" | "cancelled";
  /** started_at for finished sessions, ended_at (cancel time) for cancelled ones. */
  date: string;
  endReason: RoomSessionEndReason | null;
  durationMin: number;
  /** Minutes it actually ran (shorter when the host ended it early). */
  runMinutes: number;
  problemCount: number;
  problems: HistoryProblem[];
  participants: number;
  /** Usernames with rank 1 (ties: several). */
  winners: string[];
  /** The viewer's result, null when they did not take part. */
  viewer: { solved: number; rank: number | null } | null;
  /**
   * v2 mini-matrix (§2.4): participants by rank, then username, with one
   * result cell per problem they touched (finished sessions; [] otherwise).
   */
  standings: HistoryStanding[];
};

export type HistoryCell = {
  position: number;
  attempts: number;
  wrongBefore: number;
  solveSeconds: number | null;
  firstSolver: boolean;
  solvedBefore: boolean;
};

export type HistoryStanding = {
  userId: string;
  username: string;
  rank: number | null;
  solvedCount: number;
  penaltySec: number;
  cells: HistoryCell[];
};

type HistoryCellJson = Omit<HistoryCell, "firstSolver"> & { firstAcceptedAt: string | null };

export type RoomHistory = {
  open: OpenSessionItem[];
  sessions: HistorySessionItem[];
  /** Finished + cancelled sessions of the room (all pages). */
  total: number;
  page: number;
  pageSize: number;
};

async function loadOpenSessions(db: Db, roomId: string, userId: string) {
  return db
    .select({
      id: roomSessions.id,
      status: roomSessions.status,
      createdAt: roomSessions.createdAt,
      plannedFor: roomSessions.plannedFor,
      startedAt: roomSessions.startedAt,
      endsAt: roomSessions.endsAt,
      problemCount: roomSessions.problemCount,
      durationMin: roomSessions.durationMin,
      joined: sql<number>`(SELECT count(*)::int FROM room_session_participants x WHERE x.session_id = ${roomSessions.id})`,
      viewerJoined: sql<boolean>`EXISTS (SELECT 1 FROM room_session_participants x
        WHERE x.session_id = ${roomSessions.id} AND x.user_id = ${userId})`,
      now: sql<string>`clock_timestamp()`,
    })
    .from(roomSessions)
    .where(and(eq(roomSessions.roomId, roomId), inArray(roomSessions.status, ["lobby", "live"])));
}

/** Sessions tab (§5.2): open session(s) pinned, then finished and cancelled sessions newest first. */
export async function getRoomHistory(
  db: Db,
  roomId: string,
  userId: string,
  { page = 1, pageSize = HISTORY_PAGE_SIZE }: { page?: number; pageSize?: number } = {},
): Promise<RoomHistory | null> {
  const access = await requireRoomMember(db, roomId, userId);
  if (!access) return null;

  const sortAt = sql`coalesce(${roomSessions.startedAt}, ${roomSessions.endedAt}, ${roomSessions.createdAt})`;
  const pageQuery = () =>
    db
      .select({
        id: roomSessions.id,
        status: roomSessions.status,
        startedAt: roomSessions.startedAt,
        endedAt: roomSessions.endedAt,
        createdAt: roomSessions.createdAt,
        endReason: roomSessions.endReason,
        durationMin: roomSessions.durationMin,
        problemCount: roomSessions.problemCount,
        total: sql<number>`(count(*) OVER ())::int`,
      })
      .from(roomSessions)
      .where(and(eq(roomSessions.roomId, roomId), inArray(roomSessions.status, ["finished", "cancelled"])))
      .orderBy(desc(sortAt), desc(roomSessions.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

  let [openRows, pageRows] = await Promise.all([loadOpenSessions(db, roomId, userId), pageQuery()]);
  // Lazy close (§7.3): a live session past its end (or a stale lobby) moves to the list.
  const due = openRows.filter((s) => dueAction(s, new Date(s.now)) !== null);
  if (due.length > 0) {
    for (const s of due) await closeIfDueNow(db, s.id);
    [openRows, pageRows] = await Promise.all([loadOpenSessions(db, roomId, userId), pageQuery()]);
  }

  let total = pageRows[0]?.total ?? 0;
  if (pageRows.length === 0 && page > 1) {
    // Past the last page: the window count is not available, count directly.
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(roomSessions)
      .where(and(eq(roomSessions.roomId, roomId), inArray(roomSessions.status, ["finished", "cancelled"])));
    total = row?.n ?? 0;
  }

  const ids = pageRows.map((r) => r.id);
  const [participantRows, problemRows] =
    ids.length === 0
      ? [[], []]
      : await Promise.all([
          db
            .select({
              sessionId: roomSessionParticipants.sessionId,
              userId: roomSessionParticipants.userId,
              username: users.username,
              solvedCount: roomSessionParticipants.solvedCount,
              penaltySec: roomSessionParticipants.penaltySec,
              rank: roomSessionParticipants.rank,
              cells: sql<HistoryCellJson[]>`coalesce((
                SELECT json_agg(json_build_object(
                  'position', r.position, 'attempts', r.attempts, 'wrongBefore', r.wrong_before_accept,
                  'solveSeconds', r.solve_seconds, 'firstAcceptedAt', r.first_accepted_at,
                  'solvedBefore', r.solved_before) ORDER BY r.position)
                FROM room_session_results r
                WHERE r.session_id = ${roomSessionParticipants.sessionId} AND r.user_id = ${roomSessionParticipants.userId}
              ), '[]'::json)`,
            })
            .from(roomSessionParticipants)
            .innerJoin(users, eq(users.id, roomSessionParticipants.userId))
            .where(inArray(roomSessionParticipants.sessionId, ids))
            .orderBy(asc(users.username)),
          db
            .select({
              sessionId: roomSessionProblems.sessionId,
              position: roomSessionProblems.position,
              slug: problems.slug,
              title: problems.title,
              difficulty: roomSessionProblems.difficulty,
              published: problems.published,
              pinned: roomSessionProblems.pinned,
              externalSlug: roomSessionProblems.externalSlug,
              externalTitle: roomSessionProblems.externalTitle,
              externalRating: roomSessionProblems.externalRating,
            })
            .from(roomSessionProblems)
            .leftJoin(problems, eq(problems.id, roomSessionProblems.problemId))
            .where(inArray(roomSessionProblems.sessionId, ids))
            .orderBy(asc(roomSessionProblems.position)),
        ]);

  const sessions: HistorySessionItem[] = pageRows.map((s) => {
    const people = participantRows.filter((p) => p.sessionId === s.id);
    const mine = people.find((p) => p.userId === userId);
    const finished = s.status === "finished";
    return {
      id: s.id,
      status: s.status as "finished" | "cancelled",
      date: (s.startedAt ?? s.endedAt ?? s.createdAt).toISOString(),
      endReason: s.endReason as RoomSessionEndReason | null,
      durationMin: s.durationMin,
      runMinutes: sessionRunMinutes(s),
      problemCount: s.problemCount,
      problems: problemRows
        .filter((p) => p.sessionId === s.id)
        .map((p) => {
          const { pinned: _pinned, ...problem } = toResultProblem(p);
          void _pinned;
          return problem;
        }),
      participants: people.length,
      winners: finished ? people.filter((p) => p.rank === 1).map((p) => p.username) : [],
      viewer: mine && finished ? { solved: mine.solvedCount, rank: mine.rank } : null,
      standings: finished ? historyStandings(people) : [],
    };
  });

  return {
    open: openRows.map((s) => ({
      id: s.id,
      status: s.status as "lobby" | "live",
      plannedFor: s.plannedFor?.toISOString() ?? null,
      startedAt: s.startedAt?.toISOString() ?? null,
      endsAt: s.endsAt?.toISOString() ?? null,
      problemCount: s.problemCount,
      durationMin: s.durationMin,
      joined: s.joined,
      viewerJoined: s.viewerJoined,
    })),
    sessions,
    total,
    page,
    pageSize,
  };
}

/** Mini-matrix rows of one finished session: by rank, then username; first solvers marked. */
function historyStandings(
  people: readonly {
    userId: string;
    username: string;
    rank: number | null;
    solvedCount: number;
    penaltySec: number;
    cells: HistoryCellJson[];
  }[],
): HistoryStanding[] {
  const parsed = people.map((p) => ({
    ...p,
    cells: p.cells.map((c) => ({ ...c, firstAcceptedAt: c.firstAcceptedAt ? new Date(c.firstAcceptedAt) : null })),
  }));
  const first = firstSolvers(parsed);
  return parsed
    .map((p) => ({
      userId: p.userId,
      username: p.username,
      rank: p.rank,
      solvedCount: p.solvedCount,
      penaltySec: p.penaltySec,
      cells: p.cells.map((c) => ({
        position: c.position,
        attempts: c.attempts,
        wrongBefore: c.wrongBefore,
        solveSeconds: c.solveSeconds,
        firstSolver: c.solveSeconds !== null && (first.get(c.position) ?? []).includes(p.userId),
        solvedBefore: c.solvedBefore,
      })),
    }))
    .sort(
      (a, b) =>
        (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER) ||
        (a.username < b.username ? -1 : a.username > b.username ? 1 : 0),
    );
}

// --- Members tab (rooms-v2 §2.4; replaces the v1 Leaderboard tab, Q5) ---

export type MemberStatsRow = {
  userId: string;
  username: string;
  /** Still a member ("(left)" otherwise: they still appear when they played in the period). */
  isMember: boolean;
  role: "owner" | "member" | null;
  /** Finished sessions played in the period. */
  sessions: number;
  /** Problems solved in the period. */
  solved: number;
  /** Problems they were first to solve in the period (ties count for each). */
  firstSolves: number;
  /** Sessions finished in first place in the period (ties included). */
  wins: number;
  /** Over the room's last 8 finished sessions (independent of the period); null for people who left. */
  attendance: Attendance | null;
};

export type RoomMemberStats = {
  range: LeaderboardRange;
  rows: MemberStatsRow[];
  /** Finished sessions in the period. */
  sessions: number;
  /** Finished sessions in the attendance window (0..8). */
  attendanceSessions: number;
};

function sinceClause(range: LeaderboardRange) {
  switch (range) {
    case "4w":
      return sql`AND s.started_at >= now() - interval '28 days'`;
    case "3m":
      return sql`AND s.started_at >= now() - interval '3 months'`;
    case "all":
      return sql``;
  }
}

/**
 * Members tab: per person solved, first solves and wins over `range`, plus
 * attendance over the room's last 8 finished sessions. 4 queries (Q0 + 3 in
 * parallel). The v1 "difficulty profile" (calibration) is no longer read here:
 * it lives in the lobby only.
 */
export async function getRoomMemberStats(
  db: Db,
  roomId: string,
  userId: string,
  range: LeaderboardRange,
): Promise<RoomMemberStats | null> {
  const access = await requireRoomMember(db, roomId, userId);
  if (!access) return null;
  const since = sinceClause(range);

  const [stats, members, recent] = await Promise.all([
    db.execute<{
      user_id: string;
      username: string;
      is_member: boolean;
      sessions: number;
      solved: number;
      wins: number;
      first_solves: number;
      window_sessions: number;
    }>(sql`
      WITH played AS (
        SELECT p.user_id, p.solved_count, p.rank, s.id AS session_id
        FROM room_sessions s
        JOIN room_session_participants p ON p.session_id = s.id
        WHERE s.room_id = ${roomId} AND s.status = 'finished' ${since}
      ),
      firsts AS (
        SELECT x.user_id, count(*)::int AS n
        FROM (
          SELECT r.user_id, r.first_accepted_at,
                 min(r.first_accepted_at) OVER (PARTITION BY r.session_id, r.position) AS best
          FROM room_session_results r
          JOIN room_sessions s ON s.id = r.session_id
          WHERE s.room_id = ${roomId} AND s.status = 'finished' ${since}
            AND r.solve_seconds IS NOT NULL AND r.first_accepted_at IS NOT NULL
        ) x
        WHERE x.first_accepted_at = x.best
        GROUP BY x.user_id
      )
      SELECT pl.user_id, u.username, (m.user_id IS NOT NULL) AS is_member,
             count(*)::int AS sessions,
             sum(pl.solved_count)::int AS solved,
             (count(*) FILTER (WHERE pl.rank = 1))::int AS wins,
             coalesce(max(f.n), 0)::int AS first_solves,
             (SELECT count(DISTINCT session_id)::int FROM played) AS window_sessions
      FROM played pl
      JOIN users u ON u.id = pl.user_id
      LEFT JOIN room_members m ON m.room_id = ${roomId} AND m.user_id = pl.user_id
      LEFT JOIN firsts f ON f.user_id = pl.user_id
      GROUP BY pl.user_id, u.username, m.user_id
    `),
    db
      .select({
        userId: roomMembers.userId,
        username: users.username,
        role: roomMembers.role,
        joinedAt: roomMembers.joinedAt,
      })
      .from(roomMembers)
      .innerJoin(users, eq(users.id, roomMembers.userId))
      .where(eq(roomMembers.roomId, roomId)),
    db.execute<{ id: string; started_at: Date | string; users: string[] }>(sql`
      SELECT s.id, s.started_at,
             coalesce(array_agg(p.user_id) FILTER (WHERE p.user_id IS NOT NULL), '{}') AS users
      FROM (
        SELECT id, started_at FROM room_sessions
        WHERE room_id = ${roomId} AND status = 'finished'
        ORDER BY started_at DESC, id DESC
        LIMIT ${ATTENDANCE_WINDOW}
      ) s
      LEFT JOIN room_session_participants p ON p.session_id = s.id
      GROUP BY s.id, s.started_at
      ORDER BY s.started_at DESC, s.id DESC
    `),
  ]);

  const window = recent.rows.map((r) => ({ startedAt: new Date(r.started_at), participants: new Set(r.users) }));
  const byUser = new Map(stats.rows.map((r) => [r.user_id, r]));
  const memberIds = new Set(members.map((m) => m.userId));
  const rows: MemberStatsRow[] = [
    ...members.map((m) => {
      const s = byUser.get(m.userId);
      return {
        userId: m.userId,
        username: m.username,
        isMember: true,
        role: m.role as "owner" | "member",
        sessions: Number(s?.sessions ?? 0),
        solved: Number(s?.solved ?? 0),
        firstSolves: Number(s?.first_solves ?? 0),
        wins: Number(s?.wins ?? 0),
        attendance: attendance(window, { userId: m.userId, joinedAt: m.joinedAt }),
      };
    }),
    ...stats.rows
      .filter((r) => !memberIds.has(r.user_id))
      .map((r) => ({
        userId: r.user_id,
        username: r.username,
        isMember: false,
        role: null,
        sessions: Number(r.sessions),
        solved: Number(r.solved),
        firstSolves: Number(r.first_solves),
        wins: Number(r.wins),
        attendance: null,
      })),
  ];
  return {
    range,
    rows: sortMemberStats(rows),
    sessions: Number(stats.rows[0]?.window_sessions ?? 0),
    attendanceSessions: window.length,
  };
}

// --- Member timeline (§5.2, Q3) ---

export type MemberTimeline = {
  room: { id: string; name: string };
  member: { userId: string; username: string; isMember: boolean; joinedAt: string | null };
  sessions: TimelineSession[];
  /** More finished sessions exist than TIMELINE_SESSION_LIMIT. */
  truncated: boolean;
};

/**
 * `/rooms/[roomId]/members/[username]`: null for non-member viewers, unknown
 * names, and users who are neither members nor ever took part (§7.4).
 */
export async function getMemberTimeline(
  db: Db,
  roomId: string,
  viewerId: string,
  username: string,
): Promise<MemberTimeline | null> {
  if (!USERNAME_RE.test(username)) return null;
  const access: RoomAccess | null = await requireRoomMember(db, roomId, viewerId);
  if (!access) return null;

  const [target] = await db
    .select({ userId: users.id, username: users.username, joinedAt: roomMembers.joinedAt })
    .from(users)
    .leftJoin(roomMembers, and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, users.id)))
    .where(eq(users.username, username))
    .limit(1);
  if (!target) return null;

  const { rows } = await db.execute<{
    session_id: string;
    started_at: Date | string;
    rank: number | null;
    solved_count: number;
    participants: number;
    position: number;
    slug: string;
    title: string;
    difficulty: Difficulty | null;
    external: boolean;
    solve_seconds: number | null;
    wrong_before_accept: number | null;
    attempts: number | null;
    first_solver: boolean | null;
  }>(sql`
    WITH mine AS (
      SELECT p.session_id, p.rank, p.solved_count, s.started_at,
             (SELECT count(*)::int FROM room_session_participants x WHERE x.session_id = p.session_id) AS participants
      FROM room_session_participants p
      JOIN room_sessions s ON s.id = p.session_id AND s.room_id = ${roomId} AND s.status = 'finished'
      WHERE p.user_id = ${target.userId}
      ORDER BY s.started_at DESC, s.id DESC
      LIMIT ${TIMELINE_SESSION_LIMIT + 1}
    )
    SELECT m.session_id, m.started_at, m.rank, m.solved_count, m.participants,
           sp.position, coalesce(pr.slug, sp.external_slug) AS slug, coalesce(pr.title, sp.external_title) AS title,
           sp.difficulty, (sp.problem_id IS NULL) AS external,
           res.solve_seconds, res.wrong_before_accept, res.attempts,
           (res.solve_seconds IS NOT NULL AND res.first_accepted_at = (
              SELECT min(r2.first_accepted_at) FROM room_session_results r2
              WHERE r2.session_id = m.session_id AND r2.position = sp.position AND r2.solve_seconds IS NOT NULL
           )) AS first_solver
    FROM mine m
    JOIN room_session_problems sp ON sp.session_id = m.session_id
    LEFT JOIN problems pr ON pr.id = sp.problem_id
    LEFT JOIN room_session_results res
      ON res.session_id = m.session_id AND res.user_id = ${target.userId} AND res.position = sp.position
    ORDER BY m.started_at DESC, m.session_id DESC, sp.position
  `);

  const isMember = target.joinedAt !== null;
  if (!isMember && rows.length === 0) return null;

  const sessions: TimelineSession[] = [];
  const byId = new Map<string, TimelineSession>();
  for (const r of rows) {
    let s = byId.get(r.session_id);
    if (!s) {
      s = {
        sessionId: r.session_id,
        startedAt: new Date(r.started_at),
        rank: r.rank === null ? null : Number(r.rank),
        participants: Number(r.participants),
        solvedCount: Number(r.solved_count),
        problems: [],
      };
      byId.set(r.session_id, s);
      sessions.push(s);
    }
    s.problems.push({
      position: Number(r.position),
      slug: r.slug,
      title: r.title,
      difficulty: r.difficulty,
      ...(r.external ? { external: true } : {}),
      solveSeconds: r.solve_seconds === null ? null : Number(r.solve_seconds),
      wrongBefore: Number(r.wrong_before_accept ?? 0),
      attempts: Number(r.attempts ?? 0),
      firstSolver: r.first_solver === true,
    });
  }
  const truncated = sessions.length > TIMELINE_SESSION_LIMIT;
  return {
    room: { id: access.roomId, name: access.roomName },
    member: {
      userId: target.userId,
      username: target.username,
      isMember,
      joinedAt: target.joinedAt?.toISOString() ?? null,
    },
    sessions: sessions.slice(0, TIMELINE_SESSION_LIMIT),
    truncated,
  };
}
