// Typed browser client for Run/Submit (PLAN.md section 6, AC-M5-10): start a
// run/submit, then poll `GET /api/submissions/:id` once a second until a final
// status or a timeout. No React, no server imports; the UI only renders states.
import {
  isFinalStatus,
  type ApiError,
  type PollingConfig,
  type RunRequest,
  type SubmissionDto,
  type SubmitRequest,
} from "./submission-dto";

export const POLL_INTERVAL_MS = 1000;
/** Consecutive failed polls (network / 5xx) before giving up. */
export const MAX_POLL_FAILURES = 5;

export const JUDGE_UNAVAILABLE_MESSAGE = "Judge is unavailable, try again later";
export const TAKING_LONGER_MESSAGE = "Taking longer than expected";

type FetchLike = typeof fetch;
type Options = { fetch?: FetchLike; signal?: AbortSignal };

export type StartResult =
  | { ok: true; id: string }
  | {
      ok: false;
      /** HTTP status; 0 = network error. 401 → send the user to login. */
      status: number;
      error: string;
      fieldErrors?: Partial<Record<string, string>>;
      /** From `Retry-After` on 429. */
      retryAfterSec?: number;
      /** Machine-readable reason when the server sends one (room sessions: `join_first`, `session_ended`, …). */
      code?: string;
    };

async function readError(res: Response): Promise<ApiError & { code?: string }> {
  try {
    const body = (await res.json()) as Partial<ApiError> & { code?: unknown };
    if (typeof body.error === "string") {
      return {
        error: body.error,
        fieldErrors: body.fieldErrors,
        ...(typeof body.code === "string" ? { code: body.code } : {}),
      };
    }
  } catch {
    // Not JSON.
  }
  return { error: `Request failed (${res.status})` };
}

async function start(
  slug: string,
  action: "run" | "submit",
  body: RunRequest | SubmitRequest,
  options: Options,
): Promise<StartResult> {
  const doFetch = options.fetch ?? fetch;
  let res: Response;
  try {
    res = await doFetch(`/api/problems/${encodeURIComponent(slug)}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
      signal: options.signal,
    });
  } catch {
    return { ok: false, status: 0, error: "Network error, check your connection" };
  }
  if (res.status === 202) {
    const { id } = (await res.json()) as { id: string };
    return { ok: true, id };
  }
  const { error, fieldErrors, code } = await readError(res);
  const retryAfter = Number(res.headers.get("retry-after"));
  return {
    ok: false,
    status: res.status,
    error,
    ...(fieldErrors && { fieldErrors }),
    ...(code && { code }),
    ...(res.status === 429 && Number.isFinite(retryAfter) && retryAfter > 0 && { retryAfterSec: retryAfter }),
  };
}

/** Run the sample tests, or one custom input. */
export function startRun(slug: string, body: RunRequest, options: Options = {}): Promise<StartResult> {
  return start(slug, "run", body, options);
}

/** Submit against every test. */
export function startSubmit(slug: string, body: SubmitRequest, options: Options = {}): Promise<StartResult> {
  return start(slug, "submit", body, options);
}

/** Final outcome of `pollSubmission()`. */
export type PollResult =
  /** Final status reached: render `submission`. */
  | { state: "done"; submission: SubmissionDto }
  /** Still `queued` after `queuedTimeoutMs`. */
  | { state: "judge_unavailable"; submissionId: string; message: string }
  /**
   * Still `running` after `runningTimeoutMs`. `href` = the submission page,
   * only for a Submit: Runs have no page (it would be a 404).
   */
  | { state: "taking_longer"; submissionId: string; message: string; href: string | null }
  /** 404 (gone or not yours), 401 (signed out), or repeated network/server errors. */
  | { state: "error"; submissionId: string; status: number; message: string }
  | { state: "aborted"; submissionId: string };

export type PollOptions = Options & {
  config: PollingConfig;
  /** Every fetched DTO, including queued/running ones (for "Queued…" / "Running…"). */
  onUpdate?: (submission: SubmissionDto) => void;
  intervalMs?: number;
};

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    }
    signal?.addEventListener("abort", done, { once: true });
  });
}

/**
 * Polls once per `intervalMs` (first request immediately). Timeouts use the
 * client clock: `queued` counts from the start of polling, `running` from
 * the first poll that saw `running`. Never loops forever.
 */
export async function pollSubmission(id: string, options: PollOptions): Promise<PollResult> {
  const { config, onUpdate, signal } = options;
  const doFetch = options.fetch ?? fetch;
  const intervalMs = options.intervalMs ?? POLL_INTERVAL_MS;
  const startedAt = Date.now();
  let runningSince: number | null = null;
  let failures = 0;
  let lastStatus: SubmissionDto["status"] = "queued";
  let lastKind: SubmissionDto["kind"] | null = null;

  for (;;) {
    if (signal?.aborted) return { state: "aborted", submissionId: id };
    let res: Response | null = null;
    try {
      res = await doFetch(`/api/submissions/${encodeURIComponent(id)}`, {
        credentials: "same-origin",
        cache: "no-store",
        signal,
      });
    } catch {
      if (signal?.aborted) return { state: "aborted", submissionId: id };
    }

    if (res?.ok) {
      failures = 0;
      const submission = (await res.json()) as SubmissionDto;
      lastStatus = submission.status;
      lastKind = submission.kind;
      onUpdate?.(submission);
      if (isFinalStatus(submission.status)) return { state: "done", submission };
      if (submission.status === "running") runningSince ??= Date.now();
    } else if (res && (res.status === 404 || res.status === 401 || res.status === 403)) {
      const { error } = await readError(res);
      return { state: "error", submissionId: id, status: res.status, message: error };
    } else {
      failures += 1;
      if (failures >= MAX_POLL_FAILURES) {
        return {
          state: "error",
          submissionId: id,
          status: res?.status ?? 0,
          message: res ? `Server error (${res.status})` : "Network error, check your connection",
        };
      }
    }

    const now = Date.now();
    if (lastStatus === "queued" && now - startedAt >= config.queuedTimeoutMs) {
      return { state: "judge_unavailable", submissionId: id, message: JUDGE_UNAVAILABLE_MESSAGE };
    }
    if (runningSince !== null && now - runningSince >= config.runningTimeoutMs) {
      return {
        state: "taking_longer",
        submissionId: id,
        message: TAKING_LONGER_MESSAGE,
        href: lastKind === "submit" ? `/submissions/${id}` : null,
      };
    }
    await wait(intervalMs, signal);
  }
}
