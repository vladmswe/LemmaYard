import type { ElementId } from "../../contracts";

// ------------------------------------------------------------ stack.ops

export interface StackItem {
  readonly id: ElementId; // "<buffer id>s<slot>", e.g. "b1s3"
  readonly value: number;
}

export type StackOp =
  | { readonly kind: "push"; readonly value: number }
  | { readonly kind: "pop" }
  | { readonly kind: "peek" };

export interface StackInput {
  readonly ops: readonly StackOp[];
}

export interface StackState {
  readonly bufferId: ElementId; // "b0", "b1", ... one per allocation
  readonly capacity: number;
  /** Slots 0..size-1 hold the stack, bottom to top; the rest are null. */
  readonly slots: readonly (StackItem | null)[];
  readonly size: number;
  /** Index of the top element: always size - 1 (-1 when empty). */
  readonly top: number;
  /** The element a pop just removed, still drawn faded at its old slot (index = size). */
  readonly popped: StackItem | null;
  /** Op in progress or just finished, e.g. "push 3"; null on the first and last frame. */
  readonly op: string | null;
  /** Value the last pop or peek returned, or "error"; null if none yet. */
  readonly out: number | "error" | null;
  readonly completed: number;
}

export const STACK_START_CAPACITY = 4;
export const STACK_MAX_OPS = 16;
export const STACK_MIN = -99;
export const STACK_MAX = 999;

export const STACK_LINES = [
  "stack.push.grow",
  "stack.push.write",
  "stack.pop.empty",
  "stack.pop.read",
  "stack.peek.empty",
  "stack.peek.read",
] as const;

export function stackOpLabel(op: StackOp): string {
  return op.kind === "push" ? `push ${op.value}` : op.kind;
}

// ------------------------------------------------------------ stack.brackets

export interface BracketChar {
  readonly id: ElementId; // "c<index>"
  readonly ch: string;
}

export interface OpenBracket {
  readonly id: ElementId; // "o<index of the opener in the text>"
  readonly ch: string;
  readonly index: number;
}

export interface BracketsInput {
  readonly text: string;
}

export interface BracketsState {
  readonly chars: readonly BracketChar[];
  /** Characters before `pos` have been read. */
  readonly pos: number;
  /** Characters this frame acts on, [from, to); null on the first and last frame. */
  readonly at: readonly [number, number] | null;
  /** Unmatched openers so far, bottom to top. */
  readonly stack: readonly OpenBracket[];
  /** The opener a closer just matched, drawn faded above the stack. */
  readonly popped: OpenBracket | null;
  readonly verdict: "balanced" | "unbalanced" | null;
}

export const BRACKETS_MAX_LENGTH = 40;
export const OPENERS = "([{";
export const CLOSERS = ")]}";
/** Closer -> its opener. */
export const PAIR: Readonly<Record<string, string>> = { ")": "(", "]": "[", "}": "{" };

export const BRACKETS_LINES = ["brackets.push", "brackets.skip", "brackets.empty", "brackets.match", "brackets.end"] as const;

export function isBracket(ch: string): boolean {
  return OPENERS.includes(ch) || CLOSERS.includes(ch);
}

// ------------------------------------------------------------ stack.monotonic

export interface MonoItem {
  readonly id: ElementId; // "a<index>"
  readonly value: number;
}

export interface MonoInput {
  readonly values: readonly number[];
}

export interface MonoState {
  readonly items: readonly MonoItem[];
  /** Next greater value per index: null = not known yet, -1 = none (set at the end). */
  readonly answers: readonly (number | null)[];
  /** Indices on the stack, bottom to top. Their values never increase towards the top. */
  readonly stack: readonly number[];
  /** Indices popped in this frame (drawn faded next to the stack). */
  readonly popped: readonly number[];
  /** Index being processed; null on the first and last frame. */
  readonly i: number | null;
  readonly pushes: number;
  readonly pops: number;
}

export const MONO_MAX_VALUES = 12;
export const MONO_MIN = -99;
export const MONO_MAX = 999;

export const MONO_LINES = ["monotonic.pop", "monotonic.push"] as const;

export const monoItemId = (i: number): ElementId => `a${i}`;
export const monoAnswerId = (i: number): ElementId => `n${i}`;
export const monoEntryId = (i: number): ElementId => `k${i}`;
