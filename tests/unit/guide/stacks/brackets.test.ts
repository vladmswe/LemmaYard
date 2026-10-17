// stack.brackets: S1, S2 (reference checker + the stack holds exactly the
// unmatched openers on every frame), AC-G-4-10 (1,000 random strings, the
// course presets, skip frames), S3 (the course line), input, renderer.
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { BracketsRenderer } from "@/components/guide/viz/stack/BracketsRenderer";
import { stackBrackets } from "@/components/guide/viz/stack/defs";
import { MAX_FRAMES, type Frame } from "@/lib/guide/contracts";
import { numRuns } from "@/lib/guide/testing/fc";
import { expectTraceValid } from "@/lib/guide/testing/trace-invariants";
import {
  BRACKETS_MAX_LENGTH,
  BRACKETS_PRESETS,
  bracketsTable,
  isBracket,
  randomBracketsInput,
  stackBracketsModel,
  type BracketsInput,
  type BracketsState,
} from "@/lib/guide/traces/stack";
import { refBalanced, refOpenAfter } from "@/lib/guide/traces/stack/reference";

import { checkRenderer } from "../complexity-basics/render-check";

const model = stackBracketsModel;
const COURSE_LINE = "if (x * (y + z[1]) < 137) { x = 1; }";

const textArb = (alphabet: string, maxLength = BRACKETS_MAX_LENGTH): fc.Arbitrary<BracketsInput> =>
  fc.array(fc.constantFrom(...alphabet.split("")), { maxLength }).map((cs) => ({ text: cs.join("") }));
/** The AC alphabet: brackets, two letters and a space. */
const mixedArb = textArb("()[]{}ab ");
/**
 * Edge cases (S2a): mostly-balanced strings built from nested pairs, then one
 * edit (drop, swap or add a character), so every failure kind (closer on an
 * empty stack, wrong kind, leftover openers) is reached next to the valid case.
 */
const nearBalancedArb: fc.Arbitrary<BracketsInput> = fc
  .record({
    pairs: fc.array(fc.constantFrom("()", "[]", "{}"), { minLength: 1, maxLength: 6 }),
    nest: fc.array(fc.boolean(), { maxLength: 6 }),
    edit: fc.constantFrom("none", "drop-first", "drop-last", "swap", "add-closer", "add-opener"),
    filler: fc.constantFrom("", "a", " b "),
  })
  .map(({ pairs, nest, edit, filler }) => {
    let s = "";
    pairs.forEach((p, k) => {
      s = nest[k] ? `${p[0]}${filler}${s}${p[1]}` : `${s}${p}${filler}`;
    });
    if (edit === "drop-first") s = s.slice(1);
    else if (edit === "drop-last") s = s.slice(0, -1);
    else if (edit === "swap" && s.length >= 2) s = s[1]! + s[0]! + s.slice(2);
    else if (edit === "add-closer") s = `)${s}`;
    else if (edit === "add-opener") s = `${s}[`;
    return { text: s.slice(0, BRACKETS_MAX_LENGTH) };
  });

/** Every frame before the verdict: the stack is exactly the unmatched openers of the text read so far. */
function checkFrames(input: BracketsInput, frames: readonly Frame<BracketsState>[]) {
  for (const f of frames) {
    const s = f.state;
    if (s.verdict !== null) continue;
    const open = refOpenAfter(input.text.slice(0, s.pos));
    expect(open, `"${input.text}" at ${s.pos}`).not.toBeNull();
    expect(s.stack.map((e) => e.ch).join(""), f.narration).toBe(open);
    for (const e of s.stack) expect(input.text[e.index]).toBe(e.ch);
  }
}

function agrees(input: BracketsInput) {
  const t = model.generate(input);
  expect(t.result, JSON.stringify(input.text)).toBe(refBalanced(input.text));
  expect(t.frames.at(-1)!.state.verdict).toBe(refBalanced(input.text) ? "balanced" : "unbalanced");
  checkFrames(input, t.frames);
}

describe("stack.brackets (S1: generator contract)", () => {
  it("default input, every preset and the random preset", () => {
    for (const input of [model.defaultInput, ...BRACKETS_PRESETS.map((p) => p.value), randomBracketsInput(1), { text: "" }]) {
      expectTraceValid(model.generate(input), model, { input });
    }
  });

  it("200 random strings over ()[]{}ab and space, 200 near-balanced ones and 200 of any printable character", () => {
    const valid = (input: BracketsInput) => {
      const t = model.generate(input);
      expectTraceValid(t, model, { input });
      expect(t.frames.length).toBeLessThanOrEqual(MAX_FRAMES);
    };
    fc.assert(fc.property(mixedArb, valid), { numRuns: numRuns(200) });
    fc.assert(fc.property(nearBalancedArb, valid), { numRuns: numRuns(200) });
    const printable = fc.array(fc.integer({ min: 32, max: 126 }), { maxLength: 40 }).map((cs) => ({ text: String.fromCharCode(...cs) }));
    fc.assert(fc.property(printable, valid), { numRuns: numRuns(200) });
  });
});

