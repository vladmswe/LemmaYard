// AC-M4-2 / AC-M4-5: the real DockerExecutor on the fixture problem
// `fixture-evens` (int[] → int[], unordered; 5 tests, test index 1 is `[]`,
// the last test holds values beyond 32 bits), for each language. Needs Docker
// and `pnpm sandbox:build`; no database.
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { effectiveTimeLimitMs, startupAllowanceMs, wallBudgetMs } from "../../worker/docker-executor";
import type { Language } from "../../worker/types";
import { config, evensJob, fileName, run, sandboxContainers } from "../helpers/sandbox";

const T = 60_000;
const FIXTURE = path.join(process.cwd(), "tests/fixtures/problems/fixture-evens");
// A JS escape from the vm context to the real `process` (vm is not a security
// boundary; the container is). Used to reach fd 1, process.exit, etc.
const JS_PROCESS = `console.log.constructor("return process")()`;

/** A Java Solution with `evens(long[] nums)` running `body` (plus `extra` members). */
const javaEvens = (body: string, extra = "", throwsClause = "") =>
  `import java.util.*;\n\nclass Solution {\n${extra}    public long[] evens(long[] nums)${throwsClause} {\n${body}\n    }\n}\n`;
/** A Java string literal of a forged frame with a made-up nonce. */
const JAVA_FAKE = JSON.stringify(
  '\n@@0123456789abcdef0123456789abcdef@@{"kind":"test","index":0,"status":"ok","actual":[2,4],"timeMs":0,"stdout":"","memoryKb":1}\n',
);
const JAVA_FILTER = "        return Arrays.stream(nums).filter(n -> n % 2 == 0).toArray();";
const JAVA_RAW_OUT = "java.io.FileOutputStream out = new java.io.FileOutputStream(java.io.FileDescriptor.out);";

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
  java: {
    correct: readFileSync(path.join(FIXTURE, "solution.java"), "utf8"),
    wrong: javaEvens("        return nums;"),
    loopOnSecond: javaEvens(`        if (nums.length == 0) while (true) {}\n${JAVA_FILTER}`),
    // Java's limit is enforced from another thread: catching everything does not help.
    swallowTimeout: javaEvens(
      `        while (nums.length == 0) {\n            try { while (true) {} } catch (Throwable t) { }\n        }\n${JAVA_FILTER}`,
    ),
    memory: javaEvens("        long[] block = new long[64 * 1024 * 1024]; // 512 MB, 4x the limit\n        return new long[block.length * 0];"),
    memoryOffHeap: javaEvens(
      "        java.nio.ByteBuffer block = java.nio.ByteBuffer.allocateDirect(512 * 1024 * 1024); // 4x the limit\n        return new long[block.capacity() * 0];",
    ),
    exception: javaEvens("        int zero = nums.length - nums.length;\n        return new long[] { nums[0] / zero };"),
    syntax: javaEvens("        return nums"),
    exitZero: javaEvens("        System.exit(0);\n        return nums;"),
    hardExitZero: javaEvens("        Runtime.getRuntime().halt(0);\n        return nums;"),
    bigStdout: javaEvens(`        for (int i = 0; i < 30; i++) System.out.println("x".repeat(1000));\n${JAVA_FILTER}`),
    flood: javaEvens(
      `        ${JAVA_RAW_OUT}\n        byte[] block = new byte[65536];\n        Arrays.fill(block, (byte) 'y');\n        while (true) out.write(block);`,
      "",
      " throws Exception",
    ),
    notFound: `class Solution {\n    public long[] odds(long[] nums) { return nums; }\n}\n`,
    forgedWrong: javaEvens(
      `        ${JAVA_RAW_OUT}\n        out.write(${JAVA_FAKE}.getBytes());\n        System.out.println(${JAVA_FAKE});\n        return nums;`,
      "",
      " throws Exception",
    ),
    noisyCorrect: javaEvens(
      `        System.out.print("@@ \\n\\n@@fake@@{}\\n");\n        ${JAVA_RAW_OUT}\n        out.write("unterminated user output @@".getBytes());\n${JAVA_FILTER}`,
      "",
      " throws Exception",
    ),
    narrowInt: `import java.util.*;\n\nclass Solution {\n    public int[] evens(int[] nums) {\n        return Arrays.stream(nums).filter(n -> n % 2 == 0).toArray();\n    }\n}\n`,
    lists: `import java.util.*;\n\nclass Solution {\n    public List<Long> evens(List<Long> nums) {\n        List<Long> out = new ArrayList<>();\n        for (long n : nums) if (n % 2 == 0) out.add(n);\n        return out;\n    }\n}\n`,
    deepRecursion: javaEvens(
      `        if (depth(nums.length == 0 ? 50_000 : 1) < 0) return nums;\n${JAVA_FILTER}`,
      "    private int depth(int n) { return n == 0 ? 1 : 1 + depth(n - 1); }\n",
    ),
    stackOverflow: javaEvens("        return evens(nums);"),
    staticInit: javaEvens("        return nums;", '    static final int BAD = Integer.parseInt("not a number");\n'),
    packageDecl: `package app;\n\nclass Solution {\n    public long[] evens(long[] nums) { return nums; }\n}\n`,
    seesRunner: javaEvens('        Class.forName("Harness");\n        return nums;', "", " throws Exception"),
  },
};

