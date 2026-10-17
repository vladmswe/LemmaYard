"use client";

import { TracePlayer } from "@/components/guide/player/TracePlayer";
import type { Trace, VizClientProps } from "@/lib/guide/contracts";
import {
  arrayShiftModel,
  arrayTable,
  randomArrayInput,
  type ArrayInput,
  type ArrayState,
} from "@/lib/guide/traces/array";

import { ArrayRenderer } from "./ArrayRenderer";

/** Client player of "array.shift". */
export function ArrayPlayer(props: VizClientProps<ArrayInput>) {
  return (
    <TracePlayer<ArrayState, ArrayInput>
      playerId={props.playerId}
      model={arrayShiftModel}
      Renderer={ArrayRenderer}
      initialInput={props.initialInput}
      initialTrace={props.initialTrace as Trace<ArrayState>}
      code={props.code}
      hint={props.hint}
      toTable={arrayTable}
      randomInput={randomArrayInput}
    />
  );
}
