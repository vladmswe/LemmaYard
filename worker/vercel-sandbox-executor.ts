// VercelSandboxExecutor (docs/specs/judge-prod.md): the production executor
// on Vercel. Same contract and protocol as the DockerExecutor: one fresh,
// isolated machine per job (a Firecracker microVM with all egress denied), the
// payload carries inputs only (never `expected`), frames are read with the
// per-run nonce, and the verdict is decided here by `decideVerdict`.
//
// The SDK sits behind `SandboxClient` so tests use a fake; the real client is
// `worker/vercel-sandbox-client.ts`.
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  buildSandboxPayload,
  effectiveTimeLimitMs,
  jvmLimitFlags,
  nodeHeapMb,
  OUTPUT_LIMIT_BYTES,
  wallBudgetMs,
} from "./docker-executor";
import { decideVerdict, frameFails, internalErrorResult, type RunObservation } from "./judge";
import { FrameParser, type SandboxPayload } from "./protocol";
import type { ExecJob, ExecResult, Executor, Language } from "./types";

/** Working directory inside the microVM (the SDK's file root). */
export const VM_DIR = "/vercel/sandbox";
export const VM_PAYLOAD_PATH = `${VM_DIR}/payload.json`;

/** Sandbox session limit beyond the wall budget (create, file upload, stop). */
const SESSION_MARGIN_MS = 60_000;
/** After a kill, how long to wait for the command to report its exit. */
const KILL_GRACE_MS = 5000;

export type SandboxCreateOptions = {
  image: string;
  /** Session timeout: the platform stops the VM after this. */
  timeoutMs: number;
};

export type SandboxRunOptions = {
  cmd: string;
  args: string[];
  /** Hard kill by the platform (backstop for the wall-clock timer). */
  timeoutMs: number;
  onOutput: (stream: "stdout" | "stderr", chunk: Buffer) => void;
};

export type SandboxCommand = {
  /** Resolves once the command has exited and all its output was delivered. */
  done: Promise<{ exitCode: number | null }>;
  kill(): Promise<void>;
};

export type SandboxVm = {
  writeFiles(files: { path: string; content: Buffer }[]): Promise<void>;
  run(options: SandboxRunOptions): Promise<SandboxCommand>;
  stop(): Promise<void>;
};

/**
 * What the executor needs from the platform. The real client must create
 * every VM with all egress denied, no environment and no persistence.
 */
export type SandboxClient = {
  create(options: SandboxCreateOptions): Promise<SandboxVm>;
};

export type VercelSandboxConfig = {
  /** VM image per language (managed `vercel/sandbox/*` or a custom VCR image). */
  images: Record<Language, string>;
  timeMultPython: number;
  timeMultJs: number;
  timeMultJava: number;
  wallCapMs: number;
  /** Harness sources; defaults to the `sandbox/` files of `VM_LANGUAGES`. */
  harness?: Record<Language, Buffer>;
};

/**
 * Python launcher (trusted, fixed text): caps the address space at the
 * problem's memory limit (the VM has no per-job cgroup), makes the payload
 * file stdin, deletes it and execs the harness exactly as in Docker.
 */
export const PYTHON_LAUNCHER = [
  "import os, resource, sys",
  "limit = int(sys.argv[1])",
  "resource.setrlimit(resource.RLIMIT_AS, (limit, limit))",
  "fd = os.open(sys.argv[2], os.O_RDONLY)",
  "try:",
  "    os.unlink(sys.argv[2])",
  "except OSError:",
  "    pass",
  "if fd != 0:",
  "    os.dup2(fd, 0)",
  "    os.close(fd)",
  "os.execv(sys.executable, [sys.executable, '-I', '-B', sys.argv[3]])",
].join("\n");

/**
 * Node launcher (trusted, fixed text): runs the harness with the V8 heap flag
 * and the payload file as stdin, and exits with the harness's exit code
 * (128 + signal number when it was killed by a signal, e.g. 134 on a heap abort).
 */
