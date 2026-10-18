// Comments (docs/specs/community.md §B.5, §C.3 comments.ts, §C.5).
//
// Reads: `listComments` returns one page of top-level comments WITH their
// first replies, the authors and the viewer's votes in ONE query (AC-C-CM-8);
// `listReplies` pages one comment's replies; `getComment` serves a spoiler
// reveal. Every row goes through `toView`, the single serializer that masks
// authors of placeholders, spoiler bodies and hidden content.
//
// Writes run inside `communityWrite` (src/server/community/http.ts): one
// transaction holding the author's community lock. Counters (thread
// `comment_count`, parent `reply_count`) count VISIBLE comments and move in
// the same transaction as the status change (`pnpm community:recount`
// rebuilds them).
import { createHash } from "node:crypto";

import { and, eq, sql, type SQL } from "drizzle-orm";

import { normalizeForHash } from "@/lib/community/body";
import { decodeCursor, encodeCursor } from "@/lib/community/cursor";
import type { CommentPage, CommentView } from "@/lib/community/dto";
import { checkLinks } from "@/lib/community/links";
import {
  canDeleteComment,
  canEditComment,
  canReport,
  canVoteOn,
  canWrite,
  commentVisibility,
  isModerator,
  showEditedMark,
  spoilerMasked,
  type CommunityViewer,
} from "@/lib/community/permissions";
import { isNewAccount } from "@/lib/community/trust";
import { COMMUNITY_LIMITS, type CommentSort, type ContentStatus } from "@/lib/community/types";
import type { Db } from "@/server/db";
import { comments, contentRevisions, discussionThreads } from "@/server/db/schema";
import { getEnv } from "@/server/env";

import { CommunityError, assertAllowed, notFoundError } from "./errors";
import { enforceRateLimit, type Tx } from "./limits";
import { ensureProblemThread, findPublishedProblem } from "./threads";

type Executor = Pick<Db, "execute">;

export const NO_VIEWER = "00000000-0000-0000-0000-000000000000";

/** A comment row as the list queries return it (snake_case from raw SQL). */
type Row = {
  id: string;
  thread_id: string;
  parent_id: string | null;
  depth: number;
  author_id: string | null;
  username: string | null;
  body_md: string;
  has_spoiler: boolean;
  up_count: number;
  down_count: number;
  reply_count: number;
  rank_best: number;
  status: ContentStatus;
  edited_at: string | Date | null;
  removed_reason: string | null;
  created_at: string | Date;
  created_key: string;
  my_vote: number | null;
  is_top: boolean;
  ord: number;
};

const toDate = (v: string | Date) => (v instanceof Date ? v : new Date(v));

/** sha256 hex of the normalized body (§B.11 duplicates). */
export function bodyHash(body: string): string {
  return createHash("sha256").update(normalizeForHash(body)).digest("hex");
}

export type ViewContext = {
  viewer: CommunityViewer | null;
  /** Whether the viewer solved the thread's problem (spoilers). */
  viewerSolved: boolean;
  now: Date;
  locked: boolean;
};

