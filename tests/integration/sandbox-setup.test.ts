// AC-M4-8: worker start-up (orphan cleanup, image check), container removal,
// infrastructure failures → internal_error. Needs Docker, no database.
import { execFileSync } from "node:child_process";

import { afterAll, describe, expect, it } from "vitest";

import {
  createDockerExecutor,
  namespaceLabel,
  prepareSandbox,
  SANDBOX_LABEL,
  SandboxSetupError,
} from "../../worker/docker-executor";
import { config, evensJob, sandboxContainers } from "../helpers/sandbox";

const T = 60_000;

/** A started `sleep 60` container with the sandbox label and `extraLabels`. */
function sleeper(extraLabels: string[]): string {
  const id = execFileSync(
    "docker",
    ["create", "--label", SANDBOX_LABEL, ...extraLabels.flatMap((l) => ["--label", l]), "--network", "none", config().imagePython, "sleep", "60"],
    { encoding: "utf8" },
  ).trim();
  execFileSync("docker", ["start", id]);
  return id;
}

const exists = (id: string) =>
  execFileSync("docker", ["ps", "-a", "--filter", `id=${id}`, "-q"], { encoding: "utf8" }).trim() !== "";

afterAll(() => {
  expect(sandboxContainers()).toEqual([]);
});

describe("prepareSandbox", () => {
  it("removes orphaned sandbox containers of its own namespace", { timeout: T }, async () => {
    const id = sleeper([namespaceLabel(config().namespace)]);
    expect(sandboxContainers()).toContain(id.slice(0, 12));
    const { removed } = await prepareSandbox(config());
    expect(removed).toBeGreaterThanOrEqual(1);
    expect(sandboxContainers()).toEqual([]);
  });

  it("leaves other namespaces and containers without the ns label alone", { timeout: T }, async () => {
    const otherNs = `${config().namespace}-other`;
    const other = sleeper([namespaceLabel(otherNs)]);
    const legacy = sleeper([]);
    try {
      // This checkout's worker starts: neither container is touched.
      await expect(prepareSandbox(config())).resolves.toEqual({ removed: 0 });
      expect(exists(other)).toBe(true);
      expect(exists(legacy)).toBe(true);
      // The other namespace's worker starts: it removes only its own container.
      await expect(prepareSandbox({ ...config(), namespace: otherNs })).resolves.toEqual({ removed: 1 });
      expect(exists(other)).toBe(false);
      expect(exists(legacy)).toBe(true);
    } finally {
      for (const id of [other, legacy].filter(exists)) execFileSync("docker", ["rm", "-f", id], { stdio: "ignore" });
    }
  });

  it("passes when both images exist", { timeout: T }, async () => {
    await expect(prepareSandbox(config())).resolves.toEqual({ removed: 0 });
  });

  it("fails with a clear message when an image is missing", { timeout: T }, async () => {
    const bad = { ...config(), imageNode: "lemmayard-sandbox-missing:does-not-exist" };
    const error = await prepareSandbox(bad).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SandboxSetupError);
    expect((error as Error).message).toBe(
      'Sandbox image "lemmayard-sandbox-missing:does-not-exist" not found. Build the images with: pnpm sandbox:build',
    );
  });

  it("fails with a clear message when docker is unavailable", { timeout: T }, async () => {
    const error = await prepareSandbox({ ...config(), dockerBin: "/nonexistent/docker" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SandboxSetupError);
    expect((error as Error).message).toMatch(/^Docker is not available/);
  });
});

describe("executor infrastructure failures", () => {
  it("missing image → internal_error, nothing left behind", { timeout: T }, async () => {
    const exec = createDockerExecutor({ ...config(), imagePython: "lemmayard-sandbox-missing:nope" });
    const r = await exec(await evensJob("python", "class Solution: pass"));
    expect(r.status).toBe("internal_error");
    expect(r.passedCount).toBe(0);
    expect(r.caseResults.every((c) => c.status === "not_run")).toBe(true);
    expect(sandboxContainers()).toEqual([]);
  });

  it("docker not runnable → internal_error", { timeout: T }, async () => {
    const exec = createDockerExecutor({ ...config(), dockerBin: "/nonexistent/docker" });
    const r = await exec(await evensJob("python", "class Solution: pass"));
    expect(r.status).toBe("internal_error");
  });
});
