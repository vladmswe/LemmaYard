// Pure parts of the worker: ExecResult → submission columns, log-safe error
// text, per-worker container labels.
import { DrizzleQueryError } from "drizzle-orm/errors";
import { describe, expect, it } from "vitest";

import { buildCreateArgs, sandboxCommand } from "../../worker/docker-executor";
import { safeErrorMessage } from "../../worker/loop";
import { stripNul, toFinalFields } from "../../worker/queue";
import type { ExecResult } from "../../worker/types";

const base: ExecResult = {
  status: "wrong_answer",
  passedCount: 1,
  totalCount: 3,
  runtimeMs: 7.6,
  memoryKb: 17_000,
  failedTestIndex: 1,
  failedCase: { input: { x: 1 }, expected: 1, actual: 2 },
  caseResults: [
    { index: 0, status: "passed", input: { x: 0 }, expected: 0, actual: 0 },
    { index: 1, status: "failed", input: { x: 1 }, expected: 1, actual: 2 },
    { index: 2, status: "not_run", input: { x: 2 }, expected: 2 },
  ],
  stdout: "out",
  error: null,
};

describe("toFinalFields", () => {
  it("submit: failed_case for wrong_answer, no case_results", () => {
    const f = toFinalFields("submit", base);
    expect(f).toMatchObject({ status: "wrong_answer", passedCount: 1, totalCount: 3, failedTestIndex: 1, runtimeMs: 8 });
    expect(f.failedCase).toEqual(base.failedCase);
    expect(f.caseResults).toBeNull();
  });

  it("submit: no failed_case for other verdicts", () => {
    expect(toFinalFields("submit", { ...base, status: "runtime_error" }).failedCase).toBeNull();
  });

  it("run: case_results, never failed_case", () => {
    const f = toFinalFields("run", base);
    expect(f.failedCase).toBeNull();
    expect(f.caseResults).toEqual(base.caseResults);
  });

  it("keeps values inside the DB CHECK constraints", () => {
    const f = toFinalFields("submit", {
      ...base,
      status: "time_limit",
      passedCount: 9,
      failedTestIndex: 3,
      runtimeMs: -1,
      memoryKb: Number.NaN,
    });
    expect(f.passedCount).toBe(3);
    expect(f.failedTestIndex).toBeNull();
    expect(f.runtimeMs).toBe(0);
    expect(f.memoryKb).toBeNull();
  });
});

describe("stripNul", () => {
  it("replaces U+0000 in nested strings and keys", () => {
    expect(stripNul({ "a\u0000": ["x\u0000", 1, null, { y: "\u0000" }] })).toEqual({
      "a�": ["x�", 1, null, { y: "�" }],
    });
  });
});

describe("safeErrorMessage", () => {
  it("drops the SQL params (user code) of Drizzle query errors", () => {
    const error = new DrizzleQueryError("update submissions set code = $1", ["SECRET_CODE"], new Error("connection refused"));
    expect(safeErrorMessage(error)).toBe("database: connection refused");
    const noCause = new DrizzleQueryError("update submissions set code = $1", ["SECRET_CODE"]);
    expect(safeErrorMessage(noCause)).toBe("database query failed");
  });

  it("keeps the first line of other errors", () => {
    expect(safeErrorMessage(new Error("boom\nsecond line"))).toBe("boom");
  });
});

describe("worker container labels", () => {
  it("adds extra labels after the sandbox label, before the image", () => {
    const args = buildCreateArgs("img:tag", 256, sandboxCommand("python", 256), ["leetcopy.worker=w1"]);
    const joined = args.join(" ");
    expect(joined).toContain("--label leetcopy.sandbox=1 --label leetcopy.worker=w1");
    expect(args.indexOf("img:tag")).toBeGreaterThan(args.indexOf("leetcopy.worker=w1"));
  });
});
