// Community C1 test factories (docs/specs/community.md). Users of each trust
// level, moderators, and direct comment inserts that keep the counters in
// step (threads.comment_count, parent.reply_count) like the server does.
import { createHash } from "node:crypto";

import { eq, sql } from "drizzle-orm";

import { normalizeForHash } from "@/lib/community/body";
import type { ContentStatus, UserRole } from "@/lib/community/types";
import { comments, discussionThreads, users } from "@/server/db/schema";

import { createSubmission, createUser, getTestDb } from "./db";

const HOUR = 60 * 60 * 1000;

/** TL0: younger than 72 h (and no accepted submission). */
export async function newUser(overrides: Parameters<typeof createUser>[0] = {}) {
  return createUser(overrides);
}

/** TL0 by age only: old account without an accepted submit. */
export async function oldUnsolvedUser(overrides: Parameters<typeof createUser>[0] = {}) {
  return createUser({ createdAt: new Date(Date.now() - 96 * HOUR), ...overrides });
}

/** TL1: 4 days old with one accepted submit on `problemId`. */
export async function trustedUser(problemId: string, overrides: Parameters<typeof createUser>[0] = {}) {
  const user = await createUser({ createdAt: new Date(Date.now() - 96 * HOUR), ...overrides });
  await acceptOn(user.id, problemId);
  return user;
}

export async function acceptOn(userId: string, problemId: string) {
  return createSubmission({
    userId,
    problemId,
    status: "accepted",
    passedCount: 1,
    totalCount: 1,
    startedAt: new Date(),
    finishedAt: new Date(),
  });
}

export async function withRole<T extends { id: string }>(user: T, role: UserRole): Promise<T> {
  await getTestDb().update(users).set({ role }).where(eq(users.id, user.id));
  return user;
}

export async function ensureThread(problemId: string): Promise<string> {
  const [row] = await getTestDb()
    .insert(discussionThreads)
    .values({ kind: "problem", problemId })
    .onConflictDoUpdate({ target: discussionThreads.problemId, set: { problemId: sql`excluded.problem_id` } })
    .returning({ id: discussionThreads.id });
  return row.id;
}

export function hashOf(body: string): string {
  return createHash("sha256").update(normalizeForHash(body)).digest("hex");
}

/** Inserts a comment directly (bypassing limits), keeping counters right. */
export async function insertComment(input: {
  problemId: string;
  authorId: string | null;
  body?: string;
  parentId?: string | null;
  status?: ContentStatus;
  createdAt?: Date;
  up?: number;
  down?: number;
  hasSpoiler?: boolean;
}) {
  const db = getTestDb();
  const threadId = await ensureThread(input.problemId);
  const body = input.body ?? `comment ${Math.random().toString(36).slice(2)}`;
  const status = input.status ?? "visible";
  const [row] = await db
    .insert(comments)
    .values({
      threadId,
      parentId: input.parentId ?? null,
      depth: input.parentId ? 1 : 0,
      authorId: input.authorId,
      bodyMd: status === "deleted" ? "" : body,
      bodyHash: hashOf(body),
      status,
      deletedAt: status === "deleted" ? new Date() : null,
      createdAt: input.createdAt ?? new Date(),
      upCount: input.up ?? 0,
      downCount: input.down ?? 0,
      hasSpoiler: input.hasSpoiler ?? false,
    })
    .returning();
  if (status === "visible") {
    await db
      .update(discussionThreads)
      .set({ commentCount: sql`${discussionThreads.commentCount} + 1` })
      .where(eq(discussionThreads.id, threadId));
    if (input.parentId) {
      await db
        .update(comments)
        .set({ replyCount: sql`${comments.replyCount} + 1` })
        .where(eq(comments.id, input.parentId));
    }
  }
  return row;
}
