// WCAG contrast of the design tokens, read from globals.css (DESIGN.md §4.7).
// Port of the spec's tokens.py check: text pairs >= 4.5:1, UI boundaries >= 3:1.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { lemmayardDark, lemmayardLight, type MonacoThemeData } from "@/lib/monaco-themes";

const css = readFileSync(new URL("../../src/app/globals.css", import.meta.url), "utf8");

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`\n${selector} {`);
  if (start < 0) throw new Error(`no ${selector} block`);
  const body = css.slice(start, css.indexOf("\n}", start));
  const vars: Record<string, string> = {};
  for (const m of body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)) vars[m[1]] = m[2];
  return vars;
}

const light = block(":root");
const dark = { ...light, ...block(".dark") };

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function ratio(fg: string, bg: string): number {
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

const SURFACES = ["background", "card"];
const TEXT_PAIRS: [string, string][] = [
  ["foreground", "background"],
  ["foreground", "card"],
  ["foreground", "surface-sunken"],
  ["foreground", "muted"],
  ["foreground-secondary", "background"],
  ["foreground-secondary", "card"],
  ["muted-foreground", "background"],
  ["muted-foreground", "card"],
  ["muted-foreground", "muted"],
  ["muted-foreground", "surface-sunken"],
  ["muted-foreground", "accent"],
  ["faint-foreground", "background"],
  ["faint-foreground", "card"],
  ["primary-foreground", "primary"],
  ["primary-foreground", "primary-hover"],
  ["primary-foreground", "primary-active"],
  ["secondary-foreground", "secondary"],
  ["accent-foreground", "accent"],
  ["link", "background"],
  ["link", "card"],
  ["link", "surface-sunken"],
  ["link-visited", "background"],
  ["primary", "background"],
  ["primary", "card"],
  ["header-foreground", "header"],
  ["header-muted", "header"],
  ["destructive-foreground", "destructive"],
  ["destructive-foreground", "destructive-hover"],
  ["tooltip-fg", "tooltip-bg"],
  ["avatar-fg", "avatar-bg"],
  ["popover-foreground", "popover"],
  ...(["success", "warning", "danger", "info"] as const).flatMap((s): [string, string][] => [
    [s, `${s}-bg`],
    [s, "card"],
  ]),
  ...["accepted", "wrong", "tle", "mle", "runtime", "compile", "internal", "queued", "running"].flatMap(
    (v): [string, string][] => [
      [`verdict-${v}`, `verdict-${v}-bg`],
      ...SURFACES.map((s): [string, string] => [`verdict-${v}`, s]),
    ],
  ),
  ...["easy", "medium", "hard"].flatMap((d): [string, string][] => [
    [`difficulty-${d}`, `difficulty-${d}-bg`],
    ...[...SURFACES, "surface-sunken", "accent"].map((s): [string, string] => [`difficulty-${d}`, s]),
  ]),
];
const UI_PAIRS: [string, string][] = [
  ["ring", "background"],
  ["ring", "card"],
  ["input", "background"],
  ["input", "card"],
];

describe.each([
  ["light", light],
  ["dark", dark],
])("%s theme contrast", (_name, t) => {
  it.each(TEXT_PAIRS)("text %s on %s >= 4.5:1", (fg, bg) => {
    expect(t[fg], `--${fg}`).toBeDefined();
    expect(t[bg], `--${bg}`).toBeDefined();
    expect(ratio(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(UI_PAIRS)("ui %s on %s >= 3:1", (fg, bg) => {
    expect(ratio(t[fg], t[bg])).toBeGreaterThanOrEqual(3);
  });
});

describe("header focus ring", () => {
  // site-header.tsx overrides --ring with blue-300 because the default ring
  // (#2457C5) is only 2.65:1 on the navy masthead.
  it("is visible on the masthead in both themes", () => {
    expect(ratio("#9dbcee", light.header)).toBeGreaterThanOrEqual(3);
    expect(ratio("#9dbcee", dark.header)).toBeGreaterThanOrEqual(3);
  });
});

describe.each([
  ["lemmayard-light", lemmayardLight],
  ["lemmayard-dark", lemmayardDark],
] as [string, MonacoThemeData][])("%s token contrast", (_name, theme) => {
  const bg = theme.colors["editor.background"];
  it.each(theme.rules.filter((r) => r.foreground).map((r) => [r.token || "(default)", r.foreground!]))(
    "%s >= 4.5:1 on the editor background",
    (_token, fg) => {
      expect(ratio(`#${fg}`, bg)).toBeGreaterThanOrEqual(4.5);
    },
  );
  it("line numbers >= 4.5:1", () => {
    expect(ratio(theme.colors["editorLineNumber.foreground"], bg)).toBeGreaterThanOrEqual(4.5);
  });
});

it("matches the spec's computed reference values", () => {
  expect(ratio("#14213d", "#ffffff")).toBeCloseTo(15.97, 1);
  expect(ratio("#2457c5", "#ffffff")).toBeCloseTo(6.47, 1);
  expect(ratio("#8293ae", "#ffffff")).toBeCloseTo(3.12, 1);
});
