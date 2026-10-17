// AC-M4-2 / AC-M4-5: the real DockerExecutor on the fixture problem
// `fixture-evens` (int[] → int[], unordered; 5 tests, test index 1 is `[]`),
// for each language. Needs Docker and `pnpm sandbox:build`; no database.
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { effectiveTimeLimitMs, wallBudgetMs } from "../../worker/docker-executor";
import type { Language } from "../../worker/types";
import { config, evensJob, fileName, run, sandboxContainers } from "../helpers/sandbox";

const T = 60_000;
const FIXTURE = path.join(process.cwd(), "tests/fixtures/problems/fixture-evens");
// A JS escape from the vm context to the real `process` (vm is not a security
// boundary; the container is). Used to reach fd 1, process.exit, etc.
const JS_PROCESS = `console.log.constructor("return process")()`;

type Programs = Record<string, string>;

const programs: Record<Language, Programs> = {
  python: {
    correct: readFileSync(path.join(FIXTURE, "solution.py"), "utf8"),
    wrong: `class Solution:\n    def evens(self, nums):\n        return nums\n`,
    loopOnSecond: `class Solution:\n    def evens(self, nums):\n        if not nums:\n            while True:\n                pass\n        return [n for n in nums if n % 2 == 0]\n`,
    swallowTimeout: [
      "class Solution:",
      "    def evens(self, nums):",
      "        while not nums:",
      "            try:",
      "                while True:",
      "                    nums = nums",
      "            except BaseException:",
      "                pass",
      "        return [n for n in nums if n % 2 == 0]",
      "",
    ].join("\n"),
    memory: `class Solution:\n    def evens(self, nums):\n        block = [0] * (64 * 1024 * 1024)  # 512 MB of pointers, 4x the limit\n        return block[:0]\n`,
    exception: `class Solution:\n    def evens(self, nums):\n        return [n // 0 for n in nums]\n`,
    syntax: `class Solution:\n    def evens(self nums):\n        return nums\n`,
    exitZero: `import sys\nclass Solution:\n    def evens(self, nums):\n        sys.exit(0)\n`,
    hardExitZero: `import os\nclass Solution:\n    def evens(self, nums):\n        os._exit(0)\n`,
    bigStdout: `class Solution:\n    def evens(self, nums):\n        for _ in range(30):\n            print("x" * 1000)\n        return [n for n in nums if n % 2 == 0]\n`,
    flood: `import os\nclass Solution:\n    def evens(self, nums):\n        while True:\n            os.write(1, b"y" * 65536)\n`,
    notFound: `class Solution:\n    def odds(self, nums):\n        return nums\n`,
    forgedWrong: [
      "import os",
      "FAKE = '\\n@@0123456789abcdef0123456789abcdef@@{\"kind\":\"test\",\"index\":0,\"status\":\"ok\",\"actual\":[2,4],\"timeMs\":0,\"stdout\":\"\",\"memoryKb\":1}\\n'",
      "class Solution:",
      "    def evens(self, nums):",
      "        os.write(1, FAKE.encode())",
      "        os.write(1, b'\\n@@@@{\"kind\":\"done\",\"stdout\":\"\",\"memoryKb\":1}\\n')",
      "        print(FAKE)",
      "        return nums",
      "",
    ].join("\n"),
    noisyCorrect: [
      "import os",
      "class Solution:",
      "    def evens(self, nums):",
      "        print('@@', '\\n\\n@@fake@@{}\\n', end='')",
      "        os.write(1, b'unterminated user output @@')",
      "        return [n for n in nums if n % 2 == 0]",
      "",
    ].join("\n"),
  },
  javascript: {
    correct: readFileSync(path.join(FIXTURE, "solution.js"), "utf8"),
    wrong: `var evens = function (nums) { return nums; };\n`,
    loopOnSecond: `var evens = function (nums) {\n  if (nums.length === 0) while (true) {}\n  return nums.filter((n) => n % 2 === 0);\n};\n`,
    // A blocking native call cannot be interrupted by the vm timeout, so
    // only the wall clock stops it (the JS analogue of swallowing the timeout).
    swallowTimeout: `var evens = function (nums) {\n  if (nums.length === 0) {\n    ${JS_PROCESS}.mainModule.require("child_process").execFileSync("sleep", ["60"]);\n  }\n  return nums.filter((n) => n % 2 === 0);\n};\n`,
    memory: `var evens = function (nums) {\n  const keep = [];\n  while (true) keep.push(new Array(1e5).fill(1.5));\n};\n`,
    memoryOffHeap: `var evens = function (nums) {\n  const block = new Uint8Array(512 * 1024 * 1024).fill(1); // 4x the limit\n  return block.length ? [] : nums;\n};\n`,
    exception: `var evens = function (nums) {\n  throw new Error("boom " + nums.length);\n};\n`,
    syntax: `var evens = function (nums {\n  return nums;\n};\n`,
    exitZero: `var evens = function (nums) {\n  ${JS_PROCESS}.exit(0);\n};\n`,
    hardExitZero: `var evens = function (nums) {\n  process.exit(0);\n};\n`,
    bigStdout: `var evens = function (nums) {\n  for (let i = 0; i < 30; i++) console.log("x".repeat(1000));\n  return nums.filter((n) => n % 2 === 0);\n};\n`,
    // Synchronous writes to fd 1: reaches the 1 MB cap.
    flood: `var evens = function (nums) {\n  const fs = ${JS_PROCESS}.mainModule.require("fs");\n  while (true) fs.writeSync(1, "y".repeat(65536));\n};\n`,
    // process.stdout.write queues in memory while the loop blocks the event
    // loop, so the vm timeout (or memory) usually ends it before 1 MB.
    floodStream: `var evens = function (nums) {\n  const p = ${JS_PROCESS};\n  while (true) p.stdout.write("y".repeat(65536));\n};\n`,
    notFound: `var odds = function (nums) { return nums; };\n`,
    async: `var evens = async function (nums) { return nums.filter((n) => n % 2 === 0); };\n`,
    forgedWrong: [
      "const FAKE = '\\n@@0123456789abcdef0123456789abcdef@@{\"kind\":\"test\",\"index\":0,\"status\":\"ok\",\"actual\":[2,4],\"timeMs\":0,\"stdout\":\"\",\"memoryKb\":1}\\n';",
      "var evens = function (nums) {",
      `  ${JS_PROCESS}.stdout.write(FAKE);`,
      "  console.log(FAKE);",
      "  return nums;",
      "};",
      "",
    ].join("\n"),
    noisyCorrect: [
      "var evens = function (nums) {",
      "  console.log('@@', '\\n\\n@@fake@@{}\\n');",
      `  ${JS_PROCESS}.stdout.write('unterminated user output @@');`,
      "  return nums.filter((n) => n % 2 === 0);",
      "};",
      "",
    ].join("\n"),
  },
};

