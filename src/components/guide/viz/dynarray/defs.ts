// Visualization definition the dynamic-arrays lesson hands to <Viz def={...}>.
import type { VizDefinition } from "@/lib/guide/contracts";
import { dynArrayModel, type DynInput, type DynState } from "@/lib/guide/traces/dynarray";

import { LazyDynArrayPlayer } from "./LazyPlayer";

export const dynArrayOps: VizDefinition<DynState, DynInput> = { model: dynArrayModel, Client: LazyDynArrayPlayer };