/** THE serializer (§D.4 "a single serializer"). Null when the viewer must not see the row at all. */
function toView(row: Row, ctx: ViewContext, threadStarterId: string | null): CommentView | null {
  const depth = (row.depth === 1 ? 1 : 0) as 0 | 1;
  const visibility = commentVisibility(
    { authorId: row.author_id, status: row.status, depth, replyCount: row.reply_count },
    ctx.viewer,
  );
  if (visibility === "hidden") return null;
  const createdAt = toDate(row.created_at);
  const moderator = isModerator(ctx.viewer);
  const own = ctx.viewer !== null && row.author_id === ctx.viewer.id;
  const writable = ctx.viewer !== null && canWrite(ctx.viewer, ctx.now).ok;
  if (visibility === "placeholder") {
    return {
      id: row.id,
      parentId: row.parent_id,
      depth,
      author: null,
      isThreadStarter: false,
      createdAt: createdAt.toISOString(),
      edited: false,
      kind: "placeholder",
      status: row.status,
      bodyMd: null,
      hasSpoiler: false,
      spoilerMasked: false,
      removedReason: row.status === "removed" ? row.removed_reason : null,
      score: 0,
      myVote: 0,
      replyCount: row.reply_count,
      replies: [],
      moreReplies: false,
      can: {
        edit: false,
        delete: false,
        vote: false,
        reply: false,
        report: false,
        moderate: moderator && row.status === "removed",
      },
    };
  }
  const masked = spoilerMasked({ hasSpoiler: row.has_spoiler, authorId: row.author_id }, ctx.viewer, ctx.viewerSolved);
  const facts = {
    authorId: row.author_id,
    status: row.status,
    createdAt,
    depth,
    replyCount: row.reply_count,
    hasSpoiler: row.has_spoiler,
  };
  return {
    id: row.id,
    parentId: row.parent_id,
    depth,
    author: row.username ? { username: row.username } : null,
    isThreadStarter: depth === 1 && threadStarterId !== null && row.author_id === threadStarterId,
    createdAt: createdAt.toISOString(),
    edited: showEditedMark(createdAt, row.edited_at ? toDate(row.edited_at) : null),
    kind: "full",
    status: row.status,
    bodyMd: masked ? null : row.body_md,
    hasSpoiler: row.has_spoiler,
    spoilerMasked: masked,
    removedReason: null,
    score: row.up_count - row.down_count,
    myVote: (row.my_vote ?? 0) as -1 | 0 | 1,
    replyCount: row.reply_count,
    replies: [],
    moreReplies: false,
    can: {
      edit: canEditComment(facts, ctx.viewer, ctx.now).ok,
      delete: canDeleteComment(facts, ctx.viewer, ctx.now).ok,
      vote: writable && !own && row.status === "visible",
      reply: writable && row.status === "visible" && !ctx.locked,
      report: canReport({ authorId: row.author_id, status: row.status }, ctx.viewer, ctx.now).ok,
      moderate: moderator,
    },
  };
}

/** Which rows a viewer may get from the DB at all (the serializer decides the rest). */
function visibleSql(alias: string, viewer: CommunityViewer | null, topLevel: boolean): SQL {
  const c = sql.raw(alias);
  const viewerId = viewer?.id ?? NO_VIEWER;
  const placeholders = topLevel
    ? sql` OR (${c}.status IN ('deleted', 'removed') AND ${c}.reply_count > 0)`
    : sql``;
  const privileged = isModerator(viewer)
    ? sql` OR ${c}.status IN ('hidden_pending', 'removed')`
    : sql` OR (${c}.author_id = ${viewerId} AND ${c}.status IN ('hidden_pending', 'removed'))`;
  return sql`(${c}.status = 'visible'${placeholders}${privileged})`;
}

const CREATED_KEY = (alias: string) =>
  sql.raw(`to_char(${alias}.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`);

function orderSql(alias: string, sort: CommentSort): SQL {
  return sort === "best"
    ? sql.raw(`${alias}.rank_best DESC, ${alias}.created_at DESC, ${alias}.id DESC`)
    : sql.raw(`${alias}.created_at DESC, ${alias}.id DESC`);
}

function cursorSql(alias: string, sort: CommentSort, cursor: string | undefined): SQL {
  if (!cursor) return sql`TRUE`;
  const decoded = decodeCursor(cursor);
  const c = sql.raw(alias);
  if (!decoded) throw new CommunityError(400, "invalid_cursor", "Invalid cursor");
  if (sort === "best") {
    const [rank, created] = decoded.k;
    if (typeof rank !== "number" || typeof created !== "string") {
      throw new CommunityError(400, "invalid_cursor", "Invalid cursor");
    }
    return sql`(${c}.rank_best, ${c}.created_at, ${c}.id) < (${rank}::double precision, ${created}::timestamptz, ${decoded.id}::uuid)`;
  }
  const [created] = decoded.k;
  if (typeof created !== "string") throw new CommunityError(400, "invalid_cursor", "Invalid cursor");
  return sql`(${c}.created_at, ${c}.id) < (${created}::timestamptz, ${decoded.id}::uuid)`;
}

