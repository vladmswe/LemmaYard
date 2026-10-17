"use client";

import { TracePlayer } from "@/components/guide/player/TracePlayer";
import type { Trace, VizClientProps } from "@/lib/guide/contracts";
import {
  dynArrayModel,
  dynTable,
  randomDynInput,
  type DynInput,
  type DynState,
} from "@/lib/guide/traces/dynarray";

import { DynArrayRenderer } from "./DynArrayRenderer";

/** Client player of "dynarray.ops". */
export function DynArrayPlayer(props: VizClientProps<DynInput>) {
  return (
    <TracePlayer<DynState, DynInput>
      playerId={props.playerId}
      model={dynArrayModel}
      Renderer={DynArrayRenderer}
      initialInput={props.initialInput}
      initialTrace={props.initialTrace as Trace<DynState>}
      code={props.code}
      hint={props.hint}
      toTable={dynTable}
      randomInput={randomDynInput}
    />
  );
}
