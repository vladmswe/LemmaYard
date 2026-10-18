// AC-M7-1 happy path, judged by the real worker in Docker: sign up through
// the form → Two Sum → paste a correct solution → Run passes the samples →
// Submit is Accepted on every test → the public profile shows it solved.
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { JUDGE_TAG, requireJudge } from "../../e2e-support/judge";
import {
  openProblem,
  pasteCode,
  referenceSolution,
  registerViaUi,
  selectLanguage,
  uniqueUsername,
  type Language,
} from "../../e2e-support/workspace";

const JUDGED_MS = 60_000;
/** The e2e database imports every problem directory in problems/. */
const PROBLEM_COUNT = readdirSync(path.join(process.cwd(), "problems"), { withFileTypes: true }).filter(
  (e) => e.isDirectory() && existsSync(path.join(process.cwd(), "problems", e.name, "meta.json")),
).length;

test.describe("solve Two Sum", { tag: JUDGE_TAG }, () => {
  requireJudge();
  test.describe.configure({ timeout: 180_000 });

  const cases: { language: Language; marker: string }[] = [
    { language: "python", marker: "def twoSum" },
    { language: "javascript", marker: "var twoSum = function" },
    { language: "java", marker: "public int[] twoSum(int[] nums, int target)" },
  ];
  const prefixes: Record<Language, string> = { python: "fpy", javascript: "fjs", java: "fjv" };

  for (const { language, marker } of cases) {
    test(`${language}: register → Run → Submit → Accepted → solved on the profile`, async ({ page }) => {
      const username = uniqueUsername(prefixes[language]);
      await registerViaUi(page, username);

      await openProblem(page, "two-sum");
      await selectLanguage(page, language);
      await pasteCode(page, referenceSolution("two-sum", language), marker);

      await page.getByTestId("run-button").click();
      await expect(page.getByTestId("run-result").getByTestId("result-summary")).toContainText("Passed 3/3 samples", {
        timeout: JUDGED_MS,
      });

      await page.getByTestId("submit-button").click();
      const result = page.getByTestId("submit-result");
      await expect(result).toContainText("Accepted", { timeout: JUDGED_MS });
      await expect(result.getByTestId("result-summary")).toHaveText("13/13 tests passed");

      await page.goto(`/u/${username}`);
      const stats = page.getByRole("main").getByTestId("profile-stats");
      await expect(stats).toContainText(new RegExp(`Solved\\s*1\\s*/\\s*${PROBLEM_COUNT}`));
      const recent = page.getByRole("main").getByTestId("recent-solved");
      await expect(recent.getByRole("listitem")).toHaveCount(1);
      await expect(recent.getByRole("link", { name: /Two Sum/ })).toBeVisible();
    });
  }
});
