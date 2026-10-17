// End to end through the API (AC-M5-7/8/10 server side): POST run/submit via
// the route handlers, the real worker loop with the REAL DockerExecutor on the
// test DB, polling GET /api/submissions/:id through the client helper until a
// final status. Needs Docker and `pnpm sandbox:build`.
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";

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

import { POST as runRoute } from "@/app/api/problems/[slug]/run/route";
import { POST as submitRoute } from "@/app/api/problems/[slug]/submit/route";
import { GET as getRoute } from "@/app/api/submissions/[id]/route";
import { pollSubmission } from "@/lib/submission-client";
import type { SubmissionDto } from "@/lib/submission-dto";
import { SESSION_COOKIE } from "@/server/auth/cookie";
import { signSessionToken } from "@/server/auth/token";
import { getEnv } from "@/server/env";
import { importProblems, loadProblems } from "@/server/problems/importer";

import { createDockerExecutor } from "../../worker/docker-executor";
import { startWorker } from "../../worker/loop";
import { closeTestDb, createUser, getTestDb, resetTestDb } from "../helpers/db";
import { config, sandboxContainers } from "../helpers/sandbox";

const ORIGIN = new URL(getEnv().AUTH_URL).origin;
const ROOT = path.join(process.cwd(), "problems");

function post(kind: "run" | "submit", body: unknown) {
  const request = new Request(`${ORIGIN}/api/problems/two-sum/${kind}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify(body),
  });
  const ctx = { params: Promise.resolve({ slug: "two-sum" }) };
  return kind === "run" ? runRoute(request, ctx) : submitRoute(request, ctx);
}

/** `fetch` for the client helper, answered by the GET route handler. */
const routeFetch = (async (input: string | URL | Request) => {
  const id = String(input).split("/").pop()!;
  return getRoute(new Request(`${ORIGIN}/api/submissions/${id}`), { params: Promise.resolve({ id }) });
}) as typeof fetch;

async function start(kind: "run" | "submit", body: unknown): Promise<string> {
  const res = await post(kind, body);
  expect(res.status).toBe(202);
  return ((await res.json()) as { id: string }).id;
}

async function poll(id: string): Promise<SubmissionDto> {
  const seen: string[] = [];
  const result = await pollSubmission(id, {
    config: { queuedTimeoutMs: 60_000, runningTimeoutMs: 60_000 },
    fetch: routeFetch,
    intervalMs: 100,
    onUpdate: (s) => seen.push(s.status),
  });
  if (result.state !== "done") throw new Error(`poll ended with ${JSON.stringify(result)}`);
  expect(seen.at(-1)).toBe(result.submission.status);
  return result.submission;
}

let tests: { input: Record<string, unknown>; expected: unknown; sample?: boolean }[];

beforeAll(() => {
  state.db = getTestDb();
});
beforeEach(async () => {
  await resetTestDb();
  const twoSum = (await loadProblems(ROOT)).filter((p) => p.meta.slug === "two-sum");
  await importProblems(getTestDb(), twoSum);
  tests = twoSum[0].tests;
  const user = await createUser();
  state.cookies.set(SESSION_COOKIE, await signSessionToken(user.id));
});
afterAll(closeTestDb);

it("submit correct / wrong and run samples via the API with the real worker", { timeout: 120_000 }, async () => {
  const worker = startWorker({
    db: getTestDb(),
    executor: createDockerExecutor(config()),
    workerId: "it-api-docker",
    concurrency: 2,
    pollMs: 50,
    staleMin: 3,
    log: () => {},
  });
  try {
    const correctCode = readFileSync(path.join(ROOT, "two-sum/solution.py"), "utf8");
    const wrongCode = "class Solution:\n    def twoSum(self, nums, target):\n        print('dbg')\n        return [0, 1]\n";
    const correctId = await start("submit", { language: "python", code: correctCode });
    const wrongId = await start("submit", { language: "python", code: wrongCode });
    const [ok, wa] = await Promise.all([poll(correctId), poll(wrongId)]);

    expect(ok).toMatchObject({
      id: correctId,
      kind: "submit",
      status: "accepted",
      language: "python",
      problem: { slug: "two-sum", title: "Two Sum" },
      passedCount: tests.length,
      totalCount: tests.length,
      error: null,
    });
    expect(ok.runtimeMs).not.toBeNull();
    expect(ok.memoryKb).toBeGreaterThan(0);
    expect(ok.finishedAt).not.toBeNull();
    expect(ok).not.toHaveProperty("failedCase");
    expect(ok).not.toHaveProperty("caseResults");

    // [0, 1] is right for the second sample only; the first failing test is test 0.
    const firstFailing = tests.findIndex((t) => JSON.stringify(t.expected) !== "[0,1]");
    expect(wa).toMatchObject({ status: "wrong_answer", passedCount: firstFailing, totalCount: tests.length });
    expect(wa.failedCase).toEqual({
      input: tests[firstFailing].input,
      expected: tests[firstFailing].expected,
      actual: [0, 1],
    });
    expect(wa).not.toHaveProperty("caseResults");
    expect(wa.stdout).toContain("dbg");
    // No other test's input or expected appears anywhere in the response.
    const waJson = JSON.stringify(wa);
    for (const [i, t] of tests.entries()) {
      if (i === firstFailing) continue;
      expect(waJson).not.toContain(JSON.stringify(t.input));
    }

    // Run on the samples: per-case results with the (public) expected values.
    const run = await poll(await start("run", { language: "python", code: wrongCode }));
    const samples = tests.filter((t) => t.sample);
    expect(run).toMatchObject({ kind: "run", status: "wrong_answer", totalCount: samples.length });
    expect(run).not.toHaveProperty("failedCase");
    expect(run.caseResults?.map((c) => [c.input, c.expected])).toEqual(samples.map((s) => [s.input, s.expected]));

    // Custom-input run: Output only, no expected.
    const custom = await poll(
      await start("run", { language: "python", code: correctCode, customInput: { nums: [3, 4, 5], target: 9 } }),
    );
    expect(custom).toMatchObject({ kind: "run", status: "accepted", totalCount: 1 });
    expect(custom.caseResults).toEqual([
      expect.objectContaining({ index: 0, status: "passed", input: { nums: [3, 4, 5], target: 9 }, actual: [1, 2] }),
    ]);
    expect(custom.caseResults![0]).not.toHaveProperty("expected");
  } finally {
    await worker.stop();
  }
  expect(sandboxContainers()).toEqual([]);
});
