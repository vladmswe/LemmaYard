// M-G2 lesson e2e: /learn/dynamic-arrays (S6, S7, S8 and the practice links).
import { expect, test } from "@playwright/test";

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

const URL = "/learn/dynamic-arrays";
const ID = "dynamic-array";
const PROMPT_BEFORE_STEP = 15; // "Capacity 4, size 4: how many copies ...?"
/** Viz ids of other structures; none may appear in the scripts this page loads. */
const FOREIGN_VIZ_IDS = ["search.linear", "search.binary", "array.shift", "prefix.sums", "twopointers.merge", "demo.scan", "fixture.stack"];
const SERVER_TEXT = ["Why appends are cheap on average", "We start with an empty dynamic array of capacity 1"];

for (const width of [390, 1440]) {
  test.describe(`S6 player conformance at ${width} px`, () => {
    test.use({ viewport: { width, height: width < 1024 ? 844 : 900 } });
    test(ID, async ({ page }) => {
      await runPlayerConformance(page, URL, ID, { promptBeforeStep: PROMPT_BEFORE_STEP, invalidInput: "cap 3: append 1", hasTable: true });
    });
  });
}

test("S6 reduced motion: no transitions on the figure", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const root = await gotoPlayer(page, URL, ID);
  await expect(root.locator('[data-player-switch="motion"]')).toHaveAttribute("aria-checked", "false");
  await stepTo(page, ID, 15); // frame 0 is an empty buffer; step 15 shows four cells
  const ds = await root.evaluate((el) =>
    Array.from(el.querySelectorAll("[data-player-figure] .viz-g")).map((g) => getComputedStyle(g).transitionDuration),
  );
  expect(ds.length).toBeGreaterThan(0);
  for (const d of ds) expect(d.split(",").every((x) => parseFloat(x) <= 0.001)).toBe(true);
});

test("presets: 17 appends end at capacity 32; thrashing resizes 13 times at 1/2, twice at 1/4", async ({ page }) => {
  const root = await gotoPlayer(page, URL, ID);
  const resizesAfter = async (preset: string) => {
    await root.locator(`[data-preset="${preset}"]`).click();
    await root.getByRole("button", { name: "Last step" }).click();
    return (await root.locator('[data-counter="resizes"]').textContent()) ?? "";
  };
  expect(await resizesAfter("append-17")).toContain("5");
  await expect(root.locator('[data-counter="copies"]')).toContainText("31");
  await expect(root.locator("[data-player-caption]")).toContainText("capacity 32");
  expect(await resizesAfter("thrash")).toContain("13");
  expect(await resizesAfter("no-thrash")).toContain("2");
});

test.describe("S7 accessibility and layout", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`axe is clean in ${theme} with the prompt and table open`, async ({ page }) => {
      await page.goto(URL);
      await setTheme(page, theme);
      const root = player(page, ID);
      await expect(root).toHaveAttribute("data-hydrated", "true");
      await stepTo(page, ID, PROMPT_BEFORE_STEP - 1);
      await root.getByRole("button", { name: "Next step" }).click();
      await expect(root.locator("[data-player-prompt]")).toBeVisible();
      await root.locator('[data-player-switch="table"]').click();
      await expect(root.locator("[data-player-table] table")).toBeVisible();
      await expectAxeClean(page);
    });
  }

  for (const width of [320, 390, 1440]) {
    test(`no horizontal scroll at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await gotoPlayer(page, URL, ID);
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
    await expect(player(page, ID)).toHaveAttribute("data-hydrated", "true");
    await player(page, ID).getByRole("button", { name: "Next step" }).click();
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
    expect(texts.some((t) => t.includes('"dynarray.ops"'))).toBe(true);
  });

  test("prose and frame 0 of the player are in the server HTML", async ({ request }) => {
    const html = await (await request.get(URL)).text();
    for (const s of SERVER_TEXT) expect(html).toContain(s);
    expect(html).toContain(`data-player="${ID}"`);
    expect(html).not.toContain("data-draft-banner");
  });
});

test("the practice section falls back to related problems, and each link returns 200", async ({ page, request }) => {
  await page.goto(URL);
  await expect(page.locator("[data-practice-empty]")).toBeVisible();
  const hrefs = await page.locator("[data-practice] a").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
  expect(hrefs.length).toBeGreaterThan(0);
  for (const href of hrefs) expect((await request.get(href)).status(), href).toBe(200);
});
