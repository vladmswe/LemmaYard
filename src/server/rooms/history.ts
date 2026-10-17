// Room history, leaderboard and member timeline (docs/specs/rooms.md §5, §6.5
// Q0, Q2, Q3, Q4, Q5). Every function starts with the membership gate and
// returns null for non-members and unknown ids (the caller answers 404).
// Query budgets (asserted in tests/integration/rooms-history.test.ts):
// history ≤ 5 (Q0, open session, page, participants, problems), leaderboard
// 4 (Q0, Q5, members, Q4), timeline 3 (Q0, target, Q3); a due lazy close of
// the open session adds its own transaction.
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import {
  HISTORY_PAGE_SIZE,
  rankLeaderboard,
  sessionRunMinutes,
  TIMELINE_SESSION_LIMIT,
  type LeaderboardRange,
  type LeaderboardRow,
  type TimelineSession,
} from "@/lib/rooms/history";
import type { Calibration } from "@/lib/rooms/selection";
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
import { loadCalibration } from "./draw";
import { closeIfDueNow } from "./lifecycle";

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
  slug: string;
  title: string;
  difficulty: Difficulty;
  published: boolean;
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
};

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
              rank: roomSessionParticipants.rank,
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
            })
            .from(roomSessionProblems)
            .innerJoin(problems, eq(problems.id, roomSessionProblems.problemId))
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
        .map((p) => ({
          position: p.position,
          slug: p.slug,
          title: p.title,
          difficulty: p.difficulty as Difficulty,
          published: p.published,
        })),
      participants: people.length,
      winners: finished ? people.filter((p) => p.rank === 1).map((p) => p.username) : [],
      viewer: mine && finished ? { solved: mine.solvedCount, rank: mine.rank } : null,
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

// --- Leaderboard (§5.2, Q5) ---

export type RoomLeaderboard = {
  range: LeaderboardRange;
  rows: LeaderboardRow[];
  /** Finished sessions in the window. */
  sessions: number;
  /** Q4 read-out: the lobby's numbers (last 6 finished sessions). */
  calibration: Calibration;
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

export async function getRoomLeaderboard(
  db: Db,
  roomId: string,
  userId: string,
  range: LeaderboardRange,
): Promise<RoomLeaderboard | null> {
  const access = await requireRoomMember(db, roomId, userId);
  if (!access) return null;

  const [stats, members, calibration] = await Promise.all([
    db.execute<{
      user_id: string;
      username: string;
      is_member: boolean;
      sessions: number;
      solved: number;
      offered: number;
      wins: number;
      rank_sum: number;
      ranked: number;
      window_sessions: number;
    }>(sql`
      WITH played AS (
        SELECT p.user_id, p.solved_count, p.rank, s.problem_count, s.id AS session_id
        FROM room_sessions s
        JOIN room_session_participants p ON p.session_id = s.id
        WHERE s.room_id = ${roomId} AND s.status = 'finished' ${sinceClause(range)}
      )
      SELECT pl.user_id, u.username, (m.user_id IS NOT NULL) AS is_member,
             count(*)::int AS sessions,
             sum(pl.solved_count)::int AS solved,
             sum(pl.problem_count)::int AS offered,
             (count(*) FILTER (WHERE pl.rank = 1))::int AS wins,
             coalesce(sum(pl.rank), 0)::int AS rank_sum,
             count(pl.rank)::int AS ranked,
             (SELECT count(DISTINCT session_id)::int FROM played) AS window_sessions
      FROM played pl
      JOIN users u ON u.id = pl.user_id
      LEFT JOIN room_members m ON m.room_id = ${roomId} AND m.user_id = pl.user_id
      GROUP BY pl.user_id, u.username, m.user_id
    `),
    db
      .select({ userId: roomMembers.userId, username: users.username })
      .from(roomMembers)
      .innerJoin(users, eq(users.id, roomMembers.userId))
      .where(eq(roomMembers.roomId, roomId)),
    loadCalibration(db, roomId),
  ]);

  const seen = new Set(stats.rows.map((r) => r.user_id));
  const rows = rankLeaderboard([
    ...stats.rows.map((r) => ({
      userId: r.user_id,
      username: r.username,
      isMember: r.is_member,
      sessions: Number(r.sessions),
      solved: Number(r.solved),
      offered: Number(r.offered),
      wins: Number(r.wins),
      rankSum: Number(r.rank_sum),
      rankedSessions: Number(r.ranked),
    })),
    ...members
      .filter((m) => !seen.has(m.userId))
      .map((m) => ({
        userId: m.userId,
        username: m.username,
        isMember: true,
        sessions: 0,
        solved: 0,
        offered: 0,
        wins: 0,
        rankSum: 0,
        rankedSessions: 0,
      })),
  ]);
  return {
    range,
    rows,
    sessions: Number(stats.rows[0]?.window_sessions ?? 0),
    calibration,
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
    difficulty: Difficulty;
    solve_seconds: number | null;
    wrong_before_accept: number | null;
    attempts: number | null;
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
           sp.position, pr.slug, pr.title, sp.difficulty,
           res.solve_seconds, res.wrong_before_accept, res.attempts
    FROM mine m
    JOIN room_session_problems sp ON sp.session_id = m.session_id
    JOIN problems pr ON pr.id = sp.problem_id
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
      solveSeconds: r.solve_seconds === null ? null : Number(r.solve_seconds),
      wrongBefore: Number(r.wrong_before_accept ?? 0),
      attempts: Number(r.attempts ?? 0),
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
