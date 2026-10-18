// Problem page with the judge disabled (JUDGE_ENABLED=0, the Vercel default):
// Run / Submit are disabled with a visible reason, shortcuts only announce
// it, no request reaches the run/submit API, and editing + drafts still work.
// Server: the e2e harness via playwright.judge-off.config.ts (pnpm test:e2e:judge-off).
import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

const NOTE = "Code execution isn't available on this deployment yet. You can still read the problem and the guide.";
const SHORT = "Code execution isn't available on this deployment yet.";

async function registerUser(page: Page) {
  const id = randomUUID().slice(0, 8);
  await page.goto("/register");
  const status = await page.evaluate(async (suffix) => {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `wp1-e2e-${suffix}@example.test`, username: `wp1_e2e_${suffix}`, password: "e2e-password-123" }),
    });
    return res.status;
  }, id);
  expect(status).toBe(201);
}

/** Every request to the run/submit API made by the page. */
function judgeRequests(page: Page): string[] {
  const seen: string[] = [];
  page.on("request", (r) => {
    if (/\/api\/problems\/[^/]+\/(run|submit)$/.test(new URL(r.url()).pathname)) seen.push(r.url());
  });
  return seen;
}

async function openTwoSum(page: Page) {
  await page.goto("/problems/two-sum");
  await expect(page.locator('[data-testid="code-editor"] .monaco-editor .view-lines')).toBeVisible({ timeout: 60_000 });
}

async function modifier(page: Page): Promise<"Meta" | "Control"> {
  return (await page.evaluate(() => /Mac/.test(navigator.userAgent))) ? "Meta" : "Control";
}

test("health reports judge: disabled", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ db: "up", judge: "disabled" });
});

test("desktop: Run / Submit disabled with the reason; shortcuts send nothing; drafts still save", async ({ page }) => {
  const requests = judgeRequests(page);
  await registerUser(page);
  await openTwoSum(page);

  const run = page.getByTestId("run-button");
  const submit = page.getByTestId("submit-button");
  await expect(run).toBeDisabled();
  await expect(submit).toBeDisabled();
  // The console opens on Result, whose idle state says why.
  await expect(page.getByTestId("judge-disabled-note")).toContainText(NOTE);

  // The reason is in the tooltip (the buttons stay focusable for it).
  await run.hover();
  await expect(page.getByRole("tooltip").or(page.locator("[data-slot=tooltip-content]")).first()).toContainText(SHORT);

  // Shortcuts in the editor: a polite toast, no request.
  await page.locator('[data-testid="code-editor"] .view-lines').click();
  const mod = await modifier(page);
  await page.keyboard.press(`${mod}+Enter`);
  await page.keyboard.press(`${mod}+Shift+Enter`);
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: SHORT })).toHaveCount(1);

  // Forced clicks on the disabled buttons do nothing either.
  await run.click({ force: true });
  await submit.click({ force: true });

  // Editing still autosaves the draft.
  await page.keyboard.type("# draft");
  await expect(page.getByTestId("draft-status")).toHaveText("Saved locally");

  // The custom input stays editable.
  await page.getByRole("tab", { name: "Testcase" }).click();
  await expect(page.locator("textarea, input").filter({ visible: true }).first()).toBeEditable();

  expect(requests).toEqual([]);
});

test("mobile: the action bar is disabled and says why", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const requests = judgeRequests(page);
  await page.goto("/problems/two-sum");
  await expect(page.getByTestId("judge-disabled-bar-note")).toHaveText(SHORT);
  await expect(page.getByTestId("run-button-mobile")).toBeDisabled();
  await expect(page.getByTestId("submit-button-mobile")).toBeDisabled();
  await page.getByTestId("run-button-mobile").click({ force: true });
  expect(requests).toEqual([]);
  await context.close();
});