function cursorFor(row: Row, sort: CommentSort): string {
  return encodeCursor({ k: sort === "best" ? [row.rank_best, row.created_key] : [row.created_key], id: row.id });
}

const SELECT_COLUMNS = (alias: string) =>
  sql.raw(
    `${alias}.id, ${alias}.thread_id, ${alias}.parent_id, ${alias}.depth, ${alias}.author_id, ${alias}.body_md, ${alias}.has_spoiler, ${alias}.up_count, ${alias}.down_count, ${alias}.reply_count, ${alias}.rank_best, ${alias}.status, ${alias}.edited_at, ${alias}.removed_reason, ${alias}.created_at`,
  );

/**
 * One page of top-level comments with their first `inlineReplies` replies,
 * authors and the viewer's votes, in ONE query (AC-C-CM-6, AC-C-CM-8).
 */
export async function listComments(
  db: Executor,
  input: {
    threadId: string | null;
    sort: CommentSort;
    cursor?: string;
    pageSize?: number;
    inlineReplies?: number;
  } & ViewContext,
): Promise<CommentPage> {
  const pageSize = input.pageSize ?? COMMUNITY_LIMITS.pageSize;
  const inlineReplies = input.inlineReplies ?? COMMUNITY_LIMITS.inlineReplies;
  if (!input.threadId) {
    if (input.cursor && !decodeCursor(input.cursor)) throw new CommunityError(400, "invalid_cursor", "Invalid cursor");
    return { comments: [], nextCursor: null, sort: input.sort };
  }
  const viewerId = input.viewer?.id ?? NO_VIEWER;
  const { rows } = await db.execute<Row>(sql`
    WITH top AS (
      SELECT ${SELECT_COLUMNS("c")}, ${CREATED_KEY("c")} AS created_key,
             row_number() OVER (ORDER BY ${orderSql("c", input.sort)}) AS ord
      FROM ${comments} c
      WHERE c.thread_id = ${input.threadId} AND c.depth = 0
        AND ${visibleSql("c", input.viewer, true)}
        AND ${cursorSql("c", input.sort, input.cursor)}
      ORDER BY ${orderSql("c", input.sort)}
      LIMIT ${pageSize + 1}
    ),
    rep AS (
      SELECT r.*, top.ord AS ord FROM top CROSS JOIN LATERAL (
        SELECT ${SELECT_COLUMNS("r0")}, ${CREATED_KEY("r0")} AS created_key
        FROM ${comments} r0
        WHERE r0.parent_id = top.id AND ${visibleSql("r0", input.viewer, false)}
        ORDER BY r0.created_at ASC, r0.id ASC
        LIMIT ${inlineReplies + 1}
      ) r
      WHERE top.ord <= ${pageSize}
    ),
    allrows AS (
      SELECT top.*, TRUE AS is_top FROM top
      UNION ALL
      SELECT rep.id, rep.thread_id, rep.parent_id, rep.depth, rep.author_id, rep.body_md, rep.has_spoiler, rep.up_count,
             rep.down_count, rep.reply_count, rep.rank_best, rep.status, rep.edited_at, rep.removed_reason, rep.created_at,
             rep.created_key, rep.ord, FALSE AS is_top FROM rep
    )
    SELECT a.*, u.username, v.value AS my_vote
    FROM allrows a
    LEFT JOIN users u ON u.id = a.author_id
    LEFT JOIN comment_votes v ON v.comment_id = a.id AND v.user_id = ${viewerId}
    ORDER BY a.ord, a.is_top DESC, a.created_at ASC, a.id ASC
  `);

  const tops = rows.filter((r) => r.is_top);
  const hasMore = tops.length > pageSize;
  const pageTops = tops.slice(0, pageSize);
  const repliesByParent = new Map<string, Row[]>();
  for (const r of rows) {
    if (r.is_top || !r.parent_id) continue;
    const list = repliesByParent.get(r.parent_id) ?? [];
    list.push(r);
    repliesByParent.set(r.parent_id, list);
  }
  const views: CommentView[] = [];
  for (const top of pageTops) {
    const view = toView(top, input, null);
    if (!view) continue;
    const replyRows = repliesByParent.get(top.id) ?? [];
    const starter = view.kind === "full" ? top.author_id : null;
    view.replies = replyRows
      .slice(0, inlineReplies)
      .map((r) => toView(r, input, starter))
      .filter((v): v is CommentView => v !== null);
    view.moreReplies = replyRows.length > inlineReplies;
    views.push(view);
  }
  return {
    comments: views,
    nextCursor: hasMore ? cursorFor(pageTops[pageTops.length - 1], input.sort) : null,
    sort: input.sort,
  };
}

