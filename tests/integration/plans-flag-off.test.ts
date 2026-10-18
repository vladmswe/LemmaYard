// PLANS_ENABLED=0 (the default): every study plan route answers 404 before
// any other check and writes nothing; the plan pages are 404 too; the nav
// item and the add-to-plan entry points are hidden (unit test on
// visibleNavLinks; e2e in tests/e2e-judge-off for the rendered pages).
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/server/db";

const state = vi.hoisted(() => {
  process.env.PLANS_ENABLED = "0";
  return { db: undefined as Db | undefined, cookies: new Map<string, string>() };
});

vi.mock("@/server/db", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/server/db")>();
  return { ...mod, getDb: () => state.db! };
});
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (state.cookies.has(name) ? { name, value: state.cookies.get(name)! } : undefined),
  }),
}));

import PlanPage from "@/app/(site)/plans/[id]/page";
import PlansPage from "@/app/(site)/plans/page";
import { DELETE as deletePlanRoute, GET as getPlanRoute, PATCH as patchPlanRoute } from "@/app/api/plans/[id]/route";
import { POST as duplicateRoute } from "@/app/api/plans/[id]/duplicate/route";
import { PUT as tickRoute } from "@/app/api/plans/[id]/items/[itemId]/tick/route";
import { POST as addItemsRoute, PATCH as layoutRoute } from "@/app/api/plans/[id]/items/route";
import { PUT as saveRoute } from "@/app/api/plans/[id]/save/route";
import { POST as createSectionRoute } from "@/app/api/plans/[id]/sections/route";
import { POST as importRoute } from "@/app/api/plans/import/route";
import { GET as searchRoute } from "@/app/api/plans/problem-search/route";
import { GET as pickerRoute, POST as createRoute } from "@/app/api/plans/route";
import { SESSION_COOKIE } from "@/server/auth/cookie";
import { signSessionToken } from "@/server/auth/token";
import { studyPlans } from "@/server/db/schema";
import { getEnv } from "@/server/env";

import { closeTestDb, createUser, getTestDb, resetTestDb } from "../helpers/db";

const ORIGIN = new URL(getEnv().AUTH_URL).origin;

function req(method: string, path: string, body: unknown = {}) {
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify(body),
  });
}
const get = (path: string) => new Request(`${ORIGIN}${path}`);
const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });

beforeAll(() => {
  state.db = getTestDb();
});
beforeEach(resetTestDb);
afterAll(closeTestDb);

describe("PLANS_ENABLED=0", () => {
  it("every route answers 404 and nothing is written", async () => {
    expect(getEnv().PLANS_ENABLED).toBe("0");
    const user = await createUser();
    const [plan] = await getTestDb().insert(studyPlans).values({ ownerId: user.id, title: "Hidden", visibility: "public" }).returning();
    state.cookies.set(SESSION_COOKIE, await signSessionToken(user.id));
    const id = plan.id;
    const itemId = "00000000-0000-4000-8000-000000000000";
    const responses = await Promise.all([
      pickerRoute(get("/api/plans")),
      createRoute(req("POST", "/api/plans", { title: "New" })),
      getPlanRoute(get(`/api/plans/${id}`), params({ id })),
      patchPlanRoute(req("PATCH", `/api/plans/${id}`, { title: "x" }), params({ id })),
      deletePlanRoute(req("DELETE", `/api/plans/${id}`), params({ id })),
      addItemsRoute(req("POST", `/api/plans/${id}/items`, { items: [{ problemSlug: "two-sum" }] }), params({ id })),
      layoutRoute(req("PATCH", `/api/plans/${id}/items`, { unsectioned: [], sections: [] }), params({ id })),
      tickRoute(req("PUT", `/api/plans/${id}/items/${itemId}/tick`, { done: true }), params({ id, itemId })),
      createSectionRoute(req("POST", `/api/plans/${id}/sections`, { title: "S" }), params({ id })),
      saveRoute(req("PUT", `/api/plans/${id}/save`, { saved: true }), params({ id })),
      duplicateRoute(req("POST", `/api/plans/${id}/duplicate`), params({ id })),
      importRoute(req("POST", "/api/plans/import", { source: "room_session", sessionId: itemId })),
      searchRoute(get("/api/plans/problem-search?q=two")),
    ]);
    for (const res of responses) {
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Not found" });
    }
    const { rows } = await getTestDb().execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM study_plans`);
    expect(rows[0].n).toBe(1);
  });

  it("the pages are 404", async () => {
    await expect(PlansPage({ params: Promise.resolve({}), searchParams: Promise.resolve({}) } as never)).rejects.toThrow(
      /NEXT_HTTP_ERROR_FALLBACK;404/,
    );
    const user = await createUser();
    const [plan] = await getTestDb().insert(studyPlans).values({ ownerId: user.id, title: "Hidden", visibility: "public" }).returning();
    await expect(
      PlanPage({ params: Promise.resolve({ id: plan.id }), searchParams: Promise.resolve({}) } as never),
    ).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/);
  });
});
