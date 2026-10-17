// Console view model (AC-M5-3, -5, -8, -10): every status maps to a view,
// the view shows only what the DTO carries, and Run vs Submit comes from the
// DTO's `kind`.
import { describe, expect, it } from "vitest";

import {
  SUBMISSION_STATUSES,
  isFinalStatus,
  type SubmissionDto,
  type SubmissionStatus,
} from "@/lib/submission-dto";
import { JUDGE_UNAVAILABLE_MESSAGE, TAKING_LONGER_MESSAGE } from "@/lib/submission-client";
import {
  busyAction,
  formatMemory,
  formatMs,
  formatResultValue,
  IDLE,
  isBusy,
  stateFromPoll,
  stateFromStartError,
  submissionView,
  toResultView,
  type JudgeState,
} from "@/lib/workspace/judge-state";
import { toSubmissionDto, type SubmissionRow } from "@/server/submissions/serialize";

const ID = "00000000-0000-4000-8000-000000000001";
const PARAMS = ["nums", "target"];

function dto(over: Partial<SubmissionDto> = {}): SubmissionDto {
  return {
    id: ID,
    kind: "submit",
    status: "accepted",
    language: "python",
    problem: { slug: "two-sum", title: "Two Sum" },
    passedCount: 13,
    totalCount: 13,
    runtimeMs: 41,
    memoryKb: 16588,
    error: null,
    stdout: null,
    createdAt: "2026-10-17T10:00:00.000Z",
    finishedAt: "2026-10-17T10:00:02.000Z",
    ...over,
  };
}

const sampleCases = [
  { index: 0, status: "passed" as const, input: { nums: [2, 7], target: 9 }, expected: [0, 1], actual: [0, 1], timeMs: 3 },
  { index: 1, status: "failed" as const, input: { target: 6, nums: [3, 3] }, expected: [0, 1], actual: [1, 1], timeMs: 2 },
  { index: 2, status: "passed" as const, input: { nums: [1, 4], target: 5 }, expected: [0, 1], actual: [0, 1], timeMs: 1 },
];

describe("state helpers", () => {
  it("busy while starting or pending", () => {
    expect(isBusy(IDLE)).toBe(false);
    expect(isBusy({ phase: "starting", action: "run", custom: false })).toBe(true);
    expect(isBusy({ phase: "pending", action: "submit", custom: false, id: ID, status: "running" })).toBe(true);
    expect(busyAction({ phase: "pending", action: "submit", custom: false, id: ID, status: "queued" })).toBe("submit");
    expect(isBusy({ phase: "done", custom: false, submission: dto() })).toBe(false);
  });

  it("start errors keep the server message; 429 gets the retry hint once", () => {
    expect(stateFromStartError("run", { ok: false, status: 413, error: "Code is too large" })).toEqual({
      phase: "failed",
      action: "run",
      status: 413,
      message: "Code is too large",
    });
    const rate = stateFromStartError("submit", {
      ok: false,
      status: 429,
      error: "Too many submissions; try again in 12 s",
      retryAfterSec: 12,
    });
    expect(rate).toMatchObject({ message: "Too many submissions; try again in 12 s" });
    const active = stateFromStartError("run", {
      ok: false,
      status: 429,
      error: "You already have 2 submissions in progress; wait for them to finish",
      retryAfterSec: 3,
    });
    expect(active).toMatchObject({
      message: "You already have 2 submissions in progress; wait for them to finish. Try again in 3 s.",
    });
    expect(stateFromStartError("run", { ok: false, status: 0, error: "x" })).toMatchObject({
      message: expect.stringMatching(/^Network error/),
    });
  });

  it("maps every poll outcome", () => {
    expect(stateFromPoll("run", false, { state: "aborted", submissionId: ID })).toBeNull();
    expect(stateFromPoll("run", true, { state: "done", submission: dto({ kind: "run" }) })).toMatchObject({
      phase: "done",
      custom: true,
    });
    const unavailable = stateFromPoll("run", false, {
      state: "judge_unavailable",
      submissionId: ID,
      message: JUDGE_UNAVAILABLE_MESSAGE,
    })!;
    expect(toResultView(unavailable, PARAMS)).toMatchObject({
      type: "notice",
      tone: "warning",
      title: "Judge is unavailable, try again later",
    });
    const longer = stateFromPoll("submit", false, {
      state: "taking_longer",
      submissionId: ID,
      message: TAKING_LONGER_MESSAGE,
      href: `/submissions/${ID}`,
    })!;
    expect(toResultView(longer, PARAMS)).toMatchObject({
      type: "notice",
      title: "Taking longer than expected",
      href: `/submissions/${ID}`,
    });
    const network = stateFromPoll("run", false, { state: "error", submissionId: ID, status: 0, message: "x" })!;
    expect(toResultView(network, PARAMS)).toMatchObject({ type: "notice", tone: "danger", title: "Network error" });
    const gone = stateFromPoll("run", false, { state: "error", submissionId: ID, status: 404, message: "Not found" })!;
    expect(gone).toMatchObject({ message: "This submission is no longer available." });
  });
});

