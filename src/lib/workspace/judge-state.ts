// State of the Run/Submit flow in the problem workspace (AC-M5-3…6, AC-M5-10)
// and its mapping to what the console shows. Pure: the React side only stores
// a `JudgeState` and renders `toResultView(state)`.
//
// Everything rendered comes from the submission DTO (AC-M5-8): the view never
// invents expected values or hidden cases, and Run vs Submit is decided by
// the DTO's `kind`, not by which button was pressed.
import { isJudgeDisabledError, JUDGE_DISABLED_NOTE, JUDGE_DISABLED_SHORT } from "@/lib/judge-availability";
import { formatValue } from "@/lib/problems/samples";
import type { PollResult, StartResult } from "@/lib/submission-client";
import {
  formatCaseValue,
  type CaseResultDto,
  type CaseResultStatus,
  type FailedCaseDto,
  type FinalStatus,
  type PendingStatus,
  type SubmissionDto,
  type SubmissionKind,
} from "@/lib/submission-dto";

export type JudgeAction = SubmissionKind;

export type JudgeState =
  | { phase: "idle" }
  /** POST in flight. */
  | { phase: "starting"; action: JudgeAction; custom: boolean }
  /** Polling; `status` from the last DTO (starts as queued). */
  | { phase: "pending"; action: JudgeAction; custom: boolean; id: string; status: PendingStatus }
  | { phase: "done"; custom: boolean; submission: SubmissionDto }
  | { phase: "judge_unavailable"; action: JudgeAction; id: string; message: string }
  | { phase: "taking_longer"; action: JudgeAction; id: string; message: string; href: string | null }
  /** The server answered 503 `judge_disabled`: not an error, nothing was queued. */
  | { phase: "judge_disabled"; action: JudgeAction }
  /** The request was rejected (4xx), the network failed, or polling failed. */
  | { phase: "failed"; action: JudgeAction; status: number; message: string };

export const IDLE: JudgeState = { phase: "idle" };

/** While true, Run and Submit are disabled (AC-M5-6). */
export function isBusy(state: JudgeState): boolean {
  return state.phase === "starting" || state.phase === "pending";
}

/** Which button shows the spinner. */
export function busyAction(state: JudgeState): JudgeAction | null {
  return state.phase === "starting" || state.phase === "pending" ? state.action : null;
}

/** Message for a rejected start (toast + console). 429 gets the retry hint. */
export function startErrorMessage(result: Extract<StartResult, { ok: false }>): string {
  if (result.status === 0) return "Network error: the request did not reach the server. Check your connection and try again.";
  if (result.status === 429) {
    const hint = result.retryAfterSec ? ` Try again in ${result.retryAfterSec} s.` : "";
    // The server message already names the wait for rate limits; avoid saying it twice.
    if (/try again in/i.test(result.error)) return result.error;
    return `${result.error.replace(/\.$/, "")}.${hint}`;
  }
  return result.error;
}

export function stateFromStartError(
  action: JudgeAction,
  result: Extract<StartResult, { ok: false }>,
): JudgeState {
  if (isJudgeDisabledError(result)) return { phase: "judge_disabled", action };
  return { phase: "failed", action, status: result.status, message: startErrorMessage(result) };
}

export function stateFromPoll(action: JudgeAction, custom: boolean, result: PollResult): JudgeState | null {
  switch (result.state) {
    case "done":
      return { phase: "done", custom, submission: result.submission };
    case "judge_unavailable":
      return { phase: "judge_unavailable", action, id: result.submissionId, message: result.message };
    case "taking_longer":
      return {
        phase: "taking_longer",
        action,
        id: result.submissionId,
        message: result.message,
        href: result.href,
      };
    case "error":
      return {
        phase: "failed",
        action,
        status: result.status,
        message:
          result.status === 404
            ? "This submission is no longer available."
            : result.status === 0
              ? "Network error while waiting for the result. Check your connection and try again."
              : result.message,
      };
    case "aborted":
      return null;
  }
}

// ---------------------------------------------------------------------------
// View model

export type ValueView = { text: string; truncated: boolean };

export type InputView =
  /** Parameters in signature order: `nums = [2, 7]`. */
  | { kind: "params"; params: { name: string; text: string }[] }
  /** Truncated (or unexpected) input: the cut JSON text. */
  | { kind: "raw"; text: string; truncated: boolean };

export type CaseView = {
  index: number;
  /** "Case 1". */
  label: string;
  status: CaseResultStatus;
  input: InputView;
  expected?: ValueView;
  output?: ValueView;
  /** Output differs from expected (or the case failed). */
  outputWrong: boolean;
  error?: string;
  timeMs?: number;
};

export type FailedCaseView = { input: InputView; expected: ValueView; output: ValueView };

