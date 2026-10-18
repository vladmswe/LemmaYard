// Data for the community pages (docs/specs/community.md §C.6 budgets):
//   Discussion tab on the problem page:  ≤ 3 queries (summary+viewer, Best top 5, New top 5)
//   /problems/[slug]/discuss:            ≤ 5 queries (summary+viewer, one page with replies)
// Pages call these directly (no fetch to our own API), like the rest of the app.
import type { CommentPage, ProblemCommunitySummary, ViewerSummary } from "@/lib/community/dto";
import { canWrite, isModerator, isSuspended, type CommunityViewer } from "@/lib/community/permissions";
import { COMMUNITY_LIMITS, type CommentSort } from "@/lib/community/types";
import type { Db } from "@/server/db";

import { listComments } from "./comments";
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
  page: CommentPage;
};

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
  return { summary, viewer: viewerSummary(viewer, summary, now), page };
}
