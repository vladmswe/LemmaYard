// Loads and validates `problems/<slug>/` directories and upserts them into the
// database (PLAN.md section 5). Validation of every problem happens before any
// write; the write itself is a single transaction.
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import type { z } from "zod";

import {
  MAX_PROBLEM_NUMBER,
  metaSchema,
  testsSchema,
  type ProblemMeta,
  type ProblemTest,
} from "@/lib/problems/schema";
import { findUnsafeNumberLiterals, parseType, validateInput, validateValue } from "@/lib/types";
import type { Db } from "@/server/db";
import { problems, problemTags, tags, testCases } from "@/server/db/schema";

export const REQUIRED_FILES = [
  "meta.json",
  "description.md",
  "tests.json",
  "solution.py",
  "solution.js",
] as const;

export type LoadedProblem = {
  dir: string;
  meta: ProblemMeta;
  descriptionMd: string;
  tests: ProblemTest[];
};

export class ProblemValidationError extends Error {
  constructor(readonly errors: string[]) {
    super(`Problem validation failed:\n${errors.map((e) => `  ${e}`).join("\n")}`);
    this.name = "ProblemValidationError";
  }
}

const display = (p: string) => path.relative(process.cwd(), p) || ".";

function formatPath(segments: readonly PropertyKey[]): string {
  return segments
    .map((s, i) => (typeof s === "number" ? `[${s}]` : i === 0 ? String(s) : `.${String(s)}`))
    .join("");
}

function zodErrors(file: string, error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const field = formatPath(issue.path);
    return `${file}: ${field ? `${field}: ` : ""}${issue.message}`;
  });
}

/** Reads a JSON file; reports unsafe number literals (before parsing) and bad JSON. */
async function readJson(
  file: string,
  errors: string[],
): Promise<{ ok: true; value: unknown } | { ok: false }> {
  const text = await readFile(file, "utf8");
  const unsafe = findUnsafeNumberLiterals(text);
  for (const u of unsafe) errors.push(`${display(file)}:${u.line}:${u.column}: ${u.message}`);
  if (unsafe.length > 0) return { ok: false };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    errors.push(`${display(file)}: bad JSON: ${(error as Error).message}`);
    return { ok: false };
  }
}

/**
 * Validates one problem directory. Returns the parsed meta (when meta.json is
 * valid, even if other files are not) so duplicates can be checked across all
 * problems, and the full problem only when it has no errors.
 */
async function loadProblem(
  dir: string,
  errors: string[],
): Promise<{ meta: ProblemMeta | null; problem: LoadedProblem | null }> {
  const before = errors.length;
  for (const name of REQUIRED_FILES) {
    if (!existsSync(path.join(dir, name))) errors.push(`${display(dir)}: missing ${name}`);
  }
  if (errors.length > before) return { meta: null, problem: null };

  const metaFile = path.join(dir, "meta.json");
  const testsFile = path.join(dir, "tests.json");

  let meta: ProblemMeta | null = null;
  const rawMeta = await readJson(metaFile, errors);
  if (rawMeta.ok) {
    const parsed = metaSchema.safeParse(rawMeta.value);
    if (parsed.success) meta = parsed.data;
    else errors.push(...zodErrors(display(metaFile), parsed.error));
  }
  if (meta && meta.slug !== path.basename(dir)) {
    errors.push(
      `${display(metaFile)}: slug: "${meta.slug}" must equal the directory name "${path.basename(dir)}"`,
    );
  }

  let tests: ProblemTest[] | null = null;
  const rawTests = await readJson(testsFile, errors);
  if (rawTests.ok) {
    const parsed = testsSchema.safeParse(rawTests.value);
    if (parsed.success) tests = parsed.data;
    else errors.push(...zodErrors(display(testsFile), parsed.error));
  }

  if (meta && tests) {
    const returns = parseType(meta.signature.returns);
    tests.forEach((test, i) => {
      for (const issue of validateInput(test.input, meta.signature)) {
        const field = `[${i}].input${issue.path.slice(1)}`;
        errors.push(`${display(testsFile)}: ${field}: ${issue.message}`);
      }
      if (returns) {
        for (const issue of validateValue(test.expected, returns, `[${i}].expected`)) {
          errors.push(`${display(testsFile)}: ${issue.path}: ${issue.message}`);
        }
      }
    });
  }

  const descriptionMd = await readFile(path.join(dir, "description.md"), "utf8");
  if (descriptionMd.trim() === "") errors.push(`${display(dir)}: description.md is empty`);

  if (errors.length > before || !meta || !tests) return { meta, problem: null };
  return { meta, problem: { dir, meta, descriptionMd, tests } };
}

/**
 * Loads every problem directory under `rootDir` and validates all of them.
 * Throws `ProblemValidationError` listing every problem found.
 */
