import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { ArrayRenderer } from "@/components/guide/viz/array/ArrayRenderer";
import { arrayShift } from "@/components/guide/viz/array/defs";
import { MAX_FRAMES } from "@/lib/guide/contracts";
import { numRuns } from "@/lib/guide/testing/fc";
import { expectTraceValid } from "@/lib/guide/testing/trace-invariants";
import {
  ARRAY_CAPACITY,
  ARRAY_ID,
  ARRAY_MAX_OPS,
  ARRAY_PRESETS,
  arrayShiftModel,
  arrayTable,
  logical,
  randomArrayInput,
  type ArrayInput,
  type ArrayOp,
} from "@/lib/guide/traces/array";
import { runArrayRef } from "@/lib/guide/traces/array/reference";

import { checkRenderer } from "../complexity-basics/render-check";

const model = arrayShiftModel;

const opArb: fc.Arbitrary<ArrayOp> = fc.oneof(
  fc.record({ kind: fc.constant("insert" as const), index: fc.integer({ min: -2, max: 12 }), value: fc.integer({ min: -99, max: 999 }) }),
  fc.record({ kind: fc.constant("remove" as const), index: fc.integer({ min: -2, max: 11 }) }),
);
const inputArb: fc.Arbitrary<ArrayInput> = fc.record({
  values: fc.array(fc.integer({ min: -99, max: 999 }), { maxLength: ARRAY_CAPACITY }),
  ops: fc.array(opArb, { minLength: 1, maxLength: ARRAY_MAX_OPS }),
});

describe("array.shift (S1: generator contract)", () => {
  it("default input and every preset", () => {
    for (const input of [model.defaultInput, ...ARRAY_PRESETS.map((p) => p.value)]) {
      expectTraceValid(model.generate(input), model, { input });
    }
  });

  it("200 random inputs (property), up to 10 values and 8 ops", () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const t = model.generate(input);
        expectTraceValid(t, model, { input });
        expect(t.frames.length).toBeLessThanOrEqual(MAX_FRAMES);
      }),
      { numRuns: numRuns(200) },
    );
  });

  it("the largest input stays far below the frame cap", () => {
    const input: ArrayInput = {
      values: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      ops: Array.from({ length: ARRAY_MAX_OPS }, (_, k): ArrayOp =>
        k % 2 === 0 ? { kind: "insert", index: 0, value: 5 } : { kind: "remove", index: 0 },
      ),
    };
    const t = model.generate(input);
    expectTraceValid(t, model, { input });
    expect(t.frames.length).toBeLessThan(150);
  });
});

describe("array.shift (S2: reference agreement and per-frame invariants)", () => {
  it("after each finished op the logical sequence and the moves equal splice; size <= capacity on every frame", () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const t = model.generate(input);
        const ref = runArrayRef(input);
        expect(t.result).toEqual(ref.map((r) => ({ ok: r.ok, moves: r.moves })));
        let done = 0;
        for (const f of t.frames) {
          const s = f.state;
          expect(s.size).toBeLessThanOrEqual(s.capacity);
          expect(s.slots).toHaveLength(s.capacity);
          if (s.completed > done) {
            done = s.completed;
            expect(logical(s)).toEqual(ref[done - 1]!.after);
            expect(s.slots.slice(s.size).every((x) => x === null)).toBe(true);
          }
          // An error role is used only for the array itself, on a failed op.
          for (const [id, role] of Object.entries(f.roles)) if (role === "error") expect(id).toBe(ARRAY_ID);
        }
        expect(done).toBe(input.ops.length);
        const totalMoves = ref.reduce((x, r) => x + r.moves, 0);
        expect(t.frames.at(-1)?.counters.moves).toBe(totalMoves);
      }),
      { numRuns: numRuns(200) },
    );
  });
});

