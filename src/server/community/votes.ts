// Votes (docs/specs/community.md §B.4, AC-C-VT-1..5): one row per (target,
// user), value ±1, 0 removes it. The upsert and the counter delta happen in
// the caller's transaction, which holds the voter's community lock, so one
// user's concurrent votes serialize and counters always equal a recount.
// Other users' votes on the same target only touch the counters with atomic
// `count = count + delta` updates.
import { and, eq, sql } from "drizzle-orm";

import { canVoteOnProblem, canWrite, type CommunityViewer } from "@/lib/community/permissions";
import { voteDelta } from "@/lib/community/ranking";
import type { DifficultyFeedback } from "@/lib/community/types";
import {
  commentVotes,
  comments,
  problemDifficultyFeedback,
  problems,
  problemVotes,
} from "@/server/db/schema";

import { hasSolved } from "./access";
import { canVoteOn, requireVisibleComment } from "./comments";
import { CommunityError, assertAllowed, notFoundError } from "./errors";
import { enforceRateLimit, type Tx } from "./limits";
import { findPublishedProblem } from "./threads";

type Value = -1 | 0 | 1;

async function enforceVoteLimits(tx: Tx, viewer: CommunityViewer, value: Value, now: Date): Promise<void> {
  await enforceRateLimit(tx, "vote", viewer, now);
  if (value === -1) await enforceRateLimit(tx, "downvote", viewer, now);
}

/** `PUT /api/comments/[id]/vote`. Returns the new score and the viewer's vote. */
export async function setCommentVote(
  tx: Tx,
  input: { viewer: CommunityViewer; commentId: string; value: Value; now: Date },
): Promise<{ score: number; myVote: Value }> {
  const { viewer, value, now } = input;
  const comment = await requireVisibleComment(tx, input.commentId, viewer);
  assertAllowed(canVoteOn(comment, viewer, value, now));

  const [existing] = await tx
    .select({ value: commentVotes.value })
    .from(commentVotes)
    .where(and(eq(commentVotes.commentId, comment.id), eq(commentVotes.userId, viewer.id)));
  const previous = (existing?.value ?? 0) as Value;
  if (previous !== value) {
    if (value !== 0) {
      await enforceVoteLimits(tx, viewer, value, now);
      await tx
        .insert(commentVotes)
        .values({ commentId: comment.id, userId: viewer.id, value, createdAt: now, updatedAt: now })
        .onConflictDoUpdate({
          target: [commentVotes.commentId, commentVotes.userId],
          set: { value, updatedAt: now },
        });
    } else {
      await tx
        .delete(commentVotes)
        .where(and(eq(commentVotes.commentId, comment.id), eq(commentVotes.userId, viewer.id)));
    }
    const delta = voteDelta(previous, value);
    const [row] = await tx
      .update(comments)
      .set({
        upCount: sql`${comments.upCount} + ${delta.up}`,
        downCount: sql`${comments.downCount} + ${delta.down}`,
      })
      .where(eq(comments.id, comment.id))
      .returning({ up: comments.upCount, down: comments.downCount });
    return { score: row.up - row.down, myVote: value };
  }
  const [row] = await tx
    .select({ up: comments.upCount, down: comments.downCount })
    .from(comments)
    .where(eq(comments.id, comment.id));
  return { score: row.up - row.down, myVote: value };
}

/** `PUT /api/problems/[slug]/vote`. */
export async function setProblemVote(
  tx: Tx,
  input: { viewer: CommunityViewer; slug: string; value: Value; now: Date },
): Promise<{ likes: number; dislikes: number; myVote: Value }> {
  const { viewer, value, now } = input;
  const problem = await findPublishedProblem(tx, input.slug);
  if (!problem) throw notFoundError("Problem not found");
  assertAllowed(canVoteOnProblem(viewer, value, now));

  const [existing] = await tx
    .select({ value: problemVotes.value })
    .from(problemVotes)
    .where(and(eq(problemVotes.problemId, problem.id), eq(problemVotes.userId, viewer.id)));
  const previous = (existing?.value ?? 0) as Value;
  if (previous !== value) {
    if (value !== 0) {
      await enforceVoteLimits(tx, viewer, value, now);
      await tx
        .insert(problemVotes)
        .values({ problemId: problem.id, userId: viewer.id, value, createdAt: now, updatedAt: now })
        .onConflictDoUpdate({ target: [problemVotes.problemId, problemVotes.userId], set: { value, updatedAt: now } });
    } else {
      await tx
        .delete(problemVotes)
        .where(and(eq(problemVotes.problemId, problem.id), eq(problemVotes.userId, viewer.id)));
    }
    const delta = voteDelta(previous, value);
    const [row] = await tx
      .update(problems)
      .set({
        likeCount: sql`${problems.likeCount} + ${delta.up}`,
        dislikeCount: sql`${problems.dislikeCount} + ${delta.down}`,
        // Votes must not look like a catalog edit.
        updatedAt: sql`${problems.updatedAt}`,
      })
      .where(eq(problems.id, problem.id))
      .returning({ likes: problems.likeCount, dislikes: problems.dislikeCount });
    return { likes: row.likes, dislikes: row.dislikes, myVote: value };
  }
  const [row] = await tx
    .select({ likes: problems.likeCount, dislikes: problems.dislikeCount })
    .from(problems)
    .where(eq(problems.id, problem.id));
  return { likes: row.likes, dislikes: row.dislikes, myVote: value };
}

/**
 * `PUT /api/problems/[slug]/difficulty-feedback` (AC-C-VT-5): only after an
 * accepted submission (403 `solve_required`). Opinion only: it never touches
 * `problems.rating_adjust`, author ratings or room ratings.
 */
export async function setDifficultyFeedback(
  tx: Tx,
  input: { viewer: CommunityViewer; slug: string; value: DifficultyFeedback | null; now: Date },
): Promise<{ myFeedback: DifficultyFeedback | null }> {
  const { viewer, value, now } = input;
  const problem = await findPublishedProblem(tx, input.slug);
  if (!problem) throw notFoundError("Problem not found");
  assertAllowed(canWrite(viewer, now));
  if (!(await hasSolved(tx, viewer.id, problem.id))) {
    throw new CommunityError(403, "solve_required", "Solve the problem first, then tell us how it felt.");
  }
  if (value === null) {
    await tx
      .delete(problemDifficultyFeedback)
      .where(and(eq(problemDifficultyFeedback.problemId, problem.id), eq(problemDifficultyFeedback.userId, viewer.id)));
    return { myFeedback: null };
  }
  await enforceRateLimit(tx, "vote", viewer, now);
  await tx
    .insert(problemDifficultyFeedback)
    .values({ problemId: problem.id, userId: viewer.id, value, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: [problemDifficultyFeedback.problemId, problemDifficultyFeedback.userId],
      set: { value, updatedAt: now },
    });
  return { myFeedback: value };
}
