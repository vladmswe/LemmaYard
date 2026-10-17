// DTO serializer (PLAN.md section 6, AC-M5-8): every status, field
// whitelisting, no hidden-test leakage, truncation.
import { describe, expect, it } from "vitest";

import {
  CASE_VALUE_LIMIT_BYTES,
  SUBMISSION_STATUSES,
  formatCaseValue,
  type SubmissionStatus,
} from "@/lib/submission-dto";
import {
  limitText,
  limitValue,
  toSubmissionDto,
  utf8Length,
  utf8Prefix,
  type SubmissionRow,
} from "@/server/submissions/serialize";

const created = new Date("2026-10-17T10:00:00.000Z");
const finished = new Date("2026-10-17T10:00:02.500Z");

function row(over: Partial<SubmissionRow> = {}): SubmissionRow {
  const status = over.status ?? "accepted";
  const pending = status === "queued" || status === "running";
  return {
    id: "00000000-0000-4000-8000-000000000001",
    kind: "submit",
    status,
    language: "python",
    customInput: null,
    passedCount: 0,
    totalCount: 0,
    runtimeMs: null,
    memoryKb: null,
    error: null,
    stdout: null,
    caseResults: null,
    failedCase: null,
    createdAt: created,
    finishedAt: pending ? null : finished,
    problem: { slug: "two-sum", title: "Two Sum" },
    ...over,
  };
}

const HIDDEN = { input: { nums: [7, 7, 7], target: 99 }, expected: [1, 2], actual: [0, 0] };
const DTO_KEYS = [
  "id",
  "kind",
  "status",
  "language",
  "problem",
  "passedCount",
  "totalCount",
  "runtimeMs",
  "memoryKb",
  "error",
  "stdout",
  "createdAt",
  "finishedAt",
];

describe("toSubmissionDto: submit", () => {
  it.each(SUBMISSION_STATUSES.filter((s) => s !== "wrong_answer"))(
    "%s exposes no case data even if the row has some",
    (status: SubmissionStatus) => {
      const dto = toSubmissionDto(
        row({
          status,
          // Defensive: rows never carry these for submit, but they must not leak.
          failedCase: HIDDEN,
          caseResults: [{ index: 0, status: "passed", ...HIDDEN }],
        }),
      );
      expect(Object.keys(dto).sort()).toEqual([...DTO_KEYS].sort());
      expect(JSON.stringify(dto)).not.toContain("99");
      expect(dto.status).toBe(status);
      expect(dto.finishedAt).toBe(status === "queued" || status === "running" ? null : finished.toISOString());
    },
  );

  it("wrong_answer exposes exactly the first failing case", () => {
    const dto = toSubmissionDto(
      row({
        status: "wrong_answer",
        passedCount: 3,
        totalCount: 10,
        runtimeMs: 12,
        memoryKb: 9000,
        stdout: "debug",
        failedCase: HIDDEN,
        caseResults: [{ index: 5, status: "passed", input: { secret: 1 }, expected: 2 }],
      }),
    );
    expect(dto).toEqual({
      id: "00000000-0000-4000-8000-000000000001",
      kind: "submit",
      status: "wrong_answer",
      language: "python",
      problem: { slug: "two-sum", title: "Two Sum" },
      passedCount: 3,
      totalCount: 10,
      runtimeMs: 12,
      memoryKb: 9000,
      error: null,
      stdout: "debug",
      failedCase: HIDDEN,
      createdAt: "2026-10-17T10:00:00.000Z",
      finishedAt: "2026-10-17T10:00:02.500Z",
    });
    expect(JSON.stringify(dto)).not.toContain("secret");
  });

  it("whitelists failedCase keys", () => {
    const dto = toSubmissionDto(
      row({ status: "wrong_answer", failedCase: { ...HIDDEN, extra: "x" } as never }),
    );
    expect(Object.keys(dto.failedCase!).sort()).toEqual(["actual", "expected", "input"]);
  });

  it("runtime and compile errors carry the error text only", () => {
    for (const status of ["runtime_error", "compile_error"] as const) {
      const dto = toSubmissionDto(row({ status, error: "NameError: x" }));
      expect(dto.error).toBe("NameError: x");
      expect(dto.failedCase).toBeUndefined();
    }
  });
});

