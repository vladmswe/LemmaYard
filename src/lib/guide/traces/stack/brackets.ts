// Generator of "stack.brackets": checks that the brackets of a line of text
// are balanced and properly nested. Openers are pushed; a closer must match
// the opener on top; every other character is skipped (runs of them in one
// frame). The scan stops at the first error.
import type { Counters, ElementId, Frame, PredictPrompt, Role, Trace } from "../../contracts";

import {
  CLOSERS,
  OPENERS,
  PAIR,
  isBracket,
  type BracketChar,
  type BracketsInput,
  type BracketsState,
  type OpenBracket,
} from "./types";

/** Quoted text for narration; spaces stay visible inside the quotes. */
function q(s: string): string {
  return `"${s}"`;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function generateBrackets(input: BracketsInput): Trace<BracketsState, boolean> {
  const chars: BracketChar[] = Array.from(input.text).map((ch, i) => ({ id: `c${i}`, ch }));
  const n = chars.length;
  const stack: OpenBracket[] = [];
  let popped: OpenBracket | null = null;
  let pos = 0;
  let at: readonly [number, number] | null = null;
  let verdict: BracketsState["verdict"] = null;
  let reads = 0;
  let comparisons = 0;
  let asked = false;
  const frames: Frame<BracketsState>[] = [];

  const snap = (): BracketsState => ({ chars, pos, at, stack: stack.slice(), popped, verdict });
  const counters = (): Counters => ({ reads, comparisons });
  const push = (f: Omit<Frame<BracketsState>, "state" | "counters">) => frames.push({ ...f, state: snap(), counters: counters() });
  const span = (from: number, to: number, role: Role): Record<ElementId, Role> => {
    const r: Record<ElementId, Role> = {};
    for (let i = from; i < to; i++) r[(chars[i] as BracketChar).id] = role;
    return r;
  };

  push({
    roles: {},
    line: null,
    phase: "Start",
    narration:
      n === 0
        ? "The text is empty, so there is nothing to scan."
        : `We scan these ${plural(n, "character")} from left to right and keep every open bracket on a stack until its partner arrives.`,
    key: true,
  });

  while (pos < n && verdict === null) {
    popped = null;
    const ch = (chars[pos] as BracketChar).ch;
    if (!isBracket(ch)) {
      let end = pos;
      while (end < n && !isBracket((chars[end] as BracketChar).ch)) end++;
      const text = input.text.slice(pos, end);
      reads += end - pos;
      at = [pos, end];
      pos = end;
      push({
        roles: span(at[0], at[1], "current"),
        line: "brackets.skip",
        phase: "Skip",
        narration: `${q(text)}: not a bracket, skip. The stack does not change.`,
      });
      continue;
    }
    reads++;
    at = [pos, pos + 1];
    const id = (chars[pos] as BracketChar).id;
    if (OPENERS.includes(ch)) {
      const entry: OpenBracket = { id: `o${pos}`, ch, index: pos };
      stack.push(entry);
      pos++;
      push({
        roles: { [id]: "current", [entry.id]: "new" },
        line: "brackets.push",
        phase: "Push the opener",
        narration: `${q(ch)} at index ${pos - 1} opens a pair. Push it; it waits for a matching ${q(CLOSERS[OPENERS.indexOf(ch)] as string)}.`,
      });
      continue;
    }
    // A closer.
    let prompt: PredictPrompt | undefined;
    const top = stack.at(-1);
    const match = top !== undefined && top.ch === PAIR[ch];
    if (!asked && top !== undefined && frames.length > 1) {
      asked = true;
      prompt = {
        id: "brackets-closer",
        question: `What happens at ${q(ch)}?`,
        choices: [
          { id: "match", label: "Pop the top opener: they pair up" },
          { id: "mismatch", label: "Stop: the top opener is a different kind" },
          { id: "push", label: "Push it onto the stack" },
        ],
        answerId: match ? "match" : "mismatch",
        explain: match
          ? `The top of the stack is ${q(top.ch)}, the partner of ${q(ch)}. Pop it: that pair is done. Closers are never pushed.`
          : `The top of the stack is ${q(top.ch)}, which ${q(ch)} cannot close. The brackets cross, so the text is unbalanced. Closers are never pushed.`,
      };
    }
    const ask = prompt ? { prompt } : {};
    if (top === undefined) {
      verdict = "unbalanced";
      push({
        roles: { [id]: "error" },
        line: "brackets.empty",
        phase: "Nothing to close",
        narration: `${q(ch)} at index ${pos} has nothing to close: the stack is empty. Unbalanced.`,
        ...ask,
        key: true,
      });
      pos++;
      break;
    }
    comparisons++;
    if (!match) {
      verdict = "unbalanced";
      push({
        roles: { [id]: "error", [top.id]: "compared" },
        line: "brackets.match",
        phase: "Wrong kind",
        narration: `${q(ch)} at index ${pos} cannot close the ${q(top.ch)} on top of the stack: the kinds differ. Unbalanced.`,
        ...ask,
        key: true,
      });
      pos++;
      break;
    }
    stack.pop();
    popped = top;
    pos++;
    push({
      roles: { [id]: "current", [top.id]: "removed" },
      line: "brackets.match",
      phase: "Match: pop",
      narration: `${q(ch)} closes the ${q(top.ch)} from index ${top.index} on top of the stack. Pop it.`,
      ...ask,
    });
  }

  popped = null;
  at = null;
  if (verdict === null) {
    verdict = stack.length === 0 ? "balanced" : "unbalanced";
    const left: Record<ElementId, Role> = {};
    for (const e of stack) left[e.id] = "error";
    push({
      roles: left,
      line: "brackets.end",
      phase: "End of text",
      narration:
        stack.length === 0
          ? "The text is over and the stack is empty: every opener found its partner. Balanced."
          : `The text is over but ${plural(stack.length, "opener")} never closed: ${stack.map((e) => q(e.ch)).join(", ")}. Unbalanced.`,
      key: true,
    });
  }
  const rest = span(pos, n, "muted");
  push({
    roles: rest,
    line: null,
    phase: "Done",
    narration:
      verdict === "balanced"
        ? `Done: balanced. We read ${plural(reads, "character")} and compared ${plural(comparisons, "closer")} with the top of the stack.`
        : `Done: unbalanced. We read ${plural(reads, "character")} of ${n}${pos < n ? "; the rest is never looked at" : ""}.`,
  });
  return { vizId: "stack.brackets", frames, result: verdict === "balanced" };
}
