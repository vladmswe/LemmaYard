// S4 for complexity-basics: the search snippet's markers match the models'
// line ids, its cases agree with the generators, and linear_search (not the
// cases file's entry) runs against its own cases in both languages.
import { describe, expect, it } from "vitest";

import { searchBinaryModel, searchLinearModel } from "@/lib/guide/traces/search";
import { codeFilePath } from "@/server/guide/code";

import { assertPython, LANGUAGES, loadCases, runDriver, type CasesFile } from "../helpers/cases";
import { expectLineIdsCovered } from "../helpers/viz-lines";

const REF = "complexity-basics/search";

describe("complexity-basics code sample", () => {
  it("markers equal the line ids of both search models", () => {
    expectLineIdsCovered(searchLinearModel, REF);
    expectLineIdsCovered(searchBinaryModel, REF);
  });

  it("binary_search cases agree with the search.binary generator", () => {
    const cases = loadCases(REF);
    if (cases.kind !== "function") throw new Error("expected a function cases file");
    expect(cases.cases.length).toBeGreaterThanOrEqual(6);
    for (const c of cases.cases) {
      const [values, target] = c.args as [number[], number];
      const t = searchBinaryModel.generate({ op: "binary", values, target });
      expect(t.result, c.name).toBe(c.expected);
    }
  });

  it("linear_search runs in Python and JS and agrees with the search.linear generator", async () => {
    await assertPython();
    const sixteen = [2, 5, 9, 14, 17, 21, 26, 30, 35, 41, 44, 50, 57, 63, 68, 74];
    const linear: CasesFile = {
      kind: "function",
      entry: { python: "linear_search", javascript: "linearSearch" },
      cases: [
        { name: "target at the start", args: [sixteen, 2], expected: 0 },
        { name: "target at the end", args: [sixteen, 74], expected: 15 },
        { name: "absent target", args: [sixteen, 40], expected: -1 },
        { name: "unsorted input still works", args: [[9, 3, 7], 7], expected: 2 },
        { name: "first of repeated values", args: [[4, 4, 4], 4], expected: 0 },
        { name: "empty array", args: [[], 1], expected: -1 },
      ],
    };
    for (const language of LANGUAGES) {
      const results = await runDriver(language, codeFilePath(REF, language === "python" ? ".py" : ".js"), linear);
      expect(results, language).toEqual(linear.cases.map((c) => c.expected));
    }
    for (const c of linear.cases) {
      const [values, target] = c.args as [number[], number];
      expect(searchLinearModel.generate({ op: "linear", values, target }).result, c.name).toBe(c.expected);
    }
  });
});
