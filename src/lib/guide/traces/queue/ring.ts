// Ring-buffer engine shared by "queue.ring" and "deque.ring". The buffer
// tracks head and size; tail is derived: (head + size) % capacity. A push on a
// full ring (size == capacity) first grows it to twice the capacity, copying
// old[(head + i) % oldCap] to new[i] for i < size, then sets head = 0.
import type { Counters, ElementId, Frame, PredictPrompt, Trace } from "../../contracts";

import type { RingBuffer, RingSlot, RingState } from "./types";

export type RingOpKind = "pushBack" | "pushFront" | "popFront" | "popBack" | "peekFront";

export interface RingOp {
  readonly kind: RingOpKind;
  readonly value?: number;
  /** As the learner typed it, e.g. "enqueue 4" or "pushFront 4". */
  readonly label: string;
}

/** Line id for each step; a structure without an op leaves its lines out. */
export interface RingLines {
  readonly pushBackFull: string;
  readonly pushBackWrite: string;
  readonly pushFrontFull?: string;
  readonly pushFrontWrite?: string;
  readonly popFrontEmpty: string;
  readonly popFrontRead: string;
  readonly popBackEmpty?: string;
  readonly popBackRead?: string;
  readonly peekEmpty?: string;
  readonly peekRead?: string;
  readonly growAlloc: string;
  readonly growCopy: string;
  readonly growDone: string;
}

export interface RingConfig {
  readonly vizId: string;
  readonly noun: "queue" | "deque";
  readonly capacity: number;
  readonly lines: RingLines;
  /** Which predict prompts this structure asks (each at most once, at its first chance). */
  readonly prompts: { readonly wrapSlot?: boolean; readonly frontWrap?: boolean; readonly full?: boolean };
  /** Verb used in narration per op kind, e.g. "Enqueue" for pushBack in a queue. */
  readonly verbs: Readonly<Record<RingOpKind, string>>;
}

export interface RingResult {
  readonly values: number[]; // head to tail, after the last op
  readonly capacity: number;
  readonly head: number;
  /** One entry per pop or peek: the value returned, or null when it failed on an empty ring. */
  readonly outputs: (number | null)[];
}

type PromptKind = "wrapSlot" | "frontWrap" | "full";

/** Dry run: which op asks which prompt (the first op where each one applies). */
function planPrompts(ops: readonly RingOp[], config: RingConfig): Map<number, PromptKind> {
  const out = new Map<number, PromptKind>();
  const asked = new Set<PromptKind>();
  let cap = config.capacity;
  let head = 0;
  let size = 0;
  ops.forEach((op, k) => {
    const isPush = op.kind === "pushBack" || op.kind === "pushFront";
    if (isPush && size === cap) {
      if (config.prompts.full && !asked.has("full") && k > 0) {
        asked.add("full");
        out.set(k, "full");
      }
      cap *= 2;
      head = 0;
    } else if (op.kind === "pushBack" && config.prompts.wrapSlot && !asked.has("wrapSlot") && head + size > cap && k > 0) {
      asked.add("wrapSlot");
      out.set(k, "wrapSlot");
    } else if (op.kind === "pushFront" && config.prompts.frontWrap && !asked.has("frontWrap") && head === 0 && size > 0 && k > 0) {
      asked.add("frontWrap");
      out.set(k, "frontWrap");
    }
    if (op.kind === "pushBack") size++;
    else if (op.kind === "pushFront") {
      head = (head - 1 + cap) % cap;
      size++;
    } else if (op.kind === "popFront" && size > 0) {
      head = (head + 1) % cap;
      size--;
    } else if (op.kind === "popBack" && size > 0) size--;
  });
  return out;
}

