// M-G0 player fixtures: one describe per AC-G-0-5..19, run at 1440 and 390 px.
import { spawn, type ChildProcess } from "node:child_process";

import { expect, test, type Page } from "@playwright/test";

import {
  collectConsoleErrors,
  currentStep,
  expectAxeClean,
  expectNoHorizontalScroll,
  expectOnlySameOriginRequests,
  expectSvgTextAtLeast12px,
  expectTouchTargets,
  gotoPlayer,
  measureScriptBytes,
  player,
  runPlayerConformance,
  setTheme,
  stepTo,
} from "./helpers";

const SCAN = "/learn/dev-fixtures/scan";
const SCAN_CODE = "/learn/dev-fixtures/scan-code";
const TREE = "/learn/dev-fixtures/tree";
const TWO = "/learn/dev-fixtures/two-players";
const SWATCHES = "/learn/dev-fixtures/swatches";
const FIXTURES = [SCAN, SCAN_CODE, TREE, TWO, SWATCHES];
// demo.scan default: [4, 8, 15, 16, 23, 42], target 23 -> 7 steps, prompt before step 4.
const SCAN_STEPS = 7;
const ROLES = ["current", "compared", "changed", "new", "removed", "visited", "frontier", "done", "path", "muted", "error"];

let consoleErrors: string[] = [];
test.beforeEach(({ page }) => {
  consoleErrors = collectConsoleErrors(page);
});
// AC-G-0-19: no console errors or hydration warnings in any scenario.
test.afterEach(() => {
  expect(consoleErrors, "console errors / hydration warnings").toEqual([]);
});

const label = (page: Page) => player(page, "scan").locator("[data-player-step]");

