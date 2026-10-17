// Run/Submit API through the real route handlers and the test database
// (AC-M5-7/8/9, PLAN.md section 6). `next/headers` cookies() is replaced by a
// per-test cookie jar, as in the auth tests.
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/server/db";
import { submissions } from "@/server/db/schema";

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
import type { SubmissionDto } from "@/lib/submission-dto";
import { SESSION_COOKIE } from "@/server/auth/cookie";
import { signSessionToken } from "@/server/auth/token";
import { getEnv } from "@/server/env";
import { insertWithLimits } from "@/server/submissions/create";

import {
  closeTestDb,
  createProblem,
  createSubmission,
  createTestCases,
  createUser,
  getTestDb,
  resetTestDb,
} from "../helpers/db";

const env = getEnv();
const ORIGIN = new URL(env.AUTH_URL).origin;
const SIGNATURE = {
  name: "twoSum",
  params: [
    { name: "nums", type: "int[]" },
    { name: "target", type: "int" },
  ],
  returns: "int[]",
};
const CODE = "class Solution:\n    def twoSum(self, nums, target):\n        return [0, 1]\n";

type Kind = "run" | "submit";

function post(kind: Kind, slug: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}/api/problems/${slug}/${kind}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function call(kind: Kind, slug: string, body: unknown, headers?: Record<string, string>) {
  const route = kind === "run" ? runRoute : submitRoute;
  return route(post(kind, slug, body, headers), { params: Promise.resolve({ slug }) });
}

function get(id: string) {
  return getRoute(new Request(`${ORIGIN}/api/submissions/${id}`), { params: Promise.resolve({ id }) });
}

async function signIn(userId: string | null) {
  state.cookies.clear();
  if (userId) state.cookies.set(SESSION_COOKIE, await signSessionToken(userId));
}

const rowCount = () => getTestDb().$count(submissions);

let problem: Awaited<ReturnType<typeof createProblem>>;
let user: Awaited<ReturnType<typeof createUser>>;

beforeAll(() => {
  state.db = getTestDb();
});
beforeEach(async () => {
  await resetTestDb();
  problem = await createProblem({ slug: "two-sum", title: "Two Sum", signature: SIGNATURE });
  await createTestCases(problem.id, 5, { input: { nums: [1, 2], target: 3 }, expected: [0, 1] });
  user = await createUser();
  await signIn(user.id);
});
afterAll(closeTestDb);

