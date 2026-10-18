// Pure core of `pnpm leetcode:catalog` (docs/specs/leetcode-integration.md
// §6.4): turns zerotrac's `data.json` (already downloaded by the maintainer)
// into the committed `catalog.json`. Offline by design: this module and the
// script never open a network connection (a unit test checks the sources).
//
// Every dataset record is validated; invalid ones are skipped and counted per
// reason. The output is deterministic: the same input and arguments give a
// byte-identical file, whatever the order of the input records.
import { z } from "zod";

import { isExternalSlug } from "@/lib/rooms/external";

import {
  CATALOG_RATING_MAX,
  CATALOG_RATING_MIN,
  CATALOG_VERSION,
  catalogEntrySchema,
  catalogFileSchema,
  catalogTitleSchema,
  CONTEST_RE,
  DATASET_NAME,
  DATASET_URL,
  type CatalogEntry,
  type CatalogFile,
} from "./catalog-schema";

/** Fewer valid records than this means the input is wrong (format change, truncated download). */
export const MIN_VALID_RECORDS = 1000;

/** One record of zerotrac's data.json (other fields, e.g. the Chinese title, are ignored and never stored). */
const datasetRecordSchema = z.looseObject({
  Rating: z.number().refine(Number.isFinite),
  ID: z.int(),
  Title: z.string(),
  TitleSlug: z.string(),
  ContestSlug: z.string(),
  ProblemIndex: z.string(),
});

export const SKIP_REASONS = [
  "bad record",
  "bad number",
  "bad slug",
  "bad title",
  "bad contest",
  "bad position",
  "rating out of range",
  "duplicate slug",
  "duplicate number",
] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];

export type BuildResult =
  | { ok: true; catalog: CatalogFile; skipped: Record<SkipReason, number>; total: number }
  | { ok: false; error: string; skipped?: Record<SkipReason, number> };

function check(record: unknown): CatalogEntry | SkipReason {
  const r = datasetRecordSchema.safeParse(record);
  if (!r.success) return "bad record";
  const d = r.data;
  if (d.ID < 1 || d.ID > 99_999) return "bad number";
  if (!isExternalSlug(d.TitleSlug)) return "bad slug";
  // A few dataset titles carry stray spaces at the ends: trimmed. Anything else invalid is skipped.
  const title = d.Title.trim();
  if (!catalogTitleSchema.safeParse(title).success) return "bad title";
  if (!CONTEST_RE.test(d.ContestSlug)) return "bad contest";
  const q = /^Q([1-5])$/.exec(d.ProblemIndex);
  if (!q) return "bad position";
  const rating = Math.round(d.Rating);
  if (rating < CATALOG_RATING_MIN || rating > CATALOG_RATING_MAX) return "rating out of range";
  const entry = { n: d.ID, slug: d.TitleSlug, title, rating, contest: d.ContestSlug, q: Number(q[1]) };
  // Belt and braces: the committed file must pass the runtime schema.
  return catalogEntrySchema.safeParse(entry).success ? entry : "bad record";
}

/** Builds the catalog from the parsed data.json. `minRecords` is lowered only by tests. */
export function buildCatalog(
  input: unknown,
  options: { commit: string; date: string; minRecords?: number },
): BuildResult {
  if (!Array.isArray(input)) return { ok: false, error: "the input is not a JSON array of problems" };
  const skipped = Object.fromEntries(SKIP_REASONS.map((r) => [r, 0])) as Record<SkipReason, number>;
  const valid: CatalogEntry[] = [];
  for (const record of input) {
    const e = check(record);
    if (typeof e === "string") skipped[e] += 1;
    else valid.push(e);
  }
  // Order-independent: by number, then slug, then rating; the first of a duplicate wins.
  valid.sort((a, b) => a.n - b.n || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0) || a.rating - b.rating);
  const slugs = new Set<string>();
  const numbers = new Set<number>();
  const problems: CatalogEntry[] = [];
  for (const e of valid) {
    if (slugs.has(e.slug)) {
      skipped["duplicate slug"] += 1;
      continue;
    }
    if (numbers.has(e.n)) {
      skipped["duplicate number"] += 1;
      continue;
    }
    slugs.add(e.slug);
    numbers.add(e.n);
    problems.push(e);
  }
  const min = options.minRecords ?? MIN_VALID_RECORDS;
  if (problems.length < min) {
    return { ok: false, error: `only ${problems.length} valid problems (at least ${min} expected)`, skipped };
  }
  const parsed = catalogFileSchema.safeParse({
    version: CATALOG_VERSION,
    source: { name: DATASET_NAME, url: DATASET_URL, commit: options.commit, licence: "MIT", retrievedAt: options.date },
    problems,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid catalog", skipped };
  return { ok: true, catalog: parsed.data, skipped, total: input.length };
}

/** Stable text: fixed key order, one problem per line (small, readable diffs on refresh). */
export function serializeCatalog(catalog: CatalogFile): string {
  const s = catalog.source;
  const source = { name: s.name, url: s.url, commit: s.commit, licence: s.licence, retrievedAt: s.retrievedAt };
  const lines = catalog.problems.map(
    (p) => `    ${JSON.stringify({ n: p.n, slug: p.slug, title: p.title, rating: p.rating, contest: p.contest, q: p.q })}`,
  );
  return `{\n  "version": ${catalog.version},\n  "source": ${JSON.stringify(source)},\n  "problems": [\n${lines.join(",\n")}\n  ]\n}\n`;
}

/** NOTICE.md with the new dataset commit and date (the lines are marked; anything else stays). */
export function updateNotice(notice: string, commit: string, date: string): string {
  return notice
    .replace(/^Dataset commit: `[0-9a-f]{40}`$/m, `Dataset commit: \`${commit}\``)
    .replace(/^Retrieved: \d{4}-\d{2}-\d{2}$/m, `Retrieved: ${date}`);
}

export function summaryLine(catalog: CatalogFile, skipped: Record<SkipReason, number>): string {
  const ratings = catalog.problems.map((p) => p.rating);
  const nSkipped = Object.values(skipped).reduce((a, b) => a + b, 0);
  const range = ratings.length > 0 ? `${Math.min(...ratings)}–${Math.max(...ratings)}` : "none";
  return `${catalog.problems.length} problems, ${nSkipped} skipped, rating range ${range}`;
}