for (const width of [1440, 390]) {
  test.describe(`at ${width}px`, () => {
    test.use({ viewport: { width, height: width === 1440 ? 900 : 844 } });

    test.describe("AC-G-0-5 keyboard", () => {
      test("Tab reaches the figure and every control in DOM order", async ({ page }) => {
        const root = await gotoPlayer(page, SCAN, "scan");
        const count = await root.evaluate((el) => {
          const sel = 'button, input, select, summary, [tabindex], a[href]';
          const list = Array.from(el.querySelectorAll<HTMLElement>(sel)).filter(
            (c) => c.tabIndex >= 0 && !(c as HTMLButtonElement).disabled && c.checkVisibility(),
          );
          list.forEach((c, i) => c.setAttribute("data-tab-idx", String(i)));
          return list.length;
        });
        expect(count).toBeGreaterThan(10);
        await page.locator("h1").click();
        const seen: string[] = [];
        for (let i = 0; i < count + 20 && seen.length < count; i++) {
          await page.keyboard.press("Tab");
          const idx = await page.evaluate(() => document.activeElement?.getAttribute("data-tab-idx") ?? null);
          if (idx !== null) seen.push(idx);
          else if (seen.length > 0) break;
        }
        expect(seen).toEqual(Array.from({ length: count }, (_, i) => String(i)));
        await expect(root.locator('[data-tab-idx="0"]')).toHaveAttribute("data-player-figure", "");
      });

      test("arrows, Home/End, k, +/- work on the figure", async ({ page }) => {
        const root = await gotoPlayer(page, SCAN, "scan");
        await root.locator("[data-player-figure]").focus();
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowRight");
        await expect(root).toHaveAttribute("data-step", "3");
        await page.keyboard.press("ArrowLeft");
        await expect(root).toHaveAttribute("data-step", "2");
        await page.keyboard.press("End");
        await expect(root).toHaveAttribute("data-step", String(SCAN_STEPS));
        await page.keyboard.press("Home");
        await expect(root).toHaveAttribute("data-step", "1");
        await page.keyboard.press("k");
        await expect(root.getByRole("button", { name: "Pause" })).toBeVisible();
        await page.keyboard.press("k");
        await expect(root.getByRole("button", { name: "Play" })).toBeVisible();
        const speed = root.locator("[data-player-speed]");
        await page.keyboard.press("+");
        await expect(speed).toHaveValue("2");
        await page.keyboard.press("-");
        await page.keyboard.press("-");
        await expect(speed).toHaveValue("0.5");
        await expect(root).toHaveAttribute("data-speed", "0.5");
      });

      test("Space on the figure toggles play", async ({ page }) => {
        const root = await gotoPlayer(page, SCAN, "scan");
        await root.locator("[data-player-figure]").focus();
        await page.keyboard.press(" ");
        await expect(root.getByRole("button", { name: "Pause" })).toBeVisible();
        await page.keyboard.press(" ");
        await expect(root.getByRole("button", { name: "Play" })).toBeVisible();
      });

      test("keys typed into the input field do not step the player", async ({ page }) => {
        const root = await gotoPlayer(page, SCAN, "scan");
        const field = root.locator("[data-player-input-field]");
        await field.focus();
        for (const key of ["ArrowRight", "End", "k", "+", "r", " "]) await page.keyboard.press(key);
        await expect(root).toHaveAttribute("data-step", "1");
        await expect(root.getByRole("button", { name: "Play" })).toBeVisible();
      });

      test("Space on a focused button activates only that button", async ({ page }) => {
        const root = await gotoPlayer(page, SCAN, "scan");
        await root.getByRole("button", { name: "Next step" }).focus();
        await page.keyboard.press(" ");
        await expect(root).toHaveAttribute("data-step", "2");
        await expect(root.getByRole("button", { name: "Play" })).toBeVisible();
        await root.getByRole("button", { name: "Last step" }).focus();
        await page.keyboard.press("Enter");
        await expect(root).toHaveAttribute("data-step", String(SCAN_STEPS));
        await expect(root.getByRole("button", { name: "Play" })).toBeVisible();
      });
    });

    test.describe("AC-G-0-6 narration", () => {
      test("live region is in the server HTML with frame 0 narration and the state description", async ({ request }) => {
        const html = await (await request.get(SCAN)).text();
        expect(html).toMatch(
          /<p aria-live="polite" aria-atomic="true" class="sr-only" data-player-narration="">Step 1 of 7\. Start\. We will scan these 6 numbers from left to right, looking for 23\.<\/p>/,
        );
        expect(html).toContain("Array of 6 numbers: 4, 8, 15, 16, 23, 42. Target 23.");
        expect(html).toContain('data-player-desc=""');
      });

      test("updates on every manual step", async ({ page }) => {
        const root = await gotoPlayer(page, SCAN, "scan");
        const live = root.locator("[data-player-narration]");
        await expect(live).toHaveAttribute("aria-live", "polite");
        await root.getByRole("button", { name: "Next step" }).click();
        await expect(live).toHaveText(/^Step 2 of 7\. Compare\. Compare 4 at index 0 with 23\./);
        await root.getByRole("button", { name: "Next step" }).click();
        await expect(live).toHaveText(/^Step 3 of 7\. Compare\. Compare 8/);
        await root.getByRole("button", { name: "Previous step" }).click();
        await expect(live).toHaveText(/^Step 2 of 7/);
      });

      test("autoplay changes the live text at most once per phase change", async ({ page }) => {
        const root = await gotoPlayer(page, SCAN, "scan");
        await root.evaluate((el) => {
          const live = el.querySelector("[data-player-narration]")!;
          const step = el.querySelector("[data-player-step]")!;
          const w = window as unknown as { liveChanges: number; phaseChanges: number };
          w.liveChanges = 0;
          w.phaseChanges = 0;
          let lastLive = live.textContent;
          let lastPhase = step.textContent?.split("·")[1]?.trim();
          new MutationObserver(() => {
            if (live.textContent !== lastLive) {
              lastLive = live.textContent;
              w.liveChanges++;
            }
          }).observe(live, { childList: true, characterData: true, subtree: true });
          new MutationObserver(() => {
            const phase = step.textContent?.split("·")[1]?.trim();
            if (phase !== lastPhase) {
              lastPhase = phase;
              w.phaseChanges++;
            }
          }).observe(step, { childList: true, characterData: true, subtree: true });
        });
        await root.getByRole("button", { name: "Play" }).click();
        await page.waitForTimeout(3000);
        const { liveChanges, phaseChanges } = await page.evaluate(() => {
          const w = window as unknown as { liveChanges: number; phaseChanges: number };
          return { liveChanges: w.liveChanges, phaseChanges: w.phaseChanges };
        });
        expect(await currentStep(page, "scan")).toBeGreaterThanOrEqual(3); // it did play several steps
        expect(phaseChanges).toBeGreaterThanOrEqual(1);
        expect(liveChanges).toBeLessThanOrEqual(phaseChanges);
      });
    });

    test.describe("AC-G-0-7 scrubber", () => {
      test("range k shows step k with aria-valuetext", async ({ page }) => {
        const root = await gotoPlayer(page, SCAN, "scan");
        await stepTo(page, "scan", 5);
        await expect(label(page)).toHaveText("Step 5 of 7 · Compare");
        await expect(root.locator("[data-player-scrubber]")).toHaveAttribute("aria-valuetext", "Step 5 of 7: Compare");
        await stepTo(page, "scan", 7);
        await expect(root.locator("[data-player-scrubber]")).toHaveAttribute("aria-valuetext", "Step 7 of 7: Found");
        await expect(root.locator("[data-player-narration]")).toHaveText(/^Step 7 of 7\. Found\./);
      });
    });

    test.describe("AC-G-0-8 predict prompt", () => {
      test("Next opens the prompt with focus on the legend; Just show me reveals", async ({ page }) => {
        const root = await gotoPlayer(page, SCAN, "scan");
        await stepTo(page, "scan", 3);
        await root.getByRole("button", { name: "Next step" }).click();
        const prompt = root.locator("[data-player-prompt]");
        await expect(prompt).toBeVisible();
        await expect(prompt.locator("legend")).toBeFocused();
        await expect(root.locator("[data-player-narration]")).toHaveText(/^Question: Index 2 holds 15/);
        await expect(root.getByRole("button", { name: "Next step" })).toBeDisabled();
        await expect(root).toHaveAttribute("data-step", "3");
        await root.getByRole("button", { name: "Just show me" }).click();
        await expect(root).toHaveAttribute("data-step", "4");
        await expect(prompt).toHaveCount(0);
        await expect(root.locator("[data-player-feedback]")).toContainText("15 is not 23");
      });

      test("a wrong pick shows 'Not quite.' and the explanation, then advances", async ({ page }) => {
        const root = await gotoPlayer(page, SCAN, "scan");
        await stepTo(page, "scan", 3);
        await root.getByRole("button", { name: "Next step" }).click();
        await root.locator('[data-choice="yes"]').check();
        await root.getByRole("button", { name: "Check" }).click();
        const fb = root.locator("[data-player-feedback]");
        await expect(fb).toContainText("Not quite.");
        await expect(fb).toContainText("15 is not 23, so the scan moves on to index 3.");
        await expect(root).toHaveAttribute("data-step", "4");
        await expect(root.getByRole("button", { name: "Next step" })).toBeFocused();
      });

      test("a right pick shows 'Right.'", async ({ page }) => {
        const root = await gotoPlayer(page, SCAN, "scan");
        await stepTo(page, "scan", 3);
        await root.getByRole("button", { name: "Next step" }).click();
        await root.locator('[data-choice="no"]').check();
        await root.getByRole("button", { name: "Check" }).click();
        await expect(root.locator("[data-player-feedback]")).toContainText("Right.");
      });

      test("autoplay stops before the prompt, and passes it with Skip questions on", async ({ page }) => {
        const root = await gotoPlayer(page, SCAN, "scan");
        await root.locator("[data-player-speed]").selectOption("2");
        await stepTo(page, "scan", 2);
        await root.getByRole("button", { name: "Play" }).click();
        await expect(root.locator("[data-player-prompt]")).toBeVisible({ timeout: 5000 });
        await expect(root).toHaveAttribute("data-step", "3");
        await root.getByRole("button", { name: "First step" }).click();
        await root.locator('[data-player-switch="skip"]').click();
        await expect(root.locator('[data-player-switch="skip"]')).toHaveAttribute("aria-checked", "true");
        await root.getByRole("button", { name: "Play" }).click();
        await expect(root).toHaveAttribute("data-step", String(SCAN_STEPS), { timeout: 10_000 });
        await expect(root.locator("[data-player-prompt]")).toHaveCount(0);
      });
    });

    test.describe("AC-G-0-9 deep link", () => {
      test("?step.scan=5 shows step 5 after hydration", async ({ page }) => {
        const root = await gotoPlayer(page, `${SCAN}?step.scan=5`, "scan");
        await expect(root).toHaveAttribute("data-step", "5");
        await expect(label(page)).toHaveText("Step 5 of 7 · Compare");
      });

      test("stepping updates the URL with replaceState, no navigation or RSC fetch", async ({ page, baseURL }) => {
        const assertSameOrigin = expectOnlySameOriginRequests(page, baseURL!);
        const root = await gotoPlayer(page, `${SCAN}?step.scan=5`, "scan");
        const requests: string[] = [];
        page.on("request", (r) => {
          const h = r.headers();
          // Link prefetches from the site header are not caused by the player.
          if (h["next-router-prefetch"]) return;
          if (r.resourceType() === "document" || r.url().includes("_rsc") || h["rsc"] === "1") {
            requests.push(r.url());
          }
        });
        await root.getByRole("button", { name: "Next step" }).click();
        await expect.poll(() => new URL(page.url()).searchParams.get("step.scan")).toBe("6");
        await root.getByRole("button", { name: "Previous step" }).click();
        await root.getByRole("button", { name: "Previous step" }).click();
        await expect.poll(() => new URL(page.url()).searchParams.get("step.scan")).toBe("4");
        expect(requests).toEqual([]);
        expect(await page.evaluate(() => performance.getEntriesByType("navigation").length)).toBe(1);
        assertSameOrigin();
      });

      test("input.scan restores a custom input", async ({ page }) => {
        const raw = "5, 1, 9, 3; 7";
        const root = await gotoPlayer(page, `${SCAN}?input.scan=${encodeURIComponent(raw)}&step.scan=6`, "scan");
        await expect(root.locator("[data-player-input-field]")).toHaveValue(raw);
        await expect(label(page)).toHaveText("Step 6 of 6 · Not found");
        // Changing the input writes it back to the URL.
        await root.locator('[data-preset="first"]').click();
        await expect.poll(() => new URL(page.url()).searchParams.get("input.scan")).toBe("2, 7, 1, 8; 2");
        await root.getByRole("button", { name: "Reset" }).click();
        await expect.poll(() => new URL(page.url()).searchParams.get("input.scan")).toBeNull();
      });

      test("an invalid step or input falls back to step 1 with a note", async ({ page }) => {
        let root = await gotoPlayer(page, `${SCAN}?step.scan=99`, "scan");
        await expect(root).toHaveAttribute("data-step", "1");
        await expect(root.locator("[data-player-note]")).toHaveText("Link step not found, showing step 1");
        root = await gotoPlayer(page, `${SCAN}?step.scan=3&input.scan=${encodeURIComponent("1, x")}`, "scan");
        await expect(root).toHaveAttribute("data-step", "1");
        await expect(root.locator("[data-player-note]")).toBeVisible();
        await expect(label(page)).toHaveText("Step 1 of 7 · Start");
      });

      test("two players keep independent URL keys", async ({ page }) => {
        const first = await gotoPlayer(page, TWO, "first");
        const second = player(page, "second");
        await expect(second).toHaveAttribute("data-hydrated", "true");
        await first.getByRole("button", { name: "Next step" }).click();
        await expect.poll(() => new URL(page.url()).searchParams.get("step.first")).toBe("2");
        expect(new URL(page.url()).searchParams.get("step.second")).toBeNull();
        await second.getByRole("button", { name: "Last step" }).click();
        await expect.poll(() => new URL(page.url()).searchParams.get("step.second")).toBe("4");
        expect(new URL(page.url()).searchParams.get("step.first")).toBe("2");
        await page.reload();
        await expect(first).toHaveAttribute("data-hydrated", "true");
        await expect(first).toHaveAttribute("data-step", "2");
        await expect(second).toHaveAttribute("data-step", "4");
      });
    });

    test.describe("AC-G-0-10 input", () => {
      test("presets load and reset to step 1", async ({ page }) => {
        const root = await gotoPlayer(page, SCAN, "scan");
        await stepTo(page, "scan", 3);
        await root.locator('[data-preset="missing"]').click();
        await expect(root).toHaveAttribute("data-step", "1");
        await expect(root.locator("[data-player-input-field]")).toHaveValue("5, 1, 9, 3; 7");
        await expect(label(page)).toHaveText("Step 1 of 6 · Start");
        await expect(root.locator("[data-player-narration]")).toHaveText("New example loaded, 6 steps");
        await root.locator('[data-preset="random"]').click();
        await expect(root).toHaveAttribute("data-step", "1");
      });

      for (const [name, raw, error] of [
        ["a non-number", "1, x, 3; 3", "Number 2: 'x' is not a whole number"],
        ["13 numbers", `${Array.from({ length: 13 }, (_, i) => i + 1).join(", ")}; 3`, "Too many numbers: 13 (at most 12)"],
        ["300 characters", "1, ".repeat(100), "Too long: 300 characters (at most 120)"],
      ] as const) {
        test(`invalid input (${name}) shows a linked error and keeps the trace`, async ({ page }) => {
          const root = await gotoPlayer(page, SCAN, "scan");
          await stepTo(page, "scan", 2);
          const field = root.locator("[data-player-input-field]");
          await field.fill(raw);
          await expect(field).toHaveValue(raw); // not truncated
          await root.getByRole("button", { name: "Apply" }).click();
          const err = root.locator("[data-player-input-error]");
          await expect(err).toHaveText(error);
          await expect(field).toHaveAttribute("aria-invalid", "true");
          const errId = await err.getAttribute("id");
          expect((await field.getAttribute("aria-describedby"))?.split(" ")).toContain(errId);
          await expect(label(page)).toHaveText("Step 2 of 7 · Compare");
        });
      }

      test("Apply via Enter works and clears the error", async ({ page }) => {
        const root = await gotoPlayer(page, SCAN, "scan");
        const field = root.locator("[data-player-input-field]");
        await field.fill("1, x");
        await field.press("Enter");
        await expect(root.locator("[data-player-input-error]")).toBeVisible();
        await field.fill("2, 4; 4");
        await field.press("Enter");
        await expect(label(page)).toHaveText("Step 1 of 4 · Start");
        await expect(root.locator("[data-player-input-error]")).toHaveCount(0);
        await expect(field).not.toHaveAttribute("aria-invalid", "true");
      });

      test("controls stay enabled while playing", async ({ page }) => {
        const root = await gotoPlayer(page, SCAN, "scan");
        await root.getByRole("button", { name: "Play" }).click();
        for (const name of ["First step", "Previous step", "Pause", "Next step", "Last step", "Apply", "Reset"]) {
          await expect(root.getByRole("button", { name, exact: true })).toBeEnabled();
        }
        await expect(root.locator("[data-player-scrubber]")).toBeEnabled();
      });
    });

    test.describe("AC-G-0-11 reduced motion", () => {
      const durations = (page: Page) =>
        player(page, "scan").evaluate((el) =>
          Array.from(el.querySelectorAll("[data-player-figure] .viz-g")).map(
            (g) => getComputedStyle(g).transitionDuration,
          ),
        );

      test("reduce: 0s transitions and Animations off; switching on persists", async ({ page }) => {
        await page.emulateMedia({ reducedMotion: "reduce" });
        const root = await gotoPlayer(page, SCAN, "scan");
        const sw = root.locator('[data-player-switch="motion"]');
        await expect(sw).toHaveAttribute("aria-checked", "false");
        await expect(sw.locator("[data-switch-state]")).toHaveText("off");
        let ds = await durations(page);
        expect(ds.length).toBeGreaterThan(0);
        for (const d of ds) expect(d.split(",").every((x) => x.trim() === "0s")).toBe(true);
        await expect(root.getByRole("button", { name: "Play" })).toBeVisible();

        await sw.click();
        await expect(sw).toHaveAttribute("aria-checked", "true");
        ds = await durations(page);
        for (const d of ds) expect(d.split(",").every((x) => parseFloat(x) > 0)).toBe(true);

        await page.reload();
        await expect(root).toHaveAttribute("data-hydrated", "true");
        await expect(sw).toHaveAttribute("aria-checked", "true");
        ds = await durations(page);
        for (const d of ds) expect(d.split(",").every((x) => parseFloat(x) > 0)).toBe(true);
        expect(await page.evaluate(() => JSON.parse(localStorage.getItem("leetcopy.learn.prefs.v1") ?? "{}").motion)).toBe("on");
        await expect(root.getByRole("button", { name: "Play" })).toBeVisible();
      });

      test("no preference: animations on, autoplay still off", async ({ page }) => {
        await page.emulateMedia({ reducedMotion: "no-preference" });
        const root = await gotoPlayer(page, SCAN, "scan");
        await expect(root.locator('[data-player-switch="motion"]')).toHaveAttribute("aria-checked", "true");
        for (const d of await durations(page)) expect(parseFloat(d)).toBeGreaterThan(0);
        await expect(root.getByRole("button", { name: "Play" })).toBeVisible();
      });
    });

    test.describe("AC-G-0-12 theming and contrast", () => {
      for (const theme of ["light", "dark"] as const) {
        test(`role colours >= 3:1, node text >= 4.5:1 (${theme})`, async ({ page }) => {
          await page.goto(SWATCHES);
          await setTheme(page, theme);
          const report = await page.evaluate((roles) => {
            const canvas = document.createElement("canvas");
            canvas.width = canvas.height = 1;
            const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
            const rgb = (css: string) => {
              ctx.clearRect(0, 0, 1, 1);
              ctx.fillStyle = "#000";
              ctx.fillStyle = css;
              ctx.fillRect(0, 0, 1, 1);
              const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
              return [r!, g!, b!].map((v) => v / 255);
            };
            const lum = (c: number[]) => {
              const [r, g, b] = c.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
              return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
            };
            const ratio = (a: string, b: string) => {
              const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((p, q) => q - p);
              return (x! + 0.05) / (y! + 0.05);
            };
            const host = document.querySelector("[data-swatches]")!;
            const token = (name: string) => {
              const probe = document.createElement("span");
              probe.style.color = `var(${name})`;
              host.appendChild(probe);
              const c = getComputedStyle(probe).color;
              probe.remove();
              return c;
            };
            const nodeBg = token("--viz-node-bg");
            const vizBg = token("--viz-bg");
            const rows = roles.map((role) => {
              const g = document.querySelector(`[data-swatch-role="${role}"] [data-role]`)!;
              const shape = g.querySelector("[data-shape]")!;
              const text = g.querySelector("text.viz-text")!;
              const stroke = getComputedStyle(shape).stroke;
              const fill = getComputedStyle(shape).fill;
              const textFill = getComputedStyle(text).fill;
              return {
                role,
                strokeVsNode: ratio(stroke, nodeBg),
                strokeVsBg: ratio(stroke, vizBg),
                text: ratio(textFill, fill),
              };
            });
            return rows;
          }, ROLES);
          for (const r of report) {
            expect(r.strokeVsNode, `${r.role} vs --viz-node-bg`).toBeGreaterThanOrEqual(3);
            expect(r.strokeVsBg, `${r.role} vs --viz-bg`).toBeGreaterThanOrEqual(3);
            expect(r.text, `${r.role} node text`).toBeGreaterThanOrEqual(4.5);
          }
        });
      }
    });

    test.describe("AC-G-0-13 non-colour cues", () => {
      test("every role differs from the default cell by a non-colour attribute", async ({ page }) => {
        await page.goto(SWATCHES);
        const diffs = await page.evaluate((roles) => {
          const describe = (g: Element) => {
            const s = g.querySelector("[data-shape]")!;
            const cs = getComputedStyle(s);
            return {
              dash: cs.strokeDasharray,
              width: cs.strokeWidth,
              opacity: cs.opacity,
              cues: g.querySelectorAll("[data-cue]").length,
            };
          };
          const base = describe(document.querySelector('[data-id="sw-default"]')!);
          return roles.map((role) => {
            const d = describe(document.querySelector(`[data-swatch-role="${role}"] [data-role]`)!);
            return {
              role,
              differs: d.dash !== base.dash || d.width !== base.width || d.opacity !== base.opacity || d.cues > 0,
            };
          });
        }, ROLES);
        expect(diffs.filter((d) => !d.differs)).toEqual([]);
        await expect(page.locator("[data-legend-role]")).toHaveCount(ROLES.length);
      });
    });

    test.describe("AC-G-0-16 table and key steps", () => {
      test("Show as table renders a table and hides the SVG from assistive tech", async ({ page }) => {
        const root = await gotoPlayer(page, SCAN, "scan");
        await stepTo(page, "scan", 3);
        await root.locator('[data-player-switch="table"]').click();
        const table = root.locator("[data-player-table] table");
        await expect(table.locator("caption")).toHaveText("Array, target 23");
        await expect(table.locator('th[scope="col"]')).toHaveText(["Index", "Value", "Status"]);
        await expect(table.locator("tbody tr").nth(1)).toContainText("comparing");
        await expect(root.locator("[data-player-figure] svg")).toHaveAttribute("aria-hidden", "true");
        await expect(root.getByRole("img")).toHaveCount(0);
      });

      test("key steps show 2..6 thumbnails that seek", async ({ page }) => {
        const root = await gotoPlayer(page, SCAN, "scan");
        const details = root.locator("[data-player-keysteps]");
        if (!(await details.evaluate((d) => (d as HTMLDetailsElement).open))) await details.locator("summary").click();
        const thumbs = details.locator("[data-keystep]");
        const n = await thumbs.count();
        expect(n).toBeGreaterThanOrEqual(2);
        expect(n).toBeLessThanOrEqual(6);
        await expect(details.locator("svg [data-id]")).toHaveCount(0); // no ids in thumbnails
        const last = thumbs.nth(n - 1);
        const target = await last.getAttribute("data-keystep");
        await last.click();
        await expect(root).toHaveAttribute("data-step", target!);
      });
    });

    test.describe("AC-G-0-17 code panel", () => {
      test("active line follows the frame in both languages; choice persists; panel scrolls itself", async ({ page }) => {
        const root = await gotoPlayer(page, SCAN_CODE, "scan");
        const details = root.locator("[data-player-code-details]");
        if (!(await details.evaluate((d) => (d as HTMLDetailsElement).open))) {
          await details.locator("summary").click();
        }
        const code = root.locator("[data-player-code]");
        const scroller = code.locator("[data-code-scroll]");
        await root.evaluate((el) => el.scrollIntoView({ block: "start" }));
        const scrollYBefore = await page.evaluate(() => window.scrollY);
        await stepTo(page, "scan", 2);
        const active = code.locator('[data-line][data-active="true"]');
        await expect(active).toHaveCount(1);
        await expect(active).toHaveAttribute("data-line-ids", "demo.scan.compare");
        await expect(code).toHaveAttribute("data-language", "python");
        // Visible inside the panel, panel scrolled, page not.
        await expect.poll(() => scroller.evaluate((s) => s.scrollTop)).toBeGreaterThan(0);
        const inView = await scroller.evaluate((s) => {
          const a = s.querySelector('[data-active="true"]')!.getBoundingClientRect();
          const b = s.getBoundingClientRect();
          return a.top >= b.top && a.bottom <= b.bottom;
        });
        expect(inView).toBe(true);
        expect(await page.evaluate(() => window.scrollY)).toBe(scrollYBefore);

        await root.locator('[data-code-tab="javascript"]').click();
        await expect(code).toHaveAttribute("data-language", "javascript");
        await expect(active).toHaveAttribute("data-line-ids", "demo.scan.compare");
        await stepTo(page, "scan", 7);
        await expect(active).toHaveAttribute("data-line-ids", "demo.scan.found");

        await page.reload();
        await expect(root).toHaveAttribute("data-hydrated", "true");
        await expect(root.locator('[data-code-tab="javascript"]')).toHaveAttribute("aria-selected", "true");
        await expect(code).toHaveAttribute("data-language", "javascript");
      });

      test("arrow keys move between code tabs without stepping the player", async ({ page }) => {
        const root = await gotoPlayer(page, SCAN_CODE, "scan");
        const details = root.locator("[data-player-code-details]");
        if (!(await details.evaluate((d) => (d as HTMLDetailsElement).open))) await details.locator("summary").click();
        await root.locator('[data-code-tab="python"]').focus();
        await page.keyboard.press("ArrowRight");
        await expect(root.locator('[data-code-tab="javascript"]')).toBeFocused();
        await expect(root.locator('[data-code-tab="javascript"]')).toHaveAttribute("aria-selected", "true");
        await expect(root).toHaveAttribute("data-step", "1");
      });
    });
  });
}

