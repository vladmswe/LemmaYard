// Checks the generator contract (rules 1-11 of section 2.2 of the guide plan)
// on a trace. Used by Vitest property tests only; never imported by app code.
import {
  COUNTER_KEYS,
  MAX_FRAMES,
  MAX_PROMPTS_PER_TRACE,
  ROLES,
  type Frame,
  type Trace,
  type VizModel,
} from "../contracts";

export interface TraceViolation {
  readonly rule: number; // 1..11, numbering of the generator contract
  readonly frame?: number; // 0-based frame index when the violation is local to a frame
  readonly message: string;
}

export interface CheckOptions<I> {
  /** The input `trace` was generated from. Rule 9 (prompt count) applies when it equals model.defaultInput. */
  readonly input: I;
}

const LINE_ID_RE = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)+$/;
const ROLE_SET: ReadonlySet<string> = new Set(ROLES);
const COUNTER_SET: ReadonlySet<string> = new Set(COUNTER_KEYS);

/** First reason `v` does not survive a JSON round trip unchanged, or null. */
function nonJsonReason(v: unknown, path: string): string | null {
  if (v === null) return null;
  switch (typeof v) {
    case "string":
    case "boolean":
      return null;
    case "number":
      if (!Number.isFinite(v)) return `${path} is ${v}`;
      if (Object.is(v, -0)) return `${path} is -0`;
      return null;
    case "object": {
      if (Array.isArray(v)) {
        for (let i = 0; i < v.length; i++) {
          if (v[i] === undefined) return `${path}[${i}] is undefined`;
          const r = nonJsonReason(v[i], `${path}[${i}]`);
          if (r) return r;
        }
        return null;
      }
      const proto = Object.getPrototypeOf(v);
      if (proto !== Object.prototype && proto !== null) {
        return `${path} is a ${(v as object).constructor?.name ?? "non-plain object"}`;
      }
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        if (x === undefined) continue; // dropped by JSON, same as absent
        const r = nonJsonReason(x, `${path}.${k}`);
        if (r) return r;
      }
      return null;
    }
    default:
      return `${path} is a ${typeof v}`;
  }
}

function sameJson(a: unknown, b: unknown): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

