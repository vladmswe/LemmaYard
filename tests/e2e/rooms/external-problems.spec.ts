// Rooms: LeetCode problems (docs/specs/rooms-external-problems.md), two
// browser contexts. The owner adds a LeetCode link to the room's list in
// Settings (inline validation first), hosts a mixed session (one drawn
// problem + one LeetCode slot from the list, then a pasted link), a friend
// joins and sees "LeetCode" but no title before the start, then marks the
// LeetCode problem solved, undoes it and marks it again; the scoreboard and
// the results show the SELF marker and the "self-reported" note. Every
// request to leetcode.com is blocked and counted (must stay 0: we never load
// anything from it), the pages raise no CSP violation, axe finds nothing
// serious, and 320–1440 px has no horizontal scroll. Users are
// *@example.test in the throwaway e2e database.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { Pool } from "pg";

import { e2eDatabaseUrl } from "../../e2e-support/db";

const pool = new Pool({ connectionString: e2eDatabaseUrl() });
const PASSWORD = "correct-horse-battery";
const WIDTHS = [320, 360, 390, 768, 1024, 1440];
const created: string[] = [];

type Watch = { leetcode: string[]; csp: string[] };

async function register(browser: Browser, baseURL: string, username: string, watch: Watch) {
  const context = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1280, height: 900 } });
  // Nothing from leetcode.com may load into our pages (links open in a new tab only).
  await context.route(/^https?:\/\/([a-z0-9-]+\.)*leetcode\.(com|cn)\//i, (route) => {
    watch.leetcode.push(route.request().url());
    return route.abort();
  });
  await context.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      const w = window as unknown as { __csp?: string[] };
      (w.__csp ??= []).push(`${e.effectiveDirective} blocked ${e.blockedURI || "(inline)"}`);
    });
  });
  const res = await context.request.post("/api/auth/register", {
    data: { email: `${username}@example.test`, username, password: PASSWORD },
    headers: { Origin: baseURL },
  });
  expect(res.status()).toBe(201);
  const { rows } = await pool.query<{ id: string }>("select id from users where username = $1", [username]);
  created.push(rows[0].id);
  return { id: rows[0].id, context };
}

async function cspEvents(page: Page, watch: Watch) {
  const events = await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []);
  watch.csp.push(...events.map((e) => `${page.url()}: ${e}`));
}

