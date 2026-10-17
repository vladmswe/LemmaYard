import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { PredictPrompt } from "@/lib/guide/contracts";
import {
  initialPlayerState,
  playerReducer,
  type PlayerAction,
  type PlayerOptions,
  type PlayerState,
} from "@/lib/guide/player/reducer";
import { numRuns } from "@/lib/guide/testing/fc";

const prompt = (id: string, answerId = "a"): PredictPrompt => ({
  id,
  question: `Question ${id}?`,
  choices: [
    { id: "a", label: "A" },
    { id: "b", label: "B" },
  ],
  answerId,
  explain: "Because.",
});

// 6 frames; frame 3 has a prompt (asked while frame 2 is shown).
const PROMPTS: (PredictPrompt | null)[] = [null, null, null, prompt("p3"), null, null];
const opts: PlayerOptions = { skipPrompts: false, prompts: PROMPTS };
const skipOpts: PlayerOptions = { skipPrompts: true, prompts: PROMPTS };

function run(actions: PlayerAction[], o: PlayerOptions = opts, start = initialPlayerState(6)): PlayerState {
  return actions.reduce((s, a) => playerReducer(s, a, o), start);
}
const at = (index: number, extra: Partial<PlayerState> = {}): PlayerState => ({
  ...initialPlayerState(6),
  index,
  ...extra,
});

describe("playerReducer: navigation bounds", () => {
  it("starts at frame 0, paused, no prompt", () => {
    expect(initialPlayerState(6)).toEqual({ index: 0, playing: false, pendingPrompt: null, answers: {}, frameCount: 6 });
  });
  it("next advances by one", () => {
    expect(run([{ type: "next" }]).index).toBe(1);
  });
  it("next at the last frame stays there", () => {
    expect(playerReducer(at(5), { type: "next" }, opts).index).toBe(5);
  });
  it("prev goes back by one", () => {
    expect(playerReducer(at(4), { type: "prev" }, opts).index).toBe(3);
  });
  it("prev at frame 0 stays at 0", () => {
    expect(run([{ type: "prev" }]).index).toBe(0);
  });
  it("first and last jump to the ends", () => {
    expect(playerReducer(at(4), { type: "first" }, opts).index).toBe(0);
    expect(run([{ type: "last" }]).index).toBe(5);
  });
  it("seek clamps below 0 and past the end", () => {
    expect(run([{ type: "seek", index: -3 }]).index).toBe(0);
    expect(run([{ type: "seek", index: 99 }]).index).toBe(5);
    expect(run([{ type: "seek", index: 2 }]).index).toBe(2);
  });
  it("seek with NaN goes to frame 0", () => {
    expect(playerReducer(at(4), { type: "seek", index: Number.NaN }, opts).index).toBe(0);
  });
  it("manual steps pause playback", () => {
    for (const type of ["next", "prev", "first", "last"] as const) {
      expect(playerReducer(at(1, { playing: true }), { type }, opts).playing).toBe(false);
    }
    expect(playerReducer(at(1, { playing: true }), { type: "seek", index: 4 }, opts).playing).toBe(false);
  });
});

describe("playerReducer: play / tick", () => {
  it("play sets playing", () => {
    expect(run([{ type: "play" }]).playing).toBe(true);
  });
  it("play at the last frame restarts from frame 0", () => {
    const s = playerReducer(at(5), { type: "play" }, opts);
    expect(s).toMatchObject({ index: 0, playing: true });
  });
  it("tick advances while playing", () => {
    expect(run([{ type: "play" }, { type: "tick" }])).toMatchObject({ index: 1, playing: true });
  });
  it("tick does nothing while paused", () => {
    const s = at(1);
    expect(playerReducer(s, { type: "tick" }, opts)).toBe(s);
  });
  it("tick stops at the last frame", () => {
    const s = playerReducer(at(4, { playing: true }), { type: "tick" }, opts);
    expect(s).toMatchObject({ index: 5, playing: false });
    expect(playerReducer(s, { type: "tick" }, opts)).toMatchObject({ index: 5, playing: false });
  });
  it("pause stops playback", () => {
    expect(run([{ type: "play" }, { type: "pause" }]).playing).toBe(false);
  });
});

