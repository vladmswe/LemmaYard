// Design v2 phase 2B (DESIGN.md §13.8–§13.10): the guide and the rooms.
// Axe (WCAG 2.1 A/AA, serious + critical, whole page) in each theme the site
// allows, no horizontal scroll (320 guide / 360 / 390 / 768 / 1024 / 1440),
// the forced theme, reduced motion ending in final states, and the player's
// own motion switch. Rooms: a room with an owner and a friend, created through
// the API; the session is judged by the test-only stub (no Docker, no worker).
// Users are p2b-*@example.test; their rooms and accounts are deleted afterwards.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { Pool } from "pg";

import { forcedTheme } from "../../../src/lib/theme-config";
import { JUDGE_TAG, requireJudge } from "../../e2e-support/judge";
import { referenceSolution } from "../../e2e-support/workspace";
import { expectTouchTargets } from "../guide/helpers";

const THEMES = (forcedTheme ? [forcedTheme] : ["light", "dark"]) as ("light" | "dark")[];
const DB = process.env.DATABASE_URL!;
const PASSWORD = "correct-horse-battery";

async function expectAxeClean(page: Page) {
  // Enter animations (reveals, tab fades) would read as low contrast mid-flight.
  await page.evaluate(() =>
    Promise.race([
      Promise.all(document.getAnimations().map((a) => a.finished.catch(() => null))),
      new Promise((r) => setTimeout(r, 2000)),
    ]),
  );
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const bad = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

async function expectNoOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${label}: horizontal scroll`).toBeLessThanOrEqual(0);
}

/** Reduced motion, then walk the page so every scroll reveal has shown. */
async function settle(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 700) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 25));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(150);
}

// ---------------------------------------------------------------- guide

const GUIDE_PAGES = ["/learn", "/learn/stacks", "/learn/glossary"];

async function openGuide(page: Page, path: string) {
  await page.goto(path);
  if (path === "/learn/stacks") {
    await expect(page.locator('[data-player="stack-ops"]')).toHaveAttribute("data-hydrated", "true");
  }
}

for (const theme of THEMES) {
  test.describe(`guide, ${theme} theme`, () => {
    test.use({ colorScheme: theme });
    for (const width of [320, 390, 1440]) {
      test(`axe clean and no horizontal scroll at ${width}px`, async ({ page }) => {
        test.setTimeout(90_000);
        await page.setViewportSize({ width, height: 900 });
        for (const path of GUIDE_PAGES) {
          await openGuide(page, path);
          await settle(page);
          await expectNoOverflow(page, `${path} @${width}`);
          await expectAxeClean(page);
        }
      });
    }
  });
}

test("guide fits at 360, 768 and 1024 px", async ({ page }) => {
  for (const width of [360, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of GUIDE_PAGES) {
      await openGuide(page, path);
      await expectNoOverflow(page, `${path} @${width}`);
    }
  }
});

test("lesson: one h1 with the italic phrase, numbered h2s, lessons by track, wrapping cost table", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openGuide(page, "/learn/stacks");
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("h1")).toHaveText("Stacks: last in, first out");
  await expect(page.locator("h1 em")).toHaveText("last in, first out");
  // Serif only at display sizes: the h2 is at least 28px.
  const h2 = await page.locator("#lesson-content > h2").first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(h2).toBeGreaterThanOrEqual(28);
  const nav = page.getByRole("navigation", { name: "Lessons" });
  await expect(nav.locator('[aria-current="page"]')).toHaveAttribute("href", "/learn/stacks");
  // The cost table wraps inside the column instead of scrolling (axe scrollable-region).
  const table = page.locator('[data-complexity] [data-slot="table-container"]').first();
  const fit = await table.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(fit).toBeLessThanOrEqual(0);
});

test("lesson below 961 px: the sticky lesson bar opens the list of lessons", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openGuide(page, "/learn/stacks");
  const bar = page.locator("[data-lesson-bar]");
  await expect(bar).toBeVisible();
  await expect(page.locator("[data-lesson-tracknav]")).toBeHidden();
  await bar.locator("summary").click();
  await expect(page.getByRole("navigation", { name: "All lessons" }).getByRole("link").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("navigation", { name: "All lessons" })).toBeHidden();
  await expect(bar.locator("summary")).toBeFocused();
});

test("guide: forced theme, reduced motion final states, player controls 44px", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: forcedTheme === "dark" ? "light" : "dark" });
  await page.setViewportSize({ width: 390, height: 844 });
  await openGuide(page, "/learn/stacks");
  if (forcedTheme) await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${forcedTheme}\\b`));
  await page.waitForTimeout(300);
  const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length);
  expect(running).toBe(0);
  const root = page.locator('[data-player="stack-ops"]');
  // The player's own motion setting is off under reduce: frame transitions take 0 ms.
  await expect(root.locator('[data-player-switch="motion"]')).toHaveAttribute("aria-checked", "false");
  const duration = await root.evaluate((el) => getComputedStyle(el).getPropertyValue("--viz-duration").trim());
  expect(parseFloat(duration), duration).toBe(0);
  await expectTouchTargets(root);
});