/** The parent's replies after `cursor`, oldest first (`GET /api/comments/[id]/replies`). */
export async function listReplies(
  db: Executor,
  input: { parent: { id: string; authorId: string | null; status: ContentStatus }; cursor?: string; pageSize?: number } & ViewContext,
): Promise<{ replies: CommentView[]; nextCursor: string | null }> {
  const pageSize = input.pageSize ?? COMMUNITY_LIMITS.repliesPageSize;
  let after: SQL = sql`TRUE`;
  if (input.cursor) {
    const decoded = decodeCursor(input.cursor);
    if (!decoded || typeof decoded.k[0] !== "string") throw new CommunityError(400, "invalid_cursor", "Invalid cursor");
    after = sql`(r.created_at, r.id) > (${decoded.k[0]}::timestamptz, ${decoded.id}::uuid)`;
  }
  const viewerId = input.viewer?.id ?? NO_VIEWER;
  const { rows } = await db.execute<Row>(sql`
    SELECT ${SELECT_COLUMNS("r")}, ${CREATED_KEY("r")} AS created_key, u.username, v.value AS my_vote, FALSE AS is_top, 0 AS ord
    FROM ${comments} r
    LEFT JOIN users u ON u.id = r.author_id
    LEFT JOIN comment_votes v ON v.comment_id = r.id AND v.user_id = ${viewerId}
    WHERE r.parent_id = ${input.parent.id} AND ${visibleSql("r", input.viewer, false)} AND ${after}
    ORDER BY r.created_at ASC, r.id ASC
    LIMIT ${pageSize + 1}
  `);
  const starter = input.parent.status === "visible" || input.parent.status === "hidden_pending" ? input.parent.authorId : null;
  const page = rows.slice(0, pageSize);
  return {
    replies: page.map((r) => toView(r, input, starter)).filter((v): v is CommentView => v !== null),
    nextCursor:
      rows.length > pageSize ? encodeCursor({ k: [page[page.length - 1].created_key], id: page[page.length - 1].id }) : null,
  };
}

/** A comment row plus its thread's problem (for routes acting on one comment). */
export type CommentRecord = {
  id: string;
  threadId: string;
  parentId: string | null;
  depth: 0 | 1;
  authorId: string | null;
  bodyMd: string;
  hasSpoiler: boolean;
  status: ContentStatus;
  replyCount: number;
  createdAt: Date;
  problemId: string | null;
  lockedAt: Date | null;
};

/** Loads one comment (FOR UPDATE inside a write), or null. */
export async function findComment(db: Pick<Db, "select">, id: string, forUpdate = false): Promise<CommentRecord | null> {
  const query = db
    .select({
      id: comments.id,
      threadId: comments.threadId,
      parentId: comments.parentId,
      depth: comments.depth,
      authorId: comments.authorId,
      bodyMd: comments.bodyMd,
      hasSpoiler: comments.hasSpoiler,
      status: comments.status,
      replyCount: comments.replyCount,
      createdAt: comments.createdAt,
      problemId: discussionThreads.problemId,
      lockedAt: discussionThreads.lockedAt,
    })
    .from(comments)
    .innerJoin(discussionThreads, eq(discussionThreads.id, comments.threadId))
    .where(eq(comments.id, id))
    .limit(1);
  const [row] = forUpdate ? await query.for("update", { of: comments }) : await query;
  return row ? { ...row, depth: row.depth === 1 ? 1 : 0 } : null;
}

