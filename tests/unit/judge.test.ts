import { describe, expect, it } from "vitest";

import type { CompareSpec } from "@/lib/problems/schema";

import { canonicalJson, decideVerdict, floatsClose, valuesEqual, type RunObservation } from "../../worker/judge";
import type { Frame } from "../../worker/protocol";
import type { ExecJob } from "../../worker/types";

const exact: CompareSpec = { mode: "exact" };
const unordered: CompareSpec = { mode: "unordered" };
const float: CompareSpec = { mode: "float", epsilon: 1e-6 };
const marker = (v: string) => ({ $nonJson: v });

describe("valuesEqual: exact", () => {
  it("compares empty and nested arrays structurally", () => {
    expect(valuesEqual([], [], exact)).toBe(true);
    expect(valuesEqual([[]], [[]], exact)).toBe(true);
    expect(valuesEqual([[1, 2], [3]], [[1, 2], [3]], exact)).toBe(true);
    expect(valuesEqual([[1, 2], [3]], [[2, 1], [3]], exact)).toBe(false);
    expect(valuesEqual([], [[]], exact)).toBe(false);
    expect(valuesEqual([1, 2], [1, 2, 3], exact)).toBe(false);
  });

  it("treats -0 as equal to 0", () => {
    expect(valuesEqual(0, -0, exact)).toBe(true);
    expect(valuesEqual([0, -0], [-0, 0], exact)).toBe(true);
  });

  it("never equates booleans with numbers or null with values", () => {
    expect(valuesEqual(true, 1, exact)).toBe(false);
    expect(valuesEqual(1, true, exact)).toBe(false);
    expect(valuesEqual(false, 0, exact)).toBe(false);
    expect(valuesEqual([], null, exact)).toBe(false);
    expect(valuesEqual(null, null, exact)).toBe(true);
    expect(valuesEqual("1", 1, exact)).toBe(false);
  });

  it("is strict on numbers (no tolerance)", () => {
    expect(valuesEqual(0.3, 0.1 + 0.2, exact)).toBe(false);
    expect(valuesEqual(3, 3.0, exact)).toBe(true);
  });
});

describe("valuesEqual: unordered", () => {
  it("treats the top-level array as a multiset", () => {
    expect(valuesEqual([1, 2, 3], [3, 1, 2], unordered)).toBe(true);
    expect(valuesEqual([1, 1, 2], [1, 2, 2], unordered)).toBe(false);
    expect(valuesEqual([1, 1, 2], [2, 1, 1], unordered)).toBe(true);
    expect(valuesEqual([1, 2], [1, 2, 2], unordered)).toBe(false);
    expect(valuesEqual([], [], unordered)).toBe(true);
  });

  it("keeps nested arrays ordered", () => {
    expect(valuesEqual([[1, 2], [3, 4]], [[3, 4], [1, 2]], unordered)).toBe(true);
    expect(valuesEqual([[1, 2], [3, 4]], [[4, 3], [1, 2]], unordered)).toBe(false);
  });

  it("normalizes -0 and distinguishes true from 1", () => {
    expect(valuesEqual([0, 1], [1, -0], unordered)).toBe(true);
    expect(valuesEqual([1], [true], unordered)).toBe(false);
  });
});

describe("valuesEqual: float", () => {
  it("compares within epsilon, recursively through arrays", () => {
    expect(valuesEqual(0.3, 0.1 + 0.2, float)).toBe(true);
    expect(valuesEqual(2.5, 2.5000004, float)).toBe(true);
    expect(valuesEqual(2.5, 2.51, float)).toBe(false);
    expect(valuesEqual([[0.1, 0.2]], [[0.1000000001, 0.2]], float, "float[][]")).toBe(true);
    expect(valuesEqual([0.1], [0.1, 0.2], float, "float[]")).toBe(false);
  });

  it("treats -0.0 as 0.0 within epsilon", () => {
    expect(valuesEqual(0.0, -0.0, float)).toBe(true);
    expect(valuesEqual(-0.0, 1e-9, float)).toBe(true);
  });

  it("uses a relative tolerance for large magnitudes", () => {
    expect(valuesEqual(1e10, 1e10 + 1e-3, float)).toBe(true);
    expect(valuesEqual(1e10, 1e10 + 1e5, float)).toBe(false);
  });

  it("keeps int-typed values strict (int/float distinction)", () => {
    expect(valuesEqual(3, 3.0000001, float, "float")).toBe(true);
    expect(valuesEqual(3, 3.0000001, float, "int")).toBe(false);
    expect(valuesEqual([1, 2], [1, 2.0000001], float, "int[]")).toBe(false);
    expect(valuesEqual([1, 2], [1, 2.0000001], float, "float[]")).toBe(true);
    expect(valuesEqual(3, 3.0000001, exact, "float")).toBe(false);
  });

  it("does not equate booleans with numbers", () => {
    expect(valuesEqual(1, true, float)).toBe(false);
    expect(valuesEqual([true], [true], float)).toBe(true);
  });

  it("floatsClose rejects non-finite values", () => {
    expect(floatsClose(Number.NaN, Number.NaN, 1)).toBe(false);
    expect(floatsClose(Infinity, 1e308, 1)).toBe(false);
  });
});

