// Server data of the R4 screens (docs/specs/rooms.md §7.4): the session
// screen (lobby / live / finished / cancelled), the open-session card on the
// room page and the session banner on the problem page. Every read starts at
// the membership gate; a non-member gets null (the page answers 404 or shows
// nothing).
import { and, asc, eq, sql } from "drizzle-orm";

import type { LobbyView } from "@/lib/rooms/session-view";
import type { RoomRole, RoomSessionEndReason, RoomSessionStatus } from "@/lib/rooms/types";
import type { Db } from "@/server/db";
import { problems, problemTags, tags } from "@/server/db/schema";

import { requireRoomMember, requireSessionInRoom } from "./access";
import { buildLobbyView } from "./draw";
import { closeIfDue } from "./lifecycle";
import { canManageSession } from "@/lib/rooms/session-state";
import { computeSessionState, type SessionStateResponse } from "./state";

export type SessionTag = { slug: string; name: string; count: number };

export type SessionPageData = {
  room: { id: string; name: string; role: RoomRole };
  session: {
    id: string;
    status: RoomSessionStatus;
    durationMin: number;
    problemCount: number;
    createdAt: string;
    plannedFor: string | null;
    startedAt: string | null;
    endsAt: string | null;
    endedAt: string | null;
    endReason: RoomSessionEndReason | null;
  };
  viewerId: string;
  /** First state response (no cursor → full snapshot). */
  state: SessionStateResponse;
  /** Lobby only. */
  lobby: LobbyView | null;
  /** Lobby only: topics with their published problem counts. */
  tags: SessionTag[];
};

/** Published-problem counts per tag, for the topics filter. */
export async function listSessionTags(db: Pick<Db, "select">): Promise<SessionTag[]> {
  const rows = await db
    .select({ slug: tags.slug, name: tags.name, count: sql<number>`count(${problems.id})::int` })
    .from(tags)
    .innerJoin(problemTags, eq(problemTags.tagId, tags.id))
    .innerJoin(problems, and(eq(problems.id, problemTags.problemId), eq(problems.published, true)))
    .groupBy(tags.slug, tags.name)
    .orderBy(asc(tags.name));
  return rows;
}

/**
 * Session screen. Queries for a live or finished session: membership (1),
 * session row (1), state gate (1), snapshot (2), plus the signed-in user read
 * by the page (1) = 6 (AC-S-HIS-2 target). The lobby adds the lobby view and
 * the tag list.
 */
export async function getSessionPageData(
  db: Db,
  roomId: string,
  sessionId: string,
  userId: string,
): Promise<SessionPageData | null> {
  const access = await requireRoomMember(db, roomId, userId);
  if (!access) return null;
  let row = await requireSessionInRoom(db, roomId, sessionId);
  if (!row) return null;
  const state = await computeSessionState(db, roomId, sessionId, userId);
  if (!state) return null;
  if (state.status !== row.status) row = (await requireSessionInRoom(db, roomId, sessionId)) ?? row;

  let lobby: LobbyView | null = null;
  let tagList: SessionTag[] = [];
  if (row.status === "lobby") {
    const canManage = canManageSession({ userId, role: access.role }, row);
    lobby = await db.transaction(async (tx) => {
      // Same lazy close as GET …/lobby, so a stale lobby reads as cancelled.
      if (await closeIfDue(tx, sessionId)) return null;
      const fresh = (await requireSessionInRoom(tx, roomId, sessionId))!;
      return buildLobbyView(tx, fresh, canManage);
    });
    tagList = await listSessionTags(db);
  }

  return {
    room: { id: access.roomId, name: access.roomName, role: access.role },
    session: {
      id: row.id,
      status: state.status,
      durationMin: row.durationMin,
      problemCount: row.problemCount,
      createdAt: row.createdAt.toISOString(),
      plannedFor: row.plannedFor?.toISOString() ?? null,
      startedAt: row.startedAt?.toISOString() ?? null,
      endsAt: row.endsAt?.toISOString() ?? null,
      endedAt: row.endedAt?.toISOString() ?? null,
      endReason: (row.endReason as RoomSessionEndReason | null) ?? null,
    },
    viewerId: userId,
    state,
    lobby,
    tags: tagList,
  };
}

export type OpenSessionSummary = {
  id: string;
  status: "lobby" | "live";
  problemCount: number;
  durationMin: number;
  plannedFor: string | null;
  endsAt: string | null;
  serverNow: string;
  participants: number;
  joined: boolean;
  hostName: string | null;
};

