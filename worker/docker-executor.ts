// DockerExecutor (PLAN.md section 5): runs one job in a fresh, locked-down
// container and judges the result. Docker is driven only through `execFile`
// with argument arrays (never a shell), no bind mounts and no `-e`: the
// worker's environment never reaches the container.
import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";

import type { Env } from "@/server/env";

import { decideVerdict, frameFails, internalErrorResult, type RunObservation } from "./judge";
import { FrameParser, type SandboxPayload } from "./protocol";
import type { ExecJob, ExecResult, Executor, Language } from "./types";

export const SANDBOX_LABEL = "lemmayard.sandbox=1";
/**
 * Every container also carries `lemmayard.ns=<namespace>`. Start-up cleanup
 * and the leftover checks only look at their own namespace, so workers of
 * other checkouts (worktrees) or other runs never lose their containers.
 */
export const NAMESPACE_LABEL_KEY = "lemmayard.ns";
export const OUTPUT_LIMIT_BYTES = 1024 * 1024;
export const WALL_BASE_MS = 3000;
const DOCKER_CMD_TIMEOUT_MS = 30_000;
/** After a kill, how long to wait for `docker start -a` to return before killing it. */
const KILL_GRACE_MS = 5000;

export type DockerExecutorConfig = {
  imagePython: string;
  imageNode: string;
  timeMultPython: number;
  timeMultJs: number;
  wallCapMs: number;
  /** Value of the `lemmayard.ns` label (see `sandboxNamespace`). */
  namespace: string;
  dockerBin?: string;
  /** Extra `key=value` labels on every container (the worker tags its own). */
  labels?: string[];
};

export function dockerConfigFromEnv(env: Env): DockerExecutorConfig {
  return {
    imagePython: env.SANDBOX_IMAGE_PYTHON,
    imageNode: env.SANDBOX_IMAGE_NODE,
    timeMultPython: env.LANG_TIME_MULT_PY,
    timeMultJs: env.LANG_TIME_MULT_JS,
    wallCapMs: env.WALL_CAP_MS,
    namespace: env.SANDBOX_NAMESPACE ?? defaultSandboxNamespace(),
  };
}

/**
 * Default namespace of a checkout: its directory name plus a short hash of
 * the absolute path (`my-app-1a2b3c4d`), so two worktrees never share one.
 */
export function defaultSandboxNamespace(projectDir: string = process.cwd()): string {
  const dir = path.resolve(projectDir);
  const name = path.basename(dir).toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^[-_.]+/, "").slice(0, 40);
  const hash = createHash("sha256").update(dir).digest("hex").slice(0, 8);
  return name ? `${name}-${hash}` : hash;
}

export function namespaceLabel(namespace: string): string {
  return `${NAMESPACE_LABEL_KEY}=${namespace}`;
}

export class SandboxSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxSetupError";
  }
}

/** `effective_limit = timeMs × langMultiplier`. */
export function effectiveTimeLimitMs(
  language: Language,
  timeMs: number,
  config: Pick<DockerExecutorConfig, "timeMultPython" | "timeMultJs">,
): number {
  const mult = language === "python" ? config.timeMultPython : config.timeMultJs;
  return Math.round(timeMs * mult);
}

/** `wall = 3000 ms + min(n_tests × effective_limit, WALL_CAP_MS)`. */
export function wallBudgetMs(nTests: number, effectiveLimitMs: number, wallCapMs: number): number {
  return WALL_BASE_MS + Math.min(nTests * effectiveLimitMs, wallCapMs);
}

export function imageFor(language: Language, config: DockerExecutorConfig): string {
  return language === "python" ? config.imagePython : config.imageNode;
}

/** The runner command inside the image (part of the harness contract). */
export function sandboxCommand(language: Language, memoryMb: number): string[] {
  if (language === "python") {
    // -I: isolated (ignores PYTHON* env, no user site, no cwd on sys.path);
    // -B: never write .pyc (the root filesystem is read-only).
    return ["python3", "-I", "-B", "/sandbox/harness.py"];
  }
  return ["node", `--max-old-space-size=${nodeHeapMb(memoryMb)}`, "/sandbox/harness.js"];
}

