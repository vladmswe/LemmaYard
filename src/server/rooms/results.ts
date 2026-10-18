// Results of one session and the solutions viewer (docs/specs/rooms.md §4,
// §4.5, §7.2, §7.4, §8.2, §8.4). Both start with the membership gate and
// check that the session belongs to the room in the path; anything else is
// null (404). Results budget: Q0, session (+ host, pending judging), problems,
// participants with their cells and sharing flags, tag names when the session
// had topics = at most 5 queries (+ a due lazy close).
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import {
  penaltyBreakdown,
  sessionRunMinutes,
  solutionAccess,
  summarizeProblem,
  type ProblemSummary,
  type SolutionAccess,
} from "@/lib/rooms/history";
import { formatTagLabel } from "@/lib/format";
import { firstSolvers } from "@/lib/rooms/scoring";
import { dueAction } from "@/lib/rooms/session-state";
import type { Difficulty, RoomRole, RoomSessionEndReason, RoomSessionSettings } from "@/lib/rooms/types";
import type { Language } from "@/lib/submission-dto";
import type { Db } from "@/server/db";
import {
  problems,
  roomMembers,
  roomSessionParticipants,
  roomSessionProblems,
  roomSessions,
  tags,
  users,
} from "@/server/db/schema";

import { requireRoomMember } from "./access";
import { loadSessionRatings } from "./ratings";
import { closeIfDueNow } from "./lifecycle";

const idSchema = z.uuid();
export const SOLUTION_NOT_FOUND = "Solution not found";
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export type ResultCell = {
  position: number;
  attempts: number;
  wrongBefore: number;
  solveSeconds: number | null;
  firstSolver: boolean;
  solvedBefore: boolean;
  /** Whether the viewer may open the accepted code (never the submission id). */
  solution: SolutionAccess;
};

export type ResultParticipant = {
  userId: string;
  username: string;
  /** Still a member of the room ("(left)" otherwise). */
  isMember: boolean;
  isViewer: boolean;
  isHost: boolean;
  rank: number | null;
  solvedCount: number;
  penaltySec: number;
  breakdown: ReturnType<typeof penaltyBreakdown>;
  /** One per session problem, by position (an untouched problem has attempts 0). */
  cells: ResultCell[];
  /**
   * Rooms v2 rating slot (§2.2 "Rating change"): filled by the rating module
   * once the session is rated; absent → the results page shows no rating UI.
   * `null` = not rated (no submissions).
   */
  ratingChange?: { before: number; delta: number; expected: number; provisional?: boolean } | null;
};

export type ResultProblem = {
  position: number;
  /** Our problem's slug; null for a LeetCode slot (see `external`). */
  slug: string | null;
  title: string;
  /** Null only for a LeetCode slot without a difficulty. */
  difficulty: Difficulty | null;
  published: boolean;
  pinned: boolean;
  /** A LeetCode slot (rooms-external-problems): honor-system results, never rated. */
  external?: { slug: string; rating: number | null };
  /** Rooms v2 rating slot: the problem's rating before → after the session (absent: not shown). */
  rating?: { before: number; after: number };
};

export type FinishedResults = {
  kind: "finished";
  room: { id: string; name: string; shareSolutions: boolean };
  viewer: { userId: string; role: RoomRole; shareSolutions: boolean; isParticipant: boolean };
  session: {
    id: string;
    startedAt: string;
    endsAt: string;
    endedAt: string;
    endReason: RoomSessionEndReason | null;
    durationMin: number;
    runMinutes: number;
    problemCount: number;
    settings: RoomSessionSettings;
    host: string | null;
    pendingJudging: number;
  };
  topics: string[];
  problems: ResultProblem[];
  participants: ResultParticipant[];
  summaries: ProblemSummary[];
};

export type SessionResults =
  | FinishedResults
  /** Lobby or live: the caller redirects to the session screen. */
  | { kind: "open"; status: "lobby" | "live" }
  | {
      kind: "cancelled";
      room: { id: string; name: string };
      session: { id: string; endedAt: string | null; endReason: RoomSessionEndReason | null };
    };

type CellJson = {
  position: number;
  attempts: number;
  wrongBefore: number;
  solveSeconds: number | null;
  firstAcceptedAt: string | null;
  solvedBefore: boolean;
  hasSubmission: boolean;
};

