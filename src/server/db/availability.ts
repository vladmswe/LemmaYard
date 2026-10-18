import { safeError } from "@/server/log";

/** Node/pg network errors: the database host cannot be reached at all. */
const NETWORK_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "ETIMEDOUT",
  "ECONNRESET",
  "EAI_AGAIN",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "EPIPE",
  "CERT_HAS_EXPIRED",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
]);

/** Postgres SQLSTATEs that mean "the service/database cannot serve requests right now". */
const SQLSTATES = new Set([
  "28000", // invalid authorization specification
  "28P01", // invalid password
  "3D000", // database does not exist
  "42P01", // relation does not exist (schema not created yet)
  "53300", // too many connections
  "57P01", // admin shutdown
  "57P02", // crash shutdown
  "57P03", // cannot connect now
]);

const MESSAGE_HINTS = [
  /invalid environment variables/i,
  /connection terminated/i,
  /timeout exceeded when trying to connect/i,
  /tenant or user not found/i,
  /server closed the connection/i,
  /ssl.*required|no pg_hba\.conf entry/i,
];

/**
 * True when a failure means the database is unreachable, misconfigured or not
 * set up yet (as opposed to a bug or a constraint violation). Routes answer
 * those with 503 and a plain message instead of a vague 500.
 */
export function isDatabaseUnavailable(error: unknown): boolean {
  const { code, message } = safeError(error);
  if (code) {
    if (NETWORK_CODES.has(code) || SQLSTATES.has(code)) return true;
    if (code.startsWith("08")) return true; // connection exception class
  }
  return MESSAGE_HINTS.some((re) => re.test(message));
}

export const DATABASE_UNAVAILABLE_MESSAGE =
  "The service is temporarily unavailable. Please try again in a few minutes.";
