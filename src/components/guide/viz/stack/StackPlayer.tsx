"use client";

import { TracePlayer } from "@/components/guide/player/TracePlayer";
import type { Trace, VizClientProps } from "@/lib/guide/contracts";
import {
  bracketsTable,
  monoTable,
  randomBracketsInput,
  randomMonoInput,
  randomStackInput,
  stackBracketsModel,
  stackMonotonicModel,
  stackOpsModel,
  stackTable,
  type BracketsInput,
  type BracketsState,
  type MonoInput,
  type MonoState,
  type StackInput,
  type StackState,
} from "@/lib/guide/traces/stack";

import { BracketsRenderer } from "./BracketsRenderer";
import { MonotonicRenderer } from "./MonotonicRenderer";
import { StackRenderer } from "./StackRenderer";

/** Client player of "stack.ops", "stack.brackets" and "stack.monotonic" (chosen by vizId). */
export function StackPlayer(props: VizClientProps<unknown>) {
  const common = { playerId: props.playerId, code: props.code, hint: props.hint };
  if (props.vizId === "stack.brackets") {
    return (
      <TracePlayer<BracketsState, BracketsInput>
        {...common}
        model={stackBracketsModel}
        Renderer={BracketsRenderer}
        initialInput={props.initialInput as BracketsInput}
        initialTrace={props.initialTrace as Trace<BracketsState>}
        toTable={bracketsTable}
        randomInput={randomBracketsInput}
      />
    );
  }
  if (props.vizId === "stack.monotonic") {
    return (
      <TracePlayer<MonoState, MonoInput>
        {...common}
        model={stackMonotonicModel}
        Renderer={MonotonicRenderer}
        initialInput={props.initialInput as MonoInput}
        initialTrace={props.initialTrace as Trace<MonoState>}
        toTable={monoTable}
        randomInput={randomMonoInput}
      />
    );
  }
  return (
    <TracePlayer<StackState, StackInput>
      {...common}
      model={stackOpsModel}
      Renderer={StackRenderer}
      initialInput={props.initialInput as StackInput}
      initialTrace={props.initialTrace as Trace<StackState>}
      toTable={stackTable}
      randomInput={randomStackInput}
    />
  );
}
