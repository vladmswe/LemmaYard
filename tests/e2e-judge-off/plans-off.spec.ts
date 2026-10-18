// PLANS_ENABLED=0 (the default; this suite's server runs without it): no study
// plan UI anywhere and every plan page and route is 404.
import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

test("study plans are invisible and 404 with the flag off", async ({ page, request }) => {
  const id = randomUUID().slice(0, 8);
  await page.goto("/register");
  const status = await page.evaluate(async (suffix) => {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `plans-off-${suffix}@example.test`, username: `plans_off_${suffix}`, password: "e2e-password-123" }),
    });
    return res.status;
  }, id);
  expect(status).toBe(201);

  expect((await page.goto("/plans"))!.status()).toBe(404);
  expect((await page.goto(`/plans/${randomUUID()}`))!.status()).toBe(404);
  const api = await page.evaluate(async () => (await fetch("/api/plans")).status);
  expect(api).toBe(404);
  expect((await request.post("/api/plans/import", { data: {}, headers: { Origin: new URL(page.url()).origin } })).status()).toBe(404);

  await page.goto("/problems");
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Plans" })).toHaveCount(0);
  await expect(page.getByTestId("add-to-plan")).toHaveCount(0);
  await page.goto("/problems/two-sum");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByTestId("add-to-plan")).toHaveCount(0);
});
