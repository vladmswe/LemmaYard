// Design v2 phase 1 (DESIGN.md): landing, login, register and the 404 page.
// Axe (WCAG 2.1 A/AA, serious + critical) in each theme the site allows,
// no horizontal scroll at 390 and 1440, the forced theme, reduced motion
// ending in final states and visible keyboard focus. Needs no judge.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { forcedTheme, THEME_TOGGLE_ENABLED } from "../../../src/lib/theme-config";

const PAGES = ["/", "/login", "/register", "/no-such-page-v2"];
const THEMES = (forcedTheme ? [forcedTheme] : ["light", "dark"]) as ("light" | "dark")[];

async function expectAxeClean(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const bad = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

/** Final states at once: no running animations, every scroll reveal shown. */
async function settle(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 30));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(150);
}

for (const theme of THEMES) {
  test.describe(`${theme} theme`, () => {
    test.use({ colorScheme: theme });
    for (const width of [390, 1440]) {
      for (const path of PAGES) {
        test(`${path} at ${width}px: axe clean, no horizontal scroll`, async ({ page }) => {
          await page.setViewportSize({ width, height: 900 });
          await page.goto(path);
          await settle(page);
          await expect(page.locator("html")).toHaveClass(theme === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b)/);
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
          expect(overflow).toBeLessThanOrEqual(0);
          await expectAxeClean(page);
        });
      }
    }
  });
}

test("the theme is forced while the toggle is disabled", async ({ page }) => {
  test.skip(THEME_TOGGLE_ENABLED, "the toggle is enabled in theme-config.ts");
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(() => window.localStorage.setItem("theme", "light"));
  await page.goto("/");
  await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${forcedTheme}\\b`));
  await expect(page.getByRole("button", { name: /^Theme/ })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByRole("group", { name: "Theme" })).toHaveCount(0);
});

test("landing: reduced motion shows final states and real numbers from the server", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const html = await (await page.request.get("/")).text();
  // The ledger's count-ups are rendered with their final value on the server.
  expect(html).toMatch(/original problems?, each with examples/);
  await page.waitForTimeout(300);
  const state = await page.evaluate(() => ({
    running: document.getAnimations().filter((a) => a.playState === "running").length,
    hiddenReveals: [...document.querySelectorAll(".rv")].filter((el) => getComputedStyle(el).opacity !== "1").length,
    lineClip: getComputedStyle(document.querySelector(".ly-line")!).clipPath,
  }));
  expect(state.running).toBe(0);
  expect(state.hiddenReveals).toBe(0);
  // Fully typed: the clip ends at inset(0 0 0 0), never at the hidden 100%.
  expect(state.lineClip).not.toContain("100%");
});

test("landing: every control shows a focus ring", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    const outline = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const s = getComputedStyle(el);
      return { tag: el.tagName, style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
    });
    expect(outline, `tab stop ${i}`).not.toBeNull();
    expect(outline!.style, `tab stop ${i} (${outline!.tag})`).not.toBe("none");
    expect(outline!.width).toBeGreaterThanOrEqual(2);
  }
});
