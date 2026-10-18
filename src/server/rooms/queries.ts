// Room reads for the pages and the GET routes (docs/specs/rooms.md §6.5 Q0,
// Q1). Every function that takes a roomId goes through requireRoomMember
// first and returns null for non-members (the caller answers 404). The
// invite token is never read back: only whether a link is active and until when.
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { roomDefaultsView, type RoomDefaultsView } from "@/lib/rooms/room-defaults";
import type { RoomRole, RoomSessionStatus } from "@/lib/rooms/types";
import type { Db } from "@/server/db";
import { roomMembers, rooms, roomSessions, users } from "@/server/db/schema";

import { requireRoomMember } from "./access";
import { memberRatingView, type MemberRatingView } from "./ratings";

/** Members shown on a room card before "+N". */
export const CARD_MEMBER_PREVIEW = 5;

export type RoomListItem = {
  id: string;
  name: string;
  role: RoomRole;
  joinedAt: string;
  memberCount: number;
  /** Earliest members first, at most CARD_MEMBER_PREVIEW. */
  memberNames: string[];
  /** `minutesLeft` (DB clock) only while a live session has time left. */
  openSession: { status: Extract<RoomSessionStatus, "lobby" | "live">; minutesLeft: number | null } | null;
  lastSessionAt: string | null;
};

/** Q1: the viewer's rooms, most recently joined first. */
export async function listMyRooms(db: Db, userId: string): Promise<RoomListItem[]> {
  const mine = await db
    .select({ id: rooms.id, name: rooms.name, role: roomMembers.role, joinedAt: roomMembers.joinedAt })
    .from(roomMembers)
    .innerJoin(rooms, eq(rooms.id, roomMembers.roomId))
    .where(eq(roomMembers.userId, userId))
    .orderBy(desc(roomMembers.joinedAt), asc(rooms.id));
  if (mine.length === 0) return [];
  const ids = mine.map((r) => r.id);

  const [members, open, last] = await Promise.all([
    db
      .select({ roomId: roomMembers.roomId, username: users.username })
      .from(roomMembers)
      .innerJoin(users, eq(users.id, roomMembers.userId))
      .where(inArray(roomMembers.roomId, ids))
      .orderBy(asc(roomMembers.joinedAt), asc(users.username)),
    db
      .select({
        roomId: roomSessions.roomId,
        status: roomSessions.status,
        minutesLeft: sql<number | null>`CASE WHEN ${roomSessions.endsAt} > now()
          THEN ceil(extract(epoch from (${roomSessions.endsAt} - now())) / 60)::int END`,
      })
      .from(roomSessions)
      .where(and(inArray(roomSessions.roomId, ids), inArray(roomSessions.status, ["lobby", "live"]))),
    db
      .select({ roomId: roomSessions.roomId, at: sql<Date>`max(${roomSessions.startedAt})` })
      .from(roomSessions)
      .where(and(inArray(roomSessions.roomId, ids), eq(roomSessions.status, "finished")))
      .groupBy(roomSessions.roomId),
  ]);

  const namesByRoom = new Map<string, string[]>();
  for (const m of members) namesByRoom.set(m.roomId, [...(namesByRoom.get(m.roomId) ?? []), m.username]);
  const openByRoom = new Map(open.map((s) => [s.roomId, s]));
  const lastByRoom = new Map(last.map((s) => [s.roomId, s.at]));

  return mine.map((r) => {
    const names = namesByRoom.get(r.id) ?? [];
    const session = openByRoom.get(r.id);
    const lastAt = lastByRoom.get(r.id);
    return {
      id: r.id,
      name: r.name,
      role: r.role,
      joinedAt: r.joinedAt.toISOString(),
      memberCount: names.length,
      memberNames: names.slice(0, CARD_MEMBER_PREVIEW),
      openSession: session
        ? {
            status: session.status as "lobby" | "live",
            minutesLeft: session.minutesLeft,
          }
        : null,
      lastSessionAt: lastAt ? new Date(lastAt).toISOString() : null,
    };
  });
}

export type RoomMemberItem = {
  userId: string;
  username: string;
  role: RoomRole;
  joinedAt: string;
  /** Rooms v2 (D2/D3): the member's rating in THIS room, visible to every member of it. */
  rating: MemberRatingView;
};

