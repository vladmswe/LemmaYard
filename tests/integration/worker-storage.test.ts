// Review finding F1: user-controlled U+0000 and lone surrogates (returned
// values, printed output, exception messages) must still produce a verdict and
// a row Postgres can store. Real DockerExecutor, real test database.
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { submissions } from "@/server/db/schema";

import { createDockerExecutor } from "../../worker/docker-executor";
import { processSubmission } from "../../worker/loop";
import { claimNext } from "../../worker/queue";
import type { Language } from "../../worker/types";
import {
  closeTestDb,
  createProblem,
  createSubmission,
  createTestCases,
  createUser,
  getTestDb,
  resetTestDb,
} from "../helpers/db";
import { config } from "../helpers/sandbox";

beforeEach(resetTestDb);
afterAll(closeTestDb);

const T = 60_000;
const R = "�";

/** `probe(x: int) -> string`; every test expects "ok". */
async function setup() {
  const user = await createUser();
  const problem = await createProblem({
    signature: { name: "probe", params: [{ name: "x", type: "int" }], returns: "string" },
    compare: { mode: "exact" },
    timeLimitMs: 2000,
    memoryLimitMb: 128,
  });
  await createTestCases(problem.id, 5, { expected: "ok" });
  return { user, problem };
}

async function judge(
  language: Language,
  code: string,
  kind: "run" | "submit",
  customInput?: Record<string, unknown>,
) {
  const { user, problem } = await setup();
  await createSubmission({ userId: user.id, problemId: problem.id, kind, language, code, customInput });
  const db = getTestDb();
  const claimed = await claimNext(db, "it-storage");
  const logs: string[] = [];
  await processSubmission(db, createDockerExecutor(config()), claimed!, (e) => logs.push(e.msg), "it-storage");
  const [row] = await db.select().from(submissions).where(eq(submissions.id, claimed!.id));
  return { row, logs };
}

const programs: Record<Language, { ret: string; print: string; raise: string; wrong: string }> = {
  python: {
    ret: `class Solution:\n    def probe(self, x):\n        return 'a\\x00b\\ud800'\n`,
    print: `class Solution:\n    def probe(self, x):\n        print('x\\x00y')\n        return 'ok'\n`,
    raise: `class Solution:\n    def probe(self, x):\n        raise ValueError('bad\\x00msg')\n`,
    wrong: `class Solution:\n    def probe(self, x):\n        return 'n\\x00'\n`,
  },
  javascript: {
    ret: `var probe = function (x) {\n  return "a\\u0000b\\uD800";\n};\n`,
    print: `var probe = function (x) {\n  console.log("x\\u0000y");\n  return "ok";\n};\n`,
    raise: `var probe = function (x) {\n  throw new Error("bad\\u0000msg");\n};\n`,
    wrong: `var probe = function (x) {\n  return "n\\u0000";\n};\n`,
  },
};

describe.each(["python", "javascript"] as const)("%s", (language) => {
  const p = programs[language];

  it("returned NUL / lone surrogate (custom-input Run) → accepted, case_results stored", { timeout: T }, async () => {
    const { row, logs } = await judge(language, p.ret, "run", { x: 1 });
    expect(logs).toEqual(["judged"]);
    expect(row.status).toBe("accepted");
    expect(row.caseResults?.[0].actual).toBe(`a${R}b${R}`);
  });

  it("printed NUL → stdout stored", { timeout: T }, async () => {
    const { row } = await judge(language, p.print, "submit");
    expect(row.status).toBe("accepted");
    expect(row.stdout).toContain(`x${R}y`);
  });

  it("NUL in an exception message → runtime_error with the error stored", { timeout: T }, async () => {
    const { row } = await judge(language, p.raise, "submit");
    expect(row.status).toBe("runtime_error");
    expect(row.error).toContain(`bad${R}msg`);
  });

  it("NUL in a wrong answer → wrong_answer with failed_case stored", { timeout: T }, async () => {
    const { row } = await judge(language, p.wrong, "submit");
    expect(row.status).toBe("wrong_answer");
    expect(row.failedCase?.actual).toBe(`n${R}`);
  });
});
