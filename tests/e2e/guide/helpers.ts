// Shared Playwright helpers for guide players. Lesson modules call
// runPlayerConformance() once per player on their lesson page.
import { gzipSync } from "node:zlib";

import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page } from "@playwright/test";

export function player(page: Page, playerId: string): Locator {
  return page.locator(`[data-player="${playerId}"]`);
}

/** Opens `url` and waits until the player has hydrated. */
export async function gotoPlayer(page: Page, url: string, playerId: string): Promise<Locator> {
  await page.goto(url);
  const root = player(page, playerId);
  await expect(root).toHaveAttribute("data-hydrated", "true");
  return root;
}

export async function currentStep(page: Page, playerId: string): Promise<number> {
  return Number(await player(page, playerId).getAttribute("data-step"));
}

/** Seeks with the scrubber (never asks prompts) and waits for step n (1-based). */
export async function stepTo(page: Page, playerId: string, n: number): Promise<void> {
  const root = player(page, playerId);
  await root.locator("[data-player-scrubber]").fill(String(n));
  await expect(root).toHaveAttribute("data-step", String(n));
}

/** next-themes keeps the choice in localStorage["theme"]; reload applies it. */
export async function setTheme(page: Page, theme: "light" | "dark"): Promise<void> {
  await page.evaluate((t) => window.localStorage.setItem("theme", t), theme);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(theme === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b)/);
}

export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, "page scrolls horizontally").toBeLessThanOrEqual(clientWidth);
}