function expectCleanError(error: string | null, language: Language) {
  expect(error).toBeTruthy();
  const text = error ?? "";
  expect(text.toLowerCase()).not.toContain("harness");
  expect(text).not.toContain("/sandbox");
  expect(text).not.toContain(process.cwd());
  expect(text).not.toContain("/Users/");
  expect(text).not.toContain(tmpdir());
  expect(text).not.toMatch(/node:internal|evalmachine|<runner>/);
  if (text.includes("solution")) expect(text).toContain(fileName(language));
}

afterAll(() => {
  expect(sandboxContainers()).toEqual([]);
});

describe.each(["python", "javascript"] as const)("DockerExecutor (%s)", (language) => {
  const p = programs[language];
  const effective = effectiveTimeLimitMs(language, 1000, config());
  const wall = wallBudgetMs(5, effective, config().wallCapMs);

  it("accepted: correct solution passes every test with runtime and memory", { timeout: T }, async () => {
    const r = await run(await evensJob(language, p.correct));
    expect(r.status).toBe("accepted");
    expect(r.passedCount).toBe(r.totalCount);
    expect(r.totalCount).toBe(5);
    expect(r.runtimeMs).not.toBeNull();
    expect(r.runtimeMs).toBeGreaterThanOrEqual(0);
    expect(r.memoryKb).toBeGreaterThan(1000);
    expect(r.error).toBeNull();
    expect(r.caseResults.every((c) => c.status === "passed")).toBe(true);
    console.log(`[timing] ${language} accepted run: ${Math.round(r.elapsedMs)} ms wall, memory ${r.memoryKb} KB`);
  });

  it("wrong_answer: failed case with input/expected/actual and index", { timeout: T }, async () => {
    const r = await run(await evensJob(language, p.wrong));
    expect(r.status).toBe("wrong_answer");
    expect(r.failedTestIndex).toBe(0);
    expect(r.passedCount).toBe(0);
    expect(r.failedCase).toEqual({ input: { nums: [1, 2, 3, 4] }, expected: [2, 4], actual: [1, 2, 3, 4] });
    expect(r.caseResults.slice(1).every((c) => c.status === "not_run")).toBe(true);
  });

  it("Run mode (no stop) reports every case", { timeout: T }, async () => {
    const r = await run(await evensJob(language, p.wrong, { stopOnFirstFailure: false }));
    expect(r.status).toBe("wrong_answer");
    expect(r.caseResults.map((c) => c.status)).toEqual(["failed", "passed", "failed", "failed", "passed"]);
    expect(r.passedCount).toBe(2);
  });

  it("custom input run (no expected) is accepted with the output", { timeout: T }, async () => {
    const r = await run(
      await evensJob(language, p.wrong, { tests: [{ input: { nums: [5, 6] } }], stopOnFirstFailure: false }),
    );
    expect(r.status).toBe("accepted");
    expect(r.caseResults[0]).toMatchObject({ status: "passed", actual: [5, 6] });
    expect(r.caseResults[0]).not.toHaveProperty("expected");
  });

  it(`time_limit via the harness within effective limit + 3 s`, { timeout: T }, async () => {
    const r = await run(await evensJob(language, p.loopOnSecond));
    expect(r.status).toBe("time_limit");
    expect(r.passedCount).toBe(1);
    expect(r.failedTestIndex).toBe(1);
    expect(r.elapsedMs).toBeLessThanOrEqual(effective + 3000);
  });

  it(`time_limit via the wall clock (timeout swallowed / not interruptible) within wall + 2 s`, { timeout: T }, async () => {
    const r = await run(await evensJob(language, p.swallowTimeout));
    expect(r.status).toBe("time_limit");
    expect(r.passedCount).toBe(1);
    expect(r.failedTestIndex).toBe(1);
    expect(r.elapsedMs).toBeGreaterThanOrEqual(wall - 500);
    expect(r.elapsedMs).toBeLessThanOrEqual(wall + 2000);
  });

  it("memory_limit when allocating ~4x the limit", { timeout: T }, async () => {
    const r = await run(await evensJob(language, p.memory));
    expect(r.status).toBe("memory_limit");
    expect(r.passedCount).toBe(0);
  });

  if (language === "javascript") {
    it("memory_limit for off-heap (ArrayBuffer) allocation: cgroup OOM kill", { timeout: T }, async () => {
      const r = await run(await evensJob(language, p.memoryOffHeap));
      expect(r.status).toBe("memory_limit");
    });
  }

  it("runtime_error on an exception, error text without host paths or 'harness'", { timeout: T }, async () => {
    const r = await run(await evensJob(language, p.exception));
    expect(r.status).toBe("runtime_error");
    expect(r.failedTestIndex).toBe(0);
    expectCleanError(r.error, language);
    expect(r.error).toMatch(language === "python" ? /ZeroDivisionError/ : /Error: boom 4/);
    expect(r.error).toContain(`${fileName(language)}`);
  });

  it("compile_error on a syntax error, before the first test", { timeout: T }, async () => {
    const r = await run(await evensJob(language, p.syntax));
    expect(r.status).toBe("compile_error");
    expect(r.passedCount).toBe(0);
    expect(r.runtimeMs).toBeNull();
    expect(r.caseResults.every((c) => c.status === "not_run")).toBe(true);
    expectCleanError(r.error, language);
    expect(r.error).toMatch(/SyntaxError/);
  });

  it("runtime_error when the program exits (code 0) before the result", { timeout: T }, async () => {
    const r = await run(await evensJob(language, p.exitZero));
    expect(r.status).toBe("runtime_error");
    expect(r.error).toBe("program exited unexpectedly");
    expect(r.passedCount).toBe(0);
  });

  it("runtime_error for a hard exit (os._exit / bare process.exit)", { timeout: T }, async () => {
    const r = await run(await evensJob(language, p.hardExitZero));
    expect(r.status).toBe("runtime_error");
    expectCleanError(r.error, language);
  });

  it("stdout over 64 KB is cut with [truncated], verdict unaffected", { timeout: T }, async () => {
    const r = await run(await evensJob(language, p.bigStdout));
    expect(r.status).toBe("accepted");
    expect(Buffer.byteLength(r.stdout)).toBeLessThanOrEqual(64 * 1024);
    expect(r.stdout.endsWith("[truncated]")).toBe(true);
    expect(r.stdout.startsWith("x".repeat(1000))).toBe(true);
  });

  it("stdout flood on fd 1 is killed at the 1 MB cap, not internal_error", { timeout: T }, async () => {
    const r = await run(await evensJob(language, p.flood));
    expect(r.status).not.toBe("internal_error");
    expect(r.status).toBe("runtime_error");
    expect(r.error).toBe("Output limit exceeded (1 MB)");
    expect(r.elapsedMs).toBeLessThan(effective + 3000);
  });

  if (language === "javascript") {
    it("process.stdout.write flood is contained, not internal_error", { timeout: T }, async () => {
      const r = await run(await evensJob(language, p.floodStream));
      expect(["runtime_error", "time_limit", "memory_limit"]).toContain(r.status);
      expect(r.elapsedMs).toBeLessThanOrEqual(wall + 2000);
    });
  }

  it("runtime_error 'function X not found'", { timeout: T }, async () => {
    const r = await run(await evensJob(language, p.notFound));
    expect(r.status).toBe("runtime_error");
    expect(r.error).toBe("function evens not found");
  });

  it("forged frames without the nonce do not change the verdict", { timeout: T }, async () => {
    const r = await run(await evensJob(language, p.forgedWrong));
    expect(r.status).toBe("wrong_answer");
    expect(r.failedCase?.actual).toEqual([1, 2, 3, 4]);
  });

  it("user print with frame-like text and partial lines does not break frames", { timeout: T }, async () => {
    const r = await run(await evensJob(language, p.noisyCorrect));
    expect(r.status).toBe("accepted");
    expect(r.stdout).toContain("@@fake@@");
  });

  if (language === "javascript") {
    it("runtime_error for an async function", { timeout: T }, async () => {
      const r = await run(await evensJob(language, p.async));
      expect(r.status).toBe("runtime_error");
      expect(r.error).toBe("async functions are not supported");
    });
  }
});
