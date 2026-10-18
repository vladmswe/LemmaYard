// AC-M7-1 history after real judging: two submits (Wrong Answer, then
// Accepted) appear newest first with their verdicts, and each detail page
// shows the verdict and the exact submitted code.
import { expect, test, type Page } from "@playwright/test";

import { JUDGE_TAG, requireJudge } from "../../e2e-support/judge";
import { openProblem, pasteCode, registerViaUi, selectLanguage, uniqueUsername } from "../../e2e-support/workspace";

const JUDGED_MS = 60_000;

const WRONG = ["# e2e-history-wrong", "class Solution:", "    def twoSum(self, nums, target):", "        return [0, 1]", ""].join("\n");
const RIGHT = [
  "# e2e-history-right",
  "class Solution:",
  "    def twoSum(self, nums, target):",
  "        seen = {}",
  "        for i, x in enumerate(nums):",
  "            if target - x in seen:",
  "                return [seen[target - x], i]",
  "            seen[x] = i",
  "",
].join("\n");

async function submit(page: Page, code: string, marker: string, verdict: string) {
  await pasteCode(page, code, marker);
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/submit") && r.request().method() === "POST"),
    page.getByTestId("submit-button").click(),
  ]);
  expect(res.status()).toBe(202);
  const { id } = (await res.json()) as { id: string };
  await expect(page.getByTestId("submit-result")).toContainText(verdict, { timeout: JUDGED_MS });
  return id;
}

test.describe("submission history", { tag: JUDGE_TAG }, () => {
  requireJudge();
  test.describe.configure({ timeout: 180_000 });

  test("lists judged submits with verdicts; detail pages show the code", async ({ page }) => {
    await registerViaUi(page, uniqueUsername("fhi"));
    await openProblem(page, "two-sum");
    await selectLanguage(page, "python");
    const wrongId = await submit(page, WRONG, "e2e-history-wrong", "Wrong Answer");
    const rightId = await submit(page, RIGHT, "e2e-history-right", "Accepted");

    await page.goto("/submissions");
    const rows = page.getByTestId("submission-row");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toHaveAttribute("data-id", rightId);
    await expect(rows.nth(0).getByRole("link", { name: /^Accepted, Two Sum/ })).toBeVisible();
    await expect(rows.nth(1)).toHaveAttribute("data-id", wrongId);
    await expect(rows.nth(1).getByRole("link", { name: /^Wrong Answer, Two Sum/ })).toBeVisible();

    await rows.nth(1).getByRole("link", { name: /^Wrong Answer, Two Sum/ }).click();
    await expect(page).toHaveURL(new RegExp(`/submissions/${wrongId}$`));
    await expect(page.getByTestId("verdict-card")).toHaveAttribute("data-status", "wrong_answer");
    await expect(page.getByTestId("code-viewer")).toContainText("e2e-history-wrong");
    await expect(page.getByTestId("code-viewer")).toContainText("return [0, 1]");

    await page.goto(`/submissions/${rightId}`);
    await expect(page.getByTestId("verdict-card")).toHaveAttribute("data-status", "accepted");
    await expect(page.getByTestId("code-viewer")).toContainText("e2e-history-right");
    await expect(page.getByTestId("code-viewer")).toContainText("return [seen[target - x], i]");
  });
});
