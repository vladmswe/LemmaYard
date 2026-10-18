// Rooms v2 migration 0004 (docs/specs/rooms-v2.md §8, AC-V2-RAT-3): applies
// on a fresh database and forward from 0003 with data, is additive (columns,
// one enum, one partial index, no new table), marks finished history unrated,
// and its CHECKs hold.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createDb } from "@/server/db";
import { MIGRATIONS_DIR } from "@/server/db/migrate";

import { closeTestDb, createProblem, createUser, getTestDb, resetTestDb, testDbName, testDbUrl } from "../helpers/db";
import { createRoom, createRoomSession } from "../helpers/rooms";
import { withDatabase } from "../helpers/test-db-name";

const created: string[] = [];
const tmpDirs: string[] = [];
type Client = ReturnType<typeof createDb>["db"];

async function admin<T>(fn: (db: Client) => Promise<T>): Promise<T> {
  const c = createDb(withDatabase(testDbUrl(), "postgres"));
  try {
    return await fn(c.db);
  } finally {
    await c.pool.end();
  }
}

async function freshDb(tag: string): Promise<string> {
  const name = `${testDbName()}_${tag}`.slice(0, 63);
  await admin(async (db) => {
    await db.execute(sql.raw(`DROP DATABASE IF EXISTS "${name}"`));
    await db.execute(sql.raw(`CREATE DATABASE "${name}"`));
  });
  created.push(name);
  return withDatabase(testDbUrl(), name);
}

function migrationsUpTo(count: number): string {
  const dir = mkdtempSync(path.join(tmpdir(), "rooms-v2-mig-"));
  tmpDirs.push(dir);
  cpSync(MIGRATIONS_DIR, dir, { recursive: true });
  const journalPath = path.join(dir, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: unknown[] };
  journal.entries = journal.entries.slice(0, count);
  writeFileSync(journalPath, JSON.stringify(journal));
  return dir;
}

async function withDb<T>(url: string, fn: (db: Client) => Promise<T>): Promise<T> {
  const c = createDb(url);
  try {
    return await fn(c.db);
  } finally {
    await c.pool.end();
  }
}

async function columns(db: Client, table: string): Promise<string[]> {
  const { rows } = await db.execute<{ column_name: string }>(sql`
    SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ${table} ORDER BY column_name`);
  return rows.map((r) => r.column_name);
}

async function tables(db: Client) {
  const { rows } = await db.execute<{ name: string; rls: boolean }>(sql`
    SELECT c.relname AS name, c.relrowsecurity AS rls FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY c.relname`);
  return rows;
}

