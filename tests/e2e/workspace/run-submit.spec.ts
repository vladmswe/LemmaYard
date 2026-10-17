// Problem workspace (M5): Monaco bundled locally, language buffers, guest
// redirect, and Run / Submit against the real judge.
//
// The judge tests need `pnpm worker` running against the same database as the
// web server (Playwright's webServer starts only the web app); they are
// skipped unless E2E_JUDGE=1. M7 (AC-M7-1) makes Playwright start the worker.
import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

const TWO_SUM_PY = [
  "class Solution:",
  "    def twoSum(self, nums, target):",
  "        seen = {}",
  "        for i, x in enumerate(nums):",
  "            if target - x in seen:",
  "                return [seen[target - x], i]",
  "            seen[x] = i",
  "",
].join("\n");

const TWO_SUM_JS = [
  "var twoSum = function(nums, target) {",
  "  const seen = new Map();",
  "  for (let i = 0; i < nums.length; i++) {",
  "    if (seen.has(target - nums[i])) return [seen.get(target - nums[i]), i];",
  "    seen.set(nums[i], i);",
  "  }",
  "};",
  "",
].join("\n");

async function registerUser(page: Page) {
  const id = randomUUID().slice(0, 8);
  await page.goto("/register");
  const status = await page.evaluate(async (suffix) => {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `e2e-m5-${suffix}@example.com`, username: `e2e_m5_${suffix}`, password: "e2e-password-123" }),
    });
    return res.status;
  }, id);
  expect(status).toBe(201);
}

async function openTwoSum(page: Page) {
  await page.goto("/problems/two-sum");
  await expect(page.locator('[data-testid="code-editor"] .monaco-editor .view-lines')).toBeVisible({ timeout: 60_000 });
}

/** Replaces the editor text (click + select all + insertText). */
async function typeCode(page: Page, code: string) {
  await page.locator('[data-testid="code-editor"] .view-lines').click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Delete");
  await page.keyboard.insertText(code);
}

async function selectLanguage(page: Page, language: "python" | "javascript") {
  await page.getByTestId("language-select").click();
  await page.getByTestId(`language-option-${language}`).click();
}

function editorText(page: Page) {
  return page
    .locator('[data-testid="code-editor"] .view-lines')
    .evaluate((el) => (el as HTMLElement).innerText.replace(/ /g, " "));
}

test.describe("workspace without the judge", () => {
  test("Monaco loads from this origin only, with Python and JavaScript highlighting", async ({ page }) => {
    const foreign: string[] = [];
    page.on("request", (r) => {
      const url = new URL(r.url());
      if (["http:", "https:"].includes(url.protocol) && url.hostname !== "localhost") foreign.push(r.url());
    });
    await openTwoSum(page);
    // Highlighting = the Monarch tokenizer colors keywords, types, comments differently.
    const tokenColors = () =>
      page
        .locator(".view-lines")
        .evaluate((el) => new Set([...el.querySelectorAll("span span")].map((s) => getComputedStyle(s).color)).size);
    await expect.poll(tokenColors).toBeGreaterThanOrEqual(3);

    await selectLanguage(page, "javascript");
    await expect.poll(() => editorText(page)).toContain("var twoSum = function(nums, target)");
    await expect.poll(tokenColors).toBeGreaterThanOrEqual(3);
    expect(foreign).toEqual([]);
  });

  test("switching languages keeps each buffer", async ({ page }) => {
    await openTwoSum(page);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.locator('[data-testid="code-editor"] .view-lines')).toBeVisible({ timeout: 60_000 });
    await typeCode(page, "# python draft");
    await selectLanguage(page, "javascript");
    await expect.poll(() => editorText(page)).toContain("var twoSum");
    await typeCode(page, "// js draft");
    await selectLanguage(page, "python");
    await expect.poll(() => editorText(page)).toContain("# python draft");
    await selectLanguage(page, "javascript");
    await expect.poll(() => editorText(page)).toContain("// js draft");
    await page.reload();
    await expect.poll(() => editorText(page), { timeout: 60_000 }).toContain("// js draft");
  });

  test("guests are sent to log in from Run and Submit", async ({ page }) => {
    await openTwoSum(page);
    await page.getByTestId("run-button").click();
    await expect(page).toHaveURL(/\/login\?next=%2Fproblems%2Ftwo-sum$/);
  });

  test("Run and Submit come before the editor in tab order", async ({ page }) => {
    await openTwoSum(page);
    const order = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll("button, textarea")];
      return {
        run: nodes.indexOf(document.querySelector('[data-testid="run-button"]')!),
        submit: nodes.indexOf(document.querySelector('[data-testid="submit-button"]')!),
        editor: nodes.indexOf(document.querySelector('[data-testid="code-editor"] textarea')!),
      };
    });
    expect(order.run).toBeGreaterThanOrEqual(0);
    expect(order.run).toBeLessThan(order.editor);
    expect(order.submit).toBeLessThan(order.editor);
  });
});

test.describe("workspace with the judge", () => {
  test.skip(!process.env.E2E_JUDGE, "needs `pnpm worker` running (set E2E_JUDGE=1)");
  test.describe.configure({ mode: "serial", timeout: 120_000 });

  test("Python: Run passes the samples, Submit is accepted", async ({ page }) => {
    await registerUser(page);
    await openTwoSum(page);
    await selectLanguage(page, "python");
    await typeCode(page, TWO_SUM_PY);
    await page.getByTestId("run-button").click();
    await expect(page.getByTestId("result-summary")).toContainText("Passed 3/3 samples", { timeout: 60_000 });
    await page.getByTestId("submit-button").click();
    const result = page.getByTestId("submit-result");
    await expect(result).toContainText("Accepted", { timeout: 60_000 });
    await expect(page.getByTestId("result-summary")).toHaveText(/^(\d+)\/\1 tests passed$/);
  });

  test("JavaScript: Ctrl/Cmd+Enter runs the samples", async ({ page }) => {
    await registerUser(page);
    await openTwoSum(page);
    await selectLanguage(page, "javascript");
    await typeCode(page, TWO_SUM_JS);
    await page.keyboard.press("ControlOrMeta+Enter");
    await expect(page.getByTestId("result-summary")).toContainText("Passed 3/3 samples", { timeout: 60_000 });
  });
});