test("guide: keyboard focus is visible on the roadmap and in the player", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openGuide(page, "/learn/stacks");
  await page.locator('[data-player="stack-ops"] [data-player-figure]').focus();
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    const outline = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const s = getComputedStyle(el);
      return { tag: el.tagName, style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
    });
    expect(outline.style, `tab stop ${i} (${outline.tag})`).not.toBe("none");
    expect(outline.width).toBeGreaterThanOrEqual(2);
  }
});

// ---------------------------------------------------------------- rooms

type Member = { context: BrowserContext; username: string; id: string };

const pool = new Pool({ connectionString: DB });
const suffix = Date.now().toString(36).slice(-6);
let owner: Member;
let friend: Member;
let roomId = "";
let sessionId = "";

async function member(browser: Browser, baseURL: string, username: string): Promise<Member> {
  const context = await browser.newContext({ baseURL });
  const res = await context.request.post("/api/auth/register", {
    data: { email: `p2b-${username}@example.test`, username, password: PASSWORD },
    headers: { Origin: baseURL },
  });
  expect(res.status()).toBe(201);
  const { rows } = await pool.query<{ id: string }>("select id from users where username = $1", [username]);
  return { context, username, id: rows[0]!.id };
}

async function post(request: APIRequestContext, baseURL: string, path: string, data: unknown = {}) {
  const res = await request.post(path, { data, headers: { Origin: baseURL } });
  expect(res.ok(), `${path}: ${res.status()} ${await res.text()}`).toBe(true);
  return res.json();
}

async function checkPage(page: Page, path: string, ready: string, widths = [360, 390, 768, 1024, 1440]) {
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(path);
    await page.locator(ready).first().waitFor();
    await settle(page);
    await expectNoOverflow(page, `${path} @${width}`);
    if (width === 390 || width === 1440) await expectAxeClean(page);
  }
}