describe("array.shift (S3: golden examples)", () => {
  it("insert at index 1 of a 6-element array moves 5 elements; remove at 0 of 7 moves 6", () => {
    const t = model.generate(model.defaultInput);
    const afterInsert = t.frames.find((f) => f.line === "array.insert.write")!;
    expect(afterInsert.counters).toEqual({ moves: 5, writes: 1 });
    expect(logical(afterInsert.state)).toEqual([3, 7, 8, 1, 9, 4, 6]);
    const afterRemove = t.frames.find((f) => f.line === "array.remove.clear")!;
    expect(afterRemove.counters).toEqual({ moves: 11, writes: 2 });
    expect(logical(afterRemove.state)).toEqual([7, 8, 1, 9, 4, 6]);
    const prompts = t.frames.filter((f) => f.prompt).map((f) => [f.prompt!.id, f.prompt!.answerId]);
    expect(prompts).toEqual([
      ["insert-moves", "n5"],
      ["remove-moves", "n6"],
    ]);
    // Shifting starts from the end: the first move takes 6 from index 5 to index 6.
    expect(t.frames.find((f) => f.line === "array.insert.shift")?.narration).toMatch(/^Move 6 from index 5 to index 6/);
  });

  it("an element keeps its id while it moves (so it glides)", () => {
    const t = model.generate({ values: [3, 8], ops: [{ kind: "insert", index: 0, value: 1 }] });
    const last = t.frames.at(-1)!.state.slots;
    expect(last.slice(0, 3).map((x) => x?.id)).toEqual(["e2", "e0", "e1"]);
  });

  it("insert into a full array, bad indices and remove on empty give error frames, not exceptions", () => {
    const full = model.generate({
      values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      ops: [{ kind: "insert", index: 3, value: 25 }],
    });
    expect(full.frames[1]).toMatchObject({ line: "array.insert.full", roles: { [ARRAY_ID]: "error" } });
    const empty = model.generate({ values: [], ops: [{ kind: "remove", index: 0 }, { kind: "insert", index: 1, value: 5 }] });
    expect(empty.frames.map((f) => f.line)).toEqual([null, "array.remove.range", "array.insert.range", null]);
    expect(empty.result).toEqual([
      { ok: false, moves: 0 },
      { ok: false, moves: 0 },
    ]);
  });

  it("inserting at the end moves nothing", () => {
    const t = model.generate({ values: [3, 8, 1], ops: [{ kind: "insert", index: 3, value: 4 }] });
    expect(t.frames.at(-1)?.counters).toEqual({ moves: 0, writes: 1 });
  });
});

describe("array.shift input", () => {
  const spec = model.input!;
  it("parse(format(v)) equals v", () => {
    for (const v of [model.defaultInput, ...ARRAY_PRESETS.map((p) => p.value), randomArrayInput(1), randomArrayInput(9)]) {
      expect(spec.parse(spec.format(v))).toEqual({ ok: true, value: v });
    }
    fc.assert(
      fc.property(inputArb, (v) => {
        const r = spec.parse(spec.format(v));
        expect(r).toEqual({ ok: true, value: v });
        expect(spec.format(v).length).toBeLessThanOrEqual(spec.maxLength);
      }),
      { numRuns: numRuns(200) },
    );
  });

  it("rejects malformed input with a message", () => {
    expect(spec.parse("1, 2, 3")).toMatchObject({ ok: false });
    expect(spec.parse("1, 2: shove 1")).toMatchObject({ ok: false, error: expect.stringMatching(/not one of insert, remove/) });
    expect(spec.parse("1, 2: insert 1")).toMatchObject({ ok: false, error: expect.stringMatching(/takes 2 arguments/) });
    expect(spec.parse("1,2,3,4,5,6,7,8,9,10,11: remove 0")).toMatchObject({ ok: false, error: expect.stringMatching(/At most 10/) });
  });
});

describe("array.shift text alternatives and defs", () => {
  it("describe() and toTable() list every slot", () => {
    const s = model.generate(model.defaultInput).frames[0]!.state;
    expect(model.describe(s)).toContain("capacity 10, size 6");
    expect(arrayTable(s).rows).toHaveLength(10);
    expect(arrayShift.model).toBe(model);
  });
});

describe("AC-G-2-15: ArrayRenderer static markup", () => {
  it("every frame of every preset at 288/390/640/1040 px and as a thumbnail", () => {
    const inputs = [model.defaultInput, ...ARRAY_PRESETS.map((p) => p.value), randomArrayInput(5)];
    expect(checkRenderer(model, ArrayRenderer, inputs)).toEqual([]);
  }, 30_000);
});
