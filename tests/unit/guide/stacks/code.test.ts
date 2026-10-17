// S4 for stacks: the three snippets carry exactly their model's line ids, and
// every cases file agrees with its generator (code-samples.test.ts runs the
// snippets themselves in Python and JS).
import { describe, expect, it } from "vitest";

import { stackBracketsModel, stackMonotonicModel, stackOpsModel, type StackOp, type StackResult } from "@/lib/guide/traces/stack";

import { loadCases } from "../helpers/cases";
import { expectLineIdsCovered } from "../helpers/viz-lines";

const isError = (v: unknown) => typeof v === "object" && v !== null && (v as { $error?: boolean }).$error === true;

describe("stacks code samples: line ids", () => {
  it("array_stack, brackets and next_greater carry exactly their model's line ids", () => {
    expectLineIdsCovered(stackOpsModel, "stacks/array_stack");
    expectLineIdsCovered(stackBracketsModel, "stacks/brackets");
    expectLineIdsCovered(stackMonotonicModel, "stacks/next_greater");
  });
});

describe("stacks code samples agree with the generators", () => {
  it("array_stack: push / pop / peek / is_empty / to_list match stack.ops", () => {
    const cases = loadCases("stacks/array_stack");
    if (cases.kind !== "class") throw new Error("expected a class cases file");
    expect(cases.cases.length).toBeGreaterThanOrEqual(6);
    expect(cases.cases.some((c) => c.expected.some(isError))).toBe(true);
    for (const c of cases.cases) {
      const ops: StackOp[] = [];
      const run = () => stackOpsModel.generate({ ops }).result as StackResult;
      c.ops.forEach(([name, ...args], k) => {
        const expected = c.expected[k];
        const where = `${c.name}, op ${k + 1}`;
        if (name === "push") {
          ops.push({ kind: "push", value: args[0] as number });
          expect(expected, where).toBeNull();
        } else if (name === "pop" || name === "peek") {
          ops.push({ kind: name });
          const out = run().outputs.at(-1);
          if (isError(expected)) expect(out, where).toBeNull();
          else expect(out, where).toBe(expected);
        } else if (name === "to_list") {
          expect(run().values, where).toEqual(expected);
        } else if (name === "is_empty") {
          expect(run().values.length === 0, where).toBe(expected);
        } else {
          throw new Error(`unknown op ${name}`);
        }
      });
    }
  });

  it("brackets: every case equals the stack.brackets result", () => {
    const cases = loadCases("stacks/brackets");
    if (cases.kind !== "function") throw new Error("expected a function cases file");
    expect(cases.cases.length).toBeGreaterThanOrEqual(6);
    for (const c of cases.cases) {
      const [text] = c.args as [string];
      expect(stackBracketsModel.generate({ text }).result, c.name).toBe(c.expected);
    }
  });

  it("next_greater: every case equals the stack.monotonic result", () => {
    const cases = loadCases("stacks/next_greater");
    if (cases.kind !== "function") throw new Error("expected a function cases file");
    expect(cases.cases.length).toBeGreaterThanOrEqual(6);
    for (const c of cases.cases) {
      const [values] = c.args as [number[]];
      expect(stackMonotonicModel.generate({ values }).result, c.name).toEqual(c.expected);
    }
  });
});
