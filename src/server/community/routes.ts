// Handlers behind src/app/api/** community routes (docs/specs/community.md
// §C.2). The route files only unwrap params and call these. Check order and
// error shape: src/server/community/http.ts.
import { z } from "zod";

import {
  createCommentSchema,
  deleteCommentSchema,
  difficultyFeedbackSchema,
  editCommentSchema,
  listCommentsQuerySchema,
  modActionSchema,
  repliesQuerySchema,
  reportSchema,
  voteSchema,
} from "@/lib/community/schemas";
import { COMMUNITY_LIMITS } from "@/lib/community/types";

import { hasSolved } from "./access";
import {
  createComment,
  deleteComment,
  editComment,
  findComment,
  getCommentView,
  listComments,
  listReplies,
} from "./comments";
import { CommunityError, notFoundError } from "./errors";
import { communityJson, communityNotFound, communityRead, communityWrite } from "./http";
import { applyModAction } from "./moderation";
import { createReport } from "./reports";
import { getProblemSummary } from "./threads";
import { setCommentVote, setDifficultyFeedback, setProblemVote } from "./votes";

const SMALL = COMMUNITY_LIMITS.smallBodyMaxBytes;
const uuid = z.uuid();

function searchParams(request: Request): Record<string, string> {
  return Object.fromEntries(new URL(request.url).searchParams.entries());
}

function badQuery(error: z.ZodError): CommunityError {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) fieldErrors[String(issue.path[0] ?? "query")] ??= issue.message;
  return new CommunityError(400, "invalid_query", "Invalid query", { fieldErrors });
}

/** GET /api/comments?target=problem:<slug>&sort=best|new&cursor= */
export function listCommentsRoute(request: Request) {
  return communityRead("community.comments_list", async ({ db, viewer, now }) => {
    const query = listCommentsQuerySchema.safeParse(searchParams(request));
    if (!query.success) throw badQuery(query.error);
    const loaded = await getProblemSummary(db, query.data.target.slug, viewer?.id ?? null, now);
    if (!loaded) throw notFoundError("Problem not found");
    const page = await listComments(db, {
      viewer,
      viewerSolved: loaded.summary.solved === true,
      now,
      locked: loaded.summary.locked,
      threadId: loaded.summary.threadId,
      sort: query.data.sort,
      cursor: query.data.cursor,
    });
    return communityJson({ ...page, commentCount: loaded.summary.commentCount });
  });
}

/** POST /api/comments `{target, parentId?, body, hasSpoiler}` → 201 `{comment}`. */
export function createCommentRoute(request: Request) {
  return communityWrite("community.comment_create", request, createCommentSchema, COMMUNITY_LIMITS.bodyMaxBytes, async (ctx) => {
    const comment = await createComment(ctx.tx, {
      viewer: ctx.viewer,
      slug: ctx.data.target.slug,
      parentId: ctx.data.parentId,
      body: ctx.data.body,
      hasSpoiler: ctx.data.hasSpoiler,
      now: ctx.now,
    });
    return communityJson({ comment }, 201);
  });
}

/** GET /api/comments/[id][?reveal=1]: one comment; `reveal=1` sends a spoiler body ("Show anyway"). */
export function getCommentRoute(request: Request, id: string) {
  return communityRead("community.comment_get", async ({ db, viewer, now }) => {
    if (!uuid.safeParse(id).success) return communityNotFound();
    const reveal = new URL(request.url).searchParams.get("reveal") === "1";
    const record = await findComment(db, id);
    if (!record) return communityNotFound();
    const solved = viewer && record.problemId ? await hasSolved(db, viewer.id, record.problemId) : false;
    const comment = await getCommentView(db, id, {
      viewer,
      viewerSolved: solved,
      now,
      locked: record.lockedAt !== null,
      reveal,
    });
    if (!comment) return communityNotFound();
    return communityJson({ comment });
  });
}

/** PATCH /api/comments/[id] `{body, hasSpoiler?}`: author edit within 24 h. */
export function editCommentRoute(request: Request, id: string) {
  return communityWrite("community.comment_edit", request, editCommentSchema, COMMUNITY_LIMITS.bodyMaxBytes, async (ctx) => {
    if (!uuid.safeParse(id).success) throw notFoundError("Comment not found");
    const result = await editComment(ctx.tx, {
      viewer: ctx.viewer,
      id,
      body: ctx.data.body,
      hasSpoiler: ctx.data.hasSpoiler,
      now: ctx.now,
    });
    return communityJson({ comment: result });
  });
}