export function checkTraceInvariants<S, I>(
  trace: Trace<S>,
  model: VizModel<S, I>,
  opts: CheckOptions<I>,
): TraceViolation[] {
  const out: TraceViolation[] = [];
  const add = (rule: number, message: string, frame?: number) =>
    out.push(frame === undefined ? { rule, message } : { rule, frame, message });
  const frames: readonly Frame<S>[] = trace.frames ?? [];

  // Rule 3: JSON-serializable, round trip equal.
  const reason = nonJsonReason(trace, "trace");
  if (reason) add(3, `Trace is not JSON round-trip safe: ${reason}`);

  // Rule 1: deterministic (regenerate and compare).
  let again: Trace<S> | null = null;
  try {
    again = model.generate(opts.input);
  } catch (e) {
    add(1, `generate() threw on regeneration: ${(e as Error).message}`);
  }
  if (again && !sameJson(again, trace)) {
    add(1, "generate() is not deterministic: regenerating the same input gave a different trace");
  }

  // Rule 10: frame count.
  if (frames.length < 1 || frames.length > MAX_FRAMES) {
    add(10, `Trace has ${frames.length} frames (allowed 1..${MAX_FRAMES})`);
  }

  // Rule 2: frame 0 is the start frame.
  const f0 = frames[0];
  if (f0) {
    if (f0.line !== null) add(2, `Frame 0 must have line null, got ${String(f0.line)}`, 0);
    if (f0.phase !== "Start") add(2, `Frame 0 phase must be "Start", got "${f0.phase}"`, 0);
  }

  const lineIds = new Set(model.lineIds);
  for (const id of model.lineIds) {
    if (!LINE_ID_RE.test(id)) add(6, `model.lineIds entry "${id}" does not match the LineId pattern`);
  }

  const promptIds = new Set<string>();
  let promptCount = 0;
  let keyCount = 0;

  frames.forEach((f, i) => {
    // Rule 4: ids unique non-empty strings.
    let ids: readonly string[] = [];
    try {
      ids = model.ids(f.state);
    } catch (e) {
      add(4, `model.ids() threw: ${(e as Error).message}`, i);
    }
    const idSet = new Set<string>();
    for (const id of ids) {
      if (typeof id !== "string" || id.length === 0) add(4, `Empty or non-string element id`, i);
      else if (idSet.has(id)) add(4, `Duplicate element id "${id}"`, i);
      idSet.add(id);
    }

    // Rule 5: roles and pointers reference existing ids.
    for (const [id, role] of Object.entries(f.roles ?? {})) {
      if (!idSet.has(id)) add(5, `roles references unknown id "${id}"`, i);
      if (!ROLE_SET.has(role)) add(5, `Unknown role "${role}" on "${id}"`, i);
    }
    for (const [name, id] of Object.entries(f.pointers ?? {})) {
      if (id !== null && !idSet.has(id)) add(5, `Pointer ${name} references unknown id "${id}"`, i);
    }

    // Rule 6: line ids.
    if (f.line !== null && !lineIds.has(f.line)) add(6, `Line "${f.line}" is not in model.lineIds`, i);

    // Rule 7: counters cumulative and monotonic.
    for (const [k, v] of Object.entries(f.counters ?? {})) {
      if (!COUNTER_SET.has(k)) add(7, `Unknown counter "${k}"`, i);
      if (typeof v !== "number" || !Number.isInteger(v) || v < 0) {
        add(7, `Counter ${k} = ${String(v)} is not a non-negative integer`, i);
      }
    }
    const prev = i > 0 ? frames[i - 1] : undefined;
    if (prev) {
      for (const [k, v] of Object.entries(prev.counters ?? {})) {
        const now = (f.counters as Record<string, number | undefined>)[k] ?? 0;
        if (typeof v === "number" && now < v) add(7, `Counter ${k} decreased from ${v} to ${now}`, i);
      }
    }

    // Rule 8: phase and narration text.
    if (typeof f.phase !== "string" || f.phase.trim().length < 1 || f.phase.length > 32) {
      add(8, `Phase must be 1..32 characters, got ${JSON.stringify(f.phase)}`, i);
    }
    const n = f.narration;
    if (typeof n !== "string" || n.trim().length < 1 || n.length > 240) {
      add(8, `Narration must be 1..240 characters (got ${typeof n === "string" ? n.length : typeof n})`, i);
    } else {
      if (/^\s*step\s*\d/i.test(n)) add(8, `Narration must not start with "Step N"`, i);
      if (/<\/?[a-z][^>]*>/i.test(n)) add(8, "Narration must be plain text (found markup)", i);
    }

    // Rule 9: prompts.
    const p = f.prompt;
    if (p) {
      promptCount++;
      if (i === 0) add(9, "Frame 0 cannot carry a prompt (it is asked before its frame is shown)", i);
      if (promptIds.has(p.id)) add(9, `Duplicate prompt id "${p.id}"`, i);
      promptIds.add(p.id);
      const choiceIds = p.choices.map((c) => c.id);
      if (p.choices.length < 2 || p.choices.length > 4) {
        add(9, `Prompt "${p.id}" has ${p.choices.length} choices (allowed 2..4)`, i);
      }
      if (new Set(choiceIds).size !== choiceIds.length) add(9, `Prompt "${p.id}" has duplicate choice ids`, i);
      if (!choiceIds.includes(p.answerId)) {
        add(9, `Prompt "${p.id}" answerId "${p.answerId}" is not one of its choices`, i);
      }
      if (!p.question.trim() || !p.explain.trim()) add(9, `Prompt "${p.id}" needs a question and an explanation`, i);
    }

    if (f.key === true) keyCount++;
  });

  if (promptCount > MAX_PROMPTS_PER_TRACE) {
    add(9, `Trace has ${promptCount} prompts (at most ${MAX_PROMPTS_PER_TRACE})`);
  }
  if (promptCount < 1 && sameJson(opts.input, model.defaultInput)) {
    add(9, "The default input must produce 1..3 prompts, found 0");
  }

  // Rule 11: key frames.
  if (keyCount < 2 || keyCount > 6) add(11, `Trace has ${keyCount} key frames (allowed 2..6)`);

  return out;
}

export function formatViolations(violations: readonly TraceViolation[]): string {
  return violations
    .map((v) => `rule ${v.rule}${v.frame === undefined ? "" : ` (frame ${v.frame})`}: ${v.message}`)
    .join("\n");
}

/** Throws (failing the surrounding test) with every violation listed. */
export function expectTraceValid<S, I>(
  trace: Trace<S>,
  model: VizModel<S, I>,
  opts: CheckOptions<I>,
): void {
  const v = checkTraceInvariants(trace, model, opts);
  if (v.length > 0) {
    throw new Error(`Trace of ${model.id} violates the generator contract:\n${formatViolations(v)}`);
  }
}
