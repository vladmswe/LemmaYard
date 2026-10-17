// Visualization definition the arrays lesson hands to <Viz def={...}>.
import type { VizDefinition } from "@/lib/guide/contracts";
import { mergeModel, type MergeInput, type MergeState } from "@/lib/guide/traces/twopointers";

import { MergePlayer } from "./MergePlayer";

export const twoPointersMerge: VizDefinition<MergeState, MergeInput> = { model: mergeModel, Client: MergePlayer };