export const NODE_LAUNCHER = [
  'const fs = require("fs");',
  'const os = require("os");',
  'const { spawn } = require("child_process");',
  "const [heapMb, payloadPath, harnessPath] = process.argv.slice(1);",
  'const fd = fs.openSync(payloadPath, "r");',
  "try { fs.unlinkSync(payloadPath); } catch {}",
  'const child = spawn(process.execPath, ["--max-old-space-size=" + heapMb, harnessPath], { stdio: [fd, "inherit", "inherit"], env: {} });',
  'child.on("exit", (code, signal) => process.exit(code ?? 128 + (os.constants.signals[signal] || 0)));',
  'child.on("error", () => process.exit(70));',
].join("\n");

/**
 * Everything this executor knows about a language (docs/specs/judge-prod.md,
 * "Adding a language"). The rest of the executor is language-agnostic; being
 * a `Record<Language, …>`, a new value of the DB `language` enum does not
 * compile until it has an entry here.
 */
export type VmLanguage = {
  /** Harness file in `sandbox/`, uploaded into the VM for every job. */
  harnessFile: string;
  /**
   * Added to the wall budget for a compile step before the first test
   * (compiled languages; 0 for interpreted ones). Compile errors are reported
   * by the harness as a `compile_error` frame, like Python's syntax errors.
   */
  compileAllowanceMs: number;
  /**
   * The command for one job (argument array, no shell). It must make the
   * payload file the harness's stdin (and delete it), enforce `memoryMb`, and
   * exit with the harness's exit code (128 + signal when killed by a signal).
   */
  command(memoryMb: number, payloadPath: string, harnessPath: string): { cmd: string; args: string[] };
};

export const VM_LANGUAGES: Record<Language, VmLanguage> = {
  python: {
    harnessFile: "harness.py",
    compileAllowanceMs: 0,
    command: (memoryMb, payloadPath, harnessPath) => ({
      cmd: "python3",
      args: ["-I", "-c", PYTHON_LAUNCHER, String(memoryMb * 1024 * 1024), payloadPath, harnessPath],
    }),
  },
  javascript: {
    harnessFile: "harness.js",
    compileAllowanceMs: 0,
    command: (memoryMb, payloadPath, harnessPath) => ({
      cmd: "node",
      args: ["-e", NODE_LAUNCHER, String(nodeHeapMb(memoryMb)), payloadPath, harnessPath],
    }),
  },
  // No launcher: the JVM runs Harness.java in single-file source mode (the VCR
  // image built from sandbox/Dockerfile.java has the compiler module), the
  // harness reads the payload file named by -Druntime.payload and deletes it,
  // and -Xmx plus the solution stack size bound its memory (the VM has no
  // per-job cgroup). The allowance covers JVM start-up and compiling the
  // harness and the solution without the Docker image's AOT cache.
  java: {
    harnessFile: "Harness.java",
    compileAllowanceMs: 8000,
    command: (memoryMb, payloadPath, harnessPath) => ({
      cmd: "java",
      args: [...jvmLimitFlags(memoryMb), `-Druntime.payload=${payloadPath}`, harnessPath],
    }),
  },
};

export const vmHarnessPath = (language: Language) => `${VM_DIR}/${VM_LANGUAGES[language].harnessFile}`;

/** The command that runs one job inside the VM. */
export function vmCommand(language: Language, memoryMb: number): { cmd: string; args: string[] } {
  return VM_LANGUAGES[language].command(memoryMb, VM_PAYLOAD_PATH, vmHarnessPath(language));
}

function loadHarness(): Record<Language, Buffer> {
  // Shipped with the deployment by next.config.ts (outputFileTracingIncludes).
  const dir = path.join(process.cwd(), "sandbox");
  const entries = Object.entries(VM_LANGUAGES).map(([language, l]) => [language, readFileSync(path.join(dir, l.harnessFile))]);
  return Object.fromEntries(entries) as Record<Language, Buffer>;
}

type Attached = Omit<RunObservation, "exitCode" | "oomKilled"> & { exitCode: number | null };