/** The room's open (lobby/live) session for the room page card, in one query. */
export async function getOpenSessionSummary(db: Db, roomId: string, userId: string): Promise<OpenSessionSummary | null> {
  const { rows } = await db.execute<{
    id: string;
    status: "lobby" | "live";
    problem_count: number;
    duration_min: number;
    planned_for: Date | string | null;
    ends_at: Date | string | null;
    now: Date | string;
    participants: number;
    joined: boolean;
    host_name: string | null;
  }>(sql`
    SELECT s.id, s.status, s.problem_count, s.duration_min, s.planned_for, s.ends_at, clock_timestamp() AS now,
      (SELECT count(*)::int FROM room_session_participants p WHERE p.session_id = s.id) AS participants,
      EXISTS (SELECT 1 FROM room_session_participants p WHERE p.session_id = s.id AND p.user_id = ${userId}) AS joined,
      (SELECT u.username FROM users u WHERE u.id = s.host_id) AS host_name
    FROM room_sessions s
    JOIN room_members m ON m.room_id = s.room_id AND m.user_id = ${userId}
    WHERE s.room_id = ${roomId} AND s.status IN ('lobby', 'live')
      AND NOT (s.status = 'live' AND s.ends_at <= clock_timestamp())
    LIMIT 1
  `);
  const r = rows[0];
  if (!r) return null;
  const iso = (v: Date | string | null) => (v === null ? null : new Date(v).toISOString());
  return {
    id: r.id,
    status: r.status,
    problemCount: Number(r.problem_count),
    durationMin: Number(r.duration_min),
    plannedFor: iso(r.planned_for),
    endsAt: iso(r.ends_at),
    serverNow: new Date(r.now).toISOString(),
    participants: Number(r.participants),
    joined: r.joined,
    hostName: r.host_name,
  };
}

export type ProblemSessionContext = {
  sessionId: string;
  roomId: string;
  roomName: string;
  status: "live" | "finished";
  position: number;
  problemCount: number;
  /** Slugs by position (titles are public once the session started). */
  slugs: string[];
  endsAt: string;
  serverNow: string;
  isParticipant: boolean;
  /** True when the context came from `?session=`, false when it was found automatically. */
  explicit: boolean;
};

/**
 * Session banner on the problem page: one query. With `?session=<id>` it is
 * that session (live or finished, the viewer a member, this problem in it).
 * Without it, the most recent live session this problem belongs to in which
 * the viewer is a participant. Anyone else gets null (no banner).
 */
export async function getProblemSessionContext(
  db: Db,
  slug: string,
  userId: string,
  requestedSessionId: string | null,
): Promise<ProblemSessionContext | null> {
  const explicit = requestedSessionId !== null && /^[0-9a-f-]{36}$/i.test(requestedSessionId);
  if (requestedSessionId !== null && !explicit) return null;
  const { rows } = await db.execute<{
    session_id: string;
    room_id: string;
    room_name: string;
    status: "live" | "finished";
    position: number;
    problem_count: number;
    slugs: string[];
    ends_at: Date | string;
    now: Date | string;
    is_participant: boolean;
  }>(sql`
    SELECT s.id AS session_id, s.room_id, r.name AS room_name, s.status, sp.position, s.problem_count,
      ARRAY(SELECT p2.slug FROM room_session_problems sp2 JOIN problems p2 ON p2.id = sp2.problem_id
            WHERE sp2.session_id = s.id ORDER BY sp2.position) AS slugs,
      s.ends_at, clock_timestamp() AS now,
      (rp.user_id IS NOT NULL) AS is_participant
    FROM problems pr
    JOIN room_session_problems sp ON sp.problem_id = pr.id
    JOIN room_sessions s ON s.id = sp.session_id
    JOIN room_members m ON m.room_id = s.room_id AND m.user_id = ${userId}
    JOIN rooms r ON r.id = s.room_id
    LEFT JOIN room_session_participants rp ON rp.session_id = s.id AND rp.user_id = ${userId}
    WHERE pr.slug = ${slug} AND pr.published
      AND ${
        explicit
          ? sql`s.id = ${requestedSessionId} AND s.status IN ('live', 'finished')`
          : sql`s.status = 'live' AND s.ends_at > clock_timestamp() AND rp.user_id IS NOT NULL`
      }
    ORDER BY s.started_at DESC
    LIMIT 1
  `);
  const r = rows[0];
  if (!r) return null;
  // A live session past its end reads as finished (the next state poll closes it).
  const now = new Date(r.now);
  const endsAt = new Date(r.ends_at);
  const status = r.status === "live" && endsAt <= now ? "finished" : r.status;
  return {
    sessionId: r.session_id,
    roomId: r.room_id,
    roomName: r.room_name,
    status,
    position: Number(r.position),
    problemCount: Number(r.problem_count),
    slugs: r.slugs,
    endsAt: endsAt.toISOString(),
    serverNow: now.toISOString(),
    isParticipant: r.is_participant,
    explicit,
  };
}
