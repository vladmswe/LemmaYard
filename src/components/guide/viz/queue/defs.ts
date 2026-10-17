// Visualization definitions the queues-and-deques lesson hands to <Viz def={...}>.
import type { VizDefinition } from "@/lib/guide/contracts";
import { queueNaiveModel, queueRingModel, type NaiveState, type QueueInput, type RingState } from "@/lib/guide/traces/queue";

import { LazyQueuePlayer } from "./LazyPlayer";

/** A queue in a plain list: every dequeue shifts the rest. */
export const queueNaive: VizDefinition<NaiveState, QueueInput> = { model: queueNaiveModel, Client: LazyQueuePlayer };
/** The same op script on a circular buffer of 8 slots. */
export const queueRing: VizDefinition<RingState, QueueInput> = { model: queueRingModel, Client: LazyQueuePlayer };
