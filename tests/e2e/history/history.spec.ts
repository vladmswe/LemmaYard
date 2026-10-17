// Submission history and profile (M6) against the running app. Finished
// submissions are inserted straight into the web server's database
// (DATABASE_URL from .env), so no judge is needed. The test users are
// deleted afterwards (their submissions cascade).
import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const created: string[] = [];

async function register(page: Page, prefix: string) {
  const suffix = randomUUID().slice(0, 8);
  const username = `e2e_${prefix}_${suffix}`;
  await page.goto("/register");
  const status = await page.evaluate(
    async (u) =>
      (
        await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: `${u}@example.com`, username: u, password: "e2e-password-123" }),
        })
      ).status,
    username,
  );
  expect(status).toBe(201);
  const { rows } = await pool.query<{ id: string }>("select id from users where username = $1", [username]);
  created.push(rows[0].id);
  return { username, id: rows[0].id };
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
    passed_count: status === "accepted" ? 10 : 2,
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

test.afterAll(async () => {
  if (created.length) await pool.query("delete from users where id = any($1::uuid[])", [created]);
  await pool.end();
});

test("history, submission page, problem tab and profile", async ({ page }) => {
  const other = await register(page, "m6o");
  const otherId = await insert(other.id, "two-sum", "accepted", 1);
  await page.context().clearCookies();

  const me = await register(page, "m6");
  const wa = await insert(me.id, "two-sum", "wrong_answer", 5, {
    failed_test_index: 2,
    failed_case: { input: { nums: [3, 2, 4], target: 6 }, expected: [1, 2], actual: [2, 1] },
  });
  const accepted = await insert(me.id, "two-sum", "accepted", 2);
  await insert(me.id, "two-sum", "accepted", 1);
  await insert(me.id, "valid-parentheses", "runtime_error", 3, { error: "IndexError: pop from empty list" });
  const run = await insert(me.id, "two-sum", "accepted", 0, { kind: "run" });

  // History: submits only, newest first.
  await page.goto("/submissions");
  const rows = page.getByTestId("submission-row");
  await expect(rows).toHaveCount(4);
  await expect(rows.first()).toContainText("Two Sum");
  await expect(page.locator(`[data-id="${run}"]`)).toHaveCount(0);
  await expect(page.locator(`[data-id="${otherId}"]`)).toHaveCount(0);

  await page.goto("/submissions?problem=valid-parentheses");
  await expect(rows).toHaveCount(1);
  await expect(page.getByTestId("problem-filter-chip")).toContainText("Valid Parentheses");
  await page.goto("/submissions?problem=no-such-problem");
  await expect(page.getByRole("heading", { name: "No such problem" })).toBeVisible();

  // Detail: failed case + read-only Monaco.
  await page.goto(`/submissions/${wa}`);
  await expect(page.getByTestId("verdict-card")).toHaveAttribute("data-status", "wrong_answer");
  await expect(page.getByTestId("failed-output")).toHaveText("[2, 1]");
  await expect(page.getByTestId("failed-expected")).toHaveText("[1, 2]");
  await expect(page.locator('[data-testid="code-viewer-editor"] .monaco-editor')).toBeVisible({ timeout: 60_000 });
  await expect(page).toHaveTitle("Wrong Answer · Two Sum · LemmaYard");

  // Uniform 404 for another user's submission and for a run.
  for (const id of [otherId, run, "not-a-uuid"]) {
    const res = await page.goto(`/submissions/${id}`);
    expect(res?.status()).toBe(404);
  }

  // Problem tab lists my two-sum submits and opens one.
  await page.goto("/problems/two-sum");
  await page.getByRole("tab", { name: "Submissions" }).click();
  const tab = page.getByTestId("problem-submissions");
  await expect(tab.getByTestId("submission-row")).toHaveCount(3);
  await tab.getByTestId("submissions-table").locator(`a[href="/submissions/${accepted}"]`).click();
  await expect(page).toHaveURL(new RegExp(`/submissions/${accepted}$`));

  // Profile: solved once despite two accepted submits; no code.
  await page.goto(`/u/${me.username}`);
  await expect(page.getByTestId("profile-stats")).toContainText("Solved1/");
  await expect(page.getByTestId("profile-stats")).toContainText("Submissions4");
  await expect(page.getByTestId("profile-stats")).toContainText("50.0%");
  await expect(page.getByTestId("recent-solved").locator("li")).toHaveCount(1);
  await expect(page.locator("body")).not.toContainText("class Solution");
});
