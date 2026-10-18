// Reports (docs/specs/community.md §B.11, AC-C-RP-1/2): one per reporter and
// target, reasons are an enum, details ≤ 1 000. Three distinct reports by
// established (TL1) users, or one by a moderator, hide the content
// (`hidden_pending`) until a moderator decides; the auto-hide is written to
// the audit log with no actor. The reported user never learns who reported.
import { and, eq, sql } from "drizzle-orm";

import { canReport, isModerator, type CommunityViewer } from "@/lib/community/permissions";
import { COMMUNITY_LIMITS, type ReportReason } from "@/lib/community/types";
import { moderationActions, reports, submissions, users } from "@/server/db/schema";

import { requireVisibleComment, setCommentStatus } from "./comments";
import { CommunityError, assertAllowed } from "./errors";
import { enforceRateLimit, type Tx } from "./limits";

/** Open reports on a target filed by users who are TL1 now (or moderators). */
async function trustedOpenReports(tx: Tx, targetId: string, now: Date): Promise<number> {
  const established = new Date(now.getTime() - COMMUNITY_LIMITS.newAccountMs).toISOString();
  const [row] = await tx
    .select({ n: sql<number>`count(DISTINCT ${reports.reporterId})::int` })
    .from(reports)
    .innerJoin(users, eq(users.id, reports.reporterId))
    .where(
      and(
        eq(reports.targetType, "comment"),
        eq(reports.targetId, targetId),
        eq(reports.status, "open"),
        sql`(${users.role} IN ('moderator', 'admin') OR (${users.createdAt} <= ${established}::timestamptz AND exists (
          select 1 from ${submissions} s where s.user_id = "users"."id" and s.kind = 'submit' and s.status = 'accepted')))`,
      ),
    );
  return Number(row?.n ?? 0);
}

export async function createReport(
  tx: Tx,
  input: {
    viewer: CommunityViewer;
    targetId: string;
    reason: ReportReason;
    details: string | undefined;
    now: Date;
  },
): Promise<{ id: string; autoHidden: boolean }> {
  const { viewer, now } = input;
  const comment = await requireVisibleComment(tx, input.targetId, viewer);
  assertAllowed(canReport(comment, viewer, now));

  const [already] = await tx
    .select({ id: reports.id })
    .from(reports)
    .where(and(eq(reports.reporterId, viewer.id), eq(reports.targetType, "comment"), eq(reports.targetId, comment.id)))
    .limit(1);
  if (already) throw new CommunityError(409, "already_reported", "You already reported this comment.");
  await enforceRateLimit(tx, "report", viewer, now);

  const [row] = await tx
    .insert(reports)
    .values({
      reporterId: viewer.id,
      targetType: "comment",
      targetId: comment.id,
      reason: input.reason,
      details: input.details ? input.details : null,
      createdAt: now,
    })
    .returning({ id: reports.id });

  let autoHidden = false;
  if (comment.status === "visible") {
    const trusted = isModerator(viewer) ? COMMUNITY_LIMITS.autoHideReports : await trustedOpenReports(tx, comment.id, now);
    if (trusted >= COMMUNITY_LIMITS.autoHideReports) {
      await setCommentStatus(tx, comment, "hidden_pending");
      await tx.insert(moderationActions).values({
        actorId: null,
        action: "hide",
        targetType: "comment",
        targetId: comment.id,
        reason: isModerator(viewer) ? "Reported by a moderator" : `Auto-hidden after ${COMMUNITY_LIMITS.autoHideReports} reports`,
        meta: { auto: true },
        createdAt: now,
      });
      autoHidden = true;
    }
  }
  return { id: row.id, autoHidden };
}
