// `pnpm problems:verify [--dir <path>] [--only <slug>] [--concurrency <n>]`
// Quality gate for problem data (AC-M4-7): runs each problem's solution.py and
// solution.js through the real DockerExecutor on ALL its tests (no stop on the
// first failure, the problem's own limits) and requires `accepted`.
// No database needed.
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

import { loadProblems, ProblemValidationError, type LoadedProblem } from "@/server/problems/importer";
import { getEnv } from "@/server/env";

import {
  createDockerExecutor,
  dockerConfigFromEnv,
  prepareSandbox,
  SandboxSetupError,
} from "../worker/docker-executor";
import type { ExecJob, ExecResult, Executor, Language } from "../worker/types";

const LANGUAGES: { language: Language; file: string }[] = [
  { language: "python", file: "solution.py" },
  { language: "javascript", file: "solution.js" },
];

type Row = { slug: string; language: Language; result: ExecResult; elapsedMs: number };

const short = (value: unknown, max = 200) => {
  const text = JSON.stringify(value) ?? "undefined";
  return text.length > max ? `${text.slice(0, max)}…` : text;
};

async function verifyOne(
  executor: Executor,
  problem: LoadedProblem,
  language: Language,
  file: string,
): Promise<Row> {
  const code = await readFile(path.join(problem.dir, file), "utf8");
  const job: ExecJob = {
    language,
    code,
    signature: problem.meta.signature,
    compare: problem.meta.compare,
    limits: problem.meta.limits,
    tests: problem.tests.map((t) => ({ input: t.input, expected: t.expected })),
    stopOnFirstFailure: false,
  };
  const started = performance.now();
  const result = await executor(job);
  return { slug: problem.meta.slug, language, result, elapsedMs: performance.now() - started };
}

/** Runs `tasks` with at most `limit` in flight, keeping the input order. */
async function pool<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  const lane = async () => {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, lane));
  return results;
}

function printTable(rows: Row[]) {
  const header = ["problem", "language", "verdict", "passed", "runtime ms", "memory MB", "wall s"];
  const lines = rows.map((r) => [
    r.slug,
    r.language,
    r.result.status,
    `${r.result.passedCount}/${r.result.totalCount}`,
    r.result.runtimeMs === null ? "-" : String(r.result.runtimeMs),
    r.result.memoryKb === null ? "-" : (r.result.memoryKb / 1024).toFixed(1),
    (r.elapsedMs / 1000).toFixed(2),
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...lines.map((l) => l[i].length)));
  const fmt = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join("  ").trimEnd();
  console.log(fmt(header));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const l of lines) console.log(fmt(l));
}

function describeFailure(r: Row): string {
  const parts = [`${r.slug} [${r.language}]: ${r.result.status}`];
  const failed = r.result.caseResults.filter((c) => c.status !== "passed");
  for (const c of failed.slice(0, 3)) {
    let line = `  test #${c.index} ${c.status}: input=${short(c.input)}`;
    if (c.status === "failed") line += ` expected=${short(c.expected)} actual=${short(c.actual)}`;
    if (c.error) line += ` error=${short(c.error.trim().split("\n").join(" | "))}`;
    parts.push(line);
  }
  if (failed.length > 3) parts.push(`  … ${failed.length - 3} more failing tests`);
  if (r.result.error && failed.every((c) => !c.error)) parts.push(`  error: ${short(r.result.error, 400)}`);
  return parts.join("\n");
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      dir: { type: "string", default: "problems" },
      only: { type: "string", multiple: true },
      concurrency: { type: "string", default: "2" },
    },
  });
  if (existsSync(".env")) process.loadEnvFile(".env");
  const concurrency = Number(values.concurrency);
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    console.error("problems:verify: --concurrency must be a positive integer");
    return 1;
  }

  let problems = await loadProblems(values.dir);
  if (values.only?.length) {
    const wanted = new Set(values.only);
    const unknown = [...wanted].filter((s) => !problems.some((p) => p.meta.slug === s));
    if (unknown.length > 0) {
      console.error(`problems:verify: unknown problem(s) in ${values.dir}: ${unknown.join(", ")}`);
      return 1;
    }
    problems = problems.filter((p) => wanted.has(p.meta.slug));
  }

  const config = dockerConfigFromEnv(getEnv());
  await prepareSandbox(config);
  const executor = createDockerExecutor(config);

  console.log(`Verifying ${problems.length} problem(s) × 2 languages from ${values.dir} (concurrency ${concurrency})\n`);
  const rows = await pool(
    problems.flatMap((p) => LANGUAGES.map(({ language, file }) => () => verifyOne(executor, p, language, file))),
    concurrency,
  );
  printTable(rows);

  const failures = rows.filter((r) => r.result.status !== "accepted");
  if (failures.length > 0) {
    console.error(`\nproblems:verify FAILED: ${failures.length} of ${rows.length} runs not accepted:`);
    for (const f of failures) console.error(describeFailure(f));
    return 1;
  }
  console.log(`\nAll ${rows.length} runs accepted.`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    if (error instanceof ProblemValidationError) {
      console.error(`problems:verify: invalid problems:\n${error.errors.map((e) => `  ${e}`).join("\n")}`);
    } else if (error instanceof SandboxSetupError) {
      console.error(`problems:verify: ${error.message}`);
    } else {
      console.error("problems:verify failed:", error instanceof Error ? error.message : error);
    }
    process.exit(1);
  },
);
