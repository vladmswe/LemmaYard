// VercelSandboxExecutor against a fake SandboxClient (no Vercel calls: the
// real client needs the owner's OIDC token). Covers what the executor itself
// decides: what enters the VM (inputs only, never `expected`), how the VM is
// created and always stopped, frames with the nonce, the Submit stop, the
// wall clock, the output cap and platform failures. The launcher + harness
// inside a real Linux sandbox are covered by
// tests/integration/sandbox-vercel-executor.test.ts.
import { afterEach, describe, expect, it, vi } from "vitest";

import { createParams } from "../../worker/vercel-sandbox-client";
import {
  createVercelSandboxExecutor,
  NODE_LAUNCHER,
  PYTHON_LAUNCHER,
  VM_PAYLOAD_PATH,
  vmCommand,
  vmHarnessPath,
  VM_LANGUAGES,
  type SandboxClient,
  type SandboxCreateOptions,
  type SandboxRunOptions,
} from "../../worker/vercel-sandbox-executor";
import type { ExecJob, Language } from "../../worker/types";

const harness = {
  python: Buffer.from("# py harness"),
  javascript: Buffer.from("// js harness"),
  java: Buffer.from("// java harness"),
};
const IMAGES = { python: "img/python", javascript: "img/node", java: "img/java" } as const;
const config = {
  images: { ...IMAGES },
  timeMultPython: 2,
  timeMultJs: 1,
  timeMultJava: 2,
  wallCapMs: 30_000,
  harness,
};

type Payload = { nonce: string; tests: { input: Record<string, unknown> }[] } & Record<string, unknown>;

/** What the fake "VM" does with a payload: emits output and finally exits (or hangs until killed). */
type Script = (io: {
  payload: Payload;
  frame: (body: object) => void;
  write: (stream: "stdout" | "stderr", text: string) => void;
  killed: () => boolean;
}) => Promise<number | "hang">;

function fakeClient(script: Script, options: { failCreate?: Error; failRun?: Error } = {}) {
  const calls = {
    created: [] as SandboxCreateOptions[],
    files: [] as { path: string; content: Buffer }[],
    runs: [] as Omit<SandboxRunOptions, "onOutput">[],
    kills: 0,
    stops: 0,
  };
  const client: SandboxClient = {
    async create(opts) {
      calls.created.push(opts);
      if (options.failCreate) throw options.failCreate;
      return {
        async writeFiles(files) {
          calls.files.push(...files);
        },
        async run({ onOutput, ...rest }) {
          calls.runs.push(rest);
          if (options.failRun) throw options.failRun;
          const payloadFile = calls.files.find((f) => f.path === VM_PAYLOAD_PATH)!;
          const payload = JSON.parse(payloadFile.content.toString("utf8")) as Payload;
          let killed = false;
          let release = () => {};
          const killedPromise = new Promise<void>((r) => (release = r));
          const done = (async () => {
            const write = (stream: "stdout" | "stderr", text: string) => {
              if (!killed) onOutput(stream, Buffer.from(text));
            };
            const frame = (body: object) => write("stdout", `\n@@${payload.nonce}@@${JSON.stringify(body)}\n`);
            const code = await script({ payload, frame, write, killed: () => killed });
            if (code === "hang") {
              await killedPromise;
              return { exitCode: 137 };
            }
            return { exitCode: code };
          })();
          return {
            done,
            async kill() {
              calls.kills += 1;
              killed = true;
              release();
            },
          };
        },
        async stop() {
          calls.stops += 1;
        },
      };
    },
  };
  return { client, calls };
}

const evens = (nums: number[]) => nums.filter((n) => n % 2 === 0);
const TESTS = [[1, 2, 3, 4], [], [1, 3, 5], [-2, 0, 7]];

function job(language: Language, over: Partial<ExecJob> = {}): ExecJob {
  return {
    language,
    code: "class Solution: ...",
    signature: { name: "evens", params: [{ name: "nums", type: "int[]" }], returns: "int[]" },
    compare: { mode: "exact" },
    limits: { timeMs: 1000, memoryMb: 128 },
    tests: TESTS.map((nums) => ({ input: { nums }, expected: evens(nums) })),
    stopOnFirstFailure: true,
    ...over,
  };
}

const ok = (index: number, actual: unknown) => ({ kind: "test", index, status: "ok", actual, timeMs: 1, stdout: "", memoryKb: 9000 });
const done = { kind: "done", stdout: "", memoryKb: 9000 };