describe("valuesEqual: $nonJson markers", () => {
  it("never match any expected value", () => {
    for (const compare of [exact, unordered, float]) {
      expect(valuesEqual(null, marker("undefined"), compare)).toBe(false);
      expect(valuesEqual(0, marker("NaN"), compare)).toBe(false);
      expect(valuesEqual(marker("NaN"), marker("NaN"), compare)).toBe(false);
      expect(valuesEqual([1, null], [1, marker("undefined")], compare)).toBe(false);
      expect(valuesEqual(1e308, marker("Infinity"), compare)).toBe(false);
    }
  });

  it("canonicalJson sorts keys", () => {
    expect(canonicalJson({ b: 1, a: [-0, "x"] })).toBe('{"a":[0,"x"],"b":1}');
  });
});

// ------------------------------------------------------------------ verdicts

const job = (over: Partial<ExecJob> = {}): ExecJob => ({
  language: "python",
  code: "",
  signature: { name: "evens", params: [{ name: "nums", type: "int[]" }], returns: "int[]" },
  compare: unordered,
  limits: { timeMs: 1000, memoryMb: 128 },
  tests: [
    { input: { nums: [1, 2] }, expected: [2] },
    { input: { nums: [] }, expected: [] },
    { input: { nums: [4] }, expected: [4] },
  ],
  stopOnFirstFailure: true,
  ...over,
});

const obs = (frames: Frame[], over: Partial<RunObservation> = {}): RunObservation => ({
  frames,
  badFrame: false,
  wallKilled: false,
  outputExceeded: false,
  exitCode: 0,
  oomKilled: false,
  stderr: "",
  ...over,
});

const ok = (index: number, actual: unknown, extra: Partial<Frame> = {}): Frame =>
  ({ kind: "test", index, status: "ok", actual, timeMs: 1.4, stdout: "", memoryKb: 9000, ...extra }) as Frame;
const err = (index: number, error: string, extra: object = {}): Frame =>
  ({ kind: "test", index, status: "error", error, timeMs: 1, stdout: "", memoryKb: 9000, ...extra }) as Frame;
const timeout = (index: number): Frame =>
  ({ kind: "test", index, status: "timeout", timeMs: 2000, stdout: "", memoryKb: 9000 }) as Frame;
const done: Frame = { kind: "done", stdout: "", memoryKb: 9100 };

