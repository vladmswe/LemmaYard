// AC-M4-8: worker start-up (orphan cleanup, image check), container removal,
// infrastructure failures → internal_error. Needs Docker, no database.
import { execFileSync } from "node:child_process";

import { afterAll, describe, expect, it } from "vitest";

import {
  createDockerExecutor,
  prepareSandbox,
  SANDBOX_LABEL,
  SandboxSetupError,
} from "../../worker/docker-executor";
import { config, evensJob, sandboxContainers } from "../helpers/sandbox";

const T = 60_000;

afterAll(() => {
  expect(sandboxContainers()).toEqual([]);
});

describe("prepareSandbox", () => {
  it("removes orphaned sandbox containers", { timeout: T }, async () => {
    const id = execFileSync(
      "docker",
      ["create", "--label", SANDBOX_LABEL, "--network", "none", config().imagePython, "sleep", "60"],
      { encoding: "utf8" },
    ).trim();
    execFileSync("docker", ["start", id]);
    expect(sandboxContainers()).toContain(id.slice(0, 12));
    const { removed } = await prepareSandbox(config());
    expect(removed).toBeGreaterThanOrEqual(1);
    expect(sandboxContainers()).toEqual([]);
  });

  it("passes when both images exist", { timeout: T }, async () => {
    await expect(prepareSandbox(config())).resolves.toEqual({ removed: 0 });
  });

  it("fails with a clear message when an image is missing", { timeout: T }, async () => {
    const bad = { ...config(), imageNode: "leetcopy-sandbox-missing:does-not-exist" };
    const error = await prepareSandbox(bad).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SandboxSetupError);
    expect((error as Error).message).toBe(
      'Sandbox image "leetcopy-sandbox-missing:does-not-exist" not found. Build the images with: pnpm sandbox:build',
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
    const exec = createDockerExecutor({ ...config(), imagePython: "leetcopy-sandbox-missing:nope" });
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