export type RoomDetail = {
  room: { id: string; name: string; shareSolutions: boolean; createdAt: string } & RoomDefaultsView;
  viewer: { userId: string; role: RoomRole; shareSolutions: boolean };
  /** Owner first, then by join time. */
  members: RoomMemberItem[];
  /** Owner only; never the token or its hash. */
  invite: { active: boolean; expiresAt: string | null } | null;
};

/**
 * Lazy repair (§6.2 notes): when the owner's account was deleted the room has
 * no owner; the earliest-joined member is promoted. Runs under the room lock.
 */
export async function ensureRoomOwner(db: Db, roomId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await lockRoom(tx, roomId);
    const [owner] = await tx
      .select({ userId: roomMembers.userId })
      .from(roomMembers)
      .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.role, "owner")))
      .limit(1);
    if (owner) return;
    const [first] = await tx
      .select({ userId: roomMembers.userId })
      .from(roomMembers)
      .where(eq(roomMembers.roomId, roomId))
      .orderBy(asc(roomMembers.joinedAt), asc(roomMembers.userId))
      .limit(1);
    if (!first) {
      await tx.delete(rooms).where(eq(rooms.id, roomId));
      return;
    }
    await tx
      .update(roomMembers)
      .set({ role: "owner" })
      .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, first.userId)));
  });
}

/** Room page / GET /api/rooms/:roomId. Null for non-members and unknown ids. */
export async function getRoomDetail(db: Db, roomId: string, userId: string): Promise<RoomDetail | null> {
  const access = await requireRoomMember(db, roomId, userId);
  if (!access) return null;

  let members = await loadMembers(db, roomId);
  if (!members.some((m) => m.role === "owner")) {
    await ensureRoomOwner(db, roomId);
    members = await loadMembers(db, roomId);
  }
  const viewer = members.find((m) => m.userId === userId);
  if (!viewer) return null;

  const [room] = await db
    .select({
      id: rooms.id,
      name: rooms.name,
      shareSolutions: rooms.shareSolutions,
      createdAt: rooms.createdAt,
      expiresAt: rooms.inviteExpiresAt,
      active: sql<boolean>`(${rooms.inviteTokenHash} IS NOT NULL AND ${rooms.inviteExpiresAt} > now())`,
      description: rooms.description,
      color: rooms.color,
      presets: rooms.presets,
      defaultPresetId: rooms.defaultPresetId,
      schedule: rooms.schedule,
    })
    .from(rooms)
    .where(eq(rooms.id, roomId))
    .limit(1);
  if (!room) return null;

  return {
    room: {
      id: room.id,
      name: room.name,
      shareSolutions: room.shareSolutions,
      createdAt: room.createdAt.toISOString(),
      ...roomDefaultsView(room),
    },
    viewer: { userId, role: viewer.role, shareSolutions: access.memberShareSolutions },
    members,
    invite:
      viewer.role === "owner"
        ? { active: room.active, expiresAt: room.active && room.expiresAt ? room.expiresAt.toISOString() : null }
        : null,
  };
}

async function loadMembers(db: Db, roomId: string): Promise<RoomMemberItem[]> {
  const rows = await db
    .select({
      userId: roomMembers.userId,
      username: users.username,
      role: roomMembers.role,
      joinedAt: roomMembers.joinedAt,
      rating: roomMembers.rating,
      ratedPairs: roomMembers.ratedPairs,
      ratedSessions: roomMembers.ratedSessions,
      ratingSource: roomMembers.ratingSource,
    })
    .from(roomMembers)
    .innerJoin(users, eq(users.id, roomMembers.userId))
    .where(eq(roomMembers.roomId, roomId))
    .orderBy(sql`${roomMembers.role} = 'owner' DESC`, asc(roomMembers.joinedAt), asc(users.username));
  return rows.map((r) => ({
    userId: r.userId,
    username: r.username,
    role: r.role,
    joinedAt: r.joinedAt.toISOString(),
    rating: memberRatingView(r),
  }));
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Serializes membership changes of one room (joins, leaves, transfers, rotation). */
export async function lockRoom(tx: Tx, roomId: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`room:${roomId}`}))`);
}

/** Serializes one user's room creates and joins (caps on owned rooms and memberships). */
export async function lockRoomUser(tx: Tx, userId: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`room-user:${userId}`}))`);
}

export type { Tx };
