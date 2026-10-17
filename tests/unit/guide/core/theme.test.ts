import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { fixturesEnabled } from "@/app/(site)/learn/dev-fixtures/guard";
import { DEFAULT_STYLE, ROLE_STYLES } from "@/components/guide/svg/role-style";
import { ROLES } from "@/lib/guide/contracts";

const ROOT = join(process.cwd(), "src/components/guide");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

describe("role style map", () => {
  it("covers every role", () => {
    expect(Object.keys(ROLE_STYLES).sort()).toEqual([...ROLES].sort());
  });

  it.each(ROLES)("role %s differs from the default by a non-colour cue", (role) => {
    const st = ROLE_STYLES[role];
    const nonColour =
      st.dash !== DEFAULT_STYLE.dash ||
      st.strokeWidth !== DEFAULT_STYLE.strokeWidth ||
      (st.shapeOpacity ?? 1) !== (DEFAULT_STYLE.shapeOpacity ?? 1) ||
      st.cues.length > 0;
    expect(nonColour).toBe(true);
  });

  it("uses only --viz-* colour tokens", () => {
    for (const st of [DEFAULT_STYLE, ...Object.values(ROLE_STYLES)]) {
      for (const c of [st.stroke, st.fill, st.textFill]) expect(c).toMatch(/^var\(--viz-[a-z-]+\)$/);
    }
  });
});

describe("no hard-coded colours in guide components", () => {
  const LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb)\(/;
  const dirs = ["player", "svg", "viz"].map((d) => join(ROOT, d));

  it.each(dirs)("%s has no hex/rgb/oklch literals", (dir) => {
    const offenders = files(dir).filter((f) => /\.(tsx?|css)$/.test(f) && LITERAL.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("viz-theme.css uses literals only as var() fallbacks", () => {
    const css = readFileSync(join(ROOT, "viz-theme.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const line of css.split("\n")) {
      if (!LITERAL.test(line)) continue;
      // Every literal sits inside var(--token, <literal>).
      expect(line).toMatch(/var\(--[a-z-]+, (?:oklch)\([^)]*\)\)/);
    }
  });
});

describe("dev-fixture guard", () => {
  it("is enabled only by GUIDE_FIXTURES=1", () => {
    expect(fixturesEnabled({ GUIDE_FIXTURES: "1" })).toBe(true);
    expect(fixturesEnabled({ GUIDE_FIXTURES: "0" })).toBe(false);
  });
});
