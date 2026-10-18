// Real numbers of the v2 landing ledger and the login "Lemma of the day"
// (src/server/landing.ts): test-case range over published problems only, one
// published problem per UTC day.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { Db } from "@/server/db";

const state = vi.hoisted(() => ({ db: undefined as Db | undefined }));
vi.mock("@/server/db", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/server/db")>();
  return { ...mod, getDb: () => state.db! };
});

import { getLandingData, getLemmaOfTheDay, getTestRange, LANGUAGE_COUNT } from "@/server/landing";

import { closeTestDb, createProblem, createTestCases, getTestDb, resetTestDb } from "../helpers/db";

const DAY = 86_400_000;

beforeAll(async () => {
  state.db = getTestDb();
  await resetTestDb();
  const a = await createProblem({ number: 1, title: "Alpha", tags: ["array"] });
  const b = await createProblem({ number: 2, title: "Beta", difficulty: "hard" });
  const hidden = await createProblem({ number: 3, title: "Hidden", published: false });
  await createTestCases(a.id, 12);
  await createTestCases(b.id, 20);
  await createTestCases(hidden.id, 40);
});

afterAll(async () => {
  await closeTestDb();
});

describe("landing ledger", () => {
  it("counts test cases of published problems only", async () => {
    expect(await getTestRange(getTestDb())).toEqual({ min: 12, max: 20 });
    const data = await getLandingData(null);
    expect(data.tests).toEqual({ min: 12, max: 20 });
    expect(data.stats?.total).toBe(2);
  });

  it("knows all three languages", () => {
    expect(LANGUAGE_COUNT).toBe(3);
  });
});

describe("lemma of the day", () => {
  it("rotates through published problems by UTC day, with tags", async () => {
    const day0 = await getLemmaOfTheDay(new Date(0));
    const day1 = await getLemmaOfTheDay(new Date(DAY));
    const day2 = await getLemmaOfTheDay(new Date(2 * DAY));
    expect(day0).toMatchObject({ number: 1, title: "Alpha", difficulty: "easy", tags: ["array"] });
    expect(day1).toMatchObject({ number: 2, title: "Beta", difficulty: "hard", tags: [] });
    expect(day2?.number).toBe(1);
  });
});
