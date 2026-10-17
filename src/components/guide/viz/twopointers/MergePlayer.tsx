"use client";

import { TracePlayer } from "@/components/guide/player/TracePlayer";
import type { Trace, VizClientProps } from "@/lib/guide/contracts";
import {
  mergeModel,
  mergeTable,
  randomMergeInput,
  type MergeInput,
  type MergeState,
} from "@/lib/guide/traces/twopointers";

import { MergeRenderer } from "./MergeRenderer";

/** Client player of "twopointers.merge". */
export function MergePlayer(props: VizClientProps<MergeInput>) {
  return (
    <TracePlayer<MergeState, MergeInput>
      playerId={props.playerId}
      model={mergeModel}
      Renderer={MergeRenderer}
      initialInput={props.initialInput}
      initialTrace={props.initialTrace as Trace<MergeState>}
      code={props.code}
      hint={props.hint}
      toTable={mergeTable}
      randomInput={randomMergeInput}
    />
  );
}
