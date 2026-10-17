// Fixture visualization for the pipeline fixture lesson (M-G1). It only has
// to produce a valid trace whose line ids match fixture_stack's markers; its
// client prints what the server passed in (no player involved).
import type { ElementId, Frame, Trace, VizDefinition, VizModel } from "@/lib/guide/contracts";

import { FixtureVizClient } from "./components/FixtureVizClient";

export interface FixtureStackState {
  readonly items: readonly { readonly id: ElementId; readonly value: number }[];
}
export type FixtureStackOp = { readonly op: "push"; readonly value: number } | { readonly op: "pop" } | { readonly op: "peek" };
export interface FixtureStackInput {
  readonly ops: readonly FixtureStackOp[];
}

export const FIXTURE_STACK_LINES = [
  "fixture.stack.push",
  "fixture.stack.checkEmpty",
  "fixture.stack.pop",
  "fixture.stack.peek",
] as const;

function generate(input: FixtureStackInput): Trace<FixtureStackState> {
  let items: FixtureStackState["items"] = [];
  let next = 0;
  let reads = 0;
  let writes = 0;
  const frames: Frame<FixtureStackState>[] = [
    {
      state: { items },
      roles: {},
      line: null,
      phase: "Start",
      narration: `We will run ${input.ops.length} stack operations on an empty stack.`,
      counters: { reads, writes },
      key: true,
    },
  ];
  const push = (f: Omit<Frame<FixtureStackState>, "state" | "counters">) =>
    frames.push({ ...f, state: { items }, counters: { reads, writes } });

  for (const o of input.ops) {
    const top = items.at(-1);
    if (o.op === "push") {
      const id = `s${next++}`;
      items = [...items, { id, value: o.value }];
      writes++;
      push({ roles: { [id]: "new" }, line: "fixture.stack.push", phase: "Push", narration: `Push ${o.value}: it goes on top.` });
      continue;
    }
    reads++;
    push({
      roles: top ? { [top.id]: "compared" } : {},
      line: "fixture.stack.checkEmpty",
      phase: o.op === "pop" ? "Pop" : "Peek",
      narration: top ? "Check the stack is not empty: it is not." : "Check the stack is not empty: it is, so this raises.",
    });
    if (!top) continue;
    if (o.op === "pop") {
      items = items.slice(0, -1);
      writes++;
      push({ roles: {}, line: "fixture.stack.pop", phase: "Pop", narration: `Pop returns ${top.value}, the last value pushed.` });
    } else {
      reads++;
      push({ roles: { [top.id]: "current" }, line: "fixture.stack.peek", phase: "Peek", narration: `Peek returns ${top.value} and leaves it there.` });
    }
  }
  const last = frames[frames.length - 1] as Frame<FixtureStackState>;
  frames[frames.length - 1] = { ...last, key: true };
  return { vizId: "fixture.stack", frames };
}

export const fixtureStackModel: VizModel<FixtureStackState, FixtureStackInput> = {
  id: "fixture.stack",
  title: "Stack operations (fixture)",
  generate,
  describe: (s) => (s.items.length === 0 ? "The stack is empty." : `Stack from bottom to top: ${s.items.map((i) => i.value).join(", ")}.`),
  ids: (s) => s.items.map((i) => i.id),
  defaultInput: { ops: [{ op: "push", value: 3 }, { op: "push", value: 5 }, { op: "pop" }, { op: "peek" }] },
  lineIds: FIXTURE_STACK_LINES,
  counters: ["reads", "writes"],
};

export const fixtureStackViz: VizDefinition<FixtureStackState, FixtureStackInput> = {
  model: fixtureStackModel,
  Client: FixtureVizClient,
};
