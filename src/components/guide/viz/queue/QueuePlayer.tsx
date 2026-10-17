"use client";

import { TracePlayer } from "@/components/guide/player/TracePlayer";
import type { Trace, VizClientProps } from "@/lib/guide/contracts";
import {
  naiveTable,
  queueNaiveModel,
  queueRingModel,
  randomQueueInput,
  ringTable,
  type NaiveState,
  type QueueInput,
  type RingState,
} from "@/lib/guide/traces/queue";

import { NaiveRenderer } from "./NaiveRenderer";
import { RingRenderer } from "./RingRenderer";

/** Client player of "queue.naive" and "queue.ring" (chosen by vizId); both take the same op script. */
export function QueuePlayer(props: VizClientProps<QueueInput>) {
  const common = {
    playerId: props.playerId,
    initialInput: props.initialInput,
    code: props.code,
    hint: props.hint,
    randomInput: randomQueueInput,
  };
  if (props.vizId === "queue.naive") {
    return (
      <TracePlayer<NaiveState, QueueInput>
        {...common}
        model={queueNaiveModel}
        Renderer={NaiveRenderer}
        initialTrace={props.initialTrace as Trace<NaiveState>}
        toTable={naiveTable}
      />
    );
  }
  return (
    <TracePlayer<RingState, QueueInput>
      {...common}
      model={queueRingModel}
      Renderer={RingRenderer}
      initialTrace={props.initialTrace as Trace<RingState>}
      toTable={ringTable}
    />
  );
}
