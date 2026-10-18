// AC-C-GEN-1 with the flag off (the production default): this harness runs
// without COMMUNITY_ENABLED, so no community UI exists and every community
// route answers 404.
import { expect, test } from "@playwright/test";

test("community pages answer 404", async ({ request }) => {
  for (const path of [
    "/problems/two-sum/discuss",
    "/mod",
    "/legal/terms",
    "/legal/privacy",
    "/legal/content-policy",
    "/legal/report",
    "/dev-fixtures/community-xss",
  ]) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
});

test("community API routes answer 404", async ({ request, baseURL }) => {
  const headers = { Origin: baseURL!, "Content-Type": "application/json" };
  const id = "00000000-0000-4000-8000-000000000000";
  expect((await request.get("/api/comments?target=problem:two-sum")).status()).toBe(404);
  expect((await request.get(`/api/comments/${id}`)).status()).toBe(404);
  expect((await request.get(`/api/comments/${id}/replies`)).status()).toBe(404);
  expect((await request.post("/api/comments", { headers, data: { target: "problem:two-sum", body: "x" } })).status()).toBe(404);
  expect((await request.put(`/api/comments/${id}/vote`, { headers, data: { value: 1 } })).status()).toBe(404);
  expect((await request.put("/api/problems/two-sum/vote", { headers, data: { value: 1 } })).status()).toBe(404);
  expect((await request.put("/api/problems/two-sum/difficulty-feedback", { headers, data: { value: 0 } })).status()).toBe(404);
  expect((await request.post("/api/reports", { headers, data: {} })).status()).toBe(404);
  expect((await request.post("/api/mod/actions", { headers, data: {} })).status()).toBe(404);
});

test("no Discussion tab and no Community footer column", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/problems/two-sum");
  await expect(page.getByRole("tab", { name: "Description" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("tab", { name: /Discussion/ })).toHaveCount(0);
  await page.goto("/problems");
  await expect(page.locator("footer")).not.toContainText("Content policy");
});