export type ResultView =
  | { type: "idle" }
  /** Code execution is off on this deployment (idle console, or a 503 `judge_disabled`). */
  | { type: "judge_disabled"; message: string; announce: string }
  | { type: "pending"; status: PendingStatus; label: string }
  | {
      type: "notice";
      tone: "warning" | "danger";
      title: string;
      message: string;
      href?: string;
      /** Final announcement for the live region. */
      announce: string;
    }
  | {
      type: "run";
      status: FinalStatus;
      /** "Passed 3/3 samples". */
      summary: string;
      timeMs: number | null;
      cases: CaseView[];
      stdout: string | null;
      error: string | null;
      explanation: string | null;
      announce: string;
    }
  | {
      /** Custom-input Run: "Output" only, no verdict label unless it failed. */
      type: "custom";
      status: FinalStatus;
      output: ValueView | null;
      input: InputView | null;
      timeMs: number | null;
      stdout: string | null;
      error: string | null;
      explanation: string | null;
      announce: string;
    }
  | {
      type: "submit";
      status: FinalStatus;
      /** "13/13 tests passed". */
      summary: string;
      runtimeMs: number | null;
      memoryKb: number | null;
      failedCase: FailedCaseView | null;
      /** "Failed on test 7 of 12". */
      failedOn: string | null;
      stdout: string | null;
      error: string | null;
      explanation: string | null;
      announce: string;
    };

export const PENDING_LABELS: Record<PendingStatus, string> = {
  queued: "Queued…",
  running: "Running…",
};

const STATUS_WORDS: Record<FinalStatus, string> = {
  accepted: "Accepted",
  wrong_answer: "Wrong Answer",
  time_limit: "Time Limit Exceeded",
  memory_limit: "Memory Limit Exceeded",
  runtime_error: "Runtime Error",
  compile_error: "Compile Error",
  internal_error: "Internal Error",
};

export const INTERNAL_ERROR_MESSAGE =
  "Something went wrong on our side. This submission doesn't count against you.";

