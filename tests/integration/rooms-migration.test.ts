// AC-S-DB-1: migration 0003 applies on a fresh database and forward from
// 0002 with existing data; it is purely additive.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, describe, expect, it } from "vitest";

import { createDb } from "@/server/db";
import { MIGRATIONS_DIR } from "@/server/db/migrate";

import { testDbName, testDbUrl } from "../helpers/db";
import { withDatabase } from "../helpers/test-db-name";

// All migrations run, so the list includes later room tables (0005: room_external_problems).
const ROOM_TABLES = [
  "room_events",
  "room_external_problems",
  "room_members",
  "room_session_participants",
  "room_session_problems",
  "room_session_results",
  "room_sessions",
  "rooms",
];

const created: string[] = [];
const tmpDirs: string[] = [];

async function admin<T>(fn: (db: ReturnType<typeof createDb>["db"]) => Promise<T>): Promise<T> {
  const c = createDb(withDatabase(testDbUrl(), "postgres"));
  try {
    return await fn(c.db);
  } finally {
    await c.pool.end();
  }
}

/** A fresh, empty database named leetcopy_test_<suffix>_<tag>. */
async function freshDb(tag: string): Promise<string> {
  const name = `${testDbName()}_${tag}`.slice(0, 63);
  await admin(async (db) => {
    await db.execute(sql.raw(`DROP DATABASE IF EXISTS "${name}"`));
    await db.execute(sql.raw(`CREATE DATABASE "${name}"`));
  });
  created.push(name);
  return withDatabase(testDbUrl(), name);
}

/** Copy of drizzle/ whose journal stops after the first `count` migrations. */
function migrationsUpTo(count: number): string {
  const dir = mkdtempSync(path.join(tmpdir(), "rooms-mig-"));
  tmpDirs.push(dir);
  cpSync(MIGRATIONS_DIR, dir, { recursive: true });
  const journalPath = path.join(dir, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: unknown[] };
  journal.entries = journal.entries.slice(0, count);
  writeFileSync(journalPath, JSON.stringify(journal));
  return dir;
}

async function withDb<T>(url: string, fn: (db: ReturnType<typeof createDb>["db"]) => Promise<T>): Promise<T> {
  const c = createDb(url);
  try {
    return await fn(c.db);
  } finally {
    await c.pool.end();
  }
}

async function roomTables(db: ReturnType<typeof createDb>["db"]) {
  const { rows } = await db.execute<{ name: string; rls: boolean }>(sql`
    SELECT c.relname AS name, c.relrowsecurity AS rls FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'room%' ORDER BY c.relname`);
  return rows;
}

afterAll(async () => {
  await admin(async (db) => {
    for (const name of created) await db.execute(sql.raw(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`));
  });
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
});

describe("migration 0003_rooms", () => {
  it("is the fourth journal entry and only adds objects", () => {
    const journal = JSON.parse(readFileSync(path.join(MIGRATIONS_DIR, "meta", "_journal.json"), "utf8")) as {
      entries: { idx: number; tag: string }[];
    };
    // Later feature migrations (0004 Rooms v2, …) follow it.
    expect(journal.entries.slice(0, 4).map((e) => e.tag)).toEqual(["0000_init", "0001_review_checks_indexes", "0002_enable_rls", "0003_rooms"]);
    const migration = readFileSync(path.join(MIGRATIONS_DIR, "0003_rooms.sql"), "utf8");
    expect(migration).not.toMatch(/\bDROP\b/i);
    expect(migration).not.toMatch(/ALTER COLUMN/i);
    expect(migration.match(/CREATE TABLE/g)).toHaveLength(7);
    expect(migration.match(/CREATE TYPE/g)).toHaveLength(3);
    expect(migration.match(/ENABLE ROW LEVEL SECURITY/g)).toHaveLength(7);
    // The new submissions column is nullable without a default (no table rewrite).
    expect(migration).toContain(`ALTER TABLE "submissions" ADD COLUMN "room_session_id" uuid;`);
  });

  it("applies on a fresh database", async () => {
    const url = await freshDb("fresh");
    await withDb(url, async (db) => {
      await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
      const tables = await roomTables(db);
      expect(tables.map((t) => t.name)).toEqual(ROOM_TABLES);
      expect(tables.every((t) => t.rls)).toBe(true);
    });
  });

  it("applies forward from 0002 with existing data, which keeps working", async () => {
    const url = await freshDb("fwd");
    await withDb(url, async (db) => {
      await migrate(db, { migrationsFolder: migrationsUpTo(3) });
      expect(await roomTables(db)).toEqual([]);
      await db.execute(sql`
        WITH u AS (INSERT INTO users (email, username, password_hash) VALUES ('old@example.com', 'old_user', 'x') RETURNING id),
        p AS (INSERT INTO problems (number, slug, title, difficulty, description_md, signature, compare, time_limit_ms, memory_limit_mb, published)
              VALUES (1, 'two-sum', 'Two Sum', 'easy', 'd', '{}'::jsonb, '{}'::jsonb, 1000, 256, true) RETURNING id)
        INSERT INTO submissions (user_id, problem_id, kind, language, code, status, finished_at, started_at)
        SELECT u.id, p.id, 'submit', 'python', 'pass', 'accepted', now(), now() FROM u, p`);

      await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
      expect((await roomTables(db)).map((t) => t.name)).toEqual(ROOM_TABLES);
      const { rows } = await db.execute<{ n: number; with_session: number }>(sql`
        SELECT count(*)::int AS n, count(room_session_id)::int AS with_session FROM submissions`);
      expect(rows[0]).toEqual({ n: 1, with_session: 0 });
      // Re-running is a no-op.
      await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
      const { rows: applied } = await db.execute<{ n: number }>(
        sql`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`,
      );
      const journal = JSON.parse(readFileSync(path.join(MIGRATIONS_DIR, "meta", "_journal.json"), "utf8")) as { entries: unknown[] };
      expect(applied[0].n).toBe(journal.entries.length);
    });
  });
});
