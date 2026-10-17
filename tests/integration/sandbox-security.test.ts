// AC-M4-6: sandbox security, each case its own fixture program with a concrete
// expectation. Probes run as custom-input Runs of `probe(x: int) -> string`
// and return a JSON report of what they observed inside the container.
import { execFileSync } from "node:child_process";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { effectiveTimeLimitMs, wallBudgetMs } from "../../worker/docker-executor";
import { config, probeJob, run, sandboxContainers } from "../helpers/sandbox";

const T = 60_000;
const JS_PROCESS = `console.log.constructor("return process")()`;
const JS_REQUIRE = `${JS_PROCESS}.mainModule.require`;
const CANARY = "leak-canary-7f3a9c";

function report(r: { status: string; caseResults: { actual?: unknown }[]; error: string | null }) {
  expect(r.status, r.error ?? "").toBe("accepted");
  return JSON.parse(r.caseResults[0].actual as string) as Record<string, unknown>;
}

beforeAll(() => {
  // Make sure the worker process really has secrets that could leak.
  process.env.POSTGRES_PASSWORD = `${CANARY}-pg`;
  process.env.AUTH_SECRET ??= `${CANARY}-auth-secret-at-least-32-chars`;
  process.env.DATABASE_URL ??= `postgres://u:${CANARY}@localhost:5433/db`;
});

afterAll(() => {
  expect(sandboxContainers()).toEqual([]);
});

describe("network is disabled", () => {
  it("python: TCP connect to 1.1.1.1 fails → runtime_error", { timeout: T }, async () => {
    const code = `import socket\nclass Solution:\n    def probe(self, x):\n        socket.create_connection(("1.1.1.1", 80), timeout=3)\n        return "connected"\n`;
    const r = await run(probeJob("python", code));
    expect(r.status).toBe("runtime_error");
    expect(r.error).toMatch(/OSError|Network is unreachable/);
  });

  it("python: DNS resolution fails → runtime_error", { timeout: T }, async () => {
    const code = `import socket\nclass Solution:\n    def probe(self, x):\n        socket.getaddrinfo("example.com", 80)\n        return "resolved"\n`;
    const r = await run(probeJob("python", code));
    expect(r.status).toBe("runtime_error");
    expect(r.error).toMatch(/gaierror/);
  });

  it("javascript: HTTP to 1.1.1.1 fails → runtime_error", { timeout: T }, async () => {
    const code = `var probe = function (x) {\n  ${JS_REQUIRE}("child_process").execFileSync("wget", ["-q", "-T", "3", "-O", "-", "http://1.1.1.1/"], { stdio: "pipe" });\n  return "connected";\n};\n`;
    const r = await run(probeJob("javascript", code));
    expect(r.status).toBe("runtime_error");
    expect(r.error).toMatch(/Command failed/);
    expect(r.error).not.toMatch(/ENOENT/);
  });

  it("javascript: DNS resolution fails → runtime_error", { timeout: T }, async () => {
    const code = `var probe = function (x) {\n  ${JS_REQUIRE}("child_process").execFileSync("nslookup", ["example.com"], { stdio: "pipe", timeout: 5000 });\n  return "resolved";\n};\n`;
    const r = await run(probeJob("javascript", code));
    expect(r.status).toBe("runtime_error");
    expect(r.error).not.toMatch(/ENOENT/);
  });
});

