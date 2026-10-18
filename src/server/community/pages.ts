// Data for the community pages (docs/specs/community.md §C.6 budgets):
//   Discussion tab on the problem page:  ≤ 3 queries (summary+viewer, Best top 5, New top 5)
//   /problems/[slug]/discuss:            ≤ 5 queries (summary+viewer, one page with replies)
// Pages call these directly (no fetch to our own API), like the rest of the app.
import type { CommentPage, CommentView, ProblemCommunitySummary, ViewerSummary } from "@/lib/community/dto";
import { canWrite, isModerator, isSuspended, type CommunityViewer } from "@/lib/community/permissions";
import { COMMUNITY_LIMITS, type CommentSort } from "@/lib/community/types";
import type { Db } from "@/server/db";

import { findComment, getCommentView, listComments, listReplies } from "./comments";
import { communityFlags } from "./flags";
import { getProblemSummary } from "./threads";

export function viewerSummary(
  viewer: CommunityViewer | null,
  summary: Pick<ProblemCommunitySummary, "locked">,
  now: Date,
): ViewerSummary {
  const flags = communityFlags();
  const suspended = isSuspended(viewer, now);
  const moderator = isModerator(viewer);
  const writeBlock: ViewerSummary["writeBlock"] = !viewer
    ? "guest"
    : flags.readOnly
      ? "read_only"
      : suspended
        ? "suspended"
        : summary.locked && !moderator
          ? "locked"
          : null;
  return {
    signedIn: viewer !== null,
    username: viewer?.username ?? null,
    canWrite: writeBlock === null && viewer !== null && canWrite(viewer, now).ok,
    writeBlock,
    suspendedUntil: suspended ? viewer!.suspendedUntil!.toISOString() : null,
    trust: viewer?.trust ?? 0,
    moderator,
  };
}

export type DiscussionTabData = {
  summary: ProblemCommunitySummary;
  viewer: ViewerSummary;
  best: CommentPage;
  latest: CommentPage;
};

/** The workspace tab: header bits plus the top 5 by Best and by New. */
export async function getDiscussionTabData(
  db: Db,
  slug: string,
  userId: string | null,
  now: Date = new Date(),
): Promise<DiscussionTabData | null> {
  const loaded = await getProblemSummary(db, slug, userId, now);
  if (!loaded) return null;
  const { summary, viewer } = loaded;
  const ctx = { viewer, viewerSolved: summary.solved === true, now, locked: summary.locked };
  const [best, latest] = await Promise.all([
    listComments(db, { ...ctx, threadId: summary.threadId, sort: "best", pageSize: COMMUNITY_LIMITS.tabPreview }),
    listComments(db, { ...ctx, threadId: summary.threadId, sort: "new", pageSize: COMMUNITY_LIMITS.tabPreview }),
  ]);
  return { summary, viewer: viewerSummary(viewer, summary, now), best, latest };
}

export type DiscussPageData = {
  summary: ProblemCommunitySummary;
  viewer: ViewerSummary;
  /** The full viewer (permissions), for follow-up reads on the same page. */
  communityViewer: CommunityViewer | null;
  page: CommentPage;
};

/**
 * Permalink mode of the full page (`?comment=<id>`): the top-level comment
 * (or a reply's parent) with its replies, paged by `cursor`. Null when the
 * comment is unknown, hidden from the viewer or not in this problem.
 */
export async function getCommentThread(
  db: Db,
  input: { data: DiscussPageData; commentId: string; cursor?: string; now: Date },
): Promise<{ comment: CommentView; nextCursor: string | null } | null> {
  const { summary, communityViewer } = input.data;
  const record = await findComment(db, input.commentId);
  if (!record || record.problemId !== summary.problemId) return null;
  const top = record.depth === 1 && record.parentId ? await findComment(db, record.parentId) : record;
  if (!top) return null;
  const ctx = { viewer: communityViewer, viewerSolved: summary.solved === true, now: input.now, locked: summary.locked };
  const comment = await getCommentView(db, top.id, { ...ctx, reveal: false });
  if (!comment) return null;
  const replies = await listReplies(db, {
    ...ctx,
    parent: { id: top.id, authorId: top.authorId, status: top.status },
    cursor: input.cursor,
  });
  return { comment: { ...comment, replies: replies.replies, moreReplies: false }, nextCursor: replies.nextCursor };
}

/** `/problems/[slug]/discuss`: one page (Best or New), cursor-paginated. */
export async function getDiscussPageData(
  db: Db,
  input: { slug: string; userId: string | null; sort: CommentSort; cursor?: string; now?: Date },
): Promise<DiscussPageData | null> {
  const now = input.now ?? new Date();
  const loaded = await getProblemSummary(db, input.slug, input.userId, now);
  if (!loaded) return null;
  const { summary, viewer } = loaded;
  const page = await listComments(db, {
    viewer,
    viewerSolved: summary.solved === true,
    now,
    locked: summary.locked,
    threadId: summary.threadId,
    sort: input.sort,
    cursor: input.cursor,
  });
  return { summary, viewer: viewerSummary(viewer, summary, now), communityViewer: viewer, page };
}