describe("toResultView: pending states", () => {
  it("idle, queued, running", () => {
    expect(toResultView(IDLE, PARAMS)).toEqual({ type: "idle" });
    expect(toResultView({ phase: "starting", action: "run", custom: false }, PARAMS)).toMatchObject({
      type: "pending",
      label: "Queued…",
    });
    const running: JudgeState = { phase: "pending", action: "run", custom: false, id: ID, status: "running" };
    expect(toResultView(running, PARAMS)).toEqual({ type: "pending", status: "running", label: "Running…" });
  });
});

describe("submissionView: every final status", () => {
  const finals = SUBMISSION_STATUSES.filter((s): s is Exclude<SubmissionStatus, "queued" | "running"> => isFinalStatus(s));

  it.each(finals)("submit %s", (status) => {
    const v = submissionView(dto({ status, passedCount: status === "accepted" ? 13 : 3 }), PARAMS);
    expect(v.type).toBe("submit");
    expect(v.status).toBe(status);
    expect(v.announce.length).toBeGreaterThan(0);
  });

  it.each(finals)("sample run %s", (status) => {
    const v = submissionView(dto({ kind: "run", status, totalCount: 3, caseResults: sampleCases }), PARAMS);
    expect(v.type).toBe("run");
    expect(v.status).toBe(status);
  });

  it("submit accepted: summary and metrics", () => {
    const v = submissionView(dto(), PARAMS);
    if (v.type !== "submit") throw new Error();
    expect(v.summary).toBe("13/13 tests passed");
    expect(formatMs(v.runtimeMs)).toBe("41 ms");
    expect(formatMemory(v.memoryKb)).toBe("16.2 MB");
    expect(v.failedCase).toBeNull();
    expect(v.failedOn).toBeNull();
    expect(v.explanation).toBeNull();
  });

  it("submit wrong answer: first failing case and stdout", () => {
    const v = submissionView(
      dto({
        status: "wrong_answer",
        passedCount: 6,
        totalCount: 12,
        stdout: "debug\n",
        failedCase: { input: { target: 6, nums: [3, 3] }, expected: [0, 1], actual: [1, 1] },
      }),
      PARAMS,
    );
    if (v.type !== "submit") throw new Error();
    expect(v.failedOn).toBe("Failed on test 7 of 12");
    expect(v.failedCase).toEqual({
      // Signature order, not input order.
      input: { kind: "params", params: [{ name: "nums", text: "[3, 3]" }, { name: "target", text: "6" }] },
      expected: { text: "[0, 1]", truncated: false },
      output: { text: "[1, 1]", truncated: false },
    });
    expect(v.stdout).toBe("debug\n");
  });

  it("errors carry the text; limits are explained in words", () => {
    const re = submissionView(dto({ status: "runtime_error", passedCount: 0, error: "ZeroDivisionError" }), PARAMS);
    expect(re.error).toBe("ZeroDivisionError");
    const ce = submissionView(dto({ status: "compile_error", passedCount: 0, error: "SyntaxError: x" }), PARAMS);
    if (ce.type !== "submit") throw new Error();
    expect(ce.error).toBe("SyntaxError: x");
    expect(ce.failedOn).toBeNull();
    const tle = submissionView(dto({ status: "time_limit", passedCount: 3 }), PARAMS);
    expect(tle.explanation).toMatch(/longer than the time limit on test 4 of 13/);
    const mle = submissionView(dto({ status: "memory_limit", passedCount: 0 }), PARAMS);
    expect(mle.explanation).toMatch(/more memory than allowed on test 1 of 13/);
    const ie = submissionView(dto({ status: "internal_error", passedCount: 0 }), PARAMS);
    expect(ie.explanation).toMatch(/doesn't count against you/);
  });

  it("sample run: per-case input/expected/output and the summary", () => {
    const v = submissionView(
      dto({ kind: "run", status: "wrong_answer", passedCount: 2, totalCount: 3, runtimeMs: 6, caseResults: sampleCases }),
      PARAMS,
    );
    if (v.type !== "run") throw new Error();
    expect(v.summary).toBe("Passed 2/3 samples");
    expect(v.timeMs).toBe(6);
    expect(v.cases.map((c) => [c.label, c.status, c.outputWrong])).toEqual([
      ["Case 1", "passed", false],
      ["Case 2", "failed", true],
      ["Case 3", "passed", false],
    ]);
    expect(v.cases[1]).toMatchObject({
      expected: { text: "[0, 1]" },
      output: { text: "[1, 1]" },
      input: { kind: "params", params: [{ name: "nums", text: "[3, 3]" }, { name: "target", text: "6" }] },
    });
    const ok = submissionView(dto({ kind: "run", status: "accepted", totalCount: 3, caseResults: sampleCases.map((c) => ({ ...c, status: "passed" as const })) }), PARAMS);
    if (ok.type !== "run") throw new Error();
    expect(ok.summary).toBe("Passed 3/3 samples");
    expect(ok.announce).toBe("Accepted. Passed 3 of 3 samples.");
  });

  it("custom run: Output only, no expected and no verdict label", () => {
    const v = submissionView(
      dto({
        kind: "run",
        status: "accepted",
        totalCount: 1,
        caseResults: [{ index: 0, status: "passed", input: { nums: [1, 2], target: 3 }, actual: [0, 1], timeMs: 2 }],
      }),
      PARAMS,
    );
    expect(v.type).toBe("custom");
    if (v.type !== "custom") throw new Error();
    expect(v.output).toEqual({ text: "[0, 1]", truncated: false });
    expect(JSON.stringify(v)).not.toContain("expected");
    expect(v.announce).not.toMatch(/Accepted/);
  });

  it("custom run without case results falls back to the local hint", () => {
    const failed = dto({ kind: "run", status: "compile_error", error: "SyntaxError", totalCount: 1, passedCount: 0 });
    expect(submissionView(failed, PARAMS, true).type).toBe("custom");
    expect(submissionView(failed, PARAMS, false).type).toBe("run");
  });

  it("shows truncated values as cut text with a flag", () => {
    const v = submissionView(
      dto({
        kind: "run",
        status: "accepted",
        totalCount: 1,
        caseResults: [
          {
            index: 0,
            status: "passed",
            input: '{"nums":[1,2,3…',
            expected: [0, 1],
            actual: '[0,1,2,3,4…',
            truncated: true,
            truncatedFields: ["input", "actual"],
          },
        ],
      }),
      PARAMS,
    );
    if (v.type !== "run") throw new Error();
    expect(v.cases[0].input).toEqual({ kind: "raw", text: '{"nums":[1,2,3…', truncated: true });
    expect(v.cases[0].output).toEqual({ text: "[0,1,2,3,4…", truncated: true });
    expect(v.cases[0].expected).toEqual({ text: "[0, 1]", truncated: false });
  });

  it("JS non-JSON results read naturally", () => {
    expect(formatResultValue({ $nonJson: "undefined" })).toBe("undefined");
    expect(formatResultValue([1, { $nonJson: "NaN" }])).toBe("[1, NaN]");
    expect(formatResultValue("a")).toBe('"a"');
  });
});

describe("kind comes from the DTO, never from the button (AC-M5-8, AC-M5-9)", () => {
  it("a run DTO renders as a run even if the Submit flow received it", () => {
    const state = stateFromPoll("submit", false, {
      state: "done",
      submission: dto({ kind: "run", status: "accepted", totalCount: 3, caseResults: sampleCases }),
    })!;
    expect(toResultView(state, PARAMS).type).toBe("run");
  });

  it("a submit DTO never renders case lists, even if one were attached", () => {
    const v = submissionView(dto({ kind: "submit", caseResults: sampleCases }), PARAMS);
    expect(v.type).toBe("submit");
    expect(JSON.stringify(v)).not.toContain("[3, 3]");
  });
});

describe("no hidden-test leakage through the UI mapping (AC-M5-8)", () => {
  const created = new Date("2026-10-17T10:00:00.000Z");
  const HIDDEN = 987654321;

  function row(over: Partial<SubmissionRow>): SubmissionRow {
    return {
      id: ID,
      kind: "submit",
      status: "accepted",
      language: "python",
      customInput: null,
      passedCount: 13,
      totalCount: 13,
      runtimeMs: 10,
      memoryKb: 9000,
      error: null,
      stdout: null,
      caseResults: null,
      failedCase: null,
      createdAt: created,
      finishedAt: created,
      problem: { slug: "two-sum", title: "Two Sum" },
      ...over,
    };
  }

  it("an accepted submit shows no test data at all", () => {
    // Even if the stored row had per-case data for hidden tests, the DTO drops it.
    const stored = row({
      caseResults: [{ index: 5, status: "passed", input: { nums: [HIDDEN], target: HIDDEN }, expected: [HIDDEN], actual: [HIDDEN] }],
    });
    const text = JSON.stringify(submissionView(toSubmissionDto(stored), PARAMS));
    expect(text).not.toContain(String(HIDDEN));
  });

  it("a wrong answer shows exactly the first failing case and nothing else", () => {
    const stored = row({
      status: "wrong_answer",
      passedCount: 4,
      failedCase: { input: { nums: [1, HIDDEN], target: 1 }, expected: [0, 1], actual: [1, 0] },
      caseResults: [{ index: 9, status: "failed", input: { nums: [HIDDEN + 1], target: 0 }, expected: [HIDDEN + 1], actual: [] }],
    });
    const view = submissionView(toSubmissionDto(stored), PARAMS);
    const text = JSON.stringify(view);
    expect(text).toContain(String(HIDDEN));
    expect(text).not.toContain(String(HIDDEN + 1));
  });
});
