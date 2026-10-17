// The `GET /api/submissions/:id` response (PLAN.md section 6) and the request
// bodies of `POST /api/problems/:slug/{run,submit}`. Shared by the server
// serializer (src/server/submissions/serialize.ts) and the UI: pure TS, no
// server imports, safe for client components.

export const LANGUAGES = ["python", "javascript"] as const;
export type Language = (typeof LANGUAGES)[number];

export type SubmissionKind = "run" | "submit";

export const SUBMISSION_STATUSES = [
  "queued",
  "running",
  "accepted",
  "wrong_answer",
  "time_limit",
  "memory_limit",
  "runtime_error",
  "compile_error",
  "internal_error",
] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];
export type PendingStatus = "queued" | "running";
export type FinalStatus = Exclude<SubmissionStatus, PendingStatus>;

export function isFinalStatus(status: SubmissionStatus): status is FinalStatus {
  return status !== "queued" && status !== "running";
}

/** Same union as the frozen `CaseResult` contract (PLAN.md section 4). */
export type CaseResultStatus =
  | "passed"
  | "failed"
  | "runtime_error"
  | "time_limit"
  | "memory_limit"
  | "not_run";

/** `input`, `expected` and `actual` are each cut to this many bytes of serialized JSON. */
export const CASE_VALUE_LIMIT_BYTES = 16 * 1024;
/** `error` (submission and per case) is cut to this many UTF-8 bytes. */
export const ERROR_LIMIT_BYTES = 8 * 1024;
/** `stdout` is cut to this many UTF-8 bytes. */
export const STDOUT_LIMIT_BYTES = 64 * 1024;
/** Appended to cut `error` / `stdout` text (same marker as the judge). */
export const TRUNCATED_MARKER = "\n[truncated]";

export type CaseValueField = "input" | "expected" | "actual";

/**
 * Truncation: when a value's serialized JSON exceeds `CASE_VALUE_LIMIT_BYTES`,
 * the field holds a STRING (the beginning of that JSON text followed by "…"),
 * the case gets `truncated: true` and the field name is listed in
 * `truncatedFields`. Use `formatCaseValue()` to display a field either way.
 */
type Truncation = { truncated?: true; truncatedFields?: CaseValueField[] };

/**
 * One case of a Run. Sample runs carry `expected` (samples are public);
 * custom-input runs never carry `expected` (there is none): a case without
 * `expected` means "show Output only, no verdict label".
 */
export type CaseResultDto = {
  index: number;
  status: CaseResultStatus;
  input: unknown;
  expected?: unknown;
  actual?: unknown;
  timeMs?: number;
  error?: string;
} & Truncation;

/** The first failing case of a Submit with `wrong_answer` (the only hidden case ever exposed). */
export type FailedCaseDto = {
  input: unknown;
  expected: unknown;
  actual: unknown;
} & Truncation;

export type SubmissionDto = {
  id: string;
  kind: SubmissionKind;
  status: SubmissionStatus;
  language: Language;
  problem: { slug: string; title: string };
  passedCount: number;
  totalCount: number;
  runtimeMs: number | null;
  memoryKb: number | null;
  /** ≤ 8 KB; compile/runtime error text etc. */
  error: string | null;
  /** ≤ 64 KB of captured user output. */
  stdout: string | null;
  /** Only for kind `run` (absent while queued/running and on internal errors). */
  caseResults?: CaseResultDto[];
  /** Only for kind `submit` with status `wrong_answer`. */
  failedCase?: FailedCaseDto;
  /** ISO 8601. */
  createdAt: string;
  /** ISO 8601, null while queued/running. */
  finishedAt: string | null;
};

/** `POST /api/problems/:slug/run` body. Without `customInput` the sample tests run. */
export type RunRequest = {
  language: Language;
  code: string;
  /** Object keyed by the signature's parameter names (validate with `validateInput` from `@/lib/types`). */
  customInput?: Record<string, unknown>;
};

/** `POST /api/problems/:slug/submit` body. */
export type SubmitRequest = { language: Language; code: string };

/** `202` body of run/submit. */
export type CreatedSubmission = { id: string };

/** Error body of every API failure (`fieldErrors` on 400 validation errors). */
export type ApiError = { error: string; fieldErrors?: Partial<Record<string, string>> };

/**
 * Client polling timeouts (AC-M5-10), read from the server env by
 * `getPollingConfig()` (src/server/submissions/config.ts) and passed to the
 * client as a prop.
 */
export type PollingConfig = {
  /** `queued` longer than this → "judge unavailable" (env `QUEUED_TIMEOUT_MS`). */
  queuedTimeoutMs: number;
  /** `running` longer than this → "taking longer than expected" (env `WALL_CAP_MS` + 30 s). */
  runningTimeoutMs: number;
};

/** Display text of a case field: pretty JSON, or the cut JSON text when truncated. */
export function formatCaseValue(
  item: CaseResultDto | FailedCaseDto,
  field: CaseValueField,
): string | undefined {
  if (!Object.hasOwn(item, field)) return undefined;
  const value = (item as Record<CaseValueField, unknown>)[field];
  if (item.truncatedFields?.includes(field)) return String(value);
  return JSON.stringify(value);
}
