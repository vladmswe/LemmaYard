// Ranking and vote math (docs/specs/community.md §B.4). Pure; the SQL twin of
// wilsonLowerBound is the generated column `comments.rank_best`
// (WILSON_SQL_TEMPLATE below, used by src/server/db/schema.ts), and a parity
// test keeps them in step (AC-C-VT-3).

/** z for a 95 % confidence interval. */
export const WILSON_Z = 1.96;

/**
 * Lower bound of the Wilson score interval for `up` positive out of
 * `up + down` votes (Evan Miller, "How Not To Sort By Average Rating").
 * 0 when there are no votes.
 */
export function wilsonLowerBound(up: number, down: number, z: number = WILSON_Z): number {
  const n = up + down;
  if (n <= 0) return 0;
  const p = up / n;
  const z2 = z * z;
  return (p + z2 / (2 * n) - z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / (1 + z2 / n);
}

/**
 * The same formula in SQL over two integer columns, immutable so it can be a
 * STORED generated column. `{u}` / `{d}` are replaced by the column names.
 * Constants are z = 1.96: z² = 3.8416, z²/2 = 1.9208, z²/4 = 0.9604.
 */
export function wilsonSql(u: string, d: string): string {
  const n = `(${u} + ${d})::double precision`;
  const p = `(${u}::double precision / ${n})`;
  return `CASE WHEN (${u} + ${d}) = 0 THEN 0::double precision ELSE (${p} + 1.9208::double precision / ${n} - 1.96::double precision * sqrt((${p} * (1::double precision - ${p}) + 0.9604::double precision / ${n}) / ${n})) / (1::double precision + 3.8416::double precision / ${n}) END`;
}

/** Net score shown next to a comment (▲ − ▼). */
export function netScore(up: number, down: number): number {
  return up - down;
}

/**
 * New counters after a vote changes from `previous` to `next` (each −1, 0 or
 * +1; 0 = no vote). The deltas are applied with `count = count + delta` in
 * the vote's transaction.
 */
export function voteDelta(previous: -1 | 0 | 1, next: -1 | 0 | 1): { up: number; down: number } {
  return {
    up: (next === 1 ? 1 : 0) - (previous === 1 ? 1 : 0),
    down: (next === -1 ? 1 : 0) - (previous === -1 ? 1 : 0),
  };
}

/**
 * "% liked" for a problem (AC-C-VT-4): hidden (null) below `minVotes` votes,
 * otherwise the integer percent of likes (rounded half up).
 */
export function likePercent(likes: number, dislikes: number, minVotes: number): number | null {
  const total = likes + dislikes;
  if (total < minVotes || total <= 0) return null;
  return Math.floor((likes * 100) / total + 0.5);
}

export type FeedbackCounts = { easier: number; right: number; harder: number };

export type FeedbackSummary = {
  total: number;
  /** The most common answer; ties go to "right" first, then "harder". Null below the threshold. */
  verdict: "easier" | "right" | "harder" | null;
};

/** Difficulty-feedback summary (AC-C-VT-5): shown only from `minAnswers` answers. */
export function feedbackSummary(counts: FeedbackCounts, minAnswers: number): FeedbackSummary {
  const total = counts.easier + counts.right + counts.harder;
  if (total < minAnswers || total === 0) return { total, verdict: null };
  const order: ("right" | "harder" | "easier")[] = ["right", "harder", "easier"];
  let best = order[0];
  for (const key of order) if (counts[key] > counts[best]) best = key;
  return { total, verdict: best };
}

/** The sentence for a summary, e.g. "Most solvers found it harder than its rating". */
export function feedbackSentence(verdict: NonNullable<FeedbackSummary["verdict"]>): string {
  if (verdict === "right") return "Most solvers found its rating about right";
  return `Most solvers found it ${verdict} than its rating`;
}
