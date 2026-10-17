// Code-sample cases of guide lessons (PLAN-GUIDE 2.7): `<slug>/code/<name>.cases.json`,
// the runner that executes the Python and JS listings against them on the
// host (authored repo code, see CLAUDE.md), and the comparison.
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import { isDeepStrictEqual } from "node:util";
import { z } from "zod";

import type { CodeLanguage } from "@/lib/guide/contracts";
import { codeFilePath } from "@/server/guide/code";

const run = promisify(execFile);

export const LANGUAGES: readonly CodeLanguage[] = ["python", "javascript"];
const perLanguage = z.strictObject({ python: z.string().min(1), javascript: z.string().min(1) });
const jsonValue: z.ZodType<unknown> = z.unknown();

export const casesFileSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("function"),
    entry: perLanguage,
    cases: z.array(z.strictObject({ name: z.string().min(1), args: z.array(jsonValue), expected: jsonValue })).min(1),
  }),
  z.strictObject({
    kind: z.literal("class"),
    entry: perLanguage,
    methods: z.record(z.string(), perLanguage),
    cases: z
      .array(
        z.strictObject({
          name: z.string().min(1),
          ops: z.array(z.tuple([z.string()], jsonValue)).min(1),
          expected: z.array(jsonValue),
        }),
      )
      .min(1),
  }),
]);
export type CasesFile = z.infer<typeof casesFileSchema>;

/** Parses `<ref>.cases.json` (ref = "<slug>/<name>"). */
export function loadCases(ref: string): CasesFile {
  return parseCasesFile(codeFilePath(ref, ".cases.json"));
}

export function parseCasesFile(file: string): CasesFile {
  const data = casesFileSchema.parse(JSON.parse(readFileSync(file, "utf8")));
  if (data.kind === "class") {
    for (const c of data.cases) {
      if (c.expected.length !== c.ops.length) {
        throw new Error(`${file}: case "${c.name}" has ${c.ops.length} ops but ${c.expected.length} expected values`);
      }
      for (const [op] of c.ops) {
        if (!(op in data.methods)) throw new Error(`${file}: case "${c.name}" uses unknown method "${op}"`);
      }
    }
  }
  return data;
}

export const MIN_PYTHON: readonly [number, number] = [3, 10];

/** Throws unless `cmd` is a Python >= 3.10 (fail, never skip, when it is missing). */
export async function assertPython(cmd = "python3"): Promise<string> {
  let out: string;
  try {
    ({ stdout: out } = await run(cmd, ["-c", "import sys; print('%d.%d' % sys.version_info[:2])"], { timeout: 10_000 }));
  } catch (e) {
    throw new Error(
      `Guide code samples need "${cmd}" (Python >= ${MIN_PYTHON.join(".")}) on the host, but it could not run: ${(e as Error).message}`,
    );
  }
  const [major, minor] = out.trim().split(".").map(Number) as [number, number];
  if (major < MIN_PYTHON[0] || (major === MIN_PYTHON[0] && minor < MIN_PYTHON[1])) {
    throw new Error(`Guide code samples need Python >= ${MIN_PYTHON.join(".")}, but "${cmd}" is ${out.trim()}`);
  }
  return out.trim();
}

const DRIVERS = path.join(process.cwd(), "tests", "helpers", "guide");

/** Results the drivers print for one language. */
export async function runDriver(
  language: CodeLanguage,
  sourceFile: string,
  cases: CasesFile,
  pythonCmd = "python3",
): Promise<unknown[]> {
  const job = {
    file: sourceFile,
    kind: cases.kind,
    entry: cases.entry[language],
    methods: cases.kind === "class" ? Object.fromEntries(Object.entries(cases.methods).map(([k, v]) => [k, v[language]])) : {},
    cases: cases.cases,
  };
  const [cmd, args] =
    language === "python"
      ? [pythonCmd, ["-I", path.join(DRIVERS, "driver.py")]]
      : [process.execPath, [path.join(DRIVERS, "driver.mjs")]];
  const child = run(cmd, args, { timeout: 10_000, maxBuffer: 4 * 1024 * 1024 });
  child.child.stdin?.end(JSON.stringify(job));
  let stdout: string;
  try {
    ({ stdout } = await child);
  } catch (e) {
    const err = e as Error & { stderr?: string };
    throw new Error(`${path.relative(process.cwd(), sourceFile)} (${language}): the driver failed: ${err.stderr || err.message}`);
  }
  return (JSON.parse(stdout) as { results: unknown[] }).results;
}

/** `{ "$error": true }` accepts any error; with "type" the error type must match too. */
function matches(expected: unknown, actual: unknown): boolean {
  if (typeof expected === "object" && expected !== null && (expected as Record<string, unknown>).$error === true) {
    if (typeof actual !== "object" || actual === null || (actual as Record<string, unknown>).$error !== true) return false;
    const type = (expected as Record<string, unknown>).type;
    return type === undefined || type === (actual as Record<string, unknown>).type;
  }
  return isDeepStrictEqual(JSON.parse(JSON.stringify(expected)), actual);
}

/** Runs `<base>.py` and `<base>.js` against `<base>.cases.json`; returns one message per mismatch. */
export async function checkSample(base: string, pythonCmd = "python3"): Promise<string[]> {
  const casesFile = `${base}.cases.json`;
  const cases = parseCasesFile(casesFile);
  const failures: string[] = [];
  for (const language of LANGUAGES) {
    const file = `${base}${language === "python" ? ".py" : ".js"}`;
    const rel = path.relative(process.cwd(), file);
    const results = await runDriver(language, file, cases, pythonCmd);
    cases.cases.forEach((c, i) => {
      const got = results[i];
      if (cases.kind === "function") {
        if (!matches(c.expected, got)) {
          failures.push(`${rel} case "${c.name}" (${language}): expected ${JSON.stringify(c.expected)}, got ${JSON.stringify(got)}`);
        }
        return;
      }
      const list = Array.isArray(got) ? got : [];
      (c.expected as unknown[]).forEach((exp, k) => {
        if (!matches(exp, list[k])) {
          const op = JSON.stringify(cases.cases[i]?.ops[k]);
          failures.push(
            `${rel} case "${c.name}" (${language}), op ${k + 1} ${op}: expected ${JSON.stringify(exp)}, got ${JSON.stringify(list[k])}`,
          );
        }
      });
    });
  }
  return failures;
}
