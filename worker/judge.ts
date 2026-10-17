// The single comparator (`exact` / `unordered` / `float`) and the verdict
// precedence of PLAN.md section 5. Pure functions, no Docker.
import type { CompareSpec } from "@/lib/problems/schema";
import { parseType, type ValueType } from "@/lib/types";

import type { Frame, TestFrame } from "./protocol";
import type { CaseResult, ExecJob, ExecResult, ExecStatus } from "./types";

export const STDOUT_LIMIT_BYTES = 64 * 1024;
export const ERROR_LIMIT_BYTES = 8 * 1024;
const TRUNCATED = "\n[truncated]";

// ---------------------------------------------------------------- comparator

/** `{"$nonJson": ...}` encodes undefined/NaN/±Infinity returned by user code. */
export function isNonJsonMarker(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    Object.hasOwn(value, "$nonJson")
  );
}

function containsMarker(value: unknown, depth = 0): boolean {
  if (depth > 64) return false;
  if (isNonJsonMarker(value)) return true;
  if (Array.isArray(value)) return value.some((v) => containsMarker(v, depth + 1));
  if (typeof value === "object" && value !== null) {
    return Object.values(value).some((v) => containsMarker(v, depth + 1));
  }
  return false;
}

/** JSON with sorted keys; `-0` prints as `0`. Used for multiset membership. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(record[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** Absolute or relative tolerance: |a−b| ≤ ε, or |a−b| ≤ ε·max(|a|,|b|). */
export function floatsClose(a: number, b: number, epsilon: number): boolean {
  if (a === b) return true; // also -0 === 0
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  const diff = Math.abs(a - b);
  return diff <= epsilon || diff <= epsilon * Math.max(Math.abs(a), Math.abs(b));
}

type NumberEq = (expected: number, actual: number, type: ValueType | null) => boolean;

function deepEqual(expected: unknown, actual: unknown, type: ValueType | null, eq: NumberEq): boolean {
  if (typeof expected === "number" || typeof actual === "number") {
    return typeof expected === "number" && typeof actual === "number" && eq(expected, actual, type);
  }
  if (expected === null || actual === null) return expected === actual;
  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual)) return false;
    if (expected.length !== actual.length) return false;
    const item = type?.kind === "array" ? type.of : null;
    return expected.every((e, i) => deepEqual(e, actual[i], item, eq));
  }
  if (typeof expected === "object" && typeof actual === "object") {
    const e = expected as Record<string, unknown>;
    const a = actual as Record<string, unknown>;
    const keys = Object.keys(e);
    if (keys.length !== Object.keys(a).length) return false;
    return keys.every((k) => Object.hasOwn(a, k) && deepEqual(e[k], a[k], null, eq));
  }
  // string / boolean: strict, so `true` never equals `1`.
  return expected === actual;
}

const strictNumbers: NumberEq = (e, a) => e === a;

/**
 * Compares a returned value with the expected one.
 * - `exact`: deep equality; numbers by `===` (so `-0` equals `0`).
 * - `unordered`: the top-level array is a multiset of canonical JSON strings;
 *   nested arrays stay ordered.
 * - `float`: deep equality where numbers of `float` type (from `returns`; any
 *   number if the type is unknown) match within `epsilon`; `int` stays strict.
 * A value containing a `$nonJson` marker never matches.
 */