async function loadSession(db: Db, roomId: string, sessionId: string) {
  const [row] = await db
    .select({
      id: roomSessions.id,
      status: roomSessions.status,
      createdAt: roomSessions.createdAt,
      startedAt: roomSessions.startedAt,
      endsAt: roomSessions.endsAt,
      endedAt: roomSessions.endedAt,
      endReason: roomSessions.endReason,
      durationMin: roomSessions.durationMin,
      problemCount: roomSessions.problemCount,
      settings: roomSessions.settings,
      hostId: roomSessions.hostId,
      ratedAt: roomSessions.ratedAt,
      host: users.username,
      now: sql<string>`clock_timestamp()`,
      pending: sql<number>`(SELECT count(*)::int FROM submissions x
        WHERE x.room_session_id = ${roomSessions.id} AND x.status IN ('queued', 'running'))`,
    })
    .from(roomSessions)
    .leftJoin(users, eq(users.id, roomSessions.hostId))
    .where(and(eq(roomSessions.id, sessionId), eq(roomSessions.roomId, roomId)))
    .limit(1);
  return row ?? null;
}

export async function getSessionResults(
  db: Db,
  roomId: string,
  sessionId: string,
  userId: string,
): Promise<SessionResults | null> {
  if (!idSchema.safeParse(sessionId).success) return null;
  const access = await requireRoomMember(db, roomId, userId);
  if (!access) return null;
  let session = await loadSession(db, roomId, sessionId);
  if (!session) return null;
  if (dueAction(session, new Date(session.now))) {
    await closeIfDueNow(db, sessionId);
    session = await loadSession(db, roomId, sessionId);
    if (!session) return null;
  }
  if (session.status === "lobby" || session.status === "live") return { kind: "open", status: session.status };
  if (session.status === "cancelled") {
    return {
      kind: "cancelled",
      room: { id: access.roomId, name: access.roomName },
      session: {
        id: session.id,
        endedAt: session.endedAt?.toISOString() ?? null,
        endReason: session.endReason as RoomSessionEndReason | null,
      },
    };
  }

  const settings = session.settings;
  const [problemRows, participantRows, tagRows] = await Promise.all([
    db
      .select({
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
      .where(eq(roomSessionProblems.sessionId, sessionId))
      .orderBy(asc(roomSessionProblems.position))
      .then((rows) => rows.map(toResultProblem)),
    db
      .select({
        userId: roomSessionParticipants.userId,
        username: users.username,
        solvedCount: roomSessionParticipants.solvedCount,
        penaltySec: roomSessionParticipants.penaltySec,
        rank: roomSessionParticipants.rank,
        isMember: sql<boolean>`(${roomMembers.userId} IS NOT NULL)`,
        shares: sql<boolean>`coalesce(${roomMembers.shareSolutions}, false)`,
        cells: sql<CellJson[]>`coalesce((
          SELECT json_agg(json_build_object(
            'position', r.position, 'attempts', r.attempts, 'wrongBefore', r.wrong_before_accept,
            'solveSeconds', r.solve_seconds, 'firstAcceptedAt', r.first_accepted_at,
            'solvedBefore', r.solved_before,
            'hasSubmission', r.first_accepted_submission_id IS NOT NULL) ORDER BY r.position)
          FROM room_session_results r
          WHERE r.session_id = ${roomSessionParticipants.sessionId} AND r.user_id = ${roomSessionParticipants.userId}
        ), '[]'::json)`,
      })
      .from(roomSessionParticipants)
      .innerJoin(users, eq(users.id, roomSessionParticipants.userId))
      .leftJoin(
        roomMembers,
        and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, roomSessionParticipants.userId)),
      )
      .where(eq(roomSessionParticipants.sessionId, sessionId)),
    settings.tags.length === 0
      ? Promise.resolve([] as { name: string }[])
      : db.select({ name: tags.name }).from(tags).where(inArray(tags.slug, settings.tags)).orderBy(asc(tags.name)),
  ]);

  // Rooms v2 rating slots: only once the session's ratings are applied.
  // The session row already says whether they are (rated_at), so unrated sessions cost no query.
  const ratingView = session.ratedAt ? await loadSessionRatings(db, sessionId) : null;
  const applied = ratingView?.state === "applied" ? ratingView : null;
  const ratingByUser = new Map(applied?.participants.map((r) => [r.userId, r]));
  const ratingByPosition = new Map(applied?.problems.map((r) => [r.position, r]));

  const parsed = participantRows.map((p) => ({
    ...p,
    cells: p.cells.map((c) => ({ ...c, firstAcceptedAt: c.firstAcceptedAt ? new Date(c.firstAcceptedAt) : null })),
  }));
  const first = firstSolvers(parsed.map((p) => ({ userId: p.userId, username: p.username, cells: p.cells })));

  const participants: ResultParticipant[] = parsed
    .map((p) => {
      const byPos = new Map(p.cells.map((c) => [c.position, c]));
      const cells: ResultCell[] = problemRows.map((pr) => {
        const c = byPos.get(pr.position);
        const solved = c?.solveSeconds != null;
        return {
          position: pr.position,
          attempts: c?.attempts ?? 0,
          wrongBefore: c?.wrongBefore ?? 0,
          solveSeconds: c?.solveSeconds ?? null,
          firstSolver: solved && (first.get(pr.position) ?? []).includes(p.userId),
          solvedBefore: c?.solvedBefore ?? false,
          solution: solutionAccess({
            sessionStatus: "finished",
            roomShares: access.roomShareSolutions,
            authorIsMember: p.isMember,
            authorShares: p.shares,
            viewerIsAuthor: p.userId === userId,
            solved: solved && (c?.hasSubmission ?? false),
          }),
        };
      });
      return {
        userId: p.userId,
        username: p.username,
        isMember: p.isMember,
        isViewer: p.userId === userId,
        isHost: p.userId === session.hostId,
        rank: p.rank,
        solvedCount: p.solvedCount,
        penaltySec: p.penaltySec,
        breakdown: penaltyBreakdown(p.cells),
        cells,
        ...ratingChangeFor(ratingByUser.get(p.userId)),
      };
    })
    .sort(
      (a, b) =>
        (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER) ||
        (a.username < b.username ? -1 : a.username > b.username ? 1 : 0),
    );

  const summaries = problemRows.map((pr) =>
    summarizeProblem({
      position: pr.position,
      participants: parsed.map((p) => ({
        userId: p.userId,
        username: p.username,
        cell: p.cells.find((c) => c.position === pr.position) ?? null,
      })),
    }),
  );

  return {
    kind: "finished",
    room: { id: access.roomId, name: access.roomName, shareSolutions: access.roomShareSolutions },
    viewer: {
      userId,
      role: access.role,
      shareSolutions: access.memberShareSolutions,
      isParticipant: participants.some((p) => p.isViewer),
    },
    session: {
      id: session.id,
      startedAt: session.startedAt!.toISOString(),
      endsAt: session.endsAt!.toISOString(),
      endedAt: session.endedAt!.toISOString(),
      endReason: session.endReason as RoomSessionEndReason | null,
      durationMin: session.durationMin,
      runMinutes: sessionRunMinutes(session),
      problemCount: session.problemCount,
      settings,
      host: session.host,
      pendingJudging: session.pending,
    },
    topics: tagRows.map((t) => formatTagLabel(t.name)),
    problems: problemRows.map((p) => {
      const r = ratingByPosition.get(p.position);
      return {
        ...p,
        ...(r && r.before !== null && r.after !== null ? { rating: { before: r.before, after: r.after } } : {}),
      };
    }),
    participants,
    summaries,
  };
}

