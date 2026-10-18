// `pnpm community:difficulty-report`: the maintainer report of difficulty
// feedback (docs/specs/community.md §C.10). Per problem with feedback: the
// easier / about right / harder counts next to the author rating, the
// observed rating_adjust and the solve rate, so a maintainer can propose a
// meta.json "rating" change in a PR. Read-only: feedback never changes
// ratings automatically (owner decision, AC-C-VT-5).
import { existsSync } from "node:fs";

import { sql } from "drizzle-orm";

import { createDb, directDatabaseUrl } from "@/server/db";
import { describeDbTarget } from "@/server/db/config";

type Row = {
  number: number;
  slug: string;
  difficulty: string;
  author_rating: number | null;
  rating_adjust: number;
  easier: number;
  right: number;
  harder: number;
  solvers: number;
  attempters: number;
};

async function main(): Promise<number> {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const url = directDatabaseUrl();
  console.log(`Database: ${describeDbTarget(url)}`);
  const { db, pool } = createDb(url);
  try {
    const { rows } = await db.execute<Row>(sql`
      SELECT p.number, p.slug, p.difficulty, p.author_rating, p.rating_adjust,
        count(*) FILTER (WHERE f.value = -1)::int AS easier,
        count(*) FILTER (WHERE f.value = 0)::int AS right,
        count(*) FILTER (WHERE f.value = 1)::int AS harder,
        (SELECT count(DISTINCT s.user_id)::int FROM submissions s
          WHERE s.problem_id = p.id AND s.kind = 'submit' AND s.status = 'accepted') AS solvers,
        (SELECT count(DISTINCT s.user_id)::int FROM submissions s
          WHERE s.problem_id = p.id AND s.kind = 'submit') AS attempters
      FROM problems p JOIN problem_difficulty_feedback f ON f.problem_id = p.id
      GROUP BY p.id ORDER BY p.number`);
    if (rows.length === 0) {
      console.log("No difficulty feedback yet.");
      return 0;
    }
    const header = ["#", "slug", "difficulty", "author", "adjust", "easier", "right", "harder", "n", "solve rate"];
    const lines = rows.map((r) => {
      const n = r.easier + r.right + r.harder;
      const rate = r.attempters > 0 ? `${Math.round((r.solvers * 100) / r.attempters)}%` : "—";
      return [r.number, r.slug, r.difficulty, r.author_rating ?? "—", r.rating_adjust, r.easier, r.right, r.harder, n, rate].map(String);
    });
    const widths = header.map((h, i) => Math.max(h.length, ...lines.map((l) => l[i].length)));
    const fmt = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join("  ");
    console.log(fmt(header));
    for (const l of lines) console.log(fmt(l));
    return 0;
  } finally {
    await pool.end();
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error("community:difficulty-report failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
