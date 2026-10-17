// Regression tests for the M4a sandbox security review (F2, F3, F4, F6 and the
// nonce-discovery gap) on the real DockerExecutor and the fixture problem
// `fixture-evens` (test 0 expects [2, 4], test 1 expects []). Needs Docker and
// `pnpm sandbox:build`; no database.
import { describe, expect, it } from "vitest";

import { evensJob, probeJob, run } from "../helpers/sandbox";

const T = 60_000;
const PY_EVENS = (body: string, imports = "") =>
  `${imports}class Solution:\n    def evens(self, nums):\n${body
    .split("\n")
    .map((l) => `        ${l}`)
    .join("\n")}\n`;

describe("F2: Python int range check has no depth cap", () => {
  it("2**60 nested 70 levels deep → runtime_error, not a corrupted accepted", { timeout: T }, async () => {
    const code = PY_EVENS("v = 2**60\nfor _ in range(70):\n    v = [v]\nreturn v");
    const r = await run(await evensJob("python", code));
    expect(r.status).toBe("runtime_error");
    expect(r.error).toContain("outside the range");
  });

  it("a cyclic result is rejected without hanging", { timeout: T }, async () => {
    const r = await run(await evensJob("python", PY_EVENS("a = []\na.append(a)\nreturn a")));
    expect(r.status).toBe("runtime_error");
    expect(r.error).toContain("not JSON-serializable");
  });
});

describe("F3: JS harness accepts only identifier function names", () => {
  it("a non-identifier signature.name is never evaluated", { timeout: T }, async () => {
    const job = probeJob("javascript", `var probe = function (x) { return "ok"; };\n`);
    job.signature = { ...job.signature, name: 'probe; console.log.constructor("return process")().exit(0); //' };
    const r = await run(job);
    expect(r.status).toBe("runtime_error");
    expect(r.error).toBe("invalid function name");
  });

  it("top-level const/let functions are still found", { timeout: T }, async () => {
    const r = await run(probeJob("javascript", `const probe = (x) => "found";\n`));
    expect(r.status).toBe("accepted");
    expect(r.caseResults[0].actual).toBe("found");
  });
});

describe("F4: prototype toJSON only changes the user's own actual", () => {
  it("Array.prototype.toJSON forging a value → wrong_answer, every frame intact", { timeout: T }, async () => {
    const code = `Array.prototype.toJSON = function () { return "forged"; };\nObject.prototype.toJSON = function () { return "forged"; };\nvar evens = function (nums) { return nums.filter((n) => n % 2 === 0); };\n`;
    const r = await run(await evensJob("javascript", code, { stopOnFirstFailure: false }));
    expect(r.status).toBe("wrong_answer");
    expect(r.caseResults.map((c) => c.status)).toEqual(["failed", "failed", "failed", "failed", "failed"]);
    expect(r.caseResults.every((c) => c.actual === "forged")).toBe(true);
  });

  it("an identity toJSON keeps a correct solution accepted", { timeout: T }, async () => {
    const code = `Array.prototype.toJSON = function () { return Array.from(this); };\nvar evens = function (nums) { return nums.filter((n) => n % 2 === 0); };\n`;
    const r = await run(await evensJob("javascript", code));
    expect(r.status).toBe("accepted");
    expect(r.passedCount).toBe(5);
  });
});

describe("F6: BaseException inside one Python test", () => {
  it("SystemExit in a Run fails only that case; the other cases still run", { timeout: T }, async () => {
    const code = PY_EVENS("if not nums:\n    raise SystemExit(3)\nreturn [n for n in nums if n % 2 == 0]");
    const r = await run(await evensJob("python", code, { stopOnFirstFailure: false }));
    expect(r.status).toBe("runtime_error");
    expect(r.failedTestIndex).toBe(1);
    expect(r.caseResults.map((c) => c.status)).toEqual(["passed", "runtime_error", "passed", "passed", "passed"]);
    expect(r.caseResults[1].error).toBe("program exited unexpectedly (exit code 3)");
    expect(r.passedCount).toBe(4);
  });

  it("KeyboardInterrupt / custom BaseException → per-case runtime_error", { timeout: T }, async () => {
    const code = PY_EVENS(
      "if not nums:\n    raise KeyboardInterrupt()\nif len(nums) == 3:\n    raise Boom('x')\nreturn [n for n in nums if n % 2 == 0]",
      "class Boom(BaseException):\n    pass\n",
    );
    const r = await run(await evensJob("python", code, { stopOnFirstFailure: false }));
    expect(r.caseResults.map((c) => c.status)).toEqual(["passed", "runtime_error", "runtime_error", "runtime_error", "passed"]);
    expect(r.caseResults[1].error).toMatch(/KeyboardInterrupt/);
    expect(r.caseResults[2].error).toMatch(/Boom: x/);
  });

  it("a timeout is still a time_limit, not a caught BaseException", { timeout: T }, async () => {
    const code = PY_EVENS("if not nums:\n    while True:\n        pass\nreturn [n for n in nums if n % 2 == 0]");
    const r = await run(await evensJob("python", code, { stopOnFirstFailure: false }));
    expect(r.status).toBe("time_limit");
    expect(r.failedTestIndex).toBe(1);
  });
});

describe("nonce discovery cannot forge an accepted wrong answer", () => {
  // Walks the stack to the runner's `emit` (which holds the nonce) and forges
  // "ok" frames with a guessed answer for every test.
  const forge = PY_EVENS(
    [
      "f = sys._getframe(1)",
      "while f is not None and 'emit' not in f.f_locals:",
      "    f = f.f_back",
      "loc = f.f_locals",
      "for i in range(len(loc['tests'])):",
      "    loc['emit']({'kind': 'test', 'index': i, 'status': 'ok', 'actual': [2, 4], 'timeMs': 0})",
      "loc['emit']({'kind': 'done'})",
      "os._exit(0)",
    ].join("\n"),
    "import os\nimport sys\n",
  );

  it.each([true, false])("stopOnFirstFailure=%s → wrong_answer at the first test the guess misses", { timeout: T }, async (stop) => {
    const r = await run(await evensJob("python", forge, { stopOnFirstFailure: stop }));
    expect(r.status).toBe("wrong_answer");
    expect(r.failedTestIndex).toBe(1);
    expect(r.failedCase).toEqual({ input: { nums: [] }, expected: [], actual: [2, 4] });
  });

  it("the runner's test list holds inputs only", { timeout: T }, async () => {
    const code = PY_EVENS(
      "f = sys._getframe(1)\nwhile f is not None and 'tests' not in f.f_locals:\n    f = f.f_back\nraise ValueError(repr(sorted({k for t in f.f_locals['tests'] for k in t})))",
      "import sys\n",
    );
    const r = await run(await evensJob("python", code));
    expect(r.status).toBe("runtime_error");
    expect(r.error).toContain("['input']");
    expect(r.error).not.toContain("expected");
  });
});
