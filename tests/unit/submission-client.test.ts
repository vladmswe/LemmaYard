// Client helper (AC-M5-10): start requests and the polling state machine,
// driven with fake timers and a stubbed fetch.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  JUDGE_UNAVAILABLE_MESSAGE,
  MAX_POLL_FAILURES,
  pollSubmission,
  startRun,
  startSubmit,
  TAKING_LONGER_MESSAGE,
  type PollResult,
} from "@/lib/submission-client";
import type { SubmissionDto, SubmissionStatus } from "@/lib/submission-dto";

const ID = "00000000-0000-4000-8000-000000000001";
const config = { queuedTimeoutMs: 60_000, runningTimeoutMs: 60_000 };

function dto(status: SubmissionStatus): SubmissionDto {
  return {
    id: ID,
    kind: "submit",
    status,
    language: "python",
    problem: { slug: "two-sum", title: "Two Sum" },
    passedCount: 0,
    totalCount: 0,
    runtimeMs: null,
    memoryKb: null,
    error: null,
    stdout: null,
    createdAt: "2026-10-17T10:00:00.000Z",
    finishedAt: null,
  };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

/** A fetch stub answering with the given sequence of statuses (the last one repeats). */
function sequence(steps: Array<SubmissionStatus | Response | Error>) {
  let i = 0;
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
    void _url;
    void _init;
    const step = steps[Math.min(i++, steps.length - 1)];
    if (step instanceof Error) throw step;
    if (step instanceof Response) return step.clone();
    return json(dto(step));
  });
}