test.describe("AC-G-0-14 layout", () => {
  for (const width of [320, 390, 1440]) {
    for (const theme of ["light", "dark"] as const) {
      test(`${width}px ${theme}: no page scroll, 44px targets, 12px SVG text`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(SCAN);
        await setTheme(page, theme);
        for (const url of FIXTURES) {
          await page.goto(url);
          await expectNoHorizontalScroll(page);
          for (const root of await page.locator("[data-player]").all()) {
            await expect(root).toHaveAttribute("data-hydrated", "true");
            await expectTouchTargets(root);
            await expectSvgTextAtLeast12px(root);
          }
        }
      });
    }
  }

  for (const vp of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ]) {
    test(`${vp.width}x${vp.height}: figure, narration and main controls fit in one viewport`, async ({ page }) => {
      await page.setViewportSize(vp);
      for (const url of [SCAN, SCAN_CODE, TREE]) {
        await page.goto(url);
        const root = page.locator("[data-player]").first();
        await expect(root).toHaveAttribute("data-hydrated", "true");
        await root.evaluate((el) => el.scrollIntoView({ block: "start" }));
        for (const sel of ["[data-player-figure]", "[data-player-caption]", "[data-player-main-controls]"]) {
          const box = await root.locator(sel).boundingBox();
          expect(box, `${url} ${sel}`).not.toBeNull();
          expect(box!.y, `${url} ${sel} top`).toBeGreaterThanOrEqual(0);
          expect(box!.y + box!.height, `${url} ${sel} bottom`).toBeLessThanOrEqual(vp.height);
        }
      }
    });
  }
});

