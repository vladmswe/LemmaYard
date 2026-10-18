// The self-reported LeetCode contest rating (Rooms v2 §6.4, §11, §14; owner
// decision D2). It lives on `users` and is private: only its owner reads it,
// through these routes. It only seeds a member's FIRST rating in a room, so
// a change re-seeds the rooms where the member has no rated pairs yet and
// leaves the others alone (their rating already comes from sessions).
import { and, asc, eq, gt, isNotNull, isNull } from "drizzle-orm";
import type { NextResponse } from "next/server";

import { isProvisional, startingRating } from "@/lib/rooms/rating";
import { SELF_RATING_UPDATES_PER_HOUR, selfRatingBodySchema } from "@/lib/rooms/rating-schemas";
import type { RatingSource } from "@/lib/rooms/types";
import { getCurrentUser } from "@/server/auth/session";
import { getDb, type Db } from "@/server/db";
import { problems, roomMembers, rooms, submissions, users } from "@/server/db/schema";
import { jsonError } from "@/server/http/request";
import { createRateLimiter } from "@/server/http/rate-limit";

import { json, readAuthedBody, SIGN_IN_REQUIRED, tooMany } from "./http";
import { problemRatingSql } from "./ratings";

export const selfRatingLimiter = createRateLimiter({ limit: SELF_RATING_UPDATES_PER_HOUR, windowMs: 60 * 60 * 1000 });

export type MyRatingView = {
  /** Visible to its owner only. */
  leetcodeRating: number | null;
  /** The viewer's own rating in each of their rooms. */
  rooms: {
    roomId: string;
    roomName: string;
    rating: number | null;
    ratedPairs: number;
    ratedSessions: number;
    provisional: boolean;
    source: RatingSource | null;
  }[];
};

async function loadMyRating(db: Db, userId: string): Promise<MyRatingView> {
  const [me] = await db.select({ lc: users.leetcodeRating }).from(users).where(eq(users.id, userId)).limit(1);
  const mine = await db
    .select({
      roomId: rooms.id,
      roomName: rooms.name,
      rating: roomMembers.rating,
      ratedPairs: roomMembers.ratedPairs,
      ratedSessions: roomMembers.ratedSessions,
      source: roomMembers.ratingSource,
    })
    .from(roomMembers)
    .innerJoin(rooms, eq(rooms.id, roomMembers.roomId))
    .where(eq(roomMembers.userId, userId))
    .orderBy(asc(rooms.name), asc(rooms.id));
  return {
    leetcodeRating: me?.lc ?? null,
    rooms: mine.map((r) => ({ ...r, provisional: isProvisional(r.ratedPairs) })),
  };
}

/** GET /api/me/rating */
export async function getMyRating(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return jsonError(401, SIGN_IN_REQUIRED);
  return json(await loadMyRating(getDb(), user.id));
}

/**
 * POST /api/me/rating `{leetcodeRating: number | null}` → 200 with the new
 * view plus `reseeded` (rooms whose starting rating changed) and `kept`
 * (rooms where the rating already comes from rated sessions).
 */
export async function updateMyRating(request: Request): Promise<NextResponse> {
  const pre = await readAuthedBody(request, selfRatingBodySchema);
  if ("response" in pre) return pre.response;
  const { user, data, db } = pre;
  const limited = selfRatingLimiter.hit(user.id);
  if (!limited.ok) return tooMany("Too many changes. Try again later.", limited.retryAfterSec);

  const { reseeded, kept } = await db.transaction(async (tx) => {
    await tx.update(users).set({ leetcodeRating: data.leetcodeRating }).where(eq(users.id, user.id));
    const practice =
      data.leetcodeRating === null
        ? (
            await tx
              .selectDistinct({ problemId: problems.id, rating: problemRatingSql })
              .from(submissions)
              .innerJoin(problems, eq(problems.id, submissions.problemId))
              .where(
                and(
                  eq(submissions.userId, user.id),
                  eq(submissions.kind, "submit"),
                  eq(submissions.status, "accepted"),
                  isNull(submissions.roomSessionId),
                ),
              )
          ).map((r) => Number(r.rating))
        : [];
    const seed = startingRating({ selfReported: data.leetcodeRating, practiceSolved: practice });
    const changed = await tx
      .update(roomMembers)
      .set({ rating: seed.rating, ratingSource: seed.source })
      .where(and(eq(roomMembers.userId, user.id), eq(roomMembers.ratedPairs, 0), isNotNull(roomMembers.rating)))
      .returning({ roomId: roomMembers.roomId });
    const locked = await tx
      .select({ roomId: roomMembers.roomId })
      .from(roomMembers)
      .where(and(eq(roomMembers.userId, user.id), gt(roomMembers.ratedPairs, 0)));
    return { reseeded: changed.length, kept: locked.length };
  });
  return json({ ...(await loadMyRating(db, user.id)), reseeded, kept });
}
