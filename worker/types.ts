// Executor contract (PLAN.md sections 3 and 5). The queue/worker calls an
// `Executor`; `DockerExecutor` (worker/docker-executor.ts) is the real
// implementation, tests of the queue substitute a stub. The executor judges:
// it compares with `expected` in TypeScript (worker/judge.ts), so its result is
// the final verdict to store.
import type { CompareSpec, Signature } from "@/lib/problems/schema";
import type { languageEnum, submissionStatusEnum } from "@/server/db/schema";

export type Language = (typeof languageEnum.enumValues)[number];

/** Final verdicts: the DB `submission_status` enum without queued/running. */
export type ExecStatus = Exclude<
  (typeof submissionStatusEnum.enumValues)[number],
  "queued" | "running"
>;

export type ExecTest = {
  /** Keys are exactly the signature's parameter names. */
  input: Record<string, unknown>;
  /** Absent for custom-input runs: such a case is never "wrong answer". */
  expected?: unknown;
};

export type ExecJob = {
  language: Language;
  code: string;
  signature: Signature;
  compare: CompareSpec;
  /** The problem's limits; the executor applies the per-language time multiplier. */
  limits: { timeMs: number; memoryMb: number };
  tests: ExecTest[];
  /** true for Submit (stop at the first failing test), false for Run. */
  stopOnFirstFailure: boolean;
};

export type CaseStatus =
  | "passed"
  | "failed"
  | "runtime_error"
  | "time_limit"
  | "memory_limit"
  | "not_run";

/** One entry per job test, in order (frozen contract, PLAN.md section 4). */
export type CaseResult = {
  index: number;
  status: CaseStatus;
  input: Record<string, unknown>;
  expected?: unknown;
  actual?: unknown;
  timeMs?: number;
  error?: string;
};

export type FailedCase = { input: unknown; expected: unknown; actual: unknown };

export type ExecResult = {
  status: ExecStatus;
  /** Tests that passed (Submit: before the stop; wall-clock kill: "ok" frames received). */
  passedCount: number;
  /** = job.tests.length. */
  totalCount: number;
  /** Sum of per-test times in the sandbox (container start excluded); null if no test ran. */
  runtimeMs: number | null;
  /** Peak RSS of the runner process (ru_maxrss), includes the interpreter baseline. */
  memoryKb: number | null;
  /** Index of the first failing test, null if none (or not attributable). */
  failedTestIndex: number | null;
  /** Only for wrong_answer: the first failing case. */
  failedCase: FailedCase | null;
  /** Always job.tests.length entries; tests after a stop are "not_run". */
  caseResults: CaseResult[];
  /** Captured user output (print/console.*), at most 64 KB, ends with "[truncated]" if cut. */
  stdout: string;
  /** User-facing error text (at most 8 KB), null when there is none. */
  error: string | null;
};

export type Executor = (job: ExecJob) => Promise<ExecResult>;
