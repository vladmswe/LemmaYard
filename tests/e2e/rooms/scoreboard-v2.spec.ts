// Rooms v2 scoreboard e2e (docs/specs/rooms-v2.md §3, AC-V2-MX-1/4/5/6):
// sessions are seeded straight into the harness database (no judge needed).
// A live N = 8 session with a submit "being judged" (a running row no worker
// owns) and finished N = 1 and N = 5 sessions: the matrix variant per N, the
// Judging… cell, no horizontal page scroll at 320–1440, axe on whole pages
// (live, results, room tabs), the Timeline markers, the keyboard reaching
// the code links, reduced motion, and ?tab=leaderboard → Members.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { Pool } from "pg";

import { e2eDatabaseUrl } from "../../e2e-support/db";

const pool = new Pool({ connectionString: e2eDatabaseUrl() });
const PASSWORD = "correct-horse-battery";
const created: string[] = [];
const q = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
  (await pool.query(text, params)).rows as T[];
const MIN = 60_000;
const WIDTHS = [320, 360, 390, 768, 1024, 1440];

type U = { id: string; username: string };

async function register(browser: Browser, baseURL: string, username: string) {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const res = await context.request.post("/api/auth/register", {
    data: { email: `${username}@example.test`, username, password: PASSWORD },
    headers: { Origin: baseURL },
  });
  expect(res.status()).toBe(201);
  const [u] = await q<{ id: string }>("select id from users where username = $1", [username]);
  created.push(u.id);
  return { user: { id: u.id, username } as U, context };
}

type Cell = [wrong: number, solveSeconds: number | null] | null;

/** A session with `status`; cells[user][i] = null | [wrongBefore, solveSeconds | null]. Returns the id. */
async function seedSession(
  roomId: string,
  host: U,
  status: "live" | "finished",
  durationMin: number,
  problems: { id: string; difficulty: string }[],
  cells: [U, Cell[]][],
) {
  const startedAt = new Date(Date.now() - (status === "live" ? 20 : 3 * 60) * MIN);
  const endsAt = new Date(startedAt.getTime() + durationMin * MIN);
  const [s] = await q<{ id: string }>(
    `insert into room_sessions (room_id, host_id, status, duration_min, problem_count, settings, started_at, ends_at, ended_at, end_reason, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $7) returning id`,
    [
      roomId,
      host.id,
      status,
      durationMin,
      problems.length,
      JSON.stringify({ tags: [], mixMode: "suggested", mix: { easy: problems.length, medium: 0, hard: 0 }, challenge: "balanced", avoidSolved: true }),
      startedAt,
      endsAt,
      status === "finished" ? endsAt : null,
      status === "finished" ? "time" : null,
    ],
  );
  for (const [i, p] of problems.entries()) {
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
      const at = sec === null ? null : new Date(startedAt.getTime() + sec * 1000);
      if (sec !== null) {
        const [sub] = await q<{ id: string }>(
          `insert into submissions (user_id, problem_id, room_session_id, kind, language, code, status, created_at, started_at, finished_at, runtime_ms, memory_kb, passed_count, total_count)
           values ($1, $2, $3, 'submit', 'python', 'class Solution:\n    pass\n', 'accepted', $4, $4, $4, 41, 16000, 10, 10) returning id`,
          [u.id, problems[i].id, s.id, at],
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

async function expectNoSeriousAxe(page: Page) {
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => null))));
  const { violations } = await new AxeBuilder({ page }).analyze();
  const bad = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

async function expectNoOverflow(page: Page, label: string) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  expect(sw, `${label}: scrollWidth ${sw} > ${iw}`).toBeLessThanOrEqual(iw);
}

/** Every width: no horizontal page scroll; axe at 390 and 1440. */
async function sweep(page: Page, path: string, ready: string) {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(path);
    await page.locator(ready).first().waitFor();
    await expectNoOverflow(page, `${path} @${width}`);
    if (width === 390 || width === 1440) await expectNoSeriousAxe(page);
  }
}

test.afterAll(async () => {
  if (created.length) {
    await pool.query("delete from rooms where created_by = any($1::uuid[])", [created]);
    await pool.query("delete from users where id = any($1::uuid[])", [created]);
  }
  await pool.end();
});