/** Like `formatValue`, but JS results that JSON cannot carry (`{"$nonJson":"undefined"}`) read as `undefined`, `NaN`, … */
export function formatResultValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(formatResultValue).join(", ")}]`;
  if (
    value !== null &&
    typeof value === "object" &&
    Object.keys(value).length === 1 &&
    typeof (value as { $nonJson?: unknown }).$nonJson === "string"
  ) {
    return (value as { $nonJson: string }).$nonJson;
  }
  return formatValue(value);
}

function valueView(item: CaseResultDto | FailedCaseDto, field: "expected" | "actual"): ValueView | undefined {
  const text = formatCaseValue(item, field);
  if (text === undefined) return undefined;
  const truncated = item.truncatedFields?.includes(field) ?? false;
  // Whole values read like the statement's examples (`[0, 1]`); cut ones stay raw JSON text.
  const value = (item as Record<typeof field, unknown>)[field];
  return { text: truncated ? text : formatResultValue(value), truncated };
}

function inputView(item: CaseResultDto | FailedCaseDto, paramOrder: readonly string[]): InputView {
  const truncated = item.truncatedFields?.includes("input") ?? false;
  const input = item.input;
  if (truncated || typeof input !== "object" || input === null || Array.isArray(input)) {
    return { kind: "raw", text: formatCaseValue(item, "input") ?? "", truncated };
  }
  const record = input as Record<string, unknown>;
  const names = [...paramOrder.filter((n) => Object.hasOwn(record, n)), ...Object.keys(record).filter((k) => !paramOrder.includes(k))];
  return { kind: "params", params: names.map((name) => ({ name, text: formatValue(record[name]) })) };
}

/** Custom-input Run cases never carry `expected` (PLAN §5, DTO contract). */
export function isCustomRun(submission: SubmissionDto, hint: boolean): boolean {
  const cases = submission.caseResults;
  if (submission.kind !== "run") return false;
  if (!cases || cases.length === 0) return hint;
  return cases.every((c) => !Object.hasOwn(c, "expected"));
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** Plain-words explanation of a limit / error verdict. `unit` is "test" or "sample". */
function explain(status: FinalStatus, at: number | null, total: number, unit: string): string | null {
  const where = at !== null && total > 0 ? ` on ${unit} ${at} of ${total}` : "";
  switch (status) {
    case "time_limit":
      return `Your code ran longer than the time limit${where}. Look for an infinite loop or an algorithm that is too slow for the input size.`;
    case "memory_limit":
      return `Your code used more memory than allowed${where}. Look for very large lists, strings or deep recursion.`;
    case "internal_error":
      return INTERNAL_ERROR_MESSAGE;
    default:
      return null;
  }
}

function casesView(submission: SubmissionDto, paramOrder: readonly string[]): CaseView[] {
  return (submission.caseResults ?? []).map((c) => {
    const expected = valueView(c, "expected");
    const output = valueView(c, "actual");
    return {
      index: c.index,
      label: `Case ${c.index + 1}`,
      status: c.status,
      input: inputView(c, paramOrder),
      ...(expected && { expected }),
      ...(output && { output }),
      outputWrong: c.status !== "passed" && c.status !== "not_run",
      ...(c.error !== undefined && { error: c.error }),
      ...(c.timeMs !== undefined && { timeMs: c.timeMs }),
    };
  });
}

function sumTimes(cases: CaseResultDto[] | undefined): number | null {
  const times = (cases ?? []).map((c) => c.timeMs).filter((t): t is number => typeof t === "number");
  return times.length > 0 ? times.reduce((a, b) => a + b, 0) : null;
}

/** Final DTO → console view. `paramOrder` = signature parameter names. */
export function submissionView(
  submission: SubmissionDto,
  paramOrder: readonly string[],
  customHint = false,
): Extract<ResultView, { type: "run" | "custom" | "submit" }> {
  const status = submission.status as FinalStatus;
  const word = STATUS_WORDS[status] ?? submission.status;
  const stdout = submission.stdout ? submission.stdout : null;
  const error = submission.error ? submission.error : null;

  if (submission.kind === "run" && isCustomRun(submission, customHint)) {
    const first = submission.caseResults?.[0];
    const output = first ? (valueView(first, "actual") ?? null) : null;
    return {
      type: "custom",
      status,
      output,
      input: first ? inputView(first, paramOrder) : null,
      timeMs: submission.runtimeMs ?? sumTimes(submission.caseResults),
      stdout,
      error: error ?? first?.error ?? null,
      explanation: explain(status, null, 0, "input"),
      announce: status === "accepted" ? "Run finished. Output is ready." : `${word}.`,
    };
  }

  if (submission.kind === "run") {
    const cases = casesView(submission, paramOrder);
    const total = cases.length || submission.totalCount;
    const passed = cases.length > 0 ? cases.filter((c) => c.status === "passed").length : submission.passedCount;
    const failing = cases.find((c) => c.status === status || (status !== "wrong_answer" && c.status !== "passed"));
    const summary = `Passed ${passed}/${total} samples`;
    return {
      type: "run",
      status,
      summary,
      timeMs: submission.runtimeMs ?? sumTimes(submission.caseResults),
      cases,
      stdout,
      error,
      explanation: explain(status, failing ? failing.index + 1 : null, total, "case"),
      announce: `${word}. Passed ${passed} of ${total} samples.`,
    };
  }

  const total = submission.totalCount;
  const passed = submission.passedCount;
  const failedAt = status === "accepted" || status === "internal_error" || status === "compile_error" ? null : passed + 1;
  const failedCase = submission.failedCase
    ? {
        input: inputView(submission.failedCase, paramOrder),
        expected: valueView(submission.failedCase, "expected") ?? { text: "", truncated: false },
        output: valueView(submission.failedCase, "actual") ?? { text: "", truncated: false },
      }
    : null;
  return {
    type: "submit",
    status,
    summary: `${passed}/${total} tests passed`,
    runtimeMs: submission.runtimeMs,
    memoryKb: submission.memoryKb,
    failedCase,
    failedOn: failedAt !== null && failedAt <= total ? `Failed on test ${failedAt} of ${total}` : null,
    stdout,
    error,
    explanation: explain(status, failedAt !== null && failedAt <= total ? failedAt : null, total, "test"),
    announce: `${word}. ${passed} of ${plural(total, "test")} passed.`,
  };
}

const JUDGE_DISABLED_VIEW: ResultView = {
  type: "judge_disabled",
  message: JUDGE_DISABLED_NOTE,
  announce: JUDGE_DISABLED_SHORT,
};

/** `judgeEnabled: false` = this deployment runs no code: the idle console says so. */
export function toResultView(
  state: JudgeState,
  paramOrder: readonly string[],
  options: { judgeEnabled?: boolean } = {},
): ResultView {
  switch (state.phase) {
    case "idle":
      return options.judgeEnabled === false ? JUDGE_DISABLED_VIEW : { type: "idle" };
    case "judge_disabled":
      return JUDGE_DISABLED_VIEW;
    case "starting":
      return { type: "pending", status: "queued", label: PENDING_LABELS.queued };
    case "pending":
      return { type: "pending", status: state.status, label: PENDING_LABELS[state.status] };
    case "done":
      return submissionView(state.submission, paramOrder, state.custom);
    case "judge_unavailable":
      return {
        type: "notice",
        tone: "warning",
        title: state.message,
        message: "Your code was not run. Wait a moment and try again.",
        announce: `${state.message}.`,
      };
    case "taking_longer":
      return {
        type: "notice",
        tone: "warning",
        title: state.message,
        message: state.href
          ? "The judge is still working on it. The result will appear on the submission page."
          : "The judge is still working on it. Try running your code again in a moment.",
        ...(state.href && { href: state.href }),
        announce: `${state.message}.`,
      };
    case "failed":
      return {
        type: "notice",
        tone: "danger",
        title: state.status === 0 ? "Network error" : state.action === "run" ? "Couldn't run your code" : "Couldn't submit your code",
        message: state.message,
        announce: state.message,
      };
  }
}

/** "16.2 MB" from kilobytes; "—" when missing. */
export function formatMemory(kb: number | null): string {
  if (kb === null || !Number.isFinite(kb)) return "—";
  return kb < 1024 ? `${kb} KB` : `${(kb / 1024).toFixed(1)} MB`;
}

/** "41 ms"; "—" when missing. */
export function formatMs(ms: number | null | undefined): string {
  return typeof ms === "number" && Number.isFinite(ms) ? `${Math.round(ms)} ms` : "—";
}
