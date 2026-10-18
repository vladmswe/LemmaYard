import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { users } from "@/server/db/schema";

import { closeTestDb, createUser, getTestDb, resetTestDb } from "../helpers/db";

const APP_TABLES = [
  "problem_tags",
  "problems",
  "room_events",
  "room_members",
  "room_session_participants",
  "room_session_problems",
  "room_session_results",
  "room_sessions",
  "rooms",
  "study_plan_items",
  "study_plan_saves",
  "study_plan_sections",
  "study_plan_ticks",
  "study_plans",
  "submissions",
  "tags",
  "test_cases",
  "users",
];

beforeEach(resetTestDb);
afterAll(closeTestDb);

describe("row level security (migrations 0002, 0003)", () => {
  it("is enabled, without FORCE, on every table of the public schema", async () => {
    const { rows } = await getTestDb().execute<{ name: string; rls: boolean; force: boolean }>(sql`
      SELECT c.relname AS name, c.relrowsecurity AS rls, c.relforcerowsecurity AS force
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY c.relname
    `);
    expect(rows.map((r) => r.name)).toEqual(APP_TABLES);
    for (const row of rows) {
      expect(row, row.name).toMatchObject({ rls: true, force: false });
    }
  });

  it("defines no policies, so roles that do not own the tables are denied", async () => {
    const { rows } = await getTestDb().execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM pg_policies WHERE schemaname = 'public'`,
    );
    expect(rows[0].n).toBe(0);
  });

  it("still lets the app role (table owner) read and write", async () => {
    const db = getTestDb();
    const user = await createUser({ username: "rls_owner" });
    await db.update(users).set({ username: "rls_owner2" }).where(eq(users.id, user.id));
    const [row] = await db
      .select({ username: users.username })
      .from(users)
      .where(eq(users.id, user.id));
    expect(row.username).toBe("rls_owner2");
    await db.delete(users).where(eq(users.id, user.id));
    expect(await db.select().from(users)).toHaveLength(0);
  });
});