export async function loadProblems(rootDir: string): Promise<LoadedProblem[]> {
  const root = path.resolve(rootDir);
  if (!existsSync(root) || !(await stat(root)).isDirectory()) {
    throw new ProblemValidationError([`${display(root)}: problems directory not found`]);
  }
  const entries = (await readdir(root, { withFileTypes: true }))
    .filter((e) => e.isDirectory() && !e.name.startsWith(".") && !e.name.startsWith("_"))
    .map((e) => e.name)
    .sort();
  if (entries.length === 0) {
    throw new ProblemValidationError([`${display(root)}: no problem directories found`]);
  }

  const errors: string[] = [];
  const loaded: LoadedProblem[] = [];
  const metas: { dir: string; meta: ProblemMeta }[] = [];
  for (const name of entries) {
    const dir = path.join(root, name);
    const { meta, problem } = await loadProblem(dir, errors);
    if (meta) metas.push({ dir, meta });
    if (problem) loaded.push(problem);
  }

  for (const key of ["number", "slug"] as const) {
    const seen = new Map<string | number, string>();
    for (const { dir, meta } of metas) {
      const first = seen.get(meta[key]);
      if (first) {
        errors.push(
          `${display(path.join(dir, "meta.json"))}: ${key}: duplicate ${key} ${JSON.stringify(meta[key])} (also in ${display(path.join(first, "meta.json"))})`,
        );
      } else {
        seen.set(meta[key], dir);
      }
    }
  }

  if (errors.length > 0) throw new ProblemValidationError(errors);
  return loaded;
}

export type ImportSummary = {
  imported: string[];
  testCount: number;
  tagCount: number;
  pruned: string[];
};

/** "hash-table" → "Hash Table". */
export function tagNameFromSlug(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Added to existing numbers while importing; above any valid problem number. */
const NUMBER_PARK_OFFSET = MAX_PROBLEM_NUMBER + 1;

/**
 * Upserts problems by slug in one transaction: problem row (published=true),
 * tags, and a full replacement of its test cases. With `prune`, published
 * problems not in `loaded` are unpublished.
 */
export async function importProblems(
  db: Db,
  loaded: LoadedProblem[],
  options: { prune?: boolean } = {},
): Promise<ImportSummary> {
  const slugs = loaded.map((p) => p.meta.slug);
  return db.transaction(async (tx) => {
    // `number` must not be taken by a different problem already in the DB.
    const numberOwners = await tx
      .select({ slug: problems.slug, number: problems.number })
      .from(problems)
      .where(
        and(
          inArray(
            problems.number,
            loaded.map((p) => p.meta.number),
          ),
          notInArray(problems.slug, slugs),
        ),
      );
    if (numberOwners.length > 0) {
      throw new ProblemValidationError(
        numberOwners.map((row) => {
          const p = loaded.find((l) => l.meta.number === row.number)!;
          return `${display(path.join(p.dir, "meta.json"))}: number: duplicate number ${row.number} (already used by "${row.slug}" in the database)`;
        }),
      );
    }

    // Move the numbers of the imported problems that already exist out of the
    // way, so swaps and renumber chains between them do not hit the unique
    // constraint mid-loop. Every parked row gets its real number back from the
    // upsert below (or the transaction rolls back).
    if (slugs.length > 0) {
      await tx
        .update(problems)
        .set({ number: sql`${problems.number} + ${NUMBER_PARK_OFFSET}` })
        .where(inArray(problems.slug, slugs));
    }

    const tagSlugs = [...new Set(loaded.flatMap((p) => p.meta.tags))];
    const tagIds = new Map<string, number>();
    if (tagSlugs.length > 0) {
      await tx
        .insert(tags)
        .values(tagSlugs.map((slug) => ({ slug, name: tagNameFromSlug(slug) })))
        .onConflictDoNothing({ target: tags.slug });
      const rows = await tx
        .select({ id: tags.id, slug: tags.slug })
        .from(tags)
        .where(inArray(tags.slug, tagSlugs));
      for (const row of rows) tagIds.set(row.slug, row.id);
    }

    let testCount = 0;
    for (const { meta, descriptionMd, tests } of loaded) {
      const values = {
        number: meta.number,
        slug: meta.slug,
        title: meta.title,
        difficulty: meta.difficulty,
        descriptionMd,
        signature: meta.signature,
        compare: meta.compare,
        timeLimitMs: meta.limits.timeMs,
        memoryLimitMb: meta.limits.memoryMb,
        published: true,
      };
      const [{ id }] = await tx
        .insert(problems)
        .values(values)
        .onConflictDoUpdate({
          target: problems.slug,
          set: { ...values, updatedAt: new Date() },
        })
        .returning({ id: problems.id });

      await tx.delete(problemTags).where(eq(problemTags.problemId, id));
      if (meta.tags.length > 0) {
        await tx
          .insert(problemTags)
          .values(meta.tags.map((slug) => ({ problemId: id, tagId: tagIds.get(slug)! })));
      }

      await tx.delete(testCases).where(eq(testCases.problemId, id));
      await tx.insert(testCases).values(
        tests.map((test, position) => ({
          problemId: id,
          position,
          input: test.input,
          expected: test.expected,
          isSample: test.sample,
        })),
      );
      testCount += tests.length;
    }

    let pruned: string[] = [];
    if (options.prune) {
      const rows = await tx
        .update(problems)
        .set({ published: false, updatedAt: new Date() })
        .where(and(eq(problems.published, true), notInArray(problems.slug, slugs)))
        .returning({ slug: problems.slug });
      pruned = rows.map((r) => r.slug).sort();
    }

    return { imported: slugs, testCount, tagCount: tagSlugs.length, pruned };
  });
}
