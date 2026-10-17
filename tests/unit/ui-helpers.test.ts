import { describe, expect, it } from "vitest";

import { isActivePath } from "@/components/nav-links";
import { formatMonthYear, formatPercent, formatTagLabel } from "@/lib/format";
import { initials } from "@/lib/initials";
import {
  lemmayardDark,
  lemmayardLight,
  MONACO_THEMES,
  monacoThemeFor,
} from "@/lib/monaco-themes";
import { MOTION, revealStyle } from "@/lib/motion";
import { pageRange, pageWindow } from "@/lib/pagination";
import { progressPercent } from "@/lib/progress";

describe("pageWindow", () => {
  it("shows every page when there are few", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(2, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(1, 4)).toEqual([1, 2, 3, 4]); // gap of one page shows the page
  });

  it("keeps first, last, current ±1 and collapses gaps", () => {
    expect(pageWindow(1, 10)).toEqual([1, 2, "ellipsis-end", 10]);
    expect(pageWindow(5, 10)).toEqual([1, "ellipsis-start", 4, 5, 6, "ellipsis-end", 10]);
    expect(pageWindow(10, 10)).toEqual([1, "ellipsis-start", 9, 10]);
    expect(pageWindow(3, 10)).toEqual([1, 2, 3, 4, "ellipsis-end", 10]);
  });

  it("clamps out-of-range input", () => {
    expect(pageWindow(99, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(-4, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(1, 0)).toEqual([]);
    expect(pageWindow(Number.NaN, 2)).toEqual([1, 2]);
  });
});

describe("pageRange", () => {
  it("computes the visible item range", () => {
    expect(pageRange(1, 20, 45)).toEqual({ from: 1, to: 20 });
    expect(pageRange(2, 20, 45)).toEqual({ from: 21, to: 40 });
    expect(pageRange(3, 20, 45)).toEqual({ from: 41, to: 45 });
    expect(pageRange(1, 20, 0)).toEqual({ from: 0, to: 0 });
  });
});

describe("formatters", () => {
  it("formats percentages and the missing value", () => {
    expect(formatPercent(0.524)).toBe("52.4%");
    expect(formatPercent(0.57, 0)).toBe("57%");
    expect(formatPercent(1)).toBe("100.0%");
    expect(formatPercent(null)).toBe("—");
    expect(formatPercent(Number.NaN)).toBe("—");
  });

  it("formats month and year in UTC", () => {
    expect(formatMonthYear(new Date("2026-10-01T00:30:00Z"))).toBe("Oct 2026");
  });

  it("builds avatar initials", () => {
    expect(initials("ada_l")).toBe("AD");
    expect(initials("x")).toBe("X");
    expect(initials("  ")).toBe("?");
  });

  it("clamps progress percentages", () => {
    expect(progressPercent(10, 16)).toBe(62.5);
    expect(progressPercent(20, 16)).toBe(100);
    expect(progressPercent(-1, 16)).toBe(0);
    expect(progressPercent(3, 0)).toBe(0);
  });
});

describe("navigation", () => {
  it("matches the active section", () => {
    expect(isActivePath("/problems", "/problems")).toBe(true);
    expect(isActivePath("/problems/two-sum", "/problems")).toBe(true);
    expect(isActivePath("/problemsx", "/problems")).toBe(false);
    expect(isActivePath("/", "/problems")).toBe(false);
    expect(isActivePath(null, "/problems")).toBe(false);
  });
});

describe("motion", () => {
  it("staggers reveal delays and clamps the index", () => {
    expect(revealStyle()).toEqual({ "--reveal-index": "0" });
    expect(revealStyle(3)).toEqual({ "--reveal-index": "3" });
    expect(revealStyle(50)).toEqual({ "--reveal-index": String(MOTION.maxStaggerIndex) });
    expect(revealStyle(-2, 120)).toEqual({ "--reveal-index": "0", "--reveal-delay": "120ms" });
  });

  it("keeps durations inside the 120-300 ms band", () => {
    for (const d of [MOTION.durationFast, MOTION.durationBase, MOTION.durationSlow]) {
      expect(d).toBeGreaterThanOrEqual(120);
      expect(d).toBeLessThanOrEqual(300);
    }
  });
});

describe("Monaco themes", () => {
  it("exports both themes under their registered names", () => {
    expect(Object.keys(MONACO_THEMES).sort()).toEqual(["lemmayard-dark", "lemmayard-light"]);
    expect(monacoThemeFor("dark")).toBe("lemmayard-dark");
    expect(monacoThemeFor("light")).toBe("lemmayard-light");
    expect(monacoThemeFor(undefined)).toBe("lemmayard-light");
  });

  it("uses valid hex colors and the editor tokens from the design", () => {
    for (const theme of [lemmayardLight, lemmayardDark]) {
      for (const rule of theme.rules) if (rule.foreground) expect(rule.foreground).toMatch(/^[0-9A-F]{6}$/);
      for (const c of Object.values(theme.colors)) expect(c).toMatch(/^#[0-9A-F]{6}([0-9A-F]{2})?$/);
    }
    expect(lemmayardLight.colors["editor.background"]).toBe("#FBFCFE");
    expect(lemmayardDark.colors["editor.background"]).toBe("#0F1A2E");
  });
});

describe("formatTagLabel", () => {
  it.each([
    ["Hash Table", "Hash table"],
    ["Dynamic Programming", "Dynamic programming"],
    ["Two Pointers", "Two pointers"],
    ["Array", "Array"],
    ["array", "Array"],
    ["Graph BFS", "Graph BFS"],
    ["  Prefix   Sum ", "Prefix sum"],
  ])("%s -> %s", (input, expected) => expect(formatTagLabel(input)).toBe(expected));
});
