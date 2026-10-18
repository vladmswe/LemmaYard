// Moderation (docs/specs/community.md §C.8 C1 minimum, AC-C-RP-3/4/5).
// Actions need a reason, write `moderation_actions` (the audit log) and
// resolve the open reports on the target, all in one transaction. Only
// moderators and admins (users.role, set by `pnpm user:role`) may act; the
// role check comes first so non-moderators learn nothing about targets.
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { isModerator, type CommunityViewer } from "@/lib/community/permissions";
import type { ModActionInput } from "@/lib/community/schemas";
import { COMMUNITY_LIMITS, type ContentStatus, type ReportReason } from "@/lib/community/types";
import type { Db } from "@/server/db";
import {
  comments,
  discussionThreads,
  moderationActions,
  problems,
  reports,
  users,
} from "@/server/db/schema";

import { findComment, setCommentStatus } from "./comments";
import { CommunityError, notFoundError } from "./errors";
import type { Tx } from "./limits";

export function requireModerator(viewer: CommunityViewer): void {
  if (!isModerator(viewer)) throw new CommunityError(403, "forbidden", "Moderators only.");
}

async function resolveReports(
  tx: Tx,
  targetId: string,
  status: "actioned" | "dismissed",
  viewer: CommunityViewer,
  note: string,
  now: Date,
): Promise<number> {
  const rows = await tx
    .update(reports)
    .set({ status, resolvedBy: viewer.id, resolvedAt: now, resolutionNote: note.slice(0, 500) })
    .where(and(eq(reports.targetType, "comment"), eq(reports.targetId, targetId), eq(reports.status, "open")))
    .returning({ id: reports.id });
  return rows.length;
}

const conflict = (message: string) => new CommunityError(409, "invalid_state", message);

/** `POST /api/mod/actions`. */
export async function applyModAction(
  tx: Tx,
  input: { viewer: CommunityViewer; action: ModActionInput; now: Date },
): Promise<{ ok: true; status?: ContentStatus; resolvedReports: number }> {
  const { viewer, action: a, now } = input;
  requireModerator(viewer);
  const meta: Record<string, unknown> = {};
  let resolvedReports = 0;
  let status: ContentStatus | undefined;

  if (a.targetType === "comment") {
    const comment = await findComment(tx, a.targetId, true);
    if (!comment) throw notFoundError("Comment not found");
    switch (a.action) {
      case "hide":
        if (comment.status !== "visible") throw conflict("Only a visible comment can be hidden.");
        await setCommentStatus(tx, comment, (status = "hidden_pending"));
        resolvedReports = await resolveReports(tx, comment.id, "actioned", viewer, a.reason, now);
        break;
      case "restore":
        if (comment.status !== "hidden_pending" && comment.status !== "removed") {
          throw conflict("Only hidden or removed comments can be restored.");
        }
        await setCommentStatus(tx, comment, (status = "visible"), { removedAt: null, removedReason: null });
        resolvedReports = await resolveReports(tx, comment.id, "dismissed", viewer, a.reason, now);
        break;
      case "remove":
        if (comment.status === "removed" || comment.status === "deleted") {
          throw conflict("This comment is already gone.");
        }
        await setCommentStatus(tx, comment, (status = "removed"), {
          removedAt: now,
          removedReason: a.reason.slice(0, COMMUNITY_LIMITS.removedReasonMax),
        });
        resolvedReports = await resolveReports(tx, comment.id, "actioned", viewer, a.reason, now);
        break;
      case "set_spoiler": {
        const value = a.value ?? true;
        if (comment.status === "deleted") throw conflict("This comment was deleted.");
        if (comment.hasSpoiler === value) throw conflict(value ? "Already marked as a solution." : "Not marked as a solution.");
        await tx.update(comments).set({ hasSpoiler: value }).where(eq(comments.id, comment.id));
        meta.value = value;
        resolvedReports = await resolveReports(tx, comment.id, "actioned", viewer, a.reason, now);
        break;
      }
      case "dismiss":
        resolvedReports = await resolveReports(tx, comment.id, "dismissed", viewer, a.reason, now);
        if (resolvedReports === 0) throw conflict("There are no open reports on this comment.");
        break;
      default:
        throw new CommunityError(400, "invalid_action", "This action does not apply to a comment.");
    }
  } else if (a.targetType === "thread") {
    const [thread] = await tx
      .select({ id: discussionThreads.id, lockedAt: discussionThreads.lockedAt })
      .from(discussionThreads)
      .where(eq(discussionThreads.id, a.targetId))
      .for("update");
    if (!thread) throw notFoundError("Discussion not found");
    if (a.action === "lock") {
      if (thread.lockedAt) throw conflict("This discussion is already locked.");
      await tx.update(discussionThreads).set({ lockedAt: now }).where(eq(discussionThreads.id, thread.id));
    } else if (a.action === "unlock") {
      if (!thread.lockedAt) throw conflict("This discussion is not locked.");
      await tx.update(discussionThreads).set({ lockedAt: null }).where(eq(discussionThreads.id, thread.id));
    } else {
      throw new CommunityError(400, "invalid_action", "This action does not apply to a discussion.");
    }
  } else {
    const [target] = await tx
      .select({ id: users.id, role: users.role, until: users.communitySuspendedUntil })
      .from(users)
      .where(eq(users.id, a.targetId))
      .for("update");
    if (!target) throw notFoundError("User not found");
    if (target.id === viewer.id) throw new CommunityError(403, "forbidden", "You cannot suspend yourself.");
    if (target.role !== "user" && viewer.role !== "admin") {
      throw new CommunityError(403, "forbidden", "Only an admin can suspend a moderator.");
    }
    if (a.action === "suspend") {
      const until = new Date(now.getTime() + (a.days ?? 7) * 24 * 60 * 60 * 1000);
      await tx.update(users).set({ communitySuspendedUntil: until }).where(eq(users.id, target.id));
      meta.days = a.days;
      meta.until = until.toISOString();
    } else if (a.action === "unsuspend") {
      if (!target.until || target.until.getTime() <= now.getTime()) throw conflict("This user is not suspended.");
      await tx.update(users).set({ communitySuspendedUntil: null }).where(eq(users.id, target.id));
    } else {
      throw new CommunityError(400, "invalid_action", "This action does not apply to a user.");
    }
  }

  if (resolvedReports > 0) meta.resolvedReports = resolvedReports;
  await tx.insert(moderationActions).values({
    actorId: viewer.id,
    action: a.action,
    targetType: a.targetType,
    targetId: a.targetId,
    reason: a.reason,
    meta: Object.keys(meta).length > 0 ? meta : null,
    createdAt: now,
  });
  return { ok: true, status, resolvedReports };
}