/** V8 heap below the memory limit so heap exhaustion aborts cleanly (exit 134). */
export function nodeHeapMb(memoryMb: number): number {
  return Math.max(16, Math.floor(memoryMb * 0.75));
}

/** `docker create` arguments. Deliberately no `-e`, `-v` or `--mount`. */
export function buildCreateArgs(
  image: string,
  memoryMb: number,
  command: string[],
  namespace: string,
  extraLabels: string[] = [],
): string[] {
  return [
    "create",
    "-i",
    "--label",
    SANDBOX_LABEL,
    "--label",
    namespaceLabel(namespace),
    ...extraLabels.flatMap((label) => ["--label", label]),
    "--pull",
    "never",
    "--network",
    "none",
    "--read-only",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--pids-limit",
    "64",
    "--cpus",
    "1",
    "--memory",
    `${memoryMb}m`,
    "--memory-swap",
    `${memoryMb}m`,
    "--user",
    "65534:65534",
    "--log-driver",
    "none",
    "--tmpfs",
    "/tmp:rw,size=16m,noexec",
    image,
    ...command,
  ];
}

type DockerOutput = { stdout: string; stderr: string };

function docker(bin: string, args: string[], timeoutMs = DOCKER_CMD_TIMEOUT_MS): Promise<DockerOutput> {
  return new Promise((resolve, reject) => {
    execFile(
      bin,
      args,
      { encoding: "utf8", timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          const detail = (stderr || error.message).trim().split("\n")[0]?.slice(0, 300) ?? "";
          reject(new Error(`docker ${args[0]} failed: ${detail}`));
        } else {
          resolve({ stdout, stderr });
        }
      },
    );
  });
}

/** `docker ps` filter for the sandbox containers of one namespace. */
export function namespaceFilterArgs(namespace: string): string[] {
  return ["--filter", `label=${SANDBOX_LABEL}`, "--filter", `label=${namespaceLabel(namespace)}`];
}

/**
 * Worker start-up: removes orphaned sandbox containers of this namespace
 * (labels `lemmayard.sandbox=1` and `lemmayard.ns=<namespace>`; containers of
 * other namespaces and old containers without the ns label are left alone)
 * and checks that both images exist. Other users of the executor
 * (`problems:verify`) pass `removeOrphans: false` so that they never remove
 * the containers of a running worker.
 */
export async function prepareSandbox(
  config: DockerExecutorConfig,
  options: { removeOrphans?: boolean } = {},
): Promise<{ removed: number }> {
  const bin = config.dockerBin ?? "docker";
  let ids: string[];
  try {
    const { stdout } = await docker(bin, ["ps", "-a", ...namespaceFilterArgs(config.namespace), "-q"]);
    ids = stdout.split("\n").map((s) => s.trim()).filter(Boolean);
  } catch (error) {
    throw new SandboxSetupError(
      `Docker is not available (${error instanceof Error ? error.message : String(error)}). Start Docker and retry.`,
    );
  }
  if (options.removeOrphans === false) ids = [];
  if (ids.length > 0) await docker(bin, ["rm", "-f", ...ids]);
  for (const image of [config.imagePython, config.imageNode]) {
    try {
      await docker(bin, ["image", "inspect", "--format", "{{.Id}}", image]);
    } catch {
      throw new SandboxSetupError(
        `Sandbox image "${image}" not found. Build the images with: pnpm sandbox:build`,
      );
    }
  }
  return { removed: ids.length };
}

/** Force-removes every container carrying `label` (`key=value`); returns how many. */
export async function removeContainers(
  config: Pick<DockerExecutorConfig, "dockerBin">,
  label: string,
): Promise<number> {
  const bin = config.dockerBin ?? "docker";
  const { stdout } = await docker(bin, ["ps", "-a", "--filter", `label=${label}`, "-q"]);
  const ids = stdout.split("\n").map((s) => s.trim()).filter(Boolean);
  if (ids.length > 0) await docker(bin, ["rm", "-f", ...ids]);
  return ids.length;
}

type Attached = Omit<RunObservation, "exitCode" | "oomKilled">;

