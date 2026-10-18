// Pure parts of the worker: ExecResult → submission columns, log-safe error
// text, per-worker container labels.
import { DrizzleQueryError } from "drizzle-orm/errors";
import { describe, expect, it } from "vitest";

import { parseEnv } from "@/server/env";

import {
  buildCreateArgs,
  buildSandboxPayload,
  defaultSandboxNamespace,
  dockerConfigFromEnv,
  effectiveTimeLimitMs,
  imageFor,
  namespaceFilterArgs,
  sandboxCommand,
  sandboxImages,
} from "../../worker/docker-executor";
import { safeErrorMessage } from "../../worker/loop";
import { sanitizeValue, TOO_DEEP } from "../../worker/judge";
import { toFinalFields } from "../../worker/queue";
import type { ExecResult } from "../../worker/types";

const base: ExecResult = {
  status: "wrong_answer",
  passedCount: 1,
  totalCount: 3,
  runtimeMs: 7.6,
  memoryKb: 17_000,
  failedTestIndex: 1,
  failedCase: { input: { x: 1 }, expected: 1, actual: 2 },
  caseResults: [
    { index: 0, status: "passed", input: { x: 0 }, expected: 0, actual: 0 },
    { index: 1, status: "failed", input: { x: 1 }, expected: 1, actual: 2 },
    { index: 2, status: "not_run", input: { x: 2 }, expected: 2 },
  ],
  stdout: "out",
  error: null,
};

describe("toFinalFields", () => {
  it("submit: failed_case for wrong_answer, no case_results", () => {
    const f = toFinalFields("submit", base);
    expect(f).toMatchObject({ status: "wrong_answer", passedCount: 1, totalCount: 3, failedTestIndex: 1, runtimeMs: 8 });
    expect(f.failedCase).toEqual(base.failedCase);
    expect(f.caseResults).toBeNull();
  });

  it("submit: no failed_case for other verdicts", () => {
    expect(toFinalFields("submit", { ...base, status: "runtime_error" }).failedCase).toBeNull();
  });

  it("run: case_results, never failed_case", () => {
    const f = toFinalFields("run", base);
    expect(f.failedCase).toBeNull();
    expect(f.caseResults).toEqual(base.caseResults);
  });

  it("keeps values inside the DB CHECK constraints", () => {
    const f = toFinalFields("submit", {
      ...base,
      status: "time_limit",
      passedCount: 9,
      failedTestIndex: 3,
      runtimeMs: -1,
      memoryKb: Number.NaN,
    });
    expect(f.passedCount).toBe(3);
    expect(f.failedTestIndex).toBeNull();
    expect(f.runtimeMs).toBe(0);
    expect(f.memoryKb).toBeNull();
  });
});

describe("sanitizeValue", () => {
  it("replaces U+0000 and lone surrogates in nested strings and keys", () => {
    const value = { "a\u0000": ["x\u0000", 1, null, { y: "\uD800z\uDC00" }], ok: "😀" };
    expect(sanitizeValue(value)).toEqual({
      "a�": ["x�", 1, null, { y: "�z�" }],
      ok: "😀",
    });
  });

  it("replaces subtrees nested deeper than 64 levels", () => {
    let deep: unknown = 1;
    for (let i = 0; i < 100_000; i++) deep = [deep];
    let out = sanitizeValue(deep);
    let depth = 0;
    while (Array.isArray(out)) {
      out = out[0];
      depth++;
    }
    expect(depth).toBe(64);
    expect(out).toBe(TOO_DEEP);
  });
});

describe("safeErrorMessage", () => {
  it("drops the SQL params (user code) of Drizzle query errors", () => {
    const error = new DrizzleQueryError("update submissions set code = $1", ["SECRET_CODE"], new Error("connection refused"));
    expect(safeErrorMessage(error)).toBe("database: connection refused");
    const noCause = new DrizzleQueryError("update submissions set code = $1", ["SECRET_CODE"]);
    expect(safeErrorMessage(noCause)).toBe("database query failed");
  });

  it("keeps the first line of other errors", () => {
    expect(safeErrorMessage(new Error("boom\nsecond line"))).toBe("boom");
  });
});

