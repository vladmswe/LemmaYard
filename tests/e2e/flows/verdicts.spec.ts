// AC-M7-1 failure paths, judged by the real worker: a wrong answer shows the
// failing case and marks the problem attempted (not solved); a syntax error
// and a thrown exception show their error text.
import { expect, test } from "@playwright/test";

import { JUDGE_TAG, requireJudge } from "../../e2e-support/judge";
import {
  openProblem,
  pasteCode,
  problemCount,
  registerViaUi,
  selectLanguage,
  uniqueUsername,
} from "../../e2e-support/workspace";

const JUDGED_MS = 60_000;

// Always [0, 1]: the first test (nums [4, 9, 1, 6], target 7) expects [2, 3].
const WRONG_PY = ["class Solution:", "    def twoSum(self, nums, target):", "        return [0, 1]", ""].join("\n");
const SYNTAX_ERROR_PY = ["class Solution:", "    def twoSum(self, nums, target)", "        return []", ""].join("\n");
const THROWS_JS = ['var twoSum = function(nums, target) {', '  throw new Error("e2e-boom-" + nums.length);', "};", ""].join("\n");

test.describe("verdicts", { tag: JUDGE_TAG }, () => {
  requireJudge();
  test.describe.configure({ timeout: 180_000 });

  test("Wrong Answer: failing case shown, problem attempted, nothing solved", async ({ page }) => {
    const username = uniqueUsername("fwa");
    await registerViaUi(page, username);
    await openProblem(page, "two-sum");
    await selectLanguage(page, "python");
    await pasteCode(page, WRONG_PY, "return [0, 1]");

    await page.getByTestId("submit-button").click();
    const result = page.getByTestId("submit-result");
    await expect(result).toContainText("Wrong Answer", { timeout: JUDGED_MS });
    await expect(result).toContainText("Failed on test 1 of 13");
    const failed = result.getByTestId("failed-case");
    await expect(failed).toContainText("nums =");
    await expect(failed.getByTestId("failed-output")).toHaveText("[0, 1]");
    await expect(failed.getByTestId("failed-expected")).toHaveText("[2, 3]");

    // Catalog: attempted, not solved.
    await page.goto("/problems?status=attempted");
    await expect(page.getByRole("link", { name: /Two Sum/ })).toBeVisible();
    await page.goto("/problems?status=solved");
    await expect(page.getByRole("link", { name: /Two Sum/ })).toHaveCount(0);

    // Profile: still 0 solved.
    await page.goto(`/u/${username}`);
    await expect(page.getByRole("main").getByTestId("profile-stats")).toContainText(new RegExp(`Solved\\s*0\\s*/\\s*${problemCount()}`));
    await expect(page.getByRole("main").getByTestId("recent-solved")).toHaveCount(0);
  });

  test("syntax error (Python) → Compile Error with the error text", async ({ page }) => {
    await registerViaUi(page, uniqueUsername("fce"));
    await openProblem(page, "two-sum");
    await selectLanguage(page, "python");
    await pasteCode(page, SYNTAX_ERROR_PY, "def twoSum(self, nums, target)");

    await page.getByTestId("run-button").click();
    const result = page.getByTestId("run-result");
    await expect(result).toContainText("Compile Error", { timeout: JUDGED_MS });
    await expect(result.getByTestId("result-error")).toContainText("SyntaxError");
  });

  test("exception (JavaScript) → Runtime Error with the message", async ({ page }) => {
    await registerViaUi(page, uniqueUsername("fre"));
    await openProblem(page, "two-sum");
    await selectLanguage(page, "javascript");
    await pasteCode(page, THROWS_JS, "e2e-boom-");

    await page.getByTestId("submit-button").click();
    const result = page.getByTestId("submit-result");
    await expect(result).toContainText("Runtime Error", { timeout: JUDGED_MS });
    await expect(result.getByTestId("result-error")).toContainText("e2e-boom-4");
  });
});
