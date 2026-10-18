// Study plans (community C2, docs/specs/community.md §B.8, AC-C-A11Y-1..3):
// create a plan, add a problem from the problem page (keyboard, focus back on
// the trigger), mark a LeetCode item done, reorder with the keyboard only,
// share by link with a second user, duplicate, save a finished room session
// as a plan; axe (0 serious/critical), no horizontal scroll at 320–1440 and
// reduced motion ending in final states. Users are *@example.test.
import { randomUUID } from "node:crypto";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

async function newUser(browser: Browser, prefix: string, options: Parameters<Browser["newContext"]>[0] = {}) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  const username = `${prefix}_${randomUUID().slice(0, 8)}`;
  await page.goto("/login");
  const status = await page.evaluate(
    async (u) =>
      (
        await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: `${u}@example.test`, username: u, password: "e2e-password-123" }),
        })
      ).status,
    username,
  );
  expect(status).toBe(201);
  return { context, page, username };
}

async function call<T = Record<string, unknown>>(page: Page, method: string, path: string, body: unknown = {}) {
  return page.evaluate(
    async ([m, p, b]) => {
      const res = await fetch(p, { method: m, headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
      return { status: res.status, body: (await res.json().catch(() => null)) as T };
    },
    [method, path, body] as const,
  );
}

async function expectAxeClean(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const bad = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

async function expectNoOverflow(page: Page, label: string) {
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(100);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${label} at ${width}px`).toBeLessThanOrEqual(0);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
}

const titles = (page: Page) =>
  page.getByTestId("plan-item").evaluateAll((items) => items.map((li) => li.querySelector("p")?.textContent?.trim() ?? ""));

test.describe("study plans", () => {
  let owner: { context: BrowserContext; page: Page; username: string };

  test.afterEach(async () => {
    await owner?.context.close();
  });

  test("create, add from the problem page, mark done, keyboard reorder, axe and layout", async ({ browser }) => {
    test.setTimeout(180_000);
    owner = await newUser(browser, "plan_e2e");
    const { page } = owner;

    // Nav item and an empty /plans.
    await page.goto("/plans");
    await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Plans" })).toHaveAttribute("aria-current", "page");
    await expectAxeClean(page);
    await page.getByTestId("new-plan").first().click();
    await page.getByRole("dialog").getByLabel("Title").fill("E2E interview prep");
    await page.getByRole("button", { name: "Create plan" }).click();
    await page.waitForURL(/\/plans\/[0-9a-f-]{36}$/);
    const planId = page.url().split("/").at(-1)!;
    await expect(page.getByRole("heading", { level: 1 })).toContainText("E2E interview prep");

    // Problem page: open the dialog with the keyboard, add, focus returns to the trigger.
    await page.goto("/problems/two-sum");
    const trigger = page.getByTestId("add-to-plan");
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Add to a study plan" });
    await expect(dialog.getByRole("radio", { name: /E2E interview prep/ })).toBeChecked();
    await expectAxeClean(page);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await dialog.getByLabel("Section (optional)").fill("Warm-up");
    await dialog.getByTestId("add-to-plan-submit").click();
    await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Added to" })).toBeVisible();
    await expect(trigger).toBeFocused();
    // Again: the plan now has it.
    await trigger.click();
    await expect(dialog.getByRole("radio", { name: /E2E interview prep/ })).toBeDisabled();
    await page.keyboard.press("Escape");

    // More items through the API (one ours, one LeetCode link) in the same section.
    const added = await call(page, "POST", `/api/plans/${planId}/items`, {
      items: [{ problemSlug: "valid-parentheses" }, { leetcodeUrl: "https://leetcode.com/problems/meeting-rooms-ii/", title: "Meeting Rooms II" }],
      section: { title: "Warm-up" },
    });
    expect(added.body).toEqual({ added: 2, skipped: 0 });

    await page.goto(`/plans/${planId}`);
    expect(await titles(page)).toEqual(["Two Sum", "Valid Parentheses", expect.stringContaining("Meeting Rooms II")]);
    const external = page.getByRole("link", { name: /Meeting Rooms II/ });
    await expect(external).toHaveAttribute("href", "https://leetcode.com/problems/meeting-rooms-ii/");
    await expect(external).toHaveAttribute("rel", "noopener noreferrer");
    await expect(external).toHaveAttribute("target", "_blank");

    // Mark the LeetCode item done: the progress card follows (server refresh).
    await expect(page.getByTestId("plan-progress-done")).toHaveText("0");
    await page.getByTestId("mark-done").click();
    await expect(page.getByTestId("mark-done")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("plan-progress-done")).toHaveText("1");

    // Keyboard-only reorder: Move down on the first item twice keeps focus on the moved control.
    await page.getByTestId("edit-plan-toggle").click();
    const firstDown = page.getByRole("button", { name: "Move Two Sum down" });
    await firstDown.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Move Two Sum down" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Move Two Sum up" })).toBeFocused(); // last: Move down is disabled now
    await expect(page.getByRole("status").filter({ hasText: "moved to position 3" })).toHaveCount(1);
    await expectAxeClean(page);
    // Saved in order, one request at a time: survives a reload.
    await page.waitForLoadState("networkidle");
    await page.reload();
    expect(await titles(page)).toEqual(["Valid Parentheses", expect.stringContaining("Meeting Rooms II"), "Two Sum"]);

    await expectAxeClean(page);
    await expectNoOverflow(page, "plan page");
    await page.goto("/plans");
    await expect(page.getByTestId("plan-card")).toHaveCount(1);
    await expectNoOverflow(page, "/plans");
  });

  test("share by link: another user opens it with their own progress, saves and duplicates it", async ({ browser }) => {
    test.setTimeout(180_000);
    owner = await newUser(browser, "plan_share");
    const created = await call<{ id: string }>(owner.page, "POST", "/api/plans", {
      title: "Shared plan",
      items: [{ problemSlug: "two-sum" }, { leetcodeUrl: "https://leetcode.com/problems/lru-cache/" }],
    });
    const planId = created.body.id;
    await owner.page.goto(`/plans/${planId}`);
    await owner.page.getByRole("radio", { name: /Anyone with the link/ }).click();
    const linkField = owner.page.getByLabel(/Link \(anyone who has it/);
    await expect(linkField).toHaveValue(/\/plans\/.+\?share=[A-Za-z0-9_-]{43}$/);
    const link = await linkField.inputValue();
    await owner.page.getByTestId("mark-done").click();
    await expect(owner.page.getByTestId("plan-progress-done")).toHaveText("1");

    const reader = await newUser(browser, "plan_reader");
    try {
      // Without the token: 404. With it: the plan, with the reader's own (empty) progress.
      expect((await reader.page.goto(`/plans/${planId}`))!.status()).toBe(404);
      await reader.page.goto(new URL(link).pathname + new URL(link).search);
      await expect(reader.page.getByRole("heading", { level: 1 })).toContainText("Shared plan");
      await expect(reader.page.getByTestId("plan-progress-done")).toHaveText("0");
      await expect(reader.page.getByTestId("mark-done")).toHaveAttribute("aria-pressed", "false");
      await expect(reader.page.getByTestId("visibility-card")).toHaveCount(0);
      await expectAxeClean(reader.page);
      await reader.page.getByTestId("save-plan").click();
      await expect(reader.page.getByTestId("save-plan")).toHaveAttribute("aria-pressed", "true");
      await reader.page.getByTestId("duplicate-plan").click();
      await reader.page.waitForURL((url) => /\/plans\/[0-9a-f-]{36}$/.test(url.pathname) && !url.pathname.endsWith(planId));
      await expect(reader.page.getByRole("heading", { level: 1 })).toContainText("Shared plan");
      await expect(reader.page.getByTestId("visibility-card").getByRole("radio", { name: /Private/ })).toBeChecked();
      await reader.page.goto("/plans");
      await expect(reader.page.getByRole("region", { name: "Saved plans" }).getByTestId("plan-card")).toHaveCount(1);
      await expect(reader.page.getByRole("region", { name: "Your plans" }).getByTestId("plan-card")).toHaveCount(1);
    } finally {
      await reader.context.close();
    }
  });

  test("a finished room session is saved as a plan with its problems in order", async ({ browser }) => {
    test.setTimeout(180_000);
    owner = await newUser(browser, "plan_room");
    const { page } = owner;
    const room = await call<{ id: string }>(page, "POST", "/api/rooms", { name: "Plan Club" });
    expect(room.status).toBe(201);
    const session = await call<{ id: string }>(page, "POST", `/api/rooms/${room.body.id}/sessions`, { problemCount: 2, durationMin: 30 });
    expect(session.status).toBe(201);
    const base = `/api/rooms/${room.body.id}/sessions/${session.body.id}`;
    expect((await call(page, "POST", `${base}/start`)).status).toBe(200);
    expect((await call(page, "POST", `${base}/end`)).status).toBe(200);

    await page.goto(`/rooms/${room.body.id}/sessions/${session.body.id}/results`);
    await page.getByTestId("save-session-plan").click();
    await page.waitForURL(/\/plans\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Plan Club ·");
    await expect(page.getByTestId("plan-item")).toHaveCount(2);
    await expect(page.getByText("from a room session")).toBeVisible();
    // Saving again opens the same plan.
    const again = await call<{ id: string; existing?: boolean }>(page, "POST", "/api/plans/import", { source: "room_session", sessionId: session.body.id });
    expect(again.body).toMatchObject({ id: page.url().split("/").at(-1), existing: true });
    await page.request.post("/api/rooms/" + room.body.id + "/delete", {
      data: { confirmName: "Plan Club" },
      headers: { Origin: new URL(page.url()).origin },
    });
  });

  test("reduced motion: plan pages end in their final state", async ({ browser }) => {
    owner = await newUser(browser, "plan_rm", { reducedMotion: "reduce" });
    const { page } = owner;
    const created = await call<{ id: string }>(page, "POST", "/api/plans", { title: "Calm plan", items: [{ problemSlug: "two-sum" }] });
    for (const path of ["/plans", `/plans/${created.body.id}`]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(300);
      const motion = await page.evaluate(() => ({
        running: document
          .getAnimations()
          .filter((a) => a.playState === "running")
          .map((a) => `${(a as CSSAnimation).animationName ?? "transition"}`),
        hiddenReveals: [...document.querySelectorAll(".rv, .reveal")].filter((el) => getComputedStyle(el).opacity !== "1").length,
      }));
      expect(motion, path).toEqual({ running: [], hiddenReveals: 0 });
    }
  });
});
