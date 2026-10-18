// WCAG contrast of the design v2 tokens, read from the real globals.css
// (:root = light, .dark = dark; DESIGN.md §6.3). Port of the spec's
// tokens.py / monaco.py checks: every text pair >= 4.5:1 and every UI
// boundary >= 3:1, in both themes, plus the Monaco token colours.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { lemmayardDark, lemmayardLight, type MonacoThemeData } from "@/lib/monaco-themes";

const css = readFileSync(new URL("../../src/app/globals.css", import.meta.url), "utf8");

/** Custom properties of a top-level block (`:root {`, `.dark {`). */
function block(selector: string): Record<string, string> {
  const start = css.indexOf(`\n${selector} {`);
  if (start < 0) throw new Error(`no ${selector} block`);
  const body = css.slice(start, css.indexOf("\n}", start));
  const vars: Record<string, string> = {};
  for (const m of body.matchAll(/--([a-z0-9-]+):\s*([^;]+);/gi)) vars[m[1]] = m[2].trim();
  return vars;
}

/** Resolves `var(--x)` aliases to the hex value they point at. */
function resolve(vars: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  const get = (name: string, depth = 0): string | undefined => {
    const v = vars[name];
    if (v === undefined || depth > 8) return undefined;
    const alias = /^var\(--([a-z0-9-]+)\)$/i.exec(v);
    if (alias) return get(alias[1], depth + 1);
    return /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : undefined;
  };
  for (const name of Object.keys(vars)) {
    const v = get(name);
    if (v) out[name] = v;
  }
  return out;
}