describe("AC-G-4-10: stack.brackets agrees with a reference checker", () => {
  it("1,000 random strings over ()[]{}ab and space", () => {
    fc.assert(fc.property(mixedArb, agrees), { numRuns: numRuns(1000) });
  });

  it("near-balanced strings reach every failure kind next to the valid case (S2a)", () => {
    const kinds = new Set<string>();
    fc.assert(
      fc.property(nearBalancedArb, (input) => {
        agrees(input);
        const t = model.generate(input);
        kinds.add(t.frames.find((f) => f.state.verdict !== null)?.line ?? "none");
      }),
      { numRuns: numRuns(200) },
    );
    expect([...kinds].sort()).toEqual(["brackets.empty", "brackets.end", "brackets.match"]);
  });

  it("the course presets )()(, ()), ([)], (( are unbalanced, each for its own reason", () => {
    const failAt = (text: string) => {
      const t = model.generate({ text });
      expect(t.result).toBe(false);
      const f = t.frames.find((x) => x.state.verdict === "unbalanced")!;
      return [f.line, f.state.at?.[0] ?? null, Object.entries(f.roles).filter(([, r]) => r === "error").map(([id]) => id)];
    };
    expect(failAt(")()(")).toEqual(["brackets.empty", 0, ["c0"]]); // nothing to close
    expect(failAt("())")).toEqual(["brackets.empty", 2, ["c2"]]); // one closer too many
    expect(failAt("([)]")).toEqual(["brackets.match", 2, ["c2"]]); // wrong kind on top
    expect(failAt("((")).toEqual(["brackets.end", null, ["o0", "o1"]]); // leftovers
    for (const text of [")()(", "())", "([)]", "(("]) expect(BRACKETS_PRESETS.some((p) => p.value.text === text)).toBe(true);
  });

  it("non-bracket characters only produce skip frames, which never change the stack", () => {
    fc.assert(
      fc.property(mixedArb, ({ text }) => {
        const t = model.generate({ text });
        const covered = new Set<number>();
        t.frames.forEach((f, k) => {
          if (f.line !== "brackets.skip") return;
          const prev = t.frames[k - 1]!;
          expect(f.state.stack).toEqual(prev.state.stack);
          const [a, b] = f.state.at!;
          for (let i = a; i < b; i++) {
            expect(isBracket(text[i]!)).toBe(false);
            covered.add(i);
          }
          expect(f.narration).toMatch(/not a bracket, skip/);
        });
        const read = t.frames.at(-1)!.state.pos;
        for (let i = 0; i < read; i++) if (!isBracket(text[i]!)) expect(covered.has(i)).toBe(true);
      }),
      { numRuns: numRuns(200) },
    );
  });
});

describe("stack.brackets (S3: the course line)", () => {
  it("is balanced; the prompt at ']' expects a match; 36 characters read, 4 closers compared", () => {
    const t = model.generate({ text: COURSE_LINE });
    expect(model.defaultInput.text).toBe(COURSE_LINE);
    expect(t.result).toBe(true);
    const p = t.frames.find((f) => f.prompt)!;
    expect(p.prompt).toMatchObject({ id: "brackets-closer", question: 'What happens at "]"?', answerId: "match" });
    expect(p.state.at).toEqual([16, 17]);
    // At the "]", the stack holds "(", "(", "[" (bottom to top) on the frame before.
    const before = t.frames[t.frames.indexOf(p) - 1]!.state.stack.map((e) => e.ch);
    expect(before).toEqual(["(", "(", "["]);
    expect(t.frames.at(-1)!.counters).toEqual({ reads: 36, comparisons: 4 });
    expect(t.frames.filter((f) => f.line === "brackets.push").length).toBe(4);
  });

  it("the prompt expects 'mismatch' on crossed brackets", () => {
    const t = model.generate({ text: "([)]" });
    expect(t.frames.find((f) => f.prompt)!.prompt!.answerId).toBe("mismatch");
  });
});

describe("stack.brackets input", () => {
  const spec = model.input!;
  it("keeps the text exactly, spaces included", () => {
    for (const v of [model.defaultInput, ...BRACKETS_PRESETS.map((p) => p.value), { text: "  ( ) " }]) {
      expect(spec.parse(spec.format(v))).toEqual({ ok: true, value: v });
    }
  });

  it("rejects empty, too long and non-ASCII text", () => {
    expect(spec.parse("")).toMatchObject({ ok: false });
    expect(spec.parse("(".repeat(41))).toMatchObject({ ok: false, error: expect.stringMatching(/at most 40/) });
    expect(spec.parse("(é)")).toMatchObject({ ok: false, error: expect.stringMatching(/plain characters/) });
    expect(spec.parse("a\tb")).toMatchObject({ ok: false });
  });
});

describe("stack.brackets text alternatives and defs", () => {
  it("describe() and toTable() show the stack and the read position", () => {
    const t = model.generate({ text: "(a]" });
    const last = t.frames.at(-1)!.state;
    expect(model.describe(last)).toBe('Text "(a]", 3 of 3 characters read. Stack, bottom to top: (. Result: unbalanced.');
    expect(bracketsTable(t.frames[1]!.state).rows[0]).toEqual([0, "(", "on the stack"]);
    expect(stackBrackets.model).toBe(model);
  });
});

describe("AC-G-4-15: BracketsRenderer static markup", () => {
  it("every frame of every preset at 288/390/640/1040 px and as a thumbnail", () => {
    const inputs = [model.defaultInput, ...BRACKETS_PRESETS.map((p) => p.value), { text: "([{".repeat(13) + "x" }, { text: "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW" }];
    expect(checkRenderer(model, BracketsRenderer, inputs)).toEqual([]);
  }, 30_000);
});
