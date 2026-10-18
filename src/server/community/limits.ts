// DB-counted rate limits (docs/specs/community.md §C.7). Shared helper for
// every community write (C1 comments, edits, votes, reports; C2 plan writes,
// C3 posts and companies reuse it):
//
//   await withCommunityLock(tx, userId);            // 1. serialize this user's writes
//   await enforceRateLimit(tx, "comment", viewer, now); // 2. count own rows, 429 if over
//   ...write...                                      // 3. same transaction
//
// No token-bucket table: the content is the log. The lock is a per-user
// advisory transaction lock, so two Vercel instances (two pools) still count
// consistently. Lock order (CLAUDE.md): `community:<user>` is a user-level
// lock taken first and never while holding a room or session lock.
import { sql, type SQL } from "drizzle-orm";

import { isModerator, type CommunityViewer } from "@/lib/community/permissions";
import {
  evaluateWindows,
  retryHint,
  rulesFor,
  type LimitDecision,
  type RateAction,
  type WindowRule,
  type WindowStat,
} from "@/lib/community/rate-limits";
import type { Db } from "@/server/db";
import {
  commentVotes,
  comments,
  contentRevisions,
  problemDifficultyFeedback,
  problemVotes,
  reports,
} from "@/server/db/schema";

import { CommunityError } from "./errors";

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Executor = Pick<Db, "execute">;

/** `pg_advisory_xact_lock(hashtext('community:' || user))` until the transaction ends. */
export async function withCommunityLock(tx: Executor, userId: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`community:${userId}`}))`);
}

/**
 * The user's own rows that count for `action`, as `SELECT <time> AS at`.
 * Every source has a (user, time) index. Votes count by `updated_at`, so a
 * changed vote counts again (§C.7).
 */
export function limitSource(action: RateAction, userId: string): SQL {
  switch (action) {
    case "comment":
      return sql`SELECT ${comments.createdAt} AS at FROM ${comments} WHERE ${comments.authorId} = ${userId}`;
    case "edit":
      return sql`SELECT ${contentRevisions.createdAt} AS at FROM ${contentRevisions} WHERE ${contentRevisions.editedBy} = ${userId}`;
    case "vote":
      return sql`SELECT ${commentVotes.updatedAt} AS at FROM ${commentVotes} WHERE ${commentVotes.userId} = ${userId}
        UNION ALL SELECT ${problemVotes.updatedAt} FROM ${problemVotes} WHERE ${problemVotes.userId} = ${userId}
        UNION ALL SELECT ${problemDifficultyFeedback.updatedAt} FROM ${problemDifficultyFeedback} WHERE ${problemDifficultyFeedback.userId} = ${userId}`;
    case "downvote":
      return sql`SELECT ${commentVotes.updatedAt} AS at FROM ${commentVotes} WHERE ${commentVotes.userId} = ${userId} AND ${commentVotes.value} = -1
        UNION ALL SELECT ${problemVotes.updatedAt} FROM ${problemVotes} WHERE ${problemVotes.userId} = ${userId} AND ${problemVotes.value} = -1`;
    case "report":
      return sql`SELECT ${reports.createdAt} AS at FROM ${reports} WHERE ${reports.reporterId} = ${userId}`;
  }
}

/**
 * Count and oldest time per window over `source` (a `SELECT … AS at`) in
 * ONE query. Generic: C2/C3 pass their own sources and rules.
 */
export async function windowStats(
  tx: Executor,
  source: SQL,
  rules: readonly WindowRule[],
  now: Date,
): Promise<WindowStat[]> {
  if (rules.length === 0) return [];
  const sinces = rules.map((r) => new Date(now.getTime() - r.windowMs));
  const earliest = new Date(Math.min(...sinces.map((d) => d.getTime())));
  const columns = sql.join(
    sinces.map(
      (since, i) =>
        sql`count(*) FILTER (WHERE s.at >= ${since.toISOString()}::timestamptz)::int AS ${sql.raw(`c${i}`)},
            min(s.at) FILTER (WHERE s.at >= ${since.toISOString()}::timestamptz) AS ${sql.raw(`o${i}`)}`,
    ),
    sql`, `,
  );
  const { rows } = await tx.execute<Record<string, unknown>>(
    sql`SELECT ${columns} FROM (${source}) s WHERE s.at >= ${earliest.toISOString()}::timestamptz`,
  );
  const row = rows[0] ?? {};
  return rules.map((_, i) => {
    const oldest = row[`o${i}`];
    return {
      count: Number(row[`c${i}`] ?? 0),
      oldest: oldest === null || oldest === undefined ? null : new Date(oldest as string | Date),
    };
  });
}

/** The decision for `action` (no query when the viewer is not limited). */
export async function checkRateLimit(
  tx: Executor,
  action: RateAction,
  viewer: CommunityViewer,
  now: Date,
): Promise<LimitDecision> {
  const rules = rulesFor(action, viewer.trust, isModerator(viewer));
  if (rules.length === 0) return { ok: true };
  const stats = await windowStats(tx, limitSource(action, viewer.id), rules, now);
  return evaluateWindows(rules, stats, now);
}

/** Throws a 429 `CommunityError` (with `Retry-After`) when one more `action` is over a limit. */
export async function enforceRateLimit(
  tx: Executor,
  action: RateAction,
  viewer: CommunityViewer,
  now: Date,
): Promise<void> {
  const decision = await checkRateLimit(tx, action, viewer, now);
  if (!decision.ok) {
    throw new CommunityError(429, "rate_limited", `Limit reached (${decision.rule.label}). ${retryHint(decision.retryAfterSec)}`, {
      retryAfterSec: decision.retryAfterSec,
    });
  }
}
