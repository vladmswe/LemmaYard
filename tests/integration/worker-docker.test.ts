// End to end through the worker loop with the REAL DockerExecutor: the seeded
// two-sum problem (imported from problems/ into the test DB), one correct and
// one wrong Python submit → accepted / wrong_answer rows. Needs Docker and
// `pnpm sandbox:build`.
import { readFileSync } from "node:fs";
import path from "node:path";

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeEach, expect, it } from "vitest";

import { problems, submissions } from "@/server/db/schema";
import { importProblems, loadProblems } from "@/server/problems/importer";

import { createDockerExecutor } from "../../worker/docker-executor";
import { startWorker } from "../../worker/loop";
import { closeTestDb, createSubmission, createUser, getTestDb, resetTestDb } from "../helpers/db";
import { config, sandboxContainers } from "../helpers/sandbox";

beforeEach(resetTestDb);
afterAll(closeTestDb);

const ROOT = path.join(process.cwd(), "problems");

it("judges a correct and a wrong Python submit for two-sum", { timeout: 90_000 }, async () => {
  const db = getTestDb();
  const twoSum = (await loadProblems(ROOT)).filter((p) => p.meta.slug === "two-sum");
  await importProblems(db, twoSum);
  const [problem] = await db.select().from(problems).where(eq(problems.slug, "two-sum"));
  const user = await createUser();

  const correct = await createSubmission({
    userId: user.id,
    problemId: problem.id,
    kind: "submit",
    language: "python",
    code: readFileSync(path.join(ROOT, "two-sum/solution.py"), "utf8"),
  });
  const wrong = await createSubmission({
    userId: user.id,
    problemId: problem.id,
    kind: "submit",
    language: "python",
    code: "class Solution:\n    def twoSum(self, nums, target):\n        return [0, 1]\n",
  });

  const worker = startWorker({
    db,
    executor: createDockerExecutor(config()),
    workerId: "it-docker",
    concurrency: 2,
    pollMs: 50,
    staleMin: 3,
    log: () => {},
  });
  const deadline = Date.now() + 60_000;
  try {
    while ((await db.$count(submissions, inArray(submissions.status, ["queued", "running"]))) > 0) {
      if (Date.now() > deadline) throw new Error("submissions were not judged in time");
      await new Promise((r) => setTimeout(r, 100));
    }
  } finally {
    await worker.stop();
  }

  const [ok] = await db.select().from(submissions).where(eq(submissions.id, correct.id));
  expect(ok).toMatchObject({
    status: "accepted",
    passedCount: twoSum[0].tests.length,
    totalCount: twoSum[0].tests.length,
    failedTestIndex: null,
    failedCase: null,
    caseResults: null,
    error: null,
    workerId: "it-docker",
  });
  expect(ok.runtimeMs).not.toBeNull();
  expect(ok.memoryKb).toBeGreaterThan(0);
  expect(ok.finishedAt).toBeInstanceOf(Date);

  const [wa] = await db.select().from(submissions).where(eq(submissions.id, wrong.id));
  // Test 0 expects [2, 3]; [0, 1] fails right away.
  expect(wa).toMatchObject({
    status: "wrong_answer",
    passedCount: 0,
    totalCount: twoSum[0].tests.length,
    failedTestIndex: 0,
    failedCase: { input: twoSum[0].tests[0].input, expected: twoSum[0].tests[0].expected, actual: [0, 1] },
    caseResults: null,
  });
  expect(sandboxContainers()).toEqual([]);
});