describe("rejections create no rows (AC-M5-7)", () => {
  const ok = { language: "python", code: CODE };

  async function expectRejected(res: Response, status: number, error?: RegExp) {
    expect(res.status).toBe(status);
    const body = await res.json();
    if (error) expect(body.error).toMatch(error);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await rowCount()).toBe(0);
    return body;
  }

  it.each<Kind>(["run", "submit"])("%s: wrong Content-Type → 403", async (kind) => {
    await expectRejected(await call(kind, "two-sum", ok, { "Content-Type": "text/plain" }), 403, /Content-Type/);
  });

  it.each<Kind>(["run", "submit"])("%s: foreign Origin → 403", async (kind) => {
    await expectRejected(await call(kind, "two-sum", ok, { Origin: "http://evil.example" }), 403, /Cross-origin/);
  });

  it("no Origin header is allowed (curl)", async () => {
    const req = new Request(`${ORIGIN}/api/problems/two-sum/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ok),
    });
    expect((await submitRoute(req, { params: Promise.resolve({ slug: "two-sum" }) })).status).toBe(202);
  });

  it.each<Kind>(["run", "submit"])("%s: no session → 401", async (kind) => {
    await signIn(null);
    await expectRejected(await call(kind, "two-sum", ok), 401);
  });

  it("a forged token → 401", async () => {
    state.cookies.set(SESSION_COOKIE, "a.b.c");
    await expectRejected(await call("submit", "two-sum", ok), 401);
  });

  it("checks Origin before the session (403 for a guest with a foreign Origin)", async () => {
    await signIn(null);
    await expectRejected(await call("submit", "two-sum", ok, { Origin: "http://evil.example" }), 403);
  });

  it("checks the session before the body (401 for a guest with a broken body)", async () => {
    await signIn(null);
    await expectRejected(await call("submit", "two-sum", "{nope"), 401);
  });

  it.each<[string, unknown]>([
    ["malformed JSON", "{not json"],
    ["missing code", { language: "python" }],
    ["empty code", { language: "python", code: "" }],
    ["unknown language", { language: "ruby", code: "x" }],
    ["extra field", { language: "python", code: "x", admin: true }],
    ["array body", [1, 2]],
  ])("submit: %s → 400", async (_name, body) => {
    await expectRejected(await call("submit", "two-sum", body), 400);
  });

  it("submit does not accept customInput (400)", async () => {
    await expectRejected(
      await call("submit", "two-sum", { ...ok, customInput: { nums: [1], target: 1 } }),
      400,
    );
  });

  it("body over 70 KB → 413 (declared or streamed)", async () => {
    const big = { language: "python", code: "a".repeat(72 * 1024) };
    await expectRejected(await call("submit", "two-sum", big), 413, /too large/);
    // Lying Content-Length: the streamed size still counts.
    await expectRejected(await call("submit", "two-sum", big, { "Content-Length": "100" }), 413);
  });

  it("code over MAX_CODE_BYTES in UTF-8 bytes → 413 (multibyte under the char limit)", async () => {
    // 33000 characters, 66000 bytes; the body (≈66 KB) is under 70 KB.
    const body = await expectRejected(
      await call("submit", "two-sum", { language: "python", code: "é".repeat(33000) }),
      413,
    );
    expect(body.fieldErrors.code).toMatch(/bytes/);
  });

  it("code of exactly MAX_CODE_BYTES is accepted", async () => {
    const res = await call("submit", "two-sum", { language: "python", code: "é".repeat(env.MAX_CODE_BYTES / 2) });
    expect(res.status).toBe(202);
  });

  it("custom input over 16 KB → 413", async () => {
    const nums = Array.from({ length: 5000 }, (_, i) => i);
    await expectRejected(await call("run", "two-sum", { ...ok, customInput: { nums, target: 1 } }), 413);
  });

  it.each<[string, Kind, unknown]>([
    ["NUL in code", "submit", { language: "python", code: "x = 1\u0000" }],
    ["NUL in code (run)", "run", { language: "python", code: "\u0000" }],
    ["NUL in custom input", "run", { ...ok, customInput: { nums: [1], target: 1, s: "\u0000" } }],
  ])("%s → 400", async (_name, kind, body) => {
    await expectRejected(await call(kind, "two-sum", body), 400, /NUL/);
  });

  it("invalid custom input → 400 listing every field error", async () => {
    const body = await expectRejected(
      await call("run", "two-sum", { ...ok, customInput: { nums: [1, "x", 2.5], extra: 1 } }),
      400,
    );
    expect(body.error).toBe(
      'Invalid custom input: missing parameter "target"; unknown parameter "extra"; nums[1]: expected int, got string; nums[2]: expected int, got non-integer number',
    );
    expect(body.fieldErrors.customInput).toContain("nums[1]");
  });

  it("custom input with an unsafe integer literal → 400", async () => {
    const text = `{"language":"python","code":"x","customInput":{"nums":[9007199254740993],"target":1}}`;
    await expectRejected(await call("run", "two-sum", text), 400, /outside the range/);
  });

  it.each<Kind>(["run", "submit"])("%s: unknown slug → 404", async (kind) => {
    await expectRejected(await call(kind, "no-such-problem", ok), 404);
  });

  it("unpublished problem → 404", async () => {
    await createProblem({ slug: "hidden", published: false, signature: SIGNATURE });
    await expectRejected(await call("submit", "hidden", ok), 404);
    await expectRejected(await call("run", "hidden", ok), 404);
  });

  it("size/NUL checks come before the slug lookup; signature validation after it", async () => {
    await expectRejected(await call("submit", "no-such-problem", { language: "python", code: "\u0000" }), 400);
    await expectRejected(await call("run", "no-such-problem", { ...ok, customInput: { bad: 1 } }), 404);
  });
});

describe("limits → 429 + Retry-After, no rows", () => {
  it("active cap: MAX_ACTIVE_PER_USER queued/running blocks the next request", async () => {
    await createSubmission({ userId: user.id, problemId: problem.id, status: "queued" });
    await createSubmission({
      userId: user.id,
      problemId: problem.id,
      status: "running",
      startedAt: new Date(),
    });
    for (const kind of ["run", "submit"] as const) {
      const res = await call(kind, "two-sum", { language: "python", code: CODE });
      expect(res.status).toBe(429);
      expect(res.headers.get("retry-after")).toBe("2");
      expect((await res.json()).error).toMatch(/in progress/);
    }
    expect(await rowCount()).toBe(2);
    // Another user is not affected.
    const other = await createUser();
    await signIn(other.id);
    expect((await call("submit", "two-sum", { language: "python", code: CODE })).status).toBe(202);
  });

  async function finished(kind: Kind, ageSec: number) {
    return createSubmission({
      userId: user.id,
      problemId: problem.id,
      kind,
      status: "accepted",
      createdAt: new Date(Date.now() - ageSec * 1000),
      finishedAt: new Date(),
    });
  }

  it("submit rate: SUBMIT_RATE_PER_MIN in the last minute → 429 with Retry-After from the oldest row", async () => {
    await finished("submit", 50);
    for (let i = 1; i < env.SUBMIT_RATE_PER_MIN; i++) await finished("submit", 5);
    await finished("submit", 120); // outside the window
    const before = await rowCount();

    const res = await call("submit", "two-sum", { language: "python", code: CODE });
    expect(res.status).toBe(429);
    const retry = Number(res.headers.get("retry-after"));
    expect(retry).toBeGreaterThanOrEqual(9);
    expect(retry).toBeLessThanOrEqual(11);
    expect(await rowCount()).toBe(before);

    // Runs have their own budget.
    expect((await call("run", "two-sum", { language: "python", code: CODE })).status).toBe(202);
  });

  it("run rate: RUN_RATE_PER_MIN in the last minute → 429", async () => {
    for (let i = 0; i < env.RUN_RATE_PER_MIN; i++) await finished("run", 30);
    const before = await rowCount();
    const res = await call("run", "two-sum", { language: "python", code: CODE });
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThanOrEqual(29);
    expect(await rowCount()).toBe(before);
    expect((await call("submit", "two-sum", { language: "python", code: CODE })).status).toBe(202);
  });

  it("parallel requests cannot bypass the active cap (advisory lock)", async () => {
    const N = 10;
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        call(i % 2 ? "run" : "submit", "two-sum", { language: "python", code: CODE }),
      ),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 202)).toHaveLength(env.MAX_ACTIVE_PER_USER);
    expect(statuses.filter((s) => s === 429)).toHaveLength(N - env.MAX_ACTIVE_PER_USER);
    expect(await rowCount()).toBe(env.MAX_ACTIVE_PER_USER);
  });

  it("parallel inserts cannot bypass the rate limit (advisory lock)", async () => {
    const db = getTestDb();
    const values = {
      userId: user.id,
      problemId: problem.id,
      kind: "submit" as const,
      language: "python" as const,
      code: CODE,
      customInput: null,
    };
    const outcomes = await Promise.all(
      Array.from({ length: 12 }, () => insertWithLimits(db, values, { maxActive: 100, ratePerMin: 3 })),
    );
    expect(outcomes.filter((o) => o.ok)).toHaveLength(3);
    expect(outcomes.filter((o) => !o.ok && o.reason === "rate")).toHaveLength(9);
    expect(await rowCount()).toBe(3);
  });
});

describe("happy paths create exactly one queued row", () => {
  it("submit", async () => {
    const res = await call("submit", "two-sum", { language: "javascript", code: "var twoSum = () => [0, 1];" });
    expect(res.status).toBe(202);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const { id } = await res.json();
    const rows = await getTestDb().select().from(submissions);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id,
      userId: user.id,
      problemId: problem.id,
      kind: "submit",
      language: "javascript",
      code: "var twoSum = () => [0, 1];",
      customInput: null,
      status: "queued",
      startedAt: null,
      finishedAt: null,
      workerId: null,
    });
  });

  it("run with the samples", async () => {
    const res = await call("run", "two-sum", { language: "python", code: CODE });
    expect(res.status).toBe(202);
    const rows = await getTestDb().select().from(submissions);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "run", language: "python", customInput: null, status: "queued" });
  });

  it("run with custom input stores custom_input", async () => {
    const customInput = { nums: [3, 4, -1], target: 3 };
    const res = await call("run", "two-sum", { language: "python", code: CODE, customInput });
    expect(res.status).toBe(202);
    const [row] = await getTestDb().select().from(submissions);
    expect(row).toMatchObject({ kind: "run", customInput, status: "queued" });
  });

  it("customInput: null means a sample run", async () => {
    const res = await call("run", "two-sum", { language: "python", code: CODE, customInput: null });
    expect(res.status).toBe(202);
    const [row] = await getTestDb().select().from(submissions);
    expect(row.customInput).toBeNull();
  });
});

describe("GET /api/submissions/:id", () => {
  it("returns the DTO to the owner with no-store", async () => {
    const created = await call("submit", "two-sum", { language: "python", code: CODE });
    const { id } = await created.json();
    const res = await get(id);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const dto = (await res.json()) as SubmissionDto;
    expect(dto).toEqual({
      id,
      kind: "submit",
      status: "queued",
      language: "python",
      problem: { slug: "two-sum", title: "Two Sum" },
      passedCount: 0,
      totalCount: 0,
      runtimeMs: null,
      memoryKb: null,
      error: null,
      stdout: null,
      createdAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT/),
      finishedAt: null,
    });
    expect(dto).not.toHaveProperty("code");
  });

  it("another user's id, an unknown id and a malformed id → 404 (never 403)", async () => {
    const mine = await createSubmission({ userId: user.id, problemId: problem.id });
    const other = await createUser();
    await signIn(other.id);
    for (const id of [mine.id, "00000000-0000-4000-8000-000000000000", "not-a-uuid", "1 OR 1=1"]) {
      const res = await get(id);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Submission not found" });
    }
  });

  it("guest → 401", async () => {
    const mine = await createSubmission({ userId: user.id, problemId: problem.id });
    await signIn(null);
    expect((await get(mine.id)).status).toBe(401);
  });

  it("a final wrong answer exposes only the first failing case", async () => {
    const wa = await createSubmission({
      userId: user.id,
      problemId: problem.id,
      status: "wrong_answer",
      passedCount: 2,
      totalCount: 5,
      failedTestIndex: 2,
      failedCase: { input: { nums: [9, 9], target: 18 }, expected: [0, 1], actual: [] },
      startedAt: new Date(),
      finishedAt: new Date(),
    });
    const dto = (await (await get(wa.id)).json()) as SubmissionDto;
    expect(dto.failedCase).toEqual({ input: { nums: [9, 9], target: 18 }, expected: [0, 1], actual: [] });
    expect(dto).not.toHaveProperty("caseResults");
    expect(dto.finishedAt).not.toBeNull();
  });

  it("run kind is persisted so history/acceptance queries can exclude it (AC-M5-9)", async () => {
    await call("run", "two-sum", { language: "python", code: CODE });
    const rows = await getTestDb().select().from(submissions).where(eq(submissions.kind, "submit"));
    expect(rows).toHaveLength(0);
  });
});
