// Shared steps of every room route (docs/specs/rooms.md §7.1, PLAN §6):
// (1) Content-Type + Origin → 403, (2) session → 401, (3) body ≤ 4 KB + strict
// Zod → 413/400, (5) membership → 404 (never 403), role → 403; then the
// handler runs (state 409, rate 429, write) inside one transaction that holds
// the room lock, so membership is re-checked against concurrent changes.
import { NextResponse } from "next/server";
import type { z } from "zod";

import { ROOM_BODY_MAX_BYTES } from "@/lib/rooms/schemas";
import { getCurrentUser, type SessionUser } from "@/server/auth/session";
import { getDb, type Db } from "@/server/db";
import { assertSameOrigin, jsonError, readJsonBody } from "@/server/http/request";

import { requireRoomMember, type RoomAccess } from "./access";
import { lockRoom, type Tx } from "./queries";

export const ROOM_NOT_FOUND = "Room not found";
export const OWNER_ONLY = "Only the room owner can do this";
export const SIGN_IN_REQUIRED = "Log in to continue";

/** 404 with the exact body of an unknown id (AC-S-SEC-1). */
export function roomNotFound(): NextResponse {
  return jsonError(404, ROOM_NOT_FOUND);
}

export function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export function tooMany(message: string, retryAfterSec: number): NextResponse {
  const response = jsonError(429, message);
  response.headers.set("Retry-After", String(retryAfterSec));
  return response;
}

/** Steps 1–3 for routes that are not scoped to one room (create, join). */
export async function readAuthedBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<{ response: NextResponse } | { user: SessionUser; data: z.infer<T>; db: Db }> {
  const denied = assertSameOrigin(request);
  if (denied) return { response: denied };
  const user = await getCurrentUser();
  if (!user) return { response: jsonError(401, SIGN_IN_REQUIRED) };
  const body = await readJsonBody(request, schema, ROOM_BODY_MAX_BYTES);
  if ("response" in body) return { response: body.response };
  return { user, data: body.data, db: getDb() };
}

export type RoomMutationContext<T> = {
  tx: Tx;
  user: SessionUser;
  access: RoomAccess;
  data: T;
};

/**
 * A mutating route scoped to `roomId`. The handler's response is returned
 * as is; throwing rolls the transaction back.
 */
export async function roomMutation<T extends z.ZodType>(
  request: Request,
  roomId: string,
  schema: T,
  options: { ownerOnly: boolean },
  handler: (ctx: RoomMutationContext<z.infer<T>>) => Promise<NextResponse>,
): Promise<NextResponse> {
  const pre = await readAuthedBody(request, schema);
  if ("response" in pre) return pre.response;
  const { user, data, db } = pre;

  // Cheap gate before taking a lock: non-members never wait on a room's lock.
  if (!(await requireRoomMember(db, roomId, user.id))) return roomNotFound();

  return db.transaction(async (tx) => {
    await lockRoom(tx, roomId);
    const access = await requireRoomMember(tx, roomId, user.id);
    if (!access) return roomNotFound();
    if (options.ownerOnly && access.role !== "owner") return jsonError(403, OWNER_ONLY);
    return handler({ tx, user, access, data });
  });
}
