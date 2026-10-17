// Visualization definition the arrays lesson hands to <Viz def={...}>.
import type { VizDefinition } from "@/lib/guide/contracts";
import { mergeModel, type MergeInput, type MergeState } from "@/lib/guide/traces/twopointers";

import { LazyMergePlayer } from "./LazyPlayer";

export const twoPointersMerge: VizDefinition<MergeState, MergeInput> = { model: mergeModel, Client: LazyMergePlayer };
