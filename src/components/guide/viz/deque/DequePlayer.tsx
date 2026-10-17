"use client";

import { TracePlayer } from "@/components/guide/player/TracePlayer";
import type { Trace, VizClientProps } from "@/lib/guide/contracts";
import { dequeRingModel, randomDequeInput, type DequeInput } from "@/lib/guide/traces/deque";
import { ringTable } from "@/lib/guide/traces/queue/model";
import type { RingState } from "@/lib/guide/traces/queue/types";

import { RingRenderer } from "../queue/RingRenderer";

/** Client player of "deque.ring": the queue's ring renderer, with ops at both ends. */
export function DequePlayer(props: VizClientProps<DequeInput>) {
  return (
    <TracePlayer<RingState, DequeInput>
      playerId={props.playerId}
      model={dequeRingModel}
      Renderer={RingRenderer}
      initialInput={props.initialInput}
      initialTrace={props.initialTrace as Trace<RingState>}
      code={props.code}
      hint={props.hint}
      toTable={ringTable}
      randomInput={randomDequeInput}
    />
  );
}