/** WCAG 2.0/2.1 A + AA; fails on serious or critical violations only. */
export async function expectAxeClean(page: Page, include?: string): Promise<void> {
  let builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]);
  if (include) builder = builder.include(include);
  const { violations } = await builder.analyze();
  const bad = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(
    bad.map((v) => `${v.id} (${v.impact}): ${v.help} -> ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
}

/** Collects console errors, page errors and React hydration warnings from now on. */
export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    const text = m.text();
    if (m.type() === "error" || /hydrat/i.test(text)) errors.push(`${m.type()}: ${text}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

/** Records every request from now on; call the returned function to assert they stayed on the app's origin. */
export function expectOnlySameOriginRequests(page: Page, baseURL: string): () => void {
  const origin = new URL(baseURL).origin;
  const foreign: string[] = [];
  page.on("request", (r) => {
    const u = r.url();
    if (u.startsWith("data:") || u.startsWith("blob:")) return;
    if (new URL(u).origin !== origin) foreign.push(u);
  });
  return () => expect(foreign, "requests to other hosts").toEqual([]);
}

/** Reloads the page and sums the gzip size of every script it loads. */
export async function measureScriptBytes(page: Page): Promise<{ gzipBytes: number; bodies: { url: string; gzipBytes: number }[] }> {
  const pending: Promise<{ url: string; gzipBytes: number } | null>[] = [];
  const onResponse = (res: import("@playwright/test").Response) => {
    if (res.request().resourceType() !== "script") return;
    pending.push(
      res
        .body()
        .then((b) => ({ url: res.url(), gzipBytes: gzipSync(b).length }))
        .catch(() => null),
    );
  };
  page.on("response", onResponse);
  await page.reload({ waitUntil: "networkidle" });
  page.off("response", onResponse);
  const bodies = (await Promise.all(pending)).filter((x): x is { url: string; gzipBytes: number } => x !== null);
  return { gzipBytes: bodies.reduce((a, b) => a + b.gzipBytes, 0), bodies };
}

/** Controls of a player that must be at least 44 x 44 px. */
export const CONTROL_SELECTOR =
  'button, select, input:not([type="radio"]), summary, [role="switch"], [role="tab"]';

export async function expectTouchTargets(root: Locator): Promise<void> {
  const small = await root.evaluate((el, sel) => {
    return Array.from(el.querySelectorAll<HTMLElement>(sel))
      .filter((c) => c.checkVisibility() && !c.closest("[data-player-keysteps] li"))
      .map((c) => ({ c, r: c.getBoundingClientRect() }))
      .filter(({ r }) => r.width < 44 - 0.5 || r.height < 44 - 0.5)
      .map(({ c, r }) => `${c.tagName} "${c.getAttribute("aria-label") ?? c.textContent?.trim()}" ${r.width}x${r.height}`);
  }, CONTROL_SELECTOR);
  expect(small, "controls smaller than 44x44").toEqual([]);
}

export async function expectSvgTextAtLeast12px(root: Locator): Promise<void> {
  const small = await root.evaluate((el) =>
    Array.from(el.querySelectorAll("svg text"))
      .map((t) => parseFloat(getComputedStyle(t).fontSize))
      .filter((px) => px < 12),
  );
  expect(small, "SVG text below 12px").toEqual([]);
}

export interface ConformanceOptions {
  /** 1-based step whose Next opens a prompt (Next on step-1 shows it). */
  readonly promptBeforeStep?: number;
  /** A raw input that must be rejected, when the player has an input bar. */
  readonly invalidInput?: string;
  readonly hasTable?: boolean;
}

/**
 * The standard player checks (AC-G-0-5..10 in short form): keyboard stepping,
 * narration live region, scrubber text, prompt flow, deep link, invalid input,
 * touch targets, SVG text size, axe. Fails the test on the first problem.
 */
export async function runPlayerConformance(
  page: Page,
  url: string,
  playerId: string,
  opts: ConformanceOptions = {},
): Promise<void> {
  const errors = collectConsoleErrors(page);
  const root = await gotoPlayer(page, url, playerId);
  const narration = root.locator("[data-player-narration]");
  await expect(narration).toHaveAttribute("aria-live", "polite");
  const total = Number((await root.locator("[data-player-scrubber]").getAttribute("max")) ?? "1");

  // Keyboard: figure focus, ArrowRight / ArrowLeft / End / Home.
  await root.locator("[data-player-figure]").focus();
  if (opts.promptBeforeStep !== 2 && total > 1) {
    await page.keyboard.press("ArrowRight");
    await expect(root).toHaveAttribute("data-step", "2");
    await expect(narration).toContainText(`Step 2 of ${total}`);
    await page.keyboard.press("ArrowLeft");
    await expect(root).toHaveAttribute("data-step", "1");
  }
  await page.keyboard.press("End");
  await expect(root).toHaveAttribute("data-step", String(total));
  await page.keyboard.press("Home");
  await expect(root).toHaveAttribute("data-step", "1");

  // Scrubber.
  const mid = Math.max(1, Math.ceil(total / 2));
  await stepTo(page, playerId, mid);
  await expect(root.locator("[data-player-scrubber]")).toHaveAttribute(
    "aria-valuetext",
    new RegExp(`^Step ${mid} of ${total}: .+`),
  );

  // Prompt.
  if (opts.promptBeforeStep !== undefined) {
    await stepTo(page, playerId, opts.promptBeforeStep - 1);
    await root.getByRole("button", { name: "Next step" }).click();
    await expect(root.locator("[data-player-prompt]")).toBeVisible();
    await expect(root.getByRole("button", { name: "Next step" })).toBeDisabled();
    await root.getByRole("button", { name: "Just show me" }).click();
    await expect(root).toHaveAttribute("data-step", String(opts.promptBeforeStep));
  }

  // Invalid input keeps the trace.
  if (opts.invalidInput !== undefined) {
    const field = root.locator("[data-player-input-field]");
    await field.fill(opts.invalidInput);
    await field.press("Enter");
    await expect(root.locator("[data-player-input-error]")).toBeVisible();
    await expect(field).toHaveAttribute("aria-invalid", "true");
    await expect(root.locator("[data-player-scrubber]")).toHaveAttribute("max", String(total));
  }

  // Deep link.
  const sep = url.includes("?") ? "&" : "?";
  await gotoPlayer(page, `${url}${sep}step.${playerId}=${total}`, playerId);
  await expect(root).toHaveAttribute("data-step", String(total));

  await expectTouchTargets(root);
  await expectSvgTextAtLeast12px(root);
  await expectNoHorizontalScroll(page);
  await expectAxeClean(page);
  expect(errors).toEqual([]);
}
