// Community C1 (docs/specs/community.md §D.3): comment, reply, vote, spoiler
// reveal before and after solving, report → moderator hides, axe on the
// Discussion tab and the moderation queue, no horizontal scroll at 320–1440,
// reduced motion, and the XSS corpus page in a real browser. The main e2e
// harness runs with COMMUNITY_ENABLED=1 (judge-off checks the flag off).
// Trust and "solved" are set straight in the e2e database (no judge needed);
// the community-e2e users are deleted afterwards.
import { randomUUID } from "node:crypto";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { Pool } from "pg";

import { e2eDatabaseUrl } from "../../e2e-support/db";

let poolRef: Pool | null = null;
const db = () => (poolRef ??= new Pool({ connectionString: e2eDatabaseUrl() }));
const created: string[] = [];

test.afterAll(async () => {
  if (created.length) await db().query("delete from users where username = any($1::text[])", [created]);
  await poolRef?.end();
  poolRef = null;
});

type Actor = { username: string; context: BrowserContext; page: Page };

async function signUp(browser: Browser, opts: { trusted?: boolean; solved?: boolean; role?: "admin" } = {}): Promise<Actor> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const username = `c1e_${randomUUID().slice(0, 8)}`;
  await page.goto("/register");
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
  created.push(username);
  if (opts.trusted) {
    await db().query("update users set created_at = now() - interval '5 days' where username = $1", [username]);
  }
  if (opts.solved) await markSolved(username);
  if (opts.role) await db().query("update users set role = $2 where username = $1", [username, opts.role]);
  return { username, context, page };
}

async function markSolved(username: string, slug = "two-sum") {
  await db().query(
    `insert into submissions (user_id, problem_id, kind, language, code, status, passed_count, total_count, finished_at)
     select u.id, p.id, 'submit', 'python', 'pass', 'accepted', 1, 1, now() from users u, problems p
     where u.username = $1 and p.slug = $2`,
    [username, slug],
  );
}

async function expectAxeClean(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const bad = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

async function noHorizontalScroll(page: Page, label: string) {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(150);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${label} at ${width}px`).toBeLessThanOrEqual(0);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

/** Opens the problem page's Discussion tab (desktop layout). */
async function openDiscussionTab(page: Page, slug = "two-sum") {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/problems/${slug}`);
  await page.getByTestId("discussion-tab-trigger").click();
  await expect(page.getByTestId("discussion-tab")).toBeVisible();
}

async function post(page: Page, scope: ReturnType<Page["locator"]>, text: string, spoiler = false, match = text.slice(0, 40)) {
  await scope.getByTestId("comment-body").fill(text);
  if (spoiler) await scope.getByTestId("spoiler-checkbox").click();
  await scope.getByTestId("comment-submit").click();
  await expect(page.locator("article[data-testid=comment]", { hasText: match }).first()).toBeVisible({ timeout: 15_000 });
}

test.describe.configure({ mode: "serial" });

test("comment, reply, vote; replies attach under the comment; focus moves to the new comment", async ({ browser }) => {
  const alice = await signUp(browser, { trusted: true, solved: true });
  const bob = await signUp(browser, { trusted: true, solved: true });
  const text = `Why look up before insert? ${randomUUID().slice(0, 6)}`;

  await alice.page.emulateMedia({ reducedMotion: "reduce" });
  await openDiscussionTab(alice.page);
  await post(alice.page, alice.page.getByTestId("discussion-tab"), text);
  // Focus lands on the new comment (§B.15).
  await expect
    .poll(() => alice.page.evaluate(() => document.activeElement?.getAttribute("data-testid")))
    .toBe("comment");
  // Reduced motion: nothing keeps animating after the post.
  await alice.page.waitForTimeout(400);
  expect(
    await alice.page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running" && Number(a.effect?.getTiming().iterations) !== Infinity).length),
  ).toBe(0);

  await bob.page.goto("/problems/two-sum/discuss?sort=new");
  const comment = bob.page.locator("article[data-testid=comment]", { hasText: text }).first();
  await comment.getByRole("button", { name: `Reply to ${alice.username}` }).first().click();
  const reply = `So the map never pairs i with itself ${randomUUID().slice(0, 6)}`;
  await post(bob.page, comment, reply);
  await expect(comment.getByRole("list", { name: `Replies to ${alice.username}` })).toContainText(reply);

  const up = comment.getByRole("button", { name: `Upvote comment by ${alice.username}` });
  const voted = bob.page.waitForResponse((r) => r.url().includes("/vote") && r.request().method() === "PUT");
  await up.click();
  expect((await voted).status()).toBe(200);
  await expect(up).toHaveAttribute("aria-pressed", "true");
  await expect(comment.getByTestId("vote-score").first()).toHaveText("1");
  await bob.page.reload();
  await expect(
    bob.page.locator("article[data-testid=comment]", { hasText: text }).first().getByRole("button", { name: `Upvote comment by ${alice.username}` }),
  ).toHaveAttribute("aria-pressed", "true");
  await alice.context.close();
  await bob.context.close();
});

