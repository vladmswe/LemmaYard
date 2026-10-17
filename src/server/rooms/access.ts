// Membership gate for every room read and write (docs/specs/rooms.md §7.1,
// §8.2). Callers turn `null` into 404 (never 403), so a non-member cannot
// tell a room exists. Malformed ids are null as well.
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import type { RoomRole } from "@/lib/rooms/types";
import type { Db } from "@/server/db";
import { roomMembers, rooms, roomSessions } from "@/server/db/schema";

const idSchema = z.uuid();

/** Drizzle client or transaction. */
type Executor = Pick<Db, "select">;

export type RoomAccess = {
  roomId: string;
  roomName: string;
  userId: string;
  role: RoomRole;
  /** Room-level sharing setting. */
  roomShareSolutions: boolean;
  /** This member's own opt-out flag. */
  memberShareSolutions: boolean;
};

/** Q0 merged with the room read: the caller's membership, or null. */
export async function requireRoomMember(
  db: Executor,
  roomId: string,
  userId: string,
): Promise<RoomAccess | null> {
  if (!idSchema.safeParse(roomId).success || !idSchema.safeParse(userId).success) return null;
  const [row] = await db
    .select({
      roomId: rooms.id,
      roomName: rooms.name,
      userId: roomMembers.userId,
      role: roomMembers.role,
      roomShareSolutions: rooms.shareSolutions,
      memberShareSolutions: roomMembers.shareSolutions,
    })
    .from(roomMembers)
    .innerJoin(rooms, eq(rooms.id, roomMembers.roomId))
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)))
    .limit(1);
  return row ?? null;
}

export type RoomSessionRow = typeof roomSessions.$inferSelect;

/**
 * The session only if it belongs to `roomId` (IDOR guard: a session id of
 * another room is null). Call after `requireRoomMember`.
 */
export async function requireSessionInRoom(
  db: Executor,
  roomId: string,
  sessionId: string,
): Promise<RoomSessionRow | null> {
  if (!idSchema.safeParse(roomId).success || !idSchema.safeParse(sessionId).success) return null;
  const [row] = await db
    .select()
    .from(roomSessions)
    .where(and(eq(roomSessions.id, sessionId), eq(roomSessions.roomId, roomId)))
    .limit(1);
  return row ?? null;
}
