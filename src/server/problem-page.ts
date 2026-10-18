// Data for the problem page (AC-M3-4). The returned object is what the page
// renders and passes to client components, so it carries ONLY sample tests:
// hidden tests (inputs and expected values) never leave the server.
import { and, asc, eq, sql } from "drizzle-orm";

import type { CatalogDifficulty, CatalogStatus } from "@/lib/catalog/filters";
import type { Signature } from "@/lib/problems/schema";
import type { Language } from "@/lib/submission-dto";
import { PROBLEM_ID } from "@/server/catalog";
import { type Db, getDb } from "@/server/db";
import { problems, problemTags, submissions, tags, testCases } from "@/server/db/schema";

export type SampleTest = { input: Record<string, unknown>; expected: unknown };

export type ProblemPageData = {
  number: number;
  slug: string;
  title: string;
  difficulty: CatalogDifficulty;
  descriptionMd: string;
  signature: Signature;
  /** Languages with a verified reference solution (`problems.languages`). */
  languages: Language[];
  /** `problems.wide_ints`: int positions the Java template declares `long`. */
  wideInts: string[];
  tags: { slug: string; name: string }[];
  /** Sample tests only (`is_sample`), in file order. */
  samples: SampleTest[];
  /** Null for guests. */
  status: CatalogStatus | null;
};

/**
 * The published problem `slug` with its sample tests and the user's status,
 * or null when the slug is unknown or unpublished (the page answers 404).
 */
export async function getProblemPageData(
  slug: string,
  userId: string | null,
  db: Db = getDb(),
): Promise<ProblemPageData | null> {
  const [problem] = await db
    .select({
      id: problems.id,
      number: problems.number,
      slug: problems.slug,
      title: problems.title,
      difficulty: problems.difficulty,
      descriptionMd: problems.descriptionMd,
      signature: problems.signature,
      languages: problems.languages,
      wideInts: problems.wideInts,
      tags: sql<{ slug: string; name: string }[] | null>`(
        select json_agg(json_build_object('slug', t.slug, 'name', t.name) order by t.name)
        from ${problemTags} pt inner join ${tags} t on t.id = pt.tag_id
        where pt.problem_id = ${PROBLEM_ID}
      )`,
    })
    .from(problems)
    .where(and(eq(problems.slug, slug), eq(problems.published, true)))
    .limit(1);
  if (!problem) return null;

  const [samples, statusRows] = await Promise.all([
    db
      .select({ input: testCases.input, expected: testCases.expected })
      .from(testCases)
      .where(and(eq(testCases.problemId, problem.id), eq(testCases.isSample, true)))
      .orderBy(asc(testCases.position)),
    userId
      ? db
          .select({ solved: sql<boolean>`bool_or(${submissions.status} = 'accepted')` })
          .from(submissions)
          .where(
            and(
              eq(submissions.userId, userId),
              eq(submissions.problemId, problem.id),
              eq(submissions.kind, "submit"),
            ),
          )
      : Promise.resolve(null),
  ]);

  let status: CatalogStatus | null = null;
  if (statusRows) {
    const solved = statusRows[0]?.solved;
    status = solved === null || solved === undefined ? "todo" : solved ? "solved" : "attempted";
  }

  return {
    number: problem.number,
    slug: problem.slug,
    title: problem.title,
    difficulty: problem.difficulty,
    descriptionMd: problem.descriptionMd,
    signature: problem.signature,
    languages: problem.languages,
    wideInts: problem.wideInts,
    tags: problem.tags ?? [],
    samples: samples.map((s) => ({ input: s.input, expected: s.expected })),
    status,
  };
}