test("spoiler: hidden (not in the HTML) until revealed or solved", async ({ browser }) => {
  const author = await signUp(browser, { trusted: true, solved: true });
  const reader = await signUp(browser, { trusted: true });
  const secret = `seen = {} secret-${randomUUID().slice(0, 6)}`;
  await openDiscussionTab(author.page);
  await post(author.page, author.page.getByTestId("discussion-tab"), `My full solution:\n\n\`\`\`python\n${secret}\n\`\`\``, true, "My full solution");

  const res = await reader.page.goto("/problems/two-sum/discuss?sort=new");
  expect(await res!.text()).not.toContain(secret);
  const card = reader.page.locator("article[data-testid=comment]", { hasText: "Contains a solution" }).first();
  const toggle = card.getByTestId("spoiler-toggle");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(card).toContainText(secret);

  await markSolved(reader.username);
  const solvedRes = await reader.page.goto("/problems/two-sum/discuss?sort=new");
  expect(await solvedRes!.text()).toContain(secret);
  await author.context.close();
  await reader.context.close();
});

test("report → the moderator hides it from the queue; axe and widths on the queue", async ({ browser }) => {
  const author = await signUp(browser, { trusted: true, solved: true });
  const reporter = await signUp(browser, { trusted: true, solved: true });
  const mod = await signUp(browser, { role: "admin" });
  const text = `Rude remark to report ${randomUUID().slice(0, 6)}`;
  await openDiscussionTab(author.page);
  await post(author.page, author.page.getByTestId("discussion-tab"), text);

  await reporter.page.goto("/problems/two-sum/discuss?sort=new");
  const comment = reporter.page.locator("article[data-testid=comment]", { hasText: text }).first();
  await comment.getByRole("button", { name: `Report comment by ${author.username}` }).click();
  const dialog = reporter.page.getByRole("dialog");
  await dialog.getByLabel("Harassment").check();
  await dialog.getByTestId("report-submit").click();
  await expect(dialog).toBeHidden();

  await mod.page.goto("/mod");
  const row = mod.page.getByTestId("mod-row").filter({ hasText: text });
  await expect(row).toContainText("Harassment");
  await expectAxeClean(mod.page);
  await noHorizontalScroll(mod.page, "/mod");
  await row.getByTestId("mod-hide").click();
  const confirm = mod.page.getByRole("dialog");
  await confirm.getByTestId("mod-reason").fill("Harassment");
  await confirm.getByTestId("mod-confirm").click();
  // Hiding resolves the reports: the row leaves "Open reports" (it is under "Held" now).
  await expect(mod.page.getByTestId("mod-row").filter({ hasText: text })).toHaveCount(0, { timeout: 10_000 });
  await mod.page.goto("/mod?tab=held");
  await expect(mod.page.getByTestId("mod-row").filter({ hasText: text })).toHaveCount(1);
  await mod.page.goto("/mod?tab=audit");
  await expect(mod.page.getByTestId("audit-log")).toContainText("hide");

  await reporter.page.reload();
  await expect(reporter.page.locator("article[data-testid=comment]", { hasText: text })).toHaveCount(0);
  // The author still sees it, with the review note.
  await author.page.goto("/problems/two-sum/discuss?sort=new");
  await expect(author.page.locator("article[data-testid=comment]", { hasText: text }).first()).toContainText("Waiting for review");
  await author.context.close();
  await reporter.context.close();
  await mod.context.close();
});

test("axe 0 serious/critical on the Discussion tab and the full page; no horizontal scroll", async ({ browser }) => {
  const viewer = await signUp(browser, { trusted: true, solved: true });
  await viewer.page.emulateMedia({ reducedMotion: "reduce" });
  await openDiscussionTab(viewer.page);
  await expectAxeClean(viewer.page);
  await viewer.page.goto("/problems/two-sum/discuss");
  await expectAxeClean(viewer.page);
  await noHorizontalScroll(viewer.page, "/problems/two-sum/discuss");
  for (const path of ["/legal/terms", "/legal/privacy", "/legal/content-policy", "/legal/report"]) {
    await viewer.page.goto(path);
    await expect(viewer.page.locator("h1")).toHaveCount(1);
    await expectAxeClean(viewer.page);
    await noHorizontalScroll(viewer.page, path);
  }
  await viewer.context.close();
});

test("the XSS corpus renders without dialogs, page errors or CSP violations", async ({ page }) => {
  const problems: string[] = [];
  page.on("dialog", (d) => {
    problems.push(`dialog: ${d.message()}`);
    void d.dismiss();
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) problems.push(`console: ${m.text()}`);
  });
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      (window as unknown as { __csp?: string[] }).__csp ??= [];
      (window as unknown as { __csp: string[] }).__csp.push(`${e.effectiveDirective} ${e.blockedURI}`);
    });
  });
  await page.goto("/dev-fixtures/community-xss");
  await expect(page.getByTestId("xss-case").first()).toBeVisible();
  expect(await page.getByTestId("xss-case").count()).toBeGreaterThanOrEqual(80);
  // Nothing active made it into the DOM.
  const active = await page.evaluate(() => {
    const root = document.querySelector("[data-testid=xss-corpus]")!;
    const bad = root.querySelectorAll("script, iframe, object, embed, img, svg, math, style, form, input, base, meta, link");
    const handlers = [...root.querySelectorAll("*")].filter((el) => [...el.attributes].some((a) => /^on/i.test(a.name)));
    const hrefs = [...root.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")!).filter((h) => /^\s*(javascript|data|vbscript):|^\/\//i.test(h));
    return { tags: bad.length, handlers: handlers.length, hrefs };
  });
  expect(active).toEqual({ tags: 0, handlers: 0, hrefs: [] });
  await page.waitForTimeout(500);
  const csp = await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []);
  expect([...problems, ...csp]).toEqual([]);
});