test.describe("AC-G-0-15 axe", () => {
  for (const theme of ["light", "dark"] as const) {
    for (const width of [1440, 390]) {
      test(`all fixtures clean after interaction (${theme}, ${width}px)`, async ({ page }) => {
        test.setTimeout(120_000);
        await page.setViewportSize({ width, height: 900 });
        await page.goto(SCAN);
        await setTheme(page, theme);
        for (const url of FIXTURES) {
          await page.goto(url);
          await expectAxeClean(page);
          const roots = await page.locator("[data-player]").all();
          for (const root of roots) {
            const id = (await root.getAttribute("data-player"))!;
            await expect(root).toHaveAttribute("data-hydrated", "true");
            await stepTo(page, id, 3);
            const keys = root.locator("[data-player-keysteps]");
            if (!(await keys.evaluate((d) => (d as HTMLDetailsElement).open))) await keys.locator("summary").click();
            await root.locator('[data-player-switch="table"]').click();
            await expectAxeClean(page);
            // Open the prompt (scan: before step 4; tree: before step 2).
            await stepTo(page, id, id === "tree" || id === "second" ? 1 : 3);
            await root.getByRole("button", { name: "Next step" }).click();
            await expect(root.locator("[data-player-prompt]")).toBeVisible();
            await expectAxeClean(page);
          }
        }
      });
    }
  }
});