describe("playerReducer: prompts", () => {
  it("next stops before an unanswered prompt", () => {
    const s = playerReducer(at(2), { type: "next" }, opts);
    expect(s).toMatchObject({ index: 2, pendingPrompt: 3, playing: false });
  });
  it("tick stops before an unanswered prompt and pauses", () => {
    const s = playerReducer(at(2, { playing: true }), { type: "tick" }, opts);
    expect(s).toMatchObject({ index: 2, pendingPrompt: 3, playing: false });
  });
  it("with skipPrompts, next and tick pass the prompt", () => {
    expect(playerReducer(at(2), { type: "next" }, skipOpts)).toMatchObject({ index: 3, pendingPrompt: null });
    expect(playerReducer(at(2, { playing: true }), { type: "tick" }, skipOpts)).toMatchObject({
      index: 3,
      playing: true,
    });
  });
  it("next is ignored while a prompt is pending", () => {
    const s = playerReducer(at(2), { type: "next" }, opts);
    expect(playerReducer(s, { type: "next" }, opts)).toBe(s);
  });
  it("play is ignored while a prompt is pending", () => {
    const s = playerReducer(at(2), { type: "next" }, opts);
    expect(playerReducer(s, { type: "play" }, opts).playing).toBe(false);
  });
  it("a right answer advances and records correct: true", () => {
    const s = run([{ type: "seek", index: 2 }, { type: "next" }, { type: "answer", promptId: "p3", choiceId: "a" }]);
    expect(s).toMatchObject({ index: 3, pendingPrompt: null, answers: { p3: { choiceId: "a", correct: true } } });
  });
  it("a wrong answer advances and records correct: false", () => {
    const s = run([{ type: "seek", index: 2 }, { type: "next" }, { type: "answer", promptId: "p3", choiceId: "b" }]);
    expect(s).toMatchObject({ index: 3, answers: { p3: { choiceId: "b", correct: false } } });
  });
  it("an answer for another prompt id is ignored", () => {
    const s = run([{ type: "seek", index: 2 }, { type: "next" }]);
    expect(playerReducer(s, { type: "answer", promptId: "nope", choiceId: "a" }, opts)).toBe(s);
  });
  it("answer without a pending prompt is ignored", () => {
    const s = at(1);
    expect(playerReducer(s, { type: "answer", promptId: "p3", choiceId: "a" }, opts)).toBe(s);
  });
  it("skipPrompt records 'skipped' and advances", () => {
    const s = run([{ type: "seek", index: 2 }, { type: "next" }, { type: "skipPrompt" }]);
    expect(s).toMatchObject({ index: 3, pendingPrompt: null, answers: { p3: "skipped" } });
  });
  it("an answered prompt is not asked again", () => {
    const s = run([
      { type: "seek", index: 2 },
      { type: "next" },
      { type: "answer", promptId: "p3", choiceId: "a" },
      { type: "prev" },
      { type: "next" },
    ]);
    expect(s).toMatchObject({ index: 3, pendingPrompt: null });
  });
  it("seek and last jump past prompts without asking", () => {
    expect(run([{ type: "seek", index: 4 }])).toMatchObject({ index: 4, pendingPrompt: null });
    expect(run([{ type: "last" }])).toMatchObject({ index: 5, pendingPrompt: null });
  });
  it("seek, first and prev close a pending prompt", () => {
    const open = run([{ type: "seek", index: 2 }, { type: "next" }]);
    expect(playerReducer(open, { type: "seek", index: 0 }, opts).pendingPrompt).toBeNull();
    expect(playerReducer(open, { type: "first" }, opts).pendingPrompt).toBeNull();
    expect(playerReducer(open, { type: "prev" }, opts)).toMatchObject({ index: 1, pendingPrompt: null });
  });
  it("load resets index, playback, prompt and answers", () => {
    const s = run([{ type: "seek", index: 2 }, { type: "next" }, { type: "skipPrompt" }, { type: "play" }]);
    const loaded = playerReducer(s, { type: "load", frameCount: 9, prompts: [] }, opts);
    expect(loaded).toEqual({ index: 0, playing: false, pendingPrompt: null, answers: {}, frameCount: 9 });
  });
});

describe("playerReducer: property", () => {
  const action: fc.Arbitrary<PlayerAction> = fc.oneof(
    fc.constantFrom<PlayerAction>(
      { type: "next" },
      { type: "prev" },
      { type: "first" },
      { type: "last" },
      { type: "play" },
      { type: "pause" },
      { type: "tick" },
      { type: "skipPrompt" },
    ),
    fc.integer({ min: -5, max: 20 }).map((index): PlayerAction => ({ type: "seek", index })),
    fc
      .record({ promptId: fc.constantFrom("p1", "p3", "x"), choiceId: fc.constantFrom("a", "b") })
      .map((r): PlayerAction => ({ type: "answer", ...r })),
  );

  it("index stays in range and playing is false while a prompt is pending", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 12 }),
        fc.array(fc.boolean(), { maxLength: 12 }),
        fc.boolean(),
        fc.array(action, { maxLength: 60 }),
        (frameCount, promptFlags, skipPrompts, actions) => {
          const prompts = Array.from({ length: frameCount }, (_, i) =>
            i > 0 && promptFlags[i] ? prompt(`p${i}`) : null,
          );
          const o = { skipPrompts, prompts };
          let s = initialPlayerState(frameCount);
          for (const a of actions) {
            s = playerReducer(s, a, o);
            expect(s.index).toBeGreaterThanOrEqual(0);
            expect(s.index).toBeLessThan(frameCount);
            if (s.pendingPrompt !== null) expect(s.playing).toBe(false);
          }
        },
      ),
      { numRuns: numRuns(300) },
    );
  });
});
