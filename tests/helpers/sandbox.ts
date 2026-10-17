// Helpers for Docker sandbox integration tests (no database needed).
import { execFileSync } from "node:child_process";
import path from "node:path";

import { loadProblems } from "@/server/problems/importer";
import { getEnv } from "@/server/env";

import {
  createDockerExecutor,
  dockerConfigFromEnv,
  SANDBOX_LABEL,
} from "../../worker/docker-executor";
import type { ExecJob, ExecResult, Language } from "../../worker/types";

export const config = () => dockerConfigFromEnv(getEnv());

let executor: ReturnType<typeof createDockerExecutor> | undefined;

/** Runs a job and measures the wall time of the whole call (container start included). */
export async function run(job: ExecJob): Promise<ExecResult & { elapsedMs: number }> {
  executor ??= createDockerExecutor(config());
  const started = performance.now();
  const result = await executor(job);
  return { ...result, elapsedMs: performance.now() - started };
}

/** `fixture-evens` (int[] → int[], unordered) from tests/fixtures/problems. */
export async function evensProblem() {
  const loaded = await loadProblems(path.join(process.cwd(), "tests/fixtures/problems"));
  const problem = loaded.find((p) => p.meta.slug === "fixture-evens");
  if (!problem) throw new Error("fixture-evens not found");
  return problem;
}

export async function evensJob(
  language: Language,
  code: string,
  over: Partial<ExecJob> = {},
): Promise<ExecJob> {
  const problem = await evensProblem();
  return {
    language,
    code,
    signature: problem.meta.signature,
    compare: problem.meta.compare,
    limits: { timeMs: 1000, memoryMb: 128 },
    tests: problem.tests.map((t) => ({ input: t.input, expected: t.expected })),
    stopOnFirstFailure: true,
    ...over,
  };
}

/**
 * A probe: `probe(x: int) -> string` run as a custom-input Run, so the
 * returned string (a JSON report of what the code saw) comes back as `actual`.
 */
export function probeJob(language: Language, code: string, memoryMb = 128): ExecJob {
  return {
    language,
    code,
    signature: { name: "probe", params: [{ name: "x", type: "int" }], returns: "string" },
    compare: { mode: "exact" },
    limits: { timeMs: 2000, memoryMb },
    tests: [{ input: { x: 1 } }],
    stopOnFirstFailure: false,
  };
}

export function sandboxContainers(): string[] {
  return execFileSync("docker", ["ps", "-a", "--filter", `label=${SANDBOX_LABEL}`, "-q"], {
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);
}

export const fileName = (language: Language) => (language === "python" ? "solution.py" : "solution.js");