/** DELETE /api/comments/[id] `{}`: author soft delete. */
export function deleteCommentRoute(request: Request, id: string) {
  return communityWrite("community.comment_delete", request, deleteCommentSchema, SMALL, async (ctx) => {
    if (!uuid.safeParse(id).success) throw notFoundError("Comment not found");
    await deleteComment(ctx.tx, { viewer: ctx.viewer, id, now: ctx.now });
    return communityJson({ ok: true });
  });
}

/** GET /api/comments/[id]/replies?cursor= */
export function listRepliesRoute(request: Request, id: string) {
  return communityRead("community.replies_list", async ({ db, viewer, now }) => {
    if (!uuid.safeParse(id).success) return communityNotFound();
    const query = repliesQuerySchema.safeParse(searchParams(request));
    if (!query.success) throw badQuery(query.error);
    const parent = await findComment(db, id);
    if (!parent || parent.depth !== 0) return communityNotFound();
    const solved = viewer && parent.problemId ? await hasSolved(db, viewer.id, parent.problemId) : false;
    const result = await listReplies(db, {
      parent: { id: parent.id, authorId: parent.authorId, status: parent.status },
      cursor: query.data.cursor,
      viewer,
      viewerSolved: solved,
      now,
      locked: parent.lockedAt !== null,
    });
    return communityJson(result);
  });
}

/** PUT /api/comments/[id]/vote `{value: 1|-1|0}` → `{score, myVote}`. */
export function voteCommentRoute(request: Request, id: string) {
  return communityWrite("community.comment_vote", request, voteSchema, SMALL, async (ctx) => {
    if (!uuid.safeParse(id).success) throw notFoundError("Comment not found");
    const result = await setCommentVote(ctx.tx, { viewer: ctx.viewer, commentId: id, value: ctx.data.value, now: ctx.now });
    return communityJson(result);
  });
}

/** PUT /api/problems/[slug]/vote `{value}` → `{likes, dislikes, myVote}`. */
export function voteProblemRoute(request: Request, slug: string) {
  return communityWrite("community.problem_vote", request, voteSchema, SMALL, async (ctx) => {
    const result = await setProblemVote(ctx.tx, { viewer: ctx.viewer, slug, value: ctx.data.value, now: ctx.now });
    return communityJson({
      ...result,
      likePercent:
        result.likes + result.dislikes >= COMMUNITY_LIMITS.likeMinVotes
          ? Math.floor((result.likes * 100) / (result.likes + result.dislikes) + 0.5)
          : null,
    });
  });
}

/** PUT /api/problems/[slug]/difficulty-feedback `{value: -1|0|1|null}`. */
export function difficultyFeedbackRoute(request: Request, slug: string) {
  return communityWrite("community.difficulty_feedback", request, difficultyFeedbackSchema, SMALL, async (ctx) => {
    const result = await setDifficultyFeedback(ctx.tx, { viewer: ctx.viewer, slug, value: ctx.data.value, now: ctx.now });
    return communityJson(result);
  });
}

/** POST /api/reports `{targetType: "comment", targetId, reason, details?}` → 201. */
export function createReportRoute(request: Request) {
  return communityWrite("community.report_create", request, reportSchema, SMALL, async (ctx) => {
    const result = await createReport(ctx.tx, {
      viewer: ctx.viewer,
      targetId: ctx.data.targetId,
      reason: ctx.data.reason,
      details: ctx.data.details,
      now: ctx.now,
    });
    return communityJson({ ok: true, id: result.id }, 201);
  });
}

/** POST /api/mod/actions `{action, targetType, targetId, reason, days?, value?}` (moderators). */
export function modActionRoute(request: Request) {
  return communityWrite("community.mod_action", request, modActionSchema, SMALL, async (ctx) => {
    const result = await applyModAction(ctx.tx, { viewer: ctx.viewer, action: ctx.data, now: ctx.now });
    return communityJson(result);
  });
}
