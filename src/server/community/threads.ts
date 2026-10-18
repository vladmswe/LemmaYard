// Discussion targets (docs/specs/community.md §B.5, §C.3 threads.ts). C1:
// one thread per published problem, created lazily on the first comment.
// `getProblemSummary` is the ONE query behind the problem's community
// header (thread, counters, the viewer's vote, feedback and solved status).
import { and, eq, sql } from "drizzle-orm";

import type { ProblemCommunitySummary } from "@/lib/community/dto";
import type { CommunityViewer } from "@/lib/community/permissions";
import { feedbackSummary, likePercent } from "@/lib/community/ranking";
import { trustLevel } from "@/lib/community/trust";
import { COMMUNITY_LIMITS, type DifficultyFeedback, type UserRole } from "@/lib/community/types";
import { problemRating } from "@/lib/rooms/rating";
import type { Db } from "@/server/db";
import {
  discussionThreads,
  problemDifficultyFeedback,
  problems,
  problemVotes,
  submissions,
  users,
} from "@/server/db/schema";

import type { Tx } from "./limits";

type Queryable = Pick<Db, "select">;

type ViewerJson = {
  id: string;
  username: string;
  role: UserRole;
  suspendedUntil: string | null;
  createdAt: string;
  hasAccepted: boolean;
};

/**
 * Thread + problem + viewer bits for `slug` in ONE query, or null when the
 * problem is unknown / unpublished. With `withViewer`, the viewer's community
 * profile (role, trust, suspension) comes back too, so pages need no extra
 * query for it (AC-C-CM-7, AC-C-CM-8 budgets).
 */
export async function getProblemSummary(
  db: Queryable,
  slug: string,
  viewerId: string | null,
  now: Date = new Date(),
): Promise<{ summary: ProblemCommunitySummary; viewer: CommunityViewer | null } | null> {
  const viewer = viewerId ?? "00000000-0000-0000-0000-000000000000";
  const [row] = await db
    .select({
      viewer: sql<ViewerJson | null>`(select json_build_object(
          'id', u.id, 'username', u.username, 'role', u.role, 'suspendedUntil', u.community_suspended_until,
          'createdAt', u.created_at,
          'hasAccepted', exists (select 1 from ${submissions} s where s.user_id = u.id and s.kind = 'submit' and s.status = 'accepted'))
        from ${users} u where u.id = ${viewer})`,
      problemId: problems.id,
      slug: problems.slug,
      number: problems.number,
      title: problems.title,
      difficulty: problems.difficulty,
      authorRating: problems.authorRating,
      ratingAdjust: problems.ratingAdjust,
      likes: problems.likeCount,
      dislikes: problems.dislikeCount,
      threadId: discussionThreads.id,
      commentCount: discussionThreads.commentCount,
      lockedAt: discussionThreads.lockedAt,
      myVote: sql<number | null>`(select ${problemVotes.value} from ${problemVotes}
        where ${problemVotes.problemId} = ${problems.id} and ${problemVotes.userId} = ${viewer})`,
      myFeedback: sql<number | null>`(select ${problemDifficultyFeedback.value} from ${problemDifficultyFeedback}
        where ${problemDifficultyFeedback.problemId} = ${problems.id} and ${problemDifficultyFeedback.userId} = ${viewer})`,
      feedback: sql<{ easier: number; right: number; harder: number }>`(select json_build_object(
          'easier', count(*) filter (where f.value = -1),
          'right', count(*) filter (where f.value = 0),
          'harder', count(*) filter (where f.value = 1))
        from ${problemDifficultyFeedback} f where f.problem_id = ${problems.id})`,
      solved: sql<boolean>`exists (select 1 from ${submissions}
        where ${submissions.userId} = ${viewer} and ${submissions.problemId} = ${problems.id}
          and ${submissions.kind} = 'submit' and ${submissions.status} = 'accepted')`,
    })
    .from(problems)
    .leftJoin(discussionThreads, eq(discussionThreads.problemId, problems.id))
    .where(and(eq(problems.slug, slug), eq(problems.published, true)))
    .limit(1);
  if (!row) return null;
  const counts = row.feedback ?? { easier: 0, right: 0, harder: 0 };
  const v = viewerId ? row.viewer : null;
  const communityViewer: CommunityViewer | null = v
    ? {
        id: v.id,
        username: v.username,
        role: v.role,
        suspendedUntil: v.suspendedUntil ? new Date(v.suspendedUntil) : null,
        createdAt: new Date(v.createdAt),
        trust: trustLevel({ createdAt: new Date(v.createdAt), hasAccepted: Boolean(v.hasAccepted) }, now),
      }
    : null;
  const summary: ProblemCommunitySummary = {
    problemId: row.problemId,
    slug: row.slug,
    number: row.number,
    title: row.title,
    threadId: row.threadId,
    commentCount: row.commentCount ?? 0,
    locked: row.lockedAt !== null && row.lockedAt !== undefined,
    likes: row.likes,
    dislikes: row.dislikes,
    likePercent: likePercent(row.likes, row.dislikes, COMMUNITY_LIMITS.likeMinVotes),
    myVote: viewerId ? ((row.myVote ?? 0) as -1 | 0 | 1) : 0,
    solved: viewerId ? Boolean(row.solved) : null,
    myFeedback: viewerId && row.myFeedback !== null ? (row.myFeedback as DifficultyFeedback) : null,
    feedback: feedbackSummary(
      { easier: Number(counts.easier), right: Number(counts.right), harder: Number(counts.harder) },
      COMMUNITY_LIMITS.feedbackMinAnswers,
    ),
    rating: problemRating({
      difficulty: row.difficulty,
      authorRating: row.authorRating,
      ratingAdjust: row.ratingAdjust,
    }),
    difficulty: row.difficulty,
  };
  return { summary, viewer: communityViewer };
}

/** The published problem behind a slug (writes), or null. */
export async function findPublishedProblem(db: Queryable, slug: string) {
  const [row] = await db
    .select({ id: problems.id, slug: problems.slug, title: problems.title })
    .from(problems)
    .where(and(eq(problems.slug, slug), eq(problems.published, true)))
    .limit(1);
  return row ?? null;
}

/** The problem's thread, created on first use (one statement, race-safe via the unique index). */
export async function ensureProblemThread(tx: Tx, problemId: string): Promise<{ id: string; lockedAt: Date | null }> {
  const [row] = await tx
    .insert(discussionThreads)
    .values({ kind: "problem", problemId })
    .onConflictDoUpdate({ target: discussionThreads.problemId, set: { problemId: sql`excluded.problem_id` } })
    .returning({ id: discussionThreads.id, lockedAt: discussionThreads.lockedAt });
  return row;
}
