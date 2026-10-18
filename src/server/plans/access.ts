// Who may read or write a study plan (docs/specs/community.md AC-C-SP-2):
//   owner                          read + write
//   public                         anyone reads (guests included)
//   unlisted + the right token     anyone with the link reads (guests included)
//   anything else                  null → 404 (never 403: a private plan does not exist for others)
// Writes by non-owners on a plan they can read → 403; on one they cannot → 404.
import { randomBytes, timingSafeEqual } from "node:crypto";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { SHARE_TOKEN_PATTERN, type PlanVisibility } from "@/lib/plans/schemas";
import { studyPlans } from "@/server/db/schema";

import type { Executor } from "./types";

const idSchema = z.uuid();

export type PlanRole = "owner" | "reader";

export type PlanAccess = {
  id: string;
  ownerId: string;
  title: string;
  visibility: PlanVisibility;
  shareToken: string | null;
  itemCount: number;
  role: PlanRole;
  /** The share token the viewer presented and that matched (unlisted readers). */
  viaToken: string | null;
};

/** A fresh share token: 32 CSPRNG bytes as base64url (43 characters). */
export function generateShareToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Constant-time comparison of a presented token with the stored one. */
export function tokenMatches(stored: string | null, presented: string | null | undefined): boolean {
  if (!stored || typeof presented !== "string" || !SHARE_TOKEN_PATTERN.test(presented)) return false;
  const a = Buffer.from(stored, "utf8");
  const b = Buffer.from(presented, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The read decision for a loaded plan (pure; shared by the API and the pages). */
export function readRole(
  plan: { ownerId: string; visibility: PlanVisibility; shareToken: string | null },
  viewerId: string | null,
  share: string | null | undefined,
): { role: PlanRole; viaToken: string | null } | null {
  if (viewerId !== null && plan.ownerId === viewerId) return { role: "owner", viaToken: null };
  if (plan.visibility === "public") return { role: "reader", viaToken: tokenMatches(plan.shareToken, share) ? share! : null };
  if (plan.visibility === "unlisted" && tokenMatches(plan.shareToken, share)) return { role: "reader", viaToken: share! };
  return null;
}

export function isPlanId(value: string): boolean {
  return idSchema.safeParse(value).success;
}

/**
 * The plan if the viewer may read it, else null (unknown, malformed and
 * private-to-someone-else ids look the same). Pass `forUpdate` inside a write
 * transaction to lock the row.
 */
export async function findReadablePlan(
  db: Executor,
  planId: string,
  viewerId: string | null,
  share: string | null | undefined,
  options: { forUpdate?: boolean } = {},
): Promise<PlanAccess | null> {
  if (!isPlanId(planId)) return null;
  const query = db
    .select({
      id: studyPlans.id,
      ownerId: studyPlans.ownerId,
      title: studyPlans.title,
      visibility: studyPlans.visibility,
      shareToken: studyPlans.shareToken,
      itemCount: studyPlans.itemCount,
    })
    .from(studyPlans)
    .where(eq(studyPlans.id, planId))
    .limit(1);
  const [plan] = options.forUpdate ? await query.for("update") : await query;
  if (!plan) return null;
  const access = readRole(plan, viewerId, share);
  return access ? { ...plan, ...access } : null;
}
