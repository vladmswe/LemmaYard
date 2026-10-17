// Visualization definition the queues-and-deques lesson hands to <Viz def={...}>.
import type { VizDefinition } from "@/lib/guide/contracts";
import { dequeRingModel, type DequeInput } from "@/lib/guide/traces/deque";
import type { RingState } from "@/lib/guide/traces/queue/types";

import { LazyDequePlayer } from "./LazyPlayer";

export const dequeRing: VizDefinition<RingState, DequeInput> = { model: dequeRingModel, Client: LazyDequePlayer };