export function valuesEqual(
  expected: unknown,
  actual: unknown,
  compare: CompareSpec,
  returns?: string,
): boolean {
  if (containsMarker(actual)) return false;
  const type = returns ? parseType(returns) : null;
  switch (compare.mode) {
    case "exact":
      return deepEqual(expected, actual, type, strictNumbers);
    case "unordered": {
      if (!Array.isArray(expected) || !Array.isArray(actual)) {
        return deepEqual(expected, actual, type, strictNumbers);
      }
      if (expected.length !== actual.length) return false;
      const counts = new Map<string, number>();
      for (const e of expected) {
        const key = canonicalJson(e);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      for (const a of actual) {
        const key = canonicalJson(a);
        const n = counts.get(key);
        if (!n) return false;
        counts.set(key, n - 1);
      }
      return true;
    }
    case "float": {
      const { epsilon } = compare;
      return deepEqual(expected, actual, type, (e, a, t) =>
        t?.kind === "scalar" && t.name === "int" ? e === a : floatsClose(e, a, epsilon),
      );
    }
  }
}

// ------------------------------------------------------------------ verdicts

/** Everything the executor observed about one sandbox run. */
export type RunObservation = {
  /** Frames with the right nonce, in arrival order. */
  frames: Frame[];
  /** A line had the right nonce but was not a valid frame. */
  badFrame: boolean;
  /** Killed by the wall-clock budget. */
  wallKilled: boolean;
  /** stdout+stderr exceeded the 1 MB cap and the container was killed. */
  outputExceeded: boolean;
  exitCode: number | null;
  oomKilled: boolean;
  /** The container's stderr (not user-facing; heap-abort detection). */
  stderr: string;
};

export function truncateBytes(text: string, limit: number): string {
  if (Buffer.byteLength(text) <= limit) return text;
  const data = Buffer.from(text, "utf8");
  let end = limit - Buffer.byteLength(TRUNCATED);
  while (end > 0 && (data[end] & 0xc0) === 0x80) end--;
  return data.subarray(0, end).toString("utf8") + TRUNCATED;
}

function baseCases(job: ExecJob): CaseResult[] {
  return job.tests.map((t, index) => {
    const c: CaseResult = { index, status: "not_run", input: t.input };
    if (Object.hasOwn(t, "expected")) c.expected = t.expected;
    return c;
  });
}

/** Result for Docker/daemon failures, missing images, unreadable frames. */
export function internalErrorResult(job: ExecJob, message: string): ExecResult {
  return {
    status: "internal_error",
    passedCount: 0,
    totalCount: job.tests.length,
    runtimeMs: null,
    memoryKb: null,
    failedTestIndex: null,
    failedCase: null,
    caseResults: baseCases(job),
    stdout: "",
    error: truncateBytes(message, ERROR_LIMIT_BYTES),
  };
}

/**
 * V8 heap exhaustion: Node prints "FATAL ERROR: ... JavaScript heap out of
 * memory" and aborts (exit 134; as PID 1 of the container SIGABRT is ignored
 * and the process ends with SIGSEGV, exit 139, so the message is the signal).
 */
function isHeapAbort(job: ExecJob, obs: RunObservation): boolean {
  return (
    job.language === "javascript" &&
    (obs.exitCode === 134 || /heap out of memory|Reached heap limit/i.test(obs.stderr))
  );
}

/** Whether a test frame already decides the run as failed (Submit stops here). */
export function frameFails(job: ExecJob, frame: TestFrame): boolean {
  if (frame.status !== "ok") return true;
  const test = job.tests[frame.index];
  if (!test || !Object.hasOwn(test, "expected")) return false;
  return !valuesEqual(test.expected, frame.actual, job.compare, job.signature.returns);
}

/**
 * Turns an observation into the final result, by PLAN.md section 5 precedence:
 * 1 time_limit, 2 memory_limit, 3 per-test verdicts (compile/fatal errors,
 * runtime_error, wrong_answer, accepted), 4 "program exited unexpectedly",
 * 5 internal_error (bad frame).
 */
export function decideVerdict(job: ExecJob, obs: RunObservation): ExecResult {
  if (obs.badFrame) return internalErrorResult(job, "internal error: unreadable sandbox output");

  const cases = baseCases(job);
  let stdout = "";
  let memoryKb: number | null = null;
  let runtime = 0;
  let ranAny = false;
  let compileError: string | null = null;
  let fatal: { status: "error" | "timeout"; error: string } | null = null;
  let received = 0;

  let stopped = false; // Submit: nothing after the first failing test counts
  for (const frame of obs.frames) {
    if (stopped) break;
    stdout += frame.stdout;
    memoryKb = Math.max(memoryKb ?? 0, frame.memoryKb);
    if (frame.kind === "compile_error") compileError ??= frame.error;
    else if (frame.kind === "fatal") fatal ??= { status: frame.status, error: frame.error };
    else if (frame.kind === "test") {
      if (frame.index !== received || frame.index >= cases.length) {
        return internalErrorResult(job, "internal error: unexpected sandbox frame");
      }
      received += 1;
      ranAny = true;
      runtime += frame.timeMs;
      const c = cases[frame.index];
      c.timeMs = Math.round(frame.timeMs);
      if (frame.status === "ok") {
        c.actual = frame.actual;
        c.status = frameFails(job, frame) ? "failed" : "passed";
      } else if (frame.status === "timeout") {
        c.status = "time_limit";
      } else {
        c.status = frame.memory ? "memory_limit" : "runtime_error";
        if (frame.error !== undefined) c.error = frame.error;
      }
      stopped = job.stopOnFirstFailure && c.status !== "passed";
    }
  }

  const hung = cases.find((c) => c.status === "not_run") ?? null;
  const passedCount = cases.filter((c) => c.status === "passed").length;
  const result = (
    status: ExecStatus,
    failedTestIndex: number | null,
    error: string | null,
  ): ExecResult => {
    const failed = failedTestIndex === null ? undefined : cases[failedTestIndex];
    return {
      status,
      passedCount,
      totalCount: cases.length,
      runtimeMs: ranAny ? Math.round(runtime) : null,
      memoryKb,
      failedTestIndex,
      failedCase:
        status === "wrong_answer" && failed
          ? { input: failed.input, expected: failed.expected, actual: failed.actual }
          : null,
      caseResults: cases,
      stdout: truncateBytes(stdout, STDOUT_LIMIT_BYTES),
      error: error === null ? null : truncateBytes(error, ERROR_LIMIT_BYTES),
    };
  };
  const firstWith = (status: CaseResult["status"]) => cases.find((c) => c.status === status);

  // 1. time_limit
  const timedOut = firstWith("time_limit");
  if (obs.wallKilled || timedOut || fatal?.status === "timeout") {
    if (timedOut) return result("time_limit", timedOut.index, null);
    if (hung && !fatal && !compileError) {
      hung.status = "time_limit";
      return result("time_limit", hung.index, null);
    }
    return result("time_limit", null, null);
  }

  // 2. memory_limit
  const outOfMemory = firstWith("memory_limit");
  if (obs.oomKilled || isHeapAbort(job, obs) || outOfMemory) {
    if (outOfMemory) return result("memory_limit", outOfMemory.index, null);
    if (hung && !fatal && !compileError) {
      hung.status = "memory_limit";
      return result("memory_limit", hung.index, null);
    }
    return result("memory_limit", null, null);
  }

  // 3. frames
  if (compileError !== null) return result("compile_error", null, compileError);
  if (fatal) return result("runtime_error", null, fatal.error);
  const crashed = firstWith("runtime_error");
  if (crashed) return result("runtime_error", crashed.index, crashed.error ?? null);
  const wrong = firstWith("failed");
  if (wrong) return result("wrong_answer", wrong.index, null);
  if (obs.outputExceeded) {
    return result("runtime_error", hung?.index ?? null, "Output limit exceeded (1 MB)");
  }
  if (!hung) return result("accepted", null, null);

  // 4. exited without all results
  const code = obs.exitCode !== null && obs.exitCode !== 0 ? ` (exit code ${obs.exitCode})` : "";
  return result("runtime_error", hung.index, `program exited unexpectedly${code}`);
}
