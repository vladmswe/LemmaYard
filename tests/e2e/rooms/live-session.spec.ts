// Rooms R4 e2e (docs/specs/rooms.md AC-S-UI-1..4, AC-S-A11Y-1): two browser
// contexts. The owner creates a room and a 2-problem, 30-minute session; a
// friend joins through the invite link and the lobby; the owner starts; both
// see the live screen and the running timer; the friend submits the problem's
// reference solution from the problem page (judged by the real worker the e2e
// harness starts, so this spec is in the @judge project); the owner sees the
// toast on a problem page and the scoreboard + Activity line on the session
// screen within a few seconds; the owner ends the session and both see the
// finished state. Axe scans the whole page (header included) in both themes.
// Users are *@example.test in the throwaway e2e database.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { JUDGE_TAG, requireJudge } from "../../e2e-support/judge";
import { pasteCode, referenceSolution, selectLanguage } from "../../e2e-support/workspace";

const PASSWORD = "correct-horse-battery";

async function register(context: BrowserContext, baseURL: string, username: string) {
  const res = await context.request.post("/api/auth/register", {
    data: { email: `${username}@example.test`, username, password: PASSWORD },
    headers: { Origin: baseURL },
  });
  expect(res.status()).toBe(201);
}

async function expectNoSeriousAxe(page: Page) {
  // Let enter animations (tab panels fade in, 260 ms) settle: mid-fade colors are not the real ones.
  await page.waitForTimeout(400);
  const { violations } = await new AxeBuilder({ page }).analyze();
  const bad = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => `${n.target.join(" ")} ${n.failureSummary ?? ""}`).join(" | ")}`)).toEqual([]);
}

/** Submits the reference solution of the open problem; the real worker judges it. */
async function submitReferenceSolution(page: Page) {
  const slug = new URL(page.url()).pathname.split("/").pop()!;
  await selectLanguage(page, "python");
  await pasteCode(page, referenceSolution(slug, "python"));
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/submit") && r.request().method() === "POST"),
    page.getByTestId("submit-button").click(),
  ]);
  expect(res.status()).toBe(202);
  const body = (await res.json()) as { id: string };
  // The request carried the session (Submit only).
  expect(JSON.parse(res.request().postData() ?? "{}").roomSessionId).toBeTruthy();
  return body.id;
}

requireJudge();

test("two friends: lobby → live → solve → toast and scoreboard → finished", { tag: JUDGE_TAG }, async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  const suffix = Date.now().toString(36).slice(-6);
  const ownerName = `own_${suffix}`;
  const friendName = `fri_${suffix}`;
  const owner = await browser.newContext();
  const friend = await browser.newContext();
  // Spy: the permission prompt must never open without a click (AC-S-UI-3).
  await friend.addInitScript(() => {
    const w = window as unknown as { __permissionRequests: number };
    w.__permissionRequests = 0;
    if ("Notification" in window) {
      const original = Notification.requestPermission.bind(Notification);
      Notification.requestPermission = (...args: Parameters<typeof Notification.requestPermission>) => {
        w.__permissionRequests += 1;
        return original(...args);
      };
    }
  });
  await register(owner, baseURL!, ownerName);
  await register(friend, baseURL!, friendName);

  // Owner: room + invite.
  const po = await owner.newPage();
  await po.goto("/rooms");
  await po.getByRole("button", { name: "Create a team room" }).first().click();
  await po.getByLabel("Room name").fill("E2E Live Club");
  await po.getByRole("button", { name: "Create room" }).click();
  await expect(po).toHaveURL(/\/rooms\/[0-9a-f-]{36}\?tab=members$/);
  const roomPath = new URL(po.url()).pathname;
  await po.getByRole("button", { name: "Create link" }).click();
  const link = await po.getByLabel("Link", { exact: true }).inputValue();

  // Friend joins the room through the link.
  const pf = await friend.newPage();
  await pf.goto(link);
  await pf.getByRole("button", { name: "Join room" }).click();
  await expect(pf).toHaveURL(new RegExp(`${roomPath}$`));

  // Owner: New session → lobby; 2 problems, 30 minutes.
  await po.goto(roomPath);
  await po.getByTestId("new-session").click();
  await expect(po).toHaveURL(/\/sessions\/[0-9a-f-]{36}$/);
  const sessionPath = new URL(po.url()).pathname;
  await po.getByRole("button", { name: "Fewer: Problems" }).click();
  await po.getByRole("button", { name: "Fewer: Problems" }).click();
  // Rooms v2: Duration is 45/60/90/120 + "Other…" (a select of 15–240).
  await po.getByRole("group", { name: "Duration" }).getByRole("button", { name: "Other…" }).click();
  await po.getByTestId("duration-other").selectOption("30");
  await po.getByTestId("apply-settings").click();
  await expect(po.getByTestId("slot-2")).toBeVisible();
  await expect(po.getByTestId("slot-3")).toHaveCount(0);
  await expect(po.getByText("2 problems · 30 minutes")).toBeVisible();
  await expectNoSeriousAxe(po);

  // Friend: the room card links to the lobby; no titles before the start; Join.
  await pf.goto(roomPath);
  await pf.getByTestId("open-session-link").click();
  await expect(pf).toHaveURL(new RegExp(`${sessionPath}$`));
  await expect(pf.getByText("Titles are revealed when the session starts.")).toBeVisible();
  await expectNoSeriousAxe(pf);
  await pf.getByTestId("join-session").click();
  await expect(pf.getByText("You're in")).toBeVisible();
  await expect(po.getByTestId("lobby-participants").getByText(friendName)).toBeVisible({ timeout: 8000 });

  // Owner starts; both switch to live within one poll.
  await po.getByTestId("start-session").click();
  await po.getByTestId("confirm-start").click();
  await expect(po.getByTestId("problem-list")).toBeVisible({ timeout: 10_000 });
  await expect(pf.getByTestId("problem-list")).toBeVisible({ timeout: 10_000 });
  await expect(pf.getByText("The session has started")).toBeVisible();

  // The timer runs on both screens and is under 30:00.
  const timer = po.getByTestId("countdown").first();
  const t1 = await timer.textContent();
  await po.waitForTimeout(2100);
  const t2 = await timer.textContent();
  expect(t1).not.toEqual(t2);
  expect(t2).toMatch(/^2\d:\d\d$/);
  await expect(timer).toHaveAttribute("aria-label", /^Time left: 2\d minutes/);
  await expectNoSeriousAxe(po);
  await po.emulateMedia({ colorScheme: "dark" });
  await expectNoSeriousAxe(po);
  await po.emulateMedia({ colorScheme: "light" });

  // Owner watches problem 2's page (toasts live there); friend opens problem 1 from its card.
  const p2Href = await po.getByTestId("problem-card-2").getByRole("link").getAttribute("href");
  await po.goto(p2Href!);
  await expect(po.getByTestId("session-banner")).toContainText("Problem 2 of 2");
  await expect(po.getByTestId("banner-progress")).toBeVisible({ timeout: 8000 });

  await pf.getByTestId("problem-card-1").getByRole("link").click();
  await expect(pf).toHaveURL(/\?session=/);
  await expect(pf.getByTestId("session-banner")).toContainText("Problem 1 of 2");
  await expectNoSeriousAxe(pf);
  // Run never carries the session (answered locally so no Run is queued).
  await pf.route("**/run", (route) =>
    route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "stubbed" }) }),
  );
  const [run] = await Promise.all([
    pf.waitForRequest((r) => r.url().endsWith("/run") && r.method() === "POST"),
    pf.getByTestId("run-button").click(),
  ]);
  expect(JSON.parse(run.postData() ?? "{}").roomSessionId).toBeUndefined();
  await pf.unroute("**/run");

  await submitReferenceSolution(pf);
  await expect(pf.locator('[data-testid="console-result"][data-status="accepted"]')).toBeVisible({ timeout: 60_000 });
  await expect(pf.getByTestId("session-submit-note")).toContainText("This submission counts for the session");
  // Within a few seconds the owner gets the toast (other people's events only).
  await expect(po.getByText(`${friendName} solved Problem 1`)).toBeVisible({ timeout: 6000 });

  // Session screen: scoreboard cell and Activity line.
  await po.goto(sessionPath);
  await expect(po.getByTestId(`score-row-${friendName}`).locator('[data-cell-state="solved"]')).toBeVisible();
  await expect(po.getByTestId(`score-row-${friendName}`)).toContainText("First");
  await expect(po.getByTestId("activity-feed")).toContainText(`${friendName} solved Problem 1`);

  // Notification prefs persist; no permission prompt without a click.
  await pf.getByTestId("notification-settings").click();
  await pf.getByTestId("pref-sound").click();
  await pf.keyboard.press("Escape");
  const stored = await pf.evaluate(() => localStorage.getItem("lemmayard:room-notifications:v1"));
  expect(JSON.parse(stored!)).toMatchObject({ sound: true, browser: false });
  expect(await pf.evaluate(() => (window as unknown as { __permissionRequests: number }).__permissionRequests)).toBe(0);

  // Mobile width: no horizontal scroll on the live screen.
  const mobile = await friend.newPage();
  await mobile.setViewportSize({ width: 360, height: 780 });
  await mobile.goto(sessionPath);
  await expect(mobile.getByRole("tab", { name: "Scoreboard" })).toBeVisible();
  expect(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expectNoSeriousAxe(mobile);
  await mobile.close();

  // Owner ends the session; both see the finished state.
  await po.getByTestId("end-session").click();
  await po.getByTestId("confirm-end").click();
  await expect(po.getByRole("heading", { name: "Final standings" })).toBeVisible({ timeout: 10_000 });
  await expect(po.getByTestId("results-link")).toHaveAttribute("href", `${sessionPath}/results`);
  await expectNoSeriousAxe(po);
  await expect(pf.getByTestId("session-banner")).toContainText("Session finished", { timeout: 15_000 });
  await pf.goto(sessionPath);
  await expect(pf.getByRole("heading", { name: "Final standings" })).toBeVisible();

  // Clean up.
  await po.goto(`${roomPath}?tab=members`);
  await po.getByRole("button", { name: "Delete room" }).click();
  await po.getByLabel(/to confirm/).fill("E2E Live Club");
  await po.getByRole("button", { name: "Delete room" }).last().click();
  await expect(po).toHaveURL(/\/rooms$/);
  await Promise.all([owner.close(), friend.close()]);
});
