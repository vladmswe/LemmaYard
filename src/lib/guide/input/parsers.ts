// Parsers for the text inputs of guide visualizations. Pure; never throw on bad
// input: they return { ok: false, error } with a message the learner can act on.
import type { ParseResult } from "../contracts";

const INT_RE = /^[+-]?\d+$/;
const WORD_RE = /^[a-z]+$/;

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

/** Splits on commas and/or whitespace; empty pieces are dropped. */
function splitItems(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function quote(token: string): string {
  return `'${token.length > 12 ? `${token.slice(0, 12)}…` : token}'`;
}

export interface IntListOptions {
  readonly min: number;
  readonly max: number;
  readonly maxCount: number;
  readonly minCount?: number; // default 1
}

function parseIntToken(token: string, min: number, max: number): ParseResult<number> {
  if (!INT_RE.test(token)) return fail(`${quote(token)} is not a whole number`);
  const n = Number(token);
  if (!Number.isSafeInteger(n) || n < min || n > max) {
    return fail(`${token} is out of range (${min} to ${max})`);
  }
  return { ok: true, value: n === 0 ? 0 : n }; // normalise -0
}

/** "5, 3, 8" or "5 3 8" → [5, 3, 8] (whole numbers in [min, max]). */
export function parseIntList(raw: string, opts: IntListOptions): ParseResult<number[]> {
  const minCount = opts.minCount ?? 1;
  const items = splitItems(raw);
  if (items.length < minCount) {
    return fail(
      minCount === 1 ? "Enter at least one number" : `Enter at least ${minCount} numbers`,
    );
  }
  if (items.length > opts.maxCount) {
    return fail(`Too many numbers: ${items.length} (at most ${opts.maxCount})`);
  }
  const values: number[] = [];
  for (const [i, token] of items.entries()) {
    const r = parseIntToken(token, opts.min, opts.max);
    if (!r.ok) return fail(`Number ${i + 1}: ${r.error}`);
    values.push(r.value);
  }
  return { ok: true, value: values };
}

export interface WordListOptions {
  readonly maxCount: number;
  readonly minCount?: number; // default 1
  readonly maxLength?: number; // per word, default 8
}

/** "cat, car dog" → ["cat", "car", "dog"]; words are lower-case letters a-z. */
export function parseWordList(raw: string, opts: WordListOptions): ParseResult<string[]> {
  const minCount = opts.minCount ?? 1;
  const maxLength = opts.maxLength ?? 8;
  const items = splitItems(raw.toLowerCase());
  if (items.length < minCount) {
    return fail(minCount === 1 ? "Enter at least one word" : `Enter at least ${minCount} words`);
  }
  if (items.length > opts.maxCount) {
    return fail(`Too many words: ${items.length} (at most ${opts.maxCount})`);
  }
  for (const [i, w] of items.entries()) {
    const r = checkWord(w, maxLength);
    if (!r.ok) return fail(`Word ${i + 1}: ${r.error}`);
  }
  return { ok: true, value: items };
}

function checkWord(w: string, maxLength: number): ParseResult<string> {
  if (!WORD_RE.test(w)) return fail(`${quote(w)} must use only letters a-z`);
  if (w.length > maxLength) return fail(`${quote(w)} is longer than ${maxLength} letters`);
  return { ok: true, value: w };
}

export type OpArg = "int" | "word";
export type OpSpec = Readonly<Record<string, readonly OpArg[]>>;
export interface OpCall<K extends string = string> {
  readonly op: K;
  readonly args: readonly (number | string)[];
}

export interface OpScriptOptions {
  readonly min: number; // int arguments
  readonly max: number;
  readonly maxOps: number;
  readonly maxWordLength?: number; // default 8
}

/**
 * "push 3, push 5, pop" (commas or newlines between ops, case-insensitive op
 * names) → [{ op: "push", args: [3] }, { op: "push", args: [5] }, { op: "pop", args: [] }].
 */
export function parseOpScript<S extends OpSpec>(
  raw: string,
  spec: S,
  opts: OpScriptOptions,
): ParseResult<OpCall<keyof S & string>[]> {
  const names = Object.keys(spec);
  const maxWordLength = opts.maxWordLength ?? 8;
  const ops = raw
    .split(/[,\n;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (ops.length === 0) return fail(`Enter at least one op (${names.join(", ")})`);
  if (ops.length > opts.maxOps) return fail(`Too many ops: ${ops.length} (at most ${opts.maxOps})`);
  const out: OpCall<keyof S & string>[] = [];
  for (const [i, text] of ops.entries()) {
    const [nameRaw = "", ...argTokens] = text.split(/\s+/);
    const name = nameRaw.toLowerCase();
    const n = i + 1;
    if (!Object.hasOwn(spec, name)) {
      return fail(`Op ${n} ${quote(nameRaw)} is not one of ${names.join(", ")}`);
    }
    const kinds = spec[name] as readonly OpArg[];
    if (argTokens.length !== kinds.length) {
      const want = kinds.length === 1 ? "1 argument" : `${kinds.length} arguments`;
      return fail(`Op ${n} '${name}' takes ${want}, got ${argTokens.length}`);
    }
    const args: (number | string)[] = [];
    for (const [j, kind] of kinds.entries()) {
      const token = argTokens[j] as string;
      const r =
        kind === "int"
          ? parseIntToken(token, opts.min, opts.max)
          : checkWord(token.toLowerCase(), maxWordLength);
      if (!r.ok) return fail(`Op ${n} '${name}': ${r.error}`);
      args.push(r.value);
    }
    out.push({ op: name as keyof S & string, args });
  }
  return { ok: true, value: out };
}

/** Case-insensitive match against a fixed list of choices. */
export function parseChoice<C extends string>(raw: string, choices: readonly C[]): ParseResult<C> {
  const v = raw.trim().toLowerCase();
  const hit = choices.find((c) => c.toLowerCase() === v);
  if (hit === undefined) {
    return fail(`${quote(raw.trim())} is not one of ${choices.join(", ")}`);
  }
  return { ok: true, value: hit };
}
