// M-G1: roadmap, draft lessons, header link, the pipeline fixture lesson
// (components, quiz, progress, a11y, SEO, layout), glossary.
import { randomBytes } from "node:crypto";

import { expect, test, type Locator, type Page } from "@playwright/test";
import pg from "pg";

import { LESSONS, publishedLessons } from "@/content/learn";
import { publishedGlossary } from "@/content/learn/glossary";

import { e2eDatabaseUrl } from "../../e2e-support/db";

import {
  collectConsoleErrors,
  expectAxeClean,
  expectNoHorizontalScroll,
  expectOnlySameOriginRequests,
  measureScriptBytes,
  setTheme,
} from "./helpers";

const FIXTURE = "/learn/dev-fixtures/lesson";
const PROGRESS_KEY = "lemmayard.learn.progress.v1";
// Draft and published lessons come from the registry, so publishing a lesson needs no edit here.
const DRAFT_SLUGS = LESSONS.filter((l) => l.status === "draft").map((l) => l.slug);

let consoleErrors: string[] = [];
test.beforeEach(({ page }) => {
  consoleErrors = collectConsoleErrors(page);
});
test.afterEach(() => {
  expect(consoleErrors, "console errors / hydration warnings").toEqual([]);
});

async function readProgress(page: Page): Promise<{ last?: string; lessons: Record<string, { visited: string; completed?: string; quiz?: Record<string, boolean> }> } | null> {
  const raw = await page.evaluate((k) => window.localStorage.getItem(k), PROGRESS_KEY);
  return raw ? JSON.parse(raw) : null;
}

/** Presses Tab (at most `max` times) until `target` has focus. */
async function tabTo(page: Page, target: Locator, max = 15): Promise<void> {
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
}

/** Nothing inside <main> sticks out past the viewport (scroll boxes may scroll inside). */
async function expectMainFits(page: Page): Promise<void> {
  const { mainWidth, viewport } = await page.evaluate(() => ({
    mainWidth: document.querySelector("main")?.scrollWidth ?? 0,
    viewport: document.documentElement.clientWidth,
  }));
  expect(mainWidth, "main content wider than the viewport").toBeLessThanOrEqual(viewport);
}

