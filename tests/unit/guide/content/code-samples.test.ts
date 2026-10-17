// AC-G-1-7: every lesson code sample runs on the host (python3, node) against
// its *.cases.json. Authored repo code only (CLAUDE.md); never user code.
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { fixtureStackModel } from "@/content/learn/_fixture/viz";
import { loadCodeBundle } from "@/server/guide/code";

import { assertPython, checkSample, loadCases } from "../helpers/cases";
import { expectLineIdsCovered } from "../helpers/viz-lines";

const LEARN = path.join(process.cwd(), "src/content/learn");

function discover(): string[] {
  const bases: string[] = [];
  for (const lesson of readdirSync(LEARN)) {
    let files: string[];
    try {
      files = readdirSync(path.join(LEARN, lesson, "code"));
    } catch {
      continue;
    }
    for (const f of files) if (f.endsWith(".cases.json")) bases.push(path.join(LEARN, lesson, "code", f.slice(0, -".cases.json".length)));
  }
  return bases.sort();
}

const SAMPLES = discover();

describe("code samples", () => {
  // Fails (never skips) when python3 is missing or older than 3.10.
  beforeAll(async () => {
    await assertPython();
  });

  it("finds the fixture sample", () => {
    expect(SAMPLES.map((b) => path.relative(LEARN, b))).toContain(path.join("_fixture", "code", "fixture_stack"));
  });

  it.each(SAMPLES.map((b) => [path.relative(LEARN, b), b]))("%s passes its cases in Python and JavaScript", async (_rel, base) => {
    expect(await checkSample(base as string)).toEqual([]);
  }, 30_000);

  it("fails with file, case and language when an expected value is wrong", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "guide-cases-"));
    try {
      const src = path.join(LEARN, "_fixture", "code", "fixture_stack");
      copyFileSync(`${src}.py`, path.join(dir, "fixture_stack.py"));
      copyFileSync(`${src}.js`, path.join(dir, "fixture_stack.js"));
      const cases = JSON.parse(readFileSync(`${src}.cases.json`, "utf8"));
      cases.cases[0].expected[2] = 99; // pop returns 5, not 99
      writeFileSync(path.join(dir, "fixture_stack.cases.json"), JSON.stringify(cases));
      const failures = await checkSample(path.join(dir, "fixture_stack"));
      expect(failures).toHaveLength(2);
      expect(failures[0]).toMatch(/fixture_stack\.py case "push, push, pop, peek" \(python\), op 3 \["pop"\]: expected 99, got 5/);
      expect(failures[1]).toMatch(/fixture_stack\.js case "push, push, pop, peek" \(javascript\), op 3 \["pop"\]: expected 99, got 5/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it("expects an error where a case says $error, and fails when none is raised", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "guide-cases-"));
    try {
      const src = path.join(LEARN, "_fixture", "code", "fixture_stack");
      copyFileSync(`${src}.py`, path.join(dir, "s.py"));
      copyFileSync(`${src}.js`, path.join(dir, "s.js"));
      const cases = JSON.parse(readFileSync(`${src}.cases.json`, "utf8"));
      cases.cases = [{ name: "push does not raise", ops: [["push", 1]], expected: [{ $error: true }] }];
      writeFileSync(path.join(dir, "s.cases.json"), JSON.stringify(cases));
      const failures = await checkSample(path.join(dir, "s"));
      expect(failures.map((f) => f.replace(/^.*\((python|javascript)\).*$/, "$1"))).toEqual(["python", "javascript"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});

describe("python version check", () => {
  it("fails when the interpreter is missing (injected command name)", async () => {
    await expect(assertPython("python3-definitely-missing")).rejects.toThrow(/python3-definitely-missing.*could not run/);
  });
  it("accepts the host python3", async () => {
    await expect(assertPython()).resolves.toMatch(/^3\.\d+$/);
  });
});

describe("fixture code bundle (AC-G-1-5, AC-G-1-6)", () => {
  it("highlights both listings with data-line / data-line-ids and maps markers to display lines", async () => {
    const bundle = await loadCodeBundle("_fixture/fixture_stack");
    expect(bundle.python.lineMap).toEqual({
      "fixture.stack.push": [8],
      "fixture.stack.checkEmpty": [11, 16],
      "fixture.stack.pop": [13],
      "fixture.stack.peek": [18],
    });
    expect(bundle.python.source.split("\n")[7]).toBe("        self._items.append(value)");
    expect(bundle.python.source).not.toContain("@line");
    expect(bundle.javascript.source).not.toContain("@line");
    expect(bundle.python.html).toContain('<span class="line" data-line="8" data-line-ids="fixture.stack.push">');
    expect(bundle.javascript.html).toMatch(/data-line="1"/);
    expect(bundle.python.html).toContain("--shiki-dark:");
    expect(bundle.python.html).not.toContain("tabindex");
    for (const id of Object.keys(bundle.javascript.lineMap)) {
      for (const n of bundle.javascript.lineMap[id] ?? []) {
        expect(bundle.javascript.html).toMatch(new RegExp(`data-line="${n}" data-line-ids="[^"]*${id.replace(/\./g, "\\.")}`));
      }
    }
  });

  it("covers every line id of the fixture model in both languages", () => {
    expectLineIdsCovered(fixtureStackModel, "_fixture/fixture_stack");
    expect(loadCases("_fixture/fixture_stack").kind).toBe("class");
  });

  it("rejects refs that could escape the content folder", async () => {
    await expect(loadCodeBundle("../../etc/passwd")).rejects.toThrow(/Invalid code ref/);
  });
});
