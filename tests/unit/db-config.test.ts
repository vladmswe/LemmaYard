import { describe, expect, it } from "vitest";

import { buildDbConfig, describeDbTarget } from "@/server/db/config";
import { parseEnv } from "@/server/env";
import { redact, safeError } from "@/server/log";

const LOCAL = "postgres://leetcopy:leetcopy@localhost:5433/leetcopy";
const POOLER =
  "postgresql://postgres.abcdefghijklmnop:s3cr%40t@aws-0-eu-central-1.pooler.supabase.com:6543/postgres";

const NO_VERIFY = { rejectUnauthorized: false };

describe("buildDbConfig: TLS", () => {
  it("disables TLS for local hosts by default", () => {
    for (const host of ["localhost", "127.0.0.1", "[::1]", "postgres"]) {
      const { sslMode, pool } = buildDbConfig({
        connectionString: `postgres://u:p@${host}:5432/db`,
      });
      expect(sslMode, host).toBe("disable");
      expect(pool.ssl, host).toBe(false);
    }
  });

  it("uses TLS without certificate verification for remote hosts by default", () => {
    const { sslMode, pool } = buildDbConfig({ connectionString: POOLER });
    expect(sslMode).toBe("no-verify");
    expect(pool.ssl).toEqual(NO_VERIFY);
  });

  it("verifies certificates with DATABASE_SSL=require", () => {
    const { pool } = buildDbConfig({ connectionString: POOLER, ssl: "require" });
    expect(pool.ssl).toEqual({ rejectUnauthorized: true });
  });

  it("verifies against DATABASE_SSL_CA, defaulting to require when a CA is given", () => {
    const ca = "-----BEGIN CERTIFICATE-----\\nMIIB\\n-----END CERTIFICATE-----";
    const { sslMode, pool } = buildDbConfig({ connectionString: POOLER, sslCa: ca });
    expect(sslMode).toBe("require");
    expect(pool.ssl).toEqual({
      rejectUnauthorized: true,
      ca: "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----",
    });
  });

  it("explicit DATABASE_SSL wins over the CA and the URL", () => {
    const { pool } = buildDbConfig({
      connectionString: `${POOLER}?sslmode=verify-full`,
      ssl: "no-verify",
      sslCa: "pem",
    });
    expect(pool.ssl).toEqual(NO_VERIFY);
    const local = buildDbConfig({ connectionString: LOCAL, ssl: "require" });
    expect(local.pool.ssl).toEqual({ rejectUnauthorized: true });
  });

  it.each([
    ["require", "no-verify"],
    ["prefer", "no-verify"],
    ["no-verify", "no-verify"],
    ["verify-ca", "require"],
    ["verify-full", "require"],
    ["disable", "disable"],
  ] as const)("maps URL sslmode=%s to %s when DATABASE_SSL is unset", (sslmode, expected) => {
    expect(buildDbConfig({ connectionString: `${POOLER}?sslmode=${sslmode}` }).sslMode).toBe(expected);
  });

  it("strips TLS parameters from the URL so pg cannot override the ssl option", () => {
    const { pool } = buildDbConfig({
      connectionString: `${POOLER}?sslmode=require&ssl=true&sslrootcert=/x.pem&uselibpqcompat=true&application_name=web`,
      ssl: "no-verify",
    });
    const url = new URL(pool.connectionString!);
    expect([...url.searchParams.keys()]).toEqual(["application_name"]);
    expect(pool.ssl).toEqual(NO_VERIFY);
  });

  it("keeps the URL otherwise intact (encoded password, no stray '?')", () => {
    const { pool } = buildDbConfig({ connectionString: `${POOLER}?sslmode=require` });
    expect(pool.connectionString).toBe(POOLER);
  });

  it("the resulting options really reach pg as no-verify, not strict", async () => {
    const { default: ConnectionParameters } = await import(
      // @ts-expect-error untyped internal module of pg
      "pg/lib/connection-parameters.js"
    );
    const { pool } = buildDbConfig({ connectionString: `${POOLER}?sslmode=require` });
    const params = new ConnectionParameters(pool);
    expect(params.ssl).toEqual(NO_VERIFY);
    expect(params.password).toBe("s3cr@t");
    expect(params.port).toBe(6543);
  });
});

describe("buildDbConfig: pool", () => {
  it("uses 10 connections and a 30 s idle timeout off Vercel", () => {
    const { pool } = buildDbConfig({ connectionString: LOCAL });
    expect(pool).toMatchObject({ max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000 });
  });

  it("uses 1 connection and a short idle timeout on Vercel", () => {
    const { pool } = buildDbConfig({ connectionString: POOLER, serverless: true });
    expect(pool).toMatchObject({ max: 1, idleTimeoutMillis: 5_000 });
  });

  it("DATABASE_POOL_MAX overrides the default", () => {
    expect(buildDbConfig({ connectionString: POOLER, serverless: true, poolMax: 3 }).pool.max).toBe(3);
  });
});

describe("env: database settings", () => {
  const required = { DATABASE_URL: LOCAL, AUTH_SECRET: "x".repeat(32) };

  it("parses the optional database variables", () => {
    const env = parseEnv({
      ...required,
      DATABASE_URL_DIRECT: POOLER.replace(":6543", ":5432"),
      DATABASE_SSL: "no-verify",
      DATABASE_POOL_MAX: "2",
      VERCEL: "1",
    });
    expect(env).toMatchObject({ DATABASE_SSL: "no-verify", DATABASE_POOL_MAX: 2, VERCEL: "1" });
  });

  it("rejects an unknown DATABASE_SSL value", () => {
    expect(() => parseEnv({ ...required, DATABASE_SSL: "verify" })).toThrow(/DATABASE_SSL/);
  });

  it("rejects an unencoded '#', '/' or '?' in the password without echoing the value", () => {
    for (const password of ["ab#cd", "ab/cd", "ab?cd"]) {
      const bad = `postgresql://postgres.ref:${password}@h.pooler.supabase.com:6543/postgres`;
      expect(() => parseEnv({ ...required, DATABASE_URL: bad })).toThrow(/DATABASE_URL/);
      try {
        parseEnv({ ...required, DATABASE_URL: bad });
      } catch (error) {
        expect((error as Error).message).not.toContain(password);
      }
    }
  });
});

describe("log redaction", () => {
  it("removes connection strings and password pairs", () => {
    const text = `cannot connect to ${POOLER} (password=hunter2)`;
    const out = redact(text);
    expect(out).not.toContain("s3cr");
    expect(out).not.toContain("hunter2");
    expect(out).toContain("[redacted-url]");
  });

  it("reports a Drizzle-wrapped error by its cause, without SQL or params", () => {
    const cause = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:1"), { code: "ECONNREFUSED" });
    const wrapped = Object.assign(new Error("Failed query: select * from users where email = $1\nparams: a@b.c"), {
      cause,
    });
    const safe = safeError(wrapped);
    expect(safe).toEqual({ name: "Error", code: "ECONNREFUSED", message: "connect ECONNREFUSED 127.0.0.1:1" });
  });

  it("falls back to the code for an empty AggregateError message", () => {
    const err = Object.assign(new AggregateError([], ""), { code: "ECONNREFUSED" });
    expect(safeError(err).message).toBe("ECONNREFUSED");
  });

  it("describes a target without user or password", () => {
    expect(describeDbTarget(POOLER)).toBe("aws-0-eu-central-1.pooler.supabase.com:6543/postgres");
  });
});