describe("decideVerdict", () => {
  it("accepts when every test passes", () => {
    const r = decideVerdict(job(), obs([ok(0, [2]), ok(1, []), ok(2, [4]), done]));
    expect(r).toMatchObject({ status: "accepted", passedCount: 3, totalCount: 3, memoryKb: 9100 });
    expect(r.runtimeMs).toBe(4);
    expect(r.caseResults.map((c) => c.status)).toEqual(["passed", "passed", "passed"]);
    expect(r.failedCase).toBeNull();
  });

  it("wrong answer: first failing case, later ones not_run", () => {
    const r = decideVerdict(job(), obs([ok(0, [2]), ok(1, [7])], { exitCode: 137 }));
    expect(r).toMatchObject({ status: "wrong_answer", passedCount: 1, failedTestIndex: 1 });
    expect(r.failedCase).toEqual({ input: { nums: [] }, expected: [], actual: [7] });
    expect(r.caseResults.map((c) => c.status)).toEqual(["passed", "failed", "not_run"]);
  });

  it("Submit ignores frames that arrive after the first failure", () => {
    const r = decideVerdict(job(), obs([ok(0, [9]), ok(1, []), ok(2, [4]), done]));
    expect(r).toMatchObject({ status: "wrong_answer", passedCount: 0, failedTestIndex: 0 });
    expect(r.caseResults.map((c) => c.status)).toEqual(["failed", "not_run", "not_run"]);
  });

  it("custom input (no expected) is never wrong answer", () => {
    const j = job({ tests: [{ input: { nums: [3] } }], stopOnFirstFailure: false });
    const r = decideVerdict(j, obs([ok(0, [99]), done]));
    expect(r.status).toBe("accepted");
    expect(r.caseResults[0]).toEqual({ index: 0, status: "passed", input: { nums: [3] }, actual: [99], timeMs: 1 });
  });

  it("time_limit beats everything; wall-clock kill marks the hung test", () => {
    const r = decideVerdict(job(), obs([ok(0, [2])], { wallKilled: true, exitCode: 137, oomKilled: true }));
    expect(r).toMatchObject({ status: "time_limit", passedCount: 1, failedTestIndex: 1 });
    expect(r.caseResults.map((c) => c.status)).toEqual(["passed", "time_limit", "not_run"]);
    const r2 = decideVerdict(job({ stopOnFirstFailure: false }), obs([ok(0, [9]), timeout(1), done]));
    expect(r2.status).toBe("time_limit");
  });

  it("memory_limit on OOMKilled, Node heap abort or MemoryError", () => {
    expect(decideVerdict(job(), obs([ok(0, [2])], { oomKilled: true, exitCode: 137 })).status).toBe("memory_limit");
    const js = job({ language: "javascript" });
    expect(decideVerdict(js, obs([], { exitCode: 134 })).status).toBe("memory_limit");
    expect(
      decideVerdict(js, obs([], { exitCode: 139, stderr: "FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory" })).status,
    ).toBe("memory_limit");
    expect(decideVerdict(job(), obs([err(0, "MemoryError", { memory: true })])).status).toBe("memory_limit");
  });

  it("compile_error before tests, runtime_error for fatal and test errors", () => {
    const c = decideVerdict(job(), obs([{ kind: "compile_error", error: "SyntaxError", stdout: "", memoryKb: 1 }]));
    expect(c).toMatchObject({ status: "compile_error", error: "SyntaxError", passedCount: 0, runtimeMs: null });
    expect(c.caseResults.every((x) => x.status === "not_run")).toBe(true);
    const f = decideVerdict(job(), obs([{ kind: "fatal", status: "error", error: "function evens not found", stdout: "", memoryKb: 1 }]));
    expect(f).toMatchObject({ status: "runtime_error", error: "function evens not found" });
    const e = decideVerdict(job(), obs([ok(0, [2]), err(1, "ZeroDivisionError")]));
    expect(e).toMatchObject({ status: "runtime_error", failedTestIndex: 1, error: "ZeroDivisionError" });
  });

  it("runtime_error ranks above wrong answer in a Run", () => {
    const r = decideVerdict(job({ stopOnFirstFailure: false }), obs([ok(0, [9]), err(1, "boom"), ok(2, [4]), done]));
    expect(r).toMatchObject({ status: "runtime_error", failedTestIndex: 1, passedCount: 1 });
  });

  it("exit before all results is runtime_error 'program exited unexpectedly'", () => {
    const r = decideVerdict(job(), obs([ok(0, [2])], { exitCode: 0 }));
    expect(r).toMatchObject({ status: "runtime_error", failedTestIndex: 1, error: "program exited unexpectedly" });
    const r2 = decideVerdict(job(), obs([], { exitCode: 1 }));
    expect(r2.error).toBe("program exited unexpectedly (exit code 1)");
  });

  it("output cap is runtime_error, unreadable frames are internal_error", () => {
    expect(decideVerdict(job(), obs([], { outputExceeded: true, exitCode: 137 }))).toMatchObject({
      status: "runtime_error",
      error: "Output limit exceeded (1 MB)",
    });
    expect(decideVerdict(job(), obs([ok(0, [2])], { badFrame: true })).status).toBe("internal_error");
    expect(decideVerdict(job(), obs([ok(1, [])])).status).toBe("internal_error");
  });

  it("caps stdout at 64 KB with [truncated]", () => {
    const big = "x".repeat(70_000);
    const r = decideVerdict(job(), obs([ok(0, [2], { stdout: big }), ok(1, []), ok(2, [4]), done]));
    expect(Buffer.byteLength(r.stdout)).toBeLessThanOrEqual(65536);
    expect(r.stdout.endsWith("[truncated]")).toBe(true);
  });

  it("replaces U+0000 and lone surrogates in user-controlled text (Postgres cannot store them)", () => {
    const sig = { name: "probe", params: [{ name: "x", type: "int" }], returns: "string" };
    const run = job({ signature: sig, compare: exact, tests: [{ input: { x: 1 } }, { input: { x: 2 } }], stopOnFirstFailure: false });
    const r = decideVerdict(
      run,
      obs([ok(0, "a\u0000b\uD800", { stdout: "x\u0000y\n" }), err(1, "ValueError: bad\u0000msg"), done]),
    );
    expect(r.status).toBe("runtime_error");
    expect(r.caseResults[0].actual).toBe("a�b�");
    expect(r.caseResults[1].error).toBe("ValueError: bad�msg");
    expect(r.stdout).toBe("x�y\n");
    expect(r.error).toBe("ValueError: bad�msg");

    const submit = job({ signature: sig, compare: exact, tests: [{ input: { x: 1 }, expected: "ab" }] });
    const wa = decideVerdict(submit, obs([ok(0, "a\u0000b")]));
    expect(wa.status).toBe("wrong_answer");
    expect(wa.failedCase?.actual).toBe("a�b");
  });
});
