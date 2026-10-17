// Pure naming logic for the per-worktree integration test database.

export const TEST_DB_PREFIX = "leetcopy_test_";

/** Lowercase, `[a-z0-9_]` only, at most 40 chars (Postgres names are ≤ 63). */
export function sanitizeSuffix(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return cleaned || "default";
}

export function testDatabaseName(suffix: string): string {
  return TEST_DB_PREFIX + sanitizeSuffix(suffix);
}

/** Same server and credentials as `baseUrl`, database replaced by `dbName`. */
export function withDatabase(baseUrl: string, dbName: string): string {
  const url = new URL(baseUrl);
  url.pathname = `/${dbName}`;
  return url.toString();
}