/** True if `label` appears in `text` as a whole phrase (case-insensitive). */
function mentions(text: string, label: string): boolean {
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![A-Za-z0-9])${esc}(?![A-Za-z0-9])`, "i").test(text);
}

function slotChoices(answer: number, others: readonly number[], cap: number) {
  const vals = [...new Set([answer, ...others])].filter((v) => v !== answer).slice(0, 2);
  return [answer, ...vals]
    .sort((a, b) => a - b)
    .map((v) => ({ id: v < 0 ? `before` : v >= cap ? `past${v}` : `slot${v}`, label: v < 0 ? "Slot -1" : `Slot ${v}` }));
}

export function generateRing(ops: readonly RingOp[], config: RingConfig): Trace<RingState, RingResult> {
  const { lines, verbs, noun } = config;
  const plan = planPrompts(ops, config);
  let bufNo = 0;
  const makeBuffer = (capacity: number): { id: ElementId; capacity: number; slots: RingSlot[] } => {
    const id = `r${bufNo++}`;
    return { id, capacity, slots: Array.from({ length: capacity }, (_, k) => ({ id: `${id}s${k}`, value: null })) };
  };
  let buffer = makeBuffer(config.capacity);
  let next: ReturnType<typeof makeBuffer> | null = null;
  let head = 0;
  let size = 0;
  let cleared: number | null = null;
  let opLabel: string | null = null;
  let out: number | "error" | null = null;
  let completed = 0;
  let writes = 0;
  let reads = 0;
  let moves = 0;
  let keyLeft = 3;
  const outputs: (number | null)[] = [];
  const frames: Frame<RingState>[] = [];

  const copyBuf = (b: { id: ElementId; capacity: number; slots: RingSlot[] }): RingBuffer => ({
    id: b.id,
    capacity: b.capacity,
    slots: b.slots.slice(),
  });
  const snap = (): RingState => ({
    buffer: copyBuf(buffer),
    next: next ? copyBuf(next) : null,
    head,
    size,
    cleared,
    op: opLabel,
    out,
    completed,
  });
  const counters = (): Counters => ({ writes, reads, moves });
  const slotId = (k: number) => (buffer.slots[k] as RingSlot).id;
  const pointers = (hideTail = false): Record<string, ElementId> => {
    const cap = buffer.capacity;
    return hideTail ? { head: slotId(head) } : { head: slotId(head), tail: slotId((head + size) % cap) };
  };
  /** Narration without slot numbers, used instead when the next frame's prompt answer would show. */
  const quietText: (string | undefined)[] = [];
  const push = (f: Omit<Frame<RingState>, "state" | "counters" | "pointers"> & { hideTail?: boolean; quiet?: string }) => {
    const { hideTail, quiet, ...rest } = f;
    quietText[frames.length] = quiet;
    frames.push({ ...rest, pointers: pointers(hideTail), state: snap(), counters: counters() });
  };
  const takeKey = (): { key?: true } => (keyLeft-- > 0 ? { key: true } : {});
  const setSlot = (b: { slots: RingSlot[] }, k: number, value: number | null) => {
    b.slots[k] = { id: (b.slots[k] as RingSlot).id, value };
  };

  push({
    roles: {},
    line: null,
    phase: "Start",
    narration: `We start with an empty ring of ${buffer.capacity} slots: head = 0 and size = 0. Then we run ${ops.length} ${noun} op${ops.length === 1 ? "" : "s"}.`,
    key: true,
  });

  const grow = () => {
    const oldCap = buffer.capacity;
    const target = makeBuffer(oldCap * 2);
    next = target;
    push({
      roles: { [target.id]: "new" },
      line: lines.growAlloc,
      phase: "Allocate a bigger ring",
      narration: `Allocate a new buffer of ${target.capacity} slots. The old ring stays until its ${size} values are copied, in order from head to tail.`,
    });
    for (let i = 0; i < size; i++) {
      const src = (head + i) % oldCap;
      const v = (buffer.slots[src] as RingSlot).value as number;
      setSlot(target, i, v);
      moves++;
      push({
        roles: { [slotId(src)]: "compared", [(target.slots[i] as RingSlot).id]: "new" },
        line: lines.growCopy,
        phase: "Unroll into the new ring",
        narration: `new[${i}] = old[(head + ${i}) % ${oldCap}] = old[(${head} + ${i}) % ${oldCap}] = old[${src}]: copy ${v}.`,
      });
    }
    buffer = target;
    next = null;
    head = 0;
    push({
      roles: { [buffer.id]: "changed" },
      line: lines.growDone,
      phase: "Switch, head = 0",
      narration: `Switch to the new buffer and set head = 0. The ${size} values now sit in order in slots 0 to ${size - 1}, with ${buffer.capacity - size} free slots after them.`,
      ...takeKey(),
    });
  };

  ops.forEach((op, k) => {
    if (cleared !== null) {
      setSlot(buffer, cleared, null);
      cleared = null;
    }
    opLabel = op.label;
    const verb = verbs[op.kind];
    const kind = plan.get(k);
    // The next op asks which slot it uses: hide the tail tag (it would point at the answer).
    const hide = plan.get(k + 1) === "wrapSlot" || plan.get(k + 1) === "frontWrap";
    const cap0 = buffer.capacity;

    if (op.kind === "pushBack" || op.kind === "pushFront") {
      const v = op.value as number;
      let prompt: PredictPrompt | undefined;
      if (size === buffer.capacity) {
        if (kind === "full") {
          prompt = {
            id: "ring-full",
            question: `head and tail both point at slot ${head}. Is the ring full?`,
            choices: [
              { id: "yes", label: "Yes" },
              { id: "no", label: "No" },
            ],
            answerId: "yes",
            explain: `size is ${size}, equal to the capacity, so yes. head == tail also holds when the ring is empty; only size tells the two apart.`,
          };
        }
        push({
          roles: { [buffer.id]: "current" },
          line: op.kind === "pushBack" ? lines.pushBackFull : (lines.pushFrontFull as string),
          phase: "Full: grow first",
          narration: `${verb} ${v}: size ${size} equals capacity ${buffer.capacity}, so every slot is taken. Grow the ring before writing.`,
          ...(prompt ? { prompt } : {}),
        });
        grow();
        prompt = undefined;
      }
      const cap = buffer.capacity;
      if (op.kind === "pushBack") {
        const raw = head + size;
        const tail = raw % cap;
        if (kind === "wrapSlot") {
          prompt = {
            id: "ring-wrap-slot",
            question: `head = ${head}, size = ${size}, capacity ${cap}: which slot does the next enqueue use?`,
            choices: slotChoices(tail, [raw, (tail + cap - 1) % cap], cap),
            answerId: `slot${tail}`,
            explain: `tail = (head + size) % capacity = (${head} + ${size}) % ${cap} = ${raw} % ${cap} = ${tail}. Past the last slot, the ring wraps to the start.`,
          };
        }
        setSlot(buffer, tail, v);
        size++;
        writes++;
        completed++;
        push({
          roles: { [slotId(tail)]: "new" },
          line: lines.pushBackWrite,
          phase: raw >= cap ? "Write at tail (wraps)" : "Write at tail",
          narration: `${verb} ${v}: tail = (head + size) % ${cap} = (${head} + ${size - 1}) % ${cap} = ${tail}. Write ${v} at slot ${tail}; size ${size}.`,
          quiet: `${verb} ${v}: write it at the tail, just after the last value. The ${noun} grows by one.`,
          hideTail: hide,
          ...(prompt ? { prompt } : {}),
        });
        return;
      }
      // pushFront
      const newHead = (head - 1 + cap) % cap;
      if (kind === "frontWrap") {
        prompt = {
          id: "ring-front-wrap",
          question: `head = ${head}. pushFront computes (head - 1 + ${cap}) % ${cap}. Which slot does it write?`,
          choices: slotChoices(newHead, [-1, head + 1], cap),
          answerId: `slot${newHead}`,
          explain: `(${head} - 1 + ${cap}) % ${cap} = ${newHead}. Adding the capacity before the modulo keeps the index from going negative, so head wraps back to the last slot.`,
        };
      }
      const oldHead = head;
      head = newHead;
      setSlot(buffer, head, v);
      size++;
      writes++;
      completed++;
      push({
        roles: { [slotId(head)]: "new" },
        line: lines.pushFrontWrite as string,
        phase: oldHead === 0 ? "Step head back (wraps)" : "Step head back",
        narration: `${verb} ${v}: head = (head - 1 + ${cap}) % ${cap} = (${oldHead} - 1 + ${cap}) % ${cap} = ${head}. Write ${v} at slot ${head}; size ${size}.`,
        quiet: `${verb} ${v}: step head back one slot and write ${v} there. The ${noun} grows by one.`,
        hideTail: hide,
        ...(prompt ? { prompt } : {}),
      });
      return;
    }

    // popFront, popBack, peekFront
    const emptyLine =
      op.kind === "popFront" ? lines.popFrontEmpty : op.kind === "popBack" ? (lines.popBackEmpty as string) : (lines.peekEmpty as string);
    if (size === 0) {
      out = "error";
      outputs.push(null);
      completed++;
      push({
        roles: { [buffer.id]: "error" },
        line: emptyLine,
        phase: `${verb} on empty`,
        narration: `${verb} fails: size is 0, so the ${noun} is empty (head == tail). Our code raises an error instead of returning a stale slot.`,
        hideTail: hide,
        ...takeKey(),
      });
      return;
    }
    reads++;
    completed++;
    if (op.kind === "peekFront") {
      const v = (buffer.slots[head] as RingSlot).value as number;
      out = v;
      outputs.push(v);
      push({
        roles: { [slotId(head)]: "current" },
        line: lines.peekRead as string,
        phase: "Peek at head",
        narration: `${verb} reads ${v} at slot head = ${head} and changes nothing.`,
        quiet: `${verb} reads ${v} at the head slot and changes nothing.`,
        hideTail: hide,
      });
      return;
    }
    if (op.kind === "popFront") {
      const at = head;
      const v = (buffer.slots[at] as RingSlot).value as number;
      out = v;
      outputs.push(v);
      head = (head + 1) % cap0;
      size--;
      cleared = at;
      push({
        roles: { [slotId(at)]: "removed" },
        line: lines.popFrontRead,
        phase: "Take from head",
        narration: `${verb} returns ${v} from slot ${at}. head = (${at} + 1) % ${cap0} = ${head}; size ${size}.`,
        quiet: `${verb} returns ${v} from the head slot, and head moves on by one.`,
        hideTail: hide,
      });
      return;
    }
    // popBack
    const at = (head + size - 1) % cap0;
    const v = (buffer.slots[at] as RingSlot).value as number;
    out = v;
    outputs.push(v);
    size--;
    cleared = at;
    push({
      roles: { [slotId(at)]: "removed" },
      line: lines.popBackRead as string,
      phase: "Take from tail",
      narration: `${verb} returns ${v} from slot (head + size - 1) % ${cap0} = (${head} + ${size + 1} - 1) % ${cap0} = ${at}; size ${size}.`,
      quiet: `${verb} returns ${v} from the last used slot. head stays where it is.`,
      hideTail: hide,
    });
  });

  if (cleared !== null) {
    setSlot(buffer, cleared, null);
    cleared = null;
  }
  // A prompt is asked while the frame before it is on screen: that frame must not name the answer.
  frames.forEach((f, i) => {
    const p = f.prompt;
    const prev = frames[i - 1];
    const quiet = quietText[i - 1];
    if (!p || !prev || quiet === undefined) return;
    const answer = p.choices.find((c) => c.id === p.answerId)?.label ?? "";
    if (mentions(prev.narration, answer)) frames[i - 1] = { ...prev, narration: quiet };
  });
  opLabel = null;
  const values = Array.from({ length: size }, (_, i) => (buffer.slots[(head + i) % buffer.capacity] as RingSlot).value as number);
  push({
    roles: {},
    line: null,
    phase: "Done",
    narration: `Done. ${
      size ? `Head to tail the ${noun} holds ${values.join(", ")}` : `The ${noun} is empty`
    }; head = ${head}, size ${size}, capacity ${buffer.capacity}.`,
    key: true,
  });
  return {
    vizId: config.vizId,
    frames,
    result: { values, capacity: buffer.capacity, head, outputs },
  };
}