const rootVars = block(":root");
const light = resolve(rootVars);
const dark = resolve({ ...rootVars, ...block(".dark") });

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function ratio(fg: string, bg: string): number {
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

// The spec's short names (tokens.py) → the CSS custom properties (§6.4).
const NAME: Record<string, string> = {
  bg: "background",
  surface: "card",
  sunken: "surface-sunken",
  raised: "popover",
  ink: "foreground",
  "ink-2": "foreground-secondary",
  muted: "muted-foreground",
  faint: "faint-foreground",
  "on-primary": "primary-foreground",
  "primary-soft": "secondary",
  "on-primary-soft": "secondary-foreground",
  "on-destructive": "destructive-foreground",
};
const cssName = (n: string) =>
  NAME[n] ?? n.replace(/^v-/, "verdict-").replace(/^d-(easy|medium|hard)/, "difficulty-$1");

// tokens.py TEXT pairs (>= 4.5:1).
const TEXT: [string, string][] = [
  ...["bg", "surface", "sunken", "raised", "highlight", "primary-soft"].map((s): [string, string] => ["ink", s]),
  ...["ink-2", "muted", "faint"].flatMap((t) =>
    ["bg", "surface", "sunken", "raised"].map((s): [string, string] => [t, s]),
  ),
  ["on-primary", "primary"],
  ["on-primary", "primary-hover"],
  ["on-primary", "primary-active"],
  ["on-primary-soft", "primary-soft"],
  ["link", "bg"],
  ["link", "surface"],
  ["link", "sunken"],
  ["primary", "bg"],
  ["primary", "surface"],
  ["on-cobalt", "cobalt"],
  ["on-cobalt-2", "cobalt"],
  ["on-night", "night"],
  ["on-night-2", "night"],
  ["gutter-ink", "editor-bg"],
  ["ink", "editor-bg"],
  ["tooltip-fg", "tooltip-bg"],
  ["on-destructive", "destructive"],
  ["on-destructive", "destructive-hover"],
  ["primary", "primary-soft"],
  ["muted", "primary-soft"],
  ...["success", "warning", "danger", "info", "live"].flatMap((k): [string, string][] => [
    [k, `${k}-bg`],
    [k, "surface"],
    [k, "bg"],
  ]),
  ...["accepted", "wrong", "tle", "mle", "runtime", "compile", "internal", "queued", "running"].flatMap(
    (k): [string, string][] => [
      [`v-${k}`, `v-${k}-bg`],
      [`v-${k}`, "surface"],
      [`v-${k}`, "editor-bg"],
    ],
  ),
  ...["easy", "medium", "hard"].flatMap((k): [string, string][] => [
    [`d-${k}`, `d-${k}-bg`],
    [`d-${k}`, "surface"],
    [`d-${k}`, "bg"],
  ]),
];

// tokens.py UI pairs (>= 3:1).
const UI: [string, string][] = [
  ["input", "surface"],
  ["input", "bg"],
  ["input", "sunken"],
  ["ring", "bg"],
  ["ring", "surface"],
  ["primary", "bg"],
  ["cobalt-line", "cobalt"],
  ["sky", "night"],
  ["primary", "raised"],
];

// Pairs of the shadcn-only names the app also uses (row hover, avatar,
// header, visited links, sidebar).
const EXTRA_TEXT: [string, string][] = [
  ["accent-foreground", "accent"],
  ["muted-foreground", "accent"],
  ["foreground", "muted"],
  ["muted-foreground", "muted"],
  ["link-visited", "background"],
  ["link-visited", "card"],
  ["avatar-fg", "avatar-bg"],
  ["header-foreground", "header"],
  ["header-muted", "header"],
  ["popover-foreground", "popover"],
  ["card-foreground", "card"],
  ["sidebar-foreground", "sidebar"],
  ["sidebar-accent-foreground", "sidebar-accent"],
  ["sidebar-primary-foreground", "sidebar-primary"],
  ...["easy", "medium", "hard"].flatMap((d): [string, string][] => [
    [`difficulty-${d}`, "surface-sunken"],
    [`difficulty-${d}`, "accent"],
  ]),
  // Rooms v2: white initials on the 8 room color tiles.
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((i): [string, string] => ["on-room", `room-${i}`]),
];

describe.each([
  ["light", light],
  ["dark", dark],
])("%s theme contrast", (_name, t) => {
  it("covers the spec's 99 rows (on-cobalt-2/cobalt is listed twice there)", () => {
    expect(TEXT.length + UI.length + 1).toBe(99);
  });

  it.each(TEXT)("text %s on %s >= 4.5:1", (fg, bg) => {
    const [f, b] = [t[cssName(fg)], t[cssName(bg)]];
    expect(f, `--${cssName(fg)}`).toBeDefined();
    expect(b, `--${cssName(bg)}`).toBeDefined();
    expect(ratio(f, b)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(UI)("ui %s on %s >= 3:1", (fg, bg) => {
    const [f, b] = [t[cssName(fg)], t[cssName(bg)]];
    expect(f, `--${cssName(fg)}`).toBeDefined();
    expect(b, `--${cssName(bg)}`).toBeDefined();
    expect(ratio(f, b)).toBeGreaterThanOrEqual(3);
  });

  it.each(EXTRA_TEXT)("text %s on %s >= 4.5:1", (fg, bg) => {
    expect(t[fg], `--${fg}`).toBeDefined();
    expect(t[bg], `--${bg}`).toBeDefined();
    expect(ratio(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it("the short v2 aliases resolve to the canonical tokens", () => {
    for (const [short, canonical] of Object.entries(NAME)) {
      // `muted` stays the shadcn surface (= sunken), not an alias of the text colour.
      if (short === "muted" || rootVars[short] === undefined) continue;
      expect(t[short], `--${short}`).toBe(t[canonical]);
    }
  });
});

describe.each([
  ["lemmayard-light", lemmayardLight, light],
  ["lemmayard-dark", lemmayardDark, dark],
] as [string, MonacoThemeData, Record<string, string>][])("%s", (_name, theme, tokens) => {
  const bg = theme.colors["editor.background"];
  it("uses the editor-bg token as its background", () => {
    expect(bg.toLowerCase()).toBe(tokens["editor-bg"]);
  });
  it.each(theme.rules.filter((r) => r.foreground).map((r) => [r.token || "(default)", r.foreground!]))(
    "%s >= 4.5:1 on the editor background",
    (_token, fg) => {
      expect(ratio(`#${fg}`, bg)).toBeGreaterThanOrEqual(4.5);
    },
  );
  it("line numbers >= 4.5:1", () => {
    expect(ratio(theme.colors["editorLineNumber.foreground"], bg)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(theme.colors["editorLineNumber.activeForeground"], bg)).toBeGreaterThanOrEqual(4.5);
  });
  it("cursor and bracket border >= 3:1", () => {
    expect(ratio(theme.colors["editorCursor.foreground"], bg)).toBeGreaterThanOrEqual(3);
    expect(ratio(theme.colors["editorBracketMatch.border"], bg)).toBeGreaterThanOrEqual(3);
  });
});

it("matches the spec's computed reference values (DESIGN.md §6.3)", () => {
  expect(ratio(light.foreground, light.background)).toBeCloseTo(17.2, 0);
  expect(ratio(dark.foreground, dark.background)).toBeCloseTo(17.6, 0);
  expect(ratio(light.primary, light.card)).toBeCloseTo(7.5, 0);
  expect(ratio(dark.primary, dark.card)).toBeCloseTo(7.9, 0);
  expect(ratio(light["on-cobalt"], light.cobalt)).toBeCloseTo(8.8, 0);
  expect(ratio(light.input, light.card)).toBeCloseTo(4.0, 0);
});