/** A slot row of the results/history queries (left join on problems) as a result problem. */
export function toResultProblem(r: {
  position: number;
  slug: string | null;
  title: string | null;
  difficulty: Difficulty | null;
  published: boolean | null;
  pinned: boolean;
  externalSlug: string | null;
  externalTitle: string | null;
  externalRating: number | null;
}): ResultProblem {
  if (r.externalSlug !== null) {
    return {
      position: r.position,
      slug: null,
      title: r.externalTitle ?? r.externalSlug,
      difficulty: r.difficulty,
      published: true,
      pinned: false,
      external: { slug: r.externalSlug, rating: r.externalRating },
    };
  }
  return {
    position: r.position,
    slug: r.slug ?? "",
    title: r.title ?? "",
    difficulty: r.difficulty,
    published: r.published ?? false,
    pinned: r.pinned,
  };
}

/** Rating slot of one participant (absent when the session is not rated or the member has no snapshot). */
function ratingChangeFor(
  r: { before: number | null; delta: number | null; expected: number | null; active: boolean } | undefined,
): Pick<ResultParticipant, "ratingChange"> {
  if (!r || r.before === null) return {};
  if (!r.active || r.delta === null) return { ratingChange: null };
  return { ratingChange: { before: r.before, delta: r.delta, expected: r.expected ?? 0 } };
}

