import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { CASE_STATUSES, VERDICTS } from "@/components/judge/verdict";
import { DIFFICULTIES } from "@/components/problems/difficulty";
import { PROBLEM_STATUSES } from "@/components/problems/problem-status";
import { difficultyEnum, submissionStatusEnum } from "@/server/db/schema";

const css = readFileSync(new URL("../../src/app/globals.css", import.meta.url), "utf8");

/** `text-verdict-accepted` -> the `--color-verdict-accepted` theme mapping must exist. */
function expectThemeColor(cls: string) {
  const token = cls.replace(/^(text|bg|border-l|border)-/, "");
  expect(css, `missing --color-${token} for ${cls}`).toContain(`--color-${token}:`);
}

describe("verdict dictionary", () => {
  it("has an entry for every submission status in the DB enum, and nothing else", () => {
    expect(Object.keys(VERDICTS).sort()).toEqual([...submissionStatusEnum.enumValues].sort());
  });

  it.each(submissionStatusEnum.enumValues)("%s has label, icon and token classes", (status) => {
    const v = VERDICTS[status];
    expect(v.label).toMatch(/^[A-Z][A-Za-z ]+$/);
    expect(v.shortLabel.length).toBeGreaterThan(0);
    expect(v.icon).toBeTruthy();
    expect(v.text).toMatch(/^text-verdict-[a-z]+$/);
    expect(v.bg).toMatch(/^bg-verdict-[a-z]+-bg$/);
    expect(v.badge).toBe(`${v.bg} ${v.text}`);
    expect(v.edge).toMatch(/^border-l-verdict-[a-z]+$/);
    for (const cls of [v.text, v.bg, v.edge]) expectThemeColor(cls);
  });

  it("uses distinct colors and labels per verdict", () => {
    const values = Object.values(VERDICTS);
    expect(new Set(values.map((v) => v.text)).size).toBe(values.length);
    expect(new Set(values.map((v) => v.label)).size).toBe(values.length);
  });

  it("marks only queued and running as pending; only running animates", () => {
    const pending = Object.entries(VERDICTS).filter(([, v]) => v.pending).map(([k]) => k);
    expect(pending.sort()).toEqual(["queued", "running"]);
    const animated = Object.entries(VERDICTS).filter(([, v]) => v.reducedMotionIcon);
    expect(animated.map(([k]) => k)).toEqual(["running"]);
  });

  it("keeps the canonical labels from DESIGN.md", () => {
    expect(VERDICTS.accepted.label).toBe("Accepted");
    expect(VERDICTS.time_limit.label).toBe("Time Limit Exceeded");
    expect(VERDICTS.time_limit.shortLabel).toBe("TLE");
    expect(VERDICTS.memory_limit.shortLabel).toBe("MLE");
  });

  it("maps every per-case status to a label, icon and class", () => {
    for (const s of ["passed", "failed", "runtime_error", "time_limit", "memory_limit", "not_run"] as const) {
      expect(CASE_STATUSES[s].label.length).toBeGreaterThan(0);
      expect(CASE_STATUSES[s].icon).toBeTruthy();
      expect(CASE_STATUSES[s].text).toMatch(/^text-/);
    }
  });
});

describe("difficulty and problem status dictionaries", () => {
  it("covers every difficulty in the DB enum with literal token classes", () => {
    expect(Object.keys(DIFFICULTIES).sort()).toEqual([...difficultyEnum.enumValues].sort());
    for (const d of difficultyEnum.enumValues) {
      const m = DIFFICULTIES[d];
      expect(m.label).toBe(d[0].toUpperCase() + d.slice(1));
      expect(m.text).toBe(`text-difficulty-${d}`);
      expect(m.badge).toBe(`bg-difficulty-${d}-bg text-difficulty-${d}`);
      expect(m.fill).toBe(`bg-difficulty-${d}`);
      expectThemeColor(m.text);
      expectThemeColor(`bg-difficulty-${d}-bg`);
    }
  });

  it("pairs every problem status with an icon and a word", () => {
    expect(Object.keys(PROBLEM_STATUSES).sort()).toEqual(["attempted", "solved", "todo"]);
    for (const s of Object.values(PROBLEM_STATUSES)) {
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.icon).toBeTruthy();
      expect(s.text).toMatch(/^text-/);
    }
  });
});
