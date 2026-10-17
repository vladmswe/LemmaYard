// S4 for dynamic-arrays: the snippet's markers match dynarray.ops, and its
// cases (append, pop, snapshot = [values, capacity]) agree with the generator
// under the snippet's policy (capacity 1, x2, shrink at a quarter).
import { describe, expect, it } from "vitest";

import { dynArrayModel, type DynOp, type DynResult } from "@/lib/guide/traces/dynarray";

import { loadCases } from "../helpers/cases";
import { expectLineIdsCovered } from "../helpers/viz-lines";

const REF = "dynamic-arrays/dynamic_array";
const isError = (v: unknown) => typeof v === "object" && v !== null && (v as { $error?: boolean }).$error === true;

describe("dynamic-arrays code sample", () => {
  it("markers equal the line ids of dynarray.ops", () => {
    expectLineIdsCovered(dynArrayModel, REF);
  });

  it("append / pop / snapshot cases agree with the generator", () => {
    const cases = loadCases(REF);
    if (cases.kind !== "class") throw new Error("expected a class cases file");
    expect(cases.cases.length).toBeGreaterThanOrEqual(6);
    for (const c of cases.cases) {
      const ops: DynOp[] = [];
      const run = () =>
        dynArrayModel.generate({ initialCapacity: 1, growth: 2, shrink: "quarter", ops }).result as DynResult;
      c.ops.forEach(([name, ...args], k) => {
        const expected = c.expected[k];
        const where = `${c.name}, op ${k + 1}`;
        if (name === "snapshot") {
          const r = run();
          expect([r.values, r.capacity], where).toEqual(expected);
        } else if (name === "append") {
          ops.push({ kind: "append", value: args[0] as number });
          expect(expected, where).toBeNull();
        } else if (name === "pop") {
          ops.push({ kind: "pop" });
          const popped = run().popped.at(-1);
          if (isError(expected)) expect(popped, where).toBeNull();
          else expect(popped, where).toBe(expected);
        } else if (name === "get") {
          // get(i) is not animated; check it against the generator's elements.
          const values = run().values;
          const i = args[0] as number;
          if (isError(expected)) expect(i >= values.length || i < 0, where).toBe(true);
          else expect(values[i], where).toBe(expected);
        } else {
          throw new Error(`unknown op ${name}`);
        }
      });
    }
  });
});