// --- Solutions viewer (§4.5) ---

export type SessionSolution = {
  room: { id: string; name: string };
  session: { id: string; startedAt: string };
  author: { userId: string; username: string };
  viewerIsAuthor: boolean;
  position: number;
  problem: { slug: string; title: string; difficulty: Difficulty; published: boolean };
  language: Language;
  code: string;
  runtimeMs: number | null;
  memoryKb: number | null;
  solveSeconds: number;
  wrongBefore: number;
};

export type SolutionTarget = { username: string } | { userId: string };

/**
 * The first accepted submission of one (participant, problem) cell, only if
 * the session is finished and solutionAccess allows it. The submission row is
 * re-checked (accepted submit of that author, problem and session), so a
 * stale or tampered result row can never expose other code.
 */
export async function getSessionSolution(
  db: Db,
  roomId: string,
  sessionId: string,
  viewerId: string,
  target: SolutionTarget,
  rawPosition: string | number,
): Promise<SessionSolution | null> {
  if (!/^[1-8]$/.test(String(rawPosition))) return null;
  const position = Number(rawPosition);
  if (!idSchema.safeParse(sessionId).success) return null;
  if ("username" in target ? !USERNAME_RE.test(target.username) : !idSchema.safeParse(target.userId).success) {
    return null;
  }
  const access = await requireRoomMember(db, roomId, viewerId);
  if (!access) return null;

  const authorFilter = "username" in target ? sql`u.username = ${target.username}` : sql`u.id = ${target.userId}`;
  const { rows } = await db.execute<{
    started_at: Date | string;
    status: string;
    author_id: string;
    username: string;
    is_member: boolean;
    shares: boolean;
    slug: string;
    title: string;
    difficulty: Difficulty;
    published: boolean;
    language: Language;
    code: string;
    runtime_ms: number | null;
    memory_kb: number | null;
    solve_seconds: number;
    wrong_before: number;
  }>(sql`
    SELECT s.started_at, s.status, u.id AS author_id, u.username,
           (m.user_id IS NOT NULL) AS is_member, coalesce(m.share_solutions, false) AS shares,
           pr.slug, pr.title, sp.difficulty, pr.published,
           sub.language, sub.code, sub.runtime_ms, sub.memory_kb,
           res.solve_seconds, res.wrong_before_accept AS wrong_before
    FROM room_sessions s
    JOIN room_session_participants p ON p.session_id = s.id
    JOIN users u ON u.id = p.user_id AND ${authorFilter}
    JOIN room_session_results res
      ON res.session_id = s.id AND res.user_id = p.user_id AND res.position = ${position}
         AND res.first_accepted_submission_id IS NOT NULL AND res.solve_seconds IS NOT NULL
    JOIN room_session_problems sp ON sp.session_id = s.id AND sp.position = res.position
    JOIN problems pr ON pr.id = sp.problem_id
    JOIN submissions sub
      ON sub.id = res.first_accepted_submission_id AND sub.user_id = p.user_id
         AND sub.problem_id = sp.problem_id AND sub.room_session_id = s.id
         AND sub.kind = 'submit' AND sub.status = 'accepted'
    LEFT JOIN room_members m ON m.room_id = s.room_id AND m.user_id = p.user_id
    WHERE s.id = ${sessionId} AND s.room_id = ${roomId}
    LIMIT 1
  `);
  const row = rows[0];
  if (!row) return null;
  const allowed = solutionAccess({
    sessionStatus: row.status as "finished",
    roomShares: access.roomShareSolutions,
    authorIsMember: row.is_member,
    authorShares: row.shares,
    viewerIsAuthor: row.author_id === viewerId,
    solved: true,
  });
  if (!allowed.visible) return null;
  return {
    room: { id: access.roomId, name: access.roomName },
    session: { id: sessionId, startedAt: new Date(row.started_at).toISOString() },
    author: { userId: row.author_id, username: row.username },
    viewerIsAuthor: row.author_id === viewerId,
    position,
    problem: { slug: row.slug, title: row.title, difficulty: row.difficulty, published: row.published },
    language: row.language,
    code: row.code,
    runtimeMs: row.runtime_ms === null ? null : Number(row.runtime_ms),
    memoryKb: row.memory_kb === null ? null : Number(row.memory_kb),
    solveSeconds: Number(row.solve_seconds),
    wrongBefore: Number(row.wrong_before),
  };
}