/** A correct program: answers every test, then `done`. */
const correct: Script = async ({ payload, frame }) => {
  payload.tests.forEach((t, i) => frame(ok(i, evens(t.input.nums as number[]))));
  frame(done);
  return 0;
};

afterEach(() => {
  vi.useRealTimers();
});

describe("VercelSandboxExecutor", () => {
  it.each(["python", "javascript", "java"] as const)("accepted (%s): uploads harness + payload, stops the VM", async (language) => {
    const { client, calls } = fakeClient(correct);
    const r = await createVercelSandboxExecutor(config, client)(job(language));
    expect(r.status).toBe("accepted");
    expect(r.passedCount).toBe(4);
    expect(r.totalCount).toBe(4);
    expect(calls.created).toEqual([
      { image: IMAGES[language], timeoutMs: expect.any(Number) as number },
    ]);
    expect(calls.files.map((f) => f.path)).toEqual([vmHarnessPath(language), VM_PAYLOAD_PATH]);
    expect(calls.files[0]!.content).toBe(harness[language]);
    expect(calls.stops).toBe(1);
    expect(calls.kills).toBe(0);
  });

  it("never sends `expected` into the VM: inputs, limits and the nonce only", async () => {
    const { client, calls } = fakeClient(correct);
    await createVercelSandboxExecutor(config, client)(job("python"));
    const text = calls.files.find((f) => f.path === VM_PAYLOAD_PATH)!.content.toString("utf8");
    expect(text.endsWith("\n")).toBe(true);
    const payload = JSON.parse(text) as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(
      ["code", "language", "nonce", "signature", "stopOnError", "tests", "timeLimitMs"].sort(),
    );
    expect(text).not.toContain("expected");
    expect(payload.tests).toEqual(TESTS.map((nums) => ({ input: { nums } })));
    expect(payload.timeLimitMs).toBe(2000); // python ×2
    expect(payload.nonce).toMatch(/^[0-9a-f]{32}$/);
  });

  it("Submit: stops the VM at the first wrong answer", async () => {
    const { client, calls } = fakeClient(async ({ frame }) => {
      frame(ok(0, [2, 4]));
      frame(ok(1, [99]));
      return "hang";
    });
    const r = await createVercelSandboxExecutor(config, client)(job("javascript"));
    expect(r.status).toBe("wrong_answer");
    expect(r.failedTestIndex).toBe(1);
    expect(r.failedCase).toEqual({ input: { nums: [] }, expected: [], actual: [99] });
    expect(calls.kills).toBe(1);
    expect(calls.stops).toBe(1);
  });

  it("ignores frames with a forged nonce", async () => {
    const { client } = fakeClient(async ({ payload, frame, write }) => {
      write("stdout", `\n@@${"0".repeat(32)}@@${JSON.stringify(ok(0, [2, 4]))}\n`);
      return correct({ payload, frame, write, killed: () => false });
    });
    const r = await createVercelSandboxExecutor(config, client)(job("python"));
    expect(r.status).toBe("accepted");
  });

  it("wall clock: a hanging run is killed and judged time_limit", async () => {
    vi.useFakeTimers();
    const { client, calls } = fakeClient(async ({ frame }) => {
      frame(ok(0, [2, 4]));
      return "hang";
    });
    const pending = createVercelSandboxExecutor(config, client)(job("javascript"));
    // wall = 3000 + min(4 tests × 1000 ms, cap)
    await vi.advanceTimersByTimeAsync(7000);
    const r = await pending;
    expect(r.status).toBe("time_limit");
    expect(r.passedCount).toBe(1);
    expect(calls.kills).toBe(1);
    expect(calls.runs[0]!.timeoutMs).toBe(9000); // the platform's own SIGKILL backstop
  });

  it("wall clock: a kill the platform never confirms still ends the run", async () => {
    vi.useFakeTimers();
    const { client } = fakeClient(async () => new Promise<number>(() => {}));
    const pending = createVercelSandboxExecutor(config, client)(job("javascript"));
    await vi.advanceTimersByTimeAsync(7000 + 5000);
    expect((await pending).status).toBe("time_limit");
  });

  it("output cap: more than 1 MB of output kills the run", async () => {
    const { client, calls } = fakeClient(async ({ write, killed }) => {
      for (let i = 0; i < 40 && !killed(); i++) write("stdout", "y".repeat(64 * 1024));
      return "hang";
    });
    const r = await createVercelSandboxExecutor(config, client)(job("python"));
    expect(r.status).toBe("runtime_error");
    expect(r.error).toBe("Output limit exceeded (1 MB)");
    expect(calls.kills).toBe(1);
  });

  it("Node heap abort (exit 134) is memory_limit", async () => {
    const { client } = fakeClient(async ({ write }) => {
      write("stderr", "FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory");
      return 134;
    });
    expect((await createVercelSandboxExecutor(config, client)(job("javascript"))).status).toBe("memory_limit");
  });

  it("an exit without results is a runtime error with the exit code", async () => {
    const { client } = fakeClient(async () => 1);
    const r = await createVercelSandboxExecutor(config, client)(job("python"));
    expect(r.status).toBe("runtime_error");
    expect(r.error).toBe("program exited unexpectedly (exit code 1)");
  });

  it("platform failures are internal_error, with a one-line reason; the VM is stopped when it exists", async () => {
    const create = fakeClient(correct, { failCreate: new Error("sandbox quota exceeded\nstack...") });
    const r1 = await createVercelSandboxExecutor(config, create.client)(job("python"));
    expect(r1.status).toBe("internal_error");
    expect(r1.error).toBe("internal error: sandbox: sandbox quota exceeded");
    expect(create.calls.stops).toBe(0);

    const run = fakeClient(correct, { failRun: new Error("command failed") });
    const r2 = await createVercelSandboxExecutor(config, run.client)(job("javascript"));
    expect(r2.status).toBe("internal_error");
    expect(run.calls.stops).toBe(1);
  });
});