// --- The /mod page ---------------------------------------------------------

export type QueueItem = {
  commentId: string;
  excerpt: string;
  status: ContentStatus;
  hasSpoiler: boolean;
  depth: 0 | 1;
  problem: { slug: string; title: string; number: number } | null;
  author: { id: string; username: string; createdAt: string; removals: number; suspendedUntil: string | null } | null;
  reportCount: number;
  reasons: { reason: ReportReason; count: number }[];
  details: string[];
  firstReportedAt: string | null;
  createdAt: string;
};

const EXCERPT = 160;

function excerptOf(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > EXCERPT ? `${flat.slice(0, EXCERPT - 1)}…` : flat;
}

type Queryable = Pick<Db, "select">;

/** Content behind `ids` with author facts (one query). */
async function loadTargets(db: Queryable, ids: string[]) {
  if (ids.length === 0) return new Map<string, Omit<QueueItem, "reportCount" | "reasons" | "details" | "firstReportedAt">>();
  const rows = await db
    .select({
      id: comments.id,
      body: comments.bodyMd,
      status: comments.status,
      hasSpoiler: comments.hasSpoiler,
      depth: comments.depth,
      createdAt: comments.createdAt,
      slug: problems.slug,
      title: problems.title,
      number: problems.number,
      authorId: users.id,
      username: users.username,
      authorCreatedAt: users.createdAt,
      suspendedUntil: users.communitySuspendedUntil,
      removals: sql<number>`(select count(*)::int from ${comments} c2 where c2.author_id = "comments"."author_id" and c2.status = 'removed')`,
    })
    .from(comments)
    .innerJoin(discussionThreads, eq(discussionThreads.id, comments.threadId))
    .leftJoin(problems, eq(problems.id, discussionThreads.problemId))
    .leftJoin(users, eq(users.id, comments.authorId))
    .where(inArray(comments.id, ids));
  return new Map(
    rows.map((r) => [
      r.id,
      {
        commentId: r.id,
        excerpt: r.status === "deleted" ? "(deleted by its author)" : excerptOf(r.body),
        status: r.status,
        hasSpoiler: r.hasSpoiler,
        depth: (r.depth === 1 ? 1 : 0) as 0 | 1,
        problem: r.slug ? { slug: r.slug, title: r.title!, number: r.number! } : null,
        author: r.authorId
          ? {
              id: r.authorId,
              username: r.username!,
              createdAt: r.authorCreatedAt!.toISOString(),
              removals: Number(r.removals),
              suspendedUntil: r.suspendedUntil ? r.suspendedUntil.toISOString() : null,
            }
          : null,
        createdAt: r.createdAt.toISOString(),
      },
    ]),
  );
}

