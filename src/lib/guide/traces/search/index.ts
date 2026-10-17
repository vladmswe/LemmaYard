import type { VizModel } from "../../contracts";

import { searchBinaryModel, searchLinearModel, type SearchInput, type SearchState } from "./model";

export * from "./model";
export { randomSearchInput, SEARCH_DEFAULT_BINARY, SEARCH_DEFAULT_LINEAR, SEARCH_PRESETS } from "./presets";

export const searchModels: Readonly<Record<string, VizModel<SearchState, SearchInput>>> = {
  "search.linear": searchLinearModel,
  "search.binary": searchBinaryModel,
};