describe("VM command and SDK options", () => {
  it("runs the launcher with an argument array, never a shell", () => {
    const py = vmCommand("python", 256);
    expect(py.cmd).toBe("python3");
    expect(py.args).toEqual(["-I", "-c", PYTHON_LAUNCHER, String(256 * 1024 * 1024), VM_PAYLOAD_PATH, vmHarnessPath("python")]);
    const js = vmCommand("javascript", 256);
    expect(js.cmd).toBe("node");
    expect(js.args).toEqual(["-e", NODE_LAUNCHER, "192", VM_PAYLOAD_PATH, vmHarnessPath("javascript")]);
    for (const c of [py, js]) expect(["sh", "bash"]).not.toContain(c.cmd);
  });

  it("Java: the JVM runs Harness.java in source mode with the payload file and memory flags", () => {
    const java = vmCommand("java", 256);
    expect(java.cmd).toBe("java");
    expect(vmHarnessPath("java")).toBe("/vercel/sandbox/Harness.java");
    expect(java.args).toEqual([
      "-XX:+UseSerialGC",
      "-Xmx128m",
      "-XX:MaxDirectMemorySize=128m",
      "-XX:-UsePerfData",
      "-XX:+DisableAttachMechanism",
      "-Xlog:disable",
      "-Xlog:all=error:stderr",
      "-Dsolution.stackMb=32",
      `-Druntime.payload=${VM_PAYLOAD_PATH}`,
      vmHarnessPath("java"),
    ]);
    // The Docker image's AOT cache path does not exist in another image.
    expect(java.args.some((a) => a.includes("AOTCache"))).toBe(false);
  });

  it("Java: the wall budget adds the compile allowance and the Java multiplier", async () => {
    const { client, calls } = fakeClient(correct);
    await createVercelSandboxExecutor(config, client)(job("java"));
    const py = fakeClient(correct);
    await createVercelSandboxExecutor(config, py.client)(job("python"));
    // Same multiplier (2) for both: the difference is the compile allowance.
    expect(calls.created[0]!.timeoutMs - py.calls.created[0]!.timeoutMs).toBe(VM_LANGUAGES.java.compileAllowanceMs);
    expect(VM_LANGUAGES.java.compileAllowanceMs).toBeGreaterThan(0);
  });

  it("creates every VM with egress denied, 1 vCPU, no env and no persistence", () => {
    const params = createParams({ image: "img", timeoutMs: 90_000 });
    expect(params).toEqual({
      image: "img",
      resources: { vcpus: 1 },
      timeout: 90_000,
      networkPolicy: "deny-all",
      persistent: false,
    });
    expect(params).not.toHaveProperty("env");
  });
});
