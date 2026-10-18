// AC-M7-1 happy path, judged by the real worker in Docker: sign up through
// the form → Two Sum → paste a correct solution → Run passes the samples →
// Submit is Accepted on every test → the public profile shows it solved.
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

test.describe("solve Two Sum", { tag: JUDGE_TAG }, () => {
  requireJudge();
  test.describe.configure({ timeout: 180_000 });

  const cases: { language: Language; marker: string }[] = [
    { language: "python", marker: "def twoSum" },
    { language: "javascript", marker: "var twoSum = function" },
  ];

  for (const { language, marker } of cases) {
    test(`${language}: register → Run → Submit → Accepted → solved on the profile`, async ({ page }) => {
      const username = uniqueUsername(language === "python" ? "fpy" : "fjs");
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
      await expect(stats).toContainText(/Solved\s*1\s*\/\s*20/);
      const recent = page.getByRole("main").getByTestId("recent-solved");
      await expect(recent.getByRole("listitem")).toHaveCount(1);
      await expect(recent.getByRole("link", { name: /Two Sum/ })).toBeVisible();
    });
  }
});
