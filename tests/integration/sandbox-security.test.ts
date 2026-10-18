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

describe("environment does not leak into the container", () => {
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

// ------------------------------------------------------------------- Java
// The same probes for the Java image. `javaProbe` wraps a body of
// `public String probe(int x) throws Exception` with small JSON helpers.
const JAVA_HELPERS = String.raw`
    static String q(Object v) {
        if (v == null) return "null";
        if (v instanceof Number || v instanceof Boolean) return v.toString();
        StringBuilder b = new StringBuilder("\"");
        for (char c : v.toString().toCharArray()) {
            if (c == '"' || c == '\\') b.append('\\').append(c);
            else if (c < 0x20 || c > 0x7e) b.append(String.format("\\u%04x", (int) c));
            else b.append(c);
        }
        return b.append('"').toString();
    }
    static String obj(Object... kv) {
        StringBuilder b = new StringBuilder("{");
        for (int i = 0; i < kv.length; i += 2) {
            if (i > 0) b.append(',');
            b.append(q(kv[i])).append(':').append(q(kv[i + 1]));
        }
        return b.append('}').toString();
    }
    static String attempt(String path, int size) {
        try {
            Files.write(Path.of(path), new byte[size]);
            return "ok";
        } catch (Exception e) {
            return e.getClass().getSimpleName() + ": " + e.getMessage();
        }
    }
`;

function javaProbe(body: string, extra = ""): string {
  return [
    "import java.io.*;",
    "import java.nio.file.*;",
    "import java.util.*;",
    "",
    "class Solution {",
    JAVA_HELPERS,
    extra,
    "    public String probe(int x) throws Exception {",
    body,
    "    }",
    "}",
    "",
  ].join("\n");
}

describe("java sandbox", () => {
  it("TCP connect to 1.1.1.1 fails → runtime_error", { timeout: T }, async () => {
    const code = javaProbe(
      '        new java.net.Socket().connect(new java.net.InetSocketAddress("1.1.1.1", 80), 3000);\n        return "connected";',
    );
    const r = await run(probeJob("java", code));
    expect(r.status).toBe("runtime_error");
    expect(r.error).toMatch(/java\.net\.(SocketException|NoRouteToHostException|ConnectException)/);
  });

  it("DNS resolution fails", { timeout: T }, async () => {
    // Java's resolver retries for a while, so the probe bounds the lookup itself.
    const code = javaProbe(
      [
        "        java.util.concurrent.FutureTask<String> lookup = new java.util.concurrent.FutureTask<>(",
        '            () -> java.net.InetAddress.getByName("example.com").getHostAddress());',
        "        Thread t = new Thread(lookup);",
        "        t.setDaemon(true);",
        "        t.start();",
        "        try {",
        '            return obj("resolved", lookup.get(1500, java.util.concurrent.TimeUnit.MILLISECONDS));',
        "        } catch (java.util.concurrent.TimeoutException e) {",
        '            return obj("failed", "timeout");',
        "        } catch (java.util.concurrent.ExecutionException e) {",
        '            return obj("failed", e.getCause().getClass().getName());',
        "        }",
      ].join("\n"),
    );
    const r = report(await run(probeJob("java", code)));
    expect(r.resolved).toBeUndefined();
    expect(r.failed).toMatch(/timeout|UnknownHostException/);
  });

  it("/ and /sandbox are not writable, /tmp takes up to 16 MB and is noexec", { timeout: T }, async () => {
    const code = javaProbe(
      [
        '        String root = attempt("/x", 10);',
        '        String sandbox = attempt("/sandbox/x", 10);',
        '        String runner = attempt("/sandbox/harness.jar", 10);',
        '        String tmp15 = attempt("/tmp/a", 15 * 1024 * 1024);',
        '        Files.delete(Path.of("/tmp/a"));',
        '        String tmp17 = attempt("/tmp/b", 17 * 1024 * 1024);',
        '        Files.deleteIfExists(Path.of("/tmp/b"));',
        '        Path script = Path.of("/tmp/s.sh");',
        '        Files.writeString(script, "#!/bin/sh\\necho hi\\n");',
        "        script.toFile().setExecutable(true);",
        "        String tmpExec;",
        "        try {",
        '            new ProcessBuilder("/tmp/s.sh").start().waitFor();',
        '            tmpExec = "ok";',
        "        } catch (IOException e) {",
        "            tmpExec = e.getMessage();",
        "        }",
        '        return obj("root", root, "sandbox", sandbox, "runner", runner, "tmp15", tmp15, "tmp17", tmp17, "tmpExec", tmpExec);',
      ].join("\n"),
    );
    const r = report(await run(probeJob("java", code)));
    for (const key of ["root", "sandbox", "runner"]) {
      expect(String(r[key])).toMatch(/Read-only file system|AccessDenied|Permission denied/);
    }
    expect(r.tmp15).toBe("ok");
    expect(r.tmp17).toMatch(/No space left on device/);
    expect(r.tmpExec).toMatch(/Permission denied/);
  });

  it("the pids limit stops process spawning", { timeout: T }, async () => {
    const code = javaProbe(
      [
        "        List<Process> procs = new ArrayList<>();",
        "        String error = null;",
        "        try {",
        '            for (int i = 0; i < 200; i++) procs.add(new ProcessBuilder("sleep", "30").start());',
        "        } catch (Throwable e) {",
        '            error = e.getClass().getSimpleName() + ": " + e.getMessage();',
        "        }",
        "        for (Process p : procs) p.destroyForcibly();",
        '        return obj("spawned", procs.size(), "error", error);',
      ].join("\n"),
    );
    const r = report(await run(probeJob("java", code, 256)));
    // Every child also costs the JVM a reaper thread, so far fewer than 64 fit.
    expect(r.error).toBeTruthy();
    expect(r.spawned).toBeGreaterThan(5);
    expect(r.spawned).toBeLessThan(64);
    expect(sandboxContainers()).toEqual([]);
  });

  it("uid is 65534, CapEff is 0, no new privileges, no docker.sock", { timeout: T }, async () => {
    const code = javaProbe(
      [
        '        String status = Files.readString(Path.of("/proc/self/status"));',
        "        String uid = null, cap = null, nnp = null;",
        '        for (String line : status.split("\\n")) {',
        '            String[] f = line.trim().split("\\\\s+");',
        '            if (line.startsWith("Uid:")) uid = f[1];',
        '            if (line.startsWith("CapEff:")) cap = f[1];',
        '            if (line.startsWith("NoNewPrivs:")) nnp = f[1];',
        "        }",
        '        boolean sock = Files.exists(Path.of("/var/run/docker.sock")) || Files.exists(Path.of("/run/docker.sock"));',
        '        return obj("uid", uid, "capEff", cap, "noNewPrivs", nnp, "sock", sock, "pid", ProcessHandle.current().pid());',
      ].join("\n"),
    );
    const r = report(await run(probeJob("java", code)));
    expect(r.uid).toBe("65534");
    expect(r.capEff).toBe("0000000000000000");
    expect(r.noNewPrivs).toBe("1");
    expect(r.sock).toBe(false);
    expect(r.pid).toBe(1);
  });

  it("/proc/1/environ, System.getenv(), mounts and the JVM command line hold no secrets or project paths", { timeout: T }, async () => {
    const code = javaProbe(
      [
        '        String environ1 = new String(Files.readAllBytes(Path.of("/proc/1/environ")));',
        '        String cmdline = new String(Files.readAllBytes(Path.of("/proc/self/cmdline"))).replace((char) 0, (char) 32);',
        '        String mounts = Files.readString(Path.of("/proc/self/mountinfo"));',
        '        return obj("environ1", environ1, "env", System.getenv().toString(), "mounts", mounts,',
        '            "cwd", System.getProperty("user.dir"), "cmdline", cmdline, "props", System.getProperties().toString());',
      ].join("\n"),
    );
    const r = report(await run(probeJob("java", code)));
    expect(String(r.environ1)).toContain("PATH=");
    expect(r.cwd).toBe("/tmp");
    const text = JSON.stringify(r);
    for (const s of forbidden()) expect(text).not.toContain(s);
  });

  // The payload never carries expected values, so they are nowhere in the
  // container. The probe scans its own process memory (/proc/self/mem) for
  // the expected value of the test it runs in. Each needle is kept shifted by
  // one (every byte + 1) and compared as `memory byte + 1`, so the plain text
  // never exists in the probe's own memory: only the payload could put it
  // there. A token from a comment in the code (which IS in the payload) is the
  // positive control; a needle that occurs nowhere is the negative one.
  it("user code cannot find the expected value in its own memory", { timeout: T }, async () => {
    const shifted = (text: string) => [...text].map((c) => String.fromCharCode(c.charCodeAt(0) + 1)).join("");
    const scan = String.raw`
    static int count(String shiftedNeedle) throws IOException {
        byte[] needle = shiftedNeedle.getBytes(java.nio.charset.StandardCharsets.ISO_8859_1);
        int found = 0;
        try (RandomAccessFile mem = new RandomAccessFile("/proc/self/mem", "r")) {
            for (String line : Files.readAllLines(Path.of("/proc/self/maps"))) {
                String[] f = line.trim().split("\\s+");
                String path = f.length > 5 ? f[5] : "";
                if (!f[1].startsWith("r") || !(path.isEmpty() || path.startsWith("[heap") || path.startsWith("[stack"))) continue;
                String[] range = f[0].split("-");
                long start = Long.parseUnsignedLong(range[0], 16), end = Long.parseUnsignedLong(range[1], 16);
                byte[] buf = new byte[1 << 20];
                int carry = 0;
                for (long at = start; at < end; ) {
                    int want = (int) Math.min(buf.length - carry, end - at);
                    int n;
                    try {
                        mem.seek(at);
                        n = mem.read(buf, carry, want);
                    } catch (IOException e) {
                        break;
                    }
                    if (n <= 0) break;
                    int len = carry + n;
                    for (int i = 0; i + needle.length <= len; i++) {
                        int k = 0;
                        while (k < needle.length && (byte) (buf[i + k] + 1) == needle[k]) k++;
                        if (k == needle.length) found++;
                    }
                    carry = Math.min(needle.length - 1, len);
                    System.arraycopy(buf, len - carry, buf, 0, carry);
                    at += n;
                }
            }
        }
        return found;
    }
`;
    const code = javaProbe(
      [
        "        // zq-code-mark-4471 (a token of the payload: the positive control)",
        `        int expected = count("${shifted("zq-expected-canary-77")}");`,
        `        int control = count("${shifted("zq-control-canary-77")}");`,
        `        int code = count("${shifted("zq-code-mark-4471")}");`,
        "        int stdin = System.in.read();",
        '        return obj("expected", expected, "control", control, "code", code, "stdin", stdin);',
      ].join("\n"),
      scan,
    );
    const job = {
      ...probeJob("java", code, 256),
      limits: { timeMs: 10_000, memoryMb: 256 },
      tests: [{ input: { x: 1 }, expected: "zq-expected-canary-77" }],
    };
    const r = await run(job);
    expect(r.status, r.error ?? "").toBe("wrong_answer");
    const seen = JSON.parse(r.caseResults[0].actual as string) as Record<string, number>;
    expect(seen.code).toBeGreaterThan(0);
    expect(seen.control).toBe(0);
    expect(seen.expected).toBe(0);
    expect(seen.stdin).toBe(-1);
  });
});