/** Runs the command, reads frames, enforces the wall clock, the output cap and the Submit stop. */
async function attach(vm: SandboxVm, job: ExecJob, nonce: string, wallMs: number): Promise<Attached> {
  const parser = new FrameParser(nonce);
  const stderrChunks: Buffer[] = []; // bounded by the 1 MB output cap
  let total = 0;
  let wallKilled = false;
  let outputExceeded = false;
  let frozen = false; // verdict decided: ignore anything that arrives later
  let command: SandboxCommand | null = null;
  let killRequested = false;
  let onKill = () => {};
  // Resolves KILL_GRACE_MS after a kill: the platform may never report the exit.
  const killedAndGraceOver = new Promise<null>((resolve) => {
    onKill = () => setTimeout(() => resolve(null), KILL_GRACE_MS).unref();
  });

  const kill = () => {
    frozen = true;
    if (killRequested) return;
    killRequested = true;
    onKill();
    command?.kill().catch(() => {});
  };
  const count = (chunk: Buffer): boolean => {
    total += chunk.length;
    if (total > OUTPUT_LIMIT_BYTES && !frozen) {
      outputExceeded = true;
      kill();
    }
    return !frozen;
  };
  const onOutput = (stream: "stdout" | "stderr", chunk: Buffer) => {
    if (!count(chunk)) return;
    if (stream === "stderr") {
      stderrChunks.push(chunk);
      return;
    }
    for (const frame of parser.push(chunk)) {
      if (job.stopOnFirstFailure && frame.kind === "test" && frame.status === "ok" && frameFails(job, frame)) {
        // Wrong answer: the harness cannot know, stop the run here.
        kill();
        break;
      }
    }
  };

  const wallTimer = setTimeout(() => {
    if (frozen) return;
    wallKilled = true;
    kill();
  }, wallMs);
  let exitCode: number | null = null;
  try {
    const { cmd, args } = vmCommand(job.language, job.limits.memoryMb);
    command = await vm.run({ cmd, args, timeoutMs: wallMs + 2000, onOutput });
    // Killed while the command was starting (output cap or wall clock).
    if (killRequested) command.kill().catch(() => {});
    command.done.catch(() => {}); // a late rejection after the grace period is not an error
    exitCode = await Promise.race([command.done.then((r) => r.exitCode), killedAndGraceOver]);
  } catch (error) {
    // A killed command may end its log stream with an error: that is expected.
    if (!killRequested) throw error;
  } finally {
    clearTimeout(wallTimer);
  }
  return {
    frames: [...parser.frames],
    badFrame: parser.bad,
    wallKilled,
    outputExceeded,
    stderr: Buffer.concat(stderrChunks).toString("utf8"),
    exitCode,
  };
}

export function createVercelSandboxExecutor(config: VercelSandboxConfig, client: SandboxClient): Executor {
  let harness = config.harness;
  return async function vercelSandboxExecutor(job: ExecJob): Promise<ExecResult> {
    const effective = effectiveTimeLimitMs(job.language, job.limits.timeMs, config);
    const wallMs =
      wallBudgetMs(job.tests.length, effective, config.wallCapMs) + VM_LANGUAGES[job.language].compileAllowanceMs;
    const payload: SandboxPayload = buildSandboxPayload(job, effective, randomBytes(16).toString("hex"));
    let vm: SandboxVm | null = null;
    try {
      harness ??= loadHarness();
      vm = await client.create({
        image: config.images[job.language],
        timeoutMs: wallMs + SESSION_MARGIN_MS,
      });
      await vm.writeFiles([
        { path: vmHarnessPath(job.language), content: harness[job.language] },
        { path: VM_PAYLOAD_PATH, content: Buffer.from(`${JSON.stringify(payload)}\n`) },
      ]);
      const attached = await attach(vm, job, payload.nonce, wallMs);
      // No container runtime reports OOM here: the memory limit is enforced
      // in-process (RLIMIT_AS for Python, the V8 heap flag for Node, -Xmx for
      // Java, whose runner exits with code 3 on an OOM outside a test).
      return decideVerdict(job, { ...attached, oomKilled: false });
    } catch (error) {
      const reason = error instanceof Error ? error.message.split("\n")[0]!.slice(0, 300) : String(error).slice(0, 300);
      return internalErrorResult(job, `internal error: sandbox: ${reason}`);
    } finally {
      if (vm) await vm.stop().catch(() => {});
    }
  };
}