/** Open reports grouped by target, oldest first (AC-C-RP-4). */
export async function listOpenReports(db: Queryable, limit = 50): Promise<QueueItem[]> {
  const grouped = await db
    .select({
      targetId: reports.targetId,
      count: sql<number>`count(*)::int`,
      first: sql<Date>`min(${reports.createdAt})`,
      reasons: sql<{ reason: ReportReason; count: number }[]>`(
        select json_agg(json_build_object('reason', x.reason, 'count', x.n) order by x.n desc, x.reason)
        from (select r2.reason, count(*)::int as n from ${reports} r2
              where r2.target_type = 'comment' and r2.target_id = "reports"."target_id" and r2.status = 'open'
              group by r2.reason) x)`,
      details: sql<string[] | null>`array_remove(array_agg(${reports.details} order by ${reports.createdAt}), null)`,
    })
    .from(reports)
    .where(and(eq(reports.status, "open"), eq(reports.targetType, "comment")))
    .groupBy(reports.targetId)
    .orderBy(asc(sql`min(${reports.createdAt})`))
    .limit(limit);
  const targets = await loadTargets(
    db,
    grouped.map((g) => g.targetId),
  );
  return grouped.flatMap((g) => {
    const t = targets.get(g.targetId);
    if (!t) return [];
    return [
      {
        ...t,
        reportCount: g.count,
        reasons: g.reasons ?? [],
        details: (g.details ?? []).slice(0, 5),
        firstReportedAt: new Date(g.first).toISOString(),
      },
    ];
  });
}

/** Comments held for review or auto-hidden (status hidden_pending), oldest first. */
export async function listHiddenPending(db: Queryable, limit = 50): Promise<QueueItem[]> {
  const rows = await db
    .select({ id: comments.id })
    .from(comments)
    .where(eq(comments.status, "hidden_pending"))
    .orderBy(asc(comments.createdAt))
    .limit(limit);
  const ids = rows.map((r) => r.id);
  const targets = await loadTargets(db, ids);
  const counts = ids.length
    ? await db
        .select({ targetId: reports.targetId, count: sql<number>`count(*)::int` })
        .from(reports)
        .where(and(eq(reports.targetType, "comment"), inArray(reports.targetId, ids), eq(reports.status, "open")))
        .groupBy(reports.targetId)
    : [];
  const byId = new Map(counts.map((c) => [c.targetId, c.count]));
  return ids.flatMap((id) => {
    const t = targets.get(id);
    return t ? [{ ...t, reportCount: byId.get(id) ?? 0, reasons: [], details: [], firstReportedAt: null }] : [];
  });
}

export type AuditEntry = {
  id: string;
  actor: string | null;
  action: string;
  targetType: string;
  targetId: string;
  reason: string;
  meta: Record<string, unknown> | null;
  createdAt: string;
};

export async function listAuditLog(db: Queryable, limit = 100): Promise<AuditEntry[]> {
  const rows = await db
    .select({
      id: moderationActions.id,
      actor: users.username,
      action: moderationActions.action,
      targetType: moderationActions.targetType,
      targetId: moderationActions.targetId,
      reason: moderationActions.reason,
      meta: moderationActions.meta,
      createdAt: moderationActions.createdAt,
    })
    .from(moderationActions)
    .leftJoin(users, eq(users.id, moderationActions.actorId))
    .orderBy(desc(moderationActions.createdAt), desc(moderationActions.id))
    .limit(limit);
  return rows.map((r) => ({ ...r, actor: r.actor ?? null, createdAt: r.createdAt.toISOString() }));
}

/** Count for the badge in the account menu: targets with open reports + held comments. */
export async function moderationQueueCount(db: Queryable): Promise<number> {
  const [row] = await db
    .select({
      n: sql<number>`(select count(DISTINCT r.target_id)::int from ${reports} r where r.status = 'open')
        + (select count(*)::int from ${comments} c where c.status = 'hidden_pending'
           and not exists (select 1 from ${reports} r2 where r2.target_id = c.id and r2.status = 'open'))`,
    })
    .from(sql`(select 1) as one`);
  return Number(row?.n ?? 0);
}
