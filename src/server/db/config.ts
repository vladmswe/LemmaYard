// Pure env -> `pg` Pool options mapping (no network, unit-tested).
//
// TLS modes (DATABASE_SSL):
// - `disable`:   plain TCP (local docker Postgres).
// - `require`:   TLS with full certificate verification against Node's CA
//                store, or against DATABASE_SSL_CA when it is set.
// - `no-verify`: TLS, but the server certificate is not verified. Traffic is
//                encrypted; an attacker who can intercept the connection could
//                impersonate the server. Default for remote hosts, because
//                Supabase's certificates are signed by Supabase's own root CA,
//                which is not in Node's store ("self-signed certificate in
//                certificate chain"). Supply that CA via DATABASE_SSL_CA to
//                get `require`.
//
// `sslmode` / `ssl` / `sslrootcert` / ... query parameters are removed from the
// URL before it reaches `pg`: `pg` lets URL parameters override the `ssl`
// option passed to the Pool, so `?sslmode=require` (as in many Supabase
// guides) would silently turn on strict verification and break the
// connection. When DATABASE_SSL is unset, the URL's `sslmode` is still
// honoured, mapped onto the three modes above.
import type { PoolConfig } from "pg";

export const DB_SSL_MODES = ["disable", "require", "no-verify"] as const;
export type DbSslMode = (typeof DB_SSL_MODES)[number];

export type DbConfigInput = {
  connectionString: string;
  ssl?: DbSslMode;
  /** PEM certificate(s); literal `\n` sequences are accepted for one-line env values. */
  sslCa?: string;
  poolMax?: number;
  /** True on Vercel (serverless): small pool, short idle timeout. */
  serverless?: boolean;
};

export type DbConfig = { pool: PoolConfig; sslMode: DbSslMode };

/** URL parameters that `pg` would use to override the `ssl` option. */
const SSL_URL_PARAMS = [
  "ssl",
  "sslmode",
  "sslrootcert",
  "sslcert",
  "sslkey",
  "sslnegotiation",
  "uselibpqcompat",
];

/** Hosts that get plain TCP by default: loopback and the docker compose service. */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "postgres", "host.docker.internal"]);

function sslModeFromUrl(params: URLSearchParams): DbSslMode | undefined {
  const sslmode = params.get("sslmode")?.toLowerCase();
  if (sslmode === "disable") return "disable";
  if (sslmode === "verify-full" || sslmode === "verify-ca") return "require";
  if (sslmode) return "no-verify"; // allow, prefer, require, no-verify: encrypted, unverified (libpq semantics)
  const ssl = params.get("ssl")?.toLowerCase();
  if (ssl === "0" || ssl === "false") return "disable";
  if (ssl) return "no-verify";
  return undefined;
}

function isLocalHost(url: URL): boolean {
  return LOCAL_HOSTS.has(url.hostname.toLowerCase());
}

/** Builds Pool options from the database settings. Throws only on an unparsable URL. */
export function buildDbConfig(input: DbConfigInput): DbConfig {
  const url = new URL(input.connectionString);
  const ca = input.sslCa?.replace(/\\n/g, "\n").trim() || undefined;

  const sslMode: DbSslMode =
    input.ssl ??
    (ca ? "require" : undefined) ??
    sslModeFromUrl(url.searchParams) ??
    (isLocalHost(url) ? "disable" : "no-verify");

  for (const param of SSL_URL_PARAMS) url.searchParams.delete(param);

  const ssl: PoolConfig["ssl"] =
    sslMode === "disable"
      ? false
      : sslMode === "no-verify"
        ? { rejectUnauthorized: false }
        : { rejectUnauthorized: true, ...(ca ? { ca } : {}) };

  const serverless = input.serverless ?? false;
  return {
    sslMode,
    pool: {
      connectionString: url.toString(),
      ssl,
      max: input.poolMax ?? (serverless ? 1 : 10),
      idleTimeoutMillis: serverless ? 5_000 : 30_000,
      connectionTimeoutMillis: 10_000,
    },
  };
}

/** Host, port, database and TLS mode of a connection string: safe to log (no user, no password). */
export function describeDbTarget(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    return `${url.hostname}:${url.port || "5432"}${url.pathname}`;
  } catch {
    return "<unparsable DATABASE_URL>";
  }
}
