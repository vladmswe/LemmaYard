import { describe, expect, it } from "vitest";

import { MAX_FRAMES, type Frame, type Trace, type VizModel } from "@/lib/guide/contracts";
import {
  checkTraceInvariants,
  expectTraceValid,
  formatViolations,
} from "@/lib/guide/testing/trace-invariants";
import { demoScanModel, type ScanInput, type ScanState } from "@/lib/guide/traces/demo/linear-scan";

type S = ScanState;
const input = demoScanModel.defaultInput;
const good = (): Trace<S> => structuredClone(demoScanModel.generate(input)) as Trace<S>;

/** A model whose generate() returns `trace` (so rule 1 holds unless the test breaks it). */
function modelFor(trace: Trace<S>, over: Partial<VizModel<S, ScanInput>> = {}): VizModel<S, ScanInput> {
  return { ...demoScanModel, generate: () => trace, ...over };
}

function mapFrame(t: Trace<S>, i: number, f: (fr: Frame<S>) => Frame<S>): Trace<S> {
  return { ...t, frames: t.frames.map((fr, k) => (k === i ? f(fr) : fr)) };
}

function rulesOf(trace: Trace<S>, model: VizModel<S, ScanInput>, inp: ScanInput = input): number[] {
  return [...new Set(checkTraceInvariants(trace, model, { input: inp }).map((v) => v.rule))].sort((a, b) => a - b);
}

describe("checkTraceInvariants", () => {
  it("accepts the demo.scan default trace", () => {
    const t = good();
    expect(checkTraceInvariants(t, modelFor(t), { input })).toEqual([]);
  });

  const variants: [number, string, () => { trace: Trace<S>; model: VizModel<S, ScanInput>; input?: ScanInput }][] = [
    [
      1,
      "non-deterministic generate",
      () => {
        let n = 0;
        const t = good();
        return {
          trace: t,
          model: modelFor(t, {
            generate: () => mapFrame(good(), 1, (f) => ({ ...f, narration: `${f.narration} (${++n})` })),
          }),
        };
      },
    ],
    [2, "frame 0 is not the start frame", () => {
      const t = mapFrame(good(), 0, (f) => ({ ...f, phase: "Begin" }));
      return { trace: t, model: modelFor(t) };
    }],
    [3, "state that does not survive JSON", () => {
      const t = mapFrame(good(), 1, (f) => ({ ...f, state: { ...f.state, found: Number.NaN } }));
      return { trace: t, model: modelFor(t) };
    }],
    [4, "duplicate element ids", () => {
      const t = good();
      return { trace: t, model: modelFor(t, { ids: (s) => [...s.items.map((it) => it.id), "c0"] }) };
    }],
    [5, "role on an unknown id", () => {
      const t = mapFrame(good(), 1, (f) => ({ ...f, roles: { ...f.roles, ghost: "current" } }));
      return { trace: t, model: modelFor(t) };
    }],
    [6, "line id not in model.lineIds", () => {
      const t = mapFrame(good(), 1, (f) => ({ ...f, line: "demo.scan.typo" }));
      return { trace: t, model: modelFor(t) };
    }],
    [7, "counter decreases", () => {
      const t = mapFrame(good(), 3, (f) => ({ ...f, counters: { comparisons: 0 } }));
      return { trace: t, model: modelFor(t) };
    }],
    [8, "narration too long", () => {
      const t = mapFrame(good(), 2, (f) => ({ ...f, narration: "x".repeat(241) }));
      return { trace: t, model: modelFor(t) };
    }],
    [9, "prompt answer not among the choices", () => {
      const t = good();
      const i = t.frames.findIndex((f) => f.prompt);
      const broken = mapFrame(t, i, (f) => ({ ...f, prompt: { ...f.prompt!, answerId: "maybe" } }));
      return { trace: broken, model: modelFor(broken) };
    }],
    [10, "too many frames", () => {
      const t = good();
      const last = t.frames[t.frames.length - 1]!;
      const filler = Array.from({ length: MAX_FRAMES }, () => ({ ...last, key: false }));
      const broken = { ...t, frames: [...t.frames, ...filler] };
      return { trace: broken, model: modelFor(broken) };
    }],
    [11, "no key frames", () => {
      const t = good();
      const broken = { ...t, frames: t.frames.map((f) => ({ ...f, key: false })) };
      return { trace: broken, model: modelFor(broken) };
    }],
  ];

  it.each(variants)("rule %i: detects %s (and only that rule)", (rule, _name, make) => {
    const { trace, model, input: inp } = make();
    expect(rulesOf(trace, model, inp)).toEqual([rule]);
  });

  it("rule 9: the default input must have at least one prompt", () => {
    const t = good();
    const broken = { ...t, frames: t.frames.map((f) => ({ ...f, prompt: undefined })) };
    expect(rulesOf(broken, modelFor(broken))).toEqual([9]);
    // ... but a custom input may have none.
    const custom = { values: [1, 2], target: 1 };
    const ct = demoScanModel.generate(custom);
    expect(rulesOf(ct, demoScanModel, custom)).toEqual([]);
  });

  it("rule 8: narration must not start with 'Step N'", () => {
    const t = mapFrame(good(), 1, (f) => ({ ...f, narration: "Step 2: compare" }));
    expect(rulesOf(t, modelFor(t))).toEqual([8]);
  });

  it("expectTraceValid throws with readable messages", () => {
    const t = mapFrame(good(), 1, (f) => ({ ...f, line: "demo.scan.typo" }));
    expect(() => expectTraceValid(t, modelFor(t), { input })).toThrow(/rule 6 \(frame 1\): Line "demo.scan.typo"/);
    expect(formatViolations([{ rule: 4, message: "x" }])).toBe("rule 4: x");
  });

  it("is fast: <= 10 ms per 100-frame trace", () => {
    const t = good();
    const last = t.frames[t.frames.length - 1]!;
    const big: Trace<S> = { ...t, frames: [...t.frames, ...Array.from({ length: 100 - t.frames.length }, () => ({ ...last, key: false }))] };
    const model = modelFor(big);
    for (let i = 0; i < 20; i++) checkTraceInvariants(big, model, { input }); // warm up
    const runs = 200;
    const start = performance.now();
    for (let i = 0; i < runs; i++) checkTraceInvariants(big, model, { input });
    // Guards against pathological slowness only: 2 ms flaked when the host was loaded by parallel agents.
    expect((performance.now() - start) / runs).toBeLessThanOrEqual(10);
  });
});