/** One comment as the viewer may see it (spoiler reveal), or null (→ 404). */
export async function getCommentView(
  db: Executor,
  id: string,
  ctx: ViewContext & { reveal: boolean },
): Promise<CommentView | null> {
  const viewerId = ctx.viewer?.id ?? NO_VIEWER;
  const { rows } = await db.execute<Row & { thread_locked: boolean }>(sql`
    SELECT ${SELECT_COLUMNS("c")}, ${CREATED_KEY("c")} AS created_key, u.username, v.value AS my_vote,
           (c.depth = 0) AS is_top, 0 AS ord
    FROM ${comments} c
    LEFT JOIN users u ON u.id = c.author_id
    LEFT JOIN comment_votes v ON v.comment_id = c.id AND v.user_id = ${viewerId}
    WHERE c.id = ${id}
  `);
  const row = rows[0];
  if (!row) return null;
  // "Show anyway" (AC-C-CM-5): the viewer chose to see it; still never a hidden or deleted body.
  const view = toView(row, { ...ctx, viewerSolved: ctx.viewerSolved || ctx.reveal }, null);
  return view;
}

/** Visible ↔ not visible: move the thread and parent counters with the status (same transaction). */
async function applyVisibilityDelta(
  tx: Tx,
  comment: Pick<CommentRecord, "threadId" | "parentId">,
  from: ContentStatus,
  to: ContentStatus,
): Promise<void> {
  const delta = (to === "visible" ? 1 : 0) - (from === "visible" ? 1 : 0);
  if (delta === 0) return;
  // Lock order: comment rows before the thread row, everywhere (no deadlocks).
  if (comment.parentId) {
    await tx
      .update(comments)
      .set({ replyCount: sql`${comments.replyCount} + ${delta}` })
      .where(eq(comments.id, comment.parentId));
  }
  await tx
    .update(discussionThreads)
    .set({ commentCount: sql`${discussionThreads.commentCount} + ${delta}` })
    .where(eq(discussionThreads.id, comment.threadId));
}

/** Changes a comment's status and keeps the counters in step. */
export async function setCommentStatus(
  tx: Tx,
  comment: CommentRecord,
  to: ContentStatus,
  extra: Partial<typeof comments.$inferInsert> = {},
): Promise<void> {
  await tx
    .update(comments)
    .set({ status: to, ...extra })
    .where(eq(comments.id, comment.id));
  await applyVisibilityDelta(tx, comment, comment.status, to);
}

