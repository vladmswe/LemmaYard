// M-G2 lesson e2e: /learn/complexity-basics (S6, S7, S8 and the practice links).
import { expect, test, type Page } from "@playwright/test";

import {
  collectConsoleErrors,
  expectAxeClean,
  expectNoHorizontalScroll,
  expectOnlySameOriginRequests,
  gotoPlayer,
  measureScriptBytes,
  player,
  runPlayerConformance,
  setTheme,
  stepTo,
} from "./helpers";

const URL = "/learn/complexity-basics";
/** playerId -> 1-based step whose Next opens the first prompt; invalid input for the bar. */
const PLAYERS = [
  { id: "linear-search", promptBeforeStep: 4, invalidInput: "linear: 9, 3, 1; 3" },
  { id: "binary-search", promptBeforeStep: 4, invalidInput: "binary: 1, 2; x" },
] as const;
/** Viz ids of other structures; none may appear in the scripts this page loads. */
const FOREIGN_VIZ_IDS = ["array.shift", "prefix.sums", "twopointers.merge", "dynarray.ops", "demo.scan", "fixture.stack"];
const SERVER_TEXT = ["Count steps, not seconds", "Notation used in this guide", "We will look for 60 by comparing the 32 cells"];

async function openPromptsAndTables(page: Page): Promise<void> {
  for (const p of PLAYERS) {
    const root = await gotoPlayerOnPage(page, p.id);
    await stepTo(page, p.id, p.promptBeforeStep - 1);
    await root.getByRole("button", { name: "Next step" }).click();
    await expect(root.locator("[data-player-prompt]")).toBeVisible();
    await root.locator('[data-player-switch="table"]').click();
    await expect(root.locator("[data-player-table] table")).toBeVisible();
  }
}

async function gotoPlayerOnPage(page: Page, id: string) {
  const root = player(page, id);
  await expect(root).toHaveAttribute("data-hydrated", "true");
  return root;
}

for (const width of [390, 1440]) {
  test.describe(`S6 player conformance at ${width} px`, () => {
    test.use({ viewport: { width, height: width < 1024 ? 844 : 900 } });
    for (const p of PLAYERS) {
      test(`${p.id}`, async ({ page }) => {
        await runPlayerConformance(page, URL, p.id, { promptBeforeStep: p.promptBeforeStep, invalidInput: p.invalidInput, hasTable: true });
      });
    }
  });
}

test("S6 reduced motion: no transitions on the figure", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const root = await gotoPlayer(page, URL, PLAYERS[0].id);
  await expect(root.locator('[data-player-switch="motion"]')).toHaveAttribute("aria-checked", "false");
  const ds = await root.evaluate((el) =>
    Array.from(el.querySelectorAll("[data-player-figure] .viz-g")).map((g) => getComputedStyle(g).transitionDuration),
  );
  expect(ds.length).toBeGreaterThan(0);
  for (const d of ds) expect(d.split(",").every((x) => parseFloat(x) <= 0.001)).toBe(true);
});

test("the op selector switches between linear and binary search", async ({ page }) => {
  const root = await gotoPlayer(page, URL, "linear-search");
  await root.getByRole("radio", { name: "Binary search" }).click();
  await expect(root.getByRole("radio", { name: "Binary search" })).toHaveAttribute("aria-checked", "true");
  // Same 32 numbers and target 60 (absent): linear needed 32 comparisons, binary needs 6.
  await root.getByRole("button", { name: "Last step" }).click();
  await expect(root.locator('[data-counter="comparisons"]')).toContainText("6");
  await expect(root.locator("[data-player-caption]")).toContainText("Return -1");
});

test.describe("S7 accessibility and layout", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`axe is clean in ${theme} with prompts and tables open`, async ({ page }) => {
      await page.goto(URL);
      await setTheme(page, theme);
      await openPromptsAndTables(page);
      await expectAxeClean(page);
    });
  }

  for (const width of [320, 390, 1440]) {
    test(`no horizontal scroll at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await gotoPlayer(page, URL, PLAYERS[0].id);
      if (width === 320) {
        // Known site-header overflow at 320 px (owned elsewhere): check the lesson content only.
        const { mainWidth, viewport } = await page.evaluate(() => ({
          mainWidth: document.querySelector("main")?.scrollWidth ?? 0,
          viewport: document.documentElement.clientWidth,
        }));
        expect(mainWidth).toBeLessThanOrEqual(viewport);
      } else {
        await expectNoHorizontalScroll(page);
      }
    });
  }
});

test.describe("S8 console, requests, bundle, server HTML", () => {
  test("no console errors and only same-origin requests", async ({ page, baseURL }) => {
    const errors = collectConsoleErrors(page);
    const check = expectOnlySameOriginRequests(page, baseURL ?? "");
    await page.goto(URL, { waitUntil: "networkidle" });
    for (const p of PLAYERS) await expect(player(page, p.id)).toHaveAttribute("data-hydrated", "true");
    await page.getByRole("button", { name: "Next step" }).first().click();
    check();
    expect(errors).toEqual([]);
  });

  test("loads no other structure's generator code", async ({ page }) => {
    await page.goto(URL);
    const { bodies } = await measureScriptBytes(page);
    const texts = await Promise.all(bodies.map((b) => page.request.get(b.url).then((r) => r.text())));
    for (const id of FOREIGN_VIZ_IDS) {
      expect(texts.filter((t) => t.includes(`"${id}"`)).length, id).toBe(0);
    }
    expect(texts.some((t) => t.includes('"search.binary"'))).toBe(true);
  });

  test("prose and frame 0 of every player are in the server HTML", async ({ request }) => {
    const html = await (await request.get(URL)).text();
    for (const s of SERVER_TEXT) expect(html).toContain(s);
    for (const p of PLAYERS) expect(html).toContain(`data-player="${p.id}"`);
    expect(html).not.toContain("data-draft-banner");
  });
});

test("every practice link returns 200", async ({ page, request }) => {
  await page.goto(URL);
  const hrefs = await page.locator("[data-practice] a").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
  expect(hrefs.length).toBeGreaterThan(0);
  for (const href of hrefs) expect((await request.get(href)).status(), href).toBe(200);
});
