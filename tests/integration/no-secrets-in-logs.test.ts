// AC-M7-4: user code and passwords never reach the logs. The auth and
// submission route handlers and the worker's processing/logging run with a
// unique marker in the password and the code; every console.* call and every
// process stdout/stderr write is captured, as are the structured logger
// (src/server/log.ts, via console.error) and the worker's JSON logger (via
// process.stdout/stderr). Failure paths are included: a database error whose
// Drizzle message embeds the SQL params (= the code), and executor results
// that carry the marker in stdout and in the user's error text.
import { randomBytes } from "node:crypto";

import { DrizzleQueryError } from "drizzle-orm/errors";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/server/db";

const state = vi.hoisted(() => ({
  db: undefined as Db | undefined,
  cookies: new Map<string, string>(),
}));

vi.mock("@/server/db", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/server/db")>();
  return { ...mod, getDb: () => state.db! };
});

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      state.cookies.has(name) ? { name, value: state.cookies.get(name)! } : undefined,
  }),
}));

import { POST as login } from "@/app/api/auth/login/route";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as runRoute } from "@/app/api/problems/[slug]/run/route";
import { POST as submitRoute } from "@/app/api/problems/[slug]/submit/route";
import { SESSION_COOKIE } from "@/server/auth/cookie";
import { resetAuthLimits } from "@/server/auth/rate-limit";
import { getEnv } from "@/server/env";

import { jsonLogger, processSubmission } from "../../worker/loop";
import { claimNext } from "../../worker/queue";
import type { ExecJob, ExecResult, Executor } from "../../worker/types";
import { closeTestDb, createProblem, createTestCases, getTestDb, resetTestDb } from "../helpers/db";

const ORIGIN = new URL(getEnv().AUTH_URL).origin;
const MARKER = `LEAKMARK_${randomBytes(8).toString("hex")}`;
const PASSWORD = `pw-${MARKER}`;
const CODE = `class Solution:\n    def twoSum(self, nums, target):\n        # ${MARKER}\n        return [0, 1]\n`;
const SIGNATURE = {
  name: "twoSum",
  params: [
    { name: "nums", type: "int[]" },
    { name: "target", type: "int" },
  ],
  returns: "int[]",
};

/** Everything written to the console or the process streams during a test. */
const captured: string[] = [];

function capture() {
  for (const method of ["log", "info", "warn", "error", "debug", "trace"] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      captured.push(args.map((a) => (typeof a === "string" ? a : safeStringify(a))).join(" "));
    });
  }
  for (const stream of [process.stdout, process.stderr]) {
    const original = stream.write.bind(stream);
    vi.spyOn(stream, "write").mockImplementation(((chunk: unknown, ...rest: unknown[]) => {
      captured.push(String(chunk));
      // Keep vitest's own output flowing; only our captured text is checked.
      return (original as (...a: unknown[]) => boolean)(chunk, ...rest);
    }) as typeof stream.write);
  }
}