describe("sandbox stdin payload", () => {
  it("carries inputs only: expected values never enter the container", () => {
    const payload = buildSandboxPayload(
      {
        language: "python",
        code: "class Solution: ...",
        signature: { name: "solve", params: [{ name: "x", type: "int" }], returns: "string" },
        compare: { mode: "exact" },
        limits: { timeMs: 1000, memoryMb: 128 },
        tests: [
          { input: { x: 1 }, expected: "EXPECTED_MARKER_1" },
          { input: { x: 2 }, expected: "EXPECTED_MARKER_2" },
        ],
        stopOnFirstFailure: true,
      },
      2000,
      "nonce",
    );
    const line = JSON.stringify(payload);
    expect(line).not.toContain("EXPECTED_MARKER");
    expect(line).not.toContain("expected");
    expect(payload.tests).toEqual([{ input: { x: 1 } }, { input: { x: 2 } }]);
    expect(Object.keys(payload).sort()).toEqual(
      ["code", "language", "nonce", "signature", "stopOnError", "tests", "timeLimitMs"].sort(),
    );
  });
});

describe("worker container labels", () => {
  it("adds the namespace and extra labels after the sandbox label, before the image", () => {
    const args = buildCreateArgs("img:tag", 256, sandboxCommand("python", 256), "ns1", ["lemmayard.worker=w1"]);
    const joined = args.join(" ");
    expect(joined).toContain("--label lemmayard.sandbox=1 --label lemmayard.ns=ns1 --label lemmayard.worker=w1");
    expect(args.indexOf("img:tag")).toBeGreaterThan(args.indexOf("lemmayard.worker=w1"));
  });
});

describe("sandbox namespace", () => {
  it("defaults to the checkout directory name plus a hash of its path", () => {
    const a = defaultSandboxNamespace("/work/My Checkout");
    expect(a).toMatch(/^my-checkout-[0-9a-f]{8}$/);
    expect(defaultSandboxNamespace("/work/My Checkout")).toBe(a);
    // Same directory name in another place (another worktree root) → another namespace.
    expect(defaultSandboxNamespace("/other/My Checkout")).not.toBe(a);
  });

  it("SANDBOX_NAMESPACE wins over the default and is validated", () => {
    const env = parseEnv({ DATABASE_URL: "postgres://u:p@localhost:5433/db", AUTH_SECRET: "x".repeat(32), SANDBOX_NAMESPACE: "run-1" });
    expect(dockerConfigFromEnv(env).namespace).toBe("run-1");
    const unset = parseEnv({ DATABASE_URL: "postgres://u:p@localhost:5433/db", AUTH_SECRET: "x".repeat(32) });
    expect(dockerConfigFromEnv(unset).namespace).toBe(defaultSandboxNamespace());
    expect(() =>
      parseEnv({ DATABASE_URL: "postgres://u:p@localhost:5433/db", AUTH_SECRET: "x".repeat(32), SANDBOX_NAMESPACE: "a b" }),
    ).toThrow(/SANDBOX_NAMESPACE/);
  });

  it("Java: image, time multiplier and image list come from the env", () => {
    const env = parseEnv({
      DATABASE_URL: "postgres://u:p@localhost:5433/db",
      AUTH_SECRET: "x".repeat(32),
      SANDBOX_IMAGE_JAVA: "my-java:1",
      LANG_TIME_MULT_JAVA: "3",
    });
    const config = dockerConfigFromEnv(env);
    expect(imageFor("java", config)).toBe("my-java:1");
    expect(imageFor("python", config)).toBe(config.imagePython);
    expect(sandboxImages(config)).toEqual([config.imagePython, config.imageNode, "my-java:1"]);
    expect(effectiveTimeLimitMs("java", 1000, config)).toBe(3000);
    const defaults = dockerConfigFromEnv(
      parseEnv({ DATABASE_URL: "postgres://u:p@localhost:5433/db", AUTH_SECRET: "x".repeat(32) }),
    );
    expect(defaults.imageJava).toBe("lemmayard-sandbox-java:latest");
    expect(effectiveTimeLimitMs("java", 1000, defaults)).toBe(2000);
    expect(effectiveTimeLimitMs("javascript", 1000, defaults)).toBe(1000);
  });

  it("cleanup filters on both the sandbox and the namespace label", () => {
    expect(namespaceFilterArgs("ns1")).toEqual(["--filter", "label=lemmayard.sandbox=1", "--filter", "label=lemmayard.ns=ns1"]);
  });
});