describe("filesystem", () => {
  it("python: / and /sandbox are not writable, /tmp takes up to 16 MB and is noexec", { timeout: T }, async () => {
    const code = [
      "import errno, json, os, subprocess",
      "def attempt(path, size):",
      "    try:",
      "        with open(path, 'wb') as f:",
      "            f.write(b'\\0' * size)",
      "        return 'ok'",
      "    except OSError as e:",
      "        return errno.errorcode.get(e.errno, str(e.errno))",
      "class Solution:",
      "    def probe(self, x):",
      "        r = {}",
      "        r['root'] = attempt('/x', 10)",
      "        r['sandbox'] = attempt('/sandbox/x', 10)",
      "        r['harness'] = attempt('/sandbox/harness.py', 10)",
      "        r['tmp15'] = attempt('/tmp/a', 15 * 1024 * 1024)",
      "        os.remove('/tmp/a')",
      "        r['tmp17'] = attempt('/tmp/b', 17 * 1024 * 1024)",
      "        if os.path.exists('/tmp/b'): os.remove('/tmp/b')",
      "        with open('/tmp/s.sh', 'w') as f: f.write('#!/bin/sh\\necho hi\\n')",
      "        os.chmod('/tmp/s.sh', 0o755)",
      "        try:",
      "            subprocess.run(['/tmp/s.sh'], check=True)",
      "            r['tmpExec'] = 'ok'",
      "        except OSError as e:",
      "            r['tmpExec'] = errno.errorcode.get(e.errno, str(e.errno))",
      "        return json.dumps(r)",
      "",
    ].join("\n");
    const r = report(await run(probeJob("python", code)));
    expect(["EROFS", "EACCES"]).toContain(r.root);
    expect(["EROFS", "EACCES"]).toContain(r.sandbox);
    expect(["EROFS", "EACCES"]).toContain(r.harness);
    expect(r.tmp15).toBe("ok");
    expect(r.tmp17).toBe("ENOSPC");
    expect(r.tmpExec).toBe("EACCES");
  });

  it("javascript: / and /sandbox are not writable, /tmp is capped at 16 MB", { timeout: T }, async () => {
    const code = [
      "var probe = function (x) {",
      `  const fs = ${JS_REQUIRE}("fs");`,
      "  const attempt = (path, size) => {",
      "    try { fs.writeFileSync(path, new Uint8Array(size)); return 'ok'; }",
      "    catch (e) { return e.code; }",
      "  };",
      "  const r = { root: attempt('/x', 10), sandbox: attempt('/sandbox/x', 10) };",
      "  r.tmp15 = attempt('/tmp/a', 15 * 1024 * 1024);",
      "  fs.rmSync('/tmp/a');",
      "  r.tmp17 = attempt('/tmp/b', 17 * 1024 * 1024);",
      "  return JSON.stringify(r);",
      "};",
      "",
    ].join("\n");
    const r = report(await run(probeJob("javascript", code)));
    expect(["EROFS", "EACCES"]).toContain(r.root);
    expect(["EROFS", "EACCES"]).toContain(r.sandbox);
    expect(r.tmp15).toBe("ok");
    expect(r.tmp17).toBe("ENOSPC");
  });
});

describe("process limits", () => {
  // Python forks duplicate memory quickly, so either the 64-PID cap
  // (BlockingIOError → runtime_error) or the cgroup memory limit (OOM kill →
  // memory_limit) stops the bomb first; both are contained outcomes.
  it("python: fork bomb is contained within the wall clock; docker stays healthy", { timeout: T }, async () => {
    const code = `import os\nclass Solution:\n    def probe(self, x):\n        while True:\n            os.fork()\n`;
    const job = probeJob("python", code);
    const wall = wallBudgetMs(1, effectiveTimeLimitMs("python", job.limits.timeMs, config()), config().wallCapMs);
    const r = await run(job);
    expect(["runtime_error", "time_limit", "memory_limit"]).toContain(r.status);
    expect(r.elapsedMs).toBeLessThanOrEqual(wall + 2000);
    expect(sandboxContainers()).toEqual([]);
    expect(execFileSync("docker", ["version", "--format", "{{.Server.Version}}"], { encoding: "utf8" }).trim()).not.toBe("");
  });

  it("python: at most 64 processes (pids-limit), then EAGAIN", { timeout: T }, async () => {
    const code = [
      "import errno, json, subprocess",
      "class Solution:",
      "    def probe(self, x):",
      "        procs = []",
      "        err = None",
      "        try:",
      "            for _ in range(200):",
      "                procs.append(subprocess.Popen(['sleep', '30']))",
      "        except OSError as e:",
      "            err = errno.errorcode.get(e.errno, str(e.errno))",
      "        n = len(procs)",
      "        for p in procs: p.kill()",
      "        return json.dumps({'spawned': n, 'error': err})",
      "",
    ].join("\n");
    const r = report(await run(probeJob("python", code)));
    expect(r.error).toBe("EAGAIN");
    expect(r.spawned).toBeGreaterThan(30);
    expect(r.spawned).toBeLessThan(64);
  });
});

