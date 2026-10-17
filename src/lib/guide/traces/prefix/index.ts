import type { VizModel } from "../../contracts";

import { prefixSumsModel, type PrefixInput, type PrefixState } from "./model";

export * from "./model";
export { PREFIX_DEFAULT, PREFIX_PRESETS, randomPrefixInput } from "./presets";

export const prefixModels: Readonly<Record<string, VizModel<PrefixState, PrefixInput>>> = {
  "prefix.sums": prefixSumsModel,
};
