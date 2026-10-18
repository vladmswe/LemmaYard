// Rooms, invites and membership (docs/specs/rooms.md §1.2 steps 1–3, §7.2,
// §8.1). Route handlers in src/app/api/rooms/** are one-line calls into this
// file. Locks: create/join take the user lock first, then (join only) the room
// lock; every other mutation takes only the room lock, so no lock cycle exists.
import { and, count, eq, gt, ne, sql } from "drizzle-orm";
import type { NextResponse } from "next/server";
import { z } from "zod";

import {
  generateInviteToken,
  hashInviteToken,
  inviteUrl,
  isInviteTokenFormat,
} from "@/lib/rooms/invite";
import { createRoomV2BodySchema } from "@/lib/rooms/room-defaults";
import {
  confirmsRoomName,
  deleteRoomBodySchema,
  emptyBodySchema,
  inviteBodySchema,
  joinBodySchema,
  MAX_MEMBERSHIPS,
  MAX_OWNED_ROOMS,
  MAX_ROOM_MEMBERS,
  renameRoomBodySchema,
  ROOM_CREATES_PER_HOUR,
  shareSolutionsBodySchema,
} from "@/lib/rooms/schemas";
import type { Db } from "@/server/db";
import { roomMembers, rooms, users } from "@/server/db/schema";
import { getEnv } from "@/server/env";
import { jsonError } from "@/server/http/request";
import { clientAddress, createRateLimiter } from "@/server/http/rate-limit";

import { json, readAuthedBody, roomMutation, tooMany } from "./http";
import { lockRoom, lockRoomUser, type Tx } from "./queries";
import { ensureMemberRatings } from "./ratings";

export const INVITE_INVALID = "This invite link is invalid or has expired. Ask the room owner for a new one.";
export const MEMBER_NOT_FOUND = "Member not found";
const HOUR_MS = 60 * 60 * 1000;

/** §8.5: 20 rotations per room per day (in-process, soft). */
export const inviteRotationLimiter = createRateLimiter({ limit: 20, windowMs: 24 * HOUR_MS });
/** §7.2: 20 failed join/preview attempts per user per hour (in-process, soft). */
export const joinUserLimiter = createRateLimiter({ limit: 20, windowMs: HOUR_MS });
/** Second key per client address, so many fresh accounts on one host cannot probe in parallel. */
export const joinAddressLimiter = createRateLimiter({ limit: 60, windowMs: HOUR_MS });

const userIdSchema = z.uuid();

// --- POST /api/rooms ------------------------------------------------------

export async function createRoom(request: Request): Promise<NextResponse> {
  const pre = await readAuthedBody(request, createRoomV2BodySchema);
  if ("response" in pre) return pre.response;
  const { user, data, db } = pre;

  return db.transaction(async (tx) => {
    await lockRoomUser(tx, user.id);
    const [counts] = await tx
      .select({
        memberships: count(),
        owned: sql<number>`count(*) FILTER (WHERE ${roomMembers.role} = 'owner')::int`,
      })
      .from(roomMembers)
      .where(eq(roomMembers.userId, user.id));
    if (counts.owned >= MAX_OWNED_ROOMS) {
      return jsonError(409, `You can own at most ${MAX_OWNED_ROOMS} rooms. Delete one or transfer ownership first.`);
    }
    if (counts.memberships >= MAX_MEMBERSHIPS) {
      return jsonError(409, `You can be in at most ${MAX_MEMBERSHIPS} rooms. Leave one first.`);
    }
    // DB count (§8.5): 5 creates per hour; Retry-After = when the oldest leaves the window.
    const [recent] = await tx
      .select({
        count: count(),
        retryAfterSec: sql<number | null>`ceil(extract(epoch from (min(${rooms.createdAt}) + interval '1 hour' - now())))::int`,
      })
      .from(rooms)
      .where(and(eq(rooms.createdBy, user.id), gt(rooms.createdAt, sql`now() - interval '1 hour'`)));
    if (recent.count >= ROOM_CREATES_PER_HOUR) {
      const retryAfterSec = Math.min(3600, Math.max(1, recent.retryAfterSec ?? 60));
      return tooMany("You have created too many rooms recently. Try again later.", retryAfterSec);
    }
    const [room] = await tx
      .insert(rooms)
      .values({
        name: data.name,
        createdBy: user.id,
        // v2 §10: optional profile fields; an empty description is no description.
        ...(data.description ? { description: data.description } : {}),
        ...(data.color !== undefined ? { color: data.color } : {}),
      })
      .returning({ id: rooms.id });
    await tx.insert(roomMembers).values({ roomId: room.id, userId: user.id, role: "owner" });
    await ensureMemberRatings(tx, room.id, [user.id]);
    return json({ id: room.id }, 201);
  });
}

// --- Owner settings -------------------------------------------------------

export function renameRoom(request: Request, roomId: string) {
  return roomMutation(request, roomId, renameRoomBodySchema, { ownerOnly: true }, async ({ tx, data }) => {
    await tx.update(rooms).set({ name: data.name }).where(eq(rooms.id, roomId));
    return json({ name: data.name });
  });
}

