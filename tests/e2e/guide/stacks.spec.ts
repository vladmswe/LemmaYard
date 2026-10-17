// M-G4 lesson e2e: /learn/stacks (S6, S7, S8 and the practice links).
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

const URL = "/learn/stacks";
/** playerId -> 1-based step whose Next opens the first prompt; invalid input for the bar. */
const PLAYERS = [
  { id: "stack-ops", promptBeforeStep: 4, invalidInput: "push 1, jump" },
  { id: "brackets", promptBeforeStep: 9, invalidInput: "(é)" },
  { id: "next-greater", promptBeforeStep: 7, invalidInput: "1, 2, x" },
] as const;
/** Viz ids of other structures; none may appear in the scripts this page loads. */
const FOREIGN_VIZ_IDS = [
  "search.linear",
  "search.binary",
  "array.shift",
  "prefix.sums",
  "twopointers.merge",
  "dynarray.ops",
  "demo.scan",
  "fixture.stack",
  "queue.naive",
  "queue.ring",
  "deque.ring",
];
const OWN_VIZ_IDS = ["stack.ops", "stack.brackets", "stack.monotonic"];
const SERVER_TEXT = [
  "Matching brackets",
  "We run 8 ops on an empty stack kept in an array of 4 slots.",
  "We scan these 36 characters from left to right",
  "For each of these 8 values we look for the next greater value to its right.",
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
    await stepTo(page, p.id, 3); // frame 0 of stack-ops is an empty stack
    const ds = await root.evaluate((el) =>
      Array.from(el.querySelectorAll("[data-player-figure] .viz-g")).map((g) => getComputedStyle(g).transitionDuration),
    );
    expect(ds.length).toBeGreaterThan(0);
    for (const d of ds) expect(d.split(",").every((x) => parseFloat(x) <= 0.001)).toBe(true);
  }
});

test("the crossed-brackets preset stops at the ) with an error", async ({ page }) => {
  const root = await gotoPlayer(page, URL, "brackets");
  await root.locator('[data-preset="crossed"]').click();
  await root.getByRole("button", { name: "Last step" }).click();
  await expect(root.locator("[data-player-caption]")).toContainText("Done: unbalanced");
  await expect(root.locator('[data-player-figure] [data-id="c2"]')).toHaveAttribute("data-role", "muted");
  const scrubber = root.locator("[data-player-scrubber]");
  const max = Number(await scrubber.getAttribute("max"));
  await stepTo(page, "brackets", max - 1);
  await expect(root.locator('[data-player-figure] [data-id="c2"]').first()).toHaveAttribute("data-role", "error");
});

test("pushes past capacity 4 grow the stack array to 8", async ({ page }) => {
  const root = await gotoPlayer(page, URL, "stack-ops");
  await root.locator('[data-preset="grow"]').click();
  await root.getByRole("button", { name: "Last step" }).click();
  await expect(root.locator('[data-counter="copies"]')).toContainText("4");
  await expect(root.locator("[data-player-figure] svg")).toContainText("Size 5/8");
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
  expect(hrefs).toEqual(["/problems/valid-parentheses", "/problems/longest-valid-parentheses", "/problems/trapping-rain-water"]);
  for (const href of hrefs) expect((await request.get(href)).status(), href).toBe(200);
});
