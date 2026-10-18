// Rooms R5 e2e (docs/specs/rooms.md §4.5, §5.2; AC-S-HIS-1, AC-S-A11Y-1 for
// the history pages): finished sessions are inserted straight into the web
// server's database (the e2e harness database), so no judge is needed. Members
// see history, results, leaderboard and a timeline, open a shared solution,
// and an opted-out member's solution is not available; axe on whole pages in
// both themes. Users are *@example.test and deleted afterwards (cascade).
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { Pool } from "pg";

import { e2eDatabaseUrl } from "../../e2e-support/db";

const pool = new Pool({ connectionString: e2eDatabaseUrl() });
const PASSWORD = "correct-horse-battery";
const created: string[] = [];
const q = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
  (await pool.query(text, params)).rows as T[];

type U = { id: string; username: string };

async function register(browser: Browser, baseURL: string, username: string) {
  const context = await browser.newContext();
  const res = await context.request.post("/api/auth/register", {
    data: { email: `${username}@example.test`, username, password: PASSWORD },
    headers: { Origin: baseURL },
  });
  expect(res.status()).toBe(201);
  const [u] = await q<{ id: string }>("select id from users where username = $1", [username]);
  created.push(u.id);
  return { user: { id: u.id, username } as U, context };
}

/** A finished session; cells[user][i] = null | [wrongBefore, solveSeconds | null]. */
async function finishedSession(roomId: string, host: U, startedAt: Date, problemIds: { id: string; difficulty: string }[], cells: [U, ([number, number | null] | null)[]][]) {
  const endsAt = new Date(startedAt.getTime() + 90 * 60_000);
  const [s] = await q<{ id: string }>(
    `insert into room_sessions (room_id, host_id, status, duration_min, problem_count, settings, started_at, ends_at, ended_at, end_reason, created_at)
     values ($1, $2, 'finished', 90, $3, $4, $5, $6, $6, 'time', $5) returning id`,
    [roomId, host.id, problemIds.length, JSON.stringify({ tags: [], mixMode: "suggested", mix: { easy: 1, medium: 1, hard: 0 }, challenge: "balanced", avoidSolved: true }), startedAt, endsAt],
  );
  for (const [i, p] of problemIds.entries()) {
    await q("insert into room_session_problems (session_id, position, problem_id, difficulty) values ($1, $2, $3, $4)", [s.id, i + 1, p.id, p.difficulty]);
  }
  const totals: { u: U; solved: number; penalty: number }[] = [];
  for (const [u, row] of cells) {
    await q("insert into room_session_participants (session_id, user_id) values ($1, $2)", [s.id, u.id]);
    let solved = 0;
    let penalty = 0;
    for (const [i, c] of row.entries()) {
      if (!c) continue;
      const [wrong, sec] = c;
      let subId: string | null = null;
      let at: Date | null = null;
      if (sec !== null) {
        at = new Date(startedAt.getTime() + sec * 1000);
        const [sub] = await q<{ id: string }>(
          `insert into submissions (user_id, problem_id, room_session_id, kind, language, code, status, created_at, started_at, finished_at, runtime_ms, memory_kb, passed_count, total_count)
           values ($1, $2, $3, 'submit', 'python', $4, 'accepted', $5, $5, $5, 41, 16000, 10, 10) returning id`,
          [u.id, problemIds[i].id, s.id, `class Solution:\n    # ${u.username} solution ${i + 1}\n    pass\n`, at],
        );
        subId = sub.id;
        solved += 1;
        penalty += sec + 300 * wrong;
      }
      await q(
        `insert into room_session_results (session_id, user_id, position, attempts, wrong_before_accept, first_accepted_at, first_accepted_submission_id, solve_seconds)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [s.id, u.id, i + 1, wrong + (sec === null ? 0 : 1), wrong, at, subId, sec],
      );
    }
    totals.push({ u, solved, penalty });
  }
  totals.sort((a, b) => b.solved - a.solved || a.penalty - b.penalty);
  for (const [i, t] of totals.entries()) {
    await q("update room_session_participants set solved_count = $1, penalty_sec = $2, rank = $3 where session_id = $4 and user_id = $5", [t.solved, t.penalty, i + 1, s.id, t.u.id]);
  }
  return s.id;
}

/**
 * axe on the whole page. Known, tracked elsewhere (fixed in the user menu by
 * Rooms R4): the header account-menu trigger's label-content-name-mismatch.
 * Only that rule on nodes inside the site header is skipped.
 */
async function expectNoSeriousAxe(page: Page) {
  // Enter animations (Reveal fades) would read as low contrast mid-flight.
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => null))));
  const { violations } = await new AxeBuilder({ page }).analyze();
  const found: string[] = [];
  for (const v of violations) {
    if (v.impact !== "serious" && v.impact !== "critical") continue;
    for (const n of v.nodes) {
      const selector = n.target.join(" ");
      if (v.id === "label-content-name-mismatch") {
        const inHeader = await page.locator(selector).evaluate((el) => el.closest("header") !== null);
        if (inHeader) continue;
      }
      found.push(`${v.id}: ${selector}`);
    }
  }
  expect(found).toEqual([]);
}

async function bothThemes(page: Page, check: () => Promise<void>) {
  await page.emulateMedia({ colorScheme: "light" });
  await check();
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  await check();
  await page.emulateMedia({ colorScheme: "light" });
}

test.afterAll(async () => {
  if (created.length) await pool.query("delete from users where id = any($1::uuid[])", [created]);
  await pool.end();
});

test("members browse history, results, solutions, leaderboard and a timeline", async ({ browser, baseURL }) => {
  const suffix = Date.now().toString(36).slice(-6);
  const { user: ann, context: annCtx } = await register(browser, baseURL!, `ann_${suffix}`);
  const { user: ben, context: benCtx } = await register(browser, baseURL!, `ben_${suffix}`);
  const { user: cat, context: catCtx } = await register(browser, baseURL!, `cat_${suffix}`);
  const { context: eveCtx } = await register(browser, baseURL!, `eve_${suffix}`);

  const [room] = await q<{ id: string }>("insert into rooms (name, created_by) values ('E2E History Club', $1) returning id", [ann.id]);
  await q("insert into room_members (room_id, user_id, role) values ($1, $2, 'owner'), ($1, $3, 'member'), ($1, $4, 'member')", [room.id, ann.id, ben.id, cat.id]);
  await q("update room_members set share_solutions = false where room_id = $1 and user_id = $2", [room.id, cat.id]);
  const problems = await q<{ id: string; difficulty: string; title: string }>(
    "(select id, difficulty, title from problems where published and difficulty = 'easy' order by number limit 1) union all (select id, difficulty, title from problems where published and difficulty = 'medium' order by number limit 1)",
  );
  expect(problems).toHaveLength(2);
  const day = 24 * 60 * 60_000;
  await finishedSession(room.id, ben, new Date(Date.now() - 14 * day), problems, [
    [ann, [[0, 300], null]],
    [ben, [[1, 600], [0, 1800]]],
  ]);
  const latest = await finishedSession(room.id, ann, new Date(Date.now() - 7 * day), problems, [
    [ann, [[0, 370], [1, 1470]]],
    [ben, [[0, 240], [1, null]]],
    [cat, [[1, 720], [0, 2100]]],
  ]);
  const roomPath = `/rooms/${room.id}`;
  const resultsPath = `${roomPath}/sessions/${latest}/results`;

  // History (Sessions tab, default).
  const pb = await benCtx.newPage();
  const errors: string[] = [];
  pb.on("pageerror", (e) => errors.push(String(e)));
  await pb.goto(roomPath);
  const table = pb.getByTestId("history-table");
  await expect(table.getByRole("row")).toHaveCount(3); // header + 2
  await expect(table.getByRole("row").nth(1)).toContainText(ann.username); // newest: ann won
  await expect(table.getByRole("row").nth(1)).toContainText("1/2, rank 3");
  await bothThemes(pb, () => expectNoSeriousAxe(pb));

  // Results: open the newest session from the list.
  await table.getByRole("row").nth(1).getByRole("link").first().click();
  await expect(pb).toHaveURL(new RegExp(`${resultsPath}$`));
  await expect(pb.getByRole("heading", { level: 1 })).toContainText("Results");
  const results = pb.getByTestId("results-table");
  const annRow = results.locator(`tr[data-user="${ann.username}"]`);
  await expect(annRow).toContainText("35:40"); // 370 + 1470 + 300 = 2140 s
  await expect(annRow.getByTestId("penalty-breakdown")).toContainText("5:00 for 1 wrong attempt");
  await expect(results.locator(`tr[data-user="${ben.username}"]`).getByTestId("first-solver")).toHaveCount(1);
  // Cat opted out: no link, a visible reason.
  const catRow = results.locator(`tr[data-user="${cat.username}"]`);
  await expect(catRow.getByTestId("view-solution")).toHaveCount(0);
  await expect(catRow.getByTestId("solution-hidden").first()).toHaveText("Hidden by its author");
  await bothThemes(pb, () => expectNoSeriousAxe(pb));

  // Keyboard: tab to ann's first "View solution" link and open it.
  const link = annRow.getByTestId("view-solution").first();
  await link.focus();
  await expect(link).toBeFocused();
  await pb.keyboard.press("Enter");
  await expect(pb).toHaveURL(new RegExp(`${resultsPath.replace("/results", "")}/solutions/${ann.username}/1$`));
  await expect(pb.getByTestId("code-viewer")).toContainText(`${ann.username} solution 1`);
  await bothThemes(pb, () => expectNoSeriousAxe(pb));

  // The hidden one is not available, even by URL.
  const hidden = await pb.goto(`${roomPath}/sessions/${latest}/solutions/${cat.username}/1`);
  expect(hidden?.status()).toBe(404);
  // Cat can still open her own code.
  const pc = await catCtx.newPage();
  const own = await pc.goto(`${roomPath}/sessions/${latest}/solutions/${cat.username}/1`);
  expect(own?.status()).toBe(200);

  // Leaderboard: ann 3 solved over 2 sessions, ben 3 too but lower rate? (ann 3/4, ben 3/4 → tie).
  await pb.goto(`${roomPath}?tab=leaderboard`);
  const lb = pb.getByTestId("leaderboard-table");
  await expect(lb.locator(`tr[data-user="${ann.username}"]`)).toContainText("75%");
  await expect(lb.locator(`tr[data-user="${cat.username}"]`)).toContainText("100%");
  await expect(pb.getByTestId("difficulty-profile")).toBeVisible();
  await pb.getByTestId("leaderboard-range").click();
  await pb.getByRole("option", { name: "All time" }).click();
  await expect(pb).toHaveURL(/range=all/);
  await bothThemes(pb, () => expectNoSeriousAxe(pb));

  // Timeline.
  await lb.getByRole("link", { name: ann.username }).click();
  await expect(pb).toHaveURL(new RegExp(`${roomPath}/members/${ann.username}$`));
  await expect(pb.getByRole("heading", { level: 1 })).toHaveText(ann.username);
  await expect(pb.getByTestId("timeline-list").getByRole("listitem").first()).toContainText("(24:30, 1 wrong)");
  await expect(pb.getByTestId("progress-chart")).toBeVisible();
  await bothThemes(pb, () => expectNoSeriousAxe(pb));

  // Outsider: 404 everywhere.
  const pe = await eveCtx.newPage();
  for (const path of [roomPath, resultsPath, `${roomPath}/members/${ann.username}`, `${roomPath}/sessions/${latest}/solutions/${ann.username}/1`]) {
    expect((await pe.goto(path))?.status()).toBe(404);
  }
  expect(errors).toEqual([]);
  await Promise.all([annCtx.close(), benCtx.close(), catCtx.close(), eveCtx.close()]);
});
