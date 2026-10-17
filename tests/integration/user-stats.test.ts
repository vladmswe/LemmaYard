// Profile statistics through Drizzle on fixtures (AC-M6-4, AC-M6-5) and the
// landing card using the same helper.
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { Db } from "@/server/db";
import * as schema from "@/server/db/schema";

const state = vi.hoisted(() => ({ db: undefined as Db | undefined }));
vi.mock("@/server/db", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/server/db")>();
  return { ...mod, getDb: () => state.db! };
});

import { getLandingData } from "@/server/landing";
import { getProfileData } from "@/server/profile";
import { getUserStats } from "@/server/progress";

import {
  closeTestDb,
  createProblem,
  createSubmission,
  createUser,
  getTestDb,
  resetTestDb,
  testDbUrl,
} from "../helpers/db";

type Status = (typeof schema.submissionStatusEnum.enumValues)[number];
type Difficulty = "easy" | "medium" | "hard";

const CODE_MARKER = "SECRET_CODE_MARKER_m6";
const ids = new Map<string, string>();
let alice: { id: string };
let bob: { id: string };
let carol: { id: string };

const day = (n: number) => new Date(Date.UTC(2026, 8, n, 10));

async function sub(user: { id: string }, slug: string, status: Status, dayN: number, kind: "run" | "submit" = "submit") {
  await createSubmission({
    userId: user.id,
    problemId: ids.get(slug)!,
    kind,
    status,
    code: CODE_MARKER,
    createdAt: day(dayN),
    ...(status === "queued" ? {} : status === "running" ? { startedAt: new Date() } : { finishedAt: new Date() }),
  });
}

beforeAll(async () => {
  state.db = getTestDb();
  await resetTestDb();
  // Published: 5 easy, 4 medium, 3 hard (+ 2 unpublished).
  const fixtures: [string, Difficulty, boolean][] = [
    ...Array.from({ length: 5 }, (_, i) => [`easy-${i}`, "easy", true] as [string, Difficulty, boolean]),
    ...Array.from({ length: 4 }, (_, i) => [`medium-${i}`, "medium", true] as [string, Difficulty, boolean]),
    ...Array.from({ length: 3 }, (_, i) => [`hard-${i}`, "hard", true] as [string, Difficulty, boolean]),
    ["hidden-easy", "easy", false],
    ["hidden-hard", "hard", false],
  ];
  for (const [slug, difficulty, published] of fixtures) {
    const p = await createProblem({ slug, title: slug.toUpperCase(), difficulty, published });
    ids.set(slug, p.id);
  }
  alice = await createUser({ username: "alice" });
  bob = await createUser({ username: "bob" });
  carol = await createUser({ username: "carol" });

  // easy-0: WA then accepted twice (solved once, first accepted = day 2).
  await sub(alice, "easy-0", "wrong_answer", 1);
  await sub(alice, "easy-0", "accepted", 2);
  await sub(alice, "easy-0", "accepted", 9);
  // easy-1: accepted only as a run -> not solved, not counted.
  await sub(alice, "easy-1", "accepted", 3, "run");
  await sub(alice, "easy-1", "wrong_answer", 3, "run");
  // medium-0: accepted; plus an internal error and a pending job (not counted).
  await sub(alice, "medium-0", "accepted", 4);
  await sub(alice, "medium-0", "internal_error", 5);
  await sub(alice, "medium-1", "queued", 6);
  await sub(alice, "medium-1", "running", 6);
  // hard-0: TLE + runtime error, then accepted on day 7.
  await sub(alice, "hard-0", "time_limit", 6);
  await sub(alice, "hard-0", "runtime_error", 6);
  await sub(alice, "hard-0", "accepted", 7);
  // Unpublished: accepted -> ignored everywhere.
  await sub(alice, "hidden-hard", "accepted", 8);
  await sub(alice, "hidden-easy", "wrong_answer", 8);
  // Bob solved easy-2 (must not leak into alice's numbers).
  await sub(bob, "easy-2", "accepted", 1);
  // Carol: 12 problems solved on distinct days -> recently solved capped at 10.
  const all = [...ids.keys()].filter((s) => !s.startsWith("hidden"));
  for (const [i, slug] of all.entries()) await sub(carol, slug, "accepted", 10 + i);
});

