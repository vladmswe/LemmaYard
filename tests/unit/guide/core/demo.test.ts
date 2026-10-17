import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { MAX_FRAMES } from "@/lib/guide/contracts";
import { numRuns } from "@/lib/guide/testing/fc";
import { expectTraceValid } from "@/lib/guide/testing/trace-invariants";
import {
  demoScanModel,
  demoTreeModel,
  randomScanInput,
  SCAN_MAX,
  SCAN_MAX_VALUES,
  SCAN_MIN,
  scanTable,
  TREE_TARGET_RANGE,
  treeTable,
} from "@/lib/guide/traces/demo/linear-scan";

const scanInputArb = fc
  .array(fc.integer({ min: SCAN_MIN, max: SCAN_MAX }), { minLength: 1, maxLength: SCAN_MAX_VALUES })
  .chain((values) =>
    fc.record({
      values: fc.constant(values),
      target: fc.oneof(fc.constantFrom(...values), fc.integer({ min: SCAN_MIN, max: SCAN_MAX })),
    }),
  );

describe("demo.scan", () => {
  it("default trace: start, 5 compares, found at index 4, one prompt", () => {
    const t = demoScanModel.generate(demoScanModel.defaultInput);
    expect(t.frames.map((f) => f.phase)).toEqual(["Start", "Compare", "Compare", "Compare", "Compare", "Compare", "Found"]);
    expect(t.frames.at(-1)?.counters).toEqual({ comparisons: 5 });
    expect(t.frames.filter((f) => f.prompt)).toHaveLength(1);
    expect(t.frames[3]?.prompt?.answerId).toBe("no");
    expectTraceValid(t, demoScanModel, { input: demoScanModel.defaultInput });
  });

  it("missing target ends with 'Not found' after n comparisons", () => {
    const t = demoScanModel.generate({ values: [5, 1, 9, 3], target: 7 });
    expect(t.frames.at(-1)).toMatchObject({ phase: "Not found", counters: { comparisons: 4 } });
  });

  it("satisfies the generator contract on 200 random inputs (property)", () => {
    fc.assert(
      fc.property(scanInputArb, (input) => {
        const t = demoScanModel.generate(input);
        expectTraceValid(t, demoScanModel, { input });
        expect(t.frames.length).toBeLessThanOrEqual(MAX_FRAMES);
        // The last frame's comparisons equal the reference index-of count.
        const idx = input.values.indexOf(input.target);
        expect(t.frames.at(-1)?.counters.comparisons).toBe(idx === -1 ? input.values.length : idx + 1);
      }),
      { numRuns: numRuns(200) },
    );
  });

  it("parse(format(v)) equals v for presets, default and random inputs", () => {
    const spec = demoScanModel.input!;
    const values = [demoScanModel.defaultInput, ...spec.presets.map((p) => p.value), randomScanInput(7)];
    for (const v of values) expect(spec.parse(spec.format(v))).toEqual({ ok: true, value: v });
    fc.assert(
      fc.property(scanInputArb, (v) => {
        expect(spec.parse(spec.format(v))).toEqual({ ok: true, value: v });
        expect(spec.format(v).length).toBeLessThanOrEqual(spec.maxLength);
      }),
      { numRuns: numRuns(200) },
    );
  });

  it("rejects malformed input with a message", () => {
    const spec = demoScanModel.input!;
    expect(spec.parse("1, x, 3; 3")).toEqual({ ok: false, error: "Number 2: 'x' is not a whole number" });
    expect(spec.parse("1, 2, 3")).toMatchObject({ ok: false });
    expect(spec.parse("1, 2; x")).toMatchObject({ ok: false, error: expect.stringMatching(/^Target:/) });
  });

  it("describe() and toTable() cover the state", () => {
    const t = demoScanModel.generate(demoScanModel.defaultInput);
    expect(demoScanModel.describe(t.frames[0]!.state)).toContain("4, 8, 15, 16, 23, 42");
    expect(scanTable(t.frames.at(-1)!.state).rows[4]).toEqual([4, 23, "found"]);
  });
});

describe("demo.tree", () => {
  it("default trace walks 8 -> 12 -> 10 and asks one prompt", () => {
    const t = demoTreeModel.generate(demoTreeModel.defaultInput);
    expect(t.frames.map((f) => f.phase)).toEqual(["Start", "Go right", "Go left", "Found"]);
    expect(t.frames.filter((f) => f.prompt)).toHaveLength(1);
    expectTraceValid(t, demoTreeModel, { input: demoTreeModel.defaultInput });
  });

  it("satisfies the generator contract on 200 random targets (property)", () => {
    fc.assert(
      fc.property(fc.integer(TREE_TARGET_RANGE), (target) => {
        const input = { target };
        const t = demoTreeModel.generate(input);
        expectTraceValid(t, demoTreeModel, { input });
        expect(t.result).toBe([8, 4, 12, 2, 6, 10, 14].includes(target));
      }),
      { numRuns: numRuns(200) },
    );
  });

  it("has 7 nodes and a table row per node", () => {
    const s = demoTreeModel.generate({ target: 3 }).frames[0]!.state;
    expect(demoTreeModel.ids(s)).toHaveLength(7);
    expect(treeTable(s).rows).toHaveLength(7);
  });
});
