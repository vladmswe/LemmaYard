"use client";

import { TracePlayer } from "@/components/guide/player/TracePlayer";
import type { Trace, VizClientProps } from "@/lib/guide/contracts";
import {
  prefixSumsModel,
  prefixTable,
  randomPrefixInput,
  type PrefixInput,
  type PrefixState,
} from "@/lib/guide/traces/prefix";

import { PrefixRenderer } from "./PrefixRenderer";

/** Client player of "prefix.sums". */
export function PrefixPlayer(props: VizClientProps<PrefixInput>) {
  return (
    <TracePlayer<PrefixState, PrefixInput>
      playerId={props.playerId}
      model={prefixSumsModel}
      Renderer={PrefixRenderer}
      initialInput={props.initialInput}
      initialTrace={props.initialTrace as Trace<PrefixState>}
      code={props.code}
      hint={props.hint}
      toTable={prefixTable}
      randomInput={randomPrefixInput}
    />
  );
}
