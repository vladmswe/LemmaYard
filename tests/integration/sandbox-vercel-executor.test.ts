// The VercelSandboxExecutor end to end with the real harness and launchers,
// against a stand-in `SandboxClient` that runs each "VM" as a Docker container
// of the sandbox images (user code never runs on the host; real Vercel calls
// need the owner's credentials). The container has 1 GB, more than any
// problem limit, like the 2 GB microVM: the memory verdicts below come from
// the launchers (RLIMIT_AS for Python, the V8 heap flag for Node, -Xmx for
// Java), not from Docker. Needs Docker and `pnpm sandbox:build`; no database.
import { execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { namespaceLabel, SANDBOX_LABEL } from "../../worker/docker-executor";
import type { Language } from "../../worker/types";
import {
  createVercelSandboxExecutor,
  VM_PAYLOAD_PATH,
  vmHarnessPath,
  type SandboxClient,
} from "../../worker/vercel-sandbox-executor";
import { config, evensJob, sandboxContainers } from "../helpers/sandbox";

const T = 60_000;
const FIXTURE = path.join(process.cwd(), "tests/fixtures/problems/fixture-evens");

const BAKED_HARNESS: Record<Language, string> = {
  python: "/sandbox/harness.py",
  javascript: "/sandbox/harness.js",
  // The Java image carries the source as well, for exactly this source-mode run.
  java: "/sandbox/Harness.java",
};

/** Paths inside the stand-in container: the payload arrives on stdin, the harness is baked into the image. */
function mapArg(arg: string, language: Language): string {
  if (arg === VM_PAYLOAD_PATH) return "/dev/stdin";
  if (arg === `-Druntime.payload=${VM_PAYLOAD_PATH}`) return "-Druntime.payload=/dev/stdin";
  if (arg === vmHarnessPath(language)) return BAKED_HARNESS[language];
  return arg;
}

function dockerBackedClient(): SandboxClient {
  const cfg = config();
  return {
    async create({ image }) {
      const language: Language =
        image === cfg.imagePython ? "python" : image === cfg.imageJava ? "java" : "javascript";
      const name = `lemmayard-vstest-${randomBytes(4).toString("hex")}`;
      let payload: Buffer = Buffer.alloc(0);
      const remove = () =>
        new Promise<void>((resolve) => execFile("docker", ["rm", "-f", name], () => resolve()));
      return {
        async writeFiles(files) {
          payload = files.find((f) => f.path === VM_PAYLOAD_PATH)?.content ?? payload;
        },
        async run({ cmd, args, onOutput }) {
          const child = spawn(
            "docker",
            [
              "run", "--rm", "-i", "--name", name,
              "--label", SANDBOX_LABEL, "--label", namespaceLabel(cfg.namespace),
              "--pull", "never", "--network", "none", "--read-only", "--cap-drop", "ALL",
              "--security-opt", "no-new-privileges", "--user", "65534:65534",
              "--memory", "1024m", "--memory-swap", "1024m", "--tmpfs", "/tmp:rw,size=16m,noexec",
              image, cmd, ...args.map((a) => mapArg(a, language)),
            ],
            { stdio: ["pipe", "pipe", "pipe"] },
          );
          child.stdout.on("data", (c: Buffer) => onOutput("stdout", c));
          child.stderr.on("data", (c: Buffer) => onOutput("stderr", c));
          child.stdin.on("error", () => {});
          child.stdin.end(payload);
          const done = new Promise<{ exitCode: number | null }>((resolve) => {
            child.on("close", (code) => resolve({ exitCode: code }));
          });
          return { done, kill: remove };
        },
        stop: remove,
      };
    },
  };
}

const executor = createVercelSandboxExecutor(
  {
    images: { python: config().imagePython, javascript: config().imageNode, java: config().imageJava },
    timeMultPython: config().timeMultPython,
    timeMultJs: config().timeMultJs,
    timeMultJava: config().timeMultJava,
    wallCapMs: config().wallCapMs,
  },
  dockerBackedClient(),
);

const programs: Record<Language, Record<string, string>> = {
  python: {
    correct: readFileSync(path.join(FIXTURE, "solution.py"), "utf8"),
    wrong: `class Solution:\n    def evens(self, nums):\n        return nums\n`,
    loop: `class Solution:\n    def evens(self, nums):\n        while True:\n            pass\n`,
    memory: `class Solution:\n    def evens(self, nums):\n        block = [0] * (64 * 1024 * 1024)  # 512 MB of pointers, 4x the limit\n        return block[:0]\n`,
    exception: `class Solution:\n    def evens(self, nums):\n        return [n // 0 for n in nums]\n`,
  },
  javascript: {
    correct: readFileSync(path.join(FIXTURE, "solution.js"), "utf8"),
    wrong: `var evens = function (nums) { return nums; };\n`,
    loop: `var evens = function (nums) { while (true) {} };\n`,
    memory: `var evens = function (nums) {\n  const keep = [];\n  while (true) keep.push(new Array(1e5).fill(1.5));\n};\n`,
    exception: `var evens = function (nums) {\n  throw new Error("boom " + nums.length);\n};\n`,
  },
  java: {
    correct: readFileSync(path.join(FIXTURE, "solution.java"), "utf8"),
    wrong: `class Solution {\n    public long[] evens(long[] nums) { return nums; }\n}\n`,
    loop: `class Solution {\n    public long[] evens(long[] nums) { while (true) { } }\n}\n`,
    memory: `class Solution {\n    public long[] evens(long[] nums) {\n        long[] block = new long[64 * 1024 * 1024]; // 512 MB, 4x the limit\n        return new long[block.length * 0];\n    }\n}\n`,
    exception: `class Solution {\n    public long[] evens(long[] nums) { return new long[] { nums[0] / (nums.length - nums.length) }; }\n}\n`,
  },
};

afterAll(() => {
  expect(sandboxContainers()).toEqual([]);
});

describe.each(["python", "javascript", "java"] as const)("VercelSandboxExecutor launcher + harness (%s)", (language) => {
  const p = programs[language];

  it("accepted", { timeout: T }, async () => {
    const r = await executor(await evensJob(language, p.correct));
    expect(r.status).toBe("accepted");
    expect(r.passedCount).toBe(5);
    expect(r.memoryKb).toBeGreaterThan(1000);
  });

  it("wrong answer stops at the first failing test", { timeout: T }, async () => {
    const r = await executor(await evensJob(language, p.wrong));
    expect(r.status).toBe("wrong_answer");
    expect(r.failedTestIndex).toBe(0);
  });

  it("runtime error", { timeout: T }, async () => {
    const r = await executor(await evensJob(language, p.exception));
    expect(r.status).toBe("runtime_error");
  });

  it("time limit", { timeout: T }, async () => {
    const r = await executor(await evensJob(language, p.loop));
    expect(r.status).toBe("time_limit");
  });

  it("memory limit from the launcher (the container itself has 1 GB)", { timeout: T }, async () => {
    const r = await executor(await evensJob(language, p.memory));
    expect(r.status).toBe("memory_limit");
  });
});
