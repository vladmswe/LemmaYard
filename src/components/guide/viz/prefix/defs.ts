// Visualization definition the arrays lesson hands to <Viz def={...}>.
import type { VizDefinition } from "@/lib/guide/contracts";
import { prefixSumsModel, type PrefixInput, type PrefixState } from "@/lib/guide/traces/prefix";

import { LazyPrefixPlayer } from "./LazyPlayer";

export const prefixSums: VizDefinition<PrefixState, PrefixInput> = { model: prefixSumsModel, Client: LazyPrefixPlayer };