describe("toSubmissionDto: run", () => {
  const samples = [
    { index: 0, status: "passed" as const, input: { nums: [1, 2], target: 3 }, expected: [0, 1], actual: [0, 1], timeMs: 1 },
    { index: 1, status: "failed" as const, input: { nums: [3, 3], target: 6 }, expected: [0, 1], actual: [], timeMs: 2 },
    { index: 2, status: "not_run" as const, input: { nums: [5], target: 5 }, expected: [] },
  ];

  it.each(SUBMISSION_STATUSES)("%s: caseResults only when present, never failedCase", (status) => {
    const dto = toSubmissionDto(row({ kind: "run", status, caseResults: samples, failedCase: HIDDEN }));
    expect(dto.failedCase).toBeUndefined();
    expect(dto.caseResults).toEqual(samples);
  });

  it("omits caseResults while queued/running (null in the DB)", () => {
    const dto = toSubmissionDto(row({ kind: "run", status: "queued" }));
    expect(dto).not.toHaveProperty("caseResults");
  });

  it("whitelists case keys", () => {
    const dto = toSubmissionDto(
      row({
        kind: "run",
        caseResults: [{ ...samples[0], hidden: "x", error: "boom" } as never],
      }),
    );
    expect(Object.keys(dto.caseResults![0]).sort()).toEqual(
      ["actual", "error", "expected", "index", "input", "status", "timeMs"],
    );
  });

  it("custom input never carries expected", () => {
    const dto = toSubmissionDto(
      row({
        kind: "run",
        status: "accepted",
        customInput: { nums: [1], target: 1 },
        caseResults: [{ index: 0, status: "passed", input: { nums: [1], target: 1 }, expected: 42, actual: [] }],
      }),
    );
    expect(dto.caseResults).toEqual([{ index: 0, status: "passed", input: { nums: [1], target: 1 }, actual: [] }]);
  });
});

describe("truncation", () => {
  it("utf8Prefix never splits a character", () => {
    expect(utf8Prefix("aé", 2)).toBe("a");
    expect(utf8Prefix("a😀", 4)).toBe("a");
    expect(utf8Prefix("a😀", 5)).toBe("a😀");
  });

  it("limitText cuts to the byte limit with the [truncated] marker", () => {
    expect(limitText(null, 10)).toBeNull();
    expect(limitText("short", 10)).toBe("short");
    const cut = limitText("é".repeat(100), 50)!;
    expect(utf8Length(cut)).toBeLessThanOrEqual(50);
    expect(cut.endsWith("\n[truncated]")).toBe(true);
  });

  it("keeps values up to 16 KB of JSON and turns larger ones into a cut JSON string", () => {
    const fits = { s: "x".repeat(CASE_VALUE_LIMIT_BYTES - 8) };
    expect(utf8Length(JSON.stringify(fits))).toBe(CASE_VALUE_LIMIT_BYTES);
    expect(limitValue(fits)).toEqual({ value: fits, truncated: false });

    const big = Array.from({ length: 10_000 }, (_, i) => `str"${i}"é`);
    const limited = limitValue(big);
    expect(limited.truncated).toBe(true);
    expect(typeof limited.value).toBe("string");
    expect(utf8Length(JSON.stringify(limited.value))).toBeLessThanOrEqual(CASE_VALUE_LIMIT_BYTES);
    expect(JSON.stringify(big).startsWith((limited.value as string).slice(0, -1))).toBe(true);
    expect((limited.value as string).endsWith("…")).toBe(true);
  });

  it("flags truncated fields of a failed case, keeps the rest", () => {
    const big = Array.from({ length: 5000 }, (_, i) => i);
    const dto = toSubmissionDto(
      row({ status: "wrong_answer", failedCase: { input: { nums: big }, expected: [1], actual: big } }),
    );
    const fc = dto.failedCase!;
    expect(fc.truncated).toBe(true);
    expect(fc.truncatedFields).toEqual(["input", "actual"]);
    expect(fc.expected).toEqual([1]);
    expect(utf8Length(JSON.stringify(fc.input))).toBeLessThanOrEqual(CASE_VALUE_LIMIT_BYTES);
    expect(formatCaseValue(fc, "expected")).toBe("[1]");
    expect(formatCaseValue(fc, "input")).toMatch(/^\{"nums":\[0,1,2,.*…$/);
  });

  it("flags truncated fields of run cases; small cases have no flag", () => {
    const big = "y".repeat(20_000);
    const dto = toSubmissionDto(
      row({
        kind: "run",
        caseResults: [
          { index: 0, status: "passed", input: { s: "a" }, expected: "a", actual: "a" },
          { index: 1, status: "failed", input: { s: "b" }, expected: "b", actual: big },
        ],
      }),
    );
    expect(dto.caseResults![0]).not.toHaveProperty("truncated");
    expect(dto.caseResults![1]).toMatchObject({ truncated: true, truncatedFields: ["actual"] });
    expect(formatCaseValue(dto.caseResults![0], "actual")).toBe('"a"');
    expect(formatCaseValue(dto.caseResults![0], "error" as never)).toBeUndefined();
  });

  it("enforces error ≤ 8 KB and stdout ≤ 64 KB again", () => {
    const dto = toSubmissionDto(
      row({ status: "runtime_error", error: "e".repeat(20_000), stdout: "é".repeat(40_000) }),
    );
    expect(utf8Length(dto.error!)).toBeLessThanOrEqual(8 * 1024);
    expect(utf8Length(dto.stdout!)).toBeLessThanOrEqual(64 * 1024);
    expect(dto.stdout!.endsWith("[truncated]")).toBe(true);
  });

  it("cuts per-case error text to 8 KB", () => {
    const dto = toSubmissionDto(
      row({ kind: "run", caseResults: [{ index: 0, status: "runtime_error", input: {}, error: "x".repeat(9000) }] }),
    );
    expect(utf8Length(dto.caseResults![0].error!)).toBeLessThanOrEqual(8 * 1024);
  });
});
