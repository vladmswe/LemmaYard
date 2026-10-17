// AC-M4-9: Docker is driven with execFile + argument arrays only; nothing
// passes environment, mounts or a shell into the sandbox.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildCreateArgs, sandboxCommand, wallBudgetMs } from "../../worker/docker-executor";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|mts|js|mjs|cjs)$/.test(name) ? [full] : [];
  });
}

describe("no shell execution in worker/ and scripts/", () => {
  const files = ["worker", "scripts"].flatMap((d) => sourceFiles(path.join(process.cwd(), d)));

  it("finds the source files", () => {
    expect(files.some((f) => f.endsWith("docker-executor.ts"))).toBe(true);
  });

  it.each(files.map((f) => [path.relative(process.cwd(), f), f]))("%s", (_rel, file) => {
    const text = readFileSync(file, "utf8");
    expect(text).not.toMatch(/\bexec\s*\(/);
    expect(text).not.toMatch(/\bexecSync\s*\(/);
    expect(text).not.toMatch(/shell\s*:\s*true/);
    expect(text).not.toMatch(/\.exec\s*\(\s*["'`]/);
  });
});

describe("docker create arguments", () => {
  const args = buildCreateArgs("img:tag", 256, sandboxCommand("javascript", 256));

  it("carries every hardening flag of PLAN.md section 5", () => {
    const joined = args.join(" ");
    for (const flag of [
      "create -i",
      "--label lemmayard.sandbox=1",
      "--pull never",
      "--network none",
      "--read-only",
      "--cap-drop ALL",
      "--security-opt no-new-privileges",
      "--pids-limit 64",
      "--cpus 1",
      "--memory 256m",
      "--memory-swap 256m",
      "--user 65534:65534",
      "--log-driver none",
      "--tmpfs /tmp:rw,size=16m,noexec",
    ]) {
      expect(joined).toContain(flag);
    }
    expect(args.slice(-4)).toEqual(["img:tag", "node", "--max-old-space-size=192", "/sandbox/harness.js"]);
  });

  it("passes no environment, mounts or privileges", () => {
    for (const forbidden of ["-e", "--env", "--env-file", "-v", "--volume", "--mount", "--privileged", "--cap-add"]) {
      expect(args).not.toContain(forbidden);
    }
    expect(args.some((a) => a.startsWith("--env") || a.startsWith("-e="))).toBe(false);
  });

  it("uses the wall-clock formula 3000 + min(n × limit, cap)", () => {
    expect(wallBudgetMs(5, 2000, 30_000)).toBe(13_000);
    expect(wallBudgetMs(100, 2000, 30_000)).toBe(33_000);
  });
});