const COMPILE_ERROR: Record<Language, RegExp> = {
  python: /SyntaxError/,
  javascript: /SyntaxError/,
  java: /Solution\.java:\d+: error: /,
};
const RUNTIME_ERROR: Record<Language, RegExp> = {
  python: /ZeroDivisionError/,
  javascript: /Error: boom 4/,
  java: /java\.lang\.ArithmeticException: \/ by zero/,
};

function expectCleanError(error: string | null, language: Language) {
  expect(error).toBeTruthy();
  const text = error ?? "";
  expect(text.toLowerCase()).not.toContain("harness");
  expect(text).not.toContain("/sandbox");
  expect(text).not.toContain(process.cwd());
  expect(text).not.toContain("/Users/");
  expect(text).not.toContain(tmpdir());
  expect(text).not.toMatch(/node:internal|evalmachine|<runner>|jdk\.internal|java\.base\//);
  if (text.includes("solution")) expect(text).toContain(fileName(language));
}

afterAll(() => {
  expect(sandboxContainers()).toEqual([]);
});

describe.each(["python", "javascript", "java"] as const)("DockerExecutor (%s)", (language) => {
  const p = programs[language];
  const effective = effectiveTimeLimitMs(language, 1000, config());
  const wall = wallBudgetMs(5, effective, config().wallCapMs, language);
  // JVM start-up and compilation come before the first test (Java only).
  const startup = startupAllowanceMs(language);

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

  it(`time_limit via the harness within effective limit + 3 s (+ start-up allowance)`, { timeout: T }, async () => {
    const r = await run(await evensJob(language, p.loopOnSecond));
    expect(r.status).toBe("time_limit");
    expect(r.passedCount).toBe(1);
    expect(r.failedTestIndex).toBe(1);
    expect(r.elapsedMs).toBeLessThanOrEqual(effective + 3000 + startup);
  });

  if (language === "java") {
    it("time_limit via the harness even when the solution catches every Throwable", { timeout: T }, async () => {
      const r = await run(await evensJob(language, p.swallowTimeout));
      expect(r.status).toBe("time_limit");
      expect(r.passedCount).toBe(1);
      expect(r.failedTestIndex).toBe(1);
      expect(r.elapsedMs).toBeLessThanOrEqual(effective + 3000 + startup);
    });
  } else {
    it(`time_limit via the wall clock (timeout swallowed / not interruptible) within wall + 2 s`, { timeout: T }, async () => {
      const r = await run(await evensJob(language, p.swallowTimeout));
      expect(r.status).toBe("time_limit");
      expect(r.passedCount).toBe(1);
      expect(r.failedTestIndex).toBe(1);
      expect(r.elapsedMs).toBeGreaterThanOrEqual(wall - 500);
      expect(r.elapsedMs).toBeLessThanOrEqual(wall + 2000);
    });
  }

  it("memory_limit when allocating ~4x the limit", { timeout: T }, async () => {
    const r = await run(await evensJob(language, p.memory));
    expect(r.status).toBe("memory_limit");
    expect(r.passedCount).toBe(0);
  });

  if (language === "java") {
    it("memory_limit for off-heap (direct buffer) allocation", { timeout: T }, async () => {
      const r = await run(await evensJob(language, p.memoryOffHeap));
      expect(r.status).toBe("memory_limit");
    });
  }

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
    expect(r.error).toMatch(RUNTIME_ERROR[language]);
    expect(r.error).toContain(`${fileName(language)}`);
  });

  it("compile_error on a syntax error, before the first test", { timeout: T }, async () => {
    const r = await run(await evensJob(language, p.syntax));
    expect(r.status).toBe("compile_error");
    expect(r.passedCount).toBe(0);
    expect(r.runtimeMs).toBeNull();
    expect(r.caseResults.every((c) => c.status === "not_run")).toBe(true);
    expectCleanError(r.error, language);
    expect(r.error).toMatch(COMPILE_ERROR[language]);
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
    expect(r.elapsedMs).toBeLessThan(effective + 3000 + startup);
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

  if (language === "java") {
    it("compile errors point at the user's own line and column", { timeout: T }, async () => {
      const r = await run(await evensJob(language, p.syntax));
      // Line 5 of the user's code: the implicit imports on line 1 never shift it.
      expect(r.error).toMatch(/^Solution\.java:5: error: ';' expected\n {8}return nums\n {19}\^\n1 error$/);
    });

    it("an int parameter that receives a value beyond 32 bits fails that test with a hint", { timeout: T }, async () => {
      const r = await run(await evensJob(language, p.narrowInt, { stopOnFirstFailure: false }));
      expect(r.status).toBe("runtime_error");
      expect(r.caseResults.map((c) => c.status)).toEqual(["passed", "passed", "passed", "passed", "runtime_error"]);
      expect(r.caseResults[4].error).toBe(
        "parameter nums[0]: 9007199254740990 does not fit in a Java int; declare it as long",
      );
    });

    it("List<Long> parameters and return values are accepted", { timeout: T }, async () => {
      const r = await run(await evensJob(language, p.lists));
      expect(r.status, r.error ?? "").toBe("accepted");
    });

    it("deep recursion (50 000 frames) runs on the large solution stack", { timeout: T }, async () => {
      const r = await run(await evensJob(language, p.deepRecursion));
      expect(r.status, r.error ?? "").toBe("accepted");
    });

    it("unbounded recursion is a runtime_error (StackOverflowError) with a short trace", { timeout: T }, async () => {
      const r = await run(await evensJob(language, p.stackOverflow));
      expect(r.status).toBe("runtime_error");
      expect(r.error).toMatch(/^java\.lang\.StackOverflowError\n\tat Solution\.evens\(Solution\.java:5\)/);
      expect(r.error).toMatch(/\t\.\.\. \d+ more$/);
      expectCleanError(r.error, language);
    });

    it("an exception in a static initializer is a runtime_error before any test", { timeout: T }, async () => {
      const r = await run(await evensJob(language, p.staticInit));
      expect(r.status).toBe("runtime_error");
      expect(r.failedTestIndex).toBeNull();
      expect(r.error).toMatch(/^java\.lang\.NumberFormatException: For input string: "not a number"/);
      expect(r.error).toContain("Solution.java:4");
    });

    it("a package declaration is a compile_error", { timeout: T }, async () => {
      const r = await run(await evensJob(language, p.packageDecl));
      expect(r.status).toBe("compile_error");
      expect(r.error).toMatch(/remove the package declaration/);
    });

    it("user code cannot load the runner's classes", { timeout: T }, async () => {
      const r = await run(await evensJob(language, p.seesRunner));
      expect(r.status).toBe("runtime_error");
      expect(r.error).toMatch(/^java\.lang\.ClassNotFoundException: Harness/);
    });
  }

  if (language === "javascript") {
    it("runtime_error for an async function", { timeout: T }, async () => {
      const r = await run(await evensJob(language, p.async));
      expect(r.status).toBe("runtime_error");
      expect(r.error).toBe("async functions are not supported");
    });
  }
});
