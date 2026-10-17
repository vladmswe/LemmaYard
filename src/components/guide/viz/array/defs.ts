// Visualization definition the arrays lesson hands to <Viz def={...}>.
import type { VizDefinition } from "@/lib/guide/contracts";
import { arrayShiftModel, type ArrayInput, type ArrayState } from "@/lib/guide/traces/array";

import { ArrayPlayer } from "./ArrayPlayer";

export const arrayShift: VizDefinition<ArrayState, ArrayInput> = { model: arrayShiftModel, Client: ArrayPlayer };