async function expectNoSeriousAxe(page: Page, label: string) {
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => null))));
  const { violations } = await new AxeBuilder({ page }).analyze();
  const bad = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(bad.map((v) => `${label} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

async function expectNoOverflow(page: Page, label: string) {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(150);
    const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    expect(sw, `${label} at ${width}px`).toBeLessThanOrEqual(iw);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
}

async function expectLeetCodeLink(page: Page, slug: string) {
  const link = page.locator(`a[data-external-slug="${slug}"]`).first();
  await expect(link).toHaveAttribute("href", `https://leetcode.com/problems/${slug}/`);
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  await expect(link).toHaveAttribute("referrerpolicy", "no-referrer");
}

test.afterAll(async () => {
  if (created.length) {
    await pool.query("delete from rooms where created_by = any($1::uuid[])", [created]);
    await pool.query("delete from users where id = any($1::uuid[])", [created]);
  }
  await pool.end();
});

test("LeetCode list in Settings, mixed session, self-reported solve with undo, SELF marker in the results", async ({ browser, baseURL }) => {
  test.setTimeout(300_000);
  const watch: Watch = { leetcode: [], csp: [] };
  const suffix = Date.now().toString(36).slice(-6);
  const owner = await register(browser, baseURL!, `lco_${suffix}`, watch);
  const friend = await register(browser, baseURL!, `lcf_${suffix}`, watch);
  const headers = { Origin: baseURL! };
  const room = await owner.context.request.post("/api/rooms", { data: { name: "E2E LeetCode Club" }, headers });
  expect(room.status()).toBe(201);
  const { id: roomId } = (await room.json()) as { id: string };
  await pool.query("insert into room_members (room_id, user_id, role) values ($1, $2, 'member')", [roomId, friend.id]);

  // --- Settings: the owner adds a LeetCode link (inline validation first).
  const po = await owner.context.newPage();
  await po.goto(`/rooms/${roomId}?tab=settings`);
  const card = po.getByTestId("leetcode-bank-card");
  await expect(card.getByTestId("bank-empty")).toBeVisible();
  await card.getByTestId("add-bank-entry").click();
  const form = po.getByTestId("bank-entry-form");
  await form.getByTestId("external-url").fill("https://evil.example/problems/two-sum/");
  await form.getByTestId("external-title").focus(); // leave the field → inline error
  await expect(form.getByText("Use a link like https://leetcode.com/problems/two-sum/")).toBeVisible();
  await expect(form.getByTestId("external-url")).toHaveAttribute("aria-invalid", "true");
  await form.getByTestId("external-url").fill("https://leetcode.com/problems/two-sum/description/");
  await expect(form.getByText("LeetCode problem two-sum.", { exact: false })).toBeVisible();
  await expect(form.getByTestId("external-title")).toHaveAttribute("placeholder", "Two Sum");
  await form.getByRole("group", { name: "Difficulty (optional)" }).getByRole("button", { name: "Easy" }).click();
  await form.getByTestId("external-rating").fill("1200");
  await expectNoSeriousAxe(po, "bank dialog");
  await form.getByTestId("save-bank-entry").click();
  const entry = card.getByTestId("bank-entry-two-sum");
  await expect(entry).toContainText("Two Sum");
  await expect(entry).toContainText("Easy");
  await expect(entry).toContainText("1200");
  await expectLeetCodeLink(po, "two-sum");
  await expectNoSeriousAxe(po, "settings");
  await expectNoOverflow(po, "settings");
  await cspEvents(po, watch);

  // The friend reads the list but cannot change it.
  const pf = await friend.context.newPage();
  await pf.goto(`/rooms/${roomId}?tab=settings`);
  await expect(pf.getByTestId("leetcode-bank-card")).toContainText("Only the owner can change the list.");
  await expect(pf.getByTestId("bank-entry-two-sum")).toBeVisible();
  await expect(pf.getByTestId("add-bank-entry")).toHaveCount(0);

  // --- Lobby: one drawn problem + LeetCode problems.
  const session = await owner.context.request.post(`/api/rooms/${roomId}/sessions`, {
    data: { mode: "difficulty", problemCount: 1, durationMin: 30, mixMode: "manual", mix: { easy: 1, medium: 0, hard: 0 } },
    headers,
  });
  expect(session.status()).toBe(201);
  const { id: sessionId } = (await session.json()) as { id: string };
  const sessionPath = `/rooms/${roomId}/sessions/${sessionId}`;
  await po.goto(sessionPath);
  await po.getByTestId("add-leetcode").click();
  const dialog = po.getByTestId("add-leetcode-dialog");
  await expect(dialog.getByTestId("pick-two-sum")).toBeVisible();
  await expectNoSeriousAxe(po, "add dialog (list)");
  await dialog.getByTestId("add-bank-two-sum").click();
  await expect(dialog).toHaveCount(0);
  const slot2 = po.getByTestId("slot-2");
  await expect(slot2).toContainText("Two Sum");
  await expect(slot2.getByTestId("leetcode-tag")).toBeVisible();
  // A pasted link, keyboard only: the Paste tab, the link, Add.
  await po.getByTestId("add-leetcode").click();
  await po.getByRole("tab", { name: "Paste a link" }).click();
  await po.getByTestId("external-url").fill("https://leetcode.com/problems/coin-change/");
  await po.getByTestId("external-url").press("Enter");
  await expect(po.getByTestId("slot-3")).toContainText("Coin Change");
  await expect(po.getByText("3 problems (2 from LeetCode)")).toBeVisible();
  // Remove the pasted one again.
  await po.getByTestId("remove-external-3").click();
  await expect(po.getByTestId("slot-3")).toHaveCount(0);
  await expectNoSeriousAxe(po, "lobby (host)");
  await expectNoOverflow(po, "lobby (host)");

  // The friend joins: "LeetCode", but no title or slug before the start.
  await pf.goto(sessionPath);
  await pf.getByTestId("join-session").click();
  const fslot2 = pf.getByTestId("slot-2");
  await expect(fslot2.getByTestId("leetcode-tag")).toBeVisible();
  await expect(fslot2).not.toContainText("Two Sum");
  expect(await pf.content()).not.toContain("two-sum");
  await expectNoSeriousAxe(pf, "lobby (friend)");
  await cspEvents(pf, watch);

  // --- Live: the host starts; the friend marks the LeetCode problem solved.
  await po.getByTestId("start-session").click();
  await po.getByTestId("confirm-start").click();
  await expect(po.getByTestId("scoreboard")).toBeVisible({ timeout: 15_000 });
  await pf.reload();
  const extCard = pf.getByTestId("external-problems-card");
  await expect(extCard).toBeVisible({ timeout: 15_000 });
  await expectLeetCodeLink(pf, "two-sum");
  // Keyboard: focus Mark solved and press Enter.
  await pf.getByTestId("self-report-2").focus();
  await pf.keyboard.press("Enter");
  await expect(pf.getByTestId("self-report-undo-2")).toBeVisible();
  const friendCell = pf.locator(`[data-testid="score-row-lcf_${suffix}"] [data-position="2"][data-cell-state="solved"]`);
  await expect(friendCell).toHaveAttribute("data-self-reported", "true");
  await expect(friendCell.getByTestId("self-reported")).toHaveText("SELF");
  await expect(pf.getByTestId("legend-self-reported")).toBeVisible();
  // The host sees it through the poller.
  await expect(po.locator(`[data-testid="score-row-lcf_${suffix}"] [data-position="2"]`).first()).toHaveAttribute(
    "data-cell-state",
    "solved",
    { timeout: 10_000 },
  );
  await expectNoSeriousAxe(pf, "live (friend)");
  // Undo, then mark again.
  await pf.getByTestId("self-report-undo-2").click();
  await expect(pf.getByTestId("self-report-2")).toBeVisible();
  await expect(pf.locator(`[data-testid="score-row-lcf_${suffix}"] [data-position="2"]`).first()).toHaveAttribute("data-cell-state", "untouched");
  await pf.getByTestId("self-report-2").click();
  await expect(pf.getByTestId("self-report-undo-2")).toBeVisible();
  // Phones: the Problems tab carries the same button.
  await pf.setViewportSize({ width: 390, height: 900 });
  await expect(pf.getByTestId("problem-card-2").getByTestId("self-report-undo-2")).toBeVisible();
  await expectNoSeriousAxe(pf, "live 390 (friend)");
  await expectNoOverflow(pf, "live (friend)");
  await cspEvents(pf, watch);

  // --- Results: the host ends the session.
  await po.getByTestId("end-session").click();
  await po.getByTestId("confirm-end").click();
  await expect(po.getByTestId("self-reported-note")).toBeVisible({ timeout: 15_000 });
  await po.goto(`${sessionPath}/results`);
  await expect(po.getByTestId("results-self-reported")).toContainText("includes self-reported leetcode problems");
  const resultCell = po.locator(`[data-testid="score-row-lcf_${suffix}"] [data-position="2"][data-cell-state="solved"]`);
  await expect(resultCell).toHaveAttribute("data-self-reported", "true");
  await expect(po.getByTestId("legend-self-reported")).toBeVisible();
  await expect(po.getByTestId("problem-summaries")).toContainText("Marked solved (self-reported) by 1 of 2");
  await expectLeetCodeLink(po, "two-sum");
  await expectNoSeriousAxe(po, "results");
  await expectNoOverflow(po, "results");
  await cspEvents(po, watch);

  // Room page history: the mini-matrix says so too.
  await po.goto(`/rooms/${roomId}`);
  await expect(po.getByTestId("history-self-reported")).toBeVisible();
  await cspEvents(po, watch);

  expect(watch.leetcode).toEqual([]);
  expect(watch.csp).toEqual([]);
  await owner.context.close();
  await friend.context.close();
});