/** Runs the poll to completion while advancing fake time; returns the result and elapsed ms. */
async function drive(promise: Promise<PollResult>) {
  const start = Date.now();
  let result: PollResult | undefined;
  void promise.then((r) => (result = r));
  for (let i = 0; i < 1000 && result === undefined; i++) await vi.advanceTimersByTimeAsync(250);
  if (!result) throw new Error("poll did not finish");
  return { result, elapsed: Date.now() - start };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("pollSubmission", () => {
  it("polls once per second and stops at a final status", async () => {
    const fetch = sequence(["queued", "running", "running", "accepted"]);
    const updates: string[] = [];
    const { result, elapsed } = await drive(
      pollSubmission(ID, { config, fetch, onUpdate: (s) => updates.push(s.status) }),
    );
    expect(result).toEqual({ state: "done", submission: dto("accepted") });
    expect(updates).toEqual(["queued", "running", "running", "accepted"]);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(fetch.mock.calls[0][0]).toBe(`/api/submissions/${ID}`);
    expect(elapsed).toBeGreaterThanOrEqual(3000);
    expect(elapsed).toBeLessThan(3500);
  });

  it("queued longer than queuedTimeoutMs → judge unavailable", async () => {
    const fetch = sequence(["queued"]);
    const { result, elapsed } = await drive(pollSubmission(ID, { config: { ...config, queuedTimeoutMs: 5000 }, fetch }));
    expect(result).toEqual({ state: "judge_unavailable", submissionId: ID, message: JUDGE_UNAVAILABLE_MESSAGE });
    expect(elapsed).toBeGreaterThanOrEqual(5000);
    expect(elapsed).toBeLessThan(6500);
  });

  it("running longer than runningTimeoutMs → taking longer, counted from the first running poll", async () => {
    const fetch = sequence(["queued", "queued", "queued", "running"]);
    const { result, elapsed } = await drive(
      pollSubmission(ID, { config: { queuedTimeoutMs: 60_000, runningTimeoutMs: 4000 }, fetch }),
    );
    expect(result).toEqual({
      state: "taking_longer",
      submissionId: ID,
      message: TAKING_LONGER_MESSAGE,
      href: `/submissions/${ID}`,
    });
    // 3 s queued + 4 s running.
    expect(elapsed).toBeGreaterThanOrEqual(7000);
    expect(elapsed).toBeLessThan(8500);
  });

  it("taking longer after a Run: no link (a Run has no submission page)", async () => {
    const runDto = (status: SubmissionStatus) => json({ ...dto(status), kind: "run" });
    const fetch = sequence([runDto("queued"), runDto("running")]);
    const { result } = await drive(pollSubmission(ID, { config: { queuedTimeoutMs: 60_000, runningTimeoutMs: 3000 }, fetch }));
    expect(result).toEqual({ state: "taking_longer", submissionId: ID, message: TAKING_LONGER_MESSAGE, href: null });
  });

  it("a long queue that then runs does not trip the queued timeout", async () => {
    const fetch = sequence(["queued", "queued", "running", "running", "wrong_answer"]);
    const { result } = await drive(
      pollSubmission(ID, { config: { queuedTimeoutMs: 2500, runningTimeoutMs: 10_000 }, fetch }),
    );
    expect(result.state).toBe("done");
  });

  it("404 / 401 end immediately with an error state", async () => {
    for (const status of [404, 401]) {
      const fetch = sequence([json({ error: "Submission not found" }, status)]);
      const { result } = await drive(pollSubmission(ID, { config, fetch }));
      expect(result).toEqual({ state: "error", submissionId: ID, status, message: "Submission not found" });
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  });

  it("retries transient failures, gives up after MAX_POLL_FAILURES in a row", async () => {
    const ok = sequence([new Error("offline"), json({}, 500), "running", "accepted"]);
    expect((await drive(pollSubmission(ID, { config, fetch: ok }))).result.state).toBe("done");

    const down = sequence([new Error("offline")]);
    const { result } = await drive(pollSubmission(ID, { config, fetch: down }));
    expect(result).toMatchObject({ state: "error", status: 0 });
    expect(down).toHaveBeenCalledTimes(MAX_POLL_FAILURES);
  });

  it("a failing network still hits the queued timeout (no endless spinner)", async () => {
    const fetch = sequence(["queued", new Error("offline"), json({}, 502), "queued"]);
    const { result } = await drive(pollSubmission(ID, { config: { ...config, queuedTimeoutMs: 3000 }, fetch }));
    expect(result.state).toBe("judge_unavailable");
  });

  it("stops on abort", async () => {
    const controller = new AbortController();
    const fetch = sequence(["queued"]);
    const promise = pollSubmission(ID, { config, fetch, signal: controller.signal });
    await vi.advanceTimersByTimeAsync(1500);
    controller.abort();
    const { result } = await drive(promise);
    expect(result).toEqual({ state: "aborted", submissionId: ID });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("startRun / startSubmit", () => {
  it("POSTs JSON and returns the id on 202", async () => {
    const fetch = vi.fn(async () => json({ id: ID }, 202));
    const result = await startRun("two-sum", { language: "python", code: "x", customInput: { a: 1 } }, { fetch });
    expect(result).toEqual({ ok: true, id: ID });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/problems/two-sum/run");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({ language: "python", code: "x", customInput: { a: 1 } });
  });

  it("returns the error, field errors and Retry-After", async () => {
    const limited = vi.fn(async () => json({ error: "Too many submissions" }, 429, { "Retry-After": "17" }));
    expect(await startSubmit("two-sum", { language: "python", code: "x" }, { fetch: limited })).toEqual({
      ok: false,
      status: 429,
      error: "Too many submissions",
      retryAfterSec: 17,
    });
    expect((limited.mock.calls[0] as unknown as [string])[0]).toBe("/api/problems/two-sum/submit");

    const invalid = vi.fn(async () => json({ error: "Invalid custom input", fieldErrors: { customInput: "bad" } }, 400));
    expect(await startRun("two-sum", { language: "python", code: "x" }, { fetch: invalid })).toEqual({
      ok: false,
      status: 400,
      error: "Invalid custom input",
      fieldErrors: { customInput: "bad" },
    });
  });

  it("passes a 503 judge_disabled through with its code (no retry, no polling)", async () => {
    const body = { error: "Code execution is not available on this deployment yet", code: "judge_disabled" };
    for (const start of [startRun, startSubmit]) {
      const fetch = vi.fn(async () => json(body, 503));
      expect(await start("two-sum", { language: "python", code: "x" }, { fetch })).toEqual({
        ok: false,
        status: 503,
        error: body.error,
        code: "judge_disabled",
      });
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  });

  it("maps a network failure to status 0", async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError("failed");
    });
    expect(await startSubmit("x", { language: "javascript", code: "y" }, { fetch })).toMatchObject({ ok: false, status: 0 });
  });
});
