// S4 for arrays: markers of the three snippets match the models' line ids,
// every cases file agrees with its generator, and range_sum (not the cases
// file's entry) runs against its own cases in both languages.
import { describe, expect, it } from "vitest";

import { arrayShiftModel, type ArrayOp, type ArrayOpOutcome, type ArrayState } from "@/lib/guide/traces/array";
import { mergeModel } from "@/lib/guide/traces/twopointers";
import { prefixSumsModel } from "@/lib/guide/traces/prefix";
import { codeFilePath } from "@/server/guide/code";

import { assertPython, LANGUAGES, loadCases, runDriver, type CasesFile } from "../helpers/cases";
import { expectLineIdsCovered } from "../helpers/viz-lines";

const isError = (v: unknown) => typeof v === "object" && v !== null && (v as { $error?: boolean }).$error === true;

describe("arrays code samples: line ids", () => {
  it("fixed_array, prefix_sums and merge carry exactly their model's line ids", () => {
    expectLineIdsCovered(arrayShiftModel, "arrays/fixed_array");
    expectLineIdsCovered(prefixSumsModel, "arrays/prefix_sums");
    expectLineIdsCovered(mergeModel, "arrays/merge");
  });
});

describe("arrays code samples agree with the generators", () => {
  it("fixed_array: each op's outcome and each snapshot match array.shift", () => {
    const cases = loadCases("arrays/fixed_array");
    if (cases.kind !== "class") throw new Error("expected a class cases file");
    expect(cases.cases.length).toBeGreaterThanOrEqual(6);
    for (const c of cases.cases) {
      const ops: ArrayOp[] = [];
      c.ops.forEach(([name, ...args], k) => {
        const expected = c.expected[k];
        const run = (list: readonly ArrayOp[]) => arrayShiftModel.generate({ values: [], ops: list });
        const stateNow = () => run(ops).frames.at(-1)!.state as ArrayState;
        const logical = (s: ArrayState) => s.slots.slice(0, s.size).map((it) => it!.value);
        if (name === "snapshot") {
          expect(logical(stateNow()), `${c.name}, op ${k + 1}`).toEqual(expected);
          return;
        }
        const before = logical(stateNow());
        const op: ArrayOp =
          name === "insert"
            ? { kind: "insert", index: args[0] as number, value: args[1] as number }
            : { kind: "remove", index: args[0] as number };
        ops.push(op);
        const outcome = (run(ops).result as ArrayOpOutcome[]).at(-1)!;
        expect(outcome.ok, `${c.name}, op ${k + 1}`).toBe(!isError(expected));
        if (op.kind === "remove" && outcome.ok) expect(before[op.index], `${c.name}, op ${k + 1}`).toBe(expected);
      });
    }
  });

  it("prefix_sums: the cases' p equals the last frame of prefix.sums", () => {
    const cases = loadCases("arrays/prefix_sums");
    if (cases.kind !== "function") throw new Error("expected a function cases file");
    expect(cases.cases.length).toBeGreaterThanOrEqual(6);
    for (const c of cases.cases) {
      const [values] = c.args as [number[]];
      const t = prefixSumsModel.generate({ values, l: 0, r: values.length });
      expect(t.frames.at(-1)!.state.p.map((cell) => cell!.value), c.name).toEqual(c.expected);
    }
  });

  it("merge: the cases' output equals the twopointers.merge result", () => {
    const cases = loadCases("arrays/merge");
    if (cases.kind !== "function") throw new Error("expected a function cases file");
    expect(cases.cases.length).toBeGreaterThanOrEqual(6);
    for (const c of cases.cases) {
      const [a, b] = c.args as [number[], number[]];
      expect(mergeModel.generate({ a, b }).result, c.name).toEqual(c.expected);
    }
  });
});

describe("range_sum", () => {
  it("runs in Python and JS and agrees with the prefix.sums query", async () => {
    await assertPython();
    const a = [3, 1, 4, 1, 5, 9, 2, 6];
    const p = [0, 3, 4, 8, 9, 14, 23, 25, 31];
    const ranges: [number, number, number][] = [
      [2, 5, 10],
      [0, 4, 9],
      [0, 8, 31],
      [3, 3, 0],
      [7, 8, 6],
      [0, 0, 0],
    ];
    const cases: CasesFile = {
      kind: "function",
      entry: { python: "range_sum", javascript: "rangeSum" },
      cases: ranges.map(([l, r, sum]) => ({ name: `[${l}, ${r})`, args: [p, l, r], expected: sum })),
    };
    for (const language of LANGUAGES) {
      const results = await runDriver(language, codeFilePath("arrays/prefix_sums", language === "python" ? ".py" : ".js"), cases);
      expect(results, language).toEqual(ranges.map(([, , sum]) => sum));
    }
    for (const [l, r, sum] of ranges) expect(prefixSumsModel.generate({ values: a, l, r }).result).toBe(sum);
  });
});
