// Rooms: LeetCode problems picked automatically from the committed catalog
// (docs/specs/leetcode-integration.md AC-LC-15), two browser contexts. The
// host adds one LeetCode slot in the lobby Setup, turns on auto-pick, draws,
// sees the auto-picked card (number, rating, estimated difficulty, Re-roll)
// and re-rolls it, opens the catalog search; a friend sees only "LeetCode ·
// <difficulty>" before the start; after the start both see the title and the
// link, the friend marks it solved, and the results show SELF and the
// "estimated" label. Every request to leetcode.com is blocked and counted:
// it must stay 0 (links are never followed here). No CSP violation, axe
// finds nothing serious, 320–1440 px has no horizontal scroll.
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

test.afterAll(async () => {
  if (created.length) {
    await pool.query("delete from rooms where created_by = any($1::uuid[])", [created]);
    await pool.query("delete from users where id = any($1::uuid[])", [created]);
  }
  await pool.end();
});

test("auto-picked LeetCode slot: lobby, re-roll, hidden from members, live self-report, results with SELF and estimated labels", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(300_000);
  const watch: Watch = { leetcode: [], csp: [] };
  const suffix = Date.now().toString(36).slice(-6);
  const host = await register(browser, baseURL!, `lca_${suffix}`, watch);
  const friend = await register(browser, baseURL!, `lcb_${suffix}`, watch);
  const headers = { Origin: baseURL! };
  const room = await host.context.request.post("/api/rooms", { data: { name: "E2E Auto LeetCode" }, headers });
  expect(room.status()).toBe(201);
  const { id: roomId } = (await room.json()) as { id: string };
  await pool.query("insert into room_members (room_id, user_id, role) values ($1, $2, 'member')", [roomId, friend.id]);

  const session = await host.context.request.post(`/api/rooms/${roomId}/sessions`, {
    data: { mode: "rating", problemCount: 1, durationMin: 30 },
    headers,
  });
  expect(session.status()).toBe(201);
  const { id: sessionId } = (await session.json()) as { id: string };
  const sessionPath = `/rooms/${roomId}/sessions/${sessionId}`;

  // --- Lobby Setup: one more problem, from LeetCode, picked automatically.
  const ph = await host.context.newPage();
  await ph.goto(sessionPath);
  const setup = ph.getByTestId("session-settings");
  await setup.getByRole("button", { name: "More: Problems" }).click();
  await setup.getByRole("button", { name: "More: LeetCode problems" }).click();
  const autoSwitch = setup.getByTestId("leetcode-auto-switch");
  await expect(autoSwitch).toBeEnabled();
  await autoSwitch.click();
  await expect(setup).toContainText("zerotrac");
  await ph.getByTestId("apply-settings").click();
  const slot2 = ph.getByTestId("slot-2");
  await expect(slot2.getByTestId("slot-leetcode-source-2")).toHaveText("Auto-picked", { timeout: 15_000 });
  await expect(slot2.getByTestId("slot-leetcode-number-2")).toHaveText(/^#\d+$/);
  await expect(slot2.getByTestId("slot-rating-2")).toBeVisible();
  await expect(slot2.getByTestId("slot-difficulty-estimated-2")).toHaveText(/estimated/);
  await expect(slot2.getByTestId("slot-chance-2")).toBeVisible();
  const firstSlug = await slot2.getByTestId("slot-leetcode-2").getAttribute("data-external-slug");
  expect(firstSlug).toMatch(/^[a-z0-9-]+$/);
  const link = slot2.getByTestId("slot-leetcode-2");
  await expect(link).toHaveAttribute("href", `https://leetcode.com/problems/${firstSlug}/`);
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  await expect(link).toHaveAttribute("referrerpolicy", "no-referrer");
  // Re-roll the auto slot.
  await slot2.getByTestId("reroll-external-2").click();
  await expect(slot2.getByTestId("slot-leetcode-2")).not.toHaveAttribute("data-external-slug", firstSlug!, { timeout: 15_000 });
  const pickedSlug = (await slot2.getByTestId("slot-leetcode-2").getAttribute("data-external-slug"))!;
  await expect(ph.getByTestId("rerolls-left")).toContainText("29");
  await expectNoSeriousAxe(ph, "lobby (host) 1280");
  await ph.setViewportSize({ width: 1440, height: 900 });
  await expectNoSeriousAxe(ph, "lobby (host) 1440");
  await ph.setViewportSize({ width: 390, height: 900 });
  await expectNoSeriousAxe(ph, "lobby (host) 390");
  await expectNoOverflow(ph, "lobby (host)");

  // The add dialog opens on the catalog search; nothing is added here.
  await ph.getByTestId("add-leetcode").click();
  const dialog = ph.getByTestId("add-leetcode-dialog");
  const search = dialog.getByTestId("leetcode-catalog-search");
  await expect(search).toBeVisible();
  await expect(search.locator('[data-testid^="catalog-hit-"]').first()).toBeVisible({ timeout: 10_000 });
  await search.getByTestId("leetcode-search-q").fill("746");
  await search.getByTestId("leetcode-search-submit").click();
  await expect(search.getByTestId("catalog-hit-min-cost-climbing-stairs")).toBeVisible();
  await expectNoSeriousAxe(ph, "add dialog (catalog)");
  await ph.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await cspEvents(ph, watch);

  // --- The friend joins: "LeetCode" and a difficulty, nothing that identifies the problem.
  const pf = await friend.context.newPage();
  await pf.goto(sessionPath);
  await pf.getByTestId("join-session").click();
  const fslot2 = pf.getByTestId("slot-2");
  await expect(fslot2.getByTestId("leetcode-tag")).toBeVisible();
  await expect(fslot2.locator("[data-difficulty]").first()).toBeVisible();
  const html = await pf.content();
  expect(html).not.toContain(pickedSlug);
  expect(html).not.toContain(firstSlug!);
  await expect(fslot2.getByTestId("slot-chance-2")).toHaveCount(0);
  await expect(fslot2.getByTestId("slot-rating-2")).toHaveCount(0);
  await expectNoSeriousAxe(pf, "lobby (friend)");
  await cspEvents(pf, watch);

  // --- Live: both see the title and the link; the friend marks it solved.
  await ph.setViewportSize({ width: 1280, height: 900 });
  await ph.getByTestId("start-session").click();
  await ph.getByTestId("confirm-start").click();
  await expect(ph.getByTestId("scoreboard")).toBeVisible({ timeout: 15_000 });
  await pf.reload();
  const extCard = pf.getByTestId("external-problems-card");
  await expect(extCard).toBeVisible({ timeout: 15_000 });
  await expect(pf.locator(`a[data-external-slug="${pickedSlug}"]`).first()).toHaveAttribute(
    "href",
    `https://leetcode.com/problems/${pickedSlug}/`,
  );
  await expect(extCard.getByTestId("estimated").first()).toBeVisible();
  await expect(ph.locator(`a[data-external-slug="${pickedSlug}"]`).first()).toBeVisible();
  await pf.getByTestId("self-report-2").click();
  await expect(pf.getByTestId("self-report-undo-2")).toBeVisible();
  await expectNoSeriousAxe(pf, "live (friend)");
  await cspEvents(pf, watch);

  // --- Results: SELF and "estimated".
  await ph.getByTestId("end-session").click();
  await ph.getByTestId("confirm-end").click();
  await expect(ph.getByTestId("self-reported-note")).toBeVisible({ timeout: 15_000 });
  await ph.goto(`${sessionPath}/results`);
  const cell = ph.locator(`[data-testid="score-row-lcb_${suffix}"] [data-position="2"][data-cell-state="solved"]`);
  await expect(cell).toHaveAttribute("data-self-reported", "true");
  await expect(cell.getByTestId("self-reported")).toHaveText("SELF");
  await expect(ph.getByTestId("result-difficulty-estimated-2")).toHaveText(/estimated/);
  await expectNoSeriousAxe(ph, "results");
  await expectNoOverflow(ph, "results");
  await cspEvents(ph, watch);

  // --- Attribution: the footer links the third-party notices.
  await ph.getByTestId("footer-notices").click();
  await expect(ph).toHaveURL(/\/notices$/);
  await expect(ph.getByTestId("mit-notice")).toContainText("Copyright (c) 2021 Shuxin Chen");
  await expect(ph.getByText("not affiliated with or endorsed by LeetCode")).toBeVisible();
  await expectNoSeriousAxe(ph, "notices");
  await expectNoOverflow(ph, "notices");
  await cspEvents(ph, watch);

  expect(watch.leetcode).toEqual([]);
  expect(watch.csp).toEqual([]);
  await host.context.close();
  await friend.context.close();
});
