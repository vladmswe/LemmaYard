// Visualization definitions the complexity-basics lesson hands to <Viz def={...}>.
import type { VizDefinition } from "@/lib/guide/contracts";
import { searchBinaryModel, searchLinearModel, type SearchInput, type SearchState } from "@/lib/guide/traces/search";

import { SearchPlayer } from "./SearchPlayer";

/** Starts on linear search (n = 32, target absent); the op selector switches to binary search. */
export const searchLinear: VizDefinition<SearchState, SearchInput> = { model: searchLinearModel, Client: SearchPlayer };
/** Starts on binary search over the same array (target 71). */
export const searchBinary: VizDefinition<SearchState, SearchInput> = { model: searchBinaryModel, Client: SearchPlayer };