/** `docker start -a -i`: sends the payload, reads frames, enforces wall clock and output cap. */
function attach(
  bin: string,
  id: string,
  job: ExecJob,
  payload: SandboxPayload,
  wallMs: number,
): Promise<Attached> {
  return new Promise((resolve) => {
    const parser = new FrameParser(payload.nonce);
    let total = 0;
    const stderrChunks: Buffer[] = []; // bounded by the 1 MB output cap
    let wallKilled = false;
    let outputExceeded = false;
    let frozen = false; // verdict decided: ignore anything that arrives later
    let graceTimer: NodeJS.Timeout | undefined;

    const child = execFile(bin, ["start", "-a", "-i", id], {
      encoding: "buffer",
      maxBuffer: 4 * OUTPUT_LIMIT_BYTES,
      windowsHide: true,
    });

    const kill = () => {
      frozen = true;
      docker(bin, ["kill", id]).catch(() => {});
      graceTimer ??= setTimeout(() => child.kill("SIGKILL"), KILL_GRACE_MS);
    };
    const wallTimer = setTimeout(() => {
      if (frozen) return;
      wallKilled = true;
      kill();
    }, wallMs);

    const count = (chunk: Buffer): boolean => {
      total += chunk.length;
      if (total > OUTPUT_LIMIT_BYTES && !frozen) {
        outputExceeded = true;
        kill();
      }
      return !frozen;
    };

    child.stdout?.on("data", (chunk: Buffer) => {
      if (!count(chunk)) return;
      for (const frame of parser.push(chunk)) {
        if (
          job.stopOnFirstFailure &&
          frame.kind === "test" &&
          frame.status === "ok" &&
          frameFails(job, frame)
        ) {
          // Wrong answer: the harness cannot know, stop the container here.
          kill();
          break;
        }
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      if (count(chunk)) stderrChunks.push(chunk);
    });
    child.stdin?.on("error", () => {});
    child.on("error", () => {});
    child.on("close", () => {
      clearTimeout(wallTimer);
      if (graceTimer) clearTimeout(graceTimer);
      resolve({
        frames: [...parser.frames],
        badFrame: parser.bad,
        wallKilled,
        outputExceeded,
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
      });
    });
    child.stdin?.end(`${JSON.stringify(payload)}\n`);
  });
}

async function inspectState(bin: string, id: string): Promise<{ exitCode: number; oomKilled: boolean }> {
  const { stdout } = await docker(bin, ["inspect", "--format", "{{json .State}}", id]);
  const state = JSON.parse(stdout) as { ExitCode?: unknown; OOMKilled?: unknown };
  return { exitCode: Number(state.ExitCode), oomKilled: state.OOMKilled === true };
}

/** The single stdin line sent to the container. Inputs only: never `expected`. */
export function buildSandboxPayload(job: ExecJob, timeLimitMs: number, nonce: string): SandboxPayload {
  return {
    language: job.language,
    code: job.code,
    signature: job.signature,
    tests: job.tests.map((t) => ({ input: t.input })),
    timeLimitMs,
    stopOnError: job.stopOnFirstFailure,
    nonce,
  };
}

export function createDockerExecutor(config: DockerExecutorConfig): Executor {
  const bin = config.dockerBin ?? "docker";
  return async function dockerExecutor(job: ExecJob): Promise<ExecResult> {
    const effective = effectiveTimeLimitMs(job.language, job.limits.timeMs, config);
    const wallMs = wallBudgetMs(job.tests.length, effective, config.wallCapMs);
    const payload = buildSandboxPayload(job, effective, randomBytes(16).toString("hex"));
    let id: string | null = null;
    try {
      const args = buildCreateArgs(
        imageFor(job.language, config),
        job.limits.memoryMb,
        sandboxCommand(job.language, job.limits.memoryMb),
        config.namespace,
        config.labels,
      );
      id = (await docker(bin, args)).stdout.trim();
      const attached = await attach(bin, id, job, payload, wallMs);
      const state = await inspectState(bin, id);
      return decideVerdict(job, { ...attached, ...state });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return internalErrorResult(job, `internal error: ${reason}`);
    } finally {
      if (id) await docker(bin, ["rm", "-f", id]).catch(() => {});
    }
  };
}