test("matrix for N = 1, 5 and 8: variants, judging cell, results, room tabs, no overflow, axe", async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  const suffix = Date.now().toString(36).slice(-6);
  const { user: ann, context } = await register(browser, baseURL!, `mx_ann_${suffix}`);
  const { user: ben } = await register(browser, baseURL!, `mx_ben_${suffix}`);
  const { user: cat } = await register(browser, baseURL!, `mx_cat_${suffix}`);
  const [room] = await q<{ id: string }>("insert into rooms (name, created_by) values ('E2E Matrix Club', $1) returning id", [ann.id]);
  await q("insert into room_members (room_id, user_id, role) values ($1, $2, 'owner'), ($1, $3, 'member'), ($1, $4, 'member')", [room.id, ann.id, ben.id, cat.id]);
  const problems = await q<{ id: string; difficulty: string }>("select id, difficulty from problems where published order by number limit 8");
  expect(problems).toHaveLength(8);
  const roomPath = `/rooms/${room.id}`;

  const one = await seedSession(room.id, ann, "finished", 45, problems.slice(0, 1), [
    [ann, [[0, 860]]],
    [ben, [[1, 1565]]],
    [cat, [[2, null]]],
  ]);
  const five = await seedSession(room.id, ann, "finished", 120, problems.slice(0, 5), [
    [ann, [[0, 230], [0, 620], [1, 1740], [1, 4300], [2, null]]],
    [ben, [[0, 315], [0, 940], [1, 5290], [0, 3510], [0, 6980]]],
    [cat, [[1, 270], [0, 1330], [0, 2825], [1, null], null]],
  ]);
  const live = await seedSession(room.id, ann, "live", 180, problems, [
    [ann, [[0, 300], [1, 1260], null, null, null, null, null, null]],
    [ben, [[0, 540], null, [0, 1560], null, null, null, null, null]],
    [cat, [[1, null], null, null, null, null, null, null, null]],
  ]);
  // Cat's second attempt on Problem 1 is being judged: a running row no worker owns.
  await q(
    "insert into submissions (user_id, problem_id, room_session_id, kind, language, code, status, started_at) values ($1, $2, $3, 'submit', 'python', 'pass', 'running', now())",
    [cat.id, problems[0].id, live],
  );

  const page = await context.newPage();

  // Live, N = 8: compact variant, the judging cell, the viewer's chips.
  const livePath = `${roomPath}/sessions/${live}`;
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(livePath);
  await expect(page.getByTestId("scoreboard")).toHaveAttribute("data-variant", "compact");
  const catRow = page.getByTestId(`score-row-${cat.username}`);
  await expect(catRow.locator('[data-position="1"]')).toHaveAttribute("data-cell-state", "judging");
  await expect(catRow.locator('[data-position="1"]')).toContainText("Problem 1: a submission is being judged");
  await expect(page.getByTestId("activity-judging")).toContainText(`${cat.username} submitted Problem 1 · judging…`);
  await expect(page.getByTestId("you-chips").first()).toHaveAttribute("data-chips", "1✓ 2✓ 3· 4· 5· 6· 7· 8·");
  await expect(page.getByTestId(`score-row-${ann.username}`).locator('[data-position="2"]')).toContainText("+16:00");
  await expect(page.getByRole("table", { name: /Scoreboard: who solved which problem and when/ })).toBeVisible();
  // Reduced motion: the judging spinner and the timer do not animate.
  expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length)).toBe(0);
  await sweep(page, livePath, "[data-testid=matrix-table]:visible, [data-testid=problem-list]:visible");
  // Mobile: per-person cards with the judging cell.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("tab", { name: "Scoreboard" }).click();
  await expect(page.getByTestId(`score-card-${cat.username}`).locator('[data-cell-state="judging"]')).toBeVisible();
  await q("delete from submissions where room_session_id = $1 and status = 'running'", [live]);

  // Results, N = 1 (wide, axis) and N = 5 (narrow).
  for (const [id, variant, marks] of [
    [one, "wide", 2],
    [five, "narrow", 12],
  ] as const) {
    const path = `${roomPath}/sessions/${id}/results`;
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(path);
    await expect(page.getByTestId("scoreboard")).toHaveAttribute("data-variant", variant);
    await expect(page.getByTestId("timeline-mark")).toHaveCount(marks);
    await expect(page.getByTestId("result-facts")).toBeVisible();
    await expect(page.getByTestId("rating-change")).toHaveCount(0); // slot: no ratings yet
    await sweep(page, path, "[data-testid=result-facts]");
  }

  // Keyboard: Tab reaches a "code" link in the results matrix.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${roomPath}/sessions/${one}/results`);
  let reached = false;
  for (let i = 0; i < 60 && !reached; i++) {
    await page.keyboard.press("Tab");
    reached = await page.evaluate(() => document.activeElement?.getAttribute("data-testid") === "view-solution");
  }
  expect(reached).toBe(true);

  // Room tabs: Sessions (mini-matrices), Members, Settings; the v1 Leaderboard URL redirects.
  await sweep(page, roomPath, "[data-testid=history-cards]");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(roomPath);
  await expect(page.getByTestId("mini-matrix")).toHaveCount(2);
  await sweep(page, `${roomPath}?tab=members`, "[data-testid=room-members]");
  await sweep(page, `${roomPath}?tab=settings`, "[data-testid=room-settings]");
  await page.goto(`${roomPath}?tab=leaderboard&range=all`);
  await expect(page).toHaveURL(/tab=members&range=all/);
  await expect(page.getByText("Room difficulty profile")).toHaveCount(0);
  await page.goto(`${roomPath}/members/${ben.username}`);
  await expect(page.getByText("Progress over time")).toHaveCount(0);
  await expect(page.getByTestId("timeline-chips").first()).toBeVisible();
  await expectNoSeriousAxe(page);
  await context.close();
});