export function updateRoomSettings(request: Request, roomId: string) {
  return roomMutation(request, roomId, shareSolutionsBodySchema, { ownerOnly: true }, async ({ tx, data }) => {
    await tx.update(rooms).set({ shareSolutions: data.shareSolutions }).where(eq(rooms.id, roomId));
    return json({ shareSolutions: data.shareSolutions });
  });
}

export function deleteRoom(request: Request, roomId: string) {
  return roomMutation(request, roomId, deleteRoomBodySchema, { ownerOnly: true }, async ({ tx, access, data }) => {
    if (!confirmsRoomName(data.confirmName, access.roomName)) {
      return jsonError(400, "Type the room name exactly to confirm", {
        confirmName: "Type the room name exactly to confirm",
      });
    }
    // Cascades members, sessions, results and events; sets submissions.room_session_id NULL.
    await tx.delete(rooms).where(eq(rooms.id, roomId));
    return json({ deleted: true });
  });
}

// --- Invite link ----------------------------------------------------------

export function manageInvite(request: Request, roomId: string) {
  return roomMutation(request, roomId, inviteBodySchema, { ownerOnly: true }, async ({ tx, data }) => {
    if (data.action === "disable") {
      await tx.update(rooms).set({ inviteTokenHash: null, inviteExpiresAt: null }).where(eq(rooms.id, roomId));
      return json({});
    }
    const limited = inviteRotationLimiter.hit(roomId);
    if (!limited.ok) {
      return tooMany("Too many new links today. Try again tomorrow.", limited.retryAfterSec);
    }
    const token = generateInviteToken();
    const [row] = await tx
      .update(rooms)
      .set({
        inviteTokenHash: await hashInviteToken(token),
        inviteExpiresAt: sql`now() + make_interval(days => ${data.expiresInDays}::int)`,
      })
      .where(eq(rooms.id, roomId))
      .returning({ expiresAt: rooms.inviteExpiresAt });
    // The only response that ever carries the token (§8.1).
    return json({ url: inviteUrl(getEnv().AUTH_URL, token), expiresAt: row.expiresAt!.toISOString() });
  });
}

/** Q12: the room behind an active invite, or null (unknown, expired, rotated, off). */
async function findInviteRoom(db: Db | Tx, token: string, roomId?: string) {
  // Hash even a malformed token so both paths cost the same.
  const hash = await hashInviteToken(token);
  if (!isInviteTokenFormat(token)) return null;
  const [room] = await db
    .select({ id: rooms.id, name: rooms.name, shareSolutions: rooms.shareSolutions })
    .from(rooms)
    .where(
      and(
        eq(rooms.inviteTokenHash, hash),
        gt(rooms.inviteExpiresAt, sql`now()`),
        roomId ? eq(rooms.id, roomId) : undefined,
      ),
    )
    .limit(1);
  return room ?? null;
}

function joinLimitKeys(request: Request, userId: string) {
  const address = clientAddress(request);
  return { user: `u:${userId}`, address: address ? `a:${address}` : null };
}

/** 429 before any lookup, so a blocked client learns nothing about tokens. */
function checkJoinLimits(keys: ReturnType<typeof joinLimitKeys>): NextResponse | null {
  for (const [limiter, key] of [
    [joinUserLimiter, keys.user],
    [joinAddressLimiter, keys.address],
  ] as const) {
    if (!key) continue;
    const result = limiter.check(key);
    if (!result.ok) {
      return tooMany(
        `Too many invite attempts. Try again in ${Math.ceil(result.retryAfterSec / 60)} min.`,
        result.retryAfterSec,
      );
    }
  }
  return null;
}

function invalidInvite(keys: ReturnType<typeof joinLimitKeys>): NextResponse {
  joinUserLimiter.record(keys.user);
  if (keys.address) joinAddressLimiter.record(keys.address);
  return jsonError(404, INVITE_INVALID);
}

/** POST /api/rooms/join/preview → `{name, memberCount, memberNames, shareSolutions, alreadyMember}`. */
export async function previewInvite(request: Request): Promise<NextResponse> {
  const pre = await readAuthedBody(request, joinBodySchema);
  if ("response" in pre) return pre.response;
  const { user, data, db } = pre;
  const keys = joinLimitKeys(request, user.id);
  const blocked = checkJoinLimits(keys);
  if (blocked) return blocked;

  const room = await findInviteRoom(db, data.token);
  if (!room) return invalidInvite(keys);

  const members = await db
    .select({ userId: roomMembers.userId, username: users.username })
    .from(roomMembers)
    .innerJoin(users, eq(users.id, roomMembers.userId))
    .where(eq(roomMembers.roomId, room.id))
    .orderBy(roomMembers.joinedAt, users.username);
  const alreadyMember = members.some((m) => m.userId === user.id);
  return json({
    name: room.name,
    memberCount: members.length,
    memberNames: members.slice(0, 5).map((m) => m.username),
    shareSolutions: room.shareSolutions,
    alreadyMember,
    // The id only to people who can already open the room.
    ...(alreadyMember ? { roomId: room.id } : {}),
  });
}

