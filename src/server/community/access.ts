// The community view of a user (docs/specs/community.md §C.3 access.ts): role,
// suspension and trust level (account age + an accepted submission) in ONE
// query. Trust is computed per request, never stored (§B.10).
import { and, eq, sql } from "drizzle-orm";

import type { CommunityViewer } from "@/lib/community/permissions";
import { trustLevel } from "@/lib/community/trust";
import type { Db } from "@/server/db";
import { submissions, users } from "@/server/db/schema";

type Queryable = Pick<Db, "select">;

/** The viewer, or null for an unknown id (deleted user with a live cookie). */
export async function getCommunityViewer(db: Queryable, userId: string, now: Date): Promise<CommunityViewer | null> {
  const [row] = await db
    .select({
      id: users.id,
      username: users.username,
      role: users.role,
      suspendedUntil: users.communitySuspendedUntil,
      createdAt: users.createdAt,
      hasAccepted: sql<boolean>`exists (
        select 1 from ${submissions} s
        where s.user_id = "users"."id" and s.kind = 'submit' and s.status = 'accepted'
      )`,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    suspendedUntil: row.suspendedUntil,
    createdAt: row.createdAt,
    trust: trustLevel({ createdAt: row.createdAt, hasAccepted: Boolean(row.hasAccepted) }, now),
  };
}

/** Whether `userId` has an accepted submit for `problemId` (spoilers, feedback). */
export async function hasSolved(db: Queryable, userId: string, problemId: string): Promise<boolean> {
  const [row] = await db
    .select({ one: sql<number>`1` })
    .from(submissions)
    .where(
      and(
        eq(submissions.userId, userId),
        eq(submissions.problemId, problemId),
        eq(submissions.kind, "submit"),
        eq(submissions.status, "accepted"),
      ),
    )
    .limit(1);
  return row !== undefined;
}
