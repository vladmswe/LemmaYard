// M-G2 lesson e2e: /learn/arrays (S6, S7, S8 and the practice links).
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

const URL = "/learn/arrays";
/** playerId -> 1-based step whose Next opens the first prompt; invalid input for the bar. */
const PLAYERS = [
  { id: "array-shift", promptBeforeStep: 3, invalidInput: "3, 8: jump 2" },
  { id: "prefix-sums", promptBeforeStep: 5, invalidInput: "3, 1, 4; 3 1" },
  { id: "merge", promptBeforeStep: 4, invalidInput: "5, 1; 2" },
] as const;
/** Viz ids of other structures; none may appear in the scripts this page loads. */
const FOREIGN_VIZ_IDS = ["search.linear", "search.binary", "dynarray.ops", "demo.scan", "fixture.stack"];
const OWN_VIZ_IDS = ["array.shift", "prefix.sums", "twopointers.merge"];
const SERVER_TEXT = [
  "Two pointers: merging sorted arrays",
  "We will run 2 ops on this array of 6 elements",
  "We will build the prefix sums p of these 8 numbers",
  "We will merge sorted A",
];

async function openPromptsAndTables(page: Page): Promise<void> {
  for (const p of PLAYERS) {
    const root = player(page, p.id);
    await expect(root).toHaveAttribute("data-hydrated", "true");
    await stepTo(page, p.id, p.promptBeforeStep - 1);
    await root.getByRole("button", { name: "Next step" }).click();
    await expect(root.locator("[data-player-prompt]")).toBeVisible();
    await root.locator('[data-player-switch="table"]').click();
    await expect(root.locator("[data-player-table] table")).toBeVisible();
  }
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

test("S6 reduced motion: no transitions on the figures", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(URL);
  for (const p of PLAYERS) {
    const root = player(page, p.id);
    await expect(root).toHaveAttribute("data-hydrated", "true");
    await expect(root.locator('[data-player-switch="motion"]')).toHaveAttribute("aria-checked", "false");
    const ds = await root.evaluate((el) =>
      Array.from(el.querySelectorAll("[data-player-figure] .viz-g")).map((g) => getComputedStyle(g).transitionDuration),
    );
    expect(ds.length).toBeGreaterThan(0);
    for (const d of ds) expect(d.split(",").every((x) => parseFloat(x) <= 0.001)).toBe(true);
  }
});

test("the merge reaches the step where A runs out", async ({ page }) => {
  const root = await gotoPlayer(page, URL, "merge");
  await root.getByRole("button", { name: "Last step" }).click();
  await expect(root.locator('[data-counter="writes"]')).toContainText("10");
  const scrubber = root.locator("[data-player-scrubber]");
  const max = Number(await scrubber.getAttribute("max"));
  let found = false;
  for (let s = max; s >= 1 && !found; s--) {
    await stepTo(page, "merge", s);
    found = ((await root.locator("[data-player-caption]").textContent()) ?? "").includes("A is empty");
  }
  expect(found).toBe(true);
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
    await player(page, PLAYERS[0].id).getByRole("button", { name: "Next step" }).click();
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
    for (const id of OWN_VIZ_IDS) expect(texts.some((t) => t.includes(`"${id}"`)), id).toBe(true);
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
  expect(hrefs.length).toBe(6);
  for (const href of hrefs) expect((await request.get(href)).status(), href).toBe(200);
});
