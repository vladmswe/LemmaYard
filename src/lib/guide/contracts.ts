// Shared contracts of the Data Structures guide (/learn).
// Created verbatim by M-G0 and M-G1. Change only through the guide lead.
import type { ComponentType } from "react";

/** Stable id of a drawable element (node, cell, edge, bit). Never an array index. */
export type ElementId = string;

export const ROLES = [
  "current", // the element the step acts on
  "compared", // read and compared in this step
  "changed", // value or link written in this step
  "new", // created in this step
  "removed", // removed / unreachable (shown faded, then dropped)
  "visited", // already processed
  "frontier", // waiting in a queue/stack
  "done", // final / finished
  "path", // on the highlighted path
  "muted", // out of scope for this step
  "error", // violates the invariant
] as const;
export type Role = (typeof ROLES)[number];

export const COUNTER_KEYS = [
  "comparisons",
  "reads",
  "writes",
  "moves",
  "copies",
  "swaps",
  "pointerWrites",
  "nodesVisited",
  "probes",
  "hashes",
  "resizes",
  "allocations",
  "edgesExamined",
] as const;
export type CounterKey = (typeof COUNTER_KEYS)[number];
/** Cumulative since frame 0; never decreases. */
export type Counters = Readonly<Partial<Record<CounterKey, number>>>;

/** Semantic code-line id, e.g. "heap.siftUp.compare". Pattern: /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)+$/ */
export type LineId = string;

export interface PredictChoice {
  readonly id: string;
  readonly label: string;
}

/** Asked while the previous frame is on screen; answering reveals this frame. */
export interface PredictPrompt {
  readonly id: string;
  readonly question: string;
  readonly choices: readonly PredictChoice[]; // 2..4
  readonly answerId: string;
  readonly explain: string; // shown after any answer
}

export interface Frame<S> {
  readonly state: S; // JSON-serializable snapshot, never mutated after creation
  readonly roles: Readonly<Record<ElementId, Role>>; // only ids that exist in `state`
  readonly pointers?: Readonly<Record<string, ElementId | null>>; // head, tail, i, j, curr, top...
  readonly line: LineId | null; // null only on intro/summary frames
  readonly phase: string; // subgoal label, 1..32 chars, e.g. "Find the slot"
  readonly narration: string; // what changed and why, 1..240 chars, plain text
  readonly counters: Counters;
  readonly prompt?: PredictPrompt;
  readonly key?: boolean; // shown in the key-steps strip (2..6 per trace)
}

export interface Trace<S, R = unknown> {
  readonly vizId: string;
  readonly frames: readonly Frame<S>[]; // 1..MAX_FRAMES
  readonly result?: R;
}

export const MAX_FRAMES = 400;
export const MAX_PROMPTS_PER_TRACE = 3;

export type ParseResult<I> =
  | { readonly ok: true; readonly value: I }
  | { readonly ok: false; readonly error: string };

export interface InputPreset<I> {
  readonly id: string; // [a-z0-9-]+
  readonly label: string;
  readonly value: I;
}

export interface InputSpec<I> {
  readonly label: string; // visible label of the text field
  readonly placeholder: string;
  readonly help: string; // format + caps, e.g. "Up to 12 whole numbers from -99 to 999, comma separated"
  readonly maxLength: number; // raw characters, <= 200
  parse(raw: string): ParseResult<I>;
  format(value: I): string; // parse(format(v)) deep-equals v
  readonly presets: readonly InputPreset<I>[];
}

export interface VizModel<S, I> {
  readonly id: string; // "<structure>.<op>"
  readonly title: string; // accessible name, e.g. "Heap insert"
  generate(input: I): Trace<S>; // pure and deterministic
  describe(state: S): string; // full text alternative of a state
  ids(state: S): readonly ElementId[]; // every drawable id present in the state
  readonly defaultInput: I;
  readonly input?: InputSpec<I>;
  readonly lineIds: readonly LineId[]; // every LineId generate() can emit
  readonly counters: readonly CounterKey[]; // shown in this order
}

export type CodeLanguage = "python" | "javascript";

export interface CodeListing {
  readonly ref: string; // "<lesson-slug>/<name>", e.g. "heaps/min_heap"
  readonly language: CodeLanguage;
  readonly html: string; // Shiki HTML; each line: <span class="line" data-line="N" data-line-ids="a b">
  readonly lineMap: Readonly<Record<LineId, readonly number[]>>; // 1-based display lines
  readonly source: string; // file content with markers stripped
}

export interface CodeBundle {
  readonly python: CodeListing;
  readonly javascript: CodeListing;
}

/** Props the server <Viz> passes to a structure's client player. All serializable. */
export interface VizClientProps<I> {
  readonly playerId: string; // unique on the page, [a-z0-9-]+
  readonly vizId: string;
  readonly initialInput: I;
  readonly initialTrace: Trace<unknown>;
  readonly code?: CodeBundle;
  readonly hint?: string; // onboarding line, e.g. "Try: press Next, or pick 'sorted order'"
}

/** What a lesson's MDX imports and hands to <Viz def={...}>. */
export interface VizDefinition<S, I> {
  readonly model: VizModel<S, I>;
  readonly Client: ComponentType<VizClientProps<I>>; // a 'use client' component
}