// @judge: the live test's submission is judged by the harness's real worker.
test.describe.serial("rooms", { tag: JUDGE_TAG }, () => {
  requireJudge();
  test.beforeAll(async ({ browser, baseURL }) => {
    owner = await member(browser, baseURL!, `p2b_o_${suffix}`);
    friend = await member(browser, baseURL!, `p2b_f_${suffix}`);
    const room = await post(owner.context.request, baseURL!, "/api/rooms", { name: "Design Proof Club" });
    roomId = room.id;
    const invite = await post(owner.context.request, baseURL!, `/api/rooms/${roomId}/invite`, { action: "rotate", expiresInDays: 7 });
    await post(friend.context.request, baseURL!, "/api/rooms/join", { token: new URL(invite.url).hash.slice(1) });
    const session = await post(owner.context.request, baseURL!, `/api/rooms/${roomId}/sessions`, { problemCount: 2, durationMin: 30 });
    sessionId = session.id;
  });

  test.afterAll(async () => {
    await owner?.context.close();
    await friend?.context.close();
    const ids = [owner?.id, friend?.id].filter(Boolean);
    await pool.query("delete from rooms where created_by = any($1::uuid[])", [ids]);
    await pool.query("delete from users where id = any($1::uuid[])", [ids]);
    await pool.end();
  });

  test("rooms list and room tabs", async () => {
    test.setTimeout(120_000);
    const page = await owner.context.newPage();
    await checkPage(page, "/rooms", "h1");
    for (const tab of ["", "?tab=members", "?tab=settings"]) await checkPage(page, `/rooms/${roomId}${tab}`, "[data-testid=open-session-card]");
    await page.close();
  });

  test("lobby: host and member", async () => {
    test.setTimeout(120_000);
    const path = `/rooms/${roomId}/sessions/${sessionId}`;
    const host = await owner.context.newPage();
    await checkPage(host, path, "[data-testid=slot-list]");
    const guest = await friend.context.newPage();
    await checkPage(guest, path, "[data-testid=join-session]", [390, 1440]);
    await host.close();
    await guest.close();
  });

  test("live: night hero, timer, scoreboard matrix with a first solver", async ({ baseURL }) => {
    test.setTimeout(150_000);
    const base = `/api/rooms/${roomId}/sessions/${sessionId}`;
    await post(owner.context.request, baseURL!, `${base}/join`);
    await post(friend.context.request, baseURL!, `${base}/join`);
    await post(owner.context.request, baseURL!, `${base}/start`);
    const path = `/rooms/${roomId}/sessions/${sessionId}`;
    const page = await owner.context.newPage();
    // The matrix from lg, the Problems tab (legend) below it.
    await checkPage(page, path, "[data-testid=matrix-table]:visible, [data-testid=problem-list]:visible");

    // The friend solves problem 1 with its reference solution, judged by the harness's real worker
    // (a stubbed verdict on a queued row raced the worker); the owner's matrix shows it with "First".
    const { rows } = await pool.query<{ slug: string }>(
      "select p.slug from room_session_problems sp join problems p on p.id = sp.problem_id where sp.session_id = $1 and sp.position = 1",
      [sessionId],
    );
    const sub = await post(friend.context.request, baseURL!, `/api/problems/${rows[0]!.slug}/submit`, {
      language: "python",
      code: referenceSolution(rows[0]!.slug, "python"),
      roomSessionId: sessionId,
    });
    await expect
      .poll(async () => (await (await friend.context.request.get(`/api/submissions/${sub.id}`)).json()).status, {
        timeout: 60_000,
      })
      .toBe("accepted");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(path);
    const row = page.getByTestId(`score-row-${friend.username}`);
    await expect(row.locator('[data-cell-state="solved"]')).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText("First");
    await expect(page.getByRole("timer").first()).toBeVisible();
    await settle(page);
    await expectAxeClean(page);
    // Reduced motion: nothing runs (the timer colon and the live dots are static).
    const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length);
    expect(running).toBe(0);
    for (const width of [390, 768]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      await page.getByRole("tab", { name: "Scoreboard" }).click();
      await expect(page.getByTestId(width < 768 ? `score-card-${friend.username}` : `score-row-${friend.username}`)).toBeVisible();
      await settle(page);
      await expectNoOverflow(page, `live @${width}`);
      await expectAxeClean(page);
    }
    await page.close();
  });

  test("finished, results and member timeline", async ({ baseURL }) => {
    test.setTimeout(150_000);
    await post(owner.context.request, baseURL!, `/api/rooms/${roomId}/sessions/${sessionId}/end`);
    const page = await owner.context.newPage();
    await checkPage(page, `/rooms/${roomId}/sessions/${sessionId}`, "[data-testid=results-link]");
    await checkPage(page, `/rooms/${roomId}/sessions/${sessionId}/results`, "h1");
    await checkPage(page, `/rooms/${roomId}/members/${friend.username}`, "h1", [390, 1440]);
    await checkPage(page, `/rooms/${roomId}`, "[data-testid=open-session-card]", [390, 1440]);
    await page.close();
  });
});
