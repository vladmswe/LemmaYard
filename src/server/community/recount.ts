// Counter recount (docs/specs/community.md §C.1 "Counters vs computed"):
// rebuilds every denormalized community counter from its source rows.
// `pnpm community:recount` runs it (also after manual SQL); the integration
// suite runs `counterDrift` after its concurrency tests and expects none.
//   comments.up_count / down_count   ← comment_votes
//   comments.reply_count             ← visible replies
//   discussion_threads.comment_count ← visible comments
//   problems.like_count / dislike_count ← problem_votes
import { sql } from "drizzle-orm";

import type { Db } from "@/server/db";

type Executor = Pick<Db, "execute">;

const COMMENT_TRUTH = sql`
  SELECT c.id,
    coalesce((SELECT count(*) FROM comment_votes v WHERE v.comment_id = c.id AND v.value = 1), 0)::int AS up,
    coalesce((SELECT count(*) FROM comment_votes v WHERE v.comment_id = c.id AND v.value = -1), 0)::int AS down,
    coalesce((SELECT count(*) FROM comments r WHERE r.parent_id = c.id AND r.status = 'visible'), 0)::int AS replies
  FROM comments c`;

const THREAD_TRUTH = sql`
  SELECT t.id, coalesce((SELECT count(*) FROM comments c WHERE c.thread_id = t.id AND c.status = 'visible'), 0)::int AS n
  FROM discussion_threads t`;

const PROBLEM_TRUTH = sql`
  SELECT p.id,
    coalesce((SELECT count(*) FROM problem_votes v WHERE v.problem_id = p.id AND v.value = 1), 0)::int AS likes,
    coalesce((SELECT count(*) FROM problem_votes v WHERE v.problem_id = p.id AND v.value = -1), 0)::int AS dislikes
  FROM problems p`;

export type CounterDrift = { table: string; id: string; column: string; stored: number; actual: number };

/** Every counter that differs from a recount (empty = consistent). */
export async function counterDrift(db: Executor): Promise<CounterDrift[]> {
  const { rows } = await db.execute<CounterDrift>(sql`
    SELECT 'comments' AS table, c.id::text AS id, x.col AS column, x.stored, x.actual
    FROM comments c JOIN (${COMMENT_TRUTH}) t ON t.id = c.id
    CROSS JOIN LATERAL (VALUES ('up_count', c.up_count, t.up), ('down_count', c.down_count, t.down),
                               ('reply_count', c.reply_count, t.replies)) AS x(col, stored, actual)
    WHERE x.stored <> x.actual
    UNION ALL
    SELECT 'discussion_threads', d.id::text, 'comment_count', d.comment_count, t.n
    FROM discussion_threads d JOIN (${THREAD_TRUTH}) t ON t.id = d.id WHERE d.comment_count <> t.n
    UNION ALL
    SELECT 'problems', p.id::text, x.col, x.stored, x.actual
    FROM problems p JOIN (${PROBLEM_TRUTH}) t ON t.id = p.id
    CROSS JOIN LATERAL (VALUES ('like_count', p.like_count, t.likes), ('dislike_count', p.dislike_count, t.dislikes))
      AS x(col, stored, actual)
    WHERE x.stored <> x.actual
  `);
  return rows.map((r) => ({ ...r, stored: Number(r.stored), actual: Number(r.actual) }));
}

/** Rewrites every drifted counter; returns how many rows changed per table. */
export async function recountCommunity(db: Pick<Db, "transaction">): Promise<Record<string, number>> {
  return db.transaction(async (tx) => {
    const comments = await tx.execute(sql`
      UPDATE comments c SET up_count = t.up, down_count = t.down, reply_count = t.replies
      FROM (${COMMENT_TRUTH}) t
      WHERE t.id = c.id AND (c.up_count, c.down_count, c.reply_count) IS DISTINCT FROM (t.up, t.down, t.replies)`);
    const threads = await tx.execute(sql`
      UPDATE discussion_threads d SET comment_count = t.n FROM (${THREAD_TRUTH}) t
      WHERE t.id = d.id AND d.comment_count <> t.n`);
    // updated_at untouched: a recount is not a catalog edit.
    const problems = await tx.execute(sql`
      UPDATE problems p SET like_count = t.likes, dislike_count = t.dislikes FROM (${PROBLEM_TRUTH}) t
      WHERE t.id = p.id AND (p.like_count, p.dislike_count) IS DISTINCT FROM (t.likes, t.dislikes)`);
    return {
      comments: comments.rowCount ?? 0,
      discussion_threads: threads.rowCount ?? 0,
      problems: problems.rowCount ?? 0,
    };
  });
}