afterAll(async () => {
  await admin(async (db) => {
    for (const name of created) await db.execute(sql.raw(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`));
  });
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
  await closeTestDb();
});

describe("migration 0004_rooms_v2", () => {
  it("is the fifth journal entry and only adds columns, one enum, one partial index and CHECKs", () => {
    const journal = JSON.parse(readFileSync(path.join(MIGRATIONS_DIR, "meta", "_journal.json"), "utf8")) as {
      entries: { tag: string }[];
    };
    expect(journal.entries[4].tag).toBe("0004_rooms_v2");
    const migration = readFileSync(path.join(MIGRATIONS_DIR, "0004_rooms_v2.sql"), "utf8");
    expect(migration).not.toMatch(/\bDROP\b/i);
    expect(migration).not.toMatch(/ALTER COLUMN/i);
    expect(migration).not.toMatch(/CREATE TABLE/i);
    expect(migration.match(/CREATE TYPE/g)).toHaveLength(1);
    expect(migration.match(/CREATE INDEX/g)).toHaveLength(1);
    // Every new column is nullable or has a constant default (no table rewrite).
    for (const line of migration.split("\n").filter((l) => l.includes("ADD COLUMN"))) {
      expect(line).toMatch(/ADD COLUMN "\w+" ("?\w+"?|timestamp with time zone)( DEFAULT (0|true) NOT NULL)?;/);
    }
    expect(migration).toContain(`UPDATE "room_sessions" SET "rated" = false WHERE "status" IN ('finished', 'cancelled');`);
  });

  it("applies on a fresh database; every table still has RLS", async () => {
    const url = await freshDb("v2fresh");
    await withDb(url, async (db) => {
      await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
      expect(await columns(db, "room_members")).toEqual(
        expect.arrayContaining(["rating", "rated_pairs", "rated_sessions", "rating_source"]),
      );
      expect(await columns(db, "users")).toContain("leetcode_rating");
      expect(await columns(db, "problems")).toEqual(expect.arrayContaining(["author_rating", "rating_adjust"]));
      expect(await columns(db, "rooms")).toEqual(
        expect.arrayContaining(["description", "color", "presets", "default_preset_id", "schedule"]),
      );
      expect(await columns(db, "room_sessions")).toEqual(expect.arrayContaining(["rated", "rated_at"]));
      expect(await columns(db, "room_session_participants")).toEqual(expect.arrayContaining(["rating_at_start", "rating_delta"]));
      expect(await columns(db, "room_session_problems")).toEqual(expect.arrayContaining(["rating_at_start", "rating_delta"]));
      const all = await tables(db);
      // 13 after 0004; later feature migrations (community, …) add more.
      expect(all.length).toBeGreaterThanOrEqual(13);
      expect(all.every((t) => t.rls)).toBe(true);
    });
  });

  it("applies forward from 0003 with data: finished and cancelled sessions become unrated, open ones stay rated", async () => {
    const url = await freshDb("v2fwd");
    await withDb(url, async (db) => {
      await migrate(db, { migrationsFolder: migrationsUpTo(4) });
      await db.execute(sql`
        WITH u AS (INSERT INTO users (email, username, password_hash) VALUES ('old@example.com', 'old_user', 'x') RETURNING id),
        r AS (INSERT INTO rooms (name, created_by) SELECT 'Old room', id FROM u RETURNING id),
        m AS (INSERT INTO room_members (room_id, user_id, role) SELECT r.id, u.id, 'owner' FROM r, u RETURNING room_id)
        INSERT INTO room_sessions (room_id, status, settings, started_at, ends_at, ended_at, end_reason, duration_min, created_at)
        SELECT r.id, v.status::room_session_status, '{"tags":[],"mixMode":"suggested","mix":{"easy":1,"medium":2,"hard":1},"challenge":"balanced","avoidSolved":true}'::jsonb,
               v.started, v.started + interval '90 minutes', v.ended, v.reason, 90, now() - v.age
        FROM r, (VALUES
          ('finished', now() - interval '3 days', now() - interval '3 days' + interval '90 minutes', 'time', interval '3 days'),
          ('cancelled', NULL::timestamptz, now() - interval '2 days', 'cancelled', interval '2 days'),
          ('lobby', NULL::timestamptz, NULL::timestamptz, NULL, interval '1 hour')
        ) AS v(status, started, ended, reason, age)`);
      await db.execute(sql`UPDATE room_sessions SET ends_at = NULL WHERE started_at IS NULL`);
      await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
      const { rows } = await db.execute<{ status: string; rated: boolean; rated_at: string | null }>(
        sql`SELECT status, rated, rated_at FROM room_sessions ORDER BY status`,
      );
      // Enum order: lobby, live, finished, cancelled.
      expect(rows).toEqual([
        { status: "lobby", rated: true, rated_at: null },
        { status: "finished", rated: false, rated_at: null },
        { status: "cancelled", rated: false, rated_at: null },
      ]);
      const { rows: members } = await db.execute<{ rating: number | null; rated_pairs: number; rating_source: string | null }>(
        sql`SELECT rating, rated_pairs, rating_source FROM room_members`,
      );
      expect(members).toEqual([{ rating: null, rated_pairs: 0, rating_source: null }]);
      const { rows: room } = await db.execute<{ color: number; presets: unknown; schedule: unknown }>(sql`SELECT color, presets, schedule FROM rooms`);
      expect(room).toEqual([{ color: 0, presets: null, schedule: null }]);
    });
  });
});

describe("Rooms v2 CHECK constraints", () => {
  beforeAll(async () => {
    await resetTestDb();
  });
  beforeEach(async () => {
    await resetTestDb();
  });

  async function rejects(statement: ReturnType<typeof sql>, constraint: string) {
    await expect(getTestDb().execute(statement)).rejects.toMatchObject({ cause: { constraint } });
  }

  it("room_members: rating 400–3500, rating and source set together, rated counts consistent", async () => {
    const { room, owner } = await createRoom();
    const where = sql`WHERE room_id = ${room.id} AND user_id = ${owner.id}`;
    await getTestDb().execute(sql`UPDATE room_members SET rating = 1500, rating_source = 'default' ${where}`);
    await rejects(sql`UPDATE room_members SET rating = 399 ${where}`, "room_members_rating_range");
    await rejects(sql`UPDATE room_members SET rating = 3501 ${where}`, "room_members_rating_range");
    await rejects(sql`UPDATE room_members SET rating_source = NULL ${where}`, "room_members_rating_source");
    await rejects(sql`UPDATE room_members SET rated_sessions = 5, rated_pairs = 4 ${where}`, "room_members_rated_counts");
    await rejects(sql`UPDATE room_members SET rated_pairs = -1 ${where}`, "room_members_rated_counts");
  });

  it("problems, users, rooms and sessions", async () => {
    const p = await createProblem();
    await rejects(sql`UPDATE problems SET author_rating = 799 WHERE id = ${p.id}`, "problems_author_rating");
    await rejects(sql`UPDATE problems SET author_rating = 3001 WHERE id = ${p.id}`, "problems_author_rating");
    await rejects(sql`UPDATE problems SET rating_adjust = 201 WHERE id = ${p.id}`, "problems_rating_adjust");
    await rejects(sql`UPDATE problems SET rating_adjust = -201 WHERE id = ${p.id}`, "problems_rating_adjust");
    const u = await createUser();
    await rejects(sql`UPDATE users SET leetcode_rating = 4001 WHERE id = ${u.id}`, "users_leetcode_rating_range");
    await rejects(sql`UPDATE users SET leetcode_rating = -1 WHERE id = ${u.id}`, "users_leetcode_rating_range");
    const { room } = await createRoom();
    await rejects(sql`UPDATE rooms SET color = 8 WHERE id = ${room.id}`, "rooms_color");
    await rejects(sql`UPDATE rooms SET description = ${"x".repeat(201)} WHERE id = ${room.id}`, "rooms_description");
    await rejects(sql`UPDATE rooms SET description = ${"a\nb"} WHERE id = ${room.id}`, "rooms_description");
    await rejects(sql`UPDATE rooms SET presets = '{}'::jsonb WHERE id = ${room.id}`, "rooms_presets");
    await rejects(sql`UPDATE rooms SET presets = ${JSON.stringify([{ name: "x".repeat(5000) }])}::jsonb WHERE id = ${room.id}`, "rooms_presets");
    await rejects(sql`UPDATE rooms SET schedule = '[]'::jsonb WHERE id = ${room.id}`, "rooms_schedule");
    const live = await createRoomSession({ roomId: room.id, status: "live" });
    await rejects(sql`UPDATE room_sessions SET rated_at = now() WHERE id = ${live.id}`, "room_sessions_rated_at");
    const finished = await createRoomSession({ roomId: room.id, status: "finished", rated: false });
    await rejects(sql`UPDATE room_sessions SET rated_at = now() WHERE id = ${finished.id}`, "room_sessions_rated_at");
  });
});
