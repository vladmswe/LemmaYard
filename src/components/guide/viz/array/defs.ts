// Visualization definition the arrays lesson hands to <Viz def={...}>.
import type { VizDefinition } from "@/lib/guide/contracts";
import { arrayShiftModel, type ArrayInput, type ArrayState } from "@/lib/guide/traces/array";

import { LazyArrayPlayer } from "./LazyPlayer";

export const arrayShift: VizDefinition<ArrayState, ArrayInput> = { model: arrayShiftModel, Client: LazyArrayPlayer };
