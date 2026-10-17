// Pure state machine of <TracePlayer> (section 2.3 of the guide plan).
import type { PredictPrompt } from "../contracts";

export type PromptAnswer = { choiceId: string; correct: boolean } | "skipped";

export type PlayerState = {
  index: number;
  playing: boolean;
  pendingPrompt: number | null;
  answers: Record<string, PromptAnswer>;
  frameCount: number;
};

export type PlayerAction =
  | { type: "next" }
  | { type: "prev" }
  | { type: "first" }
  | { type: "last" }
  | { type: "seek"; index: number }
  | { type: "play" }
  | { type: "pause" }
  | { type: "tick" }
  | { type: "answer"; promptId: string; choiceId: string }
  | { type: "skipPrompt" }
  | { type: "load"; frameCount: number; prompts: (string | null)[] };

export interface PlayerOptions {
  skipPrompts: boolean;
  prompts: (PredictPrompt | null)[]; // prompts[i] = prompt asked before frame i is shown
}

export function initialPlayerState(frameCount: number): PlayerState {
  return {
    index: 0,
    playing: false,
    pendingPrompt: null,
    answers: {},
    frameCount: Math.max(1, frameCount),
  };
}

function clamp(i: number, frameCount: number): number {
  if (!Number.isFinite(i)) return 0;
  return Math.min(Math.max(0, Math.trunc(i)), frameCount - 1);
}

/** The prompt to ask before showing frame `i`, or null if none / already answered / skipped. */
function openPrompt(s: PlayerState, i: number, opts: PlayerOptions): PredictPrompt | null {
  if (opts.skipPrompts) return null;
  const p = opts.prompts[i] ?? null;
  if (!p) return null;
  return s.answers[p.id] === undefined ? p : null;
}

/** Shared by next and tick: advance one frame or stop before an unanswered prompt. */
function advance(s: PlayerState, opts: PlayerOptions, keepPlaying: boolean): PlayerState {
  const last = s.frameCount - 1;
  if (s.index >= last) return { ...s, playing: false };
  const target = s.index + 1;
  if (openPrompt(s, target, opts)) {
    return { ...s, playing: false, pendingPrompt: target };
  }
  return { ...s, index: target, playing: keepPlaying && target < last };
}

function jump(s: PlayerState, index: number): PlayerState {
  return { ...s, index: clamp(index, s.frameCount), playing: false, pendingPrompt: null };
}

export function playerReducer(
  s: PlayerState,
  a: PlayerAction,
  opts: PlayerOptions,
): PlayerState {
  switch (a.type) {
    case "next":
      if (s.pendingPrompt !== null) return s; // "Next" is disabled while a prompt is open
      return advance(s, opts, false);
    case "tick":
      if (!s.playing || s.pendingPrompt !== null) return s.playing ? { ...s, playing: false } : s;
      return advance(s, opts, true);
    case "prev":
      return jump(s, s.index - 1);
    case "first":
      return jump(s, 0);
    case "last":
      return jump(s, s.frameCount - 1);
    case "seek":
      return jump(s, a.index);
    case "play": {
      if (s.pendingPrompt !== null) return s;
      const last = s.frameCount - 1;
      if (s.index >= last) return { ...s, index: 0, playing: last > 0 };
      return { ...s, playing: true };
    }
    case "pause":
      return s.playing ? { ...s, playing: false } : s;
    case "answer": {
      if (s.pendingPrompt === null) return s;
      const p = opts.prompts[s.pendingPrompt] ?? null;
      if (!p || p.id !== a.promptId) return s;
      return {
        ...s,
        index: s.pendingPrompt,
        pendingPrompt: null,
        playing: false,
        answers: { ...s.answers, [p.id]: { choiceId: a.choiceId, correct: a.choiceId === p.answerId } },
      };
    }
    case "skipPrompt": {
      if (s.pendingPrompt === null) return s;
      const p = opts.prompts[s.pendingPrompt] ?? null;
      const answers = p ? { ...s.answers, [p.id]: "skipped" as const } : s.answers;
      return { ...s, index: s.pendingPrompt, pendingPrompt: null, playing: false, answers };
    }
    case "load":
      return initialPlayerState(a.frameCount);
  }
}