/** POST /api/rooms/join → 200 `{roomId}`; idempotent for members. */
export async function joinRoom(request: Request): Promise<NextResponse> {
  const pre = await readAuthedBody(request, joinBodySchema);
  if ("response" in pre) return pre.response;
  const { user, data, db } = pre;
  const keys = joinLimitKeys(request, user.id);
  const blocked = checkJoinLimits(keys);
  if (blocked) return blocked;

  const candidate = await findInviteRoom(db, data.token);
  if (!candidate) return invalidInvite(keys);

  const outcome = await db.transaction(async (tx) => {
    await lockRoomUser(tx, user.id);
    await lockRoom(tx, candidate.id);
    // Re-check under the room lock: a rotation or turn-off that committed
    // first wins, so the old token can never add a member afterwards.
    const room = await findInviteRoom(tx, data.token, candidate.id);
    if (!room) return { kind: "invalid" } as const;

    const [existing] = await tx
      .select({ userId: roomMembers.userId })
      .from(roomMembers)
      .where(and(eq(roomMembers.roomId, room.id), eq(roomMembers.userId, user.id)))
      .limit(1);
    if (existing) return { kind: "ok", roomId: room.id } as const;

    const [{ members }] = await tx
      .select({ members: count() })
      .from(roomMembers)
      .where(eq(roomMembers.roomId, room.id));
    if (members >= MAX_ROOM_MEMBERS) return { kind: "full" } as const;
    const [{ memberships }] = await tx
      .select({ memberships: count() })
      .from(roomMembers)
      .where(eq(roomMembers.userId, user.id));
    if (memberships >= MAX_MEMBERSHIPS) return { kind: "too_many_rooms" } as const;

    await tx.insert(roomMembers).values({ roomId: room.id, userId: user.id, role: "member" });
    // v2 §6.4: the starting rating is seeded when joining the room.
    await ensureMemberRatings(tx, room.id, [user.id]);
    return { kind: "ok", roomId: room.id } as const;
  });

  switch (outcome.kind) {
    case "invalid":
      return invalidInvite(keys);
    case "full":
      return jsonError(409, `This room is full (${MAX_ROOM_MEMBERS} members).`);
    case "too_many_rooms":
      return jsonError(409, `You can be in at most ${MAX_MEMBERSHIPS} rooms. Leave one first.`);
    case "ok":
      return json({ roomId: outcome.roomId });
  }
}

// --- Leaving and member management ----------------------------------------

export function leaveRoom(request: Request, roomId: string) {
  return roomMutation(request, roomId, emptyBodySchema, { ownerOnly: false }, async ({ tx, user, access }) => {
    const [{ members }] = await tx
      .select({ members: count() })
      .from(roomMembers)
      .where(eq(roomMembers.roomId, roomId));
    if (members <= 1) {
      // The last member: leaving deletes the room (the UI confirms by name).
      await tx.delete(rooms).where(eq(rooms.id, roomId));
      return json({ deleted: true });
    }
    if (access.role === "owner") return jsonError(409, "Transfer ownership first");
    await tx
      .delete(roomMembers)
      .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, user.id)));
    return json({ deleted: false });
  });
}

async function findMember(tx: Tx, roomId: string, userId: string) {
  if (!userIdSchema.safeParse(userId).success) return null;
  const [row] = await tx
    .select({ userId: roomMembers.userId, role: roomMembers.role })
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)))
    .limit(1);
  return row ?? null;
}

export function removeMember(request: Request, roomId: string, targetUserId: string) {
  return roomMutation(request, roomId, emptyBodySchema, { ownerOnly: true }, async ({ tx, user }) => {
    if (targetUserId === user.id) return jsonError(400, "Use Leave room to leave the room yourself");
    const target = await findMember(tx, roomId, targetUserId);
    if (!target) return jsonError(404, MEMBER_NOT_FOUND);
    await tx
      .delete(roomMembers)
      .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, targetUserId)));
    return json({});
  });
}

export function makeOwner(request: Request, roomId: string, targetUserId: string) {
  return roomMutation(request, roomId, emptyBodySchema, { ownerOnly: true }, async ({ tx, user }) => {
    if (targetUserId === user.id) return jsonError(400, "You are already the owner");
    const target = await findMember(tx, roomId, targetUserId);
    if (!target) return jsonError(404, MEMBER_NOT_FOUND);
    // Demote first: the partial unique index allows one owner at a time.
    await tx
      .update(roomMembers)
      .set({ role: "member" })
      .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.role, "owner"), ne(roomMembers.userId, targetUserId)));
    await tx
      .update(roomMembers)
      .set({ role: "owner" })
      .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, targetUserId)));
    return json({});
  });
}

export function updateMySettings(request: Request, roomId: string) {
  return roomMutation(request, roomId, shareSolutionsBodySchema, { ownerOnly: false }, async ({ tx, user, data }) => {
    await tx
      .update(roomMembers)
      .set({ shareSolutions: data.shareSolutions })
      .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, user.id)));
    return json({ shareSolutions: data.shareSolutions });
  });
}
