// Design v2 phase 2A (DESIGN.md §13.3–13.7): the catalog, a problem page,
// the submissions list, a submission page and a profile. Axe (WCAG 2.1
// A/AA, serious + critical) on the whole page, no horizontal scroll at
// 390 and 1440, the forced theme, reduced motion ending in final states,
// and mocked console states. Finished submissions are inserted straight
// into the web server's database (like tests/e2e/history), so no judge is
// needed; the p2a-e2e users are deleted afterwards.
import { randomUUID } from "node:crypto";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { Pool } from "pg";

import { forcedTheme } from "../../../src/lib/theme-config";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const created: string[] = [];
let state: { username: string; storage: Awaited<ReturnType<ReturnType<Page["context"]>["storageState"]>>; wa: string } | null = null;

async function expectAxeClean(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const bad = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

async function insert(userId: string, slug: string, status: string, minutesAgo: number, extra: Record<string, unknown> = {}) {
  const row: Record<string, unknown> = {
    user_id: userId,
    kind: "submit",
    language: "python",
    code: "class Solution:\n    pass\n",
    status,
    runtime_ms: 40,
    memory_kb: 16_000,
    passed_count: status === "accepted" ? 10 : 3,
    total_count: 10,
    created_at: new Date(Date.now() - minutesAgo * 60_000),
    finished_at: new Date(),
    ...extra,
  };
  const cols = Object.keys(row);
  const values = Object.values(row).map((v) => (v && typeof v === "object" && !(v instanceof Date) ? JSON.stringify(v) : v));
  const { rows } = await pool.query<{ id: string }>(
    `insert into submissions (problem_id, ${cols.join(", ")})
     select p.id, ${cols.map((_, i) => `$${i + 2}`).join(", ")} from problems p where p.slug = $1 and p.published
     returning id`,
    [slug, ...values],
  );
  expect(rows).toHaveLength(1);
  return rows[0].id;
}

/** One signed-in user with a few finished submits, shared by the tests (registered once). */
async function seeded(browser: Browser) {
  if (state) return state;
  const context = await browser.newContext();
  const page = await context.newPage();
  const username = `p2a_e2e_${randomUUID().slice(0, 8)}`;
  await page.goto("/register");
  const status = await page.evaluate(
    async (u) =>
      (
        await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: `p2a-${u}@example.test`, username: u, password: "e2e-password-123" }),
        })
      ).status,
    username,
  );
  expect(status).toBe(201);
  const { rows } = await pool.query<{ id: string }>("select id from users where username = $1", [username]);
  const id = rows[0].id;
  created.push(id);
  const wa = await insert(id, "two-sum", "wrong_answer", 30, {
    failed_case: { input: { nums: [3, 3], target: 6 }, expected: [0, 1], actual: [0, 0] },
  });
  await insert(id, "two-sum", "accepted", 10);
  await insert(id, "valid-parentheses", "runtime_error", 60, { error: "IndexError: pop from empty list" });
  state = { username, storage: await context.storageState(), wa };
  await context.close();
  return state;
}

test.afterAll(async () => {
  if (created.length) await pool.query("delete from users where id = any($1::uuid[])", [created]);
  await pool.end();
});

/** Reduced motion, every scroll reveal shown, then back to the top. */
async function settle(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 30));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(150);
}

const PAGES: { name: string; path: (s: { username: string; wa: string }) => string; ready?: string }[] = [
  { name: "catalog", path: () => "/problems", ready: '[data-testid="catalog-row"], [data-testid="catalog-card"]' },
  { name: "problem", path: () => "/problems/two-sum", ready: "h1" },
  { name: "submissions", path: () => "/submissions", ready: '[data-testid="submission-row"], [data-testid="submission-card"]' },
  { name: "submission", path: (s) => `/submissions/${s.wa}`, ready: '[data-testid="verdict-card"]' },
  { name: "profile", path: (s) => `/u/${s.username}`, ready: '[data-testid="profile-stats"]' },
];

test.describe("product pages", () => {
  test.use({ colorScheme: (forcedTheme ?? "dark") as "light" | "dark" });

  for (const width of [390, 1440]) {
    for (const p of PAGES) {
      test(`${p.name} at ${width}px: axe clean, no horizontal scroll, forced theme, final motion states`, async ({ browser }) => {
        const s = await seeded(browser);
        const context = await browser.newContext({
          storageState: s.storage,
          viewport: { width, height: 900 },
          colorScheme: (forcedTheme ?? "dark") as "light" | "dark",
          reducedMotion: "reduce",
        });
        const page = await context.newPage();
        await page.goto(p.path(s));
        if (p.ready) await expect(page.locator(p.ready).filter({ visible: true }).first()).toBeVisible({ timeout: 30_000 });
        await settle(page);
        if (forcedTheme) await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${forcedTheme}\\b`));
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow).toBeLessThanOrEqual(0);
        await page.waitForTimeout(300);
        const motion = await page.evaluate(() => ({
          // Loaders are the only loops allowed; under reduced motion they are static too.
          running: document
            .getAnimations()
            .filter((a) => a.playState === "running")
            .map((a) => `${(a as CSSAnimation).animationName ?? "transition"} on ${(a.effect as KeyframeEffect | null)?.target?.className}`),
          hiddenReveals: [...document.querySelectorAll(".rv")].filter((el) => getComputedStyle(el).opacity !== "1").map((el) => el.className),
        }));
        expect(motion).toEqual({ running: [], hiddenReveals: [] });
        await expectAxeClean(page);
        await context.close();
      });
    }
  }

  test("profile renders final numbers on the server", async ({ browser, request }) => {
    const s = await seeded(browser);
    const html = await (await request.get(`/u/${s.username}`)).text();
    // Count-ups start from the real value (1 solved, 3 counted submits, 33.3%).
    expect(html).toMatch(/Solved<\/dt><dd[^>]*><span[^>]*>1<\/span>/);
    expect(html).toContain("33.3");
  });

  test("console: mocked Wrong Answer shows the v2 verdict row, squares and failed case", async ({ browser }) => {
    const s = await seeded(browser);
    const context = await browser.newContext({ storageState: s.storage, viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const id = randomUUID();
    const now = new Date().toISOString();
    await page.route(/\/api\/problems\/two-sum\/submit$/, (r) => r.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ id }) }));
    await page.route(new RegExp(`/api/submissions/${id}$`), (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id, kind: "submit", status: "wrong_answer", language: "python", problem: { slug: "two-sum", title: "Two Sum" },
          passedCount: 7, totalCount: 15, runtimeMs: 41, memoryKb: 16400, error: null, stdout: null,
          failedCase: { input: { nums: [3, 3], target: 6 }, expected: [0, 1], actual: [0, 0] }, createdAt: now, finishedAt: now,
        }),
      }),
    );
    await page.goto("/problems/two-sum");
    await expect(page.locator('[data-testid="code-editor"] .view-lines')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId("submit-button").click();
    const result = page.getByTestId("submit-result");
    await expect(result.getByRole("heading", { name: "Wrong Answer" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("result-summary")).toHaveText("7/15 tests passed");
    await expect(result.locator(".test-squares > i")).toHaveCount(15);
    await expect(result.locator('.test-squares > i[data-state="fail"]')).toHaveCount(1);
    await expect(page.getByTestId("failed-output")).toHaveText("[0, 0]");
    await settle(page);
    await expectAxeClean(page);
    await context.close();
  });
});