function safeStringify(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}\n${value.stack ?? ""}`;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function json(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN, "X-Forwarded-For": "203.0.113.20", ...headers },
    body: JSON.stringify(body),
  });
}

/** A db whose writes fail like a real constraint/connection error: Drizzle puts the params in the message. */
function failingDb(real: Db): Db {
  const fail = (query: string) => () => {
    throw new DrizzleQueryError(query, [MARKER, PASSWORD, CODE], Object.assign(new Error("connection terminated"), { code: "57P01" }));
  };
  return new Proxy(real, {
    get(target, prop, receiver) {
      if (prop === "transaction") return () => Promise.reject(fail('insert into "submissions"')());
      if (prop === "insert") return fail('insert into "users"');
      return Reflect.get(target, prop, receiver);
    },
  });
}

function expectNoMarker() {
  const text = captured.join("\n");
  expect(text).not.toContain(MARKER);
}

beforeAll(() => {
  state.db = getTestDb();
});
beforeEach(async () => {
  await resetTestDb();
  resetAuthLimits();
  state.db = getTestDb();
  state.cookies.clear();
  captured.length = 0;
  capture();
});
afterEach(() => {
  vi.restoreAllMocks();
});
afterAll(closeTestDb);

describe("no user code or password in logs (AC-M7-4)", () => {
  it("auth routes: register, 409, 400, wrong password, unknown email, 429, success, DB failure", async () => {
    const user = { email: "leak@example.com", username: "leaky", password: PASSWORD };
    const created = await register(json("/api/auth/register", user));
    expect(created.status).toBe(201);
    expect(await created.text()).not.toContain(MARKER);
    expect((await register(json("/api/auth/register", user))).status).toBe(409);
    const tooLong = await register(json("/api/auth/register", { ...user, password: `${PASSWORD}${"x".repeat(200)}` }));
    expect(tooLong.status).toBe(400);
    expect(await tooLong.text()).not.toContain(MARKER);

    for (let i = 0; i < 10; i += 1) {
      expect((await login(json("/api/auth/login", { email: user.email, password: `${PASSWORD}-wrong` }))).status).toBe(401);
    }
    expect((await login(json("/api/auth/login", { email: user.email, password: PASSWORD }))).status).toBe(429);
    const unknown = await login(json("/api/auth/login", { email: "nobody@example.com", password: PASSWORD }, { "X-Forwarded-For": "203.0.113.21" }));
    expect(unknown.status).toBe(401);
    const ok = await login(json("/api/auth/login", { email: user.email, password: PASSWORD }, { "X-Forwarded-For": "203.0.113.22" }));
    expect(ok.status).toBe(200);

    // DB failure on register: 500, logged without the SQL params.
    state.db = failingDb(getTestDb());
    const failed = await register(json("/api/auth/register", { ...user, email: "other@example.com", username: "other" }, { "X-Forwarded-For": "203.0.113.23" }));
    expect(failed.status).toBe(500);
    expect(await failed.text()).not.toContain(MARKER);
    expect(captured.join("\n")).toContain("auth.register_failed");

    expectNoMarker();
  });

  it("submission routes and the worker: queue, judge, log, failures", async () => {
    const problem = await createProblem({ slug: "two-sum", title: "Two Sum", signature: SIGNATURE });
    await createTestCases(problem.id, 3, { input: { nums: [1, 2], target: 3 }, expected: [0, 1] });
    const reg = await register(json("/api/auth/register", { email: "coder@example.com", username: "coder", password: PASSWORD }));
    const token = reg.headers.getSetCookie()[0].split(";")[0].split("=")[1];
    state.cookies.set(SESSION_COOKIE, token);

    const params = { params: Promise.resolve({ slug: "two-sum" }) };
    const submit = await submitRoute(json("/api/problems/two-sum/submit", { language: "python", code: CODE }), params);
    expect(submit.status).toBe(202);
    const run = await runRoute(json("/api/problems/two-sum/run", { language: "python", code: CODE }), params);
    expect(run.status).toBe(202);
    // Rejected payloads (NUL byte, unknown language) are not logged either.
    const nul = await submitRoute(json("/api/problems/two-sum/submit", { language: "python", code: `${CODE}\u0000` }), params);
    expect(nul.status).toBe(400);
    const bad = await submitRoute(json("/api/problems/two-sum/submit", { language: "cobol", code: CODE }), params);
    expect(bad.status).toBe(400);

    // Worker: results carrying the marker in stdout and in the user's error text.
    const outcomes: ((job: ExecJob) => ExecResult)[] = [
      (job) => result(job, { status: "accepted", stdout: `printed ${MARKER}` }),
      (job) => result(job, { status: "runtime_error", stdout: MARKER, error: `NameError: ${MARKER}` }),
    ];
    for (const outcome of outcomes) {
      const claimed = await claimNext(getTestDb(), "leak-test");
      expect(claimed).not.toBeNull();
      expect(claimed!.code).toContain(MARKER);
      const executor: Executor = async (job) => {
        expect(job.code).toContain(MARKER);
        return outcome(job);
      };
      await processSubmission(getTestDb(), executor, claimed!, jsonLogger, "leak-test");
    }
    expect(captured.join("\n")).toContain('"msg":"judged"');

    // Worker: a database error (its Drizzle message holds the code) while processing.
    await submitRoute(json("/api/problems/two-sum/submit", { language: "python", code: CODE }), params);
    const claimed = await claimNext(getTestDb(), "leak-test");
    const dbError = new DrizzleQueryError('update "submissions"', [CODE], new Error("deadlock detected"));
    expect(dbError.message).toContain(MARKER); // what an unfiltered log would print
    await processSubmission(getTestDb(), async () => { throw dbError; }, claimed!, jsonLogger, "leak-test");
    expect(captured.join("\n")).toContain("processing failed");

    // Web: the insert fails; 500 and a log line without the SQL params.
    state.db = failingDb(getTestDb());
    const failed = await submitRoute(json("/api/problems/two-sum/submit", { language: "python", code: CODE }), params);
    expect(failed.status).toBe(500);
    expect(captured.join("\n")).toContain("submissions.submit_insert_failed");

    expectNoMarker();
  });
});

function result(job: ExecJob, over: Partial<ExecResult>): ExecResult {
  const failed = over.status !== undefined && over.status !== "accepted";
  return {
    status: "accepted",
    passedCount: failed ? 0 : job.tests.length,
    totalCount: job.tests.length,
    runtimeMs: 10,
    memoryKb: 10_000,
    failedTestIndex: failed ? 0 : null,
    failedCase: null,
    caseResults: job.tests.map((t, index) => ({ index, status: failed ? "failed" : "passed", input: t.input, timeMs: 1 })),
    stdout: "",
    error: null,
    ...over,
  };
}