afterAll(async () => {
  await resetTestDb();
  await closeTestDb();
});

describe("getUserStats (AC-M6-4, AC-M6-5)", () => {
  it("counts unique solved problems by difficulty, counted submits and acceptance", async () => {
    const stats = await getUserStats(alice.id, getTestDb());
    expect(stats.solved).toEqual({ easy: 1, medium: 1, hard: 1 });
    expect(stats.solvedTotal).toBe(3);
    // Counted submits on published problems: easy-0 ×3, medium-0 accepted, hard-0 ×3.
    expect(stats.submits).toBe(7);
    expect(stats.acceptance).toBeCloseTo(4 / 7);
  });

  it("lists recently solved unique problems with the date of the first accepted", async () => {
    const stats = await getUserStats(alice.id, getTestDb());
    expect(stats.recentSolved).toEqual([
      { slug: "hard-0", title: "HARD-0", difficulty: "hard", firstAcceptedAt: day(7) },
      { slug: "medium-0", title: "MEDIUM-0", difficulty: "medium", firstAcceptedAt: day(4) },
      { slug: "easy-0", title: "EASY-0", difficulty: "easy", firstAcceptedAt: day(2) },
    ]);
  });

  it("caps recently solved at 10, newest first", async () => {
    const stats = await getUserStats(carol.id, getTestDb());
    expect(stats.solvedTotal).toBe(12);
    expect(stats.recentSolved).toHaveLength(10);
    const times = stats.recentSolved.map((p) => p.firstAcceptedAt.getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    expect(stats.recentSolved[0].firstAcceptedAt).toEqual(day(21));
  });

  it("is empty for a user without submits", async () => {
    const dave = await createUser({ username: "dave" });
    expect(await getUserStats(dave.id, getTestDb())).toEqual({
      solved: { easy: 0, medium: 0, hard: 0 },
      solvedTotal: 0,
      submits: 0,
      acceptance: null,
      recentSolved: [],
    });
  });
});

describe("getProfileData", () => {
  it("adds the published totals per difficulty (unpublished excluded) and carries no code", async () => {
    const data = await getProfileData(alice.id, getTestDb());
    expect(data.totals).toEqual({ total: 12, byDifficulty: { easy: 5, medium: 4, hard: 3 } });
    expect(JSON.stringify(data)).not.toContain(CODE_MARKER);
  });
});

describe("landing progress = profile stats", () => {
  it("shows the same numbers as the profile for a signed-in user", async () => {
    const [landing, profile] = await Promise.all([getLandingData(alice.id), getProfileData(alice.id)]);
    expect(landing.progress).not.toBeNull();
    expect({
      solved: landing.progress!.solved,
      solvedTotal: landing.progress!.solvedTotal,
      submits: landing.progress!.submits,
      acceptance: landing.progress!.acceptance,
    }).toEqual({
      solved: profile.stats.solved,
      solvedTotal: profile.stats.solvedTotal,
      submits: profile.stats.submits,
      acceptance: profile.stats.acceptance,
    });
    expect(landing.stats).toEqual(profile.totals);
  });
});

describe("query budget", () => {
  it("stats: 1 query; profile data: 2", async () => {
    const pool = new Pool({ connectionString: testDbUrl() });
    const logged: string[] = [];
    const db = drizzle(pool, { schema, logger: { logQuery: (q) => logged.push(q) } });
    try {
      await getUserStats(alice.id, db);
      expect(logged).toHaveLength(1);
      logged.length = 0;
      await getProfileData(alice.id, db);
      expect(logged).toHaveLength(2);
      expect(logged.join("\n")).not.toMatch(/"code"/);
    } finally {
      await pool.end();
    }
  });
});