test.describe("AC-G-0-18 fixtures need the flag", () => {
  let server: ChildProcess | null = null;
  const port = Number(process.env.PORT ?? 3000) + 50;

  test.afterAll(() => {
    server?.kill("SIGTERM");
  });

  test("GUIDE_FIXTURES=0 -> /learn/dev-fixtures/scan is 404 on a production server", async ({ request }) => {
    test.setTimeout(90_000);
    server = spawn(process.execPath, ["scripts/next.mjs", "start"], {
      env: { ...process.env, PORT: String(port), GUIDE_FIXTURES: "0" },
      stdio: "ignore",
    });
    const base = `http://localhost:${port}`;
    await expect
      .poll(
        async () => {
          try {
            return (await request.get(`${base}/`)).status();
          } catch {
            return 0;
          }
        },
        { timeout: 60_000 },
      )
      .toBe(200);
    expect((await request.get(`${base}/learn/dev-fixtures/scan`)).status()).toBe(404);
    expect((await request.get(`${base}/learn/dev-fixtures/two-players`)).status()).toBe(404);
  });

  test("with the flag (the test server) fixtures render and unknown names 404", async ({ request }) => {
    expect((await request.get(SCAN)).status()).toBe(200);
    expect((await request.get("/learn/dev-fixtures/nope")).status()).toBe(404);
  });
});

test.describe("helpers", () => {
  test("runPlayerConformance passes on the scan and tree fixtures", async ({ page }) => {
    test.setTimeout(60_000);
    await runPlayerConformance(page, SCAN, "scan", { promptBeforeStep: 4, invalidInput: "1, x; 2", hasTable: true });
    await runPlayerConformance(page, TREE, "tree", { promptBeforeStep: 2, hasTable: true });
  });

  test("measureScriptBytes reports the fixture's JS", async ({ page }) => {
    await gotoPlayer(page, SCAN, "scan");
    const { gzipBytes, bodies } = await measureScriptBytes(page);
    expect(bodies.length).toBeGreaterThan(0);
    expect(gzipBytes).toBeGreaterThan(0);
  });
});