function siteHost(): string | null {
  try {
    return new URL(getEnv().AUTH_URL).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Body checks that depend on the author (§B.11): links (400). */
function assertLinks(body: string, viewer: CommunityViewer): { external: number; total: number } {
  if (isModerator(viewer)) return { external: 0, total: 0 };
  const links = checkLinks(body, viewer.trust, siteHost());
  if (!links.ok) {
    throw new CommunityError(400, links.reason, links.message, { fieldErrors: { body: links.message } });
  }
  return { external: links.external, total: links.total };
}

/**
 * Duplicate (same author + hash within 24 h → 409) and the facts for a hold:
 * other authors with the same hash in 24 h, and the author's comment count.
 */
async function duplicateFacts(
  tx: Executor,
  input: { authorId: string; hash: string; now: Date; excludeId?: string },
): Promise<{ ownDuplicate: boolean; otherAuthors: number; ownTotal: number }> {
  const since = new Date(input.now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const exclude = input.excludeId ?? NO_VIEWER;
  const { rows } = await tx.execute<{ own_dupes: number; other_authors: number; own_total: number }>(sql`
    SELECT
      count(*) FILTER (WHERE author_id = ${input.authorId} AND body_hash = ${input.hash}
                       AND created_at >= ${since}::timestamptz AND status <> 'deleted' AND id <> ${exclude})::int AS own_dupes,
      count(DISTINCT author_id) FILTER (WHERE body_hash = ${input.hash} AND created_at >= ${since}::timestamptz
                       AND author_id <> ${input.authorId})::int AS other_authors,
      count(*) FILTER (WHERE author_id = ${input.authorId})::int AS own_total
    FROM ${comments}
    WHERE author_id = ${input.authorId} OR (body_hash = ${input.hash} AND created_at >= ${since}::timestamptz)
  `);
  const row = rows[0];
  return {
    ownDuplicate: Number(row?.own_dupes ?? 0) > 0,
    otherAuthors: Number(row?.other_authors ?? 0),
    ownTotal: Number(row?.own_total ?? 0),
  };
}

/**
 * Hold for review (§B.11): a TL0 comment with a non-allowlisted link; a
 * TL0 account's first 3 comments with any link during its first 72 h; the
 * 3rd+ author posting the same body within 24 h. Moderators are never held.
 */
function holdForReview(
  viewer: CommunityViewer,
  links: { external: number; total: number },
  facts: { otherAuthors: number; ownTotal: number },
  now: Date,
): boolean {
  if (isModerator(viewer)) return false;
  if (facts.otherAuthors >= COMMUNITY_LIMITS.spamWaveAuthors - 1) return true;
  if (viewer.trust === 0 && links.external > 0) return true;
  if (
    viewer.trust === 0 &&
    links.total > 0 &&
    isNewAccount(viewer.createdAt, now) &&
    facts.ownTotal < COMMUNITY_LIMITS.newAccountHeldComments
  ) {
    return true;
  }
  return false;
}

/** Creates a comment or reply (check order: 404 → 403 → 409 → 429 → write). */
export async function createComment(
  tx: Tx,
  input: {
    viewer: CommunityViewer;
    slug: string;
    parentId: string | null | undefined;
    body: string;
    hasSpoiler: boolean;
    now: Date;
  },
): Promise<CommentView> {
  const { viewer, now } = input;
  const links = assertLinks(input.body, viewer);

  const problem = await findPublishedProblem(tx, input.slug);
  if (!problem) throw notFoundError("Problem not found");
  let parent: CommentRecord | null = null;
  if (input.parentId) {
    parent = await findComment(tx, input.parentId, true);
    if (!parent || parent.problemId !== problem.id) throw notFoundError("Comment not found");
    // A reply to a reply attaches to the top-level comment (AC-C-CM-1).
    if (parent.depth === 1 && parent.parentId) {
      parent = await findComment(tx, parent.parentId, true);
      if (!parent) throw notFoundError("Comment not found");
    }
  }
  assertAllowed(canWrite(viewer, now));
  const thread = await ensureProblemThread(tx, problem.id);
  if (thread.lockedAt && !isModerator(viewer)) {
    throw new CommunityError(409, "thread_locked", "This discussion is locked.");
  }
  if (parent && parent.status !== "visible") {
    throw new CommunityError(409, "parent_unavailable", "You can no longer reply to this comment.");
  }

  const hash = bodyHash(input.body);
  const facts = await duplicateFacts(tx, { authorId: viewer.id, hash, now });
  if (facts.ownDuplicate) throw new CommunityError(409, "duplicate", "You already posted this.");
  await enforceRateLimit(tx, "comment", viewer, now);

  const status: ContentStatus = holdForReview(viewer, links, facts, now) ? "hidden_pending" : "visible";
  const [row] = await tx
    .insert(comments)
    .values({
      threadId: thread.id,
      parentId: parent?.id ?? null,
      depth: parent ? 1 : 0,
      authorId: viewer.id,
      bodyMd: input.body,
      bodyHash: hash,
      hasSpoiler: input.hasSpoiler,
      status,
      createdAt: now,
    })
    .returning({ id: comments.id });
  await applyVisibilityDelta(tx, { threadId: thread.id, parentId: parent?.id ?? null }, "deleted", status);

  return {
    id: row.id,
    parentId: parent?.id ?? null,
    depth: parent ? 1 : 0,
    author: { username: viewer.username },
    isThreadStarter: parent !== null && parent.authorId === viewer.id,
    createdAt: now.toISOString(),
    edited: false,
    kind: "full",
    status,
    bodyMd: input.body,
    hasSpoiler: input.hasSpoiler,
    spoilerMasked: false,
    removedReason: null,
    score: 0,
    myVote: 0,
    replyCount: 0,
    replies: [],
    moreReplies: false,
    can: { edit: true, delete: true, vote: false, reply: status === "visible", report: false, moderate: isModerator(viewer) },
  };
}

/** Author edit within 24 h (AC-C-CM-3): stores the previous body as a revision. */
export async function editComment(
  tx: Tx,
  input: { viewer: CommunityViewer; id: string; body: string; hasSpoiler?: boolean; now: Date },
): Promise<{ id: string; status: ContentStatus; editedAt: string }> {
  const { viewer, now } = input;
  const links = assertLinks(input.body, viewer);
  const comment = await findComment(tx, input.id, true);
  if (!comment || commentVisibility(comment, viewer) === "hidden") throw notFoundError("Comment not found");
  assertAllowed(canEditComment(comment, viewer, now));

  const hash = bodyHash(input.body);
  const facts = await duplicateFacts(tx, { authorId: viewer.id, hash, now, excludeId: comment.id });
  if (facts.ownDuplicate) throw new CommunityError(409, "duplicate", "You already posted this.");
  await enforceRateLimit(tx, "edit", viewer, now);

  await tx.insert(contentRevisions).values({
    targetType: "comment",
    targetId: comment.id,
    bodyMd: comment.bodyMd,
    editedBy: viewer.id,
    createdAt: now,
  });
  // Edits re-run the hold rules; an edit never un-hides held or hidden content.
  const held = comment.status === "visible" && holdForReview(viewer, links, { ...facts, ownTotal: Math.max(0, facts.ownTotal - 1) }, now);
  const next: ContentStatus = held ? "hidden_pending" : comment.status;
  await setCommentStatus(tx, comment, next, {
    bodyMd: input.body,
    bodyHash: hash,
    editedAt: now,
    ...(input.hasSpoiler === undefined ? {} : { hasSpoiler: input.hasSpoiler }),
  });
  return { id: comment.id, status: next, editedAt: now.toISOString() };
}

/**
 * Author delete (AC-C-CM-4): soft delete, body cleared. With visible replies
 * the comment stays as a placeholder; without, it is gone from lists.
 */
export async function deleteComment(tx: Tx, input: { viewer: CommunityViewer; id: string; now: Date }): Promise<void> {
  const comment = await findComment(tx, input.id, true);
  if (!comment || commentVisibility(comment, input.viewer) === "hidden") throw notFoundError("Comment not found");
  assertAllowed(canDeleteComment(comment, input.viewer, input.now));
  await setCommentStatus(tx, comment, "deleted", { bodyMd: "", deletedAt: input.now, hasSpoiler: false });
}

/** For votes and reports: the comment, 404 when the viewer cannot see it. */
export async function requireVisibleComment(tx: Tx, id: string, viewer: CommunityViewer): Promise<CommentRecord> {
  const comment = await findComment(tx, id, true);
  if (!comment || commentVisibility(comment, viewer) === "hidden") throw notFoundError("Comment not found");
  return comment;
}

export { canVoteOn, canReport };

/** Thread lookup by id with its problem (moderation). */
export async function findThread(db: Pick<Db, "select">, id: string) {
  const [row] = await db
    .select({ id: discussionThreads.id, lockedAt: discussionThreads.lockedAt, problemId: discussionThreads.problemId })
    .from(discussionThreads)
    .where(and(eq(discussionThreads.id, id)))
    .limit(1);
  return row ?? null;
}
