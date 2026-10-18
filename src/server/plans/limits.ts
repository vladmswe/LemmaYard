// Write limits for study plans (docs/specs/community.md §B.11, §C.7).
//
// SWAP POINT: C1 builds the shared DB-counted community limiter. Until it is
// merged, plan writes go through this small interface only:
//   lockPlanWriter(tx, userId)   per-user advisory lock (same key C1 uses)
//   checkPlanWriteRate(tx, ...)  counts the user's own recent rows → 429
// Both run inside the write transaction, so the limits hold across Vercel
// instances (no in-memory state). Replace the bodies with C1's helper at merge.
import { sql } from "drizzle-orm";

import type { Tx } from "./types";

/** §B.11 "Study plan writes": TL0 120 / hour, TL1 300 / hour. */
export const PLAN_WRITES_PER_HOUR = { new: 120, established: 300 } as const;
/** Trust level 0 ("new"): account younger than 72 h or no accepted submit yet (§B.10). */
export const NEW_ACCOUNT_HOURS = 72;

/**
 * Serializes one user's community writes: `pg_advisory_xact_lock(hashtext('community:' || user))`.
 * Taken first in every plan write; never while holding a room or session lock.
 */
export async function lockPlanWriter(tx: Tx, userId: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`community:${userId}`}))`);
}

export type RateCheck = { ok: true } | { ok: false; retryAfterSec: number };

/**
 * Counts the user's plan writes of the last hour from the rows themselves (the
 * content is the log, §C.7): plans created, sections created, item batches
 * added (one batch = one transaction = one `created_at` per plan), ticks
 * set and plans saved. Edits, reorders and deletions are not counted: they cannot grow the
 * data and are bounded by the plan limits. One statement; call it after
 * `lockPlanWriter` in the same transaction.
 */
export async function checkPlanWriteRate(tx: Tx, userId: string, cost = 1): Promise<RateCheck> {
  const { rows } = await tx.execute<{ writes: number; oldest: Date | null; established: boolean }>(sql`
    WITH mine AS (SELECT id FROM study_plans WHERE owner_id = ${userId}),
    events AS (
      SELECT created_at AS at FROM study_plans WHERE owner_id = ${userId} AND created_at > now() - interval '1 hour'
      UNION ALL
      SELECT s.created_at FROM study_plan_sections s JOIN mine m ON m.id = s.plan_id
        WHERE s.created_at > now() - interval '1 hour'
      UNION ALL
      SELECT DISTINCT ON (i.plan_id, i.created_at) i.created_at FROM study_plan_items i JOIN mine m ON m.id = i.plan_id
        WHERE i.created_at > now() - interval '1 hour'
      UNION ALL
      SELECT done_at FROM study_plan_ticks WHERE user_id = ${userId} AND done_at > now() - interval '1 hour'
      UNION ALL
      SELECT created_at FROM study_plan_saves WHERE user_id = ${userId} AND created_at > now() - interval '1 hour'
    )
    SELECT
      (SELECT count(*)::int FROM events) AS writes,
      (SELECT min(at) FROM events) AS oldest,
      EXISTS (
        SELECT 1 FROM users u WHERE u.id = ${userId}
          AND u.created_at <= now() - make_interval(hours => ${NEW_ACCOUNT_HOURS}::int)
          AND EXISTS (SELECT 1 FROM submissions s WHERE s.user_id = u.id AND s.kind = 'submit' AND s.status = 'accepted')
      ) AS established
  `);
  const row = rows[0];
  const limit = row.established ? PLAN_WRITES_PER_HOUR.established : PLAN_WRITES_PER_HOUR.new;
  if (row.writes + cost <= limit) return { ok: true };
  const oldest = row.oldest ? new Date(row.oldest).getTime() : Date.now();
  const retryAfterSec = Math.min(3600, Math.max(1, Math.ceil((oldest + 3600_000 - Date.now()) / 1000)));
  return { ok: false, retryAfterSec };
}