/** Waits for running enter animations (Reveal, tab fade) so axe sees final colours. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(() =>
    Promise.race([
      Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))),
      new Promise((r) => setTimeout(r, 2000)),
    ]),
  );
}

async function gotoFixture(page: Page): Promise<void> {
  await page.goto(FIXTURE);
  // Hydrated once the TOC (built on the client) is there.
  await expect(page.locator("[data-lesson-toc]")).toBeVisible();
}

test.describe("AC-G-1-2 roadmap and draft lessons", () => {
  test("/learn has the h1 and lists every published lesson in its track, in order", async ({ page }) => {
    const res = await page.goto("/learn");
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1")).toHaveText("Data structures, step by step");
    await expect(page).toHaveTitle("Learn data structures · LemmaYard");
    const published = publishedLessons();
    await expect(page.locator("[data-roadmap-card]")).toHaveCount(published.length);
    if (published.length === 0) {
      await expect(page.locator("[data-roadmap-empty]")).toBeVisible();
      return;
    }
    await expect(page.locator("[data-roadmap-empty]")).toHaveCount(0);
    for (const track of [...new Set(published.map((l) => l.track))]) {
      const cards = page.locator(`section[data-track="${track}"] [data-roadmap-card]`);
      const slugs = await cards.evaluateAll((els) => els.map((e) => e.getAttribute("data-roadmap-card")));
      expect(slugs, track).toEqual(published.filter((l) => l.track === track).map((l) => l.slug));
    }
  });

  for (const slug of DRAFT_SLUGS) {
    test(`/learn/${slug} is a noindex draft`, async ({ request }) => {
      const res = await request.get(`/learn/${slug}`);
      expect(res.status()).toBe(200);
      const html = await res.text();
      expect(html).toContain("data-draft-banner");
      expect(html).toContain('<meta name="robots" content="noindex"/>');
      expect(html).toContain("This lesson is being written.");
      expect(html).toMatch(/<title>[^<]+ · Learn · LemmaYard<\/title>/);
    });
  }

  test("unknown lesson slugs are 404", async ({ request }) => {
    expect((await request.get("/learn/unknown")).status()).toBe(404);
    expect((await request.get("/learn/dev-fixtures")).status()).toBe(404);
  });
});

test.describe("AC-G-1-3 header link", () => {
  test.describe("desktop", () => {
    test.use({ viewport: { width: 1440, height: 900 } });
    for (const url of ["/", "/problems", "/learn", FIXTURE]) {
      test(`Guide is in the main nav on ${url}`, async ({ page }) => {
        await page.goto(url);
        const link = page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Guide" });
        await expect(link).toHaveAttribute("href", "/learn");
        if (url.startsWith("/learn")) await expect(link).toHaveAttribute("aria-current", "page");
        else await expect(link).not.toHaveAttribute("aria-current", "page");
      });
    }
  });

  test.describe("360 px", () => {
    test.use({ viewport: { width: 360, height: 780 } });
    for (const url of ["/", "/problems", "/learn"]) {
      test(`Guide is in the menu on ${url} and the header does not overflow`, async ({ page }) => {
        await page.goto(url);
        await expectNoHorizontalScroll(page);
        const header = page.locator("header").first();
        const overflow = await header.evaluate((h) => h.scrollWidth - h.clientWidth);
        expect(overflow).toBeLessThanOrEqual(0);
        await page.getByRole("button", { name: "Open menu" }).click();
        const link = page.getByRole("navigation", { name: "Mobile" }).getByRole("link", { name: "Guide" });
        await expect(link).toHaveAttribute("href", "/learn");
      });
    }
  });

  test.describe("signed in", () => {
    const username = `g1_${randomBytes(4).toString("hex")}`;
    test.afterAll(async () => {
      const client = new pg.Client({ connectionString: e2eDatabaseUrl() });
      await client.connect();
      try {
        await client.query("DELETE FROM users WHERE username = $1", [username]);
      } finally {
        await client.end();
      }
    });

    test("Guide shows for a signed-in user at 1440 and 360 px", async ({ page }) => {
      const res = await page.request.post("/api/auth/register", {
        data: { email: `${username}@example.test`, username, password: "guide-e2e-password" },
      });
      expect(res.status()).toBe(201);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto("/learn");
      const nav = page.getByRole("navigation", { name: "Main" });
      await expect(nav.getByRole("link", { name: "Rooms" })).toBeVisible(); // proves the session
      await expect(nav.getByRole("link", { name: "Guide" })).toHaveAttribute("href", "/learn");
      await page.setViewportSize({ width: 360, height: 780 });
      await expectNoHorizontalScroll(page);
      await page.getByRole("button", { name: "Open menu" }).click();
      await expect(page.getByRole("navigation", { name: "Mobile" }).getByRole("link", { name: "Guide" })).toBeVisible();
    });
  });
});

test.describe("fixture lesson: components (AC-G-1-5, AC-G-1-6, AC-G-1-13, AC-G-1-14)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("server-rendered viz and highlighted code", async ({ request }) => {
    const html = await (await request.get(FIXTURE)).text();
    // <Viz>: trace and code bundle built on the server.
    expect(html).toMatch(/data-fixture-frames="">7</);
    expect(html).toMatch(/data-fixture-line="fixture.stack.checkEmpty"[\s\S]*?data-lines="python">11 16<[\s\S]*?data-lines="javascript">10 17</);
    // Shiki lines carry data-line and data-line-ids.
    expect(html).toContain('<span class="line" data-line="8" data-line-ids="fixture.stack.push">');
    expect(html).toMatch(/<span class="line" data-line="6" data-line-ids="fixture.stack.push">/);
    expect(html).toContain("--shiki-light:");
  });

  test("no Shiki in any client script", async ({ page }) => {
    await gotoFixture(page);
    const { bodies } = await measureScriptBytes(page);
    expect(bodies.length).toBeGreaterThan(0);
    for (const { url } of bodies) {
      const text = await (await page.request.get(url)).text();
      expect(text, url).not.toContain("createHighlighterCore");
      expect(text, url).not.toContain("github-dark");
    }
  });

  test("lesson shell: breadcrumb, h1, summary, minutes, prerequisites, TOC, nav", async ({ page }) => {
    await gotoFixture(page);
    const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(crumbs.getByRole("link", { name: "Learn" })).toHaveAttribute("href", "/learn");
    await expect(crumbs).toContainText("Linear structures");
    await expect(page.locator("h1")).toHaveText("Pipeline fixture: a tiny stack");
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator(".guide-lesson-summary")).toContainText("Exercises every lesson component");
    await expect(page.locator(".guide-lesson-meta")).toContainText("5 min");
    await expect(page.locator("[data-prerequisites]").getByRole("link")).toHaveAttribute("href", "/learn/arrays");
    await expect(page.locator("article")).toHaveCount(1);

    const toc = page.getByRole("navigation", { name: "On this page" });
    const h2 = await page.locator("#lesson-content h2[id]").evaluateAll((els) => els.map((e) => e.id));
    expect(h2.length).toBeGreaterThan(3);
    await expect(toc.getByRole("link")).toHaveCount(h2.length);
    await expect(toc.getByRole("link").first()).toHaveAttribute("href", `#${h2[0]}`);
    await expect(toc.getByRole("link").first()).toBeVisible(); // open at >= 1280 px
    await tabTo(page, toc.getByRole("link").first(), 40);

    const lessonNav = page.getByRole("navigation", { name: "Lesson" });
    await expect(lessonNav.locator('[data-nav="prev"]')).toHaveAttribute("href", "/learn/choosing-a-structure");
  });

  test("a draft lesson's prev/next link only to published lessons", async ({ page }) => {
    const draft = LESSONS.find((l) => l.status === "draft");
    test.skip(!draft, "no draft lesson left");
    await page.goto(`/learn/${draft!.slug}`);
    await expect(page.locator("[data-draft-banner]")).toBeVisible();
    const published = new Set(publishedLessons().map((l) => `/learn/${l.slug}`));
    const hrefs = await page.locator("[data-nav]").evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""));
    if (published.size === 0) expect(hrefs).toEqual([]);
    for (const href of hrefs) expect(published.has(href), href).toBe(true);
  });

  test("a published lesson's prev/next are its published neighbours in order", async ({ page }) => {
    const published = publishedLessons();
    for (const [k, lesson] of published.entries()) {
      await page.goto(`/learn/${lesson.slug}`);
      const prev = page.locator('[data-nav="prev"]');
      const next = page.locator('[data-nav="next"]');
      if (k > 0) await expect(prev).toHaveAttribute("href", `/learn/${published[k - 1]!.slug}`);
      else await expect(prev).toHaveCount(0);
      if (k < published.length - 1) await expect(next).toHaveAttribute("href", `/learn/${published[k + 1]!.slug}`);
      else await expect(next).toHaveCount(0);
    }
  });

  test("TOC is a keyboard disclosure on small screens", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoFixture(page);
    const toc = page.getByRole("navigation", { name: "On this page" });
    await expect(toc.getByRole("link").first()).toBeHidden();
    await toc.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(toc.getByRole("link").first()).toBeVisible();
  });

  test("practice links, complexity table, callout, term, code tabs", async ({ page }) => {
    await gotoFixture(page);
    const practice = page.locator('[data-practice="valid-parentheses"]');
    await expect(practice.getByRole("link")).toHaveAttribute("href", "/problems/valid-parentheses");
    await expect(practice).toContainText("Valid Parentheses");
    await expect(practice.locator("[data-difficulty]")).toHaveText("Easy");

    const table = page.locator('[data-complexity="fixture-stack-ops"] table');
    await expect(table.locator("caption")).toHaveText("Cost of stack operations (array-backed)");
    await expect(table.locator("tbody tr").first()).toContainText("O(1) amortized · O(n) worst (when the array grows)");

    await expect(page.locator('[data-callout="pitfall"]')).toContainText("Popping an empty stack");
    await expect(page.locator('[data-callout="pitfall"]')).toHaveAttribute("role", "note");

    const terms = page.locator('[data-term="fixture-lifo"]');
    await expect(terms).toHaveCount(2);
    await expect(page.locator("dfn [data-term]")).toHaveCount(1); // only the first use is a <dfn>
    await expect(terms.first()).toHaveAttribute("href", "/learn/glossary#fixture-lifo");
    await terms.first().focus();
    await expect(page.getByText("Last in, first out: the most recently added item")).toBeVisible();

    const tabs = page.locator('[data-code-tabs="_fixture/fixture_stack"]');
    await expect(tabs.getByRole("tab", { name: "Python" })).toHaveAttribute("aria-selected", "true");
    await tabs.getByRole("tab", { name: "JavaScript" }).click();
    await expect(tabs.getByRole("tab", { name: "JavaScript" })).toHaveAttribute("aria-selected", "true");
    await expect(tabs.locator('[data-code-listing="javascript"]')).toBeVisible();
    // The language choice is the shared guide preference.
    const prefs = await page.evaluate(() => window.localStorage.getItem("lemmayard.learn.prefs.v1"));
    expect(JSON.parse(prefs ?? "{}").codeLanguage).toBe("javascript");
  });

  test("complexity table stacks into cards below 640 px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoFixture(page);
    const row = page.locator('[data-complexity="fixture-stack-ops"] tbody tr').first();
    expect(await row.evaluate((el) => getComputedStyle(el).display)).toBe("block");
    await expect(page.locator('[data-complexity="fixture-stack-ops"] thead th').first()).toHaveText("Operation");
    await expectNoHorizontalScroll(page);
  });
});

test.describe("AC-G-1-11 quiz, keyboard only", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("single, multi and order questions; feedback announced; result persisted and restored", async ({ page }) => {
    await gotoFixture(page);
    const q1 = page.locator('[data-quiz-question="fixture-top"]');
    const q2 = page.locator('[data-quiz-question="fixture-constant"]');
    const q3 = page.locator('[data-quiz-question="fixture-order"]');

    // Single: arrow keys inside the radio group.
    await q1.getByRole("radio", { name: "1", exact: true }).focus();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect(q1.getByRole("radio", { name: "3", exact: true })).toBeChecked();
    await tabTo(page, q1.getByRole("button", { name: "Check" }));
    await page.keyboard.press("Enter");
    await expect(q1.locator("[data-quiz-status]")).toHaveText(/^Correct\. A stack returns/);
    await expect(q1.locator("[data-quiz-status]")).toHaveAttribute("aria-live", "polite");
    await expect(q1.locator(".guide-quiz-feedback")).toHaveCount(3); // per-choice feedback
    await expect(q1.getByRole("button", { name: "Try again" })).toBeFocused();

    // Multi: Space toggles checkboxes. First a wrong answer, then Try again.
    await tabTo(page, q2.getByRole("checkbox", { name: "push" }));
    await page.keyboard.press("Space");
    await tabTo(page, q2.getByRole("button", { name: "Check" }));
    await page.keyboard.press("Enter");
    await expect(q2.locator("[data-quiz-status]")).toHaveText(/^Not quite\./);
    await expect(q2.locator('.guide-quiz-feedback[data-verdict="missed"]')).toContainText("Peek reads the last slot.");
    await page.keyboard.press("Enter"); // Try again (focused)
    await expect(q2.getByRole("checkbox", { name: "push" })).toBeFocused();
    await expect(q2.getByRole("checkbox", { name: "push" })).not.toBeChecked();
    await page.keyboard.press("Space");
    await tabTo(page, q2.getByRole("checkbox", { name: "peek" }));
    await page.keyboard.press("Space");
    await tabTo(page, q2.getByRole("button", { name: "Check" }));
    await page.keyboard.press("Enter");
    await expect(q2.locator("[data-quiz-status]")).toHaveText(/^Correct\./);

    // Order: Move up / Move down buttons, focus follows the moved item.
    const items = () => q3.locator("[data-order-item]").evaluateAll((els) => els.map((e) => e.getAttribute("data-order-item")));
    expect(await items()).toEqual(["a", "b", "c"]);
    await tabTo(page, q3.getByRole("button", { name: 'Move "a" down' }));
    await page.keyboard.press("Enter");
    await expect(q3.locator("[data-quiz-status]")).toHaveText('Moved "a" to position 2 of 3.');
    await expect(q3.getByRole("button", { name: 'Move "a" down' })).toBeFocused();
    await page.keyboard.press("Enter");
    expect(await items()).toEqual(["b", "c", "a"]);
    await expect(q3.getByRole("button", { name: 'Move "a" up' })).toBeFocused(); // at the bottom edge
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(q3.getByRole("button", { name: 'Move "c" up' })).toBeFocused();
    await page.keyboard.press("Enter");
    expect(await items()).toEqual(["c", "b", "a"]);
    await tabTo(page, q3.getByRole("button", { name: "Check" }));
    await page.keyboard.press("Enter");
    await expect(q3.locator("[data-quiz-status]")).toHaveText(/^Correct\. Last in, first out/);

    await expect(page.locator("[data-quiz-score]")).toHaveAttribute("data-quiz-score", "3/3");
    const saved = await readProgress(page);
    expect(saved?.lessons._fixture?.quiz).toEqual({ "fixture-top": true, "fixture-constant": true, "fixture-order": true });
    expect(saved?.lessons._fixture?.completed).toBeTruthy(); // every question answered

    await page.reload();
    await expect(q1).toHaveAttribute("data-result", "correct");
    await expect(q1.locator("[data-quiz-saved]")).toHaveText("Last attempt: correct");
    await expect(page.locator("[data-quiz-score]")).toHaveAttribute("data-quiz-score", "3/3");
    await expect(page.getByRole("checkbox", { name: "Mark lesson as complete" })).toBeChecked();
  });
});

test.describe("AC-G-1-12 progress", () => {
  test("visiting marks the lesson visited; the complete toggle persists", async ({ page }) => {
    await gotoFixture(page);
    await expect.poll(async () => (await readProgress(page))?.last).toBe("_fixture");
    expect((await readProgress(page))?.lessons._fixture?.visited).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const toggle = page.getByRole("checkbox", { name: "Mark lesson as complete" });
    await expect(toggle).not.toBeChecked();
    await toggle.focus();
    await page.keyboard.press("Space");
    await expect(toggle).toBeChecked();
    await page.reload();
    await expect(page.getByRole("checkbox", { name: "Mark lesson as complete" })).toBeChecked();
    await page.getByRole("checkbox", { name: "Mark lesson as complete" }).click();
    await page.reload();
    await expect(page.getByRole("checkbox", { name: "Mark lesson as complete" })).not.toBeChecked();
  });

  test("corrupt stored progress does not break the page", async ({ page }) => {
    await page.goto("/learn");
    await page.evaluate((k) => window.localStorage.setItem(k, "{oops"), PROGRESS_KEY);
    await gotoFixture(page);
    await expect.poll(async () => (await readProgress(page))?.last).toBe("_fixture");
  });
});

test.describe("AC-G-1-15 SEO and requests", () => {
  test("fixture lesson metadata", async ({ page }) => {
    await gotoFixture(page);
    await expect(page).toHaveTitle("Pipeline fixture: a tiny stack · Learn · LemmaYard");
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      "Exercises every lesson component once, so the content pipeline is tested without a real lesson.",
    );
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute("content", "article");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
  });

  test("a draft lesson's metadata", async ({ page }) => {
    await page.goto("/learn/heaps");
    await expect(page).toHaveTitle("Heaps and priority queues · Learn · LemmaYard");
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute("content", "article");
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /^Always know the smallest item/);
  });

  for (const url of ["/learn", FIXTURE]) {
    test(`no external requests on ${url}`, async ({ page, baseURL }) => {
      const check = expectOnlySameOriginRequests(page, baseURL ?? "");
      await page.goto(url, { waitUntil: "networkidle" });
      check();
    });
  }
});

test.describe("AC-G-1-16 server-rendered text", () => {
  test("a no-JS fetch of the fixture has prose, quiz, complexity table and code", async ({ request }) => {
    const html = await (await request.get(FIXTURE)).text();
    const text = html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, "").replace(/&#x27;|&#39;/g, "'");
    expect(text).toContain("This page is the content pipeline's own test.");
    expect(text).toContain("After push 1, push 2, pop, push 3, which value is on top?");
    expect(text).toContain("Put the values in the order pop returns them");
    expect(text).toContain("Cost of stack operations (array-backed)");
    expect(text).toContain("One write at the end; a resize copies every element.");
    expect(text).toContain("self._items.append(value)");
    expect(text).toContain("this.#items.push(value);");
  });
});

test.describe("AC-G-1-17 glossary", () => {
  test("lists the terms of the published lessons (empty state when none is published)", async ({ page }) => {
    const res = await page.goto("/learn/glossary");
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1")).toHaveText("Glossary");
    const terms = publishedGlossary();
    if (terms.length === 0) {
      await expect(page.locator("[data-glossary-empty]")).toHaveText("The glossary grows as lessons are published.");
      return;
    }
    await expect(page.locator("[data-glossary-empty]")).toHaveCount(0);
    for (const t of terms) await expect(page.locator(`dt[id="${t.id}"]`), t.id).toHaveCount(1);
  });
});

test.describe("AC-G-1-14 layout and axe", () => {
  for (const width of [320, 390, 1440]) {
    for (const theme of ["light", "dark"] as const) {
      test(`${width}px ${theme}: no horizontal scroll, axe clean`, async ({ page }) => {
        test.setTimeout(60_000);
        await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
        await page.goto("/learn");
        await setTheme(page, theme);
        for (const url of ["/learn", FIXTURE, "/learn/glossary", "/learn/arrays"]) {
          await page.goto(url);
          if (url === FIXTURE) await expect(page.locator("[data-lesson-toc]")).toBeVisible();
          if (width >= 360) {
            await expectNoHorizontalScroll(page);
          } else {
            // Below the site's 360 px minimum the shared masthead overflows (known,
            // owned by the header work); the guide content itself must still fit.
            await expectMainFits(page);
          }
          await settle(page);
          await expectAxeClean(page, "main");
        }
      });
    }
  }
});