describe("identity and privileges", () => {
  it("python: uid is not 0, CapEff is 0, no docker.sock", { timeout: T }, async () => {
    const code = [
      "import json, os",
      "class Solution:",
      "    def probe(self, x):",
      "        status = open('/proc/self/status').read().splitlines()",
      "        cap = [l.split()[1] for l in status if l.startswith('CapEff:')][0]",
      "        nnp = [l.split()[1] for l in status if l.startswith('NoNewPrivs:')][0]",
      "        return json.dumps({'uid': os.getuid(), 'gid': os.getgid(), 'capEff': cap, 'noNewPrivs': nnp,",
      "            'sock': os.path.exists('/var/run/docker.sock') or os.path.exists('/run/docker.sock')})",
      "",
    ].join("\n");
    const r = report(await run(probeJob("python", code)));
    expect(r.uid).not.toBe(0);
    expect(r.uid).toBe(65534);
    expect(r.gid).toBe(65534);
    expect(r.capEff).toBe("0000000000000000");
    expect(r.noNewPrivs).toBe("1");
    expect(r.sock).toBe(false);
  });

  it("javascript: uid is not 0, CapEff is 0, no docker.sock", { timeout: T }, async () => {
    const code = [
      "var probe = function (x) {",
      `  const p = ${JS_PROCESS};`,
      `  const fs = ${JS_REQUIRE}("fs");`,
      "  const status = fs.readFileSync('/proc/self/status', 'utf8');",
      "  const capEff = /CapEff:\\s*(\\S+)/.exec(status)[1];",
      "  return JSON.stringify({ uid: p.getuid(), capEff, sock: fs.existsSync('/var/run/docker.sock') || fs.existsSync('/run/docker.sock') });",
      "};",
      "",
    ].join("\n");
    const r = report(await run(probeJob("javascript", code)));
    expect(r.uid).toBe(65534);
    expect(r.capEff).toBe("0000000000000000");
    expect(r.sock).toBe(false);
  });
});

describe("environment does not leak into the container", () => {
  const forbidden = () => [
    "DATABASE_URL",
    "AUTH_SECRET",
    "POSTGRES_PASSWORD",
    CANARY,
    process.env.AUTH_SECRET ?? "",
    process.env.DATABASE_URL ?? "",
    process.cwd(),
    "/Users/",
    "leet-copy",
  ].filter((s) => s.length > 0);

  it("python: /proc/1/environ, os.environ and mounts hold no secrets or project paths", { timeout: T }, async () => {
    const code = [
      "import json, os",
      "class Solution:",
      "    def probe(self, x):",
      "        return json.dumps({",
      "            'pid': os.getpid(),",
      "            'environ1': open('/proc/1/environ', 'rb').read().decode('utf-8', 'replace'),",
      "            'env': dict(os.environ),",
      "            'mounts': open('/proc/self/mountinfo').read(),",
      "            'cwd': os.getcwd(),",
      "        })",
      "",
    ].join("\n");
    const r = report(await run(probeJob("python", code)));
    expect(r.pid).toBe(1);
    expect(String(r.environ1)).toContain("PATH=");
    const text = JSON.stringify(r);
    for (const s of forbidden()) expect(text).not.toContain(s);
  });

  it("javascript: /proc/1/environ, process.env and mounts hold no secrets or project paths", { timeout: T }, async () => {
    const code = [
      "var probe = function (x) {",
      `  const p = ${JS_PROCESS};`,
      `  const fs = ${JS_REQUIRE}("fs");`,
      "  return JSON.stringify({ pid: p.pid, environ1: fs.readFileSync('/proc/1/environ', 'utf8'), env: p.env,",
      "    mounts: fs.readFileSync('/proc/self/mountinfo', 'utf8'), cwd: p.cwd(), argv: p.argv, execArgv: p.execArgv });",
      "};",
      "",
    ].join("\n");
    const r = report(await run(probeJob("javascript", code)));
    expect(r.pid).toBe(1);
    expect(String(r.environ1)).toContain("PATH=");
    const text = JSON.stringify(r);
    for (const s of forbidden()) expect(text).not.toContain(s);
  });
});
