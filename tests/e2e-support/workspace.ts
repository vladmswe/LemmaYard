// Shared steps for the judged flows: sign up through the form, open a
// problem, pick the language and put code into Monaco. Selectors are roles,
// labels and the existing data-testids only, so restyling does not break them.
import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { expect, type Page } from "@playwright/test";

export type Language = "python" | "javascript" | "java";

export const EDITOR_LINES = '[data-testid="code-editor"] .view-lines';

/** A fresh user per test: `<prefix>_<8 hex>`, deterministic shape, no collisions. */
export function uniqueUsername(prefix: string): string {
  return `${prefix}_${randomBytes(4).toString("hex")}`;
}

/** Signs up through /register and waits for the redirect away from it. */
export async function registerViaUi(page: Page, username: string): Promise<void> {
  await page.goto("/register");
  await page.getByLabel("Email").fill(`${username}@example.test`);
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill("e2e-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).not.toHaveURL(/\/register/, { timeout: 30_000 });
}

export async function openProblem(page: Page, slug: string): Promise<void> {
  await page.goto(`/problems/${slug}`);
  await expect(page.locator(`[data-testid="code-editor"] .monaco-editor .view-lines`)).toBeVisible({ timeout: 60_000 });
}

export async function selectLanguage(page: Page, language: Language): Promise<void> {
  await page.getByTestId("language-select").click();
  await page.getByTestId(`language-option-${language}`).click();
  await expect(page.getByTestId(`language-option-${language}`)).toBeHidden();
}

/**
 * Monaco picks Cmd vs Ctrl from the user agent, and the Desktop Chrome device
 * reports Windows even on a macOS host, so `ControlOrMeta` would be wrong there.
 */
async function modifier(page: Page): Promise<"Meta" | "Control"> {
  return (await page.evaluate(() => /Mac/.test(navigator.userAgent))) ? "Meta" : "Control";
}

export function editorText(page: Page): Promise<string> {
  return page.locator(EDITOR_LINES).evaluate((el) => (el as HTMLElement).innerText.replace(/ /g, " "));
}

/**
 * Replaces the editor text: click, select all, delete, then a synthetic
 * paste. `keyboard.insertText` counts as typing, so Monaco auto-indents and
 * auto-closes brackets and multi-line code arrives mangled; a paste keeps it
 * verbatim. Waits until `marker` is rendered; Monaco renders only the lines
 * in view, so the default is the last non-empty line (the cursor ends there).
 */
export async function pasteCode(page: Page, code: string, marker?: string): Promise<void> {
  const expected = marker ?? code.trimEnd().split("\n").at(-1)!.trim();
  await page.locator(EDITOR_LINES).click();
  await page.keyboard.press(`${await modifier(page)}+A`);
  await page.keyboard.press("Delete");
  await page.evaluate((text) => {
    const data = new DataTransfer();
    data.setData("text/plain", text);
    document.activeElement?.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, code);
  await expect.poll(() => editorText(page)).toContain(expected);
}

/** Problems the e2e database holds: every directory in problems/ with a meta.json. */
export function problemCount(): number {
  const root = path.join(process.cwd(), "problems");
  return readdirSync(root, { withFileTypes: true }).filter(
    (e) => e.isDirectory() && existsSync(path.join(root, e.name, "meta.json")),
  ).length;
}

const SOLUTION_FILES: Record<Language, string> = {
  python: "solution.py",
  javascript: "solution.js",
  java: "solution.java",
};

/** The reference solution shipped with a problem (problems/<slug>/solution.*). */
export function referenceSolution(slug: string, language: Language): string {
  return readFileSync(path.join(process.cwd(), "problems", slug, SOLUTION_FILES[language]), "utf8");
}
